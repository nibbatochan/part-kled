package app.particledepth.wallpaper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import app.particledepth.wallpaper.pack.PackConfig
import app.particledepth.wallpaper.pack.PackConfigParser
import app.particledepth.wallpaper.pack.PackException
import app.particledepth.wallpaper.pack.ParamSpec

class PackInfo(val id: String, val config: PackConfig, val thumb: ImageBitmap?)

/** A slider the customise screen shows: a pack number with its range and a short label. */
class SliderSpec(val key: String, val label: String, val min: Float, val max: Float, val percent: Boolean = false)

object PackCatalog {
    /** Every folder under assets/packs with a readable pack.json. A broken pack is skipped, never fatal. */
    fun list(ctx: Context): List<PackInfo> = (ctx.assets.list("packs") ?: emptyArray()).sorted().mapNotNull { id ->
        try {
            val json = ctx.assets.open("packs/$id/pack.json").use { it.readBytes().toString(Charsets.UTF_8) }
            val config = PackConfigParser.parse(json)
            PackInfo(id, config, thumb(ctx, id, config.subject.file))
        } catch (e: PackException) {
            null
        } catch (e: java.io.IOException) {
            null
        }
    }

    /** A small picture for the gallery card: decoded at 1/8 size so a card costs a few hundred KB. */
    private fun thumb(ctx: Context, id: String, file: String): ImageBitmap? = try {
        ctx.assets.open("packs/$id/$file").use { s ->
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
    fun sliders(config: PackConfig): List<SliderSpec> {
        val out = ArrayList(BASIC)
        for (flag in ParamSpec.flags) {
            if (flag.uniform == null || !config.params.on(flag.key)) continue
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
