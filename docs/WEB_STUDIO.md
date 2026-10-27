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

Research and sources: `docs/RESEARCH_STYLES_AND_EXPORT.md` (first pass) and `docs/RESEARCH_STYLE_REFINEMENT.md` (the cell grid).

**STYLE (box 02).** `params.style`: 0 DOTS, 1 HALFTONE, 2 MOSAIC, 3 DITHER, 4 ASCII, 5 STIPPLE, 6 LINES. DOTS is the original particle look. The other six are cell looks.
- **Cell grid, not particles.** One instance per grid cell (`drawArraysInstanced`, no vertex attributes, `CELL_VERT` in `src/lite/shaders.ts`). The grid is glued to the picture in world units (`cell / live px per world unit`), so it tilts, zooms and exports with the picture and has the same cells at every output size. Each cell is treated as a particle (`place()`): flow, hover, burst, scan and pulse still act on it.
- **Tone comes from the cell, not from a particle.** The sampler keeps the picture as an RGBA8 texture (rgb colour, alpha depth, mipmapped). A cell reads it with `textureLod` at the cell's mip level, which is the area average, so every cell is one clean colour and one brightness. AUTO LEVELS stretches the 2nd to 98th percentile of brightness to fill the look.
- **Two layers.** Layer 0 is every cell at rest (the picture, no holes). Layer 1 is the same cells with the flow on, culled to the ones that have left, so cells peel off the picture and drift out in the same look. Trails are off in the cell looks.
- **Cells tile.** The quad is 6 percent oversize and the fragment keeps only `0 <= uv < 1`, so neighbours leave no seam under tilt and each pixel belongs to one cell. Morph is a per-cell dissolve between the two pictures' textures.
- **Settings.** Shared: CELL (4 to 24 css px), COLOUR (SOURCE, MONO, DUO with INK and PAPER), INVERT, AUTO LEVELS. Per look (2 to 4 each, one list in `src/core/styles.ts` that builds the panel): HALFTONE shape, angle, dot gain; MOSAIC colours, gap, round, outline; DITHER method (Bayer 4, Bayer 8, noise), levels, bias; ASCII ramp (classic, dense, binary), paper; STIPPLE dot size, density, jitter; LINES mode (scan, hatch, cross), angle, weight. ASCII cells are twice as tall as wide and the glyph ramp is measured from ink coverage (`src/lite/glyphs.ts`).
- Not built yet from the research: error-diffusion dither (Atkinson), shape-matching ASCII, palette extraction for MOSAIC, Braille and LED looks, trails from cells.

**EXPORT (icon in the header).** Opens a dialog: a live preview on the left, grouped options on the right.
- FRAME: ratio (16:9, 9:16, 9:19.5 phone, 1:1, 4:5, 4:3, 3:4, 21:9), a custom ratio, THIS SCREEN (reads the real screen), and SIZE as the short side: 480p, 720p, 1080p, 2K, 4K (a phone video is 1080 x 1920). VIEW: zoom 30 to 600 percent, FIT, FILL, RESET; drag the preview to move the picture, scroll to zoom. OUTPUT: IMAGE (PNG, JPG, WEBP), VIDEO or LOOP (MP4, WEBM), fps 30 or 60, length 2 to 20 s.
- Drawn on a second `LiteEngine` at the exact output size (`src/web/Exporter.ts`), `renderAt(t, loop)`: no pointer, no smoothing, no quality ladder. Dot and cell sizes follow the picture, not the pixels, so the file matches the preview. Trails too: live they are 1 px GL lines; at a larger export size they are drawn as quads that many px wide, so their brightness per area stays within about 3 percent of the live view (before this they thinned out as 1 / size, to 40 percent at 4K). 4K is refused with a message when the device's drawing buffer is smaller.
- Video: WebCodecs through Mediabunny (MPL-2.0, loaded with a dynamic import, a separate chunk). Frame i is the scene at i / fps. MP4 with H.264 first, WebM when the browser cannot encode it. Bitrate follows the pixel count: 12 Mbps at 1080p 16:9 and 30 fps, x1.5 at 60 fps (`src/web/frameSize.ts`).
- LOOP: starts at t = 0 and snaps every time term to whole cycles per clip, so the last frame meets the first. Checked: frame 0 and frame T are pixel-identical for DOTS and every cell look. The preview plays the loop. Streamer speeds change by up to about a third on short clips.
- Not verified: Firefox and Safari encoder support (the code falls back and says so).

## Emitters and the PULSE scan

- **PULSE** is dimmer: colour lift 0.12 + 0.25 x brightness (was 0.25 + 0.5), size +0.8 px (was +1.5), opacity x(1 + 0.3 x pulse) (was 0.8).
- **EMITTERS (box 06, ON/OFF).** Where particles leave the picture from, on top of the brightness weighting. A 3 x 3 map of sliders (`emit.r0..r8`, 0 to 2, top left first, 1 = normal) blended smoothly across the picture (`regionWeight()` in `place()`), so a boxy picture with a lot of content on one side can shed from the top right, the bottom, or anywhere. SPOTS: a few small patches (about 12 percent of an 18-per-height grid) shed up to 9x more, the brighter the patch the more. SCATTER: the start of each path moves by up to 0.05 picture heights as it leaves, so origins are not exact pixels. LEN VARY: 1 = trail lengths differ as before, 0 = all alike. TURN: each trail leans a random angle of up to 0.18 rad (about 10 degrees) off the common direction. OFF returns to the earlier behaviour (brightness and LEAN only).
