package app.particledepth.wallpaper

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface

/**
 * Glyph atlas for the SHAKE-MASK and SOFTWORD looks. Port of src/lite/glyphs.ts: 16 columns by 4 rows of 16 x 32 px
 * glyphs, white on black. Rows 0 to 2 are tone ramps picked by measuring ink (thin to dense), row 3 holds the letters of
 * the word "shakemask". The shader reads the red channel. The font is the platform monospace, so the letter shapes differ
 * slightly from the browser's monospace; the layout and the ramp rule are the same.
 */
object GlyphAtlas {
    const val GLYPH_W = 16
    const val GLYPH_H = 32
    private const val CANDIDATES = " .'`,:;-_~=+*^!i1lrcvunxzjftLCJUYXZO0Q#MW&8%B@\$|/\\()[]{}<>?"
    private const val SHAKE_WORD = "shakemask"

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textSize = Math.round(GLYPH_H * 0.8f).toFloat()
        textAlign = Paint.Align.CENTER
        color = Color.WHITE
    }

    /** Text is centred on the glyph cell like the canvas's textBaseline "middle" (baseline moved by half the font height). */
    private fun draw(c: Canvas, ch: String, x: Int, y: Int) {
        val fm = paint.fontMetrics
        val cy = y + GLYPH_H / 2f + 1f
        c.drawText(ch, x + GLYPH_W / 2f, cy - (fm.ascent + fm.descent) / 2f, paint)
    }

    /** The characters of three ramps, thin to dense: 10 tones, 16 tones, and the three binary glyphs. */
    fun measureRamps(): List<List<String>> {
        val bmp = Bitmap.createBitmap(GLYPH_W, GLYPH_H, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val px = IntArray(GLYPH_W * GLYPH_H)
        val ink = LinkedHashMap<String, Double>()
        for (ch in CANDIDATES) {
            c.drawColor(Color.BLACK)
            draw(c, ch.toString(), 0, 0)
            bmp.getPixels(px, 0, GLYPH_W, 0, 0, GLYPH_W, GLYPH_H)
            var sum = 0.0
            for (p in px) sum += (p shr 16) and 255
            ink[ch.toString()] = sum / (GLYPH_W * GLYPH_H * 255)
        }
        bmp.recycle()
        val sorted = ink.entries.sortedBy { it.value }
        val lo = sorted.first().value
        val hi = sorted.last().value
        fun pick(n: Int): List<String> {
            val used = HashSet<String>()
            val out = ArrayList<String>()
            for (i in 0 until n) {
                val target = lo + (hi - lo) * i / maxOf(1, n - 1)
                var best = sorted.first().key
                var bestD = Double.POSITIVE_INFINITY
                for ((ch, v) in sorted) {
                    if (ch in used) continue
                    val d = Math.abs(v - target)
                    if (d < bestD) { bestD = d; best = ch }
                }
                used.add(best)
                out.add(best)
            }
            return out
        }
        val binary = listOf(" ", "1", "0").sortedBy { ink[it] ?: 0.0 }
        return listOf(pick(10), pick(16), binary)
    }

    /** The atlas bitmap: 256 x 128, white glyphs on black. The caller uploads it and recycles it. */
    fun build(): Bitmap {
        val ramps = measureRamps() + listOf(SHAKE_WORD.map { it.toString() })
        val bmp = Bitmap.createBitmap(GLYPH_W * 16, GLYPH_H * 4, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.BLACK)
        ramps.forEachIndexed { row, ramp -> ramp.forEachIndexed { i, ch -> draw(c, ch, i * GLYPH_W, row * GLYPH_H) } }
        return bmp
    }
}
