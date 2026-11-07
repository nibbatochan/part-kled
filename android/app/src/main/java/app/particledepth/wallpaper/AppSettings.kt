package app.particledepth.wallpaper

import android.content.Context

/**
 * User settings that change how the wallpaper behaves, kept in SharedPreferences "pds_settings". They are read when the
 * wallpaper becomes visible (the sensor and the frame loop start then), so a change applies the next time it is shown.
 */
class AppSettings(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("pds_settings", Context.MODE_PRIVATE)

    /** Tilt the picture with the phone. Off: the picture stays centred and the motion sensor is never registered. */
    var gyroOn: Boolean
        get() = prefs.getBoolean("gyroOn", true)
        set(v) = prefs.edit().putBoolean("gyroOn", v).apply()

    /** Phone rotation, in degrees, that gives the full turn. Smaller = more sensitive. */
    var gyroRange: Float
        get() = prefs.getFloat("gyroRange", SpikeConfig.TILT_FULL_DEG).coerceIn(RANGE_MIN, RANGE_MAX)
        set(v) = prefs.edit().putFloat("gyroRange", v.coerceIn(RANGE_MIN, RANGE_MAX)).apply()

    /** The highest frame rate the wallpaper may use: 30 saves battery, 60 is smoother. */
    var fpsCap: Int
        get() = if (prefs.getInt("fpsCap", 60) <= 30) 30 else 60
        set(v) = prefs.edit().putInt("fpsCap", if (v <= 30) 30 else 60).apply()

    /** Draw less (no trails, 30 fps) while Android's battery saver is on or the battery is low and unplugged. */
    var saverRule: Boolean
        get() = prefs.getBoolean("saverRule", true)
        set(v) = prefs.edit().putBoolean("saverRule", v).apply()

    companion object {
        const val RANGE_MIN = 12f
        const val RANGE_MAX = 45f
    }
}
