package app.particledepth.wallpaper.ui

import app.particledepth.wallpaper.pack.PackConfigParser
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PackCatalogTest {
    private val packs = File("src/main/assets/packs").listFiles { f -> f.isDirectory }!!.sortedBy { it.name }

    @Test fun everyPackBuildsItsSliders() {
        assertTrue(packs.isNotEmpty())
        for (dir in packs) {
            val c = PackConfigParser.parse(File(dir, "pack.json").readText())
            val sliders = PackCatalog.sliders(c)
            assertTrue("${dir.name}: no sliders", sliders.size >= 14)
            for (s in sliders) {
                val v = c.params.value(s.key) // must resolve for plain and fx.* keys
                assertTrue("${dir.name}/${s.key}: value $v outside ${s.min}..${s.max}", v >= s.min - 1e-4f && v <= s.max + 1e-4f)
            }
        }
    }

    @Test fun labelsUseTheWebStudiosWords() {
        val labels = packs.flatMap { PackCatalog.sliders(PackConfigParser.parse(File(it, "pack.json").readText())) }.map { it.label }.toSet()
        for (web in listOf("MOVEMENT", "3D DEPTH", "SIDE BIAS", "VARIETY", "PARTICLE COLOUR", "PARTICLE SIZE", "TRAIL BEND", "TRAIL LENGTH", "TRAILS")) {
            assertTrue("missing $web in $labels", web in labels)
        }
        // the app's first draft used its own words; none of them may come back
        for (old in listOf("FLOW", "TILT", "RELIEF", "LIGHT", "COLOUR")) assertFalse("old word $old is back", old in labels)
    }

    @Test fun glassGreenShowsItsLookSliders() {
        val c = PackConfigParser.parse(File("src/main/assets/packs/glass-green/pack.json").readText())
        val labels = PackCatalog.sliders(c).map { it.label }
        for (l in listOf("GLOSS", "RIM", "DEPTH", "BEVEL")) assertTrue("missing $l in $labels", l in labels)
    }

    @Test fun overridesReachTheNestedGroup() {
        val c = PackConfigParser.parse(File("src/main/assets/packs/spike/pack.json").readText())
        val p = c.params.withOverrides(mapOf("fx.saturation" to 9f, "pSat" to 1.7f))
        assertEquals(2f, p.fx("saturation"), 0f) // clamped to its range
        assertEquals(1.7f, p.n("pSat"), 0f)
    }
}
