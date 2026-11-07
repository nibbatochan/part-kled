package app.particledepth.wallpaper.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.particledepth.wallpaper.R

/**
 * The web studio's design system (src/ui/tokens.css, panel.css) as Compose values. Square corners everywhere, hairline
 * borders, tracked uppercase labels, Martian Mono for everything and Tektur for the logo only. Colour values are the
 * CSS custom properties verbatim.
 */
@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
object Pds {
    val Bg = Color(0xFF050607)
    val Panel = Color(0xFF0A0C0E)
    val Ink = Color(0xFFE9ECEE)
    val InkDim = Color(0xFFE9ECEE).copy(alpha = 0.52f)
    val InkFaint = Color(0xFFE9ECEE).copy(alpha = 0.18f)
    val Line = Color(0xFFE9ECEE).copy(alpha = 0.20f)
    val LineStrong = Color(0xFFE9ECEE).copy(alpha = 0.55f)
    val Grid = Color(0xFFE9ECEE).copy(alpha = 0.045f)
    val Mark = Color(0xFFC8FF4D) // the one green mark: the title square

    val GridStep = 24.dp
    val Gutter = 12.dp

    /** Martian Mono is a variable font (weight 100 to 800); pick weights through variation settings (API 26+). */
    private fun mono(weight: Int) = FontFamily(
        Font(R.font.martian_mono, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))
    )

    private val monoRegular = mono(400)
    private val monoMedium = mono(500)
    val Tektur = FontFamily(
        Font(R.font.tektur, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700)))
    )

    /** Labels: 10 px, 0.1em tracking, always uppercase (the caller uppercases the text). */
    val Label = TextStyle(fontFamily = monoRegular, fontSize = 10.sp, letterSpacing = 0.1.em, color = InkDim)
    val LabelActive = Label.copy(color = Ink)
    val Value = TextStyle(fontFamily = monoMedium, fontSize = 10.sp, letterSpacing = 0.1.em, color = Ink)
    val Title = TextStyle(fontFamily = Tektur, fontSize = 20.sp, letterSpacing = 0.12.em, color = Ink)
    val Heading = TextStyle(fontFamily = monoMedium, fontSize = 12.sp, letterSpacing = 0.12.em, color = Ink)
}
