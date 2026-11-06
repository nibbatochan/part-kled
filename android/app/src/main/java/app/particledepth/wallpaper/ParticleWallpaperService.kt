package app.particledepth.wallpaper

import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder

/**
 * The live wallpaper. All drawing happens on [RenderThread]; this class only forwards the Engine lifecycle.
 * Visibility drives everything: not visible means no frames, no sensor, no timers.
 */
class ParticleWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = ParticleEngine()

    inner class ParticleEngine : Engine() {
        private var render: RenderThread? = null

        override fun onCreate(surfaceHolder: SurfaceHolder) {
            super.onCreate(surfaceHolder)
            render = RenderThread(applicationContext)
        }

        override fun onSurfaceCreated(holder: SurfaceHolder) {
            super.onSurfaceCreated(holder)
            render?.surfaceCreated(holder.surface, resources.displayMetrics.density)
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            super.onSurfaceChanged(holder, format, width, height)
            // setFixedSize() throws in a wallpaper ("only support sizing from layout", seen on a realme X2, Android 11),
            // so lower resolution has to come from an offscreen target in phase 2, not from the surface.
            render?.surfaceChanged(width, height)
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            render?.surfaceDestroyed()
            super.onSurfaceDestroyed(holder)
        }

        override fun onVisibilityChanged(visible: Boolean) {
            super.onVisibilityChanged(visible)
            render?.setVisible(visible)
        }

        override fun onDestroy() {
            render?.quit()
            render = null
            super.onDestroy()
        }
    }
}
