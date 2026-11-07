package app.particledepth.wallpaper

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DepthGuessTest {
    private val w = 96
    private val h = 128

    /** A bright disc on a flat grey backdrop, like a product or a head against a wall. */
    private fun flatBackdrop(): IntArray = IntArray(w * h) { i ->
        val x = i % w; val y = i / w
        val inside = Math.hypot((x - w / 2.0), (y - h / 2.0)) < 30
        if (inside) (255 shl 24) or (220 shl 16) or (90 shl 8) or 60 else (255 shl 24) or (128 shl 16) or (128 shl 8) or 128
    }

    /** A busy picture: the border is not one colour, so the cut-out path is skipped. */
    private fun busy(): IntArray = IntArray(w * h) { i ->
        val x = i % w; val y = i / w
        val inside = Math.hypot((x - w / 2.0), (y - h / 2.0)) < 28
        val n = ((x * 37 + y * 17 + x * y) and 63)
        if (inside) (255 shl 24) or (240 shl 16) or (200 shl 8) or 40 else (255 shl 24) or ((60 + n) shl 16) or ((70 + n) shl 8) or (90 + n)
    }

    @Test fun depthIsInsideZeroToOne() {
        for (img in listOf(flatBackdrop(), busy())) {
            val d = DepthGuess.estimate(img, w, h)
            assertEquals(w * h, d.size)
            assertTrue(d.all { it in 0f..1f })
            assertEquals(0f, d.min(), 1e-6f)
            assertEquals(1f, d.max(), 1e-6f)
        }
    }

    @Test fun theSubjectIsNearerThanTheBackdrop() {
        val d = DepthGuess.estimate(flatBackdrop(), w, h)
        val centre = d[(h / 2) * w + w / 2]
        val corner = d[2 * w + 2]
        assertTrue("centre $centre should be nearer than the corner $corner", centre > corner + 0.4f)
    }

    @Test fun aBusyPictureStillPutsTheMiddleForward() {
        val d = DepthGuess.estimate(busy(), w, h)
        assertTrue(d[(h / 2) * w + w / 2] > d[2 * w + 2])
    }

    @Test fun aFlatPictureDoesNotBlowUp() {
        // one colour everywhere: no NaN, no division by zero
        val d = DepthGuess.estimate(IntArray(w * h) { (255 shl 24) or 0x336699 }, w, h)
        assertTrue(d.none { it.isNaN() })
    }

    @Test fun blurKeepsTheAverage() {
        val src = FloatArray(w * h) { if (it % w < w / 2) 1f else 0f }
        val b = DepthGuess.blur(src, w, h, 5)
        assertEquals(src.average(), b.average(), 0.02)
    }
}
