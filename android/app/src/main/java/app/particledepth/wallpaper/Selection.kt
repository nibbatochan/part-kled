package app.particledepth.wallpaper

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.io.File

/**
 * What the wallpaper shows: a pack plus the user's changes to its numbers. Kept in SharedPreferences "pds"
 * (keys "pack" and "overrides"). The wallpaper service listens to these keys, so the running wallpaper updates the
 * moment the app writes them, and a restarted process reads them back: the choice survives process death and reboot.
 */
class Selection(ctx: Context) {
    val prefs: SharedPreferences = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    val packId: String get() = prefs.getString(KEY_PACK, SpikeConfig.PACK) ?: SpikeConfig.PACK
    val overrides: Map<String, Float> get() = decode(prefs.getString(KEY_OVERRIDES, null))

    /** Write both values in one edit, so a listener never sees a new pack with the old pack's overrides. */
    fun set(packId: String, overrides: Map<String, Float>) {
        prefs.edit().putString(KEY_PACK, packId).putString(KEY_OVERRIDES, encode(overrides)).apply()
    }

    fun setOverrides(overrides: Map<String, Float>) {
        prefs.edit().putString(KEY_OVERRIDES, encode(overrides)).apply()
    }

    companion object {
        const val NAME = "pds"
        const val KEY_PACK = "pack"
        const val KEY_OVERRIDES = "overrides"

        fun encode(m: Map<String, Float>): String = JSONObject().also { o -> for ((k, v) in m) o.put(k, v.toDouble()) }.toString()

        /** Tolerant on purpose: a damaged value gives an empty map, never a crash. Range clamping happens in withOverrides. */
        fun decode(s: String?): Map<String, Float> {
            if (s.isNullOrEmpty() || s.length > 16 * 1024) return emptyMap()
            return try {
                val o = JSONObject(s)
                val out = HashMap<String, Float>()
                val it = o.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    val v = o.opt(k)
                    if (v is Number) out[k] = v.toFloat()
                }
                out
            } catch (e: Exception) {
                emptyMap()
            }
        }
    }
}

/** A named wallpaper the user saved: a pack plus overrides. One small JSON file each in the app's private storage. */
class SavedWallpaper(val file: File, val name: String, val packId: String, val overrides: Map<String, Float>, val created: Long)

class SavedStore(ctx: Context) {
    private val dir = File(ctx.filesDir, "saved").apply { mkdirs() }

    fun list(): List<SavedWallpaper> =
        (dir.listFiles { f -> f.extension == "json" } ?: emptyArray()).mapNotNull { read(it) }.sortedByDescending { it.created }

    fun save(name: String, packId: String, overrides: Map<String, Float>): SavedWallpaper {
        val created = System.currentTimeMillis()
        val file = File(dir, "w$created.json")
        val clean = name.trim().take(40).ifEmpty { "UNTITLED" }
        val json = JSONObject().put("name", clean).put("pack", packId).put("created", created)
            .put("overrides", JSONObject(Selection.encode(overrides)))
        file.writeText(json.toString())
        return SavedWallpaper(file, clean, packId, overrides, created)
    }

    fun delete(w: SavedWallpaper) { w.file.delete() }

    /** Rewrite the file with a new name; returns the updated entry. */
    fun rename(w: SavedWallpaper, name: String): SavedWallpaper {
        val clean = name.trim().take(40).ifEmpty { w.name }
        val json = JSONObject().put("name", clean).put("pack", w.packId).put("created", w.created)
            .put("overrides", JSONObject(Selection.encode(w.overrides)))
        w.file.writeText(json.toString())
        return SavedWallpaper(w.file, clean, w.packId, w.overrides, w.created)
    }

    private fun read(f: File): SavedWallpaper? = try {
        if (f.length() > 32 * 1024) null else {
            val o = JSONObject(f.readText())
            SavedWallpaper(f, o.getString("name"), o.getString("pack"), Selection.decode(o.optJSONObject("overrides")?.toString()), o.optLong("created"))
        }
    } catch (e: Exception) {
        null // a damaged file is skipped, not fatal
    }
}
