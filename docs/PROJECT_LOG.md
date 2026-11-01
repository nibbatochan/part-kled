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

## 6. Numbers that are safe to quote

- 524,288 particles in the full studio (1024 x 512); 200k, 300k or 450k in the web build by device.
- Hero bundle under 200 kB gzip (last measured 192.8 kB for the embed).
- Frame 0 equals frame T in loop exports (measured difference 0).
- Export trail brightness within about 3% of the viewport at 480p, 720p, 1080p and 4K (measured).
- Mean brightness match between the two renderers: 10.1 against 10.5 (measured).
- Seven particle looks, six of them cell looks with 2 to 4 settings each; ratios from phone to ultrawide; sizes 480p to 4K.
- Unit tests: 21 passing at the last full run.

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
