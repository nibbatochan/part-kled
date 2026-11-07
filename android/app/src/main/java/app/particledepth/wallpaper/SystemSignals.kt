package app.particledepth.wallpaper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Handler
import android.os.PowerManager

/**
 * Power-saver, battery level and thermal status -> QualityPolicy. Registered only while the wallpaper is visible, so a
 * hidden wallpaper has no listeners and wakes nothing. Callbacks arrive on the render thread's handler.
 * UNTESTED on a device: power-saver and thermal paths have not been triggered yet.
 */
class SystemSignals(private val context: Context, private val policy: QualityPolicy, private val handler: Handler) {
    private val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var registered = false
    private val settings = AppSettings(context)
    private val thermalListener = PowerManager.OnThermalStatusChangedListener { status -> policy.setThermal(status) }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) = refreshSaver()
    }

    fun start() {
        if (registered) return
        registered = true
        val f = IntentFilter().apply {
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            addAction(Intent.ACTION_BATTERY_LOW)
            addAction(Intent.ACTION_BATTERY_OKAY)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        context.registerReceiver(receiver, f, null, handler)
        pm.addThermalStatusListener({ r -> handler.post(r) }, thermalListener)
        refreshSaver()
        policy.setThermal(pm.currentThermalStatus)
    }

    fun stop() {
        if (!registered) return
        registered = false
        context.unregisterReceiver(receiver)
        pm.removeThermalStatusListener(thermalListener)
    }

    private fun refreshSaver() {
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val plugged = (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        val pct = if (level >= 0) level * 100 / scale else 100
        val low = pct <= LOW_BATTERY_PCT && !plugged
        when {
            !settings.saverRule -> policy.setSaver(false, "saver rule off in settings")
            pm.isPowerSaveMode -> policy.setSaver(true, "power saver on")
            low -> policy.setSaver(true, "battery $pct%")
            else -> policy.setSaver(false, "no power constraint")
        }
    }

    companion object {
        private const val LOW_BATTERY_PCT = 15
    }
}
