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
    Column(Modifier.padding(horizontal = Pds.Gutter, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(10.dp).background(Pds.Mark)) // the one green mark
            BasicText("PARTICLE DEPTH", style = Pds.Title)
        }
        Spacer(Modifier.height(4.dp))
        BasicText("BY SUMANTH REDDY", style = Pds.Label)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PdsButton("GALLERY", Modifier.weight(1f), active = screen !is Screen.Saved) { onTab(Screen.Gallery) }
            PdsButton("SAVED", Modifier.weight(1f), active = screen is Screen.Saved) { onTab(Screen.Saved) }
        }
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
                PdsButton("OPEN", Modifier.padding(end = 6.dp)) { onOpen(w) }
                PdsButton("DELETE", Modifier.padding(end = 6.dp)) { store.delete(w); items.remove(w) }
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

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Pds.Gutter)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PdsButton("BACK", onClick = onBack)
            BasicText(info.config.name.uppercase(), Modifier.weight(1f), style = Pds.Heading)
        }
        Spacer(Modifier.height(Pds.Gutter))
        Box(Modifier.fillMaxWidth().aspectRatio(9f / 16f).border(1.dp, Pds.Line).background(Pds.Panel), contentAlignment = Alignment.Center) {
            val l = loaded
            if (l == null) BasicText("LOADING", style = Pds.Label)
            else PreviewView(l, l.config.params.withOverrides(overrides.toMap()), Modifier.fillMaxSize())
        }
        SectionLabel("ADJUST")
        for (s in sliders) {
            PdsSlider(s.label, overrides[s.key] ?: info.config.params.n(s.key), s.min, s.max, { v -> overrides[s.key] = v })
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
