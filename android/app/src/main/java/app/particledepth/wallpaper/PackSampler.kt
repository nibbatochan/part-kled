package app.particledepth.wallpaper

import android.graphics.Bitmap
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Interleaved vertex buffer, 16 bytes per particle: f32 x, y, z then u8 r, g, b and gain/5. Same layout as src/lite/sample.ts. */
class Sample(
    val buffer: ByteBuffer, val count: Int, val aspect: Float, val subjectFraction: Float,
    /** The picture at working size for the look shaders: rgb colour, alpha = depth (what the web build uploads as uImg). */
    val tex: ByteBuffer, val texW: Int, val texH: Int,
)

/** Pictures in, particles out. The sampling itself is [Sampler], a port of the web sampler. */
object PackSampler {
    /** The web build samples at most this many pixels on the long side (sample.ts MAX_SIDE). */
    private const val MAX_SIDE = 768

    fun fromBitmaps(pic: Bitmap, depth: Bitmap, count: Int): Sample {
        val k = min(1f, MAX_SIDE.toFloat() / max(pic.width, pic.height))
        val w = max(2, (pic.width * k).roundToInt())
        val h = max(2, (pic.height * k).roundToInt())
        val picS = Bitmap.createScaledBitmap(pic, w, h, true)
        val depS = Bitmap.createScaledBitmap(depth, w, h, true)
        val argb = IntArray(w * h).also { picS.getPixels(it, 0, w, 0, 0, w, h) }
        val dep = IntArray(w * h).also { depS.getPixels(it, 0, w, 0, 0, w, h) }
        // The depth map is grey: read red, 0..1
        val d = FloatArray(w * h) { ((dep[it] shr 16) and 255) / 255f }
        return Sampler.particles(argb, d, w, h, count)
    }
}
