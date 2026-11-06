package app.particledepth.wallpaper

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Interleaved vertex buffer, 16 bytes per particle: f32 x, y, z then u8 r, g, b and gain/5. Same layout as src/lite/sample.ts. */
class Sample(
    val buffer: ByteBuffer, val count: Int, val aspect: Float, val subjectFraction: Float,
    /** The picture at working size for the look shaders: rgb colour, alpha = depth (what the web build uploads as uImg). */
    val tex: ByteBuffer, val texW: Int, val texH: Int,
)

/**
 * Picture + depth -> particles. PHASE 1 SIMPLIFICATION: weights are alpha and brightness only. The web sampler
 * (src/core/Sampler.ts computeImportanceWeights) also uses depth and edges; port it in phase 2 with golden tests.
 * Particles are written in a low-discrepancy shuffled order so any prefix is an even subset (lets us draw fewer later).
 */
object PackSampler {
    private const val MAX_SIDE = 768

    fun fromBitmaps(pic: Bitmap, depth: Bitmap, count: Int): Sample {
        val k = min(1f, MAX_SIDE.toFloat() / max(pic.width, pic.height))
        val w = max(2, (pic.width * k).roundToInt())
        val h = max(2, (pic.height * k).roundToInt())
        val picS = Bitmap.createScaledBitmap(pic, w, h, true)
        val depS = Bitmap.createScaledBitmap(depth, w, h, true)
        val rgba = IntArray(w * h).also { picS.getPixels(it, 0, w, 0, 0, w, h) }
        val dep = IntArray(w * h).also { depS.getPixels(it, 0, w, 0, 0, w, h) }
        return sample(rgba, dep, w, h, count)
    }

    private fun hash01(i: Int, salt: Int): Float {
        var h = i * 374761393 + salt * 668265263
        h = (h xor (h ushr 13)) * 1274126177
        h = h xor (h ushr 16)
        return (h ushr 8) / 16777216f
    }

    private fun gcd(a: Int, b: Int): Int {
        var x = a
        var y = b
        while (y != 0) { val t = x % y; x = y; y = t }
        return x
    }

    private fun sample(px: IntArray, dep: IntArray, w: Int, h: Int, count: Int): Sample {
        val n = w * h
        val weights = FloatArray(n)
        var active = 0
        for (i in 0 until n) {
            val c = px[i]
            val a = (c ushr 24) and 255
            if (a >= 16) {
                val luma = (0.299f * ((c shr 16) and 255) + 0.587f * ((c shr 8) and 255) + 0.114f * (c and 255)) / 255f
                weights[i] = 0.15f + luma
                active++
            }
        }
        if (active == 0) { weights.fill(1f); active = n }
        val cdf = DoubleArray(n)
        var acc = 0.0
        for (i in 0 until n) { acc += weights[i]; cdf[i] = acc }
        val total = acc
        val meanWeight = (total / max(1, active)).toFloat()
        val aspect = w.toFloat() / h

        var mul = ((count * 0.6180339887).toInt()) or 1
        while (gcd(mul, count) != 1) mul += 2

        val buf = ByteBuffer.allocateDirect(count * 16).order(ByteOrder.nativeOrder())
        fun bilinear(x0: Int, y0: Int, fx: Float, fy: Float, get: (Int) -> Float): Float {
            val a = get(y0 * w + x0)
            val b = get(y0 * w + x0 + 1)
            val c = get((y0 + 1) * w + x0)
            val d = get((y0 + 1) * w + x0 + 1)
            return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
        }
        for (i in 0 until count) {
            val j = ((i.toLong() * mul) % count).toInt()
            val u = (j + hash01(i, 1)) / count
            val target = u * total
            var lo = 0
            var hi = n - 1
            while (lo < hi) { val mid = (lo + hi) ushr 1; if (cdf[mid] < target) lo = mid + 1 else hi = mid }
            val p = lo
            val x = max(0f, min(w - 1.001f, (p % w) + hash01(i, 2)))
            val y = max(0f, min(h - 1.001f, (p / w) + hash01(i, 3)))
            val x0 = x.toInt()
            val y0 = y.toInt()
            val fx = x - x0
            val fy = y - y0
            val r = bilinear(x0, y0, fx, fy) { ((px[it] shr 16) and 255).toFloat() }
            val g = bilinear(x0, y0, fx, fy) { ((px[it] shr 8) and 255).toFloat() }
            val b = bilinear(x0, y0, fx, fy) { (px[it] and 255).toFloat() }
            val z = bilinear(x0, y0, fx, fy) { ((dep[it] shr 16) and 255) / 255f } // depth map is grey: read red

            val o = i * 16
            buf.putFloat(o, (x / w - 0.5f) * aspect)
            buf.putFloat(o + 4, 0.5f - y / h)
            buf.putFloat(o + 8, z - 0.5f)
            buf.put(o + 12, r.toInt().toByte())
            buf.put(o + 13, g.toInt().toByte())
            buf.put(o + 14, b.toInt().toByte())
            val gain = min(5f, max(0.2f, meanWeight / max(1e-4f, weights[p])))
            buf.put(o + 15, ((gain / 5f) * 255f).roundToInt().toByte())
        }
        val tex = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        for (i in 0 until n) {
            val c = px[i]
            tex.put(i * 4, ((c shr 16) and 255).toByte())
            tex.put(i * 4 + 1, ((c shr 8) and 255).toByte())
            tex.put(i * 4 + 2, (c and 255).toByte())
            tex.put(i * 4 + 3, ((dep[i] shr 16) and 255).toByte()) // depth in alpha, as the web build
        }
        return Sample(buf, count, aspect, max(0.05f, active.toFloat() / n), tex, w, h)
    }
}
