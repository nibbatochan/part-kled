package app.particledepth.wallpaper

import android.content.Context
import android.opengl.GLES30
import android.util.Log
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/**
 * Compiled-shader cache. The web point shader is 77 KB and took about 3 s to compile on an Adreno 618 (measured on a
 * realme X2). A program binary is only valid for the same GPU and driver, so the key includes GL_RENDERER and GL_VERSION;
 * a driver update changes the key and the shader is compiled again. Any failure falls back to a normal compile.
 * Must be called on the GL thread with the context current.
 */
object ProgramCache {
    private const val TAG = ParticleRenderer.TAG
    private const val MAGIC = 0x50445331 // "PDS1": bump when the file layout changes

    private fun file(ctx: Context, source: String): File {
        val key = source + "|" + GLES30.glGetString(GLES30.GL_RENDERER) + "|" + GLES30.glGetString(GLES30.GL_VERSION) + "|" + MAGIC
        val hash = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).take(12).joinToString("") { "%02x".format(it) }
        return File(ctx.cacheDir, "program-$hash.bin")
    }

    /** Returns a linked program, or null when there is no usable cached binary. */
    fun load(ctx: Context, source: String): Int? {
        val f = file(ctx, source)
        if (!f.exists()) return null
        return try {
            val bytes = f.readBytes()
            val bb = ByteBuffer.wrap(bytes).order(ByteOrder.nativeOrder())
            val format = bb.getInt(0)
            val len = bytes.size - 4
            val data = ByteBuffer.allocateDirect(len).order(ByteOrder.nativeOrder())
            data.put(bytes, 4, len).position(0)
            val p = GLES30.glCreateProgram()
            GLES30.glProgramBinary(p, format, data, len)
            val ok = IntArray(1)
            GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, ok, 0)
            if (ok[0] == 0) {
                Log.w(TAG, "cached program rejected by the driver; recompiling")
                GLES30.glDeleteProgram(p)
                f.delete()
                null
            } else p
        } catch (e: Exception) {
            Log.w(TAG, "program cache read failed: $e")
            null
        }
    }

    fun save(ctx: Context, source: String, program: Int) {
        try {
            val len = IntArray(1)
            GLES30.glGetProgramiv(program, GLES30.GL_PROGRAM_BINARY_LENGTH, len, 0)
            if (len[0] <= 0) return
            val data = ByteBuffer.allocateDirect(len[0]).order(ByteOrder.nativeOrder())
            val written = IntArray(1)
            val format = IntArray(1)
            GLES30.glGetProgramBinary(program, len[0], written, 0, format, 0, data)
            val out = ByteArray(4 + written[0])
            ByteBuffer.wrap(out).order(ByteOrder.nativeOrder()).putInt(format[0])
            data.position(0)
            data.get(out, 4, written[0])
            file(ctx, source).writeBytes(out)
            Log.i(TAG, "program binary cached (${written[0] / 1024} KB)")
        } catch (e: Exception) {
            Log.w(TAG, "program cache write failed: $e")
        }
    }
}
