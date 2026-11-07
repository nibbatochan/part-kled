package app.particledepth.wallpaper.ui

import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.toMutableStateList
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.particledepth.wallpaper.AppSettings
import app.particledepth.wallpaper.ParticleWallpaperService
import app.particledepth.wallpaper.SavedStore
import app.particledepth.wallpaper.SpikeConfig
import app.particledepth.wallpaper.SavedWallpaper
import app.particledepth.wallpaper.Selection
import app.particledepth.wallpaper.pack.LoadedPack
import app.particledepth.wallpaper.pack.PackException
import app.particledepth.wallpaper.pack.PackImporter
import app.particledepth.wallpaper.pack.PackLoader
import app.particledepth.wallpaper.pack.PhotoImporter
import app.particledepth.wallpaper.pack.PackSources
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
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
    val packs = remember { PackCatalog.list(ctx).toMutableStateList() }
    var message by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    // ADD PHOTO: the system picker, pictures only; the photo becomes an effect with an estimated depth map (PhotoImporter)
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        message = "MAKING YOUR EFFECT"
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { PhotoImporter.import(ctx, uri) } }
            result.onSuccess { id ->
                withContext(Dispatchers.IO) { ThumbMaker.make(ctx, id) }
                PackCatalog.info(ctx, id)?.let { fresh -> packs.removeAll { it.id == id }; packs.add(fresh) }
                message = ""
                screen = Screen.Customize(id, emptyMap()) // straight to the customise screen to pick a look
            }.onFailure { e ->
                message = ((e as? PackException)?.message ?: "COULD NOT READ THAT PHOTO").uppercase().take(120)
            }
        }
    }
    // IMPORT PACK: a .pdspack made by the exporter; the archive is checked and loaded before anything is kept (PackImporter)
    val packPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { ctx.contentResolver.openInputStream(uri)!!.use { PackImporter.import(ctx, it) } }
            }
            result.onSuccess { id ->
                withContext(Dispatchers.IO) { ThumbMaker.make(ctx, id) }
                PackCatalog.info(ctx, id)?.let { fresh -> packs.removeAll { it.id == id }; packs.add(fresh) }
                message = "IMPORTED ${id.uppercase()}"
            }.onFailure { e ->
                message = ((e as? PackException)?.message ?: "THAT IS NOT A PACK FILE (.PDSPACK)").uppercase().take(120)
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Pds.Bg).pdsGrid().systemBarsPadding()) {
        Header(screen, onTab = { screen = it })
        Hairline()
        when (val s = screen) {
            Screen.Gallery -> Gallery(packs, message, onAddPhoto = { photoPicker.launch(arrayOf("image/*")) }, onImportPack = { packPicker.launch(arrayOf("*/*")) }) { screen = Screen.Customize(it.id, emptyMap()) }
            Screen.Saved -> SavedList(packs) { w -> screen = Screen.Customize(w.packId, w.overrides) }
            Screen.Settings -> SettingsScreen()
            is Screen.Customize -> {
                val info = packs.firstOrNull { it.id == s.packId }
                if (info == null) BasicText("PACK NOT FOUND", Modifier.padding(Pds.Gutter), style = Pds.Label)
                else Customize(info, s.start, onBack = { screen = Screen.Gallery }, onDelete = {
                    PackSources.deleteUser(ctx, info.id)
                    if (Selection(ctx).packId == info.id) Selection(ctx).set(SpikeConfig.PACK, emptyMap()) // the wallpaper falls back to the built-in one
                    packs.removeAll { it.id == info.id }
                    message = "DELETED ${info.id.uppercase()}"
                    screen = Screen.Gallery
                })
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
    var calm by remember { mutableStateOf(settings.followReduceMotion) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Pds.Gutter)) {
        SectionLabel("MOTION")
        PdsToggle("GYRO TURN", gyroOn) { gyroOn = it; settings.gyroOn = it }
        PdsSlider("GYRO RANGE", range, AppSettings.RANGE_MIN, AppSettings.RANGE_MAX, { range = it; settings.gyroRange = it })
        BasicText("DEGREES OF PHONE ROTATION FOR THE FULL TURN. LOWER = MORE SENSITIVE.", style = Pds.Label.copy(fontSize = 8.sp))
        PdsToggle("STILL WHEN SYSTEM REDUCES MOTION", calm) { calm = it; settings.followReduceMotion = it }
        BasicText("FOLLOWS ANDROID'S REMOVE ANIMATIONS SETTING. THE PICTURE STOPS DRIFTING; TURNING STAYS.", style = Pds.Label.copy(fontSize = 8.sp))
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
private fun Gallery(packs: List<PackInfo>, message: String, onAddPhoto: () -> Unit, onImportPack: () -> Unit, onPick: (PackInfo) -> Unit) {
    Column(Modifier.fillMaxSize()) {
    Row(Modifier.fillMaxWidth().padding(horizontal = Pds.Gutter, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        BasicText(if (message.isEmpty()) "${packs.size} EFFECTS" else message, Modifier.weight(1f), style = if (message.isEmpty()) Pds.Label else Pds.LabelActive)
        PdsButton("ADD PHOTO", Modifier.padding(end = 4.dp), active = true, height = 28.dp, onClick = onAddPhoto)
        PdsButton("IMPORT PACK", height = 28.dp, onClick = onImportPack)
    }
    if (packs.isEmpty()) {
        BasicText("NO EFFECTS FOUND", Modifier.padding(Pds.Gutter), style = Pds.Label)
        return@Column
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(Pds.Gutter),
        horizontalArrangement = Arrangement.spacedBy(Pds.Gutter),
        verticalArrangement = Arrangement.spacedBy(Pds.Gutter),
    ) {
        items(packs, key = { it.id }) { p ->
            Column(Modifier.semantics { contentDescription = "${p.config.name} effect" }.clickable(role = Role.Button) { onPick(p) }) {
                Box(Modifier.fillMaxWidth().aspectRatio(9f / 16f).border(1.dp, Pds.Line).background(Pds.Panel)) {
                    p.thumb?.let { Image(it, p.config.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                }
                Spacer(Modifier.height(6.dp))
                BasicText(p.config.name.uppercase() + if (p.builtIn) "" else " *", style = Pds.LabelActive)
            }
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
            var editing by remember(w.file.name) { mutableStateOf(false) }
            var text by remember(w.file.name) { mutableStateOf(w.name) }
            Row(Modifier.fillMaxWidth().border(1.dp, Pds.Line), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp, 64.dp).background(Pds.Panel)) {
                    pack?.thumb?.let { Image(it, w.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                }
                Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                    if (editing) {
                        BasicTextField(
                            value = text, onValueChange = { text = it.take(40) }, singleLine = true,
                            textStyle = Pds.LabelActive, cursorBrush = SolidColor(Pds.Ink),
                            modifier = Modifier.fillMaxWidth().border(1.dp, Pds.LineStrong).padding(4.dp),
                        )
                    } else BasicText(w.name.uppercase(), style = Pds.LabelActive)
                    BasicText((pack?.config?.name ?: w.packId).uppercase(), style = Pds.Label)
                }
                PdsButton(if (editing) "OK" else "RENAME", Modifier.padding(end = 4.dp), active = editing, height = 28.dp) {
                    if (editing) {
                        val updated = store.rename(w, text)
                        val i = items.indexOf(w)
                        if (i >= 0) items[i] = updated
                    }
                    editing = !editing
                }
                PdsButton("OPEN", Modifier.padding(end = 4.dp), height = 28.dp) { onOpen(w) }
                PdsButton("DELETE", Modifier.padding(end = 6.dp), height = 28.dp) { store.delete(w); items.remove(w) }
            }
        }
    }
}

@Composable
private fun Customize(info: PackInfo, start: Map<String, Float>, onBack: () -> Unit, onDelete: () -> Unit) {
    val ctx = LocalContext.current
    val selection = remember { Selection(ctx) }
    val store = remember { SavedStore(ctx) }
    val overrides = remember(info, start) { mutableStateMapOf<String, Float>().apply { putAll(start) } }
    var status by remember { mutableStateOf("") }
    var overlay by remember { mutableStateOf(OverlayMode.OFF) }
    // the settings as they are now: the pack's, with the user's changes (sliders and look) on top
    val effective = info.config.params.withOverrides(overrides.toMap())
    val sliders = PackCatalog.sliders(effective)

    // The preview loads the pack off the main thread with a smaller particle count: it only needs to look right
    val loaded by produceState<LoadedPack?>(null, info.id) {
        value = withContext(Dispatchers.Default) { runCatching { PackLoader.load(ctx, info.id, 60_000) }.getOrNull() }
    }

    // The preview stays pinned at the top; only the controls below it scroll, so the picture is always in view
    Column(Modifier.fillMaxSize().padding(horizontal = Pds.Gutter)) {
        Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PdsButton("BACK", height = 28.dp, onClick = onBack)
            BasicText(info.config.name.uppercase(), Modifier.weight(1f), style = Pds.Heading)
            PdsButton(overlay.label, active = overlay != OverlayMode.OFF, height = 28.dp) { overlay = overlay.next() }
        }
        Box(Modifier.fillMaxWidth().weight(0.44f), contentAlignment = Alignment.Center) {
            Box(Modifier.fillMaxHeight().aspectRatio(9f / 16f).border(1.dp, Pds.Line).background(Pds.Panel), contentAlignment = Alignment.Center) {
                val l = loaded
                if (l == null) BasicText("LOADING", style = Pds.Label)
                else PreviewView(l, effective, Modifier.fillMaxSize())
                PhoneOverlay(overlay)
            }
        }
        Column(Modifier.weight(0.56f).verticalScroll(rememberScrollState())) {
            SectionLabel("LOOK")
            val chunks = (listOf<Looks.Look?>(null) + Looks.all).chunked(3)
            for (row in chunks) {
                Row(Modifier.padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (look in row) {
                        val active = if (look == null) Looks.all.none { effective.on(it.flag) } else effective.on(look.flag)
                        PdsButton(look?.label ?: "PLAIN", Modifier.weight(1f), active = active, height = 30.dp) {
                            overrides.putAll(Looks.choose(look?.flag))
                        }
                    }
                    repeat(3 - row.size) { Box(Modifier.weight(1f)) }
                }
            }
            // FAITHFUL / SUBTLE / EXPRESSIVE, for the looks the web studio gives presets (glass green, candy, c-abr)
            val presets = Presets.NAMES.mapNotNull { n -> Presets.overridesFor(effective, n)?.let { n to it } }
            if (presets.isNotEmpty()) {
                SectionLabel("PRESET")
                Row(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for ((name, values) in presets) {
                        PdsButton(name, Modifier.weight(1f), active = values.all { (k, v) -> overrides[k] == v }, height = 30.dp) { overrides.putAll(values) }
                    }
                }
            }
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
            if (!info.builtIn) {
                Spacer(Modifier.height(6.dp))
                PdsButton("DELETE THIS EFFECT", Modifier.fillMaxWidth(), height = 30.dp, onClick = onDelete)
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
