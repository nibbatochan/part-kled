package app.particledepth.wallpaper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Square command button, as .cmd in panel.css: 30 dp high, 1 px border, dim text that turns bright when active. */
@Composable
fun PdsButton(text: String, modifier: Modifier = Modifier, active: Boolean = false, height: Dp = 34.dp, onClick: () -> Unit) {
    Box(
        modifier
            .height(height) // the web studio's command button is 30 css px; 34 dp keeps a usable touch target on a phone
            .border(1.dp, if (active) Pds.LineStrong else Pds.Line)
            .background(if (active) Pds.InkFaint else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicText(text.uppercase(), style = if (active) Pds.LabelActive else Pds.Label)
    }
}

/**
 * Slider as .slider-group in panel.css: label, a 1 px track with an 8 x 14 square thumb, and the value on the right.
 * Dragging anywhere on the track sets the value; a tap jumps to it.
 */
@Composable
fun PdsSlider(label: String, value: Float, min: Float, max: Float, onChange: (Float) -> Unit, modifier: Modifier = Modifier, percent: Boolean = false) {
    var dragging by remember { mutableStateOf(false) }
    val frac = ((value - min) / (max - min)).coerceIn(0f, 1f)
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(118.dp)) { BasicText(label.uppercase(), style = if (dragging) Pds.LabelActive else Pds.Label) }
        Box(
            Modifier
                .weight(1f)
                .height(28.dp) // generous vertical touch area around a 14 dp thumb
                .pointerInput(min, max) {
                    detectTapGestures { o -> onChange(min + (max - min) * (o.x / size.width).coerceIn(0f, 1f)) }
                }
                .pointerInput(min, max) {
                    detectDragGestures(
                        onDragStart = { dragging = true },
                        onDragEnd = { dragging = false },
                        onDragCancel = { dragging = false },
                    ) { change, _ ->
                        change.consume()
                        onChange(min + (max - min) * (change.position.x / size.width).coerceIn(0f, 1f))
                    }
                }
                .drawBehind {
                    val cy = size.height / 2
                    drawLine(Pds.LineStrong, Offset(0f, cy), Offset(size.width, cy), strokeWidth = 1.dp.toPx())
                    val tw = 8.dp.toPx()
                    val th = 14.dp.toPx()
                    val x = (size.width - tw) * frac
                    drawRect(androidx.compose.ui.graphics.Color(0xFF050607), Offset(x - 1.dp.toPx(), cy - th / 2 - 1.dp.toPx()), Size(tw + 2.dp.toPx(), th + 2.dp.toPx()))
                    drawRect(if (dragging) Pds.Mark else Pds.Ink, Offset(x, cy - th / 2), Size(tw, th))
                },
        )
        Box(Modifier.width(40.dp), contentAlignment = Alignment.CenterEnd) {
            BasicText(formatValue(value, max - min, percent), style = Pds.Value)
        }
    }
}

/** As the web studio: a share shows as a percent, a wide range as a whole number, the rest with two decimals. */
private fun formatValue(v: Float, range: Float, percent: Boolean): String =
    if (percent) "${(v * 100).toInt()}%" else if (range >= 20f) v.toInt().toString() else "%.2f".format(v)

/** A hairline rule across the width. */
@Composable
fun Hairline(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Pds.Line))
}

/** Section title: tracked uppercase, with the rule below it. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp)) { BasicText(text.uppercase(), style = Pds.Label) }
    Hairline()
}

/** The faint 24 dp background grid the studio draws behind its panels. */
fun Modifier.pdsGrid(): Modifier = this.drawBehind {
    val step = Pds.GridStep.toPx()
    var x = 0f
    while (x < size.width) { drawLine(Pds.Grid, Offset(x, 0f), Offset(x, size.height), 1f); x += step }
    var y = 0f
    while (y < size.height) { drawLine(Pds.Grid, Offset(0f, y), Offset(size.width, y), 1f); y += step }
}

/** A labelled on/off row: the label on the left, a square ON / OFF button on the right. */
@Composable
fun PdsToggle(label: String, on: Boolean, modifier: Modifier = Modifier, onChange: (Boolean) -> Unit) {
    Row(modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { BasicText(label.uppercase(), style = if (on) Pds.LabelActive else Pds.Label) }
        PdsButton(if (on) "ON" else "OFF", active = on, height = 28.dp) { onChange(!on) }
    }
}
