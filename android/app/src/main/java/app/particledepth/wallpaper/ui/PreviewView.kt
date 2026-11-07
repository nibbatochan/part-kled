package app.particledepth.wallpaper.ui

import android.content.Context
import android.opengl.GLSurfaceView
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.particledepth.wallpaper.ParticleRenderer
import app.particledepth.wallpaper.QualityPolicy
import app.particledepth.wallpaper.TiltSensor
import app.particledepth.wallpaper.pack.LoadedPack
import app.particledepth.wallpaper.pack.PackParams
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * The in-app preview: the same renderer as the wallpaper, in a GLSurfaceView (an Activity view, so the documented
 * lifecycle fits). It owns its own pack data and GL context, so it never touches the wallpaper's. Settings arrive
 * through [setParams] and are picked up by the next frame. Full quality: the app is in the foreground, so the
 * wallpaper itself is not drawing.
 */
class PreviewRenderer(private val context: Context, private val pack: LoadedPack, private val tilt: TiltSensor) : GLSurfaceView.Renderer {
    private var r: ParticleRenderer? = null
    @Volatile private var params: PackParams = pack.config.params
    private var last = 0L
    private val quality = QualityPolicy.Quality(level = 0, fps = 60, pointShare = 1f, trailShare = 1f, renderScale = 1f)

    fun setParams(p: PackParams) { params = p }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        r?.release()
        r = ParticleRenderer(context, pack).also { it.params = params; it.init() }
        last = 0L
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        r?.resize(width, height, context.resources.displayMetrics.density)
    }

    override fun onDrawFrame(gl: GL10?) {
        val now = System.nanoTime()
        val dt = if (last == 0L) 0f else (now - last) / 1e9f
        last = now
        // the sensor's x and y are volatile: safe to read on the GL thread
        r?.let { it.params = params; it.draw(dt, tilt.x, tilt.y, quality) }
    }
}

@Composable
fun PreviewView(pack: LoadedPack, params: PackParams, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val tilt = remember { TiltSensor(ctx) }
    val renderer = remember(pack) { PreviewRenderer(ctx, pack, tilt) }
    val view = remember(renderer) {
        GLSurfaceView(ctx).apply {
            setEGLContextClientVersion(3)
            setEGLConfigChooser(8, 8, 8, 8, 0, 0)
            setRenderer(renderer)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
    }
    renderer.setParams(params)

    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner, view) {
        val handler = Handler(Looper.getMainLooper())
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> { view.onResume(); tilt.start(handler) }
                Lifecycle.Event.ON_PAUSE -> { tilt.stop(); view.onPause() }
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(obs)
        // Compose may attach this view after the activity already resumed
        if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) { view.onResume(); tilt.start(handler) }
        onDispose {
            owner.lifecycle.removeObserver(obs)
            tilt.stop()
            view.onPause()
        }
    }
    AndroidView(factory = { view }, modifier = modifier)
}
