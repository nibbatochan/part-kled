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
class SliderSpec(val key: String, val label: String, val min: Float, val max: Float, val def: Float)

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

    private val BASIC = listOf(
        SliderSpec("drift", "FLOW", 0f, 1f, 0f), SliderSpec("depth", "RELIEF", 0f, 1f, 0.5f), SliderSpec("pan", "TILT", 0f, 1f, 0.5f),
        SliderSpec("trailAmount", "TRAILS", 0f, 2f, 0.35f), SliderSpec("brightness", "LIGHT", 0f, 3f, 1.15f), SliderSpec("pSat", "COLOUR", 0f, 3f, 1.2f),
    ).map { b -> ParamSpec.num(b.key)!!.let { SliderSpec(b.key, b.label, it.min, it.max, it.def) } }

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
                    out.add(SliderSpec(num.key, num.key.substring(prefix.length), num.min, num.max, num.def))
                }
            }
        }
        return out
    }
}
