package app.particledepth.wallpaper

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Kotlin sampler must reproduce the web sampler (src/core/Sampler.ts plus the loop in src/lite/sample.ts).
 * Golden data comes from `node scripts/gen-sampler-golden.mjs`: three small synthetic pictures, 500 particles each.
 */
class SamplerGoldenTest {
    private val root = JSONObject(File("src/test/resources/sampler-golden.json").readText())
    private val w = root.getInt("w")
    private val h = root.getInt("h")
    private val count = root.getInt("count")

    private fun b64(s: String): ByteBuffer = ByteBuffer.wrap(Base64.getDecoder().decode(s)).order(ByteOrder.LITTLE_ENDIAN)

    private fun check(kind: String) {
        val c = root.getJSONObject("cases").getJSONObject(kind)
        val rgba = b64(c.getString("rgba"))
        val depthBuf = b64(c.getString("depth"))
        val px = IntArray(w * h) { i ->
            val r = rgba.get(i * 4).toInt() and 255
            val g = rgba.get(i * 4 + 1).toInt() and 255
            val b = rgba.get(i * 4 + 2).toInt() and 255
            val a = rgba.get(i * 4 + 3).toInt() and 255
            (a shl 24) or (r shl 16) or (g shl 8) or b
        }
        val depth = FloatArray(w * h) { depthBuf.getFloat(it * 4) }

        val wt = Sampler.importanceWeights(px, w, h)
        assertEquals("$kind: active pixel count", c.getInt("activeCount"), wt.activeCount)
        var sum = 0.0
        for (v in wt.weights) sum += v
        assertEquals("$kind: weight sum", c.getDouble("weightsSum"), sum, 1e-3)

        val s = Sampler.particles(px, depth, w, h, count)
        val want = b64(c.getString("particles"))
        val got = s.buffer
        var worst = 0.0
        var byteMisses = 0
        for (i in 0 until count) {
            for (k in 0 until 3) {
                val d = Math.abs(want.getFloat(i * 16 + k * 4) - got.getFloat(i * 16 + k * 4)).toDouble()
                if (d > worst) worst = d
            }
            for (k in 12 until 16) if (want.get(i * 16 + k) != got.get(i * 16 + k)) byteMisses++
        }
        assertTrue("$kind: position differs by $worst", worst < 1e-5)
        // Colour and gain bytes are integers computed from doubles; allow a handful of 1-off rounding ties
        assertTrue("$kind: $byteMisses of ${count * 4} colour/gain bytes differ", byteMisses <= count * 4 / 100)
    }

    @Test fun flatBackgroundPicture() = check("flat")
    @Test fun cutOutPictureWithAlpha() = check("alpha")
    @Test fun busyPictureWithoutCut() = check("busy")

    @Test fun hashMatchesTheWebHash() {
        // Values printed by hash01 in src/core/Sampler.ts (node)
        assertEquals(0.010127014713361859, Sampler.hash01(0, 1), 1e-15)
        assertEquals(0.30284668225795031, Sampler.hash01(1, 2), 1e-15)
        assertEquals(0.44821580615825951, Sampler.hash01(123456, 3), 1e-15)
        assertEquals(0.076505675446242094, Sampler.hash01(524287, 2), 1e-15)
    }
}
