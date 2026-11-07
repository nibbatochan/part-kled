# Android live wallpaper: scope, phases and tracker

Single source of truth for the Android wallpaper build. Update the tracker and the change log whenever something moves. Research behind every decision: `docs/RESEARCH_ANDROID_LIVE_WALLPAPER.md` (cited below as "R", with section letters).

Created: 2026-11-06. Branch: `master-web`. Status (2026-11-08): phases 0 and 1 done on one device, phase 2 mostly done, phase 3 first full version working on the phone, phase 4 started (19 packs, photo and pack import), phase 5 started (release build, accessibility). Not done: battery and heat measurement, a second device, post-processing looks, on-device neural depth, signing and the store listing.

Evidence labels used here, same as R: DOCUMENTED (official page), ESTIMATE (reasoned, not measured), PROPOSED (our target, to be tested), UNVERIFIED (not confirmed), TESTED (measured on a device; none yet).

---

## 1. Goal

Ship an Android app that uses the existing Particle Depth Studio render as a live wallpaper, with the existing design system for the app UI, and with **gyroscope tilt** replacing the web studio's cursor hover tilt.

Priority: speed to a working wallpaper on a real phone. Quality gates (battery, heat) still apply before any release.

## 2. Decisions (locked unless the change log says otherwise)

| # | Decision | Why | Source |
|---|---|---|---|
| D1 | Native Kotlin renderer (EGL14 + GLES 3.0) inside `WallpaperService.Engine`. No WebView in the wallpaper. | The render is WebGL2 GLSL ES 3.00, which maps to OpenGL ES 3.0. R found no official support for a WebView in a wallpaper surface. | R section B, F |
| D2 | Port `src/lite/` only. Do not port `src/core/`. | Lite is stateless and needs no float textures or ping-pong. | R section A |
| D3 | The web studio stays the editor. It exports a versioned JSON config plus baked picture and depth map ("pack"). | Depth model runs in the browser today. Android gets baked depth. | R section C |
| D4 | One source of truth for shaders: a Node script emits `src/lite/shaders.ts` strings to `.glsl` assets for Android. | Avoids web and Android shaders drifting apart. | R section C, risk R4 |
| D5 | Default 30 fps, tiered particle counts, render scale 0.5 to 1.0, stop rendering when not visible. | Battery and heat. All numbers PROPOSED. | R section E, H.5 |
| D6 | App UI reuses the existing design system (tokens in `src/ui/tokens.css`). | User statement: design system is ready. | User, 2026-11-06 |
| D7 | Gyro replaces hover tilt. See section 4. | User request. | User, 2026-11-06 |

Note on "just use the render": the web render cannot be dropped into Android as is. The shaders carry over almost unchanged, but the TypeScript glue (sampler, param mapping, engine loop, about 2,100 lines per R) must be rewritten in Kotlin. That port is the main cost, not the wallpaper plumbing.

## 3. In scope for the first release (MVP)

- DOTS look plus 3 to 4 filters (candidates in R section G: GLASS GREEN, CANDY, C-ABR, AURA).
- Bundled packs (picture + baked depth). About 6 effects.
- Gyro tilt (section 4), launcher-scroll parallax optional.
- App: gallery, a few sliders, in-app preview, Apply to home screen, settings.
- Adaptive quality: pause when hidden, power-save, thermal, tier probe.

Out of scope for the MVP: touch interaction, audio looks, video clips, 3D model drop, on-device depth, accounts and sharing, lock-screen-only guarantee, tablet and foldable polish.

## 4. Gyro tilt design

**What the web build does today (code facts):**
- `LiteEngine.setPointer(x, y)` maps the cursor to `lookTarget`, each axis in the range -1 to 1 (`src/lite/LiteEngine.ts:694-695`).
- The tick eases `look` toward `lookTarget.x * pan * 0.9` and `lookTarget.y * pan * 0.5` (`src/lite/LiteEngine.ts:875-878`).
- `look` goes to the shader as `uLook` (`src/lite/LiteEngine.ts:942`), and the shader tilts the picture like a card in 3D using it (`src/lite/shaders.ts:355-358`).
- In `threeD` (ORBIT) mode the tilt comes from `orbit.yaw` and `orbit.pitch` instead, set by drag.

**Android plan (PROPOSED, none of it tested):**
1. Use the game rotation vector sensor (fallback: gyroscope integrated, then no tilt). No permission expected for normal rates. UNVERIFIED: Android 12+ rate limit above 200 Hz needs a permission, so stay below it.
2. On wallpaper show, record the current attitude as the rest pose. Tilt is the difference from that pose, so any holding angle works.
3. Map pitch and roll differences to `lookTarget` in the range -1 to 1, with a clamp (about 20 to 30 degrees of phone tilt for full range, tune on device). Then the existing `look` easing and `pan` amount apply unchanged. Same visual result as hover.
4. Remap axes for the display rotation.
5. Register the sensor listener only while the wallpaper is visible, and unregister on hide. Use a sample rate near the render rate (30 fps default). The sensor must never keep the CPU awake while the screen is off.
6. Settings: gyro on/off, sensitivity, "recenter" action. Off by default if the battery test shows a cost; decide after phase 1 measurements.
7. Port detail: Kotlin engine exposes `setLookTarget(x, y)` as the one entry point. Gyro, scroll parallax and (later) touch all call it. The web `setPointer` becomes one more caller.

Open: whether home-screen and lock-screen both deliver reliable sensor events while the wallpaper is visible (to test on devices).

## 5. Phases

Dates are ESTIMATE from R section I (1 Android/GL engineer full time, 1 web/TS at 50%, 1 designer/QA at 50%). Phase 1 results can move all later dates. Fast-track idea: start P1 and P0 together; do not wait for P3 UI to prove the wallpaper.

### Phase 0: Prep (about 2 to 3 days)
Goal: unblock the Android work.
- [x] Create Android project in `android/` (Kotlin, minSdk 29 PROPOSED, R could not verify the version table). Gradle 8.6, AGP 8.4.2, Kotlin 1.9.24, compileSdk 34, JDK 21 from Android Studio. `./gradlew assembleDebug` builds a 5.3 MB debug APK (2026-11-06).
- [x] `scripts/export-shaders.mjs` (`npm run export:shaders`): emits 6 `.glsl` files plus `manifest.json` (sizes, hashes) from `src/lite/shaders.ts` into `android/app/src/main/assets/shaders/` (gitignored, generated). Post-chain shaders (`src/lite/Post.ts`) are not exported yet; add in phase 2.
- [x] Spike pack: `public/samples/sample-1.png` and `sample-1-depth.png` copied to `android/app/src/main/assets/packs/spike/` (picture.png, depth.png). Default DOTS look (Q2: change if you prefer another sample).
- [ ] Get 3 test phones (low, mid, flagship). At least one Samsung or Xiaomi. **No device connected, no emulator image created.** Needed before phase 1 measurements (Q1).
Done when: project builds, shader assets generated by one command. **Met, except the device item.**

Build commands (Windows, from `android/`): `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug`. `local.properties` holds `sdk.dir` and is gitignored.

### Phase 1: Feasibility spike (about 3 weeks, may be faster)
Goal: the real render as a live wallpaper on a phone, tilting with gyro.

Code status (2026-11-06): **written and compiles, never run.** No device or emulator was available, so every item below marked "code written" is untested. Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk` (7.2 MB). Install with `adb install -r` and watch `adb logcat -s PDS`.

Files in `android/app/src/main/java/app/particledepth/wallpaper/`:
`ParticleWallpaperService.kt` (Engine lifecycle), `RenderThread.kt` (EGL14, Choreographer loop, stats), `ParticleRenderer.kt` (web point shader + uniforms from `liteDefaults`), `PackSampler.kt` (picture + depth to particles), `TiltSensor.kt` (gyro), `SpikeConfig.kt` (all tunable numbers), `MainActivity.kt` ("Set as wallpaper" button).

- [~] `WallpaperService` + `Engine` with own EGL14 render thread (skeleton in R section F). Code written, not run.
- [~] Load exported shaders, draw 100k points, plain DOTS look (all look flags at 0), picture + depth baked into the vertex buffer. Code written, not run. Simplified sampler (alpha and brightness weights only, no depth or edge weighting); real port is phase 2.
- [~] Visibility handling: stop on hide (no frame callback, no sensor listener), resume without reset (clock continues, `dt` clamped). Code written, not run.
- [~] Gyro tilt into `look` (section 4): game rotation vector, rotation-matrix delta from the pose at show time, 25 degrees for full range, feeds the web's PAN easing. Code written, signs and range untested (`SpikeConfig.TILT_SIGN_*`, `TILT_FULL_DEG`).
- [~] Probe point-size and uniform limits; log shader compile results. Logged to logcat tag PDS at start (compile+link ms, GL renderer, max vertex uniform vectors, point size range, uniforms not found). Not run.
- [ ] Measure: ms/frame, battery over 1 h, temperature, on 3 devices. The app logs fps and CPU time per frame every 5 s (CPU side only; GPU time needs Perfetto or AGI).
- [ ] Check home and lock behaviour, process kill, reboot.
- [ ] Write go/no-go.
Done when: DOTS look at 30 fps on 3 devices, 100 show/hide cycles survive, gyro tilt works, go/no-go written.
Risks: point-size limits, shader compile failures on Mali/Adreno, lock-screen differences.

### Phase 2: Native render and optimisation (6 to 8 weeks)
Progress (2026-11-07):
- [x] Program binary cache (`ProgramCache.kt`): shader start 2,966 ms to 26 ms on the realme X2. Tested.
- [x] Adaptive quality ladder (`QualityPolicy.kt`): 6 levels, trails first, then particles, then frame rate; steps down after 2 slow windows, climbs after 30 s stable with doubling wait after a failed climb. Written; the step-down and climb paths have **not** been triggered yet (the phone held 57 to 60 fps at full quality).
- [x] System signals (`SystemSignals.kt`): power saver, battery 15% or less, thermal status. Power saver path **tested by accident**: the phone had battery saver on, and the wallpaper dropped to level 2 (no trails, 30 fps) as designed. Thermal path **not verified**: `cmd thermalservice override-status` printed nothing, so no thermal event was simulated.
- [x] Visibility blips do not rebuild the GL context (no rebuild lines in `scratch/visibility-test.log`), so "keep the context" is only needed for real surface destruction. Dropped from the list.
- [x] Quality ladder fixes after stutter was reported (2026-11-07): late frames (over 2.5% of a 2 s window) count as slow; a level that fails is banned 5 min, doubling to 2 h; the last stable level is saved in SharedPreferences `pds` and used at the next start. Cause of the stutter found in the log: each climb back up retried trails, ran at 46 to 50 fps with 53 late frames and a 65 ms gap, then stepped down. Tested on the realme X2; user reports "looks fine".
- [x] Offscreen render target for render scale (`ParticleRenderer`): levels 3 to 5 draw at 80% or 65% size and stretch with a blit. Tested on the realme X2 starting at level 4: no GL errors, 59.5 fps, climbed to level 3 after 30 s, user reports it looks good. Not yet measured: GPU time saved (needs Perfetto or AGI).
- [x] Pack format `pds.effect/1`, validator, loader and mapper (2026-11-07). Decision change from research section C.3: the pack carries the web renderer's own `LiteParams` names (the output of `toLiteParams`), not the raw studio `Params`. So there is no Kotlin port of the studio-to-renderer mapping; it runs once in TypeScript in `scripts/export-pack.mjs`, and Kotlin only validates (`pack/ParamSpec.kt`, `PackConfig.kt`, `PackLoader.kt`). Limits: config 64 KB, image 2 MB and 4 megapixels, nesting 4, strings 256, sha256 on both images, plain file names only. 22 JVM unit tests pass (`./gradlew testDebugUnitTest`), including a golden test that loads the exporter's real output with zero warnings. Tested on the realme X2: packs `spike` and `glass-green` both load, the app lists packs from `assets/packs`, tapping one switches the running wallpaper live, user confirms each looks right. Specification in `docs/PACK_FORMAT.md` is **not written yet**.
- [x] 18 looks supported in the point shader (all dots-base filters except SHAKE-MASK and SOFTWORD): they read a picture-and-depth texture, now uploaded.
- [x] Faithful sampler port (2026-11-07): `Sampler.kt` ports `computeImportanceWeights`, `removeFlatBackground`, `hash01`, the CDF and the particle loop. `SamplerGoldenTest` compares it with the web sampler on 3 synthetic pictures (flat background, cut-out alpha, busy), 500 particles each; golden data from `node scripts/gen-sampler-golden.mjs`. 26 unit tests pass. Runs on the realme X2; pack load time rose from about 0.5 s to about 1.2 to 1.4 s (not cached yet).
- [x] `docs/PACK_FORMAT.md` written.
- [x] SHAKE-MASK and SOFTWORD supported: `GlyphAtlas.kt` ports `glyphs.ts` (platform monospace font, so letter shapes differ slightly from the browser). Pack `shake-mask` exported. **Never seen on a device**: the phone was locked when tested, and later disconnected.
- [x] Phase 3 app UI written, **never run on a device** (phone disconnected). Compose foundation only, no Material look: `ui/Theme.kt` (colours, fonts, text styles from `tokens.css`; Martian Mono and Tektur converted from woff2 to ttf in `res/font`), `ui/Components.kt` (square button, hairline slider with 8 x 14 thumb, grid background), `ui/PackCatalog.kt`, `ui/PreviewView.kt` (in-app GLSurfaceView with the same renderer and gyro), `ui/Screens.kt` (gallery, customise with sliders, saved list, Apply). `Selection.kt` stores pack plus slider changes in SharedPreferences and the running wallpaper updates live; `SavedStore` keeps named wallpapers as small JSON files. Apply opens the system live-wallpaper preview (Android requires the user to confirm) unless our wallpaper is already active.
- [x] Phase 3 feedback round 1 (2026-11-07, realme X2, user report): the app flow works. Fixed: (a) trails were nearly invisible because the web draws a 1 device-pixel line and a phone has about 3 px per dp; trail width now scales with density (`SpikeConfig.TRAIL_WIDTH` 0.6, quads above 1.25 px); (b) the colour slider was `pSat`, which the web calls PARTICLE COLOUR and which only affects drifting particles and trails, so it looked dead while trails were faint; (c) slider names and ranges now come from the web studio's own `index.html` (generated into `ui/WebLabels.kt`): MOVEMENT, 3D DEPTH, SIDE BIAS, VARIETY, PARTICLE COLOUR, PARTICLE SIZE, TRAIL BEND, TRAIL LENGTH, TRAILS, HOVER AMOUNT, OPACITY, SATURATION, SHADOWS, HIGHLIGHTS, plus each look's own labels (GLOSS, RIM, VEIN, DISPERSION ...). Replaced the first draft's FLOW, TILT, RELIEF, LIGHT, COLOUR. 30 unit tests pass, including one that fails if an old word comes back. **Not yet re-checked by the user on the phone.**
- [x] Phase 3 feedback round 2 (2026-11-07): the preview scrolled away with the sliders, so the picture was out of view while adjusting. The customise screen now pins the preview at the top (44% of the height, 9:16) and only the controls below it scroll. Header made one slim row (name left, tabs right, tabs hidden while an effect is open); buttons shortened (34 dp, tabs and list buttons 28 dp). Builds, 30 unit tests pass, installed; **not yet seen by the user**.
- [x] Phase 3 round 2 confirmed by the user ("all work"): pinned preview, slim header, shorter buttons, web slider names, visible trails.
- [x] Settings screen (2026-11-07): third tab SETTINGS with GYRO TURN on/off (off = sensor never registered), GYRO RANGE 12 to 45 degrees, FRAME RATE LIMIT 30 or 60, and DRAW LESS ON BATTERY SAVER on/off. `AppSettings.kt`; the wallpaper reads them each time it becomes visible. Builds, 30 unit tests pass, installed; **not yet used by the user**.
- [x] Preview overlay and rename (2026-11-07): the customise screen has a VIEW button that cycles OFF, HOME, LOCK and draws outlines only (status bar, app squares and dock, or a large clock with the date and the two corner shortcuts) over the preview, to judge how the picture sits behind real screen content; saved wallpapers can be renamed. Builds, tests pass, installed; **not yet seen by the user**.
- [ ] Not drawn yet (skipped with a warning): SHAKE-MASK and SOFTWORD (glyph atlas), glow/bloom/halo/VHS/glitch/grain/holo/duotone/cloud/mesh/stack/bit (Post chain), cell looks (`style` above 0), music, motion, touch.
- [ ] Sampler port (faithful importance weights) with golden tests; pack download and signing (phase 4); gyro polish.

- [ ] Kotlin sampler port (from `src/lite/sample.ts`, `src/core/Sampler.ts`).
- [ ] Param mapper port (`toLiteParams`) with golden tests against TS.
- [ ] Pack loader and validator (size limits, schema version).
- [ ] MVP looks: trails, scan, 3 to 4 filters.
- [ ] Tier probe and adaptive policy (power-save, thermal listener, climb-back).
- [ ] Gyro polish: smoothing, recenter, sensitivity, rotation remap.
Done when: mid tier meets H.5 targets for 1 h on 2 devices; golden diff within tolerance.

### Phase 3: App UI and customisation (about 6 weeks)
Status 2026-11-07: first version written and builds; **untested on a device**. Open: sliders only change numbers (no look on/off toggles yet), no lock-screen/home choice (the system preview asks), no safe-area overlay preview, no clock or notification mock, saved wallpapers have auto names, no process-death test, no accessibility pass.
- [ ] Build UI from the existing design system tokens.
- [ ] Gallery, sliders (basic list in R section G), in-app preview, Apply flow.
- [ ] Saved configs, process-death restore.
- [ ] Settings: fps cap, battery rules, gyro on/off and sensitivity.
Done when: end-to-end journey works on 6 devices; beta users can apply and revert.

### Phase 4: Effect library (about 6 weeks, rolling)
Status 2026-11-07: started. **19 packs** (Fur and Chrome removed after the user's review; Chrome looked poor on sample 8 and the user chose to drop it rather than retry on sample 1) built by `scripts/build-packs.mjs` (one row per effect; pictures shrunk to 768 px with `--max-side`, JPEG input accepted, PNG output): Plain dots, Glass Green, Candy, Shake Mask, Chrome, Ecstasy, Chroma 2, C-ABR, Blood, Prismatic, Blight, Convulsions, Blend, Aura, Redmet, Lined, Softword, Rock, Arancia, Cumulus (Chrome dropped). Pack folder total 9.2 MB; debug APK 25 MB. Tests: every pack validates with zero warnings and builds its sliders (30 unit tests pass). User review of the gallery (2026-11-07): Chrome looked poor and Fur was not a good effect; both handled. The other looks were not flagged. To compare a look with the web studio, `scratch/shot-look.mjs <category> <styleId> <slots>` renders it headless (scratch, untracked).
Not started: signing, pack download or import from storage, per-pack GPU cost check, more filters (each needs GLSL + spec entry).
- [ ] Web exporter for packs (`.pdspack`), signing.
- [ ] 10 to 15 packs; more filters (each needs GLSL + mapper + golden test).
- [ ] Per-pack performance budget check.
Done when: every pack passes its tier budget; invalid packs are rejected in tests.

### Phase 5: Production readiness (4 to 6 weeks)
Status 2026-11-07: started with the build side only.
- [x] Release build: R8 shrinking and resource shrinking on (`isMinifyEnabled`, `isShrinkResources`, `proguard-rules.pro`), no signing key in the repo. Signs from environment variables `PDS_KEYSTORE`, `PDS_KEYSTORE_PASSWORD`, `PDS_KEY_ALIAS`, `PDS_KEY_PASSWORD`; without them `./gradlew assembleRelease` makes `app-release-unsigned.apk`. Result: **10.3 MB** (debug is 25 MB). Signed with the local debug key for a test only, installed over the debug build and launched on the realme X2 with no crash. The wallpaper itself (service, GL, packs) was **not** exercised in the release build yet.
- [x] FAITHFUL / SUBTLE / EXPRESSIVE presets for Glass Green, Candy and C-ABR (the three looks the web studio gives presets), copied into `ui/Presets.kt`; `PresetsTest` reads the web `src/core/styles.ts` and fails on drift. 33 unit tests pass.
- [x] Release build confirmed by the user ("works", 2026-11-07).
- [x] Accessibility first pass: buttons have the Button role and a selected state, sliders expose their range and accept TalkBack's swipe to change (`setProgress`), gallery cards have a name description. Reduced motion: when Android's remove-animations setting is on (and the new setting STILL WHEN SYSTEM REDUCES MOTION is on, default on) the particle clock holds still, so no drift, trails or sway, while the turn with the phone still works. Builds, 33 tests pass, installed; **not tested with TalkBack or the system setting**.
- [x] Gallery thumbnails are now the real effect (2026-11-07): `ui/ThumbMaker.kt` draws each pack offscreen (EGL pbuffer, 270 x 480, 50,000 particles, about 1.5 s of motion) with the wallpaper's own renderer, caches the PNG under a name that includes a hash of `pack.json`, and the gallery swaps the source picture for it when ready. All 19 packs rendered on the realme X2 in under 40 s with no error. **Side effect: the thumbnails can be pulled over adb for visual review without unlocking the phone** (`adb exec-out run-as app.particledepth.wallpaper cat cache/thumbs/<file>`). First visual review (by me, contact sheet): glass-green, candy, c-abr, chroma-2, ecstasy, blood, redmet, lined, softword, shake-mask, prismatic and plain dots look right; aura reads as a flat white bust (glow not obvious); arancia, cumulus and rock sit on the small square sample 3 and look small and abstract; blend, blight and convulsions look plain. Not yet judged by the user.
- [x] Pack picture review round (2026-11-07, from the phone's own thumbnails): Arancia and Cumulus moved to sample 7 (orange and white, much better than the small abstract sample 3); Rock moved to the bust, sample 10 (reads as dark stone); Aura moved to sample 9 with stronger settings (shows a white rim light; the glow stays subtle). `scripts/build-packs.mjs` now accepts JPEG sources. 33 tests pass.
- [x] Pack import (2026-11-08): `.pdspack` zip import from the file picker (`pack/PackSource.kt`, `pack/PackImporter.kt`, IMPORT button, imported effects marked `*` and deletable), exporter `--zip`. Hardened reader (3 flat entries, size caps, zip-bomb cap, hash and pixel checks, built-in ids protected). 45 unit tests pass. Verified on the realme X2 through a debug-only test hook: a good pack imported and got a thumbnail; a tampered picture, a built-in id and a path entry were each refused. **The IMPORT button and the system file picker were not tapped by a person yet.** This is the route for the user's own photos: process them in the web studio (depth), export a pack, import on the phone. On-device depth from a photo is still not built.
- [x] Photo import and look picker (2026-11-08, after the user's report that IMPORT on a gallery photo said "archive has no pack.json" and also offered videos; IMPORT had been written for `.pdspack` zip files, not photos): the gallery now has **ADD PHOTO** (system picker restricted to `image/*`, so no videos) and **IMPORT PACK** (zip files). A photo is decoded and shrunk to 768 px (`PhotoImporter`, EXIF rotation applied), a rough depth map is estimated on the phone (`DepthGuess`: flat-background cut-out or distance from the border colour, blurred, blended with a centre weight; **approximate, no neural network**), and it is stored as a plain-dots effect, then the app opens its customise screen. New **LOOK** row on every customise screen switches between 18 looks and PLAIN (look switches are stored as `flag:` overrides, so they save, restore and apply to the running wallpaper); the slider list follows the chosen look. Checked on the realme X2 through the debug hook: a real photo imported (its depth map shows a soft figure against a light backdrop, which is the intended quality), a non-picture was refused with a clear message. 49 unit tests pass. **Not tapped by a person yet**: ADD PHOTO, the gallery picker, the LOOK row. Limits: the depth is a guess, so busy photos get a weaker depth than the web studio's model would give; an on-device neural depth model (about 25 to 100 MB plus a runtime) is the upgrade and needs a decision.
- [ ] Not started: a real signing key and Play App Signing, 8 h and 24 h soak, battery and thermal acceptance, other devices, crash reporting, accessibility (reduced motion, TalkBack labels, contrast), store listing and policy check, privacy statement (the app collects nothing and has no network permission).

- [ ] 8 h and 24 h soak on the device matrix; OEM matrix.
- [ ] Battery and thermal acceptance (R section H.5, PROPOSED targets).
- [ ] Android vitals, crash reporting, reduced-motion handling.
- [ ] Play listing; policy check on shaders (R risk R6).
Done when: soak clean, closed beta vitals under Play thresholds, policy sign-off.

## 6. Tracker

Update this table, not the phase text above, when progress changes.

| Phase | Status | Started | Finished | Blocker | Notes |
|---|---|---|---|---|---|
| 0 Prep | done except devices | 2026-11-06 | 2026-11-06 | test devices (Q1) | Project builds, shader export works. Not committed yet. |
| 1 Spike | running on 1 device, not complete | 2026-11-06 | | needs more devices, battery and thermal runs | Works on realme X2 (Android 11, Adreno 618): renders, gyro tilts, visibility pauses. Go/no-go not written. |
| 2 Native render | mostly done | 2026-11-07 | | post-processing looks, SHAKE-MASK/SOFTWORD checked only by thumbnail | Cache, ladder, render scale, sampler port, packs, all done and tested on the phone |
| 3 App UI | first version working | 2026-11-07 | | user testing of the newest screens | Gallery, customise, saved, settings, overlay, presets, look picker, photo import |
| 4 Library | started | 2026-11-07 | | signing, download | 19 packs, `.pdspack` import |
| 5 Production | started | 2026-11-07 | | devices, soak, store | Release build 10.3 MB, accessibility first pass |

Status values: not started, in progress, blocked, done.

## 7. Measurements log

Add a row for every device test. TESTED means measured on a device in this table.

| Date | Device | Android | Build | Particles | Scale | fps | GPU ms p95 | Battery %/h | Temp | Gyro ok | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-06 | realme X2 (RMX1992), Adreno 618 | 11 (SDK 30) | phase 1 debug | 100,000 | 1.0 | 59.9 (60 cap), 29.8 (30 cap) | not measured | not measured | not measured | yes, by feel | CPU per frame about 1.5 ms (GL calls + swap, not GPU time). Shader compile 2,966 ms first start, 26 ms from cache. Max vertex uniform vectors 256, point size 1..1023. 30 fps felt slow, 60 fps felt good. |

Tuning decided by feel on this one device (2026-11-06): 60 fps, tilt easing 12/s, tilt centre follows the phone (2.5 s), depth 0.3, pan 0.35, zoom 0.8 contain.

Findings that change the plan:
- `SurfaceHolder.setFixedSize()` throws in a wallpaper on this device ("Wallpapers currently only support sizing from layout"). Render scale must come from an offscreen target (phase 2).
- A fixed tilt centre was wrong when holding the phone at about 70 degrees; a slowly following centre fixed it.
- A program binary cache cuts shader start from about 3 s to 26 ms.

## 8. Open decisions

| # | Question | Needed by | Owner | Answer |
|---|---|---|---|---|
| Q1 | Which devices do we test on? | P0 | | |
| Q2 | Which effect is the spike effect? | P0 | | |
| Q3 | Which filters are in the MVP (R section K, item 6)? | P2 | | |
| Q4 | Gyro on or off by default (depends on battery result)? | end of P1 | | |
| Q5 | Pack format: zip with manifest or folder; who holds the signing key? | P4 | | |
| Q6 | Is tablet or foldable in scope for v1? | P3 | | |
| Q7 | Does Play policy accept GLSL shaders as data? Written answer needed. | P4 | | |

## 9. Risks (short list, full list in R section J)

| Risk | Mitigation |
|---|---|
| OEM background killing, lock-screen inconsistency | Device matrix, heartbeat recovery, treat lock screen as best effort |
| Battery and heat over hours | 30 fps default, adaptive ladder, soak tests |
| TS and Kotlin drift | Shader export script, golden tests |
| Gyro drains battery or misbehaves on lock screen | Register only while visible, measure in P1, setting to turn it off |
| Port larger than expected | P1 go/no-go before committing to P2 |

## 10. Change log

| Date | Change |
|---|---|
| 2026-11-08 | Photo import (ADD PHOTO, pictures only, estimated depth), IMPORT PACK for `.pdspack`, LOOK picker; fixes after the user's report that IMPORT rejected a gallery photo. Three commits so far on `master-web`: `0e57062`, `b6bc45c`, `846532f`; a fourth closes this session. |
| 2026-11-07 | Phases 0 to 2 run on the realme X2; phase 3 UI written and refined over four feedback rounds; phase 4 started; phase 5 started. Details in the phase sections above. |
| 2026-11-06 | File created. Research complete. Gyro tilt added to scope on user request. |
| 2026-11-06 | Phase 1 code written (service, EGL14 thread, renderer, simplified sampler, gyro). Builds; not run on any device. Known phase 2 items: keep the GL context across surface recreate, cache the program binary, `postDelayed` pacing instead of waking every vsync, leaky recentre for gyro, real sampler port. |
| 2026-11-06 | Phase 0 built: `android/` project, `scripts/export-shaders.mjs`, spike pack. Debug APK builds. Observed: `point.vert.glsl` is 77 KB, so shader compile time on mobile GPUs is the first thing to probe in phase 1 (risk R5). |
