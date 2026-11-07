package app.particledepth.wallpaper.ui

import android.content.Context
import android.graphics.Bitmap
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES30
import android.util.Log
import app.particledepth.wallpaper.ParticleRenderer
import app.particledepth.wallpaper.QualityPolicy
import app.particledepth.wallpaper.pack.PackLoader
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/**
 * Gallery thumbnails drawn by the wallpaper's own renderer, so a card shows the real effect, not the source picture.
 * Each pack is drawn once offscreen (a pbuffer, no screen needed) and the PNG is cached in the app's private storage
 * under a name that includes a hash of pack.json, so editing a pack makes a new thumbnail. Failure of any kind returns
 * null and the gallery keeps the source picture.
 */
object ThumbMaker {
    private const val TAG = "PDS"
    private const val W = 270
    private const val H = 480
    private const val SETTLE_FRAMES = 30 // about 1.5 s of motion so drifting particles are in the picture

    /** Throws when the pack is gone; callers treat that as "no thumbnail". */
    fun cacheFile(ctx: Context, packId: String): File {
        val json = (app.particledepth.wallpaper.pack.PackSources.find(ctx, packId) ?: throw java.io.IOException("no effect $packId")).open("pack.json").use { it.readBytes() }
        val hash = MessageDigest.getInstance("SHA-256").digest(json).take(4).joinToString("") { "%02x".format(it) }
        return File(File(ctx.cacheDir, "thumbs").apply { mkdirs() }, "$packId-$hash.png")
    }

    /** The cached thumbnail, or null when it has not been drawn yet. */
    fun cached(ctx: Context, packId: String): Bitmap? = try {
        cacheFile(ctx, packId).takeIf { it.exists() }?.let { android.graphics.BitmapFactory.decodeFile(it.path) }
    } catch (e: Exception) { null }

    /** Draw and cache one thumbnail. Call off the main thread; it creates and destroys its own GL context. */
    fun make(ctx: Context, packId: String): Bitmap? {
        var display = EGL14.EGL_NO_DISPLAY
        var surface = EGL14.EGL_NO_SURFACE
        var context = EGL14.EGL_NO_CONTEXT
        var renderer: ParticleRenderer? = null
        try {
            display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val v = IntArray(2)
            if (!EGL14.eglInitialize(display, v, 0, v, 1)) return null
            val attribs = intArrayOf(
                EGL14.EGL_RENDERABLE_TYPE, 0x0040, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8, EGL14.EGL_NONE,
            )
            val configs = arrayOfNulls<EGLConfig>(1)
            val n = IntArray(1)
            if (!EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, n, 0) || n[0] == 0) return null
            context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0)
            surface = EGL14.eglCreatePbufferSurface(display, configs[0], intArrayOf(EGL14.EGL_WIDTH, W, EGL14.EGL_HEIGHT, H, EGL14.EGL_NONE), 0)
            if (context == EGL14.EGL_NO_CONTEXT || surface == EGL14.EGL_NO_SURFACE) return null
            if (!EGL14.eglMakeCurrent(display, surface, surface, context)) return null

            val loaded = PackLoader.load(ctx, packId, 50_000)
            renderer = ParticleRenderer(ctx, loaded).also { it.init(); it.resize(W, H, 1.5f) }
            val q = QualityPolicy.Quality(level = 0, fps = 60, pointShare = 1f, trailShare = 1f, renderScale = 1f)
            for (i in 0 until SETTLE_FRAMES) renderer.draw(0.05f, 0f, 0f, q)
            GLES30.glFinish()

            val buf = ByteBuffer.allocateDirect(W * H * 4).order(ByteOrder.nativeOrder())
            GLES30.glReadPixels(0, 0, W, H, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, buf)
            val px = IntArray(W * H)
            for (y in 0 until H) for (x in 0 until W) {
                val o = ((H - 1 - y) * W + x) * 4 // GL rows run bottom to top
                val r = buf.get(o).toInt() and 255
                val g = buf.get(o + 1).toInt() and 255
                val b = buf.get(o + 2).toInt() and 255
                px[y * W + x] = (255 shl 24) or (r shl 16) or (g shl 8) or b
            }
            val bmp = Bitmap.createBitmap(px, W, H, Bitmap.Config.ARGB_8888)
            cacheFile(ctx, packId).outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 90, it) }
            return bmp
        } catch (e: Exception) {
            Log.w(TAG, "thumbnail for $packId failed: $e")
            return null
        } finally {
            renderer?.release()
            if (display != EGL14.EGL_NO_DISPLAY) {
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
                if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface)
                if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
                EGL14.eglTerminate(display)
            }
        }
    }
}
