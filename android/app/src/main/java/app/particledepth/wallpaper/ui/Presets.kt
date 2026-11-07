package app.particledepth.wallpaper.ui

import app.particledepth.wallpaper.pack.PackConfig
import app.particledepth.wallpaper.pack.PackParams

/**
 * FAITHFUL / SUBTLE / EXPRESSIVE for the three looks that have presets in the web studio
 * (GLASS_GREEN_PRESETS, CANDY_PRESETS, CABR_PRESETS in src/core/styles.ts). Values are copied; PresetsTest reads
 * styles.ts and fails if they drift. Keys are the pack setting names (look prefix + capitalised field).
 */
object Presets {
    val NAMES = listOf("faithful", "subtle", "expressive")

    private val table: Map<String, Map<String, Map<String, Float>>> = mapOf(
        "glassGreen" to mapOf(
            "faithful" to mapOf("gloss" to 0.85f, "rim" to 0.90f, "depth" to 0.70f, "bevel" to 0.65f),
            "subtle" to mapOf("gloss" to 0.40f, "rim" to 0.50f, "depth" to 0.45f, "bevel" to 0.45f),
            "expressive" to mapOf("gloss" to 1.00f, "rim" to 1.00f, "depth" to 0.85f, "bevel" to 0.85f),
        ),
        "candy" to mapOf(
            "faithful" to mapOf("gloss" to 0.85f, "glow" to 0.70f, "tone" to 0.50f),
            "subtle" to mapOf("gloss" to 0.50f, "glow" to 0.45f, "tone" to 0.40f),
            "expressive" to mapOf("gloss" to 1.00f, "glow" to 0.90f, "tone" to 0.65f),
        ),
        "cabr" to mapOf(
            "faithful" to mapOf("disp" to 0.85f, "gloss" to 0.90f, "rim" to 0.85f),
            "subtle" to mapOf("disp" to 0.45f, "gloss" to 0.55f, "rim" to 0.50f),
            "expressive" to mapOf("disp" to 1.00f, "gloss" to 1.00f, "rim" to 1.00f),
        ),
    )

    /** The look prefixes that have presets. */
    val looks: Set<String> get() = table.keys

    /** Raw table for the drift test: look prefix -> preset name -> field -> value. */
    fun raw(): Map<String, Map<String, Map<String, Float>>> = table

    /** The preset's settings as pack overrides, for the look the pack has switched on; null if the pack's look has none. */
    fun overridesFor(config: PackConfig, preset: String): Map<String, Float>? = overridesFor(config.params, preset)

    fun overridesFor(params: PackParams, preset: String): Map<String, Float>? {
        for (look in table.keys) {
            if (!params.on(look + "On")) continue
            val fields = table[look]?.get(preset) ?: return null
            return fields.mapKeys { (field, _) -> look + field.replaceFirstChar { it.uppercase() } }
        }
        return null
    }
}
