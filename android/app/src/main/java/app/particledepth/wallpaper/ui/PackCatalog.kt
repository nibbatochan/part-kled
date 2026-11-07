package app.particledepth.wallpaper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import app.particledepth.wallpaper.pack.PackConfig
import app.particledepth.wallpaper.pack.PackConfigParser
import app.particledepth.wallpaper.pack.PackException
import app.particledepth.wallpaper.pack.PackParams
import app.particledepth.wallpaper.pack.PackSource
import app.particledepth.wallpaper.pack.PackSources
import app.particledepth.wallpaper.pack.ParamSpec

/** [thumb] starts as the source picture (or a cached render of the effect) and is replaced by the real render when ready. */
class PackInfo(val id: String, val config: PackConfig, initialThumb: ImageBitmap?, val builtIn: Boolean = true) {
    var thumb: ImageBitmap? by mutableStateOf(initialThumb)
}

/** A slider the customise screen shows: a pack number with its range and a short label. */
class SliderSpec(val key: String, val label: String, val min: Float, val max: Float, val percent: Boolean = false)

object PackCatalog {
    /** Every built-in pack, then the imported ones. A broken pack is skipped, never fatal. */
    fun list(ctx: Context): List<PackInfo> = PackSources.allIds(ctx).mapNotNull { id -> info(ctx, id) }

    fun info(ctx: Context, id: String): PackInfo? {
        val source = PackSources.find(ctx, id) ?: return null
        return try {
            val json = source.open("pack.json").use { it.readBytes().toString(Charsets.UTF_8) }
            val config = PackConfigParser.parse(json)
            val cached = try { ThumbMaker.cached(ctx, id)?.asImageBitmap() } catch (e: Exception) { null }
            PackInfo(id, config, cached ?: thumb(source, config.subject.file), source.builtIn)
        } catch (e: PackException) {
            null
        } catch (e: java.io.IOException) {
            null
        }
    }

    /** A small picture for the gallery card: decoded at 1/8 size so a card costs a few hundred KB. */
    private fun thumb(source: PackSource, file: String): ImageBitmap? = try {
        source.open(file).use { s ->
            BitmapFactory.decodeStream(s, null, BitmapFactory.Options().apply { inSampleSize = 8; inPreferredConfig = Bitmap.Config.RGB_565 })?.asImageBitmap()
        }
    } catch (e: Exception) {
        null
    }

    private fun web(key: String): SliderSpec {
        val w = WebLabels.sliders[key] ?: error("no web label for $key")
        return SliderSpec(key, w.label, w.min, w.max, w.percent)
    }

    /**
     * The first group, in the order of the web studio's panel and with its words: MOVEMENT, 3D DEPTH, SIDE BIAS, VARIETY,
     * PARTICLE COLOUR, PARTICLE SIZE, TRAIL BEND, TRAIL LENGTH, TRAILS. Then the hover turn and the picture's levels.
     */
    private val BASIC = listOf(
        web("drift"), web("depth"), web("lean"), web("randomness"), web("pSat"), web("trailSize"), web("trailAngle"),
        web("trailLength"), web("trailAmount"),
        SliderSpec("pan", "HOVER AMOUNT", 0f, 1f),
        SliderSpec("opacity", "OPACITY", 0f, 1f),
        SliderSpec("fx.saturation", "SATURATION", 0f, 2f),
        SliderSpec("fx.black", "SHADOWS", 0f, 0.5f),
        SliderSpec("fx.white", "HIGHLIGHTS", 0.5f, 1f),
    )

    /**
     * Basic sliders for every pack, then the sliders of each look the pack switches on (a flag "xyzOn" owns the numbers
     * whose names start with "xyz"). Ranges come from ParamSpec, so a slider cannot ask for a value the shader would not accept.
     */
    fun sliders(config: PackConfig): List<SliderSpec> = sliders(config.params)

    /** From the settings as they are now, so switching the look changes which look sliders show. */
    fun sliders(params: PackParams): List<SliderSpec> {
        val out = ArrayList(BASIC)
        for (flag in ParamSpec.flags) {
            if (flag.uniform == null || !params.on(flag.key)) continue
            val prefix = flag.key.removeSuffix("On")
            for (num in ParamSpec.numbers) {
                if (num.key.length > prefix.length && num.key.startsWith(prefix) && num.key[prefix.length].isUpperCase()) {
                    // the web studio's own name and range when it has one, else the setting's name
                    val w = WebLabels.sliders[num.key]
                    out.add(if (w != null) SliderSpec(num.key, w.label, w.min, w.max, w.percent)
                            else SliderSpec(num.key, num.key.substring(prefix.length), num.min, num.max))
                }
            }
        }
        return out
    }
}
