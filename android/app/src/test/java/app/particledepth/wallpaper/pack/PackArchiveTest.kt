package app.particledepth.wallpaper.pack

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Attacks on the .pdspack importer's archive reader. Nothing here touches Android classes. */
class PackArchiveTest {
    private val sha = "a".repeat(64)
    private fun config(subject: String = "subject.png", depth: String = "depth.png") =
        """{"schema":"pds.effect/1","id":"mine","name":"Mine","assets":{"subject":{"file":"$subject","sha256":"$sha"},"depth":{"file":"$depth","sha256":"$sha"}},"params":{}}"""

    private fun zip(vararg entries: Pair<String, ByteArray>): ByteArrayInputStream {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z -> for ((n, b) in entries) { z.putNextEntry(ZipEntry(n)); z.write(b); z.closeEntry() } }
        return ByteArrayInputStream(out.toByteArray())
    }

    private fun rejects(input: ByteArrayInputStream, contains: String) {
        try {
            PackArchive.read(input)
            fail("expected a PackException containing \"$contains\"")
        } catch (e: PackException) {
            assertTrue("message was: ${e.message}", e.message!!.contains(contains))
        }
    }

    private val png = ByteArray(100) { it.toByte() }

    @Test fun aWellFormedArchiveIsRead() {
        val files = PackArchive.read(zip("pack.json" to config().toByteArray(), "subject.png" to png, "depth.png" to png))
        assertEquals(setOf("pack.json", "subject.png", "depth.png"), files.keys)
    }

    @Test fun theRealExportedPackZipsAndReads() {
        // build a zip from a built-in pack folder, the way the exporter's --zip does
        val dir = File("src/main/assets/packs/glass-green")
        val z = zip("pack.json" to File(dir, "pack.json").readBytes(), "subject.png" to File(dir, "subject.png").readBytes(), "depth.png" to File(dir, "depth.png").readBytes())
        assertEquals(3, PackArchive.read(z).size)
    }

    @Test fun pathsAreRefused() {
        rejects(zip("../evil.png" to png), "plain file name")
        rejects(zip("a/b.png" to png), "plain file name")
        rejects(zip("/etc/passwd" to png), "plain file name")
        rejects(zip("..\\evil.png" to png), "plain file name")
    }

    @Test fun foldersAreRefused() {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z -> z.putNextEntry(ZipEntry("sub/")); z.closeEntry() }
        rejects(ByteArrayInputStream(out.toByteArray()), "folder")
    }

    @Test fun extraFilesAreRefused() = rejects(
        zip("pack.json" to config().toByteArray(), "subject.png" to png, "depth.png" to png, "notes.txt" to png), "more than 3"
    )

    @Test fun filesTheConfigDoesNotNameAreRefused() = rejects(
        zip("pack.json" to config().toByteArray(), "subject.png" to png, "other.png" to png), "do not match"
    )

    @Test fun missingPackJsonIsRefused() = rejects(zip("subject.png" to png, "depth.png" to png), "no pack.json")

    @Test fun anImageBombIsStoppedAtTheCap() {
        // 8 MB of zeros compresses to a few KB; the reader must stop at 2 MB, not inflate it
        val bomb = ByteArray(8 * 1024 * 1024)
        rejects(zip("pack.json" to config().toByteArray(), "subject.png" to bomb, "depth.png" to png), "larger than")
    }

    @Test fun aHugeConfigIsRefused() = rejects(zip("pack.json" to ByteArray(PackConfigParser.MAX_CONFIG_BYTES + 10) { 'a'.code.toByte() }), "larger than")

    @Test fun totalSizeIsCapped() {
        // three entries each under their own cap but the sum past 5 MB cannot happen with 64 KB + 2 x 2 MB, so the total cap is a backstop
        assertTrue(PackConfigParser.MAX_CONFIG_BYTES + 2 * PackArchive.MAX_IMAGE_BYTES <= PackArchive.MAX_TOTAL_BYTES)
    }

    @Test fun aBrokenConfigInsideIsRefused() = rejects(
        zip("pack.json" to config().replace("pds.effect/1", "pds.effect/9").toByteArray(), "subject.png" to png, "depth.png" to png), "not supported"
    )

    @Test fun notAZipIsRefused() {
        try {
            PackArchive.read(ByteArrayInputStream("this is not a zip".toByteArray()))
            fail("expected a PackException")
        } catch (e: PackException) {
            assertTrue(e.message!!.contains("no pack.json") || e.message!!.contains("archive"))
        }
    }
}
