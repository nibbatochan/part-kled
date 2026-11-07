package app.particledepth.wallpaper

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * A rough depth map for a photo, with no neural network: what is nearer is what stands out from the backdrop and sits
 * near the middle. APPROXIMATE, and meant to be: it gives the picture a gentle sense of depth for the tilt, nothing more.
 * The web studio's depth model is far better; an exported pack from the web studio carries that instead.
 *
 * Method: (1) a "subject" signal: the flat-background cut-out when the border is a flat colour, otherwise how far each
 * pixel's colour is from the colour of the picture's border; (2) blurred so depth varies smoothly, not pixel by pixel;
 * (3) blended with a soft centre weight, because the subject of a photo is usually near the middle; (4) stretched to 0..1.
 * Higher = nearer, the same direction as the web depth maps.
 */
object DepthGuess {
    fun estimate(px: IntArray, w: Int, h: Int): FloatArray {
        val n = w * h
        val subject = FloatArray(n)
        val cut = Sampler.removeFlatBackground(px, w, h)
        if (cut != null) {
            for (i in 0 until n) subject[i] = cut[i].toFloat()
        } else {
            // distance of each pixel's colour from the mean colour of the picture's border
            var mr = 0.0; var mg = 0.0; var mb = 0.0; var c = 0
            fun add(i: Int) { val p = px[i]; mr += (p shr 16) and 255; mg += (p shr 8) and 255; mb += p and 255; c++ }
            for (x in 0 until w) { add(x); add((h - 1) * w + x) }
            for (y in 0 until h) { add(y * w); add(y * w + w - 1) }
            mr /= c; mg /= c; mb /= c
            val maxD = sqrt(3.0) * 255
            for (i in 0 until n) {
                val p = px[i]
                subject[i] = (hypot(hypot(((p shr 16) and 255) - mr, ((p shr 8) and 255) - mg), (p and 255) - mb) / maxD).toFloat()
            }
        }
        val smooth = blur(blur(subject, w, h, max(2, max(w, h) / 28)), w, h, max(2, max(w, h) / 40))

        val d = FloatArray(n)
        val cx = (w - 1) / 2.0
        val cy = (h - 1) / 2.0
        for (y in 0 until h) for (x in 0 until w) {
            val r = min(1.0, hypot((x - cx) / (w / 2.0), (y - cy) / (h / 2.0)))
            val centre = (1.0 - r).pow(1.5)
            d[y * w + x] = (0.7 * smooth[y * w + x] + 0.3 * centre).toFloat()
        }
        // stretch to 0..1
        var lo = Float.MAX_VALUE; var hi = -Float.MAX_VALUE
        for (v in d) { if (v < lo) lo = v; if (v > hi) hi = v }
        val span = max(1e-4f, hi - lo)
        for (i in 0 until n) d[i] = (d[i] - lo) / span
        return d
    }

    /** Separable box blur with edge clamping, [r] pixels each way. */
    fun blur(src: FloatArray, w: Int, h: Int, r: Int): FloatArray {
        val tmp = FloatArray(src.size)
        val out = FloatArray(src.size)
        val k = 2 * r + 1
        for (y in 0 until h) {
            var acc = 0f
            for (i in -r..r) acc += src[y * w + i.coerceIn(0, w - 1)]
            for (x in 0 until w) {
                tmp[y * w + x] = acc / k
                acc += src[y * w + (x + r + 1).coerceIn(0, w - 1)] - src[y * w + (x - r).coerceIn(0, w - 1)]
            }
        }
        for (x in 0 until w) {
            var acc = 0f
            for (i in -r..r) acc += tmp[i.coerceIn(0, h - 1) * w + x]
            for (y in 0 until h) {
                out[y * w + x] = acc / k
                acc += tmp[(y + r + 1).coerceIn(0, h - 1) * w + x] - tmp[(y - r).coerceIn(0, h - 1) * w + x]
            }
        }
        return out
    }
}
