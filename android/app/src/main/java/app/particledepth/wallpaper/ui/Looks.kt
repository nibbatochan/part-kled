package app.particledepth.wallpaper.ui

/**
 * The looks a user can switch between on any effect, with the web studio's names. Each is one on/off flag of the dots
 * base (see ParamSpec); choosing one turns the others off. PLAIN is every look off. Chrome and Fur are left out on
 * purpose: the user dropped them after review (2026-11-07).
 */
object Looks {
    class Look(val flag: String, val label: String)

    val all = listOf(
        Look("glassGreenOn", "GLASS GREEN"), Look("candyOn", "CANDY"), Look("cabrOn", "C-ABR"), Look("chroma2On", "CHROMA 2"),
        Look("ecstasyOn", "ECSTASY"), Look("redmetOn", "REDMET"), Look("prismaticOn", "PRISMATIC"), Look("auraOn", "AURA"),
        Look("bloodOn", "BLOOD"), Look("blightOn", "BLIGHT"), Look("convulsionsOn", "CONVULSIONS"), Look("blendOn", "BLEND"),
        Look("linedOn", "LINED"), Look("softwordOn", "SOFTWORD"), Look("shakeOn", "SHAKE-MASK"), Look("rockOn", "ROCK"),
        Look("aranciaOn", "ARANCIA"), Look("cumulusOn", "CUMULUS"),
    )

    /** Overrides that switch [chosen] on and every other look off; null chosen = PLAIN. */
    fun choose(chosen: String?): Map<String, Float> = all.associate { "flag:${it.flag}" to if (it.flag == chosen) 1f else 0f }
}
