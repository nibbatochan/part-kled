package app.particledepth.wallpaper.ui

import app.particledepth.wallpaper.pack.PackConfigParser
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PresetsTest {
    /** Reads the web studio's own preset tables, so the copy in Presets.kt cannot drift. */
    private fun webPresets(): Map<String, Map<String, Map<String, Float>>> {
        val ts = File("../../src/core/styles.ts")
        assertTrue("web styles.ts not found at ${ts.absolutePath}", ts.exists())
        val text = ts.readText()
        val out = HashMap<String, Map<String, Map<String, Float>>>()
        val names = mapOf("GLASS_GREEN_PRESETS" to "glassGreen", "CANDY_PRESETS" to "candy", "CABR_PRESETS" to "cabr")
        for ((const, look) in names) {
            val body = Regex("export const $const = \\{(.*?)\\} as const;", RegexOption.DOT_MATCHES_ALL).find(text)!!.groupValues[1]
            val presets = HashMap<String, Map<String, Float>>()
            for (m in Regex("(\\w+): \\{([^}]*)\\}").findAll(body)) {
                presets[m.groupValues[1]] = Regex("(\\w+): ([0-9.]+)").findAll(m.groupValues[2]).associate { it.groupValues[1] to it.groupValues[2].toFloat() }
            }
            out[look] = presets
        }
        return out
    }

    @Test fun presetsMatchTheWebStudio() {
        val web = webPresets()
        assertEquals(web.keys, Presets.raw().keys)
        for ((look, presets) in web) {
            assertEquals("$look presets", presets, Presets.raw()[look])
        }
    }

    @Test fun glassGreenPackGetsItsPresetAsOverrides() {
        val c = PackConfigParser.parse(File("src/main/assets/packs/glass-green/pack.json").readText())
        val o = Presets.overridesFor(c, "subtle")
        assertNotNull(o)
        assertEquals(0.40f, o!!["glassGreenGloss"]!!, 0f)
        assertEquals(0.45f, o["glassGreenBevel"]!!, 0f)
        // every override key must be a real setting the pack accepts
        val applied = c.params.withOverrides(o)
        assertEquals(0.40f, applied.n("glassGreenGloss"), 0f)
    }

    @Test fun packsWithoutPresetsGetNone() {
        val c = PackConfigParser.parse(File("src/main/assets/packs/blend/pack.json").readText())
        assertNull(Presets.overridesFor(c, "subtle"))
    }
}
