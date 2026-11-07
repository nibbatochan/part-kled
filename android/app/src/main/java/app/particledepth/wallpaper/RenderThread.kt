package app.particledepth.wallpaper

import android.content.Context
import android.content.SharedPreferences
import app.particledepth.wallpaper.pack.LoadedPack
import app.particledepth.wallpaper.pack.PackException
import app.particledepth.wallpaper.pack.PackLoader
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.Surface
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * One thread owns EGL, the GL context and the frame loop. Wallpaper engine callbacks only post to it.
 * A GLSurfaceView cannot be used inside a WallpaperService, so EGL14 is driven by hand.
 *
 * Frame pacing: a Choreographer callback runs every vsync while visible and draws only every 1/TARGET_FPS seconds.
 * Hidden: no callback, no sensor listener, no timers (the loop is simply not scheduled).
 * PHASE 1: every surface create builds a fresh context and recompiles the shader; phase 2 should keep the context
 * and rebuild only the window surface, and cache the program binary.
 */
class RenderThread(private val context: Context) {
    private val thread = HandlerThread("pds-render").also { it.start() }
    private val handler = Handler(thread.looper)

    // everything below is touched only on [thread]
    private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE
    private var eglConfig: EGLConfig? = null
    private var surface: Surface? = null
    private var renderer: ParticleRenderer? = null
    private var pack: LoadedPack? = null
    private val packListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        when (key) {
            Selection.KEY_PACK -> handler.post { reloadPack() }
            Selection.KEY_OVERRIDES -> handler.post { applyOverrides() }
        }
    }
    private var tilt: TiltSensor? = null
    // The last level that held its frame rate is remembered, so a restart does not stutter while it re-learns.
    private val selection = Selection(context)
    private val prefs = selection.prefs
    private val policy = QualityPolicy(
        startLevel = prefs.getInt("level", 0),
        onStable = { level -> if (prefs.getInt("level", 0) != level) prefs.edit().putInt("level", level).apply() },
    ) { /* the next frame reads policy.current */ }
    private var signals: SystemSignals? = null
    private var choreographer: Choreographer? = null
    private var width = 1
    private var height = 1
    private var density = 1f
    private var visible = false
    private var running = false
    private var lastDrawNanos = 0L

    // quality window: frames drawn in the current QualityPolicy.WINDOW_S
    private var winStart = 0L
    private var winFrames = 0
    private var winLate = 0

    // stats
    private var statStart = 0L
    private var statFrames = 0
    private var statCpuNs = 0L
    private var statMaxCpuNs = 0L
    private var statLate = 0        // gaps between drawn frames longer than 1.5x the target interval = a visible hitch
    private var statWorstGapMs = 0f
    private var prevDrawNanos = 0L

    private val frameCallback = Choreographer.FrameCallback { nanos -> onFrame(nanos) }

    init { prefs.registerOnSharedPreferenceChangeListener(packListener) }

    fun surfaceCreated(s: Surface, density: Float) = handler.post {
        this.density = density
        surface = s
        startEgl(s)
        updateLoop()
    }

    fun surfaceChanged(w: Int, h: Int) = handler.post {
        width = w
        height = h
        renderer?.resize(w, h, density)
    }

    fun setVisible(v: Boolean) = handler.post {
        visible = v
        updateLoop()
    }

    /** Blocks until EGL is released: the Surface is invalid as soon as onSurfaceDestroyed returns. */
    fun surfaceDestroyed() {
        val done = CountDownLatch(1)
        handler.post {
            stopLoop()
            stopEgl()
            surface = null
            done.countDown()
        }
        if (!done.await(2, TimeUnit.SECONDS)) Log.w(TAG, "surfaceDestroyed: render thread did not release in 2 s")
    }

    fun quit() {
        prefs.unregisterOnSharedPreferenceChangeListener(packListener)
        surfaceDestroyed()
        thread.quitSafely()
    }

    // ---- loop ----

    private fun updateLoop() {
        val want = visible && eglSurface != EGL14.EGL_NO_SURFACE && renderer != null
        if (want && !running) {
            running = true
            lastDrawNanos = 0L
            statStart = 0L; statFrames = 0; statCpuNs = 0L; statMaxCpuNs = 0L // a window must not straddle a hidden gap
            winStart = 0L; winFrames = 0; winLate = 0; prevDrawNanos = 0L
            (signals ?: SystemSignals(context, policy, handler).also { signals = it }).start()
            val t = tilt ?: TiltSensor(context).also { tilt = it }
            t.start(handler)
            Log.i(TAG, "visible: loop on (gyro ${if (t.available) "available" else "NOT available"})")
            val c = choreographer ?: Choreographer.getInstance().also { choreographer = it }
            c.postFrameCallback(frameCallback)
        } else if (!want && running) {
            stopLoop()
            Log.i(TAG, "hidden: loop off")
        }
    }

    private fun stopLoop() {
        running = false
        choreographer?.removeFrameCallback(frameCallback)
        tilt?.stop()
        signals?.stop()
    }

    private fun onFrame(frameNanos: Long) {
        if (!running) return
        val interval = 1_000_000_000L / policy.current.fps
        if (lastDrawNanos == 0L || frameNanos - lastDrawNanos >= interval - 2_000_000L) {
            val dt = if (lastDrawNanos == 0L) 0f else (frameNanos - lastDrawNanos) / 1e9f // clamped in the renderer: resume never jumps
            lastDrawNanos = frameNanos
            drawOnce(dt)
        }
        choreographer?.postFrameCallback(frameCallback)
    }

    private fun drawOnce(dt: Float) {
        val r = renderer ?: return
        val t0 = System.nanoTime()
        r.draw(dt, tilt?.x ?: 0f, tilt?.y ?: 0f, policy.current)
        if (!EGL14.eglSwapBuffers(display, eglSurface)) {
            val err = EGL14.eglGetError()
            Log.w(TAG, "eglSwapBuffers failed: 0x${err.toString(16)}")
            if (err == EGL14.EGL_CONTEXT_LOST) rebuildAfterLoss()
            return
        }
        val cpu = System.nanoTime() - t0
        val now = SystemClock.elapsedRealtimeNanos()
        if (prevDrawNanos != 0L) {
            val gapMs = (now - prevDrawNanos) / 1e6f
            if (gapMs > 1500f / policy.current.fps) { statLate++; winLate++ }
            if (gapMs > statWorstGapMs) statWorstGapMs = gapMs
        }
        prevDrawNanos = now
        if (winStart == 0L) winStart = now
        winFrames++
        val winS = (now - winStart) / 1e9f
        if (winS >= QualityPolicy.WINDOW_S) {
            policy.onWindow(winFrames / winS, policy.current.fps, winLate / winFrames.toFloat())
            winStart = now; winFrames = 0; winLate = 0
        }
        if (statStart == 0L) statStart = now
        statFrames++
        statCpuNs += cpu
        if (cpu > statMaxCpuNs) statMaxCpuNs = cpu
        val elapsed = (now - statStart) / 1e9f
        if (elapsed >= SpikeConfig.STATS_EVERY_S) {
            Log.i(
                TAG,
                "fps %.1f | cpu per frame avg %.2f ms max %.2f ms | late frames %d, worst gap %.1f ms | level %d | %d frames".format(
                    statFrames / elapsed, statCpuNs / statFrames / 1e6f, statMaxCpuNs / 1e6f, statLate, statWorstGapMs,
                    policy.current.level, statFrames
                )
            )
            statStart = now; statFrames = 0; statCpuNs = 0L; statMaxCpuNs = 0L; statLate = 0; statWorstGapMs = 0f
        }
    }

    private fun rebuildAfterLoss() {
        val s = surface ?: return
        Log.w(TAG, "GL context lost: rebuilding")
        stopEgl()
        startEgl(s)
    }

    // ---- pack ----

    /** The pack the user picked, else the built-in one. A broken pack never stops the wallpaper: fall back and say why. */
    private fun loadPack(): LoadedPack {
        val wanted = selection.packId
        return try {
            PackLoader.load(context, wanted, SpikeConfig.PARTICLES)
        } catch (e: PackException) {
            Log.e(TAG, "pack \"$wanted\" rejected: ${e.message}")
            if (wanted == SpikeConfig.PACK) throw e
            PackLoader.load(context, SpikeConfig.PACK, SpikeConfig.PARTICLES)
        }
    }

    /** The user's slider changes: swap the settings, no GL rebuild, the next frame uses them. */
    private fun applyOverrides() {
        val p = pack ?: return
        renderer?.params = p.config.params.withOverrides(selection.overrides)
    }

    /** The pack choice changed while the wallpaper runs: load the new one and rebuild the GL objects. */
    private fun reloadPack() {
        val s = surface ?: return
        val fresh = try { loadPack() } catch (e: PackException) { Log.e(TAG, "keeping the current pack: ${e.message}"); return }
        pack = fresh
        stopEgl()
        startEgl(s)
        Log.i(TAG, "switched to pack \"${fresh.config.id}\"")
    }

    // ---- EGL ----

    private fun startEgl(s: Surface) {
        display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val v = IntArray(2)
        check(EGL14.eglInitialize(display, v, 0, v, 1)) { "eglInitialize" }
        val attribs = intArrayOf(
            EGL14.EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
            EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_DEPTH_SIZE, 0, EGL14.EGL_STENCIL_SIZE, 0,
            EGL14.EGL_NONE,
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        val n = IntArray(1)
        check(EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, n, 0) && n[0] > 0) { "no ES 3.0 EGL config" }
        eglConfig = configs[0]
        eglContext = EGL14.eglCreateContext(
            display, eglConfig, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0
        )
        check(eglContext != EGL14.EGL_NO_CONTEXT) { "eglCreateContext" }
        eglSurface = EGL14.eglCreateWindowSurface(display, eglConfig, s, intArrayOf(EGL14.EGL_NONE), 0)
        check(eglSurface != EGL14.EGL_NO_SURFACE) { "eglCreateWindowSurface" }
        check(EGL14.eglMakeCurrent(display, eglSurface, eglSurface, eglContext)) { "eglMakeCurrent" }
        EGL14.eglSwapInterval(display, 1)

        val t0 = SystemClock.elapsedRealtime()
        val loaded = pack ?: loadPack().also { pack = it }
        Log.i(TAG, "pack \"${loaded.config.id}\" ready in ${SystemClock.elapsedRealtime() - t0} ms (${loaded.sample.count} particles, ${loaded.config.warnings.size} warnings)")
        val r = ParticleRenderer(context, loaded)
        r.params = loaded.config.params.withOverrides(selection.overrides)
        r.init()
        r.resize(width, height, density)
        renderer = r
    }

    private fun stopEgl() {
        renderer?.release()
        renderer = null
        if (display != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            if (eglSurface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, eglSurface)
            if (eglContext != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, eglContext)
            EGL14.eglTerminate(display)
        }
        display = EGL14.EGL_NO_DISPLAY
        eglContext = EGL14.EGL_NO_CONTEXT
        eglSurface = EGL14.EGL_NO_SURFACE
    }

    companion object {
        private const val TAG = ParticleRenderer.TAG
        private const val EGL_OPENGL_ES3_BIT = 0x0040 // EGL_OPENGL_ES3_BIT_KHR
    }
}
