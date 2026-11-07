package app.particledepth.wallpaper.pack

import android.content.Context
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.UUID
import java.util.zip.ZipInputStream

/**
 * Reads a ".pdspack" (a zip with pack.json and the two pictures it names) and checks the archive itself, before any
 * file touches disk. Plain JVM code so the tests can attack it: oversized entries, a zip bomb, paths, extra files.
 * Rules: at most 3 entries, each a plain file name; pack.json at most 64 KB; each picture at most 2 MB; at most
 * 5 MB read in total whatever the archive claims; the entries must be exactly pack.json plus the two files the config names.
 */
object PackArchive {
    const val MAX_ENTRIES = 3
    const val MAX_TOTAL_BYTES = 5 * 1024 * 1024
    const val MAX_IMAGE_BYTES = 2 * 1024 * 1024
    private val NAME = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

    /** Returns file name -> bytes, or throws PackException. Never writes anything. */
    fun read(input: InputStream): Map<String, ByteArray> {
        val out = LinkedHashMap<String, ByteArray>()
        var total = 0
        ZipInputStream(input).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                if (e.isDirectory) throw PackException("archive has a folder (${e.name}); packs are flat")
                if (!NAME.matches(e.name)) throw PackException("archive entry \"${e.name}\" is not a plain file name")
                if (out.size >= MAX_ENTRIES) throw PackException("archive has more than $MAX_ENTRIES files")
                if (e.name in out) throw PackException("archive repeats ${e.name}")
                val limit = if (e.name == "pack.json") PackConfigParser.MAX_CONFIG_BYTES else MAX_IMAGE_BYTES
                val buf = ByteArrayOutputStream()
                val chunk = ByteArray(8192)
                var n: Int
                // read in chunks and stop at the limit: a small archive that expands to gigabytes never gets past the cap
                while (zip.read(chunk).also { n = it } > 0) {
                    buf.write(chunk, 0, n)
                    total += n
                    if (buf.size() > limit) throw PackException("${e.name} is larger than $limit bytes")
                    if (total > MAX_TOTAL_BYTES) throw PackException("archive expands past $MAX_TOTAL_BYTES bytes")
                }
                out[e.name] = buf.toByteArray()
            }
        }
        val json = out["pack.json"] ?: throw PackException("archive has no pack.json")
        val config = PackConfigParser.parse(String(json, Charsets.UTF_8))
        val expected = setOf("pack.json", config.subject.file, config.depth.file)
        if (out.keys != expected) throw PackException("archive files ${out.keys} do not match the config $expected")
        return out
    }
}

object PackImporter {
    /**
     * Import one pack. The archive is checked ([PackArchive]), written to a temporary folder, loaded exactly as a normal
     * pack would be (hashes, pixel count, decode), and only then moved into place. On any failure nothing is left behind.
     * Returns the pack id. Refuses an id that belongs to a built-in pack, and more than [PackSources.MAX_USER_PACKS] packs.
     */
    fun import(ctx: Context, input: InputStream): String {
        val files = PackArchive.read(input)
        val config = PackConfigParser.parse(String(files.getValue("pack.json"), Charsets.UTF_8))
        return install(ctx, config, files)
    }

    /**
     * Store a pack that has already passed the archive or photo checks: write to a temporary folder, load it exactly as a
     * normal pack would be (hashes, pixel count, decode), and only then move it into place.
     */
    fun install(ctx: Context, config: PackConfig, files: Map<String, ByteArray>): String {
        if (config.id in PackSources.builtInIds(ctx)) throw PackException("\"${config.id}\" is the id of a built-in effect; change the id and export again")
        val existing = PackSources.userIds(ctx)
        if (config.id !in existing && existing.size >= PackSources.MAX_USER_PACKS) throw PackException("too many imported effects (limit ${PackSources.MAX_USER_PACKS}); delete one first")

        val tmpRoot = File(ctx.filesDir, "packs-tmp").apply { mkdirs() }
        val tmp = File(tmpRoot, UUID.randomUUID().toString()).apply { mkdirs() }
        try {
            for ((name, bytes) in files) File(tmp, name).writeBytes(bytes)
            PackLoader.load(DirPackSource(tmp, config.id), 2_000) // throws PackException on a bad picture or hash
            val dest = File(PackSources.userRoot(ctx), config.id)
            dest.deleteRecursively()
            if (!tmp.renameTo(dest)) throw PackException("could not store the effect")
            return config.id
        } finally {
            tmp.deleteRecursively()
        }
    }
}
