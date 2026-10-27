# Web studio (branch `master-web`)

The studio UI and controls from `master-studio`, running on the light renderer in `src/lite/`. Same
pictures, same depth estimate (in the browser), far less GPU work per frame. `master-studio` is unchanged.

## Audit (what was cheap, what was heavy)

- `App` talks to the engine through about ten methods. Keep those names and the UI needs no change.
- The heavy part is the 524,288-point GPU simulation in `core/Engine.ts` (three.js ping-pong). The light
  renderer replaces it: positions are a function of time, so there are no framebuffers.
- The depth estimate (`depth/DepthEstimator.ts`, WebGPU or WASM) is per picture and stays.
- `core/Sampler.ts` builds 524k points and sorts them for the bounds. Replaced by `lite/sample.ts`, which
  resamples the picture to 768 px and writes a shuffled prefix, so the point budget can drop at runtime.

## Structure

| Piece | File | Role |
|---|---|---|
| Engine adapter | `src/web/WebEngine.ts` | Same methods as `core/Engine`; maps `Params` to light settings |
| Light renderer | `src/lite/LiteEngine.ts`, `shaders.ts` | Points, trail lines, effects, tint, scan (from `shaders/lifecycle.ts`), click burst |
| Sampler | `src/lite/sample.ts` | Picture + depth to a 16-byte-per-point buffer |
| Studio | `src/main.ts`, `index.html`, `src/ui/*` | Unchanged apart from the engine and sampler calls |
| Hero | `src/hero-lite.ts` | Shares the light renderer; unchanged behaviour |

## Kept

Flow (drift) and drift direction, relief, track, trails with amount, length, strength,
detail, scan (all styles including BURST, levels 1 to 5), light tint, Effects (levels, gamma, curve,
hue, saturation, B&W, opacity; picture only, trails untouched), five pictures, delete, next, light start values.

## Drift and loading changes

- **LEAN** (-1..1, centre = 0): which side of the picture the streamers come from. Lean right: most come from the right side, a floor keeps some from the left, brightness still decides. Drift direction still sets where they go.
- **PAN** (toggle) and **PAN AMT** (0..1): 3D tilt that follows the cursor. Idle sway is separate and always on.
- **BURST** is a scan style now (click shockwave, strength from the scanner level). The separate BURST slider is gone.
- **Removed as duplicates or dead in the web build:** SCATTER, PULL, DRAW, MELT, the STYLE row, the LIGHT on/off button (use the OFF tint swatch), the TRAILS toggle (use TRAIL AMOUNT 0 for none).
- **Per image settings:** each picture keeps its own settings. A new picture starts from the light start values. Settings live in memory, so a page reload resets them to the last saved active settings.
- **Pixel shift:** a new picture arrives over about 1.1 s; dots leave the old picture and arrive in the new one at their own moment, with a small shift. Trails are off during the shift.
- **ANGLE / STRENGTH** number inputs beside the dial, in step with it (angle -180..180 degrees, strength 25..100%).
- **Loader**: the bar was driven by transformers.js progress that is already 0..100, so it showed 4000% to 10000%. Now divided by 100, kept monotonic and clamped to 100% in `setProgress`.
- **Speed**: depth is estimated and refined at 768 px on the long edge (the sampler reads at the same size); the model is fetched in the background after the samples load, with one throwaway run to compile GPU shaders; WebGPU uses the fp16 model (about 2.7x faster than q8 on the test machine), then falls back to WASM q8; a failed model load is remembered instead of retried for every picture. Measured: a 1125x2000 upload takes about 1.3 s end to end on the test machine.

## Not in the web build (controls disabled in `index.html`)

- **DRAW**: flow strokes would need a per-frame field. Dropped.
- **PULL**: the gather spring pulls particles home. The light renderer has no spring. Dropped.
- **MELT** travel: needs the spring. Dropped.
- **Morph between pictures**: the light build switches picture at once (`WebEngine.startMorph`).

## Points and quality

Budget from device tiers (`pointBudget()`): 200k low, 300k default, 450k strong. The render ladder in
`LiteEngine.adapt` drops trails, then render scale, then points down to 40k when frames stay slow.

## Shortcut with a known limit

- `shortcut: picture switch is a cut, not a morph, upgrade by blending two sample buffers in the shader`.

## Checks

- `npx tsc --noEmit`, `npm test`, `npm run build`.
- `STUDIO_URL=http://localhost:5173/ node scripts/verify-web-studio.mjs`: loads, switches picture, turns
  the scan on, reads back pixels and GL errors, fails on any console error.
- Not measured on a real low-end laptop yet.

## UI revamp (latest)

- Console compacted: boxes 22 px headers, sliders two per line in MOTION and EFFECTS, dial 72 px.
- TINT row removed. Light tint is off in the web build.
- MOTION: FLOW (reach doubled), RELIEF, LENGTH (moved from Effects, same field `trail.length`), RANDOM (`randomness`: per-particle direction and distance), LEAN, DIM (`dim`: procedural dimming along drift paths).
- PAN section: PAN on/off, FLOAT (gentle hover), STYLE CURSOR or 3D (orbit, larger turn), AMOUNT slider.
- MODES: TRACK on/off plus OLD (repel and follow the cursor's motion, the earlier behaviour) or SOFT (gentle push, the later behaviour). Default OLD.
- Scan starts at the last click and restarts its sweep there. It no longer follows the cursor.
- New picture morphs in from the picture on screen, same particle index, per-particle delay, 1.6 s (the studio's morph rule).
- EFFECTS: PARTICLE SAT (`pSat`) saturates the dots themselves.
- Not done: NEAR direction (unclear what it should control).

## Change list (2026-10-27)

- FLOW reach raised again (about 2.5x the first version at full flow).
- MOTION: FLOW, DEPTH (was RELIEF), LEAN; sub-section RANDOM / PARTICLE: RANDOM, DIM, PART SAT (drifting particles only), TRAIL SIZE (dot size of drifting particles), TRAIL DIR (degrees, turns trails off the drift path), TRAIL LEN.
- DRIFT: dial 56 px, value readout text removed (arrow shows angle, length shows strength); manual ANGLE and STRENGTH boxes kept.
- PAN: PAN and FLOAT toggles; STYLE CURSOR or 3D ORBIT (drag the stage to turn to any side, double-click resets); AMOUNT scales the cursor tilt. The orbit itself is not limited by AMOUNT.
- MODES: TRACK old option is labelled HARSH; SOFT unchanged.
- SCANNER: RADAR and LINES removed. Cycle: SWEEP, RING, DEPTH, BURST, PULSE.
- PULSE: a light wave travels through the depth, front to back. Lit dots brighten and grow.
- TRAIL section: AMOUNT, STRENGTH, DETAIL (moved out of Effects).
- EFFECTS: image only (levels, contrast, hue, saturation, opacity, B&W). Drifting particles and trails use PART SAT and tint only.

## Canvas layout update

- DRIFT: compass at the bottom right of the canvas, ANGLE above and STRENGTH below it.
- PAN: icon in the canvas centre. Opens CURSOR, FLOAT and AMOUNT. 3D ORBIT and the pan on/off toggle removed.
- MODES: COLOUR removed. TRACK is now HOVER. HARSH and SOFT are disabled when HOVER is off. ON states are solid blocks with a dot; a chosen style is underlined.
- PARTICLES: one section (RANDOM, DIM, PART SAT, SIZE, TRAIL DIR, TRAIL LEN, TRAIL AMT). TRAIL STRENGTH and DETAIL sliders removed; they stay at their defaults.
- EFFECTS - IMAGE: section 05. RESET has an icon.
- FLOW: reach raised again.

## Styles and export

Research and sources: `docs/RESEARCH_STYLES_AND_EXPORT.md`.

**STYLE (box 02).** Seven looks, picked by `params.style`: 0 DOTS, 1 HALFTONE, 2 MOSAIC, 3 DITHER, 4 ASCII, 5 STIPPLE, 6 LINES. CELL (`params.cell`, 4 to 16 css px) sets the cell size and is off for DOTS.
- Still stateless, no framebuffer. The vertex shader keeps about 2.5 particles per cell (`uKeep`), snaps them to the cell grid (HALFTONE on a 45 degree grid, LINES to rows only, STIPPLE not snapped) and sizes the point to the cell. The fragment shader shapes it from the particle's brightness: dot area (halftone), Bayer 8x8 threshold built from bits (dither), glyph from a 10-glyph atlas drawn with a 2D canvas (ascii), small round dot (stipple), bar thickness (lines). MOSAIC is solid squares in the source colour.
- Shaped looks use the colour at full value and let the shape carry the brightness. Coverage for MOSAIC is points per cell, so brightness stays right.
- Trails are hidden in the styled looks.

**EXPORT (box 07).** TYPE image, video or loop; SIZE 480p (854x480), 720p, 1080p, 2K (2560x1440), 4K (gated by the device's drawing buffer limit); FORMAT PNG, JPG, WEBP or MP4, WEBM; FPS 30 or 60; LENGTH 2 to 20 s.
- Drawn on a second off-screen `LiteEngine` (`src/web/Exporter.ts`) at the exact output size, `renderAt(t, loop)` (no pointer, no smoothing, no quality ladder). Dot and cell sizes scale with output height over the live canvas height.
- Video: WebCodecs through Mediabunny (MPL-2.0, loaded with a dynamic import so it is a separate 75 kB chunk), frame i at i / fps. MP4 with H.264 first, WebM when the browser cannot encode it. Bitrate at 30 fps: 480p 4, 720p 8, 1080p 12, 2K 24, 4K 50 Mbps (x1.5 at 60 fps).
- LOOP: starts at t = 0 and snaps every time term (streamer cycles, shimmer, flow phase, sway, float, scan rate, pulse) to whole cycles per clip, so the last frame meets the first. Checked: frame 0 and frame T are pixel-identical for DOTS, HALFTONE and ASCII. Streamer speeds change by up to about a third at short lengths; longer clips change them less.
- Image export draws the scene at the time on screen. A video starts from that time.

Not verified: Firefox and Safari encoder support (the code falls back and says so), and 4K on devices whose drawing buffer is smaller.
