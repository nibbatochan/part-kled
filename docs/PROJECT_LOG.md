# Project log: Particle Depth Studio

A running record of the major changes, decisions and directions of this project, written so it can be turned into a portfolio case study later. Newest entries go at the top of the timeline. Each entry says what changed, why, and what it shows about the work. Facts are taken from the git history and the working sessions; numbers marked "measured" were measured in a browser test, and anything not verified says so.

## 1. The project in one paragraph

Particle Depth Studio turns a photo into a depth-driven 3D particle animation that runs in the browser. A depth model estimates how far away each part of the picture is, hundreds of thousands of particles are placed on the picture by brightness, and the particles drift, trail, react to the cursor, tilt in 3D, and morph from one picture to the next. The same engine builds as a small embeddable header (`<particle-hero>`) for a portfolio site, and as a "web studio" that runs on a much lighter renderer so it works on ordinary laptops and phones. Credit line: BY SUMANTH REDDY.

## 2. Stack and shape

- **Language and build:** TypeScript, Vite, vanilla DOM UI (no React in the core), vitest for unit tests, Playwright scripts for browser checks.
- **Rendering:** WebGL2 only. Two renderers on one set of controls:
  - the original **GPU simulation** (524,288 particles, ping-pong position and velocity in shaders, three.js), and
  - the **lite renderer** (`src/lite`), raw WebGL2, no framebuffers, where every particle's position is a pure function of its home, a hash of its id, and time. This is the web studio's engine.
- **Depth:** Depth Anything V2 Small through `@huggingface/transformers`, WebGPU (fp16) with a WASM fallback (q8), 768 px working size, later moved into a worker.
- **Export:** a second off-screen engine at the exact output size, WebCodecs plus Mediabunny for video, loaded only when needed.
- **Branches:** `master-studio` (full GPU studio), `master-web` (web studio on the lite renderer).

## 3. Timeline of major milestones

### 2026-11-11: effect-recreation skill (phase T4)
- What changed: new project skill `.agents/skills/effect-recreation/SKILL.md`: the seven steps, the feasibility report with class rules and the stop rule, the recipe shape, the iteration loop. `effect-maker` stays as the build step.
- Why: the old skills built one layer, checked nothing against the reference, and never asked first whether the look was possible.
- Evidence: a test agent given a reference and "I'm in a hurry, just build it" stopped at the feasibility step and wrote the report. It found six gaps (UI in the screenshot, a loose step-1 exit, several questions at once, "central" undefined, a wrong pointer, the brand rule); all fixed. Only one reference was tried.
- Not done: recipe files are not read by the studio yet (a recipe is a record, not code); no Post.ts passes added.

### 2026-11-11: Effect gate on the real canvas (phase R1, reduced)
- What changed: `scripts/score-look.mjs` draws a look in the studio (clicking its real tile, motion off), scores the canvas against a reference and against the ceiling `B_max` (the reference as plain dots) with `tools/analyze/gate.py`. `scripts/lib/still.mjs` is the shared screenshot code. `image-to-effect` step 4 now uses it.
- Why: the old gate judged CPU bakes the studio never runs.
- Decision: the owner chose to keep treatments shader-side (no picture pre-pass), so R1 became a measurement change only.
- Evidence: glass reference, original source picture: plain DOTS 47.3, REFRACT GLASS 45.9, NEON TUBE 33.8, against a ceiling of 73.3. So today no look beats plain dots on that reference. Scores are uncalibrated.
- Not committed: the `effect-maker` skill edit, because it sits on the owner's uncommitted skill rewrite.

### 2026-11-12: Grade, 16-bit and blue grain, phase R3
- What changed: three new options in the finish block (STACK, Effect tab), all off by default. 16-bit scene and glow chain (falls back to 8-bit when the device cannot; `Post.hdrActive` tells which). LUT grade with 8 grades in one atlas `public/luts/grades.png` (81 KB): AMBER, FADE, NEON, FILM (slay, CC BY 4.0), DUSK (t0saki, MIT), generated NEUTRAL, B&W and CROSS. Blue-noise option for the film grain (`public/noise/blue64.png`, 4 KB, Christoph Peters, CC0). Atlas built by `tools/luts/build_atlas.py` from `docs/effect-library/luts-source/` (sources, licences, checksums in `SOURCES.md`). Plan: `docs/superpowers/plans/2026-11-12-r3-hdr-lut-noise.md`.
- Evidence: `node scripts/verify-finish.mjs` passes (each of the 8 grades and the blue grain changes the frame, switching off restores it, no GL errors). Hero bundle 197.37 kB gzip.
- Honest result on 16-bit: on the statue it changes the frame by 0.016 grey levels on average and the glow has 72 distinct levels against 71 in 8-bit, so the gain is too small to see here. It helps only where soft glows band. Kept as an option, off by default.
- Test lesson: the panel replaces the app's params with its own copy on every click, and a paused app applies panel changes on a 500 ms tick. The first version of the R2 check set bloom on the app's copy, so its "tent" and "mix mode" results compared a frame with glow against one without. Fixed in this round (settings now go through the panel's copy); the R2 results were re-run and pass.
- Not done: no separate test for a failed or slow atlas load (the code skips the grade until the texture arrives); no look at 64 px tiling of the blue noise at large grain cells; Android does not get these.

### 2026-11-12: Finish passes, phase R2
- What changed: seven new passes in `src/lite/Post.ts`, all off by default: radial colour fringe, vignette, mix mode (SCREEN, ADD, SOFT), paper field, soft fill, smooth (tent) bloom, horizontal streak. New fields `finish.*` and six `...On` flags in `params.ts`; controls sit under STACK in the Effect tab ("finish"). Plan: `docs/superpowers/plans/2026-11-12-r2-post-passes.md`.
- Evidence: `node scripts/verify-finish.mjs` passes 25 checks (each pass changes the frame, switching it off restores it exactly, resize with all on, EFFECTS RESET clears them, no GL errors, 390 px has no sideways scroll). Hero bundle 197.3 kB gzip, under the 200 kB budget (this tree also holds other uncommitted work).
- Not done: the `adapt()` "halve post resolution" rung (frame time could not be measured in the test browser, it is capped at 60 Hz); paper colour has no picker; Android does not get these passes (post chain not ported); Score B not yet measured on glass and soft references. All strengths are by eye.

### 2026-11-12: Score calibration and absolute pass mark 75 (phase T3)
- What changed: `tools/analyze/calib.py` and `scripts/calib-render.mjs` build a blind rating set (16 pairs: damaged copies of four references plus the studio look meant to match each); the owner rated them 0-100; `calib.py fit` compares the score with the ratings. Data in `docs/effect-library/calibration/`.
- Result: score vs ratings Spearman 0.60. Close copies (rated 90-100) scored 77.8-96.2. Studio looks (rated 10, 10, 20, 50) scored 45.9-57.0. A heavy blur rated 50 scored 70.8, so a raw threshold near 75 separates this sample, 70 does not. Fitted weights ranked worse (0.53) than the current ones, so weights are unchanged.
- Finding: the ratio-to-ceiling gate (0.70 of `B_max`, about 51 here) would pass prismatic (rated 20, score 57.0). The ceiling needs anchoring with owner ratings of plain-dots renders.
- Plain-dots anchor: 4 more pairs (reference vs plain dots) rated 0 by the owner, yet they score 37-55. With all 20 pairs Spearman is 0.77 and ratings reach 70 at a score of about 60.
- Decision (owner): gate passes on an absolute Score B of 75, paired or unpaired. `B_max` (plain dots, about 45) is the floor, the ratio is information only. Rejected: ratio 0.70 of `B_max` (would pass prismatic, rated 20). Weights unchanged; the NNLS fit put 91% on edges and is trained on the same pairs.
- Limits: 20 pairs, one statue, mostly synthetic damage, one rater. 75 is still uncalibrated beyond this sample.

### 2026-11-11: Panel flow, tabs for effect, image, emitter and video
- What changed: the side panel now has the five picture slots and a tab bar (EFFECT, IMAGE, EMITTER, plus VIDEO in the video view). Sections were moved, not edited. New `src/ui/panelTabs.ts`; `Thumbs.ts` always draws five slots; first load has emitters off (`withEffectsStart`).
- Why: the panel followed no working order, so a new user could not tell what to do first.
- Decisions: the open tab is not remembered across reloads; the Video tab exists only in the video view (the lab hides that section); the Effects box still uses lowercase text and larger labels unlike the other boxes (left for a design decision).
- Evidence: 63 unit tests, `tsc` clean, `scripts/verify-panel.mjs` passes at 1440 and 390 px. Spec and plan in `docs/superpowers/`.

### 2026-11-11: Scoring and analysis tools (phases T1 and T2 of the research)
- What changed: `tools/analyze/` (`fx.py`, `score.py`, `analyze.py`, `selftest.py`) and `scripts/shot-still.mjs` (motion-off canvas screenshot). No engine or shader change.
- Why: no effect was ever measured against its reference. `score.py ref out` gives a paired similarity or an unpaired style score; it refuses when it cannot align. `analyze.py` measures palette, tone, edge width, glow radius, grain, halftone, chromatic aberration, vignette.
- Decision: scikit-image only, no new installs. Weights and divisors are proposals, labelled uncalibrated in every output.
- Evidence: selftest passes; the glass look scored 73.2 against its own dots screenshot and holo against that shot scored 53.1. Not yet calibrated with owner ratings (phase T3).
- Not done: wiring the picture pre-pass (R1), skill rewrite (T4), new post passes.

### 2026-11-11: Research on recreating reference images as a stack of treatments
- What changed: `docs/RESEARCH_EFFECT_RECREATION.md` (research only, no code).
- Why: effects made with the effect-maker skill were far from their reference images.
- Findings: the skill's gate judged CPU bakes (`treatBake.ts`) that the studio never runs; nothing was measured against a reference; references are stacks across picture, dots and final frame, while the workflow built one layer.
- Proposal: a layer model (picture pre-pass, per-dot finish, post chain), an analysis script, a composite similarity score, a feasibility gate, and an effect recipe as data. Not built yet.
- Evidence: treated picture against its own dots screenshot scored SSIM 0.15-0.25 raw and 0.63-0.67 at 8 px blur (4 looks, rough alignment). Score weights and the 70% threshold are not calibrated.

### 2026-11-06 to 2026-11-08: Android live wallpaper app, built and tested on a phone
- What changed: a native Android app in `android/` (Kotlin, EGL14 and GLES 3.0) that draws the web studio's own shaders as a live wallpaper, with gyro tilt in place of the hover tilt, an adaptive quality ladder, a pack format for effects (`docs/PACK_FORMAT.md`), a Compose app built from the web design system, 19 effect packs, photo import and pack import. Plan, tracker, measurements and every decision: `docs/ANDROID_SCOPE.md`. Research behind it: `docs/RESEARCH_ANDROID_LIVE_WALLPAPER.md`.
- Why: the same render, kept as a phone wallpaper, with the web studio staying the editor.
- Decisions: native renderer porting `src/lite/` (no WebView); one shader source (exported from `src/lite/shaders.ts`); effects are data (packs carry the web renderer's own setting names, produced by the web `toLiteParams`, so nothing is re-implemented in Kotlin); packs are validated like untrusted input.
- Evidence (realme X2, Android 11, Adreno 618): steady 60 fps, about 1.5 ms CPU per frame; shader start 2,966 ms down to 26 ms with a program binary cache; release APK 10.3 MB; 49 JVM unit tests. Not measured: battery, heat, GPU time, a second device.
- Portfolio note: the phone's own offscreen thumbnails made it possible to review every effect without touching the screen; the sampler was ported to Kotlin and checked against the web sampler number for number.

### 2026-11-02: C-ABR filter (GLASS category)
- New category GLASS in LOOK_CATEGORIES. Filter on the dots, slot 42: dark smoked obsidian glass with prismatic chromatic aberration caustics and slick high-gloss specular reflections derived from the classical bust paired reference. Curvature and depth gradients tilt dots into surface normals; wavelength-dependent refractive dispersion splits internal transmission along slopes and draped folds into vivid spectral rainbow bands (cyan, amber, magenta, cobalt), while razor-sharp specular crests and dual-tinted Fresnel rim lighting catch curved ridges. Controls: DISPERSION, GLOSS, RIM with presets (FAITHFUL, SUBTLE, EXPRESSIVE).
- Evidence: tsc and 39 tests pass; automated headless browser test (`scripts/verify-cabr.mjs`) verified in Chromium with zero WebGL errors and screenshots saved to `docs/screenshots/cabr/`.

### 2026-11-02: CANDY filter (SURFACE category)
- Filter on the dots, slot 41: glossy translucent orange candy / molded gelatinous resin derived from the paired classical bust reference. High internal volume scattering (subsurface transmission) illuminates thin features, deep caramelized amber shadows, slick specular highlights, and curved Fresnel rim glints along crests and folds. Pure black grounds stay untouched. Controls: GLOSS, GLOW, TONE with presets (FAITHFUL, SUBTLE, EXPRESSIVE).
- Evidence: tsc and 39 tests pass; automated headless browser test (`scripts/verify-candy.mjs`) verified with zero WebGL errors and screenshots saved in `docs/screenshots/candy/`.

### 2026-11-02: ROCK remade from the marble-to-dark-stone pair
- ROCK now reads the pair (white marble bust, same bust as dark weathered granite): the picture's form through a steep curve, lit from the upper left (warm grey faces, near-black shadow, pale crest highlights), mottled granite with pale and dark mineral flecks, chipped pale edges, and dark fissures with a pale chipped lip that gather along edges and in patches. Controls keep their names: CRACKS, GRAIN, WEAR.
- Evidence: tsc and 38 tests pass; checked in the browser on slot 5 (the statue). Not tried on non-statue subjects after the remake.

### 2026-11-02: CHROMA 2 remade from a statue pair; slot 5 is now the statue
- Slot 5 sample is the marble bust (public/samples/sample-10.png, a cut-out) with a baked depth map (sample-10-depth.png: inflated silhouette plus brightness), so it loads instantly. sample-9 stays on disk but is no longer in the default five; main.ts lists sample-10.
- CHROMA 2 now reads the pair (marble source, blue-steel target with an orange key light): normals from brightness slopes plus depth, cool blue steel on left-facing surfaces, orange-red on right-facing ones, deep navy folds, narrow cool and warm highlights. Controls keep their names: RIM, SPECTRUM, BEVEL.
- Evidence: tsc and 33 tests pass; checked in the browser on slot 5. The depth map is a heuristic, not the depth estimator.

### 2026-11-02: ROCK filter (SURFACE)
- Filter on the dots, slot 38: carved stone like a chiselled concrete letter. Charcoal shade, warm grey lit faces, fine salt-and-pepper grain, pockmarks, pale chipped edges where the picture's planes meet, and pale jagged cracks branching through the dark in patches (warped cell net plus a finer branch net). Controls: CRACKS, GRAIN, WEAR.
- Evidence: tsc and 33 tests pass; checked in the browser on samples 1 and 4. Not compared on a block-letter subject like the reference.

### 2026-11-02: SURFACE filters rebuilt as real materials (ARANCIA, FUR, CLOUD)
- Problem: all three only nudged the source colours with small noise, so no surface showed. Fix: each now builds its own surface in the dot shader. A procedural height field gives normals, light comes from the upper left, and the picture supplies form (brightness) and where the material is.
- ARANCIA: orange albedo ramp, lit pit pores, cracked pith ridges and juicy pulp patches, wet spec. FUR: dark undercoat, thin strands that follow a swirling direction field, lit sides and bright tips. CLOUD: billowing warped-noise height, wrapped light, white tops and blue-grey hollows, feathered edges.
- Evidence: tsc and 33 tests pass; checked in the browser. The pane's dot cloud is sparse, so grain looks speckled there. Not compared against the reference photos on matching subjects.

### 2026-11-02: ARANCIA filter (SURFACE)
- Filter on the dots, slot 36: a citrus skin. Fine dimpled pores, a pale pith web cracking over the pulp in patches, a soft wet gloss. It acts on the coloured parts only, so grey grounds stay as they are. Controls: PORES, WEB, GLOSS.
- Decision: slot 35 belongs to CLOUD (built in parallel), so ARANCIA took 36 and STYLE_NAMES got a CLOUD placeholder at 35 to keep the indexes aligned.
- Evidence: tsc and 33 tests pass; checked in the browser on sample 3. Not compared on an orange fruit.

### 2026-11-02: SURFACE category, FUR filter
- New category SURFACE with one filter on the dots, FUR (slot 34): a short felt pile like a tennis ball. Fibres lie in smooth swirls, tips catch light, gaps shade, bright edges against dark fray. Controls: PILE, LENGTH, FUZZ.
- Evidence: tsc and 33 tests pass; checked in the browser on sample 4 (fibre grain and a frayed edge show). Not compared on a bright, round subject.

### 2026-11-02: SHAKE-MASK look (TEXT category)
- Filter 31 on the dots base (first built as a cell look, redone because it carried cell size and gap): the photo smeared sideways with the word "shakemask" showing through in noise patches, drawn by the dots themselves from the glyph atlas (4th row). Pale letters on dark, dark on light. No cell grid, no cell size, no gap.
- Why: a reference of a blurred photo with sparse repeating letters. Controls: SMEAR, COVER, PATCH SIZE.
- Evidence: tsc and 33 tests pass; checked in the browser on sample 4 (letters read as dots). Not compared on a bright picture.

### 2026-11-01: console restructure (LOOK, LIGHT, MOTION, PARTICLE EFFECTS, COLOUR)
- LOOK: one dot per look type with its name beside it; only that type's looks are listed; the top right shows the look in use. Showing a type does not pick a look.
- MOTION now holds the motion effect, GLITCH (VHS and glitch) and GRAPHIC (STACK). The SIGNAL and GRAPHIC boxes are gone.
- PARTICLE EFFECTS is its own box: preset, MOVEMENT, 3D DEPTH, SIDE BIAS.
- COLOUR is one custom picker (square, hue, RGB sliders and numbers, hex) for ink, background, halo, shadow, highlight, cloud and lines. It drives the existing hidden colour inputs, so their bindings are unchanged.
- Why: the effects list was too long to scroll.
- Evidence: typecheck, 33 tests and build pass. Browser: LOOK type switching and the COLOUR picker checked. Not checked: the motion and glitch groups on screen after the move.

### 2026-10-31
- **Music panel trimmed.** Removed: MIC source, CALM, WAVE look, and the BARS, MIRROR and LINE equalizer styles. Added SPARKS (dots rising from the middle line and fading, spread sideways). AMOUNT moved into the LOOK group. Equalizer bars peak at 70% height so high bands keep moving. The equalizer now follows the picture's float offset, which was the misalignment. Decision: keep the music panel to what the owner uses; reactions stay on clicks. Checked: typecheck, 33 tests, build, and the browser with fake band data. Not checked: real music, a phone.
- **Equalizer back in MUSIC, with five particle styles; no kick.** The equalizer is inside MUSIC again, with DOTS, BARS, MIRROR, LINE and CROSS, one SIZE slider, and it runs together with the picture's particles. Music no longer drives the burst ring or the sweep (reactions to clicks stay the user's). Decision: keep click reactions separate from the music.
- **Equalizer as particles; traits removed.** The trait editor and its settings are gone. The equalizer is a separate section above LOOK, drawn as particle columns in the picture's colours (own shader, stateless) with its own auto gain per column so it moves the full height. Decision: the equalizer is a particle layer, like the picture, not a 2D overlay. Not yet judged on real music or a phone.
- **Equalizer beside the picture.** Five presets (BARS, DOTS, MIRROR, LINE, CROSS) drawn in the margins left and right of the picture, in the picture's own colours, centre left clear. While on, the particles are scaled to 35 percent. Trails now shed by EMITTERS region too. Decision: a 2D canvas overlay, not the particle shader, so the bars stay crisp and simple. Not yet judged on real music or a phone; the owner judges the look.
- **Music feedback round: TRAITS and fixes.** Owner feedback: LISTEN good; EQUAL too dominant; BLOOM spreads pixels and ignored AMOUNT; RIPPLE moves the background; VORTEX looks bad. Done: VORTEX removed; EQUAL height follows AMOUNT and is smaller; BLOOM is a small nudge tied to AMOUNT; RIPPLE is one ring that moves only the dots it passes. New TRAITS editor: any number of traits, each mapped from a part of the sound to one setting, with picture settings capped small and particle settings high impact. Decision: traits are frequency-based. Naming instruments (saxophone) would need source separation, which is out of scope for now; say so to the owner. Not yet: a browser check of each look on a real song and phone.
- **Music looks: the particles show the sound.** Six looks (EQUAL, LISTEN, BLOOM, RIPPLE, VORTEX, WAVE) act on the particles in the shader instead of the sweep or the click ring, which are switched off while a look is on. The sound is 32 log bands plus a 32-column waveform, smoothed on the CPU and passed as uniforms, so the stateless design holds. Decision: the look is a user choice in MUSIC, default OFF. Checked: all seven compile, each changes the picture against rest with sound, and each keeps moving. Not checked: judgement of how they look on real music and on a phone; that is the owner's call.
- **Music: Phase 1 built.** A MUSIC section (FILE, MIC, TAB SOUND, AMOUNT, CALM) moves the particles with sound. Bands, noise gate, auto gain and beat detection are in `src/audio/features.ts`; the mapping with attack and release is in `src/audio/AudioMap.ts`; the engine takes offsets through `LiteEngine.setAudioMod()` plus a beat ring `kick()`. Decision: the shader clock became an integrated phase that runs at the music's pace, so loudness speeds things up with no jumps (measured 1.24x typical frame change at the switch, versus 3.04x for the old live SPEED change). Safety rules from the research are built in: at most 3 beats a second, brightness swing capped at 15%, no audio on opacity, reduced motion cuts the strength to a quarter. Deviation: CALM starts off, not on, so the effect is visible at first run. Tested with a synthetic kick drum and a generated WAV; not yet with a real song, a phone, or TAB SOUND on Windows Chrome. Next: Phase 2, package as a Lively and Wallpaper Engine wallpaper (first check WebGL2 works inside both).
- **Research: audio-reactive wallpaper and website embed** (`docs/RESEARCH_WALLPAPER_MUSIC.md`). Direction chosen: first an audio module in the web build, then package the lab as a Lively wallpaper (free) and a Wallpaper Engine project, because those hosts already capture system audio so any app's sound works with no extra step; then a `<particle-lite>` web component for hero and footer use. Decision: never scale the speed or scan rate live (it makes particles jump); drive a CPU-side accumulated clock instead. First thing to check: WebGL2 inside both wallpaper hosts (the docs do not say). Nothing built yet.

### 2026-10-28
- **Sidebar small fixes.** Changed-from-start-look dot on Reactions, Particles and trails, Colour and tone and Emitters; a RESET per section (Colour and tone keeps its own); a PICTURE COLOUR / GREY switch; a "?" shortcuts popover; the picture hash removed from the readout; `worker.format: 'es'` in `vite.config.ts`, which fixes `npm run build` for the depth worker; dead Panel bindings for travel, swatches and light removed. Checked in a browser; not committed yet.
- **Sidebar Phase 2.** Motion presets (Calm, Flow, Storm; no chip lit when values are custom), sweep style and power as always-visible chips instead of a hidden cycle button and stepper, header switches for the light sweep and trails, and per-look settings behind a "More for this look" disclosure. Checked in a browser; the user test is still not run.
- **Sidebar review and Phase 1 redesign.** A sourced UX review (`docs/RESEARCH_SIDEBAR_UX.md`) counted 94 controls in the app, 48 of them plain sliders, with 41 controls on screen at first load and every section open. Phase 1 changed structure only: the three sections a first-timer needs (Picture, Look, Motion) stay open; Reactions, Particles and trails, Colour and tone and Emitters start closed with a one-line live summary (for example "SIZE 0.45 · TRAILS 110%"); Emitters moved last as the advanced section; jargon labels renamed (LEAN to Side bias, PART SAT to Particle colour, TRAIL DIR to Trail bend, SCANNER to Light sweep, HOVER to Cursor push); label collisions removed (three different "ANGLE"s, two "PAPER"s, two "SIZE"s); labels sit above the sliders so longer names fit; the nine emitter sliders have visible names; Export is a labelled header button; CELL SIZE hides for the dots look. A real bug the review found was fixed: the colour-and-tone RESET also reset the trail sliders. Open state is remembered. Decision: collapse with `aria-expanded` headers and multiple sections open at once, because the research found accordions suit independent sections and warn against hiding what most people need. Evidence: the closed summaries and the reset fix were checked in a browser; the user test with five first-time users from the review plan has not been run yet.
- **Video clips as a source with keyframe depth, and depth estimation moved to a worker** (`5fc9738`, `32b31a9`). Play, scrub and loop a clip while depth is estimated on keyframes; the model now runs off the main thread so the page stays responsive.
- **PULSE scan rebuilt as light on a surface.** The old pulse was a wave through depth and read as a round shape. It is now a moving light that flashes where the depth map turns to face it and the picture is bright, plus a soft sheet of light over bright parts. Dark parts stay dark.
- **3D drag direction fixed.** Vertical drag was inverted against horizontal; verified by measuring which edge comes nearer after a real drag.

### 2026-10-27 (the big day: web studio polish, styles, export)
- **Cell-grid particle looks** (`bd5037e`). Halftone, mosaic, dither, ASCII, stipple and lines rebuilt as one instanced grid glued to the picture. Details in section 4.
- **Export dialog from the header** (`ce089ce`, `bd5037e`). Image, video and seamless loop at 480p to 4K, aspect ratios for phones, square and ultrawide, a live preview with zoom and drag. Details in section 4.
- **Emitters panel, dimmer pulse, export trail fix, trail fade on morph** (`c275db1`). A 3 x 3 map of sliders steers where particles leave the picture from, so dense or boxy pictures (lots of text on one side) look better.
- **Editable number box on every slider**, shown only when the value is clicked (`1dfcb16`, `cfe9e1b`).
- **Trail rework.** Trails visible at any flow, doubled trail amount, a trail length that runs -1 to 1, and a trail that stops at its home pixel (`942c664`, `1b9f654`, `1dfcb16`).
- **Initial settings and layout.** Tuned start values (flow 30%, angle 31 degrees, strength 55, particle size 0.45, random 10%), canvas tools row (pan, 3D, full screen) with 3D drag and wheel, grouped pan controls.

### 2026-10-26 (web studio is born)
- **`master-web` and the WebEngine adapter** (`bbe112f`). The studio's controls and feel running on the light renderer, with a lite sampler, effects, scan and burst.
- **Match the studio's look** (`1cf3ace`): picture size, brightness and grain tuned until the two renderers agreed (mean brightness 10.1 studio against 10.5 web).
- **Compact console and controls** (`eabe209`, `d76522f`, `80b8eae`): LEAN as an origin bias, PAN, BURST folded into the scanner, per-image settings, index-matched morph between pictures, loader capped at 100%.
- **UI revamp** (`f3fe118`, `5b7abfe`): techy boxed console on a grid, stage on the left, dark only, greyscale with one green mark.

### 2026-10-25 (the original studio)
- **Scaffold, upload, hash readout** (`4a9f374`), then **524k GPU particle simulation, depth pipeline, tracker HUD, streaks, morphing and the standalone hero build** (`6030177`).
- **Dissolution work.** Thanos-snap style dissolve, laminar wind peeling, half-resolution trail persistence, particles that only stream from some parts of the picture while the core stays put (`f96f613`, `9fb107a`, `98efe53`). A research note on the effect is in `docs/RESEARCH_DISSOLUTION_EFFECT.md`.
- **Lifecycle rework** (`14aacd7`): rest at home, stream along a line, fade, respawn, defined once in `src/shaders/lifecycle.ts` and shared by every shader.

## 4. Major decisions, with the reasoning

Each item: the decision, why, what was rejected, and what it cost.

### 4.1 A second, lighter renderer instead of optimizing the first
- **Decision.** Keep the 524k-particle GPU simulation for the full studio and build a separate stateless renderer for the web studio and the hero.
- **Why.** The simulation needs ping-pong textures and a lot of GPU memory, which is wrong for phones and integrated graphics. A stateless renderer has no framebuffers, no per-frame uploads, and is trivially deterministic.
- **Result.** Positions are a pure function of home, light, hash(id) and time. That one property later made the video export frame-exact and the loop possible. The web build picks a particle budget from device hints (200k, 300k or 450k) and steps quality down at runtime (trails off, then render scale, then fewer points).
- **Cost.** Two code paths to keep consistent, and some studio features (DRAW strokes, PULL spring, MELT travel) were not carried over.

### 4.2 Adapter, not fork, for the web studio
- **Decision.** The web studio reuses the studio's UI and `App` unchanged through a `WebEngine` adapter with the same surface as the original engine.
- **Why.** The user wanted the same controls and feel with a lighter engine underneath, and a shared UI keeps the two builds from drifting apart.

### 4.3 Matching the first renderer's output, measured
- **Decision.** Calibrate the light renderer against the studio with numbers, not by eye: picture size (zoom 0.72), one-pixel grain, and a brightness constant of 1.1.
- **Result.** Mean frame brightness 10.1 (studio) against 10.5 (web) on the same frame.

### 4.4 Cell looks as an instanced grid, not snapped particles
- **Problem.** The first version of the styled looks (halftone, ASCII, dither and so on) snapped particles to a grid and shaped each one from its own brightness. Cells came out noisy, about 8% were empty, and screen blending collapsed the tone of binary shapes.
- **Research.** A background research agent surveyed the techniques and sources; notes in `docs/RESEARCH_STYLES_AND_EXPORT.md` and `docs/RESEARCH_STYLE_REFINEMENT.md`.
- **Decision.** One instance per grid cell, the grid glued to the picture in world units. Each cell reads the picture under it from a mipmapped texture (the mip level is the area average), so every cell is one clean colour and one brightness. Each cell is still treated as a particle, so flow, hover, burst, scan and pulse still act on it. Two layers: the picture at rest, and the cells that have left it.
- **Rejected.** A full-screen post pass into a framebuffer (breaks the stateless rule, and streaming particles pollute the average); keeping more particles per cell (more overdraw, still noisy).
- **Details worth telling.** The quad is 6% oversize and each fragment keeps only its own cell, so cells tile with no seams under 3D tilt. The ASCII ramp is measured from the ink coverage of real glyphs, not hand-ordered. Dither thresholds come from bit tricks, with no texture. Per-look settings (2 to 4 each) are built from one list in `src/core/styles.ts`, so adding a look is a data change.
- **Not built yet.** Error-diffusion (Atkinson) dither, shape-matching ASCII, palette extraction for mosaic, Braille and LED looks, trails from cells.

### 4.5 Export drawn on a second engine at the exact output size
- **Decision.** Exports render on a separate off-screen engine, not by resizing the live canvas. The scene is a pure function of time, so frame i of a video is the scene at i divided by fps.
- **Why.** No flicker or fighting with the live view, deterministic output, and the live quality ladder cannot lower quality mid-export.
- **Video.** WebCodecs through Mediabunny (the maintained successor of mp4-muxer and webm-muxer), loaded with a dynamic import as a separate chunk. MP4 with H.264 first, WebM as the fallback, bitrate by pixel count.
- **Sizes.** "480p to 4K" means the short side, so a phone video is 1080 x 1920. Ratios include 9:19.5 (modern phone lock screens), 4:5, 21:9, THIS SCREEN and a custom ratio, with a live preview that zooms and drags so a user can check the framing on their own screen shape before exporting.

### 4.6 A loop that really loops
- **Decision.** In LOOP mode every time term (streamer cycles, shimmer, flow phase, sway, float, scan rate, pulse) is snapped to a whole number of cycles per clip, and the clip starts at t = 0.
- **Verified.** Frame 0 and the frame just after the last are pixel-identical (difference 0) for dots and every cell look; the step from the last frame to the first is the same size as any neighbouring step (about 1.7 against 1.7). One cycle is all a user has to download; a player set to repeat shows it forever.
- **Trade-off, stated honestly.** Short loops make drifting streams move faster than live (a 2 s loop would be 2.5 to 5 times faster), so LOOP has a 4 s minimum and the dialog says longer loops stay closer to the live speed.

### 4.7 Keeping export and viewport visually equal
- **Problem.** Trails in an exported video looked fainter than in the viewport.
- **Diagnosis, measured.** Trail light per picture area fell as 1 / size, to about 40% at 4K, because trails were 1 px GL lines while the dots scaled with the output.
- **Fix.** At larger sizes trails are drawn as quads whose width scales with the picture. After the fix every size from 480p to 4K is within about 3% of the viewport.

### 4.8 Emitters: control where particles leave from
- **Problem.** A boxy picture, such as one with a lot of text on one side, looked bad because brightness alone decided what streamed away.
- **Decision.** A 3 x 3 map of region weights blended smoothly across the picture, plus SPOTS (bright patches that shed more), SCATTER (trails do not start at exact pixels), LEN VARY and a micro TURN. It is on top of the brightness weighting, and OFF restores the old behaviour.
- **Checked.** With only the top-right weighted, 81% of trail light landed top-right; with only the bottom weighted, 88% landed bottom-right.

### 4.9 Small things that were decisions too
- Trails fade in during a picture morph instead of popping in after it.
- The 3D drag follows a ball you turn by its front; the vertical axis had been inverted.
- Number boxes appear only on click, so the console stays calm.
- Sliders share one style across the studio, the export dialog and the emitters.
- Research is delegated to background agents and written to `docs/` with sources and "unverified" marks, so decisions can be traced.

### 4.10 Android: effects as validated data, one shader source
- **Decision.** The phone app reads effects as packs (config, picture, depth map). The config uses the web renderer's own `LiteParams` names and is produced by the web `toLiteParams`, so there is no second mapping to keep in step. Shaders are exported from `src/lite/shaders.ts` by a script.
- **Why.** New effects must not need a new app build, and the web and phone looks must not drift. The research rejected a WebView in a wallpaper (no official support) and a hybrid with a separate renderer per platform.
- **Rejected.** Porting `src/core/` (needs float render targets); porting the studio-to-renderer mapping to Kotlin (a second copy to maintain); effects with their own shader code (Play policy on downloaded code is unclear).
- **Cost.** About 2,100 lines of TypeScript glue had to be rewritten in Kotlin; golden tests (sampler, presets, pack files) guard the drift.

## 5. Problems met and how they were solved

| Problem | Cause | Fix |
|---|---|---|
| Picture spun wildly after a tab switch | Negative frame step made the smoothing diverge | Clamp the step to 0..0.05 s |
| Loader showed 4000 to 10000% | Model progress already 0 to 100, divided again | Clamp to 100% |
| Wrong picture appeared after fast switching | Stale async load finished late | Guard on the active index after every await |
| Trails only visible at maximum flow | Trail length tied to path reach | Fixed trail length back along the drift direction |
| Styled looks noisy and dim | Tone taken per particle | Per-cell tone from a mipmapped picture texture |
| Exported trails fainter at 4K | 1 px lines against scaled dots | Width-scaled quads, measured within 3% |
| Loop frame 0 and last frame differed by a few pixels | Float rounding in the streamer phase | `fract(fract(t / T * n) + r)` so t = T is exact |
| Export files showed whole-file diffs | A patch script wrote Windows line endings | Normalized to LF before committing |
| Android wallpaper crashed on start | `setFixedSize` is refused in a wallpaper ("only support sizing from layout") | Render scale through an offscreen target and a blit |
| Android stutter every minute | The quality ladder retried trails after each climb, ran at 46 fps with 53 late frames, then stepped down | Late frames count as slow; a failed level is banned for 5 minutes, doubling; last stable level is remembered |
| Android trails nearly invisible | The web draws 1 device-pixel lines; a phone has about 3 px per dp | Trail width scales with screen density |
| Android "colour" slider seemed dead | It was `pSat`, which only affects drifting particles and trails | Named PARTICLE COLOUR like the web; trails made visible |
| Android first draft used its own slider words | Labels written from memory | Names and ranges generated from `index.html`; a test fails if the old words return |
| IMPORT said "archive has no pack.json" on a photo | The button was built for `.pdspack` zip files, not photos | ADD PHOTO (pictures only, depth estimated on the phone) and IMPORT PACK are separate buttons |
| Chrome pack looked like noise | Wrong picture for that look | Dropped by the user after review; other packs re-paired by looking at the phone's own thumbnails |

## 6. Numbers that are safe to quote

- 524,288 particles in the full studio (1024 x 512); 200k, 300k or 450k in the web build by device.
- Hero bundle under 200 kB gzip (last measured 192.8 kB for the embed).
- Frame 0 equals frame T in loop exports (measured difference 0).
- Export trail brightness within about 3% of the viewport at 480p, 720p, 1080p and 4K (measured).
- Mean brightness match between the two renderers: 10.1 against 10.5 (measured).
- Seven particle looks, six of them cell looks with 2 to 4 settings each; ratios from phone to ultrawide; sizes 480p to 4K.
- Unit tests: 21 passing at the last full run (web). Android: 49 passing (JVM).
- Android (realme X2, Android 11, Adreno 618; measured): 60 fps steady with 100,000 particles and trails at full quality; shader compile 2,966 ms on first start and 26 ms from the cache; release APK 10.3 MB; 19 effect packs, 9 MB. Not measured: battery, heat, GPU time.

## 7. What to say in a portfolio write-up

**Angles that are true and distinctive**
1. **Stateless rendering as a design constraint.** Making particle position a pure function of time removed framebuffers and made deterministic, frame-exact video and a seamless loop possible with almost no extra code.
2. **Measure, do not eyeball.** Renderer parity, export parity and the loop seam were all checked with numbers, and two real bugs (fading trails, loop rounding) were found that way.
3. **Research before building.** Each big feature started with a sourced research note and an explicit "unverified" list.
4. **Performance on ordinary hardware.** Device-based budgets and a quality ladder that steps down instead of dropping frames.
5. **Product thinking in the export.** Aspect ratios for real phone screens and a live preview, because the user needs to see how a lock-screen loop looks before exporting.

**Visuals to capture for the case study**
- The same picture in dots, halftone, mosaic, dither, ASCII, stipple and lines.
- The export dialog on a phone ratio with the preview zoomed.
- A short loop clip (the 4 to 8 s MP4).
- Before and after of a text-heavy picture with the EMITTERS map set.
- The PULSE glint moving across the sculpture's curls.
- A diagram of the lite renderer's "pure function of time" idea.

**Honest limits to mention**
- Firefox and Safari video encoding was not tested; the code falls back and says so.
- The cell looks have six of the eight planned techniques.
- Some studio-only features were not carried over to the web build.

## 8. Open directions

- Sidebar Phase 3 (look thumbnails, emitter region map, changed-from-default dots, per-group reset); see `docs/RESEARCH_SIDEBAR_UX.md`.
- Scanner clean-up: drive the scan from image brightness, move burst out of the scanner into a "tap burst" toggle on the hover row.
- Atkinson dither, shape-matching ASCII, Braille and LED looks.
- Android: battery and heat runs (1, 4, 8, 24 hours), a second device, post-processing looks (glow, bloom, VHS), an on-device depth model for photos, signing and Play listing. See `docs/ANDROID_SCOPE.md`.
- Timeline editing for video clips (see `docs/RESEARCH_VIDEO_TIMELINE_EXPORT.md`).
- Testing in Firefox and Safari; performance checks on low-end devices.

## 9. How to keep this log

Add an entry whenever something major lands or a decision is made. Keep it short and factual.

```
### YYYY-MM-DD: short title
- What changed, in one or two lines (commit hash if there is one).
- Why: the problem it solves or the direction it follows.
- Decision and rejected options, if there was a choice.
- Evidence: a measurement, a test, or "not verified".
- Portfolio note: the one thing worth telling or showing.
```

Put new milestones at the top of section 3, new decisions in section 4, new problems in the table in section 5, and update section 6 when a number changes.
