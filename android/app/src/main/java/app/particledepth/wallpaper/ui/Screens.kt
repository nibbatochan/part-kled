package app.particledepth.wallpaper.ui

import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.particledepth.wallpaper.AppSettings
import app.particledepth.wallpaper.ParticleWallpaperService
import app.particledepth.wallpaper.SavedStore
import app.particledepth.wallpaper.SavedWallpaper
import app.particledepth.wallpaper.Selection
import app.particledepth.wallpaper.pack.LoadedPack
import app.particledepth.wallpaper.pack.PackLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private sealed interface Screen {
    data object Gallery : Screen
    data object Saved : Screen
    data object Settings : Screen
    data class Customize(val packId: String, val start: Map<String, Float>) : Screen
}

/** App shell: title, two tabs, one screen at a time. Back from Customize returns to the gallery. */
@Composable
fun PdsApp() {
    val ctx = LocalContext.current
    var screen by remember { mutableStateOf<Screen>(Screen.Gallery) }
    val packs = remember { PackCatalog.list(ctx) }

    Column(Modifier.fillMaxSize().background(Pds.Bg).pdsGrid().systemBarsPadding()) {
        Header(screen, onTab = { screen = it })
        Hairline()
        when (val s = screen) {
            Screen.Gallery -> Gallery(packs) { screen = Screen.Customize(it.id, emptyMap()) }
            Screen.Saved -> SavedList(packs) { w -> screen = Screen.Customize(w.packId, w.overrides) }
            Screen.Settings -> SettingsScreen()
            is Screen.Customize -> {
                val info = packs.firstOrNull { it.id == s.packId }
                if (info == null) BasicText("PACK NOT FOUND", Modifier.padding(Pds.Gutter), style = Pds.Label)
                else Customize(info, s.start, onBack = { screen = Screen.Gallery })
            }
        }
    }
}

@Composable
private fun Header(screen: Screen, onTab: (Screen) -> Unit) {
    // One slim row: the mark and name on the left, the two tabs on the right (hidden while an effect is open)
    Row(Modifier.fillMaxWidth().padding(horizontal = Pds.Gutter, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).background(Pds.Mark)) // the one green mark
        Column(Modifier.padding(start = 8.dp).weight(1f)) {
            BasicText("PARTICLE DEPTH", style = Pds.Title.copy(fontSize = 15.sp))
            BasicText("BY SUMANTH REDDY", style = Pds.Label.copy(fontSize = 8.sp))
        }
        if (screen !is Screen.Customize) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                PdsButton("GALLERY", active = screen is Screen.Gallery, height = 28.dp) { onTab(Screen.Gallery) }
                PdsButton("SAVED", active = screen is Screen.Saved, height = 28.dp) { onTab(Screen.Saved) }
                PdsButton("SETTINGS", active = screen is Screen.Settings, height = 28.dp) { onTab(Screen.Settings) }
            }
        }
    }
}

@Composable
private fun SettingsScreen() {
    val ctx = LocalContext.current
    val settings = remember { AppSettings(ctx) }
    var gyroOn by remember { mutableStateOf(settings.gyroOn) }
    var range by remember { mutableStateOf(settings.gyroRange) }
    var fps by remember { mutableStateOf(settings.fpsCap) }
    var saver by remember { mutableStateOf(settings.saverRule) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Pds.Gutter)) {
        SectionLabel("MOTION")
        PdsToggle("GYRO TURN", gyroOn) { gyroOn = it; settings.gyroOn = it }
        PdsSlider("GYRO RANGE", range, AppSettings.RANGE_MIN, AppSettings.RANGE_MAX, { range = it; settings.gyroRange = it })
        BasicText("DEGREES OF PHONE ROTATION FOR THE FULL TURN. LOWER = MORE SENSITIVE.", style = Pds.Label.copy(fontSize = 8.sp))
        SectionLabel("BATTERY")
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { BasicText("FRAME RATE LIMIT", style = Pds.Label) }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                PdsButton("30", active = fps == 30, height = 28.dp) { fps = 30; settings.fpsCap = 30 }
                PdsButton("60", active = fps == 60, height = 28.dp) { fps = 60; settings.fpsCap = 60 }
            }
        }
        PdsToggle("DRAW LESS ON BATTERY SAVER", saver) { saver = it; settings.saverRule = it }
        BasicText("SAVER OR BATTERY BELOW 15% UNPLUGGED: NO TRAILS AND 30 FPS.", style = Pds.Label.copy(fontSize = 8.sp))
        Spacer(Modifier.height(Pds.Gutter))
        BasicText("CHANGES APPLY THE NEXT TIME THE WALLPAPER IS SHOWN.", style = Pds.Label)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun Gallery(packs: List<PackInfo>, onPick: (PackInfo) -> Unit) {
    if (packs.isEmpty()) {
        BasicText("NO EFFECTS FOUND", Modifier.padding(Pds.Gutter), style = Pds.Label)
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(Pds.Gutter),
        horizontalArrangement = Arrangement.spacedBy(Pds.Gutter),
        verticalArrangement = Arrangement.spacedBy(Pds.Gutter),
    ) {
        items(packs, key = { it.id }) { p ->
            Column(Modifier.clickable { onPick(p) }) {
                Box(Modifier.fillMaxWidth().aspectRatio(9f / 16f).border(1.dp, Pds.Line).background(Pds.Panel)) {
                    p.thumb?.let { Image(it, p.config.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                }
                Spacer(Modifier.height(6.dp))
                BasicText(p.config.name.uppercase(), style = Pds.LabelActive)
            }
        }
    }
}

@Composable
private fun SavedList(packs: List<PackInfo>, onOpen: (SavedWallpaper) -> Unit) {
    val ctx = LocalContext.current
    val store = remember { SavedStore(ctx) }
    val items = remember { mutableStateListOf<SavedWallpaper>().apply { addAll(store.list()) } }
    if (items.isEmpty()) {
        BasicText("NOTHING SAVED YET. OPEN AN EFFECT, ADJUST IT, TAP SAVE.", Modifier.padding(Pds.Gutter), style = Pds.Label)
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(Pds.Gutter), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(items, key = { it.file.name }) { w ->
            val pack = packs.firstOrNull { it.id == w.packId }
            Row(Modifier.fillMaxWidth().border(1.dp, Pds.Line), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(56.dp, 72.dp).background(Pds.Panel)) {
                    pack?.thumb?.let { Image(it, w.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                }
                Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                    BasicText(w.name.uppercase(), style = Pds.LabelActive)
                    BasicText((pack?.config?.name ?: w.packId).uppercase(), style = Pds.Label)
                }
                PdsButton("OPEN", Modifier.padding(end = 4.dp), height = 28.dp) { onOpen(w) }
                PdsButton("DELETE", Modifier.padding(end = 6.dp), height = 28.dp) { store.delete(w); items.remove(w) }
            }
        }
    }
}

@Composable
private fun Customize(info: PackInfo, start: Map<String, Float>, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val selection = remember { Selection(ctx) }
    val store = remember { SavedStore(ctx) }
    val sliders = remember(info) { PackCatalog.sliders(info.config) }
    val overrides = remember(info, start) { mutableStateMapOf<String, Float>().apply { putAll(start) } }
    var status by remember { mutableStateOf("") }

    // The preview loads the pack off the main thread with a smaller particle count: it only needs to look right
    val loaded by produceState<LoadedPack?>(null, info.id) {
        value = withContext(Dispatchers.Default) { runCatching { PackLoader.load(ctx, info.id, 60_000) }.getOrNull() }
    }

    // The preview stays pinned at the top; only the controls below it scroll, so the picture is always in view
    Column(Modifier.fillMaxSize().padding(horizontal = Pds.Gutter)) {
        Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PdsButton("BACK", height = 28.dp, onClick = onBack)
            BasicText(info.config.name.uppercase(), Modifier.weight(1f), style = Pds.Heading)
        }
        Box(Modifier.fillMaxWidth().weight(0.44f), contentAlignment = Alignment.Center) {
            Box(Modifier.fillMaxHeight().aspectRatio(9f / 16f).border(1.dp, Pds.Line).background(Pds.Panel), contentAlignment = Alignment.Center) {
                val l = loaded
                if (l == null) BasicText("LOADING", style = Pds.Label)
                else PreviewView(l, l.config.params.withOverrides(overrides.toMap()), Modifier.fillMaxSize())
            }
        }
        Column(Modifier.weight(0.56f).verticalScroll(rememberScrollState())) {
            SectionLabel("ADJUST")
            for (s in sliders) {
                PdsSlider(s.label, overrides[s.key] ?: info.config.params.value(s.key), s.min, s.max, { v -> overrides[s.key] = v }, percent = s.percent)
            }
            Spacer(Modifier.height(Pds.Gutter))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PdsButton("RESET", Modifier.weight(1f)) { overrides.clear(); status = "" }
                PdsButton("SAVE", Modifier.weight(1f)) {
                    val stamp = SimpleDateFormat("dd MMM HH:mm", Locale.US).format(Date())
                    store.save("${info.config.name} $stamp", info.id, overrides.toMap())
                    status = "SAVED"
                }
            }
            Spacer(Modifier.height(6.dp))
            PdsButton("APPLY AS WALLPAPER", Modifier.fillMaxWidth(), active = true) {
                selection.set(info.id, overrides.toMap())
                status = if (isOurWallpaperActive(ctx)) "UPDATED" else { openWallpaperPicker(ctx); "CONFIRM IN THE SYSTEM PREVIEW" }
            }
            if (status.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                BasicText(status, style = Pds.Label)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

private fun isOurWallpaperActive(ctx: Context): Boolean =
    WallpaperManager.getInstance(ctx).wallpaperInfo?.serviceName == ParticleWallpaperService::class.java.name

/** The system's live-wallpaper preview. Android asks the user to confirm; an app cannot set a live wallpaper silently. */
private fun openWallpaperPicker(ctx: Context) {
    ctx.startActivity(
        Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
            .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, ComponentName(ctx, ParticleWallpaperService::class.java))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
}
