package app.particledepth.wallpaper.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** What the preview shows on top of the picture, to judge how the wallpaper sits behind real screen content. */
enum class OverlayMode(val label: String) { OFF("VIEW: OFF"), HOME("VIEW: HOME"), LOCK("VIEW: LOCK");
    fun next() = entries[(ordinal + 1) % entries.size]
}

/**
 * A stand-in for the phone's own screen: outlines only, no real icons or text from the user's phone. HOME shows a
 * status bar, a grid of app squares and a dock. LOCK shows the status bar, a large clock with the date and the two
 * corner shortcuts. Anything the picture's subject sits behind is visible at a glance.
 */
@Composable
fun PhoneOverlay(mode: OverlayMode, modifier: Modifier = Modifier) {
    if (mode == OverlayMode.OFF) return
    val line = Color.White.copy(alpha = 0.55f)
    Box(modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val stroke = Stroke(width = 1.dp.toPx())
            // status bar: time block on the left, three small marks on the right
            drawRect(line, Offset(w * 0.06f, h * 0.018f), Size(w * 0.14f, h * 0.012f), style = stroke)
            for (i in 0 until 3) drawRect(line, Offset(w * (0.70f + i * 0.09f), h * 0.018f), Size(w * 0.06f, h * 0.012f), style = stroke)
            if (mode == OverlayMode.HOME) {
                // 4 columns by 5 rows of app squares
                val side = w * 0.15f
                val gx = (w - side * 4) / 5f
                val top = h * 0.10f
                val gy = (h * 0.70f - top - side * 5) / 4f
                for (r in 0 until 5) for (c in 0 until 4) {
                    drawRoundRect(line, Offset(gx + c * (side + gx), top + r * (side + gy)), Size(side, side), CornerRadius(side * 0.22f), style = stroke)
                }
                // dock
                val dy = h - side - h * 0.035f
                for (c in 0 until 4) drawRoundRect(line, Offset(gx + c * (side + gx), dy), Size(side, side), CornerRadius(side * 0.22f), style = stroke)
            } else {
                // two corner shortcuts, as on the lock screen
                val s = w * 0.12f
                drawCircle(line, s / 2, Offset(w * 0.14f, h * 0.92f), style = stroke)
                drawCircle(line, s / 2, Offset(w * 0.86f, h * 0.92f), style = stroke)
            }
        }
        if (mode == OverlayMode.LOCK) {
            Column(Modifier.fillMaxWidth().align(Alignment.TopCenter).padding(top = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                BasicText("9:41", style = Pds.Title.copy(fontSize = 40.sp, color = line, textAlign = TextAlign.Center))
                BasicText("SAT, NOV 7", style = Pds.Label.copy(color = line))
            }
        }
    }
}
