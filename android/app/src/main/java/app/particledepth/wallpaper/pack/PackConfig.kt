package app.particledepth.wallpaper.pack

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** A pack that cannot be used. The caller keeps showing the previous wallpaper. */
class PackException(message: String) : Exception(message)

class AssetRef(val file: String, val sha256: String, val width: Int?, val height: Int?)

/** Validated settings. Every value is inside its range; missing values hold the default. */
class PackParams(val num: Map<String, Float>, val flags: Map<String, Boolean>, val light: FloatArray?) {
    fun n(key: String): Float = num[key] ?: ParamSpec.num(key)?.def ?: error("unknown number $key")
    fun on(key: String): Boolean = flags[key] ?: ParamSpec.flag(key)?.def ?: error("unknown flag $key")
    fun fx(key: String): Float = num["fx.$key"] ?: ParamSpec.fx.first { it.key == key }.def
    fun emit(key: String): Float = num["emit.$key"] ?: ParamSpec.emit.first { it.key == key }.def

    /** Any slider key: a top-level number, or "fx.name" / "emit.name" for the nested groups. */
    fun value(key: String): Float = when {
        key.startsWith("fx.") -> fx(key.substring(3))
        key.startsWith("emit.") -> emit(key.substring(5))
        else -> n(key)
    }

    /**
     * A copy with the user's changes on top. Unknown keys are dropped and numbers are clamped to their range, the same
     * rule as the pack file, so a stored or hostile override cannot push a value outside what the shader expects.
     */
    fun withOverrides(over: Map<String, Float>, overFlags: Map<String, Boolean> = emptyMap()): PackParams {
        if (over.isEmpty() && overFlags.isEmpty()) return this
        val n = HashMap(num)
        for ((k, v) in over) {
            val spec = when {
                k.startsWith("fx.") -> ParamSpec.fx.firstOrNull { it.key == k.substring(3) }
                k.startsWith("emit.") -> ParamSpec.emit.firstOrNull { it.key == k.substring(5) }
                else -> ParamSpec.num(k)
            } ?: continue
            if (v.isNaN() || v.isInfinite()) continue
            n[k] = v.coerceIn(spec.min, spec.max)
        }
        val f = HashMap(flags)
        for ((k, v) in overFlags) if (ParamSpec.flag(k) != null) f[k] = v
        return PackParams(n, f, light)
    }
}

class PackConfig(
    val id: String,
    val name: String,
    val author: String,
    val subject: AssetRef,
    val depth: AssetRef,
    /** Ceiling on the particle count the pack asks for; the device tier may use fewer. Null = no preference. */
    val pointCeiling: Int?,
    val params: PackParams,
    /** Everything that was clamped, ignored or unsupported. Shown in a debug log, never fatal. */
    val warnings: List<String>,
)

/**
 * Pack config, schema "pds.effect/1". Parsing rules (docs/PACK_FORMAT.md):
 *  - unknown major version, or minEngine above ENGINE_VERSION: refuse;
 *  - a number out of range is clamped and reported; a wrong type falls back to the default and is reported;
 *  - an unknown key is ignored and reported; a key this build cannot draw yet is ignored and reported;
 *  - hard limits on size, nesting and string length, so a hostile pack cannot exhaust memory or smuggle a path.
 * No value from the config is ever placed in shader source: values only reach the GPU as uniforms.
 */
object PackConfigParser {
    const val ENGINE_VERSION = 1
    const val MAX_CONFIG_BYTES = 64 * 1024
    private const val MAX_DEPTH = 4
    private const val MAX_STRING = 256
    private val ID = Regex("^[a-z0-9][a-z0-9-]{0,63}$")
    private val FILE = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
    private val SHA = Regex("^[0-9a-f]{64}$")

    fun parse(text: String): PackConfig {
        if (text.toByteArray().size > MAX_CONFIG_BYTES) throw PackException("config larger than $MAX_CONFIG_BYTES bytes")
        val root = try { JSONObject(text) } catch (e: JSONException) { throw PackException("not valid JSON: ${e.message}") }
        checkDepth(root, 1)
        val warnings = ArrayList<String>()

        val schema = str(root, "schema", required = true)
        val m = Regex("^pds\\.effect/(\\d+)$").matchEntire(schema) ?: throw PackException("unknown schema \"$schema\"")
        if (m.groupValues[1].toInt() != 1) throw PackException("schema major ${m.groupValues[1]} is not supported (this app reads 1)")
        val minEngine = root.optInt("minEngine", 1)
        if (minEngine > ENGINE_VERSION) throw PackException("pack needs engine $minEngine, this app has $ENGINE_VERSION: update the app")

        val id = str(root, "id", required = true)
        if (!ID.matches(id)) throw PackException("bad id \"$id\"")
        val name = str(root, "name", required = false).ifEmpty { id }
        val author = str(root, "author", required = false)

        val assets = root.optJSONObject("assets") ?: throw PackException("missing assets")
        val subject = asset(assets, "subject")
        val depth = asset(assets, "depth")

        val paramsJson = root.optJSONObject("params") ?: throw PackException("missing params")
        val params = parseParams(paramsJson, warnings)

        val ceiling = root.optJSONObject("mobile")?.optInt("pointCount", 0)?.takeIf { it > 0 }?.coerceIn(1_000, 1_000_000)
        return PackConfig(id, name, author, subject, depth, ceiling, params, warnings)
    }

    private fun parseParams(o: JSONObject, w: MutableList<String>): PackParams {
        val num = HashMap<String, Float>()
        val flags = HashMap<String, Boolean>()
        var light: FloatArray? = null
        val keys = o.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val v = o.get(k)
            when {
                k == "fx" -> group(v, "fx", ParamSpec.fx, num, w)
                k == "emit" -> group(v, "emit", ParamSpec.emit, num, w)
                k == "light" -> light = parseLight(v, w)
                ParamSpec.num(k) != null -> readNumber(ParamSpec.num(k)!!, k, v, num, w)
                ParamSpec.flag(k) != null -> {
                    if (v is Boolean) flags[k] = v else w.add("$k: expected true or false, using default")
                }
                k in ParamSpec.unsupported -> w.add("$k: not drawn by this app version yet, ignored")
                else -> w.add("$k: unknown setting, ignored")
            }
        }
        // style above 0 is a cell look (HALFTONE, MOSAIC, ...): not drawn yet, so fall back to the dots
        if ((num["style"] ?: 0f) > 0f) {
            w.add("style ${num["style"]!!.toInt()}: cell looks are not drawn by this app version yet, using the dots look")
            num["style"] = 0f
        }
        return PackParams(num, flags, light)
    }

    private fun readNumber(spec: ParamSpec.Num, key: String, v: Any, out: MutableMap<String, Float>, w: MutableList<String>) {
        if (v !is Number) { w.add("$key: expected a number, using default"); return }
        val d = v.toDouble()
        if (d.isNaN() || d.isInfinite()) { w.add("$key: not a finite number, using default"); return }
        val f = d.toFloat()
        val c = f.coerceIn(spec.min, spec.max)
        if (c != f) w.add("$key: $f is outside ${spec.min}..${spec.max}, clamped to $c")
        out[key] = c
    }

    private fun group(v: Any, name: String, spec: List<ParamSpec.Num>, out: MutableMap<String, Float>, w: MutableList<String>) {
        if (v !is JSONObject) { w.add("$name: expected an object, using defaults"); return }
        val byKey = spec.associateBy { it.key }
        val keys = v.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val s = byKey[k]
            if (s == null) { w.add("$name.$k: unknown setting, ignored"); continue }
            val tmp = HashMap<String, Float>()
            readNumber(s, "$name.$k", v.get(k), tmp, w)
            tmp["$name.$k"]?.let { out["$name.$k"] = it }
        }
    }

    private fun parseLight(v: Any, w: MutableList<String>): FloatArray? {
        if (v == JSONObject.NULL) return null
        if (v !is JSONArray || v.length() != 3) { w.add("light: expected null or [r, g, b], using none"); return null }
        val a = FloatArray(3)
        for (i in 0 until 3) {
            val x = v.opt(i)
            if (x !is Number) { w.add("light: expected numbers, using none"); return null }
            a[i] = x.toFloat().coerceIn(0f, 1f)
        }
        return a
    }

    private fun asset(assets: JSONObject, key: String): AssetRef {
        val o = assets.optJSONObject(key) ?: throw PackException("missing assets.$key")
        val file = str(o, "file", required = true)
        if (!FILE.matches(file)) throw PackException("assets.$key.file \"$file\" is not a plain file name")
        val sha = str(o, "sha256", required = true).lowercase()
        if (!SHA.matches(sha)) throw PackException("assets.$key.sha256 is not 64 hex characters")
        val w = o.optInt("w", 0).takeIf { it in 1..MAX_IMAGE_SIDE }
        val h = o.optInt("h", 0).takeIf { it in 1..MAX_IMAGE_SIDE }
        return AssetRef(file, sha, w, h)
    }

    private fun str(o: JSONObject, key: String, required: Boolean): String {
        if (!o.has(key)) { if (required) throw PackException("missing $key"); return "" }
        val v = o.get(key)
        if (v !is String) throw PackException("$key must be a string")
        if (v.length > MAX_STRING) throw PackException("$key is longer than $MAX_STRING characters")
        return v
    }

    private fun checkDepth(v: Any?, depth: Int) {
        if (depth > MAX_DEPTH) throw PackException("JSON nested deeper than $MAX_DEPTH levels")
        when (v) {
            is JSONObject -> { val it = v.keys(); while (it.hasNext()) checkDepth(v.get(it.next()), depth + 1) }
            is JSONArray -> for (i in 0 until v.length()) checkDepth(v.get(i), depth + 1)
        }
    }

    /** Largest picture side a pack may declare; the loader also caps the decoded size. */
    const val MAX_IMAGE_SIDE = 4096
}
