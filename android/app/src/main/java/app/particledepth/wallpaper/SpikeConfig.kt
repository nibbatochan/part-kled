package app.particledepth.wallpaper

/**
 * Phase 1 constants. Every number here is a PROPOSED starting value from docs/RESEARCH_ANDROID_LIVE_WALLPAPER.md,
 * not a measurement. Phase 2 replaces this with the tier probe and the adaptive policy.
 */
object SpikeConfig {
    const val PACK = "spike" // the built-in pack; the user's choice is saved in SharedPreferences "pds" key "pack"
    const val PARTICLES = 100_000
    /** 30 felt slow on a realme X2 (2026-11-06). 60 is the test value; the battery cost is not measured yet. */
    const val TARGET_FPS = 60

    /** How fast the picture follows the tilt, per second. The web hover uses 5 (about 0.2 s to settle). */
    const val TILT_EASE = 12f

    /**
     * Share of the screen resolution. Only 1.0 works in phase 1: a wallpaper surface cannot be resized (setFixedSize throws).
     * Phase 2: draw into a smaller offscreen target and blit it.
     */
    const val RENDER_SCALE = 1.0f

    /** Phone tilt (degrees) that gives full picture tilt (the web hover range of -1..1). Tune on a device. */
    const val TILT_FULL_DEG = 25f

    /**
     * The tilt centre follows the phone with this time constant (seconds). Holding the phone still for about 3x this
     * brings the picture back to flat. Smaller = settles faster but tilts less when you move slowly. PROPOSED, tune by feel.
     */
    const val REST_TAU_S = 2.5f

    /** Seconds after the wallpaper becomes visible during which the centre snaps to the phone (lifting it off a table). */
    const val WARMUP_S = 0.6f

    /** Flip if the picture turns the wrong way against the phone. Needs a real device to settle. */
    const val TILT_SIGN_X = 1f
    const val TILT_SIGN_Y = 1f

    /**
     * Picture size as a share of the largest size that fits the screen whole ("contain"). 1.0 touches the screen edges.
     * Was "cover" (cropped, zoomed in) until 2026-11-06, which hid the particle effect. Chosen by feel on a realme X2.
     */
    const val ZOOM = 0.8f

    /** Picture centre moved up (+) or down (-) by this share of the screen height. Leave room for the clock/dock later. */
    const val OFFSET_Y = 0f





    /** Seconds between stats lines in logcat (tag PDS). */
    const val STATS_EVERY_S = 5
}
