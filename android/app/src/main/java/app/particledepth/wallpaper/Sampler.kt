package app.particledepth.wallpaper

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Port of the web sampler: computeImportanceWeights, removeFlatBackground, buildCDF, lowerBound and hash01 from
 * src/core/Sampler.ts, and the particle loop of sampleLite in src/lite/sample.ts. Plain Kotlin, no Android classes,
 * so the JVM golden test (SamplerGoldenTest) can compare it with the TypeScript output number for number.
 *
 * Arithmetic follows the TypeScript on purpose: Float32 arrays where the web code has Float32Array, doubles elsewhere.
 * Input pixels are ARGB ints with straight (not premultiplied) alpha, as Bitmap.getPixels returns them.
 */
object Sampler {
    /** Cheap integer hash -> [0, 1). Independent stream per (index, salt). Same as hash01 in Sampler.ts. */
    fun hash01(i: Int, salt: Int): Double {
        var h = (((i + 1) * 0x9e3779b1.toInt()) xor ((salt + 1) * 0x85ebca6b.toInt()))
        h = (h xor (h ushr 16)) * 0x85ebca6b.toInt()
        h = (h xor (h ushr 13)) * 0xc2b2ae35.toInt()
        h = h xor (h ushr 16)
        return (h.toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
    }

    /** Binary search for the lower bound in a cumulative distribution. */
    fun lowerBound(cdf: FloatArray, v: Double): Int {
        var low = 0
        var high = cdf.size - 1
        while (low < high) {
            val mid = (low + high) ushr 1
            if (cdf[mid] < v) low = mid + 1 else high = mid
        }
        return low
    }

    fun buildCdf(weights: FloatArray): FloatArray {
        val cdf = FloatArray(weights.size)
        var acc = 0.0
        for (i in weights.indices) {
            acc += weights[i]
            cdf[i] = acc.toFloat()
        }
        return cdf
    }

    private fun r(c: Int) = (c shr 16) and 255
    private fun g(c: Int) = (c shr 8) and 255
    private fun b(c: Int) = c and 255
    private fun a(c: Int) = (c ushr 24) and 255

    /**
     * Cut out a flat background: estimate the backdrop colour from the border and flood-fill inward through matching
     * pixels. Returns a 0/1 mask (1 = subject), or null when the border is not flat or the fill would swallow the picture.
     */
    fun removeFlatBackground(px: IntArray, w: Int, h: Int): ByteArray? {
        val n = w * h
        var mr = 0.0
        var mg = 0.0
        var mb = 0.0
        var count = 0
        val border = ArrayList<IntArray>()
        var x = 0
        while (x < w) { border.add(intArrayOf(x, 0)); border.add(intArrayOf(x, h - 1)); x += 2 }
        var y = 0
        while (y < h) { border.add(intArrayOf(0, y)); border.add(intArrayOf(w - 1, y)); y += 2 }
        for (p in border) {
            val c = px[p[1] * w + p[0]]
            mr += r(c); mg += g(c); mb += b(c); count++
        }
        mr /= count; mg /= count; mb /= count
        var spread = 0.0
        for (p in border) {
            val c = px[p[1] * w + p[0]]
            spread += hypot(hypot(r(c) - mr, g(c) - mg), b(c) - mb) // Math.hypot(a, b, c) in the web code
        }
        spread /= count
        if (spread > 22) return null

        val tol = 46 + spread * 2
        fun dist(i: Int): Double { val c = px[i]; return hypot(hypot(r(c) - mr, g(c) - mg), b(c) - mb) }
        fun isBg(i: Int) = dist(i) < tol

        val mask = ByteArray(n) { 1 }
        val stack = IntArray(n)
        var sp = 0
        fun push(xx: Int, yy: Int) {
            val i = yy * w + xx
            if (mask[i].toInt() == 1 && isBg(i)) { mask[i] = 0; stack[sp++] = i }
        }
        for (xx in 0 until w) { push(xx, 0); push(xx, h - 1) }
        for (yy in 0 until h) { push(0, yy); push(w - 1, yy) }
        while (sp > 0) {
            val i = stack[--sp]
            val xx = i % w
            val yy = i / w
            if (xx > 0) push(xx - 1, yy)
            if (xx < w - 1) push(xx + 1, yy)
            if (yy > 0) push(xx, yy - 1)
            if (yy < h - 1) push(xx, yy + 1)
        }
        var kept = 0
        for (i in 0 until n) kept += mask[i]
        if (kept < n * 0.01 || kept > n * 0.995) return null

        val out = mask.copyOf()
        for (yy in 1 until h - 1) for (xx in 1 until w - 1) {
            val i = yy * w + xx
            if (mask[i].toInt() == 1 && (mask[i - 1].toInt() == 0 || mask[i + 1].toInt() == 0 || mask[i - w].toInt() == 0 || mask[i + w].toInt() == 0)) {
                if (isBg(i) || dist(i) < tol * 1.6) out[i] = 0
            }
        }
        return out
    }

    class Weights(val weights: FloatArray, val activeCount: Int)

    /** mask * (floor + edge strength + luminance + saturation): particles go where the picture has something to show. */
    fun importanceWeights(px: IntArray, w: Int, h: Int): Weights {
        val n = w * h
        val mask = FloatArray(n)
        val lum = FloatArray(n)
        val sat = FloatArray(n)
        val weights = FloatArray(n)
        var activeCount = 0

        var hasExplicitAlpha = false
        for (i in 0 until n) if (a(px[i]) < 240) { hasExplicitAlpha = true; break }
        val cut = if (hasExplicitAlpha) null else removeFlatBackground(px, w, h)

        for (i in 0 until n) {
            val c = px[i]
            val rr = r(c) / 255.0
            val gg = g(c) / 255.0
            val bb = b(c) / 255.0
            val aa = a(c) / 255.0
            val maxC = max(rr, max(gg, bb))
            val minC = min(rr, min(gg, bb))
            sat[i] = (if (maxC == 0.0) 0.0 else (maxC - minC) / maxC).toFloat()
            lum[i] = (0.299 * rr + 0.587 * gg + 0.114 * bb).toFloat()
            mask[i] = if (hasExplicitAlpha) (if (aa > 0.15) aa.toFloat() else 0f) else (if (cut != null) cut[i].toFloat() else 1f)
            if (mask[i] > 0) activeCount++
        }
        for (y in 0 until h) for (x in 0 until w) {
            val idx = y * w + x
            if (mask[idx] <= 0) continue
            var edge = 0.0
            if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
                val gx = lum[idx + 1].toDouble() - lum[idx - 1].toDouble()
                val gy = lum[idx + w].toDouble() - lum[idx - w].toDouble()
                edge = min(1.0, hypot(gx, gy) * 3.0)
            }
            val tone = lum[idx].toDouble().pow(1.2)
            weights[idx] = (mask[idx] * (0.4 + 0.6 * edge + 0.5 * tone + 0.2 * sat[idx])).toFloat()
        }
        var sum = 0.0
        for (i in 0 until n) sum += weights[i]
        if (sum <= 1e-4) {
            weights.fill(1f)
            activeCount = n
        }
        return Weights(weights, activeCount)
    }

    private fun gcd(a: Int, b: Int): Int { var x = a; var y = b; while (y != 0) { val t = x % y; x = y; y = t }; return x }

    /**
     * The particle loop of sampleLite. [depth] is at working size, 0..1. Writes 16 bytes per particle:
     * f32 x, y, z, then u8 r, g, b and gain/5. Any prefix of the buffer is an even subset of the picture.
     */
    fun particles(px: IntArray, depth: FloatArray, w: Int, h: Int, count: Int): Sample {
        val wt = importanceWeights(px, w, h)
        val cdf = buildCdf(wt.weights)
        val total = cdf[cdf.size - 1].toDouble()
        val meanWeight = total / max(1, wt.activeCount)
        val aspect = w.toDouble() / h

        var mul = floor(count * 0.6180339887).toInt() or 1
        while (gcd(mul, count) != 1) mul += 2

        val buf = ByteBuffer.allocateDirect(count * 16).order(ByteOrder.nativeOrder())
        for (i in 0 until count) {
            val j = ((i.toLong() * mul) % count).toInt()
            val u = (j + hash01(i, 1)) / count
            val p = lowerBound(cdf, u * total)
            val x = max(0.0, min(w - 1.001, (p % w) + hash01(i, 2)))
            val y = max(0.0, min(h - 1.001, floor((p / w).toDouble()) + hash01(i, 3)))
            val x0 = x.toInt()
            val y0 = y.toInt()
            val fx = x - x0
            val fy = y - y0

            fun mix(ch: (Int) -> Int): Double {
                val a00 = ch(px[y0 * w + x0]).toDouble()
                val a10 = ch(px[y0 * w + x0 + 1]).toDouble()
                val a01 = ch(px[(y0 + 1) * w + x0]).toDouble()
                val a11 = ch(px[(y0 + 1) * w + x0 + 1]).toDouble()
                return (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy
            }
            val z = (depth[y0 * w + x0].toDouble() * (1 - fx) + depth[y0 * w + x0 + 1].toDouble() * fx) * (1 - fy) +
                (depth[(y0 + 1) * w + x0].toDouble() * (1 - fx) + depth[(y0 + 1) * w + x0 + 1].toDouble() * fx) * fy

            val o = i * 16
            buf.putFloat(o, ((x / w - 0.5) * aspect).toFloat())
            buf.putFloat(o + 4, (0.5 - y / h).toFloat())
            buf.putFloat(o + 8, (z - 0.5).toFloat())
            buf.put(o + 12, mix { r(it) }.toInt().toByte())     // Uint8Array assignment truncates, as in sample.ts
            buf.put(o + 13, mix { g(it) }.toInt().toByte())
            buf.put(o + 14, mix { b(it) }.toInt().toByte())
            val gain = min(5.0, max(0.2, meanWeight / max(1e-4, wt.weights[p].toDouble())))
            buf.put(o + 15, ((gain / 5.0) * 255.0).roundToInt().toByte())
        }
        // The look shaders sample the picture: rgb colour with the depth in alpha (what the web build uploads as uImg)
        val n = w * h
        val tex = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder())
        for (i in 0 until n) {
            val c = px[i]
            tex.put(i * 4, r(c).toByte())
            tex.put(i * 4 + 1, g(c).toByte())
            tex.put(i * 4 + 2, b(c).toByte())
            tex.put(i * 4 + 3, (min(1f, max(0f, depth[i])) * 255f).roundToInt().toByte())
        }
        return Sample(buf, count, aspect.toFloat(), max(0.05, wt.activeCount.toDouble() / n).toFloat(), tex, w, h)
    }
}
