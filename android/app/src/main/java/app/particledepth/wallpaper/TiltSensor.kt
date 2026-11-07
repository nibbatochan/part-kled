package app.particledepth.wallpaper

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.view.Surface
import android.view.WindowManager
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Phone tilt -> the same -1..1 pair the web studio gets from the cursor (LiteEngine.lookTarget).
 *
 * Uses the game rotation vector (no magnetometer, so no drift toward north and no jumps near magnets).
 * Tilt is measured against a REST POSE that slowly follows the phone (time constant SpikeConfig.REST_TAU_S):
 * whatever angle you hold the phone at (flat, 70 degrees toward your face) becomes the centre after a few seconds,
 * and only a quicker movement away from it tilts the picture. During the first WARMUP_S after the wallpaper
 * becomes visible the rest pose snaps to the phone, so lifting the phone off a table does not tilt the picture.
 *
 * The rotation matrix is used directly instead of Euler angles: an upright phone sits exactly on the pitch = 90 degree
 * singularity of getOrientation(), where roll is undefined.
 *
 * Runs on the render thread's handler; x and y are read from the same thread. Registered only while visible.
 * Signs and range are SpikeConfig values; the following behaviour was tuned by feel on one device (realme X2).
 */
class TiltSensor(private val context: Context) : SensorEventListener {
    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
    private val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    val available: Boolean get() = sensor != null

    @Volatile var x = 0f
        private set
    @Volatile var y = 0f
        private set

    private val restQ = FloatArray(4) // w, x, y, z
    private val curQ = FloatArray(4)
    private var haveRest = false
    private var startTs = 0L
    private var lastTs = 0L
    private val restM = FloatArray(9)
    private val curM = FloatArray(9)
    private val tmp = FloatArray(9)
    private val vec = FloatArray(4)
    private val d = FloatArray(9)
    private val settings = AppSettings(context)
    private var fullRad = Math.toRadians(SpikeConfig.TILT_FULL_DEG.toDouble()).toFloat()

    fun start(handler: Handler) {
        haveRest = false
        x = 0f
        y = 0f
        if (!settings.gyroOn) return // off: no sensor registered, no battery cost, the picture stays centred
        fullRad = Math.toRadians(settings.gyroRange.toDouble()).toFloat()
        // One sample per rendered frame; more is wasted battery. Events go to the render thread, not the main thread.
        sensor?.let { sm.registerListener(this, it, 1_000_000 / SpikeConfig.TARGET_FPS, handler) }
    }

    fun stop() {
        sm.unregisterListener(this)
        x = 0f
        y = 0f
    }

    /** Make the current pose the centre now. */
    fun recenter() { haveRest = false }

    override fun onSensorChanged(e: SensorEvent) {
        SensorManager.getQuaternionFromVector(curQ, e.values) // w, x, y, z
        if (!haveRest) {
            curQ.copyInto(restQ)
            haveRest = true
            startTs = e.timestamp
            lastTs = e.timestamp
        }
        val dt = min(0.1f, max(0f, (e.timestamp - lastTs) / 1e9f))
        lastTs = e.timestamp
        val warm = (e.timestamp - startTs) / 1e9f < SpikeConfig.WARMUP_S
        // The rest pose follows the phone: blend toward the current pose (nlerp, shortest way round)
        val a = if (warm) 1f else 1f - exp(-dt / SpikeConfig.REST_TAU_S)
        val dot = restQ[0] * curQ[0] + restQ[1] * curQ[1] + restQ[2] * curQ[2] + restQ[3] * curQ[3]
        val sgn = if (dot < 0f) -1f else 1f
        var n = 0f
        for (i in 0 until 4) {
            restQ[i] = restQ[i] * (1f - a) + sgn * curQ[i] * a
            n += restQ[i] * restQ[i]
        }
        n = sqrt(n)
        for (i in 0 until 4) restQ[i] /= n

        toScreenMatrix(restQ, restM)
        toScreenMatrix(curQ, curM)
        // D = rest^T * cur (row-major 3x3): the turn since the rest pose
        for (i in 0 until 3) for (j in 0 until 3) {
            var s = 0f
            for (k in 0 until 3) s += restM[k * 3 + i] * curM[k * 3 + j]
            d[i * 3 + j] = s
        }
        val wx = (d[7] - d[5]) / 2f // turn about the screen's x axis (top toward or away from you)
        val wy = (d[2] - d[6]) / 2f // turn about the screen's y axis (right edge toward or away from you)
        x = max(-1f, min(1f, SpikeConfig.TILT_SIGN_X * wy / fullRad))
        y = max(-1f, min(1f, SpikeConfig.TILT_SIGN_Y * wx / fullRad))
    }

    /** Quaternion (w, x, y, z) -> 3x3 rotation matrix in screen-aligned axes for the current display rotation. */
    private fun toScreenMatrix(q: FloatArray, out: FloatArray) {
        vec[0] = q[1]; vec[1] = q[2]; vec[2] = q[3]; vec[3] = q[0] // rotation vector order: x, y, z, w
        SensorManager.getRotationMatrixFromVector(tmp, vec)
        @Suppress("DEPRECATION")
        val rotation = wm.defaultDisplay.rotation
        val (ax, ay) = when (rotation) {
            Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
            Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
            Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
            else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
        }
        SensorManager.remapCoordinateSystem(tmp, ax, ay, out)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
