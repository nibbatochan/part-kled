package app.particledepth.wallpaper.pack

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import app.particledepth.wallpaper.DepthGuess
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Turns a photo from the user's gallery into an effect. The photo is shrunk to at most 768 px on the long side
 * (the phone samples no more than that), a rough depth map is estimated on the phone (DepthGuess: approximate, no
 * neural network), and both are stored as an ordinary pack with the plain dots look, which the customise screen can
 * then restyle. Only pictures are accepted: ImageDecoder refuses a video or any other file, and the decode is sized
 * before it allocates, so a huge photo cannot exhaust memory. The result goes through the same install checks as an imported pack.
 */
object PhotoImporter {
    private const val MAX_SIDE = 768
    private const val MAX_FILE_BYTES = PackArchive.MAX_IMAGE_BYTES - 200 * 1024

    fun import(ctx: Context, uri: Uri): String {
        val bmp = try {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, uri)) { decoder, info, _ ->
                val k = min(1f, MAX_SIDE.toFloat() / max(info.size.width, info.size.height))
                decoder.setTargetSize(max(2, (info.size.width * k).roundToInt()), max(2, (info.size.height * k).roundToInt()))
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE // pixels we can read; the decoder also applies the photo's rotation
            }
        } catch (e: Exception) {
            throw PackException("that file is not a picture this app can read (photos only, not videos)")
        }
        val w = bmp.width
        val h = bmp.height
        val argb = IntArray(w * h).also { bmp.getPixels(it, 0, w, 0, 0, w, h) }
        val depth = DepthGuess.estimate(argb, w, h)

        val depthBmp = Bitmap.createBitmap(IntArray(w * h) { i ->
            val g = (depth[i] * 255f).roundToInt().coerceIn(0, 255)
            (255 shl 24) or (g shl 16) or (g shl 8) or g
        }, w, h, Bitmap.Config.ARGB_8888)

        var subjectBytes = png(bmp)
        var depthBytes = png(depthBmp)
        if (subjectBytes.size > MAX_FILE_BYTES || depthBytes.size > MAX_FILE_BYTES) {
            // a very detailed photo: shrink a little more rather than refuse it
            val k = 0.75f
            val sw = max(2, (w * k).roundToInt())
            val sh = max(2, (h * k).roundToInt())
            subjectBytes = png(Bitmap.createScaledBitmap(bmp, sw, sh, true))
            depthBytes = png(Bitmap.createScaledBitmap(depthBmp, sw, sh, true))
            if (subjectBytes.size > MAX_FILE_BYTES || depthBytes.size > MAX_FILE_BYTES) throw PackException("that photo is too detailed to store")
        }

        val id = "photo-${System.currentTimeMillis()}"
        val json = template(ctx).apply {
            put("id", id)
            put("name", "Photo " + SimpleDateFormat("dd MMM HH:mm", Locale.US).format(Date()))
            put("author", "")
            put("assets", JSONObject()
                .put("subject", JSONObject().put("file", "subject.png").put("sha256", sha(subjectBytes)).put("w", w).put("h", h))
                .put("depth", JSONObject().put("file", "depth.png").put("sha256", sha(depthBytes)).put("w", w).put("h", h)))
        }.toString(2)
        val config = PackConfigParser.parse(json)
        return PackImporter.install(ctx, config, mapOf("pack.json" to json.toByteArray(Charsets.UTF_8), "subject.png" to subjectBytes, "depth.png" to depthBytes))
    }

    /** The plain dots pack's settings, reused as the starting look for every photo. */
    private fun template(ctx: Context): JSONObject =
        JSONObject(ctx.assets.open("packs/spike/pack.json").use { it.readBytes().toString(Charsets.UTF_8) })

    private fun png(b: Bitmap): ByteArray = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()

    private fun sha(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
}
