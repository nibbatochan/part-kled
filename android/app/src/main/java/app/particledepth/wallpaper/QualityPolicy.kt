package app.particledepth.wallpaper

import android.util.Log

/**
 * Picks how much to draw so the frame rate holds without wasting battery. Two inputs:
 *  - measured speed: if frames arrive slower than the target for 2 windows in a row, step down one level; after a
 *    stable stretch step back up one level (the wait doubles each time a climb fails, so it cannot oscillate);
 *  - system state: power-saver, low battery and thermal status set a floor level and an fps cap.
 *
 * The ladder keeps the picture and the motion, and removes the costly extras first: trails (a second full draw),
 * then particles (any prefix of the buffer is an even subset of the picture, see PackSampler), then frame rate.
 * All numbers are PROPOSED starting values, tuned on one phone (realme X2). Used on the render thread only.
 */
class QualityPolicy(
    startLevel: Int = 0,
    private val onStable: (Int) -> Unit = {},
    private val onChange: (Quality) -> Unit,
) {
    class Quality(val level: Int, val fps: Int, val pointShare: Float, val trailShare: Float, val renderScale: Float)

    private class Step(val pointShare: Float, val trailShare: Float, val fps: Int, val renderScale: Float = 1f)

    private val ladder = listOf(
        Step(1f, 1f, 60),     // 0 full
        Step(1f, 0.5f, 60),   // 1 trails on half the particles
        Step(1f, 0f, 60),     // 2 no trails
        Step(1f, 0f, 60, 0.8f),     // 3 render at 80% size (about 64% of the pixels), stretched to the screen
        Step(0.75f, 0f, 60, 0.8f),  // 4
        Step(0.5f, 0f, 30, 0.65f),  // 5 last resort
    )

    private var perfLevel = startLevel.coerceIn(0, 5)
    private var clock = 0f                              // seconds of drawing so far
    private val bannedUntil = FloatArray(6)             // a level that failed is not tried again before this time
    private val banLength = FloatArray(6) { BAN_START_S }
    private var floorLevel = 0
    private var fpsCap = 60
    private var userCap = 60                            // the user's own limit (settings)
    private var slowWindows = 0
    private var stableSeconds = 0f

    var current: Quality = make(perfLevel)
        private set

    private fun make(level: Int): Quality {
        val s = ladder[level]
        return Quality(level, minOf(s.fps, fpsCap, userCap), s.pointShare, s.trailShare, s.renderScale)
    }

    /** Called every WINDOW_S seconds of drawing with the frame rate achieved in that window. */
    fun onWindow(achievedFps: Float, targetFps: Int, lateShare: Float = 0f) {
        clock += WINDOW_S
        // Very slow (under 80%): step down at once. Slightly slow (under 92%): wait for a second slow window.
        val veryslow = achievedFps < targetFps * 0.80f
        // Hitches count too: a window can average 60 fps and still have a visible gap now and then
        val hitchy = lateShare > LATE_SHARE_LIMIT
        if (achievedFps < targetFps * 0.92f || hitchy) {
            stableSeconds = 0f
            slowWindows++
            if ((veryslow || slowWindows >= 2) && perfLevel < ladder.size - 1) {
                slowWindows = 0
                // This level cannot hold the rate: do not try it again for a while, longer each time it fails
                bannedUntil[perfLevel] = clock + banLength[perfLevel]
                banLength[perfLevel] = minOf(banLength[perfLevel] * 2f, BAN_MAX_S)
                perfLevel++
                apply("too slow: %.1f fps against %d, %.1f%% late frames".format(achievedFps, targetFps, lateShare * 100))
            }
        } else {
            slowWindows = 0
            if (achievedFps >= targetFps * 0.97f && !hitchy) stableSeconds += WINDOW_S
            if (stableSeconds >= CLIMB_WAIT_S && perfLevel > floorLevel && clock >= bannedUntil[perfLevel - 1]) {
                stableSeconds = 0f
                perfLevel--
                apply("stable for %.0f s".format(CLIMB_WAIT_S))
            } else if (stableSeconds >= CLIMB_WAIT_S) {
                onStable(perfLevel) // holding this level and nothing better is allowed yet: remember it for the next start
            }
        }
    }

    /** The user's frame-rate limit from settings (30 or 60). */
    fun setUserCap(fps: Int) {
        if (fps == userCap) return
        userCap = fps
        apply("user limit $fps fps")
    }

    /** Power saver or low battery: no trails, 30 fps. */
    fun setSaver(on: Boolean, why: String) = setConstraint(if (on) 2 else 0, if (on) 30 else 60, why)

    /** PowerManager thermal status: 0 none, 1 light, 2 moderate, 3 severe, 4+ critical and worse. */
    fun setThermal(status: Int) = when {
        status >= 4 -> setConstraint(5, 15, "thermal $status")
        status == 3 -> setConstraint(4, 20, "thermal $status")
        status == 2 -> setConstraint(3, 30, "thermal $status")
        else -> setConstraint(0, 60, "thermal $status")
    }

    private var saverFloor = 0
    private var saverCap = 60
    private var thermalFloor = 0
    private var thermalCap = 60

    private fun setConstraint(floor: Int, cap: Int, why: String) {
        // saver and thermal are separate inputs; the strictest of each wins
        if (why.startsWith("thermal")) { thermalFloor = floor; thermalCap = cap } else { saverFloor = floor; saverCap = cap }
        floorLevel = maxOf(saverFloor, thermalFloor)
        fpsCap = minOf(saverCap, thermalCap)
        if (perfLevel < floorLevel) perfLevel = floorLevel
        apply(why)
    }

    private fun apply(why: String) {
        val level = maxOf(perfLevel, floorLevel)
        val q = make(level)
        if (q.level != current.level || q.fps != current.fps) {
            Log.i(ParticleRenderer.TAG, "quality level ${current.level} -> ${q.level} (${q.pointShare * 100}% points, ${q.trailShare * 100}% trails, ${(q.renderScale * 100).toInt()}% size, ${q.fps} fps): $why")
            current = q
            onChange(q)
        }
    }

    companion object {
        const val WINDOW_S = 2f
        private const val LATE_SHARE_LIMIT = 0.025f // more than 2.5% of frames later than 1.5x the target gap
        private const val CLIMB_WAIT_S = 30f
        private const val BAN_START_S = 300f   // first failure: 5 min before trying that level again
        private const val BAN_MAX_S = 7200f
    }
}
