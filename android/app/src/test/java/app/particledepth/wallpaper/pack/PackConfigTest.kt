package app.particledepth.wallpaper.pack

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class PackConfigTest {
    private val sha = "a".repeat(64)

    /** A minimal valid pack with [params] as the settings object (a JSON object body, without braces). */
    private fun pack(params: String = "", extra: String = "", schema: String = "pds.effect/1", file: String = "subject.png"): String = """
        {"schema":"$schema","id":"t","name":"T","minEngine":1,
         "assets":{"subject":{"file":"$file","sha256":"$sha"},"depth":{"file":"depth.png","sha256":"$sha"}},
         "params":{$params}$extra}
    """.trimIndent()

    private fun rejects(json: String, contains: String) {
        try {
            PackConfigParser.parse(json)
            fail("expected a PackException containing \"$contains\"")
        } catch (e: PackException) {
            assertTrue("message was: ${e.message}", e.message!!.contains(contains))
        }
    }

    // ---- golden: the real exporter output must load with no warnings ----

    @Test fun everyBuiltInPackLoadsWithoutWarnings() {
        val ids = File("src/main/assets/packs").listFiles { f -> f.isDirectory }!!.map { it.name }.sorted()
        assertTrue("expected the built-in packs, found $ids", ids.size >= 15)
        for (id in ids) {
            val f = File("src/main/assets/packs/$id/pack.json")
            assertTrue("run `node scripts/export-pack.mjs` first: ${f.absolutePath}", f.exists())
            val c = PackConfigParser.parse(f.readText())
            assertEquals("a key the exporter writes is missing from ParamSpec.kt: ${c.warnings}", emptyList<String>(), c.warnings)
            assertEquals(id, c.id)
        }
    }

    @Test fun glassGreenPackCarriesItsLook() {
        val c = PackConfigParser.parse(File("src/main/assets/packs/glass-green/pack.json").readText())
        assertTrue(c.params.on("glassGreenOn"))
        assertFalse(c.params.on("candyOn"))
        assertEquals(0.4f, c.params.n("depth"), 1e-6f)
        assertEquals(0.3f, c.params.n("drift"), 1e-6f)
        assertEquals(0.85f, c.params.n("glassGreenGloss"), 1e-6f)
    }

    // ---- ranges, types, unknown keys ----

    @Test fun outOfRangeNumberIsClampedAndReported() {
        val c = PackConfigParser.parse(pack("\"depth\": 5, \"drift\": -2"))
        assertEquals(1f, c.params.n("depth"), 0f)
        assertEquals(0f, c.params.n("drift"), 0f)
        assertEquals(2, c.warnings.count { it.contains("clamped") })
    }

    @Test fun wrongTypeFallsBackToDefaultAndIsReported() {
        val c = PackConfigParser.parse(pack("\"drift\": \"fast\", \"trails\": 1"))
        assertEquals(0f, c.params.n("drift"), 0f)
        assertTrue(c.params.on("trails")) // the default
        assertEquals(2, c.warnings.size)
    }

    @Test fun nanAndInfinityNeverReachTheShader() {
        // org.json reads an unquoted NaN as a string, so it is not a number: default plus a warning, never a NaN uniform
        val c = PackConfigParser.parse(pack("\"depth\": NaN"))
        assertEquals(0.5f, c.params.n("depth"), 0f)
        assertEquals(1, c.warnings.size)
    }

    @Test fun unknownAndUnsupportedKeysAreIgnoredWithAWarning() {
        val c = PackConfigParser.parse(pack("\"nope\": 1, \"track\": true, \"glow\": {\"bloomOn\": true}"))
        assertEquals(3, c.warnings.size)
        assertTrue(c.warnings.any { it.startsWith("nope: unknown") })
        assertTrue(c.warnings.any { it.startsWith("track: not drawn") })
        assertFalse(c.params.on("emitOn").not()) // untouched default
    }

    @Test fun cellLookFallsBackToDots() {
        val c = PackConfigParser.parse(pack("\"style\": 7"))
        assertEquals(0f, c.params.n("style"), 0f)
        assertTrue(c.warnings.any { it.contains("cell looks") })
    }

    @Test fun nestedGroupsAreValidated() {
        val c = PackConfigParser.parse(pack("\"fx\": {\"gamma\": 9, \"bogus\": 1}, \"emit\": {\"r3\": 0.5}"))
        assertEquals(2.2f, c.params.fx("gamma"), 0f)
        assertEquals(0.5f, c.params.emit("r3"), 0f)
        assertEquals(1f, c.params.emit("r4"), 0f) // default
        assertEquals(2, c.warnings.size)
    }

    @Test fun lightIsNullOrThreeNumbers() {
        assertNull(PackConfigParser.parse(pack("\"light\": null")).params.light)
        val l = PackConfigParser.parse(pack("\"light\": [0.5, 2, 0.1]")).params.light
        assertNotNull(l)
        assertEquals(1f, l!![1], 0f) // clamped
        val bad = PackConfigParser.parse(pack("\"light\": [1, 2]"))
        assertNull(bad.params.light)
        assertEquals(1, bad.warnings.size)
    }

    // ---- refuse ----

    @Test fun unknownSchemaMajorIsRefused() = rejects(pack(schema = "pds.effect/2"), "not supported")
    @Test fun notASchemaIsRefused() = rejects(pack(schema = "other/1"), "unknown schema")
    @Test fun newerEngineIsRefused() = rejects(pack(extra = "").replace("\"minEngine\":1", "\"minEngine\":2"), "update the app")
    @Test fun filePathsAreRefused() {
        rejects(pack(file = "../secret.png"), "plain file name")
        rejects(pack(file = "a/b.png"), "plain file name")
        rejects(pack(file = "/etc/passwd"), "plain file name")
    }
    @Test fun badHashIsRefused() = rejects(pack().replace(sha, "xyz"), "sha256")
    @Test fun badIdIsRefused() = rejects(pack().replace("\"id\":\"t\"", "\"id\":\"../x\""), "bad id")
    @Test fun notJsonIsRefused() = rejects("{ nope", "not valid JSON")
    @Test fun missingAssetsAreRefused() = rejects("""{"schema":"pds.effect/1","id":"t","params":{}}""", "assets")
    @Test fun hugeConfigIsRefused() = rejects(pack("\"x\": \"" + "a".repeat(PackConfigParser.MAX_CONFIG_BYTES) + "\""), "larger than")
    @Test fun deepNestingIsRefused() {
        val deep = "\"a\":{\"b\":{\"c\":{\"d\":{}}}}"
        rejects(pack(deep), "nested deeper")
    }
    @Test fun longStringsAreRefused() = rejects(pack().replace("\"name\":\"T\"", "\"name\":\"" + "n".repeat(300) + "\""), "longer than")

    // ---- the spec itself ----

    @Test fun defaultsAreInsideTheirRanges() {
        for (n in ParamSpec.numbers + ParamSpec.fx + ParamSpec.emit) {
            assertTrue("${n.key} default ${n.def} outside ${n.min}..${n.max}", n.def in n.min..n.max)
        }
    }

    @Test fun noKeyIsBothSupportedAndUnsupported() {
        for (k in ParamSpec.unsupported) {
            assertNull("$k is listed unsupported but also has a spec", ParamSpec.num(k))
            assertNull("$k is listed unsupported but also has a spec", ParamSpec.flag(k))
        }
    }
}
