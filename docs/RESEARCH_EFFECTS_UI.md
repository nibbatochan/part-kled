# Research: effects, effect stacking and a calmer console

Research only. No source code was changed. Nothing was committed. Date: 2026-11-01. Branch `master-web`.

Evidence rules (same as the other `RESEARCH_*.md` notes):
- "Code fact" = read from the repo this session. Paths are relative to the repo root.
- Outside claims carry a source number `[n]`, listed in section 0.2.
- **UNVERIFIED** = not traced to a primary source. Many look-and-feel effects (VHS, thermal, holographic, neo-brutalism) have no primary source at all. They are design proposals, and the note says so.
- GLSL is a sketch. Not compiled, not run.

---

## 0. Summary and sources

### 0.1 Summary

- **Console.** 65-plus controls sit in nine boxes. Replace the look button grid with a **thumbnail picker rendered from the user's own photo**, show only 2 to 4 controls per look, put everything else behind one "MORE" level (NN/g: two levels at most [1]). Use 2D pads and dials where two values belong together. Add real photo actions: reorder, replace, duplicate.
- **Weak looks (code fact).** Cell looks take tone from the mean of the cell, but most of them quantise only luma, use fixed tiny pattern sets, and ignore music, hover and 3D except through whole-cell displacement. The music looks only move positions; none changes size, tone or colour. DOTS point size does not follow perspective, so the wheel dolly changes spacing but not dot size.
- **Biggest finding for effects.** Positions are a pure function of time (`place()`), so the vertex shader can call it twice to get a true per-particle velocity. That gives motion blur and motion tracing without a velocity buffer or feedback FBO. A post-process blur only knows camera motion unless a velocity texture is added [9].
- **Most effects need no framebuffer.** Colour (gradient map, duotone, thermal, acid), grain (full-screen multiply or add quad), glow (soft sprites), stardust, wireframe, 3D bars, glass and sticker cells all fit the existing point and cell renderers. **Only bloom, halo, VHS blur and chroma bleed, CRT barrel and persistent trails need an FBO.**
- **Stacking.** One *base look* (DOTS or one cell look) plus an ordered list of *layers* of three kinds: `grade` (in-shader colour), `overlay` (extra geometry drawn with blend), `post` (needs the scene FBO). Fixed pipeline order, user reorder only inside a kind. At most one scene FBO is ever allocated, shared by all post layers.
- **Budget.** Mobile target 200k points. Keep the scene FBO at or below about 1 Mpx on phones (a 1170 x 2532 phone buffer is 2.96 Mpx, 23.7 MB per RGBA16F target, arithmetic). Start bloom from half resolution. The existing quality ladder (`adapt()`) drops layers before points.
- **Build order.** Phase 1 colour layer and the stack data model (no FBO). Phase 2 look thumbnails and finer controls for the six weak looks. Phase 3 overlay effects. Phase 4 the scene FBO with bloom first. Phase 5 retro and motion effects. Phase 6 the rest.

### 0.2 Sources

Read this session (content retrieved):
1. NN/g, Progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/ (two levels; frequent options first)
2. NN/g, Slider design rules of thumb: https://www.nngroup.com/articles/gui-slider-controls/ (sliders for approximate values; show the value; use another control when exactness matters)
3. Bart Wronski, Dithering part three: https://bartwronski.com/2016/10/30/dithering-part-three-real-world-2d-quantization-dithering/ (avoid Bayer; IGN or blue noise; triangular remap)
4. Surma, Ditherpunk: https://surma.dev/things/ditherpunk/ (Atkinson kernel, error diffusion is sequential, blue noise by void-and-cluster, dither in linear light, Bayer bias)
5. Alex Harri, ASCII rendering: https://alexharri.com/blog/ascii-rendering (shape vectors, six sampling circles, contrast enhancement, GPU sampling)
6. Jorge Jimenez, CoD:AW post-processing: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare (pyramid bloom, luma-weighted downsample, 3x3 tent upsample). Slides: https://www.iryoku.com/downloads/Next-Generation-Post-Processing-in-Call-of-Duty-Advanced-Warfare-v18.pptx (407 MB, not opened)
7. LearnOpenGL, Bloom: https://learnopengl.com/Advanced-Lighting/Bloom (HDR RGBA16F, threshold, separable Gaussian ping-pong; the page does not cover the pyramid method)
8. Unity URP Bloom docs: https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@14.0/manual/post-processing-bloom.html (Threshold, Intensity, Scatter, Clamp, Tint, High Quality Filtering, Lens Dirt)
9. GPU Gems 3 ch. 27, motion blur: https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-27-motion-blur-post-processing-effect (camera-only velocity from depth; moving objects need a velocity texture)
10. Ottosson, Oklab: https://bottosson.github.io/posts/oklab/ (even lightness, no hue shift toward purple, Photoshop gradients now default to Oklab)
11. MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices (batch draws, avoid FBO attachment changes, `invalidateFramebuffer` on tiled GPUs, float render targets need extensions, lower back-buffer size for mobile)
12. MDN, EXT_color_buffer_float: https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float (R16F/RGBA16F/R11F_G11F_B10F and 32F become renderable)
13. W3C Compositing and Blending 1: https://www.w3.org/TR/compositing-1/ (multiply, screen, overlay, soft-light, color-dodge, difference formulas)
14. Khronos GLSL ES 3.00 `refract`: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/refract.xhtml
15. MDN, drawBuffers: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawBuffers (MAX_DRAW_BUFFERS minimum of 4 is from the WebGL 2 spec, not the page: UNVERIFIED here)

Carried from earlier notes in this repo (fetched there, not re-fetched): `docs/RESEARCH_SIDEBAR_UX.md` section 8 (W3C APG slider, radio, accordion, disclosure; Carbon slider and content switcher) and `docs/RESEARCH_STYLE_REFINEMENT.md` (halftone, hatching, Khronos `textureLod`).

Tried and failed (so every claim that would have rested on them is UNVERIFIED):
- Inigo Quilez, cosine palettes (404 at both URLs) and fBm (404). I quote the cosine palette formula from memory and mark it.
- Playdead INSIDE rendering slides (file over 10 MB). The triangular-noise claim rests on Wronski [3] only.
- NVIDIA Solid Wireframe PDF (binary, unreadable through the tool). Barycentric wireframe is UNVERIFIED.
- Adobe Photoshop layers help (403), Figma right-sidebar help (does not describe effects lists), Material 3 chips (title only), Arm Mali bandwidth guide (title only).
- No primary source for: VHS, thermal palettes, holographic and glassmorphic looks, neo-brutalism, sticker looks, XY-pad guidance, drag-to-reorder guidance. All marked UNVERIFIED below.

---

## 1. Code facts that shape everything

- **One pass, no FBO.** `LiteEngine` draws trails (lines), then points or cells, straight to the default framebuffer. Blend is `gl.blendFunc(ONE, ONE_MINUS_SRC_COLOR)` (screen) (`src/lite/LiteEngine.ts:325`). Context is created with `alpha: false`, `antialias: false`, `depth: false`, depth test disabled (`:292-321`).
- **Stateless.** `place(id, home, light, ...)` in `src/lite/shaders.ts` returns the world position from `(home, hash(id), uTime, uniforms)`. Pointer, burst, then `musicMove()` are applied at the end of it.
- **Two renderers.** DOTS: `gl.POINTS` with constant `gl_PointSize` (no perspective term in `POINTS`). Cell looks: one instanced quad per grid cell (`CELLS`, `CELL_FRAG`), tone from `textureLod` of a mipmapped RGBA8 picture texture (rgb colour, a = depth).
- **Single colour exits.** Points: `vCol` in `POINTS`. Cells: `vInk`, `vBg`, `vTone`. A colour layer needs to touch only these two places.
- **Look settings.** `STYLE_SETTINGS` in `src/core/styles.ts`, packed into one `vec4 uSP` by `packStyle()`. `uSP` is four floats, so a look can read four settings unless a second vec4 is added (`uSP2` exists and carries the ramp size).
- **Second engine.** `Exporter` renders on a second `LiteEngine` at any size with `renderAt(t, loop)` (`docs/WEB_STUDIO.md`, Styles and export). Reusable for look thumbnails.
- **Quality ladder.** `adapt()`: trails off, then render scale x0.75, then 25 percent fewer points, floor `MIN_DRAWN`. Budgets: 200k low, 300k default, 450k strong.
- **Photos.** `Thumbs.ts`: `MAX_IMAGES = 5`; each slot has select and delete only. No reorder, replace or duplicate.

---

# A. UI: a calmer console (rewritten with Apple design principles)

Lens: the Apple talks *Designing Fluid Interfaces* (WWDC 2018) and *Principles of Great Design* (WWDC 2026), read through the `apple-design` skill notes. These were not re-fetched from Apple for this note, so each rule below is a design principle taken from them, not a measured result. Keep the project look (greyscale, one green mark, uppercase mono, square borders, dark only). Apple's skin (round corners, system font) is not copied; its behaviour rules are.

## A.1 What is wrong now, by principle (code and `index.html`)

**Purpose and simplicity.** One question ("how should the picture look") has 10 to 13 controls on screen: the seven-button look grid, CELL SIZE, COLOURS (3), INK, BACKGROUND, TONE (2), then MORE FOR THIS LOOK with 2 to 4 more. Burying all of it in one box is not simple. The common path (pick a look, adjust one or two things) is not shown first.

**Too many boxes, no hierarchy.** SOURCE, LOOK, MOTION, REACTIONS, MUSIC, PARTICLES (6 sliders), COLOUR AND TONE (7 sliders), EMITTERS (13 sliders) all carry the same weight. `docs/RESEARCH_SIDEBAR_UX.md` section 1.11 has the count. Nothing says which box matters most.

**Mapping and grouping.** Sliders are used for everything. Many controls are really choices (shape, mode) or paired values (angle plus strength; grid angle plus dot growth). Paired values sit in two separate rows, far from what they change. NN/g: a slider fits only an approximate value, shows its value, and is the wrong control when exactness matters [2].

**Response and direct manipulation.** The picture is the thing being edited, but a change is made by dragging a thumb in the console and watching the canvas. The look buttons are text only: the user cannot see a look before choosing it. The drift dial already shows the better pattern (drag on a picture of the thing).

**Feedback and forgiveness.** Deleting a photo has no undo. There is no per-box "changed from default" mark, so a user cannot tell what they altered. There is no way to compare a look with and without a change.

**Familiarity and consistency.** The same kind of setting appears as a slider in one box, a segmented switch in another, and a dial in a third. The photo strip has select and delete only: no reorder, replace or duplicate, which every photo tool offers.

**Craft.** All labels are one size and one letter-spacing. Small caps text needs positive tracking; the box titles and the value readouts need a clear step in weight and size so the eye finds the title first.

## A.2 Controls, matched to what is being set

| Pattern | Use here | Why (principle) | Evidence |
|---|---|---|---|
| Visual picker (live thumbnail per option) | LOOK, palette, shape, ASCII glyph set, motion preset | Direct manipulation: see the result before choosing it. | Design judgement from the Apple talks. No primary source fetched. UNVERIFIED as a general rule. Our `RESEARCH_SIDEBAR_UX.md` lists it as Phase 3. |
| Segmented control | 2 to 5 exclusive options (SOURCE / MONO / DUO, scan style) | Familiarity, one tap, all options visible. | Carbon content switcher and W3C APG radio group, carried from the earlier note. |
| 2D pad (XY) | Two values that belong together: GRID ANGLE + DOT GROWTH, DENSITY + JITTER, FLOW + DEPTH, hover radius + strength | Mapping: one gesture sets two linked values, placed next to the picture it changes. | No primary source found. `LineWidget` already proves the idea in this UI. UNVERIFIED. |
| Dial | Angles: grid, line, trail direction, gradient | Mapping: an angle is turned, not slid. | Existing `LineWidget`. |
| Slider | One continuous, approximate value, value always visible | Keep for what it fits. | NN/g [2]. |
| Progressive disclosure | Two levels only: essentials, then MORE | Simplicity: common path first, advanced one level deeper. | NN/g [1]. |
| Presets | Whole looks and motion (CALM, FLOW, STORM already built) | Agency and speed: start from something good. | Design judgement. UNVERIFIED. |
| Layer list (eye, opacity, drag handle) | The effect stack (section D) | Familiarity with layer tools. | Figma and Photoshop pages could not be read. UNVERIFIED. |

## A.3 Photo actions

Today: select, delete, add. Rules for the new ones, each tied to a principle:

- **Reorder (direct manipulation, interruptibility).** The dragged thumbnail stays glued to the pointer, keeping the offset from where it was grabbed (pointer events with pointer capture). Neighbours slide aside as it passes. On release it settles into its slot with a critically damped spring and the release velocity, so there is no seam between drag and settle. The user can grab it again mid-settle. Order feeds the NEXT button and the morph order. Keyboard path: `Alt+Left/Right` on the focused slot. Drag accessibility guidance was not fetched: UNVERIFIED, so keep the keyboard path.
- **Replace.** Drop a file on a slot, or REPLACE in the slot menu. Keeps that picture's settings (settings are per picture already).
- **Duplicate.** Copies the picture's settings into a new slot. Compare two looks of one photo.
- **Delete (forgiveness).** Keep the corner X. No confirm dialog: delete at once and show UNDO for 6 seconds. A dialog is for irreversible actions only, and this one is made reversible.
- **Slot menu.** A small "..." on hover opens REPLACE, DUPLICATE, DELETE, COPY LOOK TO ALL. The strip stays at 5 slots (`MAX_IMAGES`).
- **Status.** A small dot on a slot whose picture has non-default settings.
- **Press feedback.** A thumbnail darkens on pointer-down, not on release.

## A.4 Recommended structure (right column, about 1/4 width, dark, square borders, mono)

Column is about 320 to 380 px at 1440 wide. Five fixed boxes. Order follows the user's path: what picture, how it looks, what is added on top, how it moves, what colour.

```
01 PICTURES   [thumb][thumb][thumb][+]      slot menu "...", drag to reorder
02 LOOK       [ visual picker: 4 x 2 grid of live thumbnails ]
              selected look name + 2 to 4 essentials (pads/dials/segs)
              [ MORE v ]  -> second level (full list for this look)
03 EFFECTS    layer list: [eye] NAME [opacity] [drag]    [+ ADD]
              (selected layer shows its 2 to 4 controls below, MORE as above)
04 MOTION     preset segs CALM FLOW STORM; one XY pad FLOW x DEPTH; dial DRIFT
              [ MORE v ] RANDOM, LEAN, PARTICLES, EMITTERS, SCAN, HOVER, MUSIC
05 COLOUR     palette strip (6 swatch presets + custom gradient bar); TONE v
```

**Content rules**
- **LOOK picker.** 8 tiles (DOTS + 6 cell looks + one free), each 72 x 54 px, rendered from the active photo by a second `LiteEngine` (code fact: the Exporter already does this). Render once per photo or per look-setting change, throttled, cached as `toDataURL`. Selected tile gets a 1 px white border. Name under each tile in 9 px mono. Until a tile is ready show a flat grey tile, never an empty hole.
- **Essentials per look** (first level): the picker, CELL SIZE, COLOUR mode (3-way seg), and that look's top two settings as one XY pad plus one seg. INK, PAPER, INVERT, AUTO CONTRAST and the rest go in MORE.
- **MOTION** shows presets and one pad. MORE holds the old slider lists, grouped under sub-headings and collapsed by default (the `data-collapse` mechanism already exists).
- **EFFECTS** is new (section D).
- **Wayfinding and status.** A "changed from default" dot on each box header and a per-box RESET (already a Phase 3 item in `PROJECT_LOG.md` section 8). Each box title says in a few words what it holds.
- **Search** is not needed once the structure is two levels deep. UNVERIFIED either way.
- Keep the existing canvas widgets (drift dial, PAN, 3D, fullscreen) where they are.

**Behaviour rules (the part that makes it feel fast)**
- **Respond on pointer-down.** Every button, tile and chip shows its pressed state on pointer-down (a 3% scale-down or a lighter fill, 100 ms ease-out) and commits on release. No debounce on the path from input to the canvas.
- **Continuous feedback.** A slider, pad or dial updates the canvas on every pointer move, 1:1, not on release. Thumbnails may lag; the main canvas must not.
- **Pads and dials.** Use pointer capture, so dragging works when the pointer leaves the control. The thumb keeps the offset from where it was grabbed.
- **MORE opens with a spring, not a timed fade.** Use a critically damped spring (damping 1.0, response about 0.3 s): the panel grows from the MORE button and closes back into it, along the same path. It can be closed mid-open. Animate `transform` and `opacity` only; for height use a grid-rows or measured-height transition with the same spring.
- **Bounce only after momentum.** Default is no overshoot. Allow a little bounce (damping about 0.8) only for the photo-strip drop and the layer-drag drop, which follow a flick or drag.
- **Look change.** Switching look cross-fades the canvas for a short time (about 200 ms) so the swap does not pop; the selected tile moves its white border to the new tile with the same spring.
- **Soft edges.** A pad or slider thumb at its limit resists a little (rubber-band a few pixels) and returns, so the limit reads as soft, not frozen.
- **Type.** Box titles one step larger and heavier than labels. Small uppercase labels: slightly positive tracking (about 0.04 em). Value readouts: tabular figures so digits do not jump while dragging. Use `rem` so browser text size scales the layout.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, replace springs and slides with a 150 ms cross-fade. Thumbnails and the canvas keep running (they are content, not interface motion). Keep the existing reduced-motion cut on music motion.
- **Materials.** The console stays an opaque dark column (legibility first). Only floating layers (the ADD picker, slot menu, UNDO toast) may use a translucent surface with a blur behind it, and never a light translucent surface on another.
- **Contrast.** Under `prefers-contrast: more`, raise border and text contrast on all controls.

## A.5 Typography: two fonts

Two families for the whole site, chosen for a technical tone and to avoid the default UI faces (Inter, Roboto, JetBrains Mono, Space Grotesk).

- **Logo** `PARTICLE DEPTH STUDIO` (`h1.app-title`): **Tektur** (Google Fonts, variable 400 to 900, squared technical display), 12 px, tracking 0.1 em, line height 1.
- **Body, labels, buttons, numbers**: **Martian Mono** (Google Fonts, variable weight 100 to 800), lowercase body text; box titles and the MORE button stay uppercase. Monospaced digits keep slider values from shifting while they move.
- **Files.** `public/fonts/tektur-latin-wght-normal.woff2`, `public/fonts/martian-mono-latin-wght-normal.woff2` (Latin subsets). Declared in `src/ui/tokens.css`; variables `--font-display` (logo), `--font-ui` and `--font-mono` (both Martian Mono).
- **Not covered.** The ASCII look draws glyphs with the browser `monospace` family in `src/lite/glyphs.ts`. That is part of the picture, not the site UI.

## A.6 Status of the console (what is built)

- Boxes in the flat order of the earlier console: PICTURE, LOOK, MOTION, REACTIONS, MUSIC, PARTICLES AND TRAILS, COLOUR AND TONE, EMITTERS. No drawer. No EFFECTS box (removed at the user's request).
- LOOK tiles: a still drawing of the current picture per look, redrawn about 350 ms after a change (the doc's "render once per change, throttled" rule). Not live. Cost measured at about 45 ms per redraw on the dev PC.
- Photo strip, following the Photoshop pattern of direct common actions with rare actions out of the way: add (opens the file manager), drag to reorder with a spring glide into the new slot, Alt+Left/Right to move, delete X, and drop an image file on a slot to replace it. No slot menu: the duplicate, replace and copy-look items were removed because they are rarely used.
- Undo history, as Photoshop's History panel: each picture action (delete, move, replace) is a step. Ctrl+Z steps back one at a time; the UNDO toast names the latest step and stays for 6 s. Up to 20 steps are kept.
- Text: the body reads in lowercase; headings stay uppercase.
- XY pads (src/ui/XyPad.ts): MOTION (movement x 3D depth), HALFTONE (grid angle x dot growth), MOSAIC (gap x roundness), DITHER (levels x brightness shift), LINES (line angle x weight). A pad drives the two range inputs it sits on, so their bindings and number boxes keep working.
- Two levels per look (LOOK_ESSENTIALS in src/core/styles.ts): essentials under the picture are the cell size, a PRESET row (LOOK_PRESETS), one choice and up to two values; COLOURS stays with them. MORE FOR THIS LOOK holds the other choices, INK, and TONE.
- Replace: each picture has a replace button that opens the file manager; dropping a file on a picture also replaces it.
- Floating layers (undo toast, shortcut help) are translucent with blur; reduced transparency makes them solid. prefers-contrast raises line and text contrast.
- GRAPHIC (round 8): a GRAPHIC category in the LOOK picker with three new cell looks, BARS (little 3D blocks that stand taller where brighter), STICKER (glossy tiles with a white border and drop shadow) and BRUTAL (neo-brutalism: flat colour steps on a cream ground, thick black outlines, hard offset shadows), each with presets and a pad. Plus a GRAPHIC box with STACK (random stacking): points wander on slow looping paths, each joined by lines to the next and the third next, with an optional word tag at each point (16 words, drawn once into a texture) and a colour. STACK is a post overlay, so it works over any look. WIRE (earlier) is the wireframe item; the 3D simulated item is BARS.
- SURFACE (round 7): a new box with GRAIN, HOLOGRAPHIC, DUOTONE, CLOUD and MESH, in the same post pass as LIGHT and SIGNAL. Order inside the pass: duotone, holographic sheen, mesh gradient, cloud haze, then the bloom and halo glow, then grain on top. GRAIN: film grain stronger in the midtones (STRENGTH x SIZE pad). HOLOGRAPHIC: bright parts turn iridescent and the colours travel (STRENGTH x SPEED pad); dark parts stay dark. DUOTONE: brightness mapped to a shadow and a highlight colour. CLOUD: drifting fractal haze with a tint (STRENGTH x SCALE pad). MESH: a slowly moving four-corner colour gradient laid over the picture, three palettes (AURORA, SUNSET, ICE). All default off. GLASS (a look) already covers the glassmorphic item.
- MOTION effects (round 6): an EFFECT row in the MOTION box with a STRENGTH x SPEED pad. They are base modifiers inside `place()` (src/lite/shaders.ts), so they work with the dot look and every cell look, and export loops snap to whole cycles. STARDUST: a share of the particles lifts off, twinkles and fades, each on its own cycle. BREAKDOWN: a front sweeps left to right; behind it the particles fall away and fade. DISAPPEAR: particles drop out in a random order and return. COSMIC: a swirl and an outward ripple around the middle. Not added: motion tracing and motion blur, which the existing TRAILS already cover.
- SIGNAL (round 5): a new box with VHS and GLITCH, in the same post pass as LIGHT (the compose shader in src/lite/Post.ts reads the scene through a distorted coordinate). VHS: each tape line wobbles sideways, a tracking band crawls up, red and blue bleed apart, plus noise and scan lines (DISTORTION x NOISE pad). GLITCH: slices of the picture jump sideways and the colours split in bursts (AMOUNT x RATE pad); ON BEAT makes the bursts follow the music beat instead of time. Both default off; the post pass is skipped when LIGHT and SIGNAL are all off.
- LIGHT (round 4): a new box with BLOOM and HALO, drawn as a post pass on top of any look (src/lite/Post.ts). The scene is drawn into a texture, its bright parts (above THRESHOLD) are copied to a half-size texture and shrunk four times with a 13-tap filter, and the soft copies are screen-blended back. BLOOM uses the two larger copies (STRENGTH x SPREAD pad); HALO uses the two smallest, tinted (STRENGTH x SIZE pad, colour box). Both default to off. The pass is skipped when both are off. It also applies to exports and the LOOK tiles.
- Effect categories (round 3). Every look sits in one category, shown grouped in the LOOK picker (`LOOK_CATEGORIES` in src/core/styles.ts): DOTS (DOTS, HALFTONE, GLOW), PIXEL (DITHER, MOSAIC, GLASS), TEXT (ASCII), LINES (LINES, WIRE), RETRO (CRT). Colour treatments are a category of their own, the COLOURS row, valid for every look: ORIGINAL, ONE INK, INK+PAPER, THERMAL, ACID.
- New looks, all drawn in the cell shader (no extra pass): GLOW (soft round dots with a halo and hot core), WIRE (the cell grid as lines; square, diagonal or crossed), GLASS (bevelled tiles lit from the top left, with a highlight spot), CRT (red, green, blue bars per cell with scan lines). New colour modes: THERMAL (heat-map ramp from brightness), ACID (cosine rainbow). Each has presets, quality defaults and a cell range.
- Nothing was replaced: GLOW, WIRE, GLASS and CRT each look different from the earlier looks (STIPPLE had already gone). Not built from section C: bloom and halo passes, VHS and glitch, the motion effects (stardust, tracing, breakdown), grain, holographic, sticker, random stacking, neo-brutalism. Those need a scene pass or a stack and were left out.
- Looks (round 2): STIPPLE removed (LINES renumbered to 5). Cell size, colour (source / one ink / ink on paper), ink, paper, invert and auto contrast are now per look, stored in `params.looks` and read through `lookTone()`, so changing one look no longer changes the others. Each look has its own cell range (DITHER goes down to 2 px) and quality defaults in `LOOK_TONE_DEFAULTS` (src/core/styles.ts). Picture, LOOK and MOTION boxes are an accordion, open on load.
- Press feedback on buttons (scale-down on pointer-down). Spring motion is skipped when the system asks for reduced motion.

---

# B. The existing looks: state, weakness, what to add

Common weaknesses (code fact), then per look.

**Common**
1. The cell is the unit. Under flow, hover and music the **whole quad is displaced as one rigid piece** (`place()` on the cell centre). The quad is not stretched, so neighbours open gaps and overlap. Fine for a "peeling tiles" read, poor for a smooth wave.
2. `vBg` is black unless DUO. In SOURCE colour the gap between mosaic tiles is always black, whatever the page background.
3. Colour is `hue = cb / max(cb)` (normalised) with tone carried by shape. Looks are therefore luma-driven; colour per channel is only in MOSAIC.
4. `uSP` holds four floats. Finer controls need `uSP2` or a second vec4.
5. Tone is `pow(tone, k)` with different `k` per look (0.75, 0.8, 0.7). Not done in linear light, which Surma identifies as the usual mistake [4].
6. No look responds to the beat or bands except by position (see music below).

**HALFTONE.** Now: one grid, one angle, dot area = `tone^(1/(1+gain))`, radius `sqrt(area) * 0.7072`, five shapes (`CELL_FRAG` `st == 1`). Weak: a single screen for all colour, so colour pictures look like a grey screen tinted; no separate screen frequency (frequency is the cell size); no tone curve per shape; at 3D tilt the rotated grid can moiré. Finer controls: SCREEN (MONO, CMYK 4 angles at 15/75/0/45 degrees [UNVERIFIED, standard print angles from practice], RGB 3 angles), DOT GAIN curve (not one slider), CONTRAST of the dot map, shape list including LINE-wave and "ring". Visual selection: thumbnail per shape, 2D pad GRID ANGLE x DOT GROWTH.

**MOSAIC.** Now: flat average colour per cell, optional per-channel levels, gap, corner radius, edge darkening from four neighbour tone samples. Weak: one tile size; "levels" is per-channel quantisation, not a palette; outline only on tone steps; gap colour fixed. Finer controls: PALETTE (extract N colours, or a chosen palette) [palette extraction not built: `WEB_STUDIO.md`], TILE SHAPE (square, hex, brick, triangle), ADAPTIVE SIZE (quadtree: big tiles in flat areas), GAP COLOUR, BEVEL, GROUT NOISE. Visual selection: palette swatch row, tile-shape tiles.

**DITHER.** Now: Bayer 4, Bayer 8, or `ign(vec2(vCell))` called "NOISE"; `L` levels on tone; ink colour times the result. Weak: the dither pixel is the **grid cell** (4 to 24 css px), so the pattern is huge and coarse; "NOISE" is a hash/IGN, not blue noise; Wronski advises avoiding Bayer and using IGN or blue noise [3]; Bayer brightens near-black [4]; no error diffusion; levels are on luma only; no palette. Finer controls: PIXEL SIZE separate from CELL SIZE (dither at its own grid, see C.1), PATTERN (BAYER 2/4/8, BLUE NOISE, IGN, ATKINSON-LIKE), LEVELS per channel, PALETTE (1-bit, 2-bit grey, CGA/Game Boy style), LINEAR LIGHT on/off, INVERT THRESHOLD (Surma notes inverting flips the bias [4]). Visual selection: one tile per pattern showing a 16 x 16 gradient.

**ASCII.** Now: luma only; one of three ramps measured from ink coverage (`glyphs.ts`), a 16 x 32 atlas, cell aspect 2, optional dim fill. Weak: glyph by brightness alone gives "blurry, jagged edges" (the shape-matching method addresses this [5]); one font; three ramps; glyphs never change over time; no glyph colour variety. Finer controls: GLYPH SET (custom character string, BLOCKS, BRAILLE, DIGITS, KATAKANA), FONT (a few monospace faces), EDGE MODE (pick `/ \ | -` by gradient direction), CONTRAST (Harri's global exponent [5]), COLOUR PER GLYPH, FLICKER. Visual selection: tiles each showing 6 sample glyphs.

**STIPPLE.** Now: grid cell with jitter, presence by `ign` threshold against tone x density, radius from tone. Weak: it is a jittered grid, not a stipple; density only thins the grid. Finer controls: PLACEMENT (JITTER GRID, POISSON, BLUE-NOISE TILE), SIZE VARIANCE, SHAPE, SHADOW STRENGTH. Real weighted-Voronoi stippling is out of budget (offline).

**LINES.** Now: SCAN, HATCH, CROSS; thickness from tone; angle; weight. Weak: line spacing equals cell height; no wavy lines; lines end at cell edges so thickness steps show at low CELL SIZE (the SCAN mode interpolates neighbours; HATCH and CROSS do not). Finer controls: SPACING separate from cell, WAVE amount (Joy-Division-style displacement from tone), CROSS ANGLE, CAP style, COLOUR BY LINE. Visual selection: thumbnails per mode.

**Music looks (EQUALIZER/LISTEN/BLOOM/RIPPLE).** Code fact: `musicMove()` adds a position offset only.
- **EQUALIZER:** lifts a random share of each of 32 columns by `b * 0.08 * uAmt`. Reads as noise at small sizes. Add: a colour or size response, a "bar" mode that lifts a continuous column, a choice of what x maps to.
- **LISTEN:** `q *= 1 + b * 0.16` scales **about the world origin**, not about the particle's home, so every dot moves along the radial line from the centre, in a random band. Reads as shimmer. Add a size pulse (about home) as an option.
- **BLOOM:** radial nudge with `exp(-d*1.2)` decay, scaled by `uBeat`. One fixed decay. Add: beat shape, centre point (cursor or click), per-look response (halftone dot swells on the beat).
- **RIPPLE:** one ring, fixed period `fract(uTime*0.25)`. Add: ring count, speed linked to tempo, centre at the last click.
- **Across all four:** none acts on tone. Add a per-look hook, `uBeat`/`uLevel` into `uSP`: halftone gain, dither threshold shift, ASCII glyph index shift, stipple size, LINES wave amplitude. This one change makes music "belong" to the look.

**Hover (TRACK).** Code fact: displacement is applied at the cell centre. OLD repels and follows the pointer velocity; SOFT is a small push. Add for cells: a **local look change** under the pointer (halftone gain up, dither levels up, ASCII glyph shift) and cell rotation, not only displacement. Add radius and strength controls on a single 2D pad.

**3D (orbit and wheel).** Code fact: `toClip()` yaws/pitches the point and adds `uDolly` to z; the perspective divisor is `1/(1 - zc*0.5)`. Cell quads are geometry, so they scale and skew correctly. **DOTS `gl_PointSize` has no perspective term**, so a dolly in moves dots apart without growing them. Fix: multiply the point size by the same `persp`. Cell grid angles under strong tilt can moiré: offer a fade of fine detail with tilt. Dither and ASCII break their meaning under tilt (the pixel pattern shears); offer "screen-locked pattern" (pattern computed in screen space, not cell space) as a mode.

---

# C. Building the new effects

Legend: **Fit** = P (fits the point renderer), C (fits the cell renderer), O (overlay: extra geometry or quad drawn with blend, no FBO), F (needs the scene FBO). **Cost** is relative, per frame, for 200k points on a phone.

Two enablers are used by many entries:
- **E1: colour exit `grade()`.** One GLSL function inserted at the single colour exits (`vCol` in `POINTS`, `vInk` in `CELLS`). It takes tone, position, depth, time, and applies the stacked `grade` layers in order. Cost: a few ALU ops per vertex.
- **E2: scene FBO.** One RGBA16F (or RGBA8 fallback) colour target the scene renders into, then a post chain, then a final blit to the canvas. Needs `EXT_color_buffer_float` for 16F [12]; check it, and fall back to RGBA8. Half-float blending is always available [11]. On tiled mobile GPUs call `invalidateFramebuffer` when done with an attachment [11].

## C.1 Dither / Pixel / ASCII

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **Dither (multi-size)** | Decouple the dither grid from the look grid. Compute the dither threshold from **screen-space pixel blocks**: `ivec2 b = ivec2(gl_FragCoord.xy / uPix)` as the lookup, instead of `vCell`. Needs a fragment pass over a full-screen area, so run it as a cell look whose cell = dither pixel, or post. | C (cell = dither pixel) or F | low | PIXEL SIZE 1 to 12, PATTERN, LEVELS, PALETTE, LINEAR LIGHT |
| **Bayer** | Already bit-built in `bayer()`. Keep as the retro option. Brightening bias at low levels; invert the threshold to flip it [4]. | C | trivial | LEVEL 2/4/8 |
| **Blue noise** | Ship a 64 x 64 R8 void-and-cluster tile; `texelFetch(uBlue, ij & 63, 0).r` as the threshold. It tiles because the generator wraps [4]. Wronski: blue noise is "the way to go" when you can pay the texture read; IGN when you cannot [3]. | C | low (one fetch) | SCALE, SEED |
| **IGN** | `fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))))`. Already in `CELL_FRAG` as `ign()`. Cheap, no memory read [3]. | C | trivial | none |
| **Error diffusion (Atkinson)** | Error diffusion is sequential, so it cannot run as one fragment per pixel [4]. Atkinson spreads 1/8 of the error to six neighbours (loses 2/8, raising contrast) [4]. Options: (a) CPU/worker pass once per photo at the dither grid (about 100k to 250k cells, fast), upload as an R8 texture; recompute when photo, cell size or levels change. (b) **Approximate** in the shader: blue-noise threshold plus a small tone-dependent offset from the 4 neighbour tones (no true diffusion). Pick (a) for fidelity; it is static, so flow/hover act on the already-dithered cells. | C | (a) CPU one-off, ms | LEVELS, KERNEL (ATKINSON, FLOYD), SERPENTINE |
| **Pixel** | A MOSAIC with gap 0, tile = pixel size, optional palette quantise. Already close; add a PALETTE and a PIXEL SNAP so motion steps in whole pixels. | C | trivial | PIXEL SIZE, PALETTE, SNAP |
| **ASCII (shape-matching)** | Per cell, sample 6 staggered circles on the picture texture (mip levels give the area average), form a 6-vector, pick the nearest glyph vector. On the GPU: precompute a glyph shape-vector table as a small float texture (n glyphs x 6) and loop over n in the fragment shader (n about 64: 64 x 6 MACs per cell). Harri found CPU sampling the bottleneck and moved it to the GPU for a large speedup [5]. Add contrast enhancement: raise the 6 components to an exponent after normalising [5]. | C | low-medium | GLYPH SET, CONTRAST, DIRECTIONAL CONTRAST |
| **ASCII with bloom** | Draw the glyph layer; then a second, lower-resolution blurred copy added back: either true bloom (E2) or a cheap in-shader glow: add `0.3 * texture(atlas, uv blurred by lod)` using the atlas mip. | C + F | low / medium | BLOOM AMOUNT, GLOW COLOUR |
| **ASCII loader** | Time-based reveal: glyph index = `mix(randomGlyph, trueGlyph, smoothstep(front-w, front, cellProgress))` where `cellProgress` is a hash plus a sweep from the left or from the centre. During the photo/depth load the progress bar can drive `front`. Pure function of time. | C | trivial | DIRECTION, SPEED, GLITCH GLYPH SET |
| **Glyph atlas** | Current: 16 columns x 3 rows of 16 x 32 px, built with Canvas 2D (`glyphs.ts`). Extend to: one row per set, 2x resolution on high-DPR screens, and an optional second font row. For crisp scaling at large cell sizes use a distance field atlas. MSDF generation (Chlumsky's msdfgen) was not fetched: UNVERIFIED; a plain single-channel SDF built in Canvas 2D is enough here. | C | memory only | FONT, SET, WEIGHT |

Shader sketch, screen-space blue noise dither with multi-size pixels (post or cell):

```glsl
float t = texelFetch(uBlue, ivec2(floor(gl_FragCoord.xy / uPix)) & 63, 0).r;
vec3 lin = srgbToLinear(c);                // dither in linear light [4]
vec3 q = floor(lin * (uLevels - 1.0) + t) / (uLevels - 1.0);
c = linearToSrgb(q);
```

## C.2 Bloom / Glow / Light

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **Regular bloom** | Pyramid: downsample chain with a 2x2 luma-weighted average (weight `1/(1+luma)` to kill fireflies, then renormalise), upsample with a 3x3 tent, add back [6]. Alternative: threshold plus separable Gaussian ping-pong [7] (more passes at full size, heavier). Use the pyramid. Start at half resolution; 5 mips. | F | 1 + 2 x mips fullscreen passes at shrinking size, about 1.5x the first mip | THRESHOLD, INTENSITY, SCATTER (radius), TINT, CLAMP. The names follow Unity's Bloom [8] |
| **Glow (per point)** | Soft sprite: bright points drawn bigger with a gaussian alpha, additive. Needs a fragment shader that uses `gl_PointCoord` (the current `FRAG` ignores it). Second point program, drawn only for particles above a luma threshold (cull in the vertex shader). | P/O | +1 draw, overdraw heavy for big sprites | SIZE, THRESHOLD, FALLOFF, TINT |
| **Halo** | A soft rim around the **subject**: blur a depth/threshold mask, subtract the sharp mask, tint. Depth is already the alpha of the picture texture. Cheap version: draw a low-res blurred copy of the picture texture (use `textureLod` at a high level) behind the points, additive. No FBO. | O | one quad | RADIUS, TINT, DEPTH CUT |
| **Golden halftone bloom** | A bloom in the *shape* domain: draw the halftone cell layer a second time, gold ink, dot radius x1.6, opacity 0.3, `blendFunc(ONE, ONE)`. Gives bloomed dots with a halftone structure without a blur. Optionally add true bloom (E2) on top. A design proposal, not a known named technique: UNVERIFIED. | C | one extra cell draw (2x vertex+fragment) | GLOW SIZE, GLOW COLOUR, THRESHOLD |
| **X-ray** | Invert tone, tint cyan or blue, show depth slices: keep a band of `z` and fade the rest; add edge strength from the depth gradient (already computed in `glint()` as `zx, zy`). Grade layer plus tone curve. UNVERIFIED as a look recipe. | C/P | trivial | BAND CENTRE, BAND WIDTH, EDGE, TINT |

## C.3 Retro / Glitch / Signal

All are design proposals; no primary source found. UNVERIFIED as to authenticity of each look.

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **Thermal** | Gradient map of tone through a heat palette (black, purple, red, orange, yellow, white), plus slight blur (use the mip LOD) and an `uHeat` pulse. A `grade` layer with a 1D LUT. | grade | trivial | PALETTE, BLUR, RANGE |
| **VHS** | (1) Per-row horizontal jitter: in the vertex shader `pos.x += n(floor(pos.y*uRows), floor(t*12))*amt`. (2) Chroma offset: three draws with `gl.colorMask`, R shifted left, B right (3x vertex cost), or in post sample R/B at ±dx. (3) Tracking band: one moving band where jitter is large. (4) Tape noise and scanlines via overlay quad. | P + O (+F for blur) | 1x to 3x vertex | JITTER, CHROMA, TRACKING, NOISE, SCANLINES |
| **Retro (CRT)** | Scanline and shadow-mask overlay (multiply quad), vignette, optional barrel warp (needs F; skip on mobile), phosphor glow (bloom pass). | O / F | multiply quad is almost free | MASK, SCANLINE, CURVATURE, VIGNETTE |
| **Acid** | Hue rotate with time and with position (`hueRotate()` exists in `FX`), posterise, solarise (`abs(c - 0.5)`), saturation x2. A `grade` layer. | grade | trivial | SPEED, BANDS, SOLARISE |
| **Glitch** | Block displacement: slice index `floor(y*N)`, time step `floor(t*fps)`, hash decides which slices shift; plus RGB split. In the vertex shader (per point or per cell) so no FBO. Trigger on beat. | P/C | trivial | SLICES, AMOUNT, RATE, TRIGGER (TIME/BEAT) |

## C.4 Motion

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **Motion blur (per particle)** | Because `place()` is a function of time, evaluate it at `t` and `t - dt` to get the real velocity of every particle, and draw a short segment between them (the `TRAILS` program already draws head/tail lines or quads). No velocity buffer. The post-process alternative derives velocity from depth and only knows **camera** motion; moving objects need a velocity texture [9]. | P (line/quad) | 2x `place()`, plus lines instead of points | SHUTTER (dt), SAMPLES, FADE |
| **Motion tracing** | Persistent trails: accumulate with `prev*decay + current` in a ping-pong pair of FBOs. This breaks the "no framebuffers" design, so make it an option. Cheaper variant with no FBO: draw N copies of each point at `t - k*dt` with falling alpha (N x vertex cost; N = 4 to 6). | F or P | 2 FBO + 1 pass / N x vertex | LENGTH, DECAY, SAMPLES |
| **Stardust** | Second small point set from the same buffer (hash < 5 percent): tiny size 1 to 2 px, twinkle `0.5+0.5*sin(t*f+hash)`, slow drift, gold or white. Optional glow sprite (C.2). | P | +5 percent points | AMOUNT, SIZE, TWINKLE, SPEED, COLOUR |
| **Breakdown** | Dissolve driven by a progress `uBreak` (0..1, looping): particle breaks away when `hash < smoothstep(edge)` where the edge sweeps by x, y, depth or noise; the broken ones follow the existing streamer path with extra spin. Re-uses `age`/`share` in `place()`. | P/C | trivial | PROGRESS, DIRECTION (X/Y/DEPTH/RADIAL), EDGE WIDTH, SPIN |
| **Disappearing** | The same with alpha and shrink instead of flight: `alpha *= 1 - smoothstep(...)`, size to 0. Looping or one-shot (play on photo change). | P/C | trivial | PROGRESS, DIRECTION, SOFTNESS |
| **Cosmic distortion** | Domain warp of `home` before `place()`: a gravitational-lens pinch (`h *= 1 + k/(r²+e)`), a swirl `angle += s*exp(-r)`, and a noise warp `h += (fbm(h*f+t)-0.5)*amt`. fBm summed octaves: lacunarity about 2, gain about 0.5 (from practice; the reference page returned 404: UNVERIFIED). Optionally a post UV warp (F). | P/C | 1 to 3 noise lookups per vertex | CENTRE, PINCH, SWIRL, NOISE, SPEED |

## C.5 Surface / Material

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **Glassmorphic** | Cell looks as frosted glass tiles: each tile samples the picture texture at a **higher mip** (blur) with an offset from `refract(I, N, eta)` [14], where `N` comes from the depth gradient (as in `glint()`); add a white 1 px rim and a faint tint. The picture texture is already mipmapped, so no scene copy is needed. A design proposal; no primary source for the "glass" look: UNVERIFIED. | C | one extra texture fetch per fragment | FROST (mip), REFRACTION, RIM, TINT, GAP |
| **Holographic** | Colour = rainbow by the angle between the depth-derived normal and the view/light, plus faint scanlines and flicker. Rainbow from a cosine palette `a + b*cos(2π(c*t+d))` (formula from memory: UNVERIFIED; the page was unreachable) driven by `dot(n, l)`. | P/C (grade) | trivial | HUE SHIFT, STRENGTH, SCAN LINES, FLICKER |
| **Grain** | Full-screen triangle with animated hash/IGN noise, drawn after the scene with `blendFunc(ONE, ONE)` (add) or `blendFunc(DST_COLOR, ZERO)` (multiply); both avoid the FBO. Weight by luma so shadows keep grain. Use blue noise for a finer look [3]. Blend choice from the standard GL blend model (blendFunc docs not fetched: UNVERIFIED). | O | one fullscreen quad, fill-rate only | AMOUNT, SIZE, MONO/COLOUR, LUMA WEIGHT |
| **Duotone** | `grade`: `mix(shadow, light, tone)`; optional mid colour for a tritone. Better in Oklab so the blend does not shift hue [10]. | grade | trivial | SHADOW, LIGHT, MID, CONTRAST |
| **Mesh-based** | Triangulate the cell grid: two triangles per cell, vertex colours from the corner cell tones (4 samples), Gouraud-interpolated; jitter the vertices with a hash for a low-poly look. Instanced; cell counts as today. | C | about 2x cell vertex | DETAIL (cell size), JITTER, FLAT/SMOOTH, EDGE |
| **Cloud** | Soft large sprites (size 6 to 40 px) with gaussian alpha, density from `fbm` and the picture's tone, slow drift. Needs the glow sprite program (C.2) and low alpha with additive blend. | P | overdraw heavy: cap the count at 20 to 40k | DENSITY, SIZE, SOFTNESS, WIND |

## C.6 Graphic / Structure

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **Sticker-based** | Each cell is a die-cut sticker: rounded-rect SDF, a white outline ring, a soft drop shadow, a random small rotation per cell, slight scale above 1 so stickers overlap. Overlap needs an order. `depth: false` today (`LiteEngine.ts:294`), so either enable a depth buffer for this look (new context flag, recreate the context) or sort by a fixed hash-derived z with `blendFunc` off. UNVERIFIED as a look. | C | depth test + overdraw | SIZE, ROTATION, OUTLINE, SHADOW, OVERLAP |
| **3D simulated** | Extruded bars: per cell a box (or two quads + a top) with height = tone or depth, lit by a fixed light (Lambert). Use 24 vertices per cell instanced, cap at about 40k cells. Fake version: draw the cell quad, plus a darker offset quad underneath ("side"). | C | up to 24 x cells vertices | HEIGHT SOURCE (TONE/DEPTH), HEIGHT, LIGHT ANGLE, SIDE SHADE |
| **Wireframe** | Cell look: lines from `min(vUv, 1 - vUv)` with `smoothstep` width, displaced by depth (terrain mesh). Triangulated variant with barycentric edge distance (NVIDIA Solid Wireframe: unreadable; UNVERIFIED), for diagonal edges. | C | trivial | LINE WIDTH, DIAGONALS, DEPTH, COLOUR BY TONE |
| **Random stacking** | Pick K anchors (hash(id) < K/N, K = 64 to 256). Each anchor's position comes from `place()`, so the anchors move with the flow. Connect anchor `i` to `i+1 .. i+m` (ring, not true nearest-neighbour search) with `gl.LINES`; alpha fades with distance, lines break above a max length. A **random word** per anchor: a small label drawn from a word atlas (Canvas 2D to texture, like the glyph atlas), quad at the anchor. Instanced draws: K x m lines + K quads. | O | tiny: K x m < 5k lines | ANCHORS, LINKS PER ANCHOR, MAX DISTANCE, WORD LIST, WORD SIZE, LINE WIDTH |
| **Neo-brutalism pattern** | Flat saturated palette, thick near-black outline, hard offset shadow, bold type, simple stripe/check fills. Build: posterise via MOSAIC levels, outline from the existing neighbour-tone edge (`vEdge`), the hard shadow by drawing the cell layer a second time shifted by (dx, dy) in solid dark ink first, pattern fill in the cell fragment (`mod(floor(p*n), 2)`). Style is design vocabulary; no primary source: UNVERIFIED. | C | one extra cell draw | PALETTE, OUTLINE, SHADOW OFFSET, PATTERN (STRIPE/CHECK/DOT) |

## C.7 Colour / Gradient

| Effect | Technique | Fit | Cost | Params |
|---|---|---|---|---|
| **High-quality gradients** | Build the gradient on the CPU as a 256 x 1 RGBA8 lookup texture. Interpolate stops in **Oklab** so the transition has even lightness and no purple shift [10]. Sample with `texture(uLut, vec2(t, 0.5))`. Banding: add a ±1/255 noise before 8-bit output; Wronski recommends IGN or blue noise, and a triangular remap that corrects clipping near black and white [3]. | grade | one fetch | STOPS (up to 6), INTERPOLATION (OKLAB/RGB), ANGLE, DITHER |
| **Pattern blurs** | A blurred pattern field (stripes, checks, noise) used as a gradient domain: `t = blur(pattern(p))` where blur is analytic (`smoothstep` width) or a mipmapped pattern texture at a high LOD. | grade/O | trivial | PATTERN, SCALE, SOFTNESS, ANGLE |
| **Colour across all effects** | A `COLOUR` layer in the stack that runs in `grade()`, so every base look and every effect shares it. Domain choices: TONE, DEPTH, POSITION (linear/radial/angle), TIME, BEAT. Blend: REPLACE, MULTIPLY, SOFT-LIGHT (formulas in [13]), OVERLAY. Palette set from the CSS-like swatch row in section A. | grade | trivial | DOMAIN, PALETTE, AMOUNT, BLEND |

---

# D. Stacking, the stacker, UI, budget, phases

## D.1 How effects combine

Three kinds of thing, run in a fixed order:

```
base look (one)  ->  grade layers (colour, in-shader)  ->  overlay layers (extra draws)
      -> [ scene FBO ] -> post layers (bloom, VHS blur ...) -> final grade (grain, dither) -> canvas
```

- **Base look:** exactly one of DOTS or a cell look. The looks are alternative ways to draw the same picture, so they cannot stack. (A second look *as a layer* is possible later, drawn with another blend; see D.6.)
- **grade:** runs inside `grade()` at the colour exit. Order = list order. Cheapest; can be many.
- **overlay:** geometry or quads drawn after the base with their own blend: stardust, connecting lines, glow sprites, grain, scanlines, halftone bloom copy. No FBO.
- **post:** reads the scene texture. Allowed only after an FBO exists. List order, but all inside the post stage.
- **final:** grain and the dither of the whole picture last, so gradients are never re-banded by a later pass [3].

**Blend per layer.** `mix(under, over, opacity)` for grade; per-overlay blend from {ADD, SCREEN, MULTIPLY, NORMAL} (formulas in [13]); post layers `mix(input, output, opacity)`. The base look keeps the current screen-stacking calibration (the `o = 1 - pow(1 - cb, ...)` trick), so grade layers act on `cb` before it.

**Conflicts (rules, enforced by the stacker):**

| Combination | Rule |
|---|---|
| Two base looks | Not allowed. Picking one replaces the other. |
| Dither/Pixel base + bloom | Allowed. Bloom after dither gives glowing pixels. |
| Dither as post + any later grade | Keep dither last. Grade layers sort before it. |
| Motion tracing (FBO feedback) + base cell look | Allowed, but cells displace as quads, so the history smears. Warn. |
| Per-particle motion blur + cell looks | Not offered for cells (quads); offer MOTION TRACING copies instead. |
| VHS chroma 3-draw + trails | Draw trails once, not 3 times. |
| More than one scene-FBO consumer | One FBO shared. Post layers chain on it. |
| Post layers on mobile | Max 2, bloom counts as 1. |
| Wallpaper/export | The same stack must render at any output size: sizes in world units or fractions of height, as the dot and cell sizes already are. |

## D.2 Data model (in `Params`)

Add fields to `src/core/params.ts` first (project rule), then UI, then shaders.

```ts
type LayerKind = 'grade' | 'overlay' | 'post';
interface FxLayer {
  id: string;        // stable id, for UI keys and undo
  type: string;      // 'gradient' | 'duotone' | 'thermal' | 'grain' | 'bloom' | 'stardust' | ...
  on: boolean;       // eye toggle
  opacity: number;   // 0..1
  blend: 'normal' | 'add' | 'screen' | 'multiply' | 'softlight' | 'overlay';
  v: Record<string, number>;  // settings, defaults from a registry like STYLE_SETTINGS
  c?: Record<string, string>; // colour settings (hex)
}
// Params
layers: FxLayer[];   // ordered; kind comes from the type registry, not stored
```

A registry (`src/core/effects.ts`, no DOM, like `styles.ts`) lists every effect: `type`, `kind`, `category`, settings with ranges, default, label, tooltip, and the shader snippet key. The panel builds itself from the registry, as it already does for `STYLE_SETTINGS`. `parseParams()` merges `layers` by `id`/`type` with defaults. Bump `STORAGE_KEY`.

Per-picture settings already exist ("each picture keeps its own settings"), so layers are saved per picture. Add COPY TO ALL.

## D.3 Render pipeline

1. `LayerPlan = compile(params.layers)`: sort into grade / overlay / post; drop layers that are off or at opacity 0; apply the mobile caps.
2. **Programs.** Grade layers change the point and cell vertex shaders. Build the shader from `#define`s per enabled grade type, cache programs by a signature string (`'gradient+grain'`). Recompile only when the signature changes, not when a value changes. Avoid a runtime `switch` per vertex over 200k points. Uniforms are packed per layer (`vec4 uG[8]`).
3. **Overlays.** Each is a small module `{ init(gl), draw(gl, u, plan) }` with its own program and VAO, drawn after the base with its blend (`gl.blendFunc`). Reuse the `Exporter` path: every module must support `renderAt` size.
4. **Scene FBO.** Created lazily when the first `post` layer is on; destroyed when none. RGBA16F if `EXT_color_buffer_float` is present [12], else RGBA8. Size = canvas size x `postScale` (0.5 to 1). The base and overlays render into it; post layers ping-pong between two textures; the last pass draws to the default framebuffer. Do not change FBO attachments per frame [11]; allocate the ping-pong pair once.
5. **Quality ladder.** Extend `adapt()` with steps: (a) post resolution x0.75, (b) drop the most expensive post layer, (c) overlays that overdraw, (d) then the existing steps. Never climb back (existing rule).
6. **Export.** `Exporter` builds the same plan on its engine. Post buffers sized to the export size, capped by `MAX_TEXTURE_SIZE` and the drawing buffer, as 4K already is.
7. **Audio.** Layer settings may take `uBeat`/`uLevel` as modulation (a "react to music" amount per layer). Reuse `AudioMod`; do not store the result.

## D.4 UI for the stacker (EFFECTS box), with Apple principles

- **List.** One row per layer, 28 px tall: drag handle, eye (on/off), name, opacity as a thin inline bar (drag to set, double-click resets), delete on hover. The three groups show as small sub-headers GRADE / OVERLAY / POST, so the fixed order is visible, not hidden (wayfinding: the user sees why a layer cannot move past a header). Reorder by dragging within a group only.
- **Drag feel.** The row stays under the pointer, offset kept; other rows slide aside; on release it settles with a critically damped spring plus the release velocity; it can be grabbed again mid-settle. Dragging past the group edge rubber-bands and returns. Keyboard: `Alt+Up/Down`. Drag accessibility guidance not fetched: UNVERIFIED.
- **Toggle and opacity respond on pointer-down.** The eye flips and the canvas updates on press. The opacity bar updates the canvas on every pointer move.
- **ADD.** `+ ADD` opens a category picker as a floating layer that grows from the button and closes back into it (same origin both ways). Tabs for the categories in D.5; each tab is a grid of thumbnails rendered from the current photo, with the effect applied on top of the current look (same renderer as the LOOK picker). A click adds the layer, selects it, and the picker stays closed after. A tile shows a flat grey placeholder until its render is ready.
- **Selected layer.** Shows below the list: its 2 to 4 essentials, a BLEND seg (NORMAL, ADD, SCREEN, MULTIPLY), and MORE (second level) [1].
- **Presets.** A `PRESETS` row above the list: whole stacks (look + layers + palette) saved as JSON in `localStorage` (try/catch, as `params.ts` does) and a few built-in ones. Applying a preset cross-fades the canvas. Export/import as a file is optional.
- **Limits.** A small cost meter: a bar of GPU cost estimated from the plan (points x look + overlays + post passes x pixels). It turns amber at the mobile cap. A disabled `+ ADD` with a plain hint ("too heavy for this device") beats a silent frame-rate drop.
- **Forgiveness.** Undo is one step per add, remove or reorder. Removing a layer shows UNDO for 6 seconds; no confirm dialog.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, rows jump to their slot with a short cross-fade instead of springing.

## D.5 Categories and the UI for each

Each category uses the same shell (thumbnail in the picker, then 2 to 4 essentials, then MORE) so that a user who learned one has learned all (familiarity). Only the essential controls differ, chosen by what is being set (mapping).

| Category | Effects | Layer kind | Essentials (first level) | MORE (second level) |
|---|---|---|---|---|
| **LOOK** (base) | Dots, Halftone, Mosaic, Dither, Pixel, ASCII, Stipple, Lines, Sticker, 3D, Wireframe, Mesh, Glass | base | Thumbnail grid (box 02), one XY pad, one seg. Not in the layer list. | The look's full setting list |
| **COLOUR** | Gradient map, Duotone, Thermal, Acid, Pattern blur, Holographic, X-ray | grade | Palette swatch row; DOMAIN seg; AMOUNT. | Gradient bar editor (stops: drag, click to add), angle dial |
| **LIGHT** | Bloom, Glow, Halo, Golden halftone bloom | post / overlay | THRESHOLD x INTENSITY as one XY pad; TINT swatch. | SCATTER, radius, blend |
| **SIGNAL** | VHS, Retro CRT, Glitch | overlay / post | One AMOUNT slider; TRIGGER seg (TIME / BEAT). | Each sub-effect on/off as chips, with its own amount |
| **MOTION** | Motion blur, Motion tracing, Stardust, Breakdown, Disappearing, Cosmic distortion | overlay / base-modifier | PROGRESS as a scrubber with LOOP toggle; DIRECTION dial; SPEED. | Easing, seed, per-effect extras |
| **SURFACE** | Grain, Glass, Mesh, Cloud | overlay / base | AMOUNT x SIZE as one XY pad. | Blend, tint, seed |
| **GRAPHIC** | Random stacking, Neo-brutalism | overlay / base | ANCHORS x LINKS as one XY pad; WORD LIST as a small text field. | Line style, font, colours |

Motion effects that change where particles go (Breakdown, Disappearing, Cosmic distortion, Motion blur) are **base modifiers**: they live in `place()` and have no ordering with grade layers. Show them in the list but pin them to a fixed spot labelled MOTION.

Scrubbers (PROGRESS) follow the drag rules above: 1:1 tracking, live canvas, and the LOOP toggle responds on press.

## D.6 Performance budget (mobile, 200k points)

All numbers are arithmetic from stated sizes, unless marked. No measurement was made on a device. Treat them as targets to check.

- **Frame target.** 16.6 ms at 60 fps. The existing ladder starts to step at an EMA above 21 ms (`adapt()`).
- **Vertex.** 200k points. Each extra `place()` evaluation (motion blur, tracing copies) costs about the same as the base; budget 2x for blur, 4 to 6x for copies on the strong tier only.
- **Overlay.** Grain and scanlines: one full-screen quad each, fill-rate only. Connecting lines: under 5k segments. Stardust: 5 percent extra points. Glow/cloud sprites: overdraw heavy, cap the sprite count and size.
- **FBO memory.** Per target: pixels x bytes. RGBA16F is 8 bytes per pixel. 1.0 Mpx = 8 MB; 2.96 Mpx (a 1170 x 2532 phone at DPR 1) = 23.7 MB. Two ping-pong targets plus a half-res bloom chain (about one third more): about 2.3x one target. At 1.0 Mpx that is about 18 MB. Keep the scene FBO at or below about 1.0 Mpx on phones (`postScale`), using the same idea as MDN's advice to render to a smaller back buffer on mobile [11].
- **Bandwidth.** Each full-screen pass reads and writes the framebuffer. Tiled mobile GPUs pay when an FBO is resolved to memory; MDN advises `invalidateFramebuffer` once an attachment is done [11]. Arm's bandwidth guide could not be read: figures UNVERIFIED.
- **Caps.** Post layers: 2 on low tier, 3 default, 5 strong. Overlays: 4 on low tier. Grade layers: 4 on low tier (cheap, so a loose cap).
- **Fallbacks.** No `EXT_color_buffer_float`: RGBA8 FBO, bloom threshold lowered, no HDR. No float blend needed (half-float blending is always supported [11]).
- **Ladder order (cheapest visible loss first):** post resolution, then drop motion tracing, then drop the heaviest post, then overlay sprites, then existing steps (trails, render scale, points).
- **Test.** Add a `scripts/verify-effects.mjs` Playwright script (existing pattern): for each effect, turn it on, step the sim, read pixels, fail on GL errors and console errors; log ms per frame from a fixed number of `renderAt` calls. The repo notes that the Browser pane throttles `requestAnimationFrame`, so step with `__engine.update`.

## D.7 Phased build order

| Phase | Work | Why first | Needs FBO |
|---|---|---|---|
| **0** | Fix DOTS point size to follow perspective; add per-look music hook into `uSP`. | Small, visible bug and a real improvement to music. | no |
| **1** | `src/core/effects.ts` registry, `Params.layers`, layer list UI (add, remove, reorder, eye, opacity), `grade()` hook with GRADIENT, DUOTONE, THERMAL, ACID. Oklab LUT builder on the CPU. | Biggest visual win for the least risk. Proves the data model and the shader-signature cache. | no |
| **2** | LOOK thumbnail picker (second `LiteEngine`), finer controls for the six weak looks (B), second level MORE, XY pads. Pixel size for dither, blue-noise tile, ASCII shape-matching. | Fixes the half-baked looks and the clutter. | no |
| **3** | Overlay layers: grain, scanlines, stardust, glow sprites, golden halftone bloom, random stacking. | Cheap, high-impact looks. | no |
| **4** | Scene FBO plus bloom (pyramid [6]); halo; cost meter and ladder extension. | The one structural change. Do it once the stack works. | yes |
| **5** | Per-particle motion blur, breakdown, disappearing, cosmic distortion, VHS, glitch, CRT. | Motion effects ride on `place()`. VHS chroma and CRT use the FBO. | partly |
| **6** | Sticker, 3D bars, wireframe, mesh, glass, neo-brutalism, X-ray, holographic, cloud; motion tracing (feedback FBO). | Riskiest geometry (depth buffer, overdraw). | tracing yes |

Done criteria per phase: `npx tsc --noEmit`, `npm test`, `npm run build`, a Playwright check that frame 0 and frame T of a LOOP export match with the stack on, and a screenshot of each new effect on a real photo. Update `docs/WEB_STUDIO.md` and `docs/PROJECT_LOG.md`.

## D.8 Open questions

- Is a depth buffer acceptable for the sticker look (recreate the context with `depth: true`), or do we sort by hash z?
- Do users want a second look as a layer (for example halftone over dots)? The model allows it with `kind: 'overlay'` and a base-look renderer, but it doubles vertex cost.
- Which look gets the first thumbnails, and what is the budget for rendering 8 thumbnails per photo change on a phone (render lazily on opening the LOOK box)?
- Atkinson as a CPU pass: confirm timing at 250k cells (not measured).
