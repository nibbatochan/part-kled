package app.particledepth.wallpaper.pack

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import app.particledepth.wallpaper.PackSampler
import app.particledepth.wallpaper.Sample
import java.security.MessageDigest

class LoadedPack(val config: PackConfig, val sample: Sample)

/**
 * Reads a pack through a [PackSource] (the app's assets or its private storage): pack.json plus the two images it names.
 * Checks, in order: config size and schema (PackConfigParser), each file's size and sha256, the decoded pixel count.
 * Any failure throws PackException before anything is drawn, so the caller keeps the previous wallpaper.
 * Built-in and imported packs go through the same checks.
 */
object PackLoader {
    private const val TAG = "PDS"
    private const val MAX_IMAGE_BYTES = 2 * 1024 * 1024
    private const val MAX_PIXELS = 2048L * 2048L

    fun load(ctx: Context, packId: String, particleCount: Int): LoadedPack =
        load(PackSources.find(ctx, packId) ?: throw PackException("no effect named \"$packId\""), particleCount)

    fun load(source: PackSource, particleCount: Int): LoadedPack {
        val json = try {
            source.open("pack.json").use { s ->
                val b = readLimited(s, PackConfigParser.MAX_CONFIG_BYTES + 1)
                if (b.size > PackConfigParser.MAX_CONFIG_BYTES) throw PackException("pack.json larger than ${PackConfigParser.MAX_CONFIG_BYTES} bytes")
                String(b, Charsets.UTF_8)
            }
        } catch (e: java.io.IOException) {
            throw PackException("cannot read pack.json of ${source.id}: ${e.message}")
        }
        val config = PackConfigParser.parse(json)
        if (config.id != source.id) throw PackException("pack.json says \"${config.id}\" but the folder is \"${source.id}\"")
        for (w in config.warnings) Log.w(TAG, "pack ${config.id}: $w")
        val ceiling = config.pointCeiling
        val count = if (ceiling != null) minOf(ceiling, particleCount) else particleCount

        val subject = decode(source, config.subject, "subject")
        val depth = decode(source, config.depth, "depth")
        return LoadedPack(config, PackSampler.fromBitmaps(subject, depth, count))
    }

    /** Reads at most [limit] bytes (InputStream.readNBytes needs API 33; minSdk is 29). */
    private fun readLimited(s: java.io.InputStream, limit: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(8192)
        var total = 0
        while (total < limit) {
            val n = s.read(buf, 0, minOf(buf.size, limit - total))
            if (n < 0) break
            out.write(buf, 0, n)
            total += n
        }
        return out.toByteArray()
    }

    private fun decode(source: PackSource, ref: AssetRef, what: String): Bitmap {
        val bytes = try {
            source.open(ref.file).use { readLimited(it, MAX_IMAGE_BYTES + 1) }
        } catch (e: java.io.IOException) {
            throw PackException("cannot read $what image ${ref.file}: ${e.message}")
        }
        if (bytes.size > MAX_IMAGE_BYTES) throw PackException("$what image is larger than $MAX_IMAGE_BYTES bytes")
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        if (hash != ref.sha256) throw PackException("$what image hash does not match the config (file changed or corrupted)")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw PackException("$what image is not a readable picture")
        if (bounds.outWidth.toLong() * bounds.outHeight > MAX_PIXELS) throw PackException("$what image has more than $MAX_PIXELS pixels")
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: throw PackException("$what image could not be decoded")
    }
}
