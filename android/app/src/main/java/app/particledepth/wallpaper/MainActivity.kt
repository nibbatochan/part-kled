package app.particledepth.wallpaper

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import app.particledepth.wallpaper.ui.PdsApp

/**
 * The app: gallery of effects, a customise screen with a live preview, saved wallpapers, and Apply.
 * Built from the web studio's design system (ui/Theme.kt).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Draw under the system bars; PdsApp pads for them. The bars are the studio's near-black with light icons.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        // Test hook, debug builds only: `am start -n .../.MainActivity --es pds_import <file in the app's files dir>` runs the
        // pack importer on that file and logs the result (tag PDS). The release build ignores the extra.
        val debuggable = applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
        intent.getStringExtra("pds_import")?.takeIf { debuggable }?.let { name ->
            Thread {
                val r = runCatching { java.io.File(filesDir, name).inputStream().use { app.particledepth.wallpaper.pack.PackImporter.import(this, it) } }
                android.util.Log.i("PDS", "import test: " + r.fold({ "OK id=$it" }, { "REFUSED ${it.message}" }))
            }.start()
        }
        intent.getStringExtra("pds_photo")?.takeIf { debuggable }?.let { name ->
            Thread {
                val r = runCatching { app.particledepth.wallpaper.pack.PhotoImporter.import(this, android.net.Uri.fromFile(java.io.File(filesDir, name))) }
                android.util.Log.i("PDS", "photo test: " + r.fold({ "OK id=$it" }, { "REFUSED ${it.message}" }))
            }.start()
        }
        setContent { PdsApp() }
    }
}
