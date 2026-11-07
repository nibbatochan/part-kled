package app.particledepth.wallpaper.pack

import android.content.Context
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream

/** Where a pack's files come from: the app's assets (built in) or its private storage (imported by the user). */
interface PackSource {
    val id: String
    val builtIn: Boolean
    fun open(name: String): InputStream
}

class AssetPackSource(private val ctx: Context, override val id: String) : PackSource {
    override val builtIn = true
    override fun open(name: String): InputStream = ctx.assets.open("packs/$id/$name")
}

class DirPackSource(private val dir: File, override val id: String) : PackSource {
    override val builtIn = false
    override fun open(name: String): InputStream {
        // names come from a validated config (plain file names), but never trust that here: stay inside the folder
        val f = File(dir, name)
        if (f.canonicalFile.parentFile != dir.canonicalFile) throw IOException("file name escapes the pack folder")
        return FileInputStream(f)
    }
}

object PackSources {
    const val MAX_USER_PACKS = 30
    private val ID = Regex("^[a-z0-9][a-z0-9-]{0,63}$")

    fun userRoot(ctx: Context): File = File(ctx.filesDir, "packs").apply { mkdirs() }

    fun builtInIds(ctx: Context): List<String> = (ctx.assets.list("packs") ?: emptyArray()).sorted()

    fun userIds(ctx: Context): List<String> =
        (userRoot(ctx).listFiles { f -> f.isDirectory && ID.matches(f.name) && File(f, "pack.json").isFile } ?: emptyArray())
            .map { it.name }.sorted()

    /** Built-in packs first, then the user's. A user pack can never shadow a built-in one (the importer refuses that id). */
    fun allIds(ctx: Context): List<String> = builtInIds(ctx) + userIds(ctx).filter { it !in builtInIds(ctx) }

    fun find(ctx: Context, id: String): PackSource? {
        if (!ID.matches(id)) return null
        if (id in builtInIds(ctx)) return AssetPackSource(ctx, id)
        val dir = File(userRoot(ctx), id)
        return if (File(dir, "pack.json").isFile) DirPackSource(dir, id) else null
    }

    /** Remove an imported pack. Built-in packs cannot be removed. */
    fun deleteUser(ctx: Context, id: String): Boolean {
        if (!ID.matches(id) || id in builtInIds(ctx)) return false
        return File(userRoot(ctx), id).deleteRecursively()
    }
}
