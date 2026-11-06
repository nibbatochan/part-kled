package app.particledepth.wallpaper

import android.app.Activity
import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Phase 1 launcher: one button that opens the system live-wallpaper preview for our service.
 * The real app (gallery, sliders, in-app preview) arrives in phase 3.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val label = TextView(this).apply {
            text = "Particle Depth: phase 1 spike\nTilt the phone after applying the wallpaper.\nStats are in logcat, tag PDS."
            gravity = Gravity.CENTER
            textSize = 16f
        }
        val button = Button(this).apply {
            text = "Set as wallpaper"
            setOnClickListener {
                startActivity(
                    Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER).putExtra(
                        WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                        ComponentName(this@MainActivity, ParticleWallpaperService::class.java)
                    )
                )
            }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            addView(label)
            addView(button)
            // One button per pack in assets/packs: a new effect is a new folder, not new code
            val prefs = getSharedPreferences("pds", MODE_PRIVATE)
            for (id in (assets.list("packs") ?: emptyArray()).sorted()) {
                addView(Button(this@MainActivity).apply {
                    text = "Use effect: $id"
                    setOnClickListener { prefs.edit().putString("pack", id).apply() }
                })
            }
        })
    }
}
