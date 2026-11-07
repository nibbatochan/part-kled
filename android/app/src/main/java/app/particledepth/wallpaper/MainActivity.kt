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
        setContent { PdsApp() }
    }
}
