# Research: Particle Depth Studio as an Android live wallpaper

Research only. No source code was changed. Nothing was committed. Nothing was run on an Android device. Date: 2026-11-06. Branch `master-web`.

Evidence rules:
- "Code fact" = read from this repo, with file and line.
- "DOCUMENTED" = stated on an official page, cited as `[n]` (list in section 12).
- "ESTIMATE" = my arithmetic or reasoning from code facts. Not measured.
- "PROPOSED TARGET" = a number I recommend we adopt and then test. Not a fact.
- "UNVERIFIED" = not confirmed in a primary source this session.
- **Nothing here is device-tested.** Every performance figure is theory until section H is run.

---

## 0. TL;DR

| Question | Answer |
|---|---|
| **1. Feasible?** | Yes. The web studio's shipping renderer (`src/lite/`) is a stateless, framebuffer-light WebGL2 renderer: positions are a pure function of `(home, hash(id), time, uniforms)` (`src/lite/shaders.ts:1-4`). WebGL2 GLSL ES 3.00 is the language OpenGL ES 3.0 uses, so the shaders port with little change. OpenGL ES 3.x is on 94.64% of all Play devices and 98.24% of handhelds [5]. The hard parts are not the GL. They are the lock-screen story, OEM process killing, thermal limits, and porting ~2,100 lines of TS glue (`sample.ts`, `Sampler.ts`, `LiteEngine.ts`, `WebEngine.ts`) beside 1,830 lines of GLSL that mostly move as-is. |
| **2. Architecture?** | **Option C, hybrid, with a native renderer as the product.** Web studio stays the editor and exports a versioned JSON config plus a baked picture and depth map. A native Kotlin app (EGL14 + GLES30 on its own render thread inside `WallpaperService.Engine`) renders that pack. Do not host a WebView in the wallpaper (section B.3). Do not port `src/core/` (three.js ping-pong, needs float render targets). |
| **3. Performance?** | The lite renderer needs no float textures and no ping-pong, so the 32 MiB core simulation cost does not apply. Draw cost scales with particle count and render scale. PROPOSED defaults: 30 fps, tiered 60k / 150k / 300k particles, render scale 0.5-1.0, hard stop when not visible. Thermal and power-save steps lower these further. All unmeasured. |
| **4. Scalable?** | Effects are already data: ~22 filter flags and 44 look slots driven by `Params` fields in one uber-shader. New parameter presets and textures ship as signed data. New GLSL ships with an app update, because Google Play policy on downloaded executable code is unclear for shaders (section C.4, UNCERTAIN). |
| **5. First steps?** | (1) 2-week spike: EGL14 `WallpaperService` drawing the existing point shader with a hard-coded 100k-point buffer on 3 devices. (2) A Node script that emits the shader strings from `src/lite/shaders.ts` as `.glsl` assets, so there is one source of truth. (3) Freeze `Params` into a versioned JSON schema (section C.3) and add a validator. (4) Measure before building UI. |

---

## A. Existing application audit

### A.1 Rendering technology (code facts)

| Topic | Fact | Where |
|---|---|---|
| Two engines | `core/` = three.js + `GPUComputationRenderer` ping-pong, 1024 x 512 = 524,288 particles, `FloatType` data textures. `lite/` = raw WebGL2, no three.js, no simulation. The web studio (`master-web`) uses `lite/`. | `src/core/Simulation.ts:9-45`, `docs/WEB_STUDIO.md:3-13` |
| Core sim state | Position and velocity textures, RGBA32F, ping-pong. Needs float colour-renderable targets. | `Simulation.ts:33-47` |
| Lite motion | "Nothing is simulated." Each particle: 5 hashed randoms from its index, then position = f(home, light, time). No state between frames. | `src/lite/shaders.ts:1-4`, `docs/RESEARCH_WALLPAPER_MUSIC.md` s2.1 |
| Lite draw | `gl.POINTS` for the picture, instanced `LINES` or `TRIANGLE_STRIP` for trails, instanced quads per cell for cell looks, optional post chain. Blend `ONE, ONE_MINUS_SRC_COLOR`. | `LiteEngine.ts:505-507, 1086-1108, 1177` |
| Lite GL features | WebGL2 context (`alpha:false, antialias:false, depth:false, stencil:false`), VAOs, instancing, `gl_VertexID`, `uint` hashing, 2D textures RGBA8, RGBA8 FBOs in `Post.ts`. **No float textures, no transform feedback, no extensions.** | `LiteEngine.ts:473-481`, `Post.ts:347`, grep for `getExtension` finds only `WEBGL_lose_context` at `LiteEngine.ts:1229` |
| Shader size | `shaders.ts` is 1,830 lines of GLSL in TS template strings, `#version 300 es`, 175 `uniform` declarations across the sources. Two arrays: `uBands[32]`, `uEmitW[9]`. | `shaders.ts:7-10`, grep |
| Lifecycle GLSL | Rest / stream / fade / respawn defined once in `src/shaders/lifecycle.ts`, shared by both engines. | `CLAUDE.md` |
| Particle budget | Core: 524,288 fixed. Lite: `pointBudget()` = 200k low, 300k default, 450k strong. `LiteEngine.adapt` ladder: trails off, then render scale x0.75, then 25% fewer points, floor `MIN_DRAWN = 40000`. Never climbs back. | `WebEngine.ts:211-218`, `LiteEngine.ts:326, 1186-1215` |
| DPR | `min(devicePixelRatio, maxDpr=1.5)`, x0.75 at ladder level 2. | `LiteEngine.ts:458-475, 797` |

### A.2 How a picture becomes particles

1. Picture drawn to a canvas at max 768 px long edge (`MAX_SIDE`), `getImageData` (`src/lite/sample.ts:23, 83-88`).
2. Optional CPU bake into pixels (FACET): `bakeFacet(rgba,w,h)` is pure array math, no DOM (`src/lite/facetBake.ts`).
3. Depth map (0..1) resampled to the working size (`sample.ts:92-104`). Without depth, 0.5 is used.
4. Importance weights and CDF (`computeImportanceWeights`, `buildCDF` from `core/Sampler.ts`), low-discrepancy shuffled order so **any prefix is an even subset** (`sample.ts:113-154`). This is what allows the quality ladder to draw fewer points.
5. Output: interleaved buffer, **16 bytes/particle** (f32 x,y,z + u8 r,g,b + u8 gain) (`sample.ts:1-3, 117`). Plus an RGBA8 "grid" texture (rgb + depth in alpha) for cell looks, brightness percentiles, and a 24-colour k-means palette (`sample.ts:156-187`).
6. Depth is estimated in-browser: Depth Anything V2 Small via `@huggingface/transformers` in a Web Worker, WebGPU fp16 then WASM q8 fallback, 768 px (`src/depth/depth.worker.ts:31-36`, `protocol.ts:11`). The hero path **bakes** depth offline: `bakeHeroAssets` writes subject WebP, depth PNG, hero JSON, poster WebP (`src/depth/bake.ts:11-60`).

### A.3 How effects (styles) are implemented

- `Params.style` (number) selects a look index; `STYLE_NAMES` has 44 slots, some retired (`src/core/styles.ts:6`). Each look has its own `LookTone` defaults and `STYLE_SETTINGS` (`styles.ts:134, 202`). Categories group them for the picker (`styles.ts:9-21`).
- Most new effects are **boolean filters on the dots base**: `chromeOn`, `auraOn`, `candyOn`, `cabrOn`, `glassGreenOn`, `facetOn`, ... each with a small object of 0..1 sliders (`src/core/params.ts:64-104`). `facetOn` additionally bakes into the picture on the CPU (`main.ts:574`).
- Effect composition layers: motion (`drift`, `lean`, `scanMode`), look/filter, surface (`grainOn`, `holoOn`, `duoOn`, `cloudOn`, `meshOn`), signal (`vhsOn`, `glitchOn`), glow (`bloomOn`, `haloOn`, bitmap overlay), fx levels (`fx`), music (`musicLook`, `eqStyle`).
- `toLiteParams(p: Params)` maps the studio `Params` to renderer uniforms. It is a pure function (`src/web/WebEngine.ts:40-208`).

### A.4 Param storage and export

| Question | Answer | Where |
|---|---|---|
| Where are params defined? | One serialisable `Params` interface, ~100 top-level fields, nested objects per filter. `defaults`, `MOTION_PRESETS`, `presets`, `withEffectsStart()`, `withLightStart()`. | `params.ts:24-348` |
| Persisted how? | `JSON.stringify` to `localStorage` key `particle_depth_studio_params_v3`. Per-picture settings live in memory. | `params.ts:350-408`, `WEB_STUDIO.md:36` |
| Can an effect be exported as config? | **Yes, partly.** `serializeParams`/`parseParams` round-trip the whole object (`tests/params.test.ts`). `bakeHeroAssets` exports a *subset* (11 fields) for the hero. There is no full "effect pack" file format, and no schema version field other than the storage key suffix. | `bake.ts:29-44` |
| Validation | `parseParams` spreads unknown keys through, does not clamp ranges, and only merges nested objects it knows. A test asserts unknown fields survive. **This is unsafe for untrusted packs; the Android validator must be stricter.** | `params.ts:364-387`, `params.test.ts:23-30` |
| Tests | 9 vitest files: audio, clip, facetBake, frameSize, model, palette, params, sampler, styles. | `tests/` |

### A.5 Does the engine run without the UI?

- `core/` and `lite/` are documented as UI-free (`CLAUDE.md`). `LiteEngine` takes a canvas and a `LiteSample`; `WebEngine` is a thin adapter with ~10 methods (`WEB_STUDIO.md:7-8`).
- `hero-lite.ts` already runs the renderer with no studio UI and loads a config via `fetch(o.config)` (`src/hero-lite.ts:135`). So "renderer + JSON + baked assets, no editor" is an existing, working pattern.

### A.6 Browser-API dependency map

| Piece | Browser API used | Classification |
|---|---|---|
| Vertex/fragment GLSL (`lite/shaders.ts`, `shaders/lifecycle.ts`, `bitmapGlsl.ts`) | None (TS string templates) | **Reusable** (extract to `.glsl`) |
| `place()`, scan, trails, cells, filters in GLSL | None | **Reusable** |
| `toLiteParams`, `lookTone`, `STYLE_SETTINGS`, `LOOK_TONE_DEFAULTS` | None | **Reusable** as spec; **Adaptable** (re-implement in Kotlin or generate from JSON) |
| `facetBake.ts`, `facetPalette.ts`, `paletteOf` | None (typed arrays) | **Adaptable** (line-by-line Kotlin port, golden tests) |
| `sampleLite` / `Sampler.ts` (`hash01`, CDF, importance) | `document.createElement('canvas')`, `getImageData` for the downscale only | **Adaptable**: replace the canvas downscale with `Bitmap`/`ImageDecoder`; port the maths |
| `LiteEngine.ts` GL calls | `canvas.getContext('webgl2')`, `window.devicePixelRatio`, `requestAnimationFrame` host | **Adaptable**: GL calls map 1:1 to `GLES30.*`; context/loop/size are new |
| `Post.ts` bloom/halo chain | `document.createElement('canvas')` for one helper (`Post.ts:381`) | **Adaptable** |
| `glyphs.ts`, `haloImage.ts` (atlas) | 2D canvas text rendering | **Needs redevelopment**: bake atlases offline to PNG, ship as assets |
| `depth/*` | Web Worker, OffscreenCanvas, transformers.js, WebGPU/WASM | **Needs redevelopment** or replace with baked depth (section C.5) |
| `core/Engine.ts`, `Simulation.ts`, `ParticleRenderer.ts` | three.js, float render targets | **Do not port** |
| `audio/*` | `AudioContext`, `getDisplayMedia` | **Needs redevelopment** (Android has no system loopback API I verified; UNVERIFIED) |
| `video/*`, `model/*` | `<video>`, three.js loaders, canvas | **Needs redevelopment**; out of MVP |
| `ui/*`, `main.ts`, `index.html` | DOM | **Needs redevelopment** (Compose) |

### A.7 Audit findings that change the plan

1. **The lite renderer is the right port target.** It has no float textures. `EXT_color_buffer_float` (needed to render to RGBA32F in ES 3.0) is not needed [11].
2. **Time is the only state.** Pause = stop advancing the clock; resume = continue. No sim reset. One known catch: `uSpeed` sits inside time terms so live changes make particles jump; accumulate a single clock (`RESEARCH_WALLPAPER_MUSIC.md` s2.4).
3. **Uniform pressure.** 175 uniform declarations (UNVERIFIED against ES 3.0 minimum vertex-uniform-vector limit; the spec figure is 256 vectors, check on target GPUs with `glGetIntegerv(GL_MAX_VERTEX_UNIFORM_VECTORS)`). Unused uniforms are usually optimised out, but the compiled uber-shader may still be heavy. Plan per-look `#define` variants.
4. **`gl_PointSize` range is implementation-defined** and the spec minimum is small. The dot look draws `POINTS` sized by `uPointPx` (`shaders.ts:1259`). Query `GL_ALIASED_POINT_SIZE_RANGE` on devices (UNVERIFIED, test in spike). Fall back to quads.
5. **CPU sampler is not free.** `sampleLite` loops over ~300k particles with bilinear taps plus 12 k-means iterations over ~40k pixels (`sample.ts:43-60, 121-154`). ESTIMATE: tens to a few hundred ms in Kotlin on a mid phone. Run once per pack, cache the 16 B/particle buffer on disk.

---

## B. Technology comparison

### B.1 Android platform facts the design depends on

| Fact | Status | Source |
|---|---|---|
| `WallpaperService` generates `Engine` instances; "may have multiple instances running (for example as a real wallpaper and as a preview)". | DOCUMENTED | [1][3] |
| `Engine` callbacks `onSurfaceCreated/Changed/Destroyed`, `onVisibilityChanged`, `onOffsetsChanged`, `onTouchEvent` are "called from the main thread". | DOCUMENTED | [1] |
| `onVisibilityChanged`: "It is very important that a wallpaper only use CPU while it is visible." | DOCUMENTED | [1] |
| `setTouchEventsEnabled(true)` is needed to get raw touches; **off by default**. | DOCUMENTED | [1] |
| `isPreview()` true while shown before the user selects it. | DOCUMENTED | [1] |
| `onApplyWindowInsets` (API 21), `onComputeColors` + `notifyColorsChanged` (API 27, `WallpaperColors.fromBitmap`), `onZoomChanged` (API 30), `getDisplayContext` (API 29), `getWallpaperFlags` / `onWallpaperFlagsChanged` (API 34: tells which screen the Engine renders to). | DOCUMENTED | [1] |
| `<wallpaper>` XML attrs: `supportsMultipleDisplays` (API 29, default false), `shouldUseDefaultUnfoldTransition` (API 32, default true). `WallpaperInfo.getSettingsActivity()`, `getShowMetadataInPreview()` (API 25), `loadThumbnail`, `loadDescription`, `loadAuthor`. | DOCUMENTED | [4] |
| `getSettingsSliceUri()` (API 29) exists but `SliceProvider` is **deprecated in API 35**. Do not depend on slices; use a settings activity. | DOCUMENTED | [4][20] |
| `ACTION_CHANGE_LIVE_WALLPAPER` (API 16) + `EXTRA_LIVE_WALLPAPER_COMPONENT` "directly launch live wallpaper preview, allowing the user to immediately confirm". | DOCUMENTED | [2] |
| `FLAG_SYSTEM` = 1, `FLAG_LOCK` = 2, both API 24. | DOCUMENTED | [2] |
| `WallpaperManager.getWallpaperInfo()` (API 7) returns the **home** wallpaper's info if live; on Android 13 and lower needs `QUERY_ALL_PACKAGES`; on 14+ needs a `<queries>` entry for action `android.service.wallpaper.WallpaperService`. `getWallpaperInfo(int which)` (API 34) takes exactly `FLAG_SYSTEM` or `FLAG_LOCK`. | DOCUMENTED | [2] |
| No public `setWallpaperComponent`. The WallpaperManager reference I fetched has no such method; the only documented way to apply a live wallpaper is the preview intent with user confirmation. | DOCUMENTED (by absence in [2]); the hidden/privileged API is UNVERIFIED | [2] |
| Whether the preview screen offers "home / lock / both" for a live wallpaper is **not stated on the pages read**. Use `onWallpaperFlagsChanged` / `getWallpaperFlags` (API 34) to learn which screen an Engine serves. Behaviour on API < 34 and per OEM: UNVERIFIED, device test. | UNVERIFIED | [1][2] |
| OpenGL ES 3.0 = API 18+, 3.1 = API 21+, 3.2 = API 24+, only where the OEM ships the driver. ETC2/EAC "guaranteed to be available when using the OpenGL ES 3.0 API". | DOCUMENTED | [10] |
| OpenGL ES share: handhelds 3.2 = 98.24%, 3.1 = 0.39%, 3.0 = 0.86%, 2.0 = 0.49% (28-day window ending 2025-11-24, API 23+). All devices: 3.2 = 94.64%. Vulkan: none 7.37% handhelds, 1.1 = 62.09%, 1.3 = 26.01%. | DOCUMENTED | [5] |
| ES 3.0 does not make float formats colour-renderable; `EXT_color_buffer_float` adds `RGBA16F/32F` etc., and **32-bit float blending raises INVALID_OPERATION**. | DOCUMENTED | [11] |
| `EGL14` is API 17. `eglPresentationTimeANDROID` sets an intended present time (CLOCK_MONOTONIC ns), **not a guarantee**. | DOCUMENTED | [13][12] |
| `Surface.setFrameRate(rate, compat)` (API 30), 3-arg (API 31): "Usage of this API won't introduce frame rate throttling". It is a **hint to the display**, the app must pace itself. Passing 30 on a 60 Hz panel is allowed. | DOCUMENTED | [8] |
| `FRAME_RATE_COMPATIBILITY_DEFAULT` (API 30) is the one named for game-like content; `AT_LEAST` is API 36. | DOCUMENTED | [8] |
| `GLSurfaceView`: renders on a dedicated thread, tied to Activity `onPause/onResume`. The page text I read does not mention `WallpaperService`. | DOCUMENTED (silent) | [14] |
| Doze (screen off, unplugged, stationary) "ignores wake locks", suspends network, defers jobs/alarms. It does not describe stopping a process that is not holding work. | DOCUMENTED | [16] |
| `PowerManager.isPowerSaveMode()` + `ACTION_POWER_SAVE_MODE_CHANGED` (API 21): "applications should reduce their functionality". | DOCUMENTED | [7] |
| `getCurrentThermalStatus` + `addThermalStatusListener` (API 29); `getThermalHeadroom(int)` (API 30), 1.0 = severe throttling, call at most about once per second per the reference and **no more than once per 10 s** per the ADPF guide, else `NaN`. `addThermalHeadroomListener` is API 36. | DOCUMENTED | [6][7] |
| Some devices report `THERMAL_STATUS_NONE` while hot; ADPF recommends cross-checking headroom (>0.85 light, >0.95 moderate, >1.0 severe heuristics). | DOCUMENTED | [6] |
| `onTrimMemory`: `TRIM_MEMORY_UI_HIDDEN` (20), `TRIM_MEMORY_BACKGROUND` (40) remain; `RUNNING_*` and `MODERATE/COMPLETE` are **deprecated in API 35 and not delivered since API 34**. | DOCUMENTED | [20] |
| Slow frame: > 16 ms @60 fps; frozen frame > 700 ms. Battery Historian "is no longer actively maintained"; use system tracing, the Macrobenchmark power metric, or Power Profiler. | DOCUMENTED | [17][18] |
| AGI: system profiling and frame profiling, Adreno / Mali / PowerVR; frame profiling covers Vulkan and OpenGL ES. | DOCUMENTED | [19] |
| LiteRT: Android API 24+, CPU/GPU/NPU backends. | DOCUMENTED | [22] |

Not verified this session (general knowledge only, check before relying): `ActivityManager.isLowRamDevice()`/`getMemoryClass()`, `BatteryManager` properties, `Choreographer`, `Display.getRefreshRate()/getSupportedModes()` details, `dumpsys gfxinfo` / `dumpsys batterystats` flags beyond the battery page, Perfetto and Macrobenchmark pages (linked from [17][18], not opened), the Android version-share table (see s F.5), WebGL2-to-ES3.0 mapping in the Khronos WebGL 2.0 spec.

### B.2 Rendering approach comparison

| Dimension | **A. WebView** (web build as-is) | **B. Native** (Kotlin + GLES30, port of lite GLSL) | **C. Hybrid** (web editor + native renderer + shared JSON) |
|---|---|---|---|
| Dev complexity | Lowest to first pixel, highest to make stable | Highest up front: engine port + sampler port + app | B plus a schema and an export step; web editor already exists |
| Code reuse | ~100% JS, but no wallpaper-safe host (below) | GLSL ~100% (extracted), maths ported, UI new | GLSL ~100%, editor kept as-is, UI for mobile is a thin Compose layer |
| Visual quality | Same as web | Same as web (same shaders) | Same |
| CPU | JS + Chromium renderer process + compositor | Kotlin thread, cheap per frame (uniform upload only) | Same as B |
| GPU | Same shaders, plus compositor copy | Same shaders, direct to the wallpaper surface | Same as B |
| RAM | Chromium WebView adds a renderer process; ESTIMATE hundreds of MB class | ESTIMATE 40-120 MB (section E.5) | Same as B |
| Battery | Worst: extra process, JS timers, no hard stop control | Best controllable | Same as B |
| Long-run stability | Unknown; no official support (B.3) | Standard pattern; main risk is OEM killing | Same as B |
| Compatibility | Depends on installed WebView version and WebGL2 blocklists | Depends on GLES 3.0 driver (98.24% handhelds on ES 3.2 [5]) | Same as B |
| Maintenance | One code base, but fragile host | Two code bases for the engine (TS and Kotlin), one for shaders | Two engines, one shader source, one schema; needs golden tests |
| Scalability (new effects) | Add TS/GLSL, instant | Add GLSL + Kotlin param mapping, app update | Add schema field + GLSL once; editor and app share it |
| **Verdict** | Reject for production | Right renderer | **Recommended** product shape |

### B.3 WebView inside `WallpaperService.Engine`: what official sources say

| Claim | Status | Source |
|---|---|---|
| Official docs describe hosting a `WebView` in a wallpaper Engine. | **No.** The `WallpaperService`, `Engine` and `WebView` references I read do not mention it. | [1][3][15] |
| `WebView` needs a window-attached `View` hierarchy. | The `WebView` page text I could read has no statement on window attachment or hardware acceleration (truncated at 100k chars of 605k). UNVERIFIED either way. | [15] |
| Community reports that a `WebView` created in a `WallpaperService` gets 0 x 0 size and draws only its background; workarounds are layout hacks or drawing the view to a `Canvas`. | Secondary, from a search snippet of a Stack Overflow thread. Not verified by me. | [24] |
| Chromium has an issue tracker entry for this. | Not found by search. | search |

Conclusion: no official support exists in anything I could read. The workable hacks (offscreen `WebView` drawn to a `Canvas` and blitted) pay a full Chromium process, double copy and CPU readback or a texture copy per frame, lose WebGL2 hardware path guarantees, and cannot be relied on across WebView updates. Reject.

### B.4 Other engines (brief)

| Option | Fit | Note |
|---|---|---|
| Skia / Canvas (`Surface.lockHardwareCanvas`, API 23 [8]) | Poor | Cannot run our GLSL; 300k point sprites with per-vertex hashing would be rewritten as CPU work |
| Vulkan | Not now | 7.37% of handhelds have none, 62.09% are on 1.1 [5]. No feature we need. Revisit if GLES drivers prove unstable |
| Flutter / Compose | UI only | Use Compose for the app UI; render with raw EGL in the service |
| Unity / Godot | Heavy | Large runtime inside a wallpaper process; adds 20-40 MB class APK (ESTIMATE); no benefit over 3 shaders |
| KMP | Optional | Could share schema/validator between Android and a future iOS companion. Wallpaper itself is Android-only |

### B.5 GL threading choice

`GLSurfaceView` is a `View` driven by Activity lifecycle [14]. A wallpaper Engine owns a `SurfaceHolder`, not a View. Use a **custom EGL14 render thread** that calls `eglCreateWindowSurface` on `holder.getSurface()` [13]. Community GLWallpaperService libraries wrap `GLSurfaceView` inside an Engine; they target ES 2.0 and old API levels [23] (community, not official; no AOSP/Google sample using raw EGL14 in an Engine was found by search).

---

## C. Recommended stack

### C.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | Kotlin (render loop optionally C++ later) | Normal Android toolchain; GLES30 is in the framework since API 18 [10] |
| Wallpaper host | `WallpaperService` + `Engine`, one render thread per Engine | Documented [1] |
| GL | `EGL14` + `GLES30`, ES 3.0 context, require `glEsVersion 0x00030000` | 98.24% handheld ES 3.2 [5]; ES 2.0-only is 0.49% |
| Shaders | Same GLSL ES 3.00 as the web, extracted to `assets/shaders/*.glsl` by a build script | One source of truth |
| App UI | Jetpack Compose | Customise screen, gallery |
| Storage | Config JSON + assets as files; DataStore for "active wallpaper id" and settings | Section C.6 |
| Data | `kotlinx.serialization` JSON, hand-written validator | Section C.3 |
| Image decode | `ImageDecoder` (API 28) or `BitmapFactory` | UNVERIFIED API detail |
| Depth | Baked in the web editor (default) | Section C.5 |
| Min / target | minSdk **29** PROPOSED, targetSdk current | Section F.5 |
| Profiling | Perfetto, AGI, Macrobenchmark power, Android Studio profilers | Section H |

### C.2 Reuse plan

1. `tools/export-shaders.mjs` (Node): imports `src/lite/shaders.ts` and `src/shaders/lifecycle.ts`, writes `*.vert`/`*.frag` files plus a JSON list of uniform names (`UNIFORMS`, `LiteEngine.ts:360`). Android reads those at build time. CI fails if the generated files drift.
2. Kotlin `ParamMapper` = port of `toLiteParams` (`WebEngine.ts:40-208`). Golden test: a JSON fixture of `Params` in, a JSON fixture of uniform values out, produced by the TS function in CI and asserted by a Kotlin unit test. This catches drift between the two engines.
3. Kotlin `Sampler` = port of `sample.ts` + `Sampler.ts` helpers. Golden test against `tests/sampler.test.ts` vectors.

### C.3 Versioned config schema (derived from `params.ts`)

Design rules:
- `schema: "pds.effect/1"`. Unknown **major** = refuse. Unknown fields = ignore and report. Unknown filter keys = drop that filter.
- Only include fields that apply on mobile. Pointer, DRAW, PULL, MELT, video, audio, export fields are excluded (see `WEB_STUDIO.md:43-48` for what is already dead in the web build).
- Every number carries a range in the validator; out-of-range is **clamped and warned**, never trusted.
- Field names equal `Params` names, so the web editor can export with no renaming.

```json
{
  "schema": "pds.effect/1",
  "id": "glass-green-ocean",
  "name": "Glass Green",
  "author": "Sumanth Reddy",
  "minEngine": 1,
  "assets": {
    "subject": { "file": "subject.webp", "sha256": "…", "w": 768, "h": 432 },
    "depth":   { "file": "depth.png",    "sha256": "…" }
  },
  "params": {
    "style": 0,
    "drift": 0.3,
    "depth": 0.5,
    "lean": 0,
    "line": { "angle": 0.541, "length": 0.55 },
    "randomness": 0.1,
    "trailSize": 0.45,
    "trailAngle": 0,
    "pSat": 1,
    "trail": { "amount": 1.1, "strength": 0.5, "length": 0.3, "detail": 0.25 },
    "scan": true,
    "scanMode": 5,
    "scanLevel": 3,
    "panMode": true,
    "panAmount": 0.25,
    "floatOn": false,
    "light": "cream",
    "lightOn": true,
    "background": "dark",
    "colorMode": "true",
    "fx": { "black": 0, "white": 1, "gamma": 1, "contrast": 0, "opacity": 1, "hue": 0, "saturation": 1 },
    "filters": {
      "glassGreen": { "on": true, "gloss": 0.85, "rim": 0.9, "depth": 0.7, "bevel": 0.65 }
    },
    "pointCount": 300000
  },
  "mobile": {
    "tiers": { "low": 60000, "mid": 150000, "high": 300000 },
    "fps": { "default": 30, "max": 60 },
    "safeArea": { "focal": [0.5, 0.45], "fit": "cover" }
  }
}
```

Mapping note: the web `Params` has `glassGreenOn` + `glassGreen{…}` (`params.ts:78-79`). The pack groups filters under `filters.<name>` with `on`. The exporter and the Kotlin parser both own that mapping; add it to the golden test.

Graceful degradation rules:

| Situation | Behaviour |
|---|---|
| Unknown `schema` major | Do not load; keep previous wallpaper; show "update app" |
| `minEngine` > app engine | Same |
| Unknown filter key | Drop the filter, render the base look, log once |
| Missing field | Use `defaults` from `params.ts` (copied into Kotlin) |
| Out-of-range number | Clamp, log |
| Asset hash mismatch or missing | Reject the pack; keep previous |
| Feature unsupported by GPU (e.g. point size too small) | Switch to quad path or reduce size; never crash |
| Tier > device tier | Use the device tier's particle count; `pointCount` is a ceiling |

Validation strategy (security, also for sharing later): hard limits on file size (config <= 64 KB PROPOSED TARGET; each image <= 2 MB; total pack <= 8 MB), max JSON depth, max string length, reject duplicate keys, parse with a schema-driven parser (not `eval`), check `sha256` of assets, decode images with downscale-on-decode and a pixel cap (e.g. <= 2048 x 2048 PROPOSED), never pass a config string into a shader. If packs are shared, deliver through `FileProvider`/SAF `content://` URIs with explicit grants and no raw file paths; validate in a separate pass before writing to app storage. Packs are signed (C.4).

### C.4 Effects as data vs compiled in; Play policy

| Item | Ships as | Needs app update? |
|---|---|---|
| New preset of existing look/filters (params JSON) | Data | No |
| New picture, depth map, atlas, palette, LUT texture | Data (image assets) | No |
| New filter that needs new GLSL branch (e.g. next `*Fx` like CANDY) | Compiled-in shader | **Yes** |
| New CPU bake (like `bakeFacet`) | Compiled-in Kotlin | **Yes** |

Why not download GLSL: Play's Device and Network Abuse policy says an app "may not modify, replace, or update itself using any method other than Google Play's update mechanism" and may not download executable code (dex, JAR, .so) from outside Google Play, with an exception for "code that runs in a virtual machine or an interpreter" that "provides indirect access to Android APIs" [9]. A GLSL string is source passed to the GPU driver's compiler. The policy page does not name shaders. **Whether a GL shader compiler counts as an interpreter is UNCERTAIN.** Safe path: ship all GLSL in the APK; packs are data only. If downloadable shaders are wanted later, ask Play Console policy support in writing first. Signed data packs: sign the manifest with an offline Ed25519 key, pin the public key in the APK, reject unsigned or mismatched packs; this protects integrity, it does not change the policy question.

### C.5 Depth: baked vs on-device

| Option | Size / cost | Verdict |
|---|---|---|
| **Bake in the web editor** (existing `bakeHeroAssets`, depth PNG at 768 px) | ~100-500 KB per pack ESTIMATE; zero on-device ML | **MVP default** |
| On-device LiteRT with a depth model [22] | Model size, latency and conversion of Depth Anything V2 Small to LiteRT are UNVERIFIED; GPU/NPU delegates vary by SoC; extra RAM at runtime | Phase 4+, only for "use my own photo". Evaluate a small quantised model; compare against baked depth quality |
| Flat depth (0.5) | Free; `sampleLite` supports it (`sample.ts:102-103`) | Fallback when depth is missing |

### C.6 Storage and process-death recovery

| Data | Where | Why |
|---|---|---|
| Effect packs | `filesDir/packs/<id>/` (config.json, subject.webp, depth.png) | Survives restarts; app-private |
| Sampled buffer cache | `cacheDir/vbo/<packId>-<hash>.bin` (16 B x count) | Rebuildable; OS may evict |
| Active pack id, tier override, fps cap, battery rules | Jetpack DataStore | Small settings |
| Gallery index / favourites | Room (or a JSON index) | Queries |
| Shader program binary cache | `cacheDir/gl/` (optional, `glGetProgramBinary`, ES 3.0) | Invalid after driver update, treat as cache only (UNVERIFIED benefit) |

Process death: the `Engine` is re-created by the system. In `onCreate` read the active pack id from DataStore, load pack + cached buffer, start paused until `onSurfaceCreated`. No in-memory-only state allowed.

---

## D. System architecture

```
 WEB EDITOR (existing, TS)                       ANDROID APP (new)
 +---------------------------+                   +-----------------------------------------------+
 | Studio UI  (src/ui, main) |                   |  Compose UI (gallery, customise, settings)    |
 | Params -> LiteEngine      |                   |     |  PackRepository (Room/DataStore/files)  |
 | Depth (worker)            |  export pack      |     |  Validator (schema, limits, hash, sig)  |
 | bake: subject.webp,       |  (.pdspack zip:   |     v                                         |
 |  depth.png, config.json)  | ----------------> |  ActiveConfig (StateFlow, persisted)          |
 +---------------------------+  sideload / HTTPS |     |                                         |
                                                  |     v                                         |
                                                  |  WallpaperService.Engine  (main thread)       |
                                                  |   - visibility, surface, insets, offsets,     |
                                                  |     touch, thermal/power listeners            |
                                                  |     | posts messages                          |
                                                  |     v                                         |
                                                  |  RenderThread (HandlerThread + Choreographer) |
                                                  |   - EGL14 ctx, window surface                 |
                                                  |   - Sampler (once) -> VBO 16 B/particle       |
                                                  |   - ParamMapper -> uniforms                   |
                                                  |   - GLSL from assets (extracted from TS)      |
                                                  |   - AdaptivePolicy (tier, fps, scale, count)  |
                                                  +-----------------------------------------------+
```

Data flows (T = thread):

| Flow | Steps |
|---|---|
| **Select effect** | UI (main) reads gallery index -> user taps -> `PackRepository.load(id)` (IO) -> Validator -> in-app preview engine (own `GLSurfaceView`/`TextureView` + EGL context) renders it. Nothing applied to the system yet. |
| **Customise** | Sliders edit an in-memory `EffectConfig` copy -> `ParamMapper` -> preview engine uniforms (no re-sampling for pure uniform changes; re-sample only when picture/pointCount/`facetOn` change, as `main.ts:574` does) -> draft autosaved to DataStore. |
| **Save** | Validator on the edited config -> write `config.json` atomically (temp + rename) -> update index (Room) -> bump `configVersion`. |
| **Apply** | UI sets `activeId` in DataStore, then `startActivity(ACTION_CHANGE_LIVE_WALLPAPER, EXTRA_LIVE_WALLPAPER_COMPONENT=ComponentName(service))` [2]. The system shows its preview; the user confirms. If our wallpaper is already active, only `activeId` changes and the running Engine picks it up via `ActiveConfig`. |
| **Android displays** | System binds `WallpaperService` -> `onCreateEngine` -> `Engine.onCreate` -> `onSurfaceCreated/Changed` -> start render thread, create EGL on `holder.surface`, upload VBO/textures/programs, begin Choreographer loop at the tier fps. |
| **Screen off** | `onVisibilityChanged(false)` (main) -> render thread: remove frame callback, stop clock, `glFinish` optional; keep EGL context for a short grace (PROPOSED 10 s) then release textures/VBO; unregister high-rate sensors. CPU use must be ~0 [1]. |
| **Screen on** | `onVisibilityChanged(true)` -> if context lost, recreate from cache (no network, no re-sampling thanks to the disk cache) -> resume clock where it stopped -> first frame within PROPOSED 300 ms. |
| **Change wallpaper** | User picks another wallpaper: system calls `onDestroy`; release GL, quit thread. User picks another pack in our app: `ActiveConfig` emits; render thread swaps buffers (a cut, as the web build does today `WEB_STUDIO.md:57`; the shader has `aHome2/aMeta2` morph attributes, `shaders.ts:15-16`, for a later blend). |

Lock screen: `getWallpaperFlags()` / `onWallpaperFlagsChanged()` (API 34) tell the Engine which screen it serves [1]. On lock, PROPOSED: lower fps default (24-30), no touch. Whether a third-party live wallpaper can be set on lock only, and how OEMs present the choice, is **not documented on the pages read and must be device-tested** (open question K-1).

---

## E. Particle optimisation strategy

### E.1 Memory arithmetic (explicit)

| Item | Bytes | Notes |
|---|---|---|
| One RGBA32F 1024 x 512 texture | 1024 x 512 x 16 = 8,388,608 B = **8 MiB** | `core/` position texture |
| Position + velocity, ping-pong x2 | 4 x 8 MiB = **32 MiB** | `core/` build only. **Not used by `lite/`** |
| Lite VBO @ 524,288 | 524,288 x 16 = 8,388,608 B = **8 MiB** | `sample.ts` stride 16 |
| Lite VBO @ 300k / 150k / 60k | 4.8 MB / 2.4 MB / 0.96 MB | tiers |
| Grid texture RGBA8 768 x 432 | 768 x 432 x 4 = 1,327,104 B = **1.27 MiB** | cell looks |
| Halo/glyph atlases | small (ESTIMATE <= 2 MiB) | to be baked as PNG |
| Display buffer 1080 x 2400 RGBA8 | 10,368,000 B = **9.9 MiB** each | system swapchain, typically 2-3 buffers: ~20-30 MiB (ESTIMATE) |
| Post chain scene FBO (same size) | 9.9 MiB (+ downsampled bloom ~ 1-3 MiB) | only when bloom/halo/fx on |
| Render scale 0.75 / 0.5 | 0.56x / 0.25x pixels | quadratic saving |
| **Typical total GPU-side, mid tier** | **~35-60 MiB** ESTIMATE | add app heap + decoded bitmaps |

### E.2 Cost model (ESTIMATE, unmeasured)

- Per frame: N point vertices + (trails ? 2N line vertices : 0) + cells. At N = 300k with trails that is ~900k vertex-shader runs per frame, each doing ~5 hashes and conditional filter code. At 30 fps that is ~27 M vertices/s.
- Fragment side: `uCover` (dots per pixel over the subject) and blend `ONE, ONE_MINUS_SRC_COLOR` mean overdraw is the likely limiter on mobile tile GPUs, not vertex count. Reduce with render scale and by dropping trails first (this matches the existing ladder).
- CPU per frame: set ~50-100 uniforms and issue ~3-5 draw calls. Negligible next to the GPU.

### E.3 Tiers (PROPOSED TARGETS, not measured)

| Tier | Detect by (PROPOSED) | Particles | Render scale | Trails | Post (bloom/halo) | fps default / max |
|---|---|---|---|---|---|---|
| Low | `isLowRamDevice()` or RAM <= 4 GB or failed probe | 60,000 (floor 40,000, same as `MIN_DRAWN`) | 0.5-0.75 | off | off | 24-30 / 30 |
| Mid | default | 150,000 | 0.75 | on at low gain | bloom only | 30 / 60 when touched or charging |
| Flagship | RAM >= 8 GB and probe passes | 300,000 | 1.0 (cap DPR 1.5, as `LiteEngine.ts:475`) | on | on | 30 / 60 |

Start tier from a first-run **GPU probe**: render 60 frames offscreen at mid settings, read GPU time via a timer or just frame time, pick the highest tier with p95 <= 8 ms. Re-probe after app update or driver change. Never pick tiers by device model strings alone.

### E.4 Runtime responses

| Signal | Response | Source |
|---|---|---|
| `onVisibilityChanged(false)` | Stop loop, stop clock, release non-essential GPU memory after grace | [1] |
| `isPowerSaveMode()` / `ACTION_POWER_SAVE_MODE_CHANGED` | Force low tier, fps 24, trails off, bloom off | [7] |
| Thermal status >= MODERATE (listener, API 29+) or headroom > 0.85 (poll no faster than every 10 s, API 30+) | Step down: trails, then render scale, then particle count (25% steps, reuse the existing ladder) | [6][7] |
| Thermal SEVERE or headroom > 1.0 | Drop to floor tier, fps 20 (PROPOSED), show static frame if it persists > 60 s | [6] |
| Frame time EMA > budget for 45 frames | Existing `adapt()` logic; **add climb-back with hysteresis** because wallpapers run for hours, thermal conditions change and the web ladder never recovers (`LiteEngine.ts:1186`) | code fact |
| Battery low (BatteryManager, UNVERIFIED API detail) | Same as power save | UNVERIFIED |
| `TRIM_MEMORY_UI_HIDDEN` / `BACKGROUND` | Free textures, VBO, program binaries; rebuild from disk cache on show | [20] |
| Do not rely on `RUNNING_*` trim levels | Not delivered since API 34 | [20] |
| Display refresh change / rotation / fold | Re-read size in `onSurfaceChanged`; recompute `uView/uScale`; call `Surface.setFrameRate(fps, DEFAULT)` (API 30) so the panel can match | [8] |
| Charging and screen on | May lift fps cap to refresh rate | PROPOSED |

### E.5 Why 30 fps default

Reason (PROPOSED): a wallpaper is background content; motion is slow (streamer cycles 5-10 s, `shaders.ts:257`); the renderer is time-parametric, so a lower frame rate does not change speed or require catch-up; power scales roughly with frames drawn (ESTIMATE, to be measured); `setFrameRate` is only a hint and does not throttle the app [8], so we pace ourselves by skipping Choreographer ticks. Raise to refresh rate only for interaction bursts (touch, launcher scroll offsets) and on flagship while charging.

### E.6 Other tactics

| Tactic | Status |
|---|---|
| Draw prefix of the shuffled buffer for any count | Already designed in (`sample.ts:1-4`) |
| GPU instancing | Already used for trails/cells |
| Per-look shader variants via `#define` (compile only active filters) | PROPOSED; ESTIMATE meaningful on mid GPUs because the uber-shader contains every filter |
| Texture compression: ETC2/EAC guaranteed with ES 3.0 [10]; ASTC optional, query extensions `GL_KHR_texture_compression_astc_ldr` [10] | Use ETC2 or plain RGBA8 for the 1.27 MiB grid; compression not worth it at this size |
| Transform feedback / compute | Not needed; the lite design has no per-frame particle state. This is a design advantage, do not add it |
| Float ping-pong | Avoid; needs `EXT_color_buffer_float` [11] and 32 MiB |
| Skip frames when nothing moves | PROPOSED: if `drift = 0`, no scan, no pan, no float, render once and idle |
| `Surface.setFrameRate` | Hint [8] |
| `eglSwapInterval(1)` | Standard EGL call (UNVERIFIED on the pages read) ; with vsync + skipping ticks |
| `eglPresentationTimeANDROID` | Not guaranteed [12]; skip unless pacing tests need it |

---

## F. Android integration guide

### F.1 Manifest

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-feature android:glEsVersion="0x00030000" android:required="true" />
  <uses-feature android:name="android.software.live_wallpaper" android:required="true" />
  <!-- API 34+: lets getWallpaperInfo() see our own and other packages -->
  <queries>
    <intent><action android:name="android.service.wallpaper.WallpaperService" /></intent>
  </queries>

  <application android:allowBackup="false" ...>
    <service
        android:name=".wallpaper.ParticleWallpaperService"
        android:exported="true"
        android:label="@string/wallpaper_name"
        android:permission="android.permission.BIND_WALLPAPER">
      <intent-filter>
        <action android:name="android.service.wallpaper.WallpaperService" />
      </intent-filter>
      <meta-data android:name="android.service.wallpaper"
                 android:resource="@xml/particle_wallpaper" />
    </service>
    <activity android:name=".ui.MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <activity android:name=".ui.SettingsActivity" android:exported="true" />
  </application>
</manifest>
```

`res/xml/particle_wallpaper.xml` (attribute names from [4]; `thumbnail`, `description`, `settingsActivity`, `author`, `contextUri` are the documented `WallpaperInfo` getters; exact XML attribute spellings other than the two quoted in [4] are UNVERIFIED):

```xml
<wallpaper xmlns:android="http://schemas.android.com/apk/res/android"
    android:thumbnail="@drawable/wallpaper_thumb"
    android:description="@string/wallpaper_description"
    android:settingsActivity="com.example.pds.ui.SettingsActivity"
    android:showMetadataInPreview="true"
    android:supportsMultipleDisplays="false"
    android:shouldUseDefaultUnfoldTransition="true" />
```

The `android.software.live_wallpaper` feature declaration and the exact `uses-feature` semantics are UNVERIFIED on the pages read; confirm in the Play Console device catalogue.

### F.2 Minimal service + EGL render loop (skeleton, not compiled, not tested)

```kotlin
class ParticleWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = ParticleEngine()

    inner class ParticleEngine : Engine() {
        private var render: RenderThread? = null

        override fun onCreate(holder: SurfaceHolder) {
            super.onCreate(holder)
            setTouchEventsEnabled(false)          // default off [1]; enable only if the config uses touch
            render = RenderThread(applicationContext, isPreview).also { it.start() }
        }
        override fun onSurfaceCreated(h: SurfaceHolder) { render?.post { attach(h.surface) } }
        override fun onSurfaceChanged(h: SurfaceHolder, f: Int, w: Int, hgt: Int) {
            render?.post { resize(w, hgt) }
        }
        override fun onVisibilityChanged(visible: Boolean) { render?.setVisible(visible) } // [1]
        override fun onOffsetsChanged(x: Float, y: Float, xs: Float, ys: Float, xp: Int, yp: Int) {
            render?.setScroll(x, y)               // optional parallax: maps to uLook/PAN
        }
        override fun onSurfaceDestroyed(h: SurfaceHolder) { render?.post { detach() } }
        override fun onDestroy() { render?.quitAndRelease(); render = null }
    }
}

class RenderThread(ctx: Context, private val preview: Boolean) : HandlerThread("pds-render") {
    private lateinit var handler: Handler
    private var dpy = EGL14.EGL_NO_DISPLAY
    private var eglCtx = EGL14.EGL_NO_CONTEXT
    private var eglSurf = EGL14.EGL_NO_SURFACE
    private var visible = false
    private var clock = 0.0                        // accumulated seconds; pause = stop adding
    private var lastNs = 0L
    private var tickEvery = 2                      // 60 Hz panel / 2 = 30 fps; adaptive policy changes it
    private var tick = 0

    override fun onLooperPrepared() { handler = Handler(looper) }
    fun post(r: () -> Unit) { handler.post(r) }

    private val frame = object : Choreographer.FrameCallback {
        override fun doFrame(ns: Long) {
            if (!visible || eglSurf == EGL14.EGL_NO_SURFACE) return
            if (++tick % tickEvery == 0) {
                val dt = if (lastNs == 0L) 0.0 else (ns - lastNs) / 1e9
                clock += dt.coerceAtMost(0.1)      // clamp hiccups (web does the same, LiteEngine.adapt)
                draw(clock)                        // uniforms + glDraw*
                if (!EGL14.eglSwapBuffers(dpy, eglSurf)) handleSwapError()  // EGL_CONTEXT_LOST etc.
            }
            lastNs = ns
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    fun setVisible(v: Boolean) = handler.post {
        visible = v
        if (v) { lastNs = 0L; Choreographer.getInstance().postFrameCallback(frame) }
        else   { Choreographer.getInstance().removeFrameCallback(frame) }
    }

    fun attach(surface: Surface) {
        dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val v = IntArray(2); EGL14.eglInitialize(dpy, v, 0, v, 1)
        val cfgAttrs = intArrayOf(
            EGL14.EGL_RENDERABLE_TYPE, EGLExt.EGL_OPENGL_ES3_BIT_KHR,
            EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
            EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_DEPTH_SIZE, 0, EGL14.EGL_STENCIL_SIZE, 0, EGL14.EGL_NONE)
        val cfg = arrayOfNulls<EGLConfig>(1); val n = IntArray(1)
        EGL14.eglChooseConfig(dpy, cfgAttrs, 0, cfg, 0, 1, n, 0)
        eglCtx = EGL14.eglCreateContext(dpy, cfg[0], EGL14.EGL_NO_CONTEXT,
            intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0)
        eglSurf = EGL14.eglCreateWindowSurface(dpy, cfg[0], surface, intArrayOf(EGL14.EGL_NONE), 0)
        EGL14.eglMakeCurrent(dpy, eglSurf, eglSurf, eglCtx)
        EGL14.eglSwapInterval(dpy, 1)
        initGl()                                   // compile programs, upload VBO (from disk cache), textures
    }
    fun detach() { /* eglMakeCurrent(NO_SURFACE), destroy surface; keep ctx for grace period */ }
    fun resize(w: Int, h: Int) { GLES30.glViewport(0, 0, w, h) /* recompute uView/uScale */ }
    fun setScroll(x: Float, y: Float) { /* store; used as uLook */ }
    fun quitAndRelease() { handler.post { releaseGl(); releaseEgl(); quitSafely() } }
    private fun initGl() {}  private fun draw(t: Double) {}  private fun handleSwapError() {}
    private fun releaseGl() {}  private fun releaseEgl() {}
}
```

Notes on the skeleton:
- All `Engine` callbacks arrive on the main thread [1]; every GL call happens on the render thread. Never touch GL from callbacks.
- On `eglSwapBuffers` failure with `EGL_CONTEXT_LOST`, destroy and rebuild context and resources, then continue. On `EGL_BAD_SURFACE`, wait for the next `onSurfaceCreated`.
- Choreographer vsync callbacks plus tick skipping keeps phase with the display. `Surface.setFrameRate(30f, FRAME_RATE_COMPATIBILITY_DEFAULT)` on API 30+ asks the panel to match [8].
- One `Engine` per surface (preview and real). Preview and real can coexist briefly [1]: keep VBO cache shared on disk, not in RAM twice.

### F.3 ACTION_CHANGE_LIVE_WALLPAPER

```kotlin
val intent = Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER).putExtra(
    WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
    ComponentName(context, ParticleWallpaperService::class.java))
startActivity(intent)   // system preview; user confirms [2]
```

Detect "is ours active?": `WallpaperManager.getWallpaperInfo()` (home) or `getWallpaperInfo(FLAG_LOCK)` on API 34+ [2]. Pre-34 lock detection: UNVERIFIED.

### F.4 OEM behaviour (secondary source only)

dontkillmyapp.com is a community-maintained site [21], not authoritative. It rates Samsung, Xiaomi, OnePlus, Huawei as worst tier (5), Motorola 3, and stock/Pixel-class AOSP best (0). Treat as a hint list for the device matrix, not a spec. Wallpaper services are bound by the system, which is different from a background job, so the mapping from that site to our case is UNVERIFIED. Plan: test each OEM's battery-optimisation and "app lock" paths, and detect a dead Engine by a heartbeat counter in the app (rendered frames/10 min) rather than guessing.

### F.5 minSdk recommendation

| Fact | Source |
|---|---|
| ES 3.0 needs API 18+; 94.64% of all devices and 98.24% of handhelds report ES 3.2 | [10][5] |
| Thermal listener API 29; headroom API 30; `Surface.setFrameRate` API 30; `getDisplayContext` API 29; multi-display attr API 29; wallpaper flags API 34 | [1][4][6][7][8] |
| The Android **version-share table** is inside an embedded frame that returned HTTP 502; I could not read it | [5] |

Recommendation: **minSdk 29 (PROPOSED)** because it gives the thermal-status listener and removes a large compatibility branch for little loss; **fall back to 26** if Play Console "Reach and devices" shows meaningful install share below API 29 for the target markets. Decide with that data, not with this document. Everything from API 30 up is feature-gated (`Build.VERSION.SDK_INT`).

---

## G. MVP specification

Goal: a user installs the app, picks one of ~6 bundled effects, adjusts 4-6 sliders, previews, applies it as home-screen live wallpaper, and it stays smooth and cool for a full day.

| Area | In MVP | Out of MVP |
|---|---|---|
| Render | DOTS look + 3-4 filters from `params.ts` (candidates: GLASS GREEN, CANDY, C-ABR, AURA) + trails + scan BURST-less modes | Cell looks needing glyph atlas, SOFTWORD, SHAKE-MASK, audio looks, video clips, 3D model drop, DRAW/PULL/MELT |
| Picture | Bundled packs (subject + baked depth) | Camera import, on-device depth |
| Interaction | Optional launcher-scroll parallax (`onOffsetsChanged`); no touch | Touch repel/splash (`track`, `splash`), hover |
| App | Gallery, customise, in-app preview, Apply, settings (fps cap, battery rules) | Account, cloud, sharing, store |
| Adaptivity | Visibility stop, power-save, thermal listener, tier probe, climb-back ladder | ML-based tuning |
| Lock screen | Works if system assigns it (API 34 flags read); no special UI | Lock-only wallpaper guarantee |
| Diagnostics | Local frame/thermal counters, debug overlay, export log | Telemetry upload |

Basic vs advanced controls (real `Params` names):

| Basic (shown) | Advanced (hidden behind "More") |
|---|---|
| `drift` (FLOW), `depth` (RELIEF), `line.angle`, `line.length`, `trail.amount`, `light` (tint swatch), filter strength sliders (e.g. `glassGreen.gloss`, `candy.glow`) | `lean`, `randomness`, `trailSize`, `trailAngle`, `pSat`, `trail.strength/length/detail`, `fx.*` (levels, gamma, contrast, hue, saturation, opacity), `scanMode`, `scanLevel`, `panAmount`, `floatOn`, `background`, `colorMode`, `pointCount` (ceiling only) |

Preview: in-app preview uses the same engine in its own `GLSurfaceView` (an Activity View, so the documented lifecycle fits [14]) at low priority; "Apply" opens the system preview via the intent [2]. Safe areas: use `onApplyWindowInsets` (API 21) [1] and the pack's `focal` point so the subject avoids the clock area on the lock screen and the dock/icons on home (PROPOSED defaults: subject centre at 45% height).

Acceptance criteria are in section H.5.

---

## H. Performance benchmarking plan

### H.1 Device matrix (PROPOSED)

| Tier | Example profile | Count | Purpose |
|---|---|---|---|
| Low | <= 4 GB RAM, Mali-G5x / Adreno 6xx-entry class, Android 10-12 | 2 | Floor tier, thermal throttling |
| Mid | 6-8 GB, Adreno 6xx/Mali-G7x class, Android 13-14 | 2 | Default tier |
| Flagship | 12 GB, current Snapdragon/Tensor/Exynos, Android 15+ | 2 | Ceiling tier, 120 Hz |
| OEM spread | At least one Samsung, Pixel, Xiaomi/Redmi, OnePlus, Motorola | within above | Killing/lock-screen behaviour |
| Special | One foldable (unfold/zoom, `shouldUseDefaultUnfoldTransition` [4]); one tablet (large surface) | 2 | Resolution, multi-display |

(Chipset names are examples to guide purchasing, not claims about behaviour.)

### H.2 Test types

| Type | What | Tool |
|---|---|---|
| Functional | Install, apply, preview, rotate, fold, reboot, kill process, change pack, schema reject cases | instrumented tests, manual checklist |
| Golden | TS `toLiteParams` vs Kotlin `ParamMapper`; TS sampler vs Kotlin sampler; screenshot diff of the same pack vs web build at fixed time | CI |
| Frame pacing | Frame-time histogram, janks, dropped ticks | Perfetto FrameTimeline [17], `dumpsys gfxinfo` (UNVERIFIED flags), AGI frame/system profile [19] |
| GPU | Per-draw time, overdraw, shader cost, counters (Adreno/Mali/PowerVR) | AGI [19] |
| Battery | Current draw, energy per hour, per-component | Macrobenchmark power metric, Power Profiler [18]; `dumpsys batterystats` with Battery Historian is "no longer actively maintained" [18], use only as secondary |
| Thermal | Skin temp, thermal status/headroom log vs fps | Thermal API logging [6], on-device log, AGI system profile |
| Memory | PSS, GPU memory, leak across 100 show/hide cycles, process death | Android Studio Memory Profiler, `dumpsys meminfo`, `onTrimMemory` logs [20] |
| Doze/idle | Screen off 1 h, unplugged | `adb shell dumpsys deviceidle force-idle` [16] |
| Stress | 1 h, 4 h, 8 h, 24 h screen-on loop with random show/hide, rotation, pack changes | scripted + overnight rigs |
| Field | Frame-time buckets, thermal states, crash/ANR, Vitals | Play Console Android vitals [17] (slow = > 16 ms @ 60 fps, frozen > 700 ms) |

### H.3 Metrics

GPU ms/frame (p50/p95/p99), frames above budget, dropped Choreographer ticks, CPU % of render thread, RSS/PSS, GPU memory, battery mA and %/h at fixed brightness, skin temp trend, time-to-first-frame after show, shader compile time, pack load time, context-loss count, crash-free sessions.

### H.4 What each tool finds

| Tool | Finds | Does not find |
|---|---|---|
| Perfetto + FrameTimeline [17] | Frame deadlines, scheduling, who stalled | Why a shader is slow |
| AGI [19] | GPU counters, per-draw cost, bandwidth, ES frame capture on supported GPUs | Battery in absolute terms |
| Android Studio profilers | CPU methods, heap, allocations | GPU internals |
| Macrobenchmark power metric / Power Profiler [18] | Energy per scenario | Cause |
| Thermal API logs [6] | Throttling onset and headroom | Per-draw cost |
| `dumpsys gfxinfo`, `dumpsys batterystats` | Quick CLI counters (flags UNVERIFIED) | Detail |
| Battery Historian | Event timelines [18] | Maintained support |

### H.5 Acceptance targets (PROPOSED TARGETS, none measured)

| Metric | Low | Mid | Flagship |
|---|---|---|---|
| Default fps | 24-30 | 30 | 30 |
| GPU time per frame p95 | <= 8 ms | <= 8 ms | <= 6 ms |
| Dropped frames at default fps over 10 min | < 2% | < 1% | < 1% |
| Screen-off CPU of our process | ~0% (no frames, no timers) | same | same |
| Time to first frame after screen-on | <= 500 ms | <= 300 ms | <= 200 ms |
| GPU + app memory (excl. system buffers) | <= 60 MiB | <= 100 MiB | <= 150 MiB |
| Added battery vs a static wallpaper, screen on | <= 4 %/h | <= 4 %/h | <= 5 %/h |
| Thermal after 1 h screen on | no status above LIGHT | same | no status above MODERATE |
| 24 h run | zero crashes/ANR, zero leak trend (PSS slope ~ 0) | same | same |
| Context-loss recovery | recovers within 1 s, no visual corruption | same | same |

These numbers are starting guesses. Replace with measured baselines after phase 1.

---

## I. Roadmap

Assumptions: 1 Android/GL engineer full time, 1 web/TS engineer at 50% (exporter, schema, shader script), 1 designer/QA at 50%. Calendar weeks, not effort. Estimates are ESTIMATE, not commitments; phase 1 outcome can move all later dates.

| Phase | Weeks | Tasks | Tech | Depends on | Deliverables | Risks | Tests | Completion criteria |
|---|---|---|---|---|---|---|---|---|
| **1. Feasibility prototype** | 3 | EGL14 `WallpaperService`; load exported shaders; hard-coded 100k buffer; run DOTS look; log thermal/frame time; test home + lock behaviour; point-size and uniform-limit probes | Kotlin, GLES30, `export-shaders.mjs` | Shader extraction script | Spike APK, measurements doc | Point size limits; shader compile failures on Mali/Adreno; lock-screen behaviour differs | 3 devices, 1 h run | DOTS look renders at 30 fps on 3 devices; context-loss and visibility cycle survive 100 repeats; go/no-go written |
| **2. Native rendering + optimisation** | 6-8 | Kotlin sampler port; ParamMapper port + golden tests; packs loader + validator; trails, scan, filters (MVP 4); Post chain; tier probe; adaptive policy with climb-back; disk VBO cache | Kotlin, GLES30, golden CI | Phase 1 | Engine library (AAR), golden tests, perf report | TS/Kotlin drift; uber-shader cost; thermal | Golden pixel diff vs web; AGI + Perfetto on matrix | Mid tier meets H.5 on 2 devices for 1 h; golden diff within tolerance |
| **3. Mobile app + customisation** | 6 | Compose gallery, customise sliders, in-app preview, apply flow, settings, DataStore/Room, process-death restore | Compose, DataStore, Room | Phase 2 | Internal beta APK | Preview engine duplicates GPU memory; apply flow differs by OEM | Functional suite, kill/restore | End-to-end journey works on 6 devices; beta users can apply and revert |
| **4. Effect library** | 6 (rolling) | Web exporter for packs (`.pdspack`); signing; 10-15 packs; additional filters (each needs GLSL + mapper + golden); optional on-device depth evaluation; atlases baked offline | TS exporter, Ed25519 signing, LiteRT eval [22] | Phase 3 | Library of packs, authoring runbook (extend `docs/EFFECT_MAKER_RUNBOOK.md`) | Per-effect GPU cost varies; Play policy for shaders (C.4) | Per-pack perf budget test in CI on one device | Every pack passes tier budget; invalid-pack tests all rejected |
| **5. Production readiness** | 4-6 | 8/24 h soak; OEM matrix; Vitals dashboard; crash reporting; accessibility (reduced motion); store listing; policy review incl. shader question; rollback plan | Play Console, Macrobenchmark, Firebase or equivalent | Phase 4 | Release candidate | OEM killing; lock-screen variance; policy rejection | Soak, field pilot | 24 h soak clean on matrix; closed beta Vitals below Play thresholds; policy sign-off |

Total ESTIMATE: 25-31 calendar weeks (sum of the phase ranges) with the team above. If one engineer does everything, expect roughly 1.6-2x calendar (ESTIMATE).

---

## J. Risk assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | OEM background killing or "battery optimisation" breaks the wallpaper | Med-High (secondary source [21]) | High | Heartbeat + auto-recover; in-app OEM guide; test matrix; avoid foreground service tricks that Play restricts [16] |
| R2 | Lock-screen live wallpaper support is inconsistent | Med (docs silent) | High | Treat lock as best-effort; device tests; API 34 flags; clear user messaging |
| R3 | Thermal throttling in long sessions | High on low/mid | Med-High | Adaptive ladder + climb-back, 30 fps default, tiers, test 8-24 h |
| R4 | TS vs Kotlin drift (sampler, mapper, defaults) | High over time | Med | Golden tests in CI, shader extraction script, shared JSON fixtures |
| R5 | Uber-shader compile time/regs on mobile GPUs; point size limits | Med | Med-High | Per-look `#define` variants; quad fallback; probe at first run; program binary cache |
| R6 | Play policy interpretation of downloaded shaders | Unknown | High if wrong | Ship GLSL in APK; data-only packs; ask Play policy support before changing |
| R7 | Memory: preview + live Engine both resident | Med | Med | Shared disk cache, release on hide, `TRIM_MEMORY_UI_HIDDEN` [20] |
| R8 | GL context loss / surface races | Med | Med | Single owner render thread, tested recovery |
| R9 | Pack parsing as an attack surface if sharing arrives | Low now | High later | Section C.3 limits, signatures, hash checks, no shader strings in packs |
| R10 | Depth quality of baked maps vs user expectation | Med | Low-Med | Editor preview shows exact output; offer re-bake |
| R11 | Slices/settings approach deprecated | Known | Low | Use a settings Activity, not Slice [4][20] |

---

## K. Open questions (need real devices or the codebase owner)

1. Can the user set our live wallpaper on lock only / both on API 29-33 and 34+ via the preview flow, per OEM? How do Samsung and Xiaomi present it?
2. Does `onVisibilityChanged(false)` fire reliably on lock-screen-over-wallpaper, AOD, always-on-display, and when another full-screen app is on top, on each OEM?
3. What `GL_MAX_VERTEX_UNIFORM_VECTORS`, `GL_ALIASED_POINT_SIZE_RANGE`, and shader compile time do target GPUs give for the full lite shader?
4. Real ms/frame, mA and skin temperature at 60k / 150k / 300k with trails and post on each tier. (All section E numbers are estimates.)
5. Is the Android version-share table readable from Play Console "Reach and devices" for the target markets, so minSdk 29 vs 26 can be decided?
6. Which of the 22 filter flags are in the MVP? Which need CPU bake (FACET) or atlases (SOFTWORD, SHAKE-MASK, ASCII)?
7. Should the pack format be a zip with a manifest, or a folder? Who holds the signing key?
8. Is on-device depth ever required (user photos), and what model size/accuracy is acceptable? (LiteRT size and latency not measured.)
9. Does the product need touch interaction (`track`, `splash`) on the home screen? That requires `setTouchEventsEnabled(true)` [1] and has battery cost.
10. Audio-reactive looks: what Android audio source is allowed without `RECORD_AUDIO`? Not researched.
11. Does Play policy accept GLSL shaders as data? Needs written Play support answer.
12. Is a tablet or foldable in scope for v1?

---

## 12. Sources

Official documentation (fetched this session unless noted):

[1] WallpaperService.Engine. https://developer.android.com/reference/android/service/wallpaper/WallpaperService.Engine
[2] WallpaperManager. https://developer.android.com/reference/android/app/WallpaperManager
[3] WallpaperService. https://developer.android.com/reference/android/service/wallpaper/WallpaperService (read first 100k of 212k chars; BIND_WALLPAPER and manifest sections not reached; manifest in F.1 is standard practice, UNVERIFIED against the page)
[4] WallpaperInfo. https://developer.android.com/reference/android/app/WallpaperInfo
[5] Distribution dashboard (OpenGL ES, Vulkan; 28-day window ending 2025-11-24). https://developer.android.com/about/dashboards (version table not readable; frame URL returned 502)
[6] ADPF Thermal API guide. https://developer.android.com/games/optimize/adpf/thermal
[7] PowerManager. https://developer.android.com/reference/android/os/PowerManager
[8] Surface. https://developer.android.com/reference/android/view/Surface
[9] Google Play Device and Network Abuse policy. https://support.google.com/googleplay/android-developer/answer/9888379
[10] About OpenGL ES (versions, ETC2, ASTC, manifest). https://developer.android.com/develop/ui/views/graphics/opengl/about-opengl
[11] EXT_color_buffer_float. https://registry.khronos.org/OpenGL/extensions/EXT/EXT_color_buffer_float.txt
[12] EGL_ANDROID_presentation_time. https://registry.khronos.org/EGL/extensions/ANDROID/EGL_ANDROID_presentation_time.txt
[13] EGL14 (API 17; page header only was read). https://developer.android.com/reference/android/opengl/EGL14
[14] GLSurfaceView (first 100k of 323k chars). https://developer.android.com/reference/android/opengl/GLSurfaceView
[15] WebView (first 100k of 605k chars; no window-attachment text found). https://developer.android.com/reference/android/webkit/WebView
[16] Doze and App Standby. https://developer.android.com/training/monitoring-device-state/doze-standby
[17] Rendering performance / Android vitals (slow and frozen frames; links to Perfetto FrameTimeline https://perfetto.dev/docs/data-sources/frametimeline , not opened). https://developer.android.com/topic/performance/vitals/render
[18] Batterystats and Battery Historian (deprecation warning; links to Macrobenchmark power metric and Power Profiler, not opened). https://developer.android.com/studio/profile/battery-historian
[19] Android GPU Inspector. https://developer.android.com/agi
[20] ComponentCallbacks2. https://developer.android.com/reference/android/content/ComponentCallbacks2
[22] LiteRT. https://developers.google.com/edge/litert

Secondary / community (not authoritative):

[21] dontkillmyapp.com (community, flagged secondary). https://dontkillmyapp.com/
[23] GLWallpaperService community libraries (ES 2.0 era): https://github.com/markfguerra/GLWallpaperService , https://github.com/hanschencoder/GLWallpaperService (from a web search; code not read)
[24] Stack Overflow: WebView size in WallpaperService (seen only as a search snippet via a mirror): https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/30556091/how-to-set-size-of-webview-in-wallpaperservice

Repo files read: `CLAUDE.md`, `docs/WEB_STUDIO.md`, `docs/RESEARCH_LOCK_SCREEN.md`, `docs/RESEARCH_WALLPAPER_MUSIC.md` (style and header), `src/core/params.ts`, `src/core/Simulation.ts` (1-120), `src/core/styles.ts` (1-60), `src/lite/sample.ts`, `src/lite/shaders.ts` (1-260 plus greps), `src/lite/LiteEngine.ts` (greps and 455-500, 1180-1231), `src/lite/facetBake.ts` (head), `src/web/WebEngine.ts` (1-80, 205-225), `src/depth/*` (greps, `bake.ts` 1-60), `tests/params.test.ts`.

Not read in full (summarised from file names and greps only): `core/Engine.ts`, `core/ParticleRenderer.ts`, `core/Sampler.ts`, `core/FlowField.ts`, `lite/Post.ts`, `src/model/*`, `src/audio/*`, `src/hero.ts`, `src/main.ts`, `docs/BUILD.md`.

Items listed as UNVERIFIED in this document were not confirmed in a primary source in this session and nothing here has been tested on a device.
