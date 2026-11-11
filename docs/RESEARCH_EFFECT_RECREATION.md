# Research: Recreating a Reference Image as a Stack of Treatments

Research only. No source code, skill or config was changed. Nothing was committed. Date: 2026-11-11. Branch `master-web` (working tree with uncommitted changes, read as it stands).

Question: the current effect-making workflow gives results far from the reference. What is a better way to recreate a reference's full treatment stack (lighting, material, distortion, texture, compositing, blur) at 70% visual similarity or better, without rebuilding the particle engine, the particle behaviour or the depth system?

Evidence rules (same as the other `RESEARCH_*.md` notes):
- "Code fact" = read from the repo in this session, cited as `path:line`.
- Web claims carry a source number `[n]`. Section 10 lists every URL and says whether it was fetched.
- **UNVERIFIED** = not traced to a primary source in this session.
- **MEASURED** = a number I computed in this session. The method is stated next to it.
- **PROPOSAL** = a design choice of mine. Weights, thresholds and ranges are proposals until calibrated (section 5.6).
- GLSL and TypeScript shapes are sketches. Not compiled, not run.

---

## 0. Summary

1. **The workflow judges one renderer and ships another.** The skills tell the agent to write a CPU picture bake in `src/lite/treatBake.ts` and judge it on a contact sheet. The studio does not call those bakes. `TREAT_BAKES` is imported only by two scripts (`scripts/bake-sheet.mjs:21`, `scripts/bake-time.mjs:10`). At runtime the treatment ids are per-dot shader finishes (`src/main.ts:492`, `src/lite/shaders.ts:1325-1334`). The sheet the agent approves is not what the owner sees. This is the largest single cause, and it was not in the hypothesis list.
2. **A reference is a stack across three places. The workflow fills one.** The engine can already combine a per-dot finish with the post chain (bloom, halo, grain, duotone, VHS, bitmap). The workflow never assigns a component to the post chain, and the skill forbids stacking (`.agents/skills/image-to-effect/SKILL.md:52`).
3. **Nothing is measured.** The gate is six yes/no questions answered by the agent that made the effect. Route B ends at `tsc` and unit tests. No script compares an output with a reference. No reference image is stored for any treatment.
4. **The dot layer has a hard ceiling, and it is measurable.** MEASURED: the treated picture against its own DOTS screenshot scores SSIM 0.15 to 0.25 at full detail and 0.63 to 0.67 after an 8 px blur (4 looks, 512 px tall, crude alignment; section 5.5). Pixel metrics punish dots. Any "70%" must be defined at a blur scale and against that ceiling.
5. **Continuous qualities must come from the post chain, not from dots.** Bloom radius, blur, light leaks, grading, chromatic aberration, vignette, grain and dark-on-light compositing act on the final frame. `src/lite/Post.ts` has bloom, halo, grain and duotone, but no blur, no depth of field, no LUT, no vignette, no streaks, no light leaks, no blend modes other than screen, and no lens-style chromatic aberration.
6. **Recommended direction:** keep the engine. Add (a) analysis and scoring scripts, (b) a feasibility gate before code, (c) an "effect recipe" that lists components by layer and maps onto `Params`, (d) the picture pre-pass restored as a real runtime layer, (e) a small set of new post passes. Tooling first, renderer second (section 8).
7. **Adopt no rendering library.** Every candidate is either tied to another scene graph (three.js passes, pmndrs `postprocessing`, `pixi-filters`), under a licence that blocks commercial use (LYGIA, Shadertoy default), or adds more code than the passes it would replace. Borrow techniques and, where the licence is MIT, Zlib or CC0, short code.

Hypotheses (section 1): (a) partly holds, (b) holds, (c) holds, (d) holds with two corrections, (e) holds. Six causes were missing from the list.

---

## 1. Why the current approach falls short (root causes, from code)

### 1.1 Hypothesis (a): one layer per effect, no stacking. PARTLY HOLDS

What holds:
- The skill says "One effect per treatment. No stacking filters to hide a weak result" (`.agents/skills/image-to-effect/SKILL.md:52`).
- The two routes are exclusive: "Two routes. Pick one before writing code" (`.agents/skills/effect-maker/SKILL.md:8`). Route A is a picture bake. Route B is one `<name>Finish()` function.
- A LOOK tile switches every other finish off (`src/ui/Panel.ts:495-516`), and one field holds the treatment id (`src/core/params.ts:81`).

What does not hold:
- The engine is not limited to one layer. The per-dot finishes run one after another on the same colour (`src/lite/shaders.ts:1357-1377`). The post chain is switched by its own flags and wraps any look (`src/lite/LiteEngine.ts:917-921`, `:1121`). A finish plus bloom plus grain plus duotone renders today.
- So the limit is in the workflow and the tile model, not in the renderer. A look tile carries no post settings. Nothing in the skills tells the agent to set `glow`, `surface` or `signal` values (`src/core/params.ts:110`, `:119-120`) as part of a look.

### 1.2 Hypothesis (b): Route B captures palette, not structure. HOLDS

- `scripts/extract-style-inputs.mjs` outputs five colours and one light vector, nothing else (`:189-201`).
- The colours are medians of the reference, binned by the SOURCE luminance (`:136-140`, `:143-151`). They carry no spatial information.
- The light vector is the centroid of reference pixels brighter than 160 (`:127-133`). A halo, a flare and a specular all move it the same way.
- Reference pixels darker than luminance 8 are skipped (`:124`). A reference with a dark field loses that field.
- Both subject boxes are stretched to 512 x 512 (`:85-99`). Aspect is not kept, so the pixel pairing is wrong for any pair whose boxes differ in shape.
- The constants are pasted into "one of the 4 canonical material archetypes" (`.agents/skills/effect-maker/SKILL.md:98`). Line 57 now says the archetype is "a starting point, not a bin", but steps 2 to 5 and the runbook (`docs/EFFECT_MAKER_RUNBOOK.md:15-24`) are still the only concrete path.
- Nothing measures blur, bloom radius, grain, distortion, aberration or blend mode.

### 1.3 Hypothesis (c): no measured comparison. HOLDS

- Route A gate: six yes/no lines (`.agents/skills/effect-maker/SKILL.md:34`, `.agents/skills/image-to-effect/SKILL.md:58-69`). The same agent writes the effect and answers.
- Route B ends at `npm test` and `tsc` (`.agents/skills/effect-maker/SKILL.md:242-248`, `docs/EFFECT_MAKER_RUNBOOK.md:25-29`).
- `scripts/verify-treated.mjs` only takes screenshots (`:25`). `scripts/check-pixels.mjs` counts bright pixels in one fixed file (`:7`, `:21`).
- A search of `scripts/`, `tools/` and `tests/` for SSIM, LPIPS, pixelmatch or delta E code found none.
- No reference picture is stored per effect. `docs/effect-library/README.md:38` states the references were never seen: the skills' "Reference interpretation" sections were built from technique pages. `docs/effect-library/` holds treated samples, studio shots and tuning sheets only.

### 1.4 Hypothesis (d): hard renderer limits. HOLDS, WITH TWO CORRECTIONS

Holds:
- Screen blend of opaque-black background: `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR)` over `clearColor(0,0,0,1)` (`src/lite/LiteEngine.ts:513-514`), on a canvas with `alpha: false` (`:480`). A dark dot adds nothing. Dots cannot darken. Dark-on-light is impossible in the dot layer.
- 768 px working picture: `MAX_SIDE = 768` (`src/lite/sample.ts:23`). The texture the finishes read is the same 768 px grid with mipmaps (`src/lite/LiteEngine.ts:618-620`).
- Dots are flat squares: the fragment shader writes one colour (`src/lite/shaders.ts:1459-1462`). No soft sprite, no per-fragment work.
- Finishes run in the vertex shader. Each dot gets one colour. Structure finer than the dot spacing cannot exist. Most finishes read the picture at mip level 2 or coarser (for example `src/lite/shaders.ts:1242-1245`).

Corrections:
- "Black gets no particles" is a drawing fact, not a sampling fact. The sampling weight has a floor: `0.4 + 0.6 * edge + 0.5 * tone + 0.2 * sat` inside the mask (`src/core/Sampler.ts:195`). Dark subject pixels do get dots. They are invisible because of the screen blend. Only a flat background of an opaque photo is cut (`src/core/Sampler.ts:159`).
- Point size is a uniform, not a constant of the engine. Resting dots are `round(dpr)` device pixels (`src/lite/LiteEngine.ts:896-898`, `src/lite/shaders.ts:1391`). C-ABR already overrides it to 1.7x (`src/lite/shaders.ts:1392`). Size and density are available as a layer (L0, section 2) without engine work.

Added limits found in the post chain:
- All post targets are `RGBA8` (`src/lite/Post.ts:347`). The scene is clamped at 1.0 before bloom. Bloom needs a threshold (`:76-78`) and has no highlight headroom.
- The bloom chain is downsample only, four levels (`src/lite/Post.ts:372-374`, `:429-432`). There is no upsample or tent pass. The compose pass reads the 1/8 and 1/16 levels with bilinear magnification (`:234-239`). Wide glow is coarse and its radius is fixed by the level count.
- The compose pass has a fixed order and one blend: screen (`src/lite/Post.ts:262`).

### 1.5 Hypothesis (e): analysis by eye. HOLDS

The visual brief is a seven-line table filled in prose (`.agents/skills/image-to-effect/SKILL.md:22-34`). The only tool is the palette extractor of 1.2.

### 1.6 Causes not in the hypothesis list

1. **Gate and product use different renderers** (summary item 1). `src/main.ts:492` reads `const treatKey = '';   // particle finishes are shader-side: the sample does not change`. `sampleLite` receives a bake only for FACET (`src/main.ts:576`). The treatment sliders are packed into two `vec4` uniforms (`src/web/WebEngine.ts:379-390`) for `finDispatch` (`src/lite/shaders.ts:1325-1334`). Example of the gap: `bakeGlass` in `treatBake.ts` builds a lit backdrop, blurs, refracts per channel and draws an inner bevel line; the shipped `finGlass` is 17 lines with one procedural backdrop lookup and a Fresnel term (`src/lite/shaders.ts:1237-1253`).
2. **Stale instructions.** The skills say ids 44 to 49 and a `[44..49]` loop (`.agents/skills/effect-maker/SKILL.md:25`, `:41`). The code has `TREAT_IDS = [46..51]` (`src/core/styles.ts:24`). Ids 44 and 45 have slider blocks (`index.html:178`, `:216`) but no `finDispatch` branch and no category entry (`src/core/styles.ts:9-21`). Each effect skill still says "Implemented in `src/lite/treatBake.ts`" (for example `.agents/skills/effects/refract-glass/SKILL.md:45`).
3. **A look cannot own post settings.** The post chain exists, but a recipe of "finish + bloom radius + grain + grade" has no home. `presets` in `src/core/params.ts:271` shows the shape that would hold it (`Partial<Params>`).
4. **The picture pre-pass hook exists and is nearly unused.** `sampleLite(..., bake?)` (`src/lite/sample.ts:75`, `:90`) feeds dot colour, sampling weights, palette and the grid texture from one treated array. Only FACET uses it. `docs/RESEARCH_SINGLE_IMAGE_FILTER_THEN_PARTICLES.md` section 0 item 3 recommended exactly this hook. That finding still holds in the code.
5. **Unmeasured prior claim.** `docs/RESEARCH_EFFECT_INPUTS_AND_FIDELITY.md:16` states "90%-95% Perceptual Equivalence" as a target. No metric, no test images and no script back it. The measurement in 5.5 shows that a dot render does not reach that level against its own input picture on any pixel metric without heavy blur.
6. **Android carries only the dot layer.** `scripts/export-shaders.mjs:15` exports no `Post.ts` shader. `docs/PACK_FORMAT.md:62` lists the `glow` group as "accepted but not drawn yet". A look that depends on post passes will not match on the phone.

Still valid from older notes: `docs/effect-library/README.md:65-75` (seven-point diagnosis of the old effect-maker) and `docs/RESEARCH_GLASS_FIDELITY_AND_PARTICLE_LIMITS.md` causes 1, 3 and 4 (screen over-accumulation, discrete points, density against luminance). The line numbers in those files were not relied on.

---

## 2. Where a treatment can live: a layer model

The engine stays as it is. A treatment component is assigned to one of four layers.

| Layer | What it is | Today | Resolution | Runs | Carries to Android |
|---|---|---|---|---|---|
| **L0** dot geometry | Dot size, count, opacity, brightness, colour levels, trails | Exists: `trailSize`, `pointCount`, `fx` (`src/core/params.ts:5-13`, `:42`, `:130`), `uPointPx` (`src/lite/LiteEngine.ts:956`) | n/a | every frame | Yes (pack params) |
| **L1** picture pre-pass | The picture is treated before sampling | CPU hook `bake` in `sampleLite` (`src/lite/sample.ts:75`, `:90`). Used by FACET only (`src/main.ts:576`) | 768 px long side | once per picture or slider change | Yes if baked into `subject.png` offline (sliders frozen) |
| **L2** per-dot finish | Vertex shader recolours each dot from the picture texture | 20 named finishes plus `finDispatch` (`src/lite/shaders.ts:1357-1377`) | one value per dot | every frame | Yes (`scripts/export-shaders.mjs`) |
| **L3** screen post | Fullscreen passes over the rendered dots | `src/lite/Post.ts` | canvas size | every frame | No, not yet (`docs/PACK_FORMAT.md:62`) |

### 2.1 What L3 has today (read from `src/lite/Post.ts`)

| Exists | Where | Note |
|---|---|---|
| Bright prefilter with threshold | `:66-79` | 4-tap box, max-channel threshold |
| 13-tap downsample, 4 levels | `:82-97`, `:429-432` | Same tap pattern as the Call of Duty filter [9][10]; no upsample chain |
| Bloom and tinted halo, screen-added | `:233-240`, `:262` | Levels mixed by bilinear magnification |
| Patterned glow (dots, grid, scan, haze, warm spill) | `:242-261` | |
| VHS line wobble and noise | `:171-182`, `:200-205` | |
| Glitch slices | `:184-197` | |
| Horizontal RGB split | `:199` | Only as part of VHS or glitch. Lateral, constant. Not radial |
| Duotone | `:209-212` | Two colours on luminance |
| Holographic sheen, mesh gradient, cloud haze | `:213-231` | |
| Grain | `:290-296` | White hash, 1 to 4 px cells, mono, midtone weighted |
| Bitmap overlay (ink, grade, CGA, stipple) | `:298`, `src/lite/bitmapGlsl.ts:118` | |
| Graphic stack lines | `:263-289` | |

| Missing | Why it matters for references |
|---|---|
| HDR scene target (`RGBA16F`) | Highlights clip at 1.0 before bloom. Glow cannot be brighter than its source |
| Upsample or tent chain | Smooth, wide, natural bloom falloff [9][10] |
| Unthresholded soft fill | The only way to turn dots into a continuous surface |
| Gaussian, directional and radial (zoom) blur | Blur families, light streaks, motion feel |
| Depth of field | No depth reaches the post chain. `home.z` is known per dot (`src/lite/shaders.ts:1351`) but is not written to any target |
| Anamorphic streak | Horizontal flare lines |
| Light leaks, lens flare, lens dirt | Additive overlay textures or procedural gradients |
| Radial chromatic aberration, lens warp | Per-channel UV scale from the centre |
| 3D LUT or curves grade | Colour match beyond two-colour duotone |
| Vignette | |
| Blend modes (multiply, overlay, soft light, colour dodge) and a paper field | Needed for dark-on-light and for overlay textures |
| Chroma grain, blue-noise grain | Film grain is not white hash noise |
| Kuwahara, frequency separation | Painterly flattening, skin-style smoothing |

### 2.2 Treatment families by layer

Cost: "frame" = paid every frame at canvas size. "once" = paid when the picture or a slider changes. Fullscreen pass cost is discussed in 3.4.

**Lighting**

| Component | Layer | Standard technique | Cost | Lost through dots |
|---|---|---|---|---|
| Bloom | L3 | Downsample chain, tent upsample, add at low weight, HDR target [9][10] | frame: about 1.3x canvas pixels across all levels | Little. Bloom hides dot gaps. Best-matching family |
| Glow or halo, wide | L3 | Same chain, coarser levels, tint | frame, shared with bloom | Little |
| Light streak, anamorphic | L3 | Thresholded bright copy, 1D blur along x at low resolution, add [11] | frame: 2 to 3 small passes | Little |
| Lens flare, ghosts | L3 | Screen-space ghosts and halo from the bright copy, lens-dirt texture [11] | frame: 2 small passes plus 1 texture | Little |
| Light leak | L3 | Additive or screen overlay: procedural gradient or a photo texture | frame: inside compose, about free | None. It is an overlay |
| Rim light, specular | L2 (shape) + L3 (glow) | Normal from luminance and depth gradients, Fresnel, Blinn-Phong | none extra | Hairline highlights break into dotted lines |
| Baked light shapes (strip lights, floor line) | L1 | Paint into the picture | once | Thin lines thinner than about 2 px at 768 px vanish |

**Material**

| Component | Layer | Standard technique | Cost | Lost through dots |
|---|---|---|---|---|
| Chrome, metal | L1 or L2 | Matcap or environment ramp indexed by a normal from relief | once or none | Mirror continuity. Hard bands survive, smooth gradients turn grainy |
| Glass, translucent | L1 (refraction) + L3 (fill, rim glow) | Backdrop texture sampled at refracted offsets, per-channel IOR, Fresnel [12] | once + frame | The clear, smooth body. Needs the soft fill pass and a lit backdrop |
| Liquid | L1 | Low-frequency displacement plus specular ridges | once | Fine ripples |
| Holographic, iridescent | L2 or L3 | Hue from relief phase plus view term (thin-film style ramp) | none | Little. Colour survives dots well |
| Subsurface, candy | L2 | Blurred picture lookup added to body colour | none | Little |

**Distortion**

| Component | Layer | Standard technique | Cost | Lost through dots |
|---|---|---|---|---|
| Refraction of the subject | L1 | Displacement by a normal map or a supplied displacement texture | once | Detail below the 768 px grid |
| Displacement, warp, liquify | L1 (static) or L3 (animated, whole frame) | UV offset field | once or frame | L3 warp moves dots as blocks; fine for wobble, wrong for parallax |
| Chromatic aberration, radial | L3 | Sample R, G, B at UV scaled about the centre | frame: 3 reads in compose | None |
| Chromatic aberration on edges of the subject | L1 or L2 | Per-channel offset of the picture | once or none | Fringe under 1 px at 768 px |
| Lens barrel or pincushion | L3 | UV remap | frame, inside compose | None |

**Texture**

| Component | Layer | Standard technique | Cost | Lost through dots |
|---|---|---|---|---|
| Film grain | L3 | Noise added after everything, luminance weighted; blue-noise texture or a grain model [14][15] | frame, inside compose | None. Note the dots already add their own grain |
| Noise mottling | L2 or L3 | Value or simplex noise | none | Little |
| Halftone | Cell look (exists) or L3 | Rotated grid, dot radius from tone | exists | A halftone baked in L1 aliases against the dot grid. Do not bake it |
| Dither | Cell look or L3 bitmap (exists) | Bayer, blue noise | exists | Same aliasing warning |
| Scratches, dust, paper | L3 | Overlay texture with multiply or screen | frame, 1 texture | None. Needs an asset |

**Compositing**

| Component | Layer | Standard technique | Cost | Lost through dots |
|---|---|---|---|---|
| Colour grade | L3 (final) or L0 `fx` | 3D LUT with trilinear lookup [13], or curves | frame: 1 lookup | None |
| Duotone, gradient map | L3 (exists) | Ramp on luminance | exists | None |
| Blend-mode overlay | L3 | Multiply, overlay, soft light formulas in compose | frame, inside compose | None |
| Dark subject on a light field | L3 only | Treat the dot frame as ink density over a paper colour: `paper * (1 - ink)` | frame, inside compose | Possible only here. Dots cannot darken (1.4) |
| Mask (effect only on part of the frame) | L3 with a mask source | Luminance mask from the scene, or the picture alpha drawn to a second target | frame; alpha mask needs an extra target | Mask edges follow dots, so they are soft |
| Vignette | L3 | Radial falloff multiply | frame, inside compose | None |

**Blur**

| Component | Layer | Standard technique | Cost | Lost through dots |
|---|---|---|---|---|
| Gaussian, whole frame | L3 | Downsample chain reuse, or dual filter [16] | frame, shared | None. Also fills dot gaps |
| Gaussian, of the subject only | L1 | Box or Gaussian on the picture | once | Dots re-sharpen it: each dot is a hard pixel. Needs L3 fill to read as soft |
| Directional, motion | L3 or L1 | 1D taps along an angle | frame: 1 pass, 8 to 16 taps | L1 version reads as smeared colour, not as soft blur |
| Radial, zoom | L3 | Taps toward the centre | frame: 1 pass | None |
| Depth of field | L0 (cheap) or L3 (needs depth target) | L0: point size and opacity from `home.z`. L3: circle of confusion from a depth target, gather blur [9] | L0: none. L3: MRT or second draw of 500k points, plus blur | L0 gives square bokeh, not round. L3 depth has holes between dots |
| Selective focus, tilt-shift | L3 | Blur mixed by a screen-space mask | frame | None |
| Kuwahara, painterly | L1 | Sector mean and variance; anisotropic version [17] | once (slow on CPU, fine on GPU) | Dots re-add grain. Needs L3 fill |

Reading the tables: lighting, compositing, grain and whole-frame blur fit L3 with almost no loss. Material and distortion fit L1 or L2 and lose continuity. The loss is recovered only by an L3 soft fill. That is why a single-layer workflow cannot reach glass, liquid or soft-focus references.

### 2.3 L1 as a GPU pre-pass (evaluation)

Today L1 is CPU code on a `Uint8ClampedArray` (`src/lite/sample.ts:90`). A GPU version would render the picture through a few fullscreen passes into FBOs, then `readPixels` into the same array.

| Point | CPU bake (today's hook) | GPU pre-pass |
|---|---|---|
| Fits the hook | Yes, as is | Yes: output of `readPixels` is the `rgba` the sampler wants |
| Blur, displacement, per-channel offset | Works; separable box blur exists (`src/lite/treatBake.ts:57-86`) | Faster, and the same GLSL can be reused in L3 |
| Slider response | `scripts/bake-time.mjs` exists to time each bake; not run in this session | Expected to be interactive at 768 px (0.44 Mpx at 2:3) |
| Context | Works in a worker | Needs a GL context. Either the engine's own context (state care needed) or a second offscreen canvas (texture upload twice) |
| Android | Offline only, baked into `subject.png` | GLSL could be exported like the dot shaders |
| Risk | Two implementations (Python `tools/treat/treat.py`, TypeScript) drift | Float precision of `readPixels` back to 8 bit; none if targets are `RGBA8` |

Verdict: restore the CPU hook first (it is one line in `src/main.ts`). Move to a GPU pre-pass only when a recipe needs a kernel the CPU cannot do at slider speed, or when the same pass is wanted in L3.

---

## 3. Alternative implementation methods, evaluated

### 3.1 Libraries

Sizes: only where the project page states one. Others are marked UNVERIFIED and should be measured with the bundler before any decision.

| Candidate | What it is | Licence | Size | Fits raw WebGL2 `src/lite`? | Verdict |
|---|---|---|---|---|---|
| three.js `EffectComposer` and passes | Pass chain for a three.js renderer. The directory lists Bloom, UnrealBloom, Bokeh, Film, Glitch, Halftone, LUT, DotScreen, Afterimage, SMAA and others [1] | MIT [2] | UNVERIFIED | No. Passes need `WebGLRenderer` and its render targets. `src/lite` does not use three.js. Adopting it would pull the renderer into the lite path | **Borrow technique.** `UnrealBloomPass` and `LUTPass` are readable references for bloom mixing and LUT lookup |
| pmndrs `postprocessing` | Effect library for three.js. Merges many effects into one pass, uses one fullscreen triangle. Bloom, blur, depth of field, LUT, vignette, chromatic aberration, noise, god rays, tone mapping [3] | Zlib [3] | UNVERIFIED | No. three.js is a peer dependency [3] | **Borrow technique.** The "merge effects into one pass" design is what `FRAG_COMPOSE` already does (`src/lite/Post.ts:99-300`); keep doing it |
| PixiJS filters, `pixi-filters` | About 40 filters for the PixiJS renderer: AdvancedBloom, KawaseBlur, ZoomBlur, RadialBlur, MotionBlur, TiltShift, RGBSplit, Godray, OldFilm, CRT, ColorMap, BulgePinch, Displacement and others [4] | MIT [4] | UNVERIFIED | No. Filters are PixiJS `Filter` objects | **Borrow code.** The fragment shaders are short and MIT. Good source for zoom blur, tilt-shift, godray, old film |
| LYGIA | Large GLSL function library: color, filter, distort, generative, lighting and more [5] | Prosperity Public License 3.0.0: free for non-commercial use, commercial use limited to a 30-day trial. Sponsors and contributors get the Patron licence [5][6] | n/a (source includes) | Technically yes (plain GLSL) | **Reject for shipped code** unless the owner sponsors the project. The Android app and a portfolio embed can count as commercial use; that is the owner's call. Reading it for technique is fine |
| glfx.js | Image effects library on WebGL [7] | MIT [7] | UNVERIFIED | No. Own canvas and texture wrapper. WebGL version and maintenance state not visible on the page | **Borrow technique** only (lens blur, tilt-shift, swirl ideas) |
| OpenCV.js | OpenCV compiled to WebAssembly | Apache-2.0 [8] | Multi-megabyte single file. UNVERIFIED (docs page and npm page returned HTTP 403) | Not for runtime | **Reject for runtime. Not needed for analysis either:** Python with NumPy, SciPy and scikit-image is installed and covers section 4. OpenCV for Python (`opencv-python`) is the simpler install if dense optical flow by Farneback is wanted |
| regl | Functional WebGL wrapper | MIT [18] | UNVERIFIED | Would replace hand-written GL in `Post.ts`. WebGL2 support not stated on the page [18] | **Reject.** `Post.ts` needs about 40 lines of helper (`target`, `pass`), which it already has (`:342-357`, `:418-428`) |
| twgl.js | Thin WebGL helper, WebGL2 aware [19] | MIT [19] | UNVERIFIED | Yes, but adds a dependency for convenience only | **Reject.** Same reason |
| OGL | Minimal WebGL library, zero dependencies. Stated sizes: core 8 kB, math 6 kB, extras 15 kB [20] | Unlicense [20] | 29 kB total [20] | It is a small scene graph. `src/lite` has its own | **Reject** |
| gl-react | React components that compose shaders [21] | MIT [21] | UNVERIFIED | No. `CLAUDE.md` rule: no React in the core | **Reject** |
| glsl-canvas | Loads a fragment shader into a canvas; supports multiple buffers and textures [22] | MIT [22] | UNVERIFIED | Not as a runtime | **Borrow as a prototyping tool only.** A recipe's L3 shader can be tried in isolation on a still screenshot before wiring |
| ISF (Interactive Shader Format) | A file format: GLSL fragment shader plus a JSON header with `INPUTS` and multi-pass `PASSES`, persistent buffers [23] | MIT (spec repo) [23] | n/a | The format, not a runtime | **Borrow the idea.** The JSON header is a proven shape for "pass list plus typed inputs". Section 7.2 uses the same idea |
| Shadertoy | Technique source | Per-shader. The site default when the author states nothing is reported as CC BY-NC-SA 3.0, **UNVERIFIED**: the terms page returned HTTP 403 [24] | n/a | Code needs porting (`mainImage`, `iChannel`) | **Technique source only.** Do not copy code unless the shader states a permissive licence |
| The Book of Shaders | Tutorial text and examples | The repository README says "All rights reserved"; a separate licence file was not readable (HTTP 404) [25] | n/a | n/a | **Technique source only.** Rewrite, do not copy |

### 3.2 Technique write-ups (primary sources)

| Technique | Source | What to take | Status in the repo |
|---|---|---|---|
| Bloom: 13-tap downsample, 3x3 tent upsample with a radius per level, no threshold, blend near 0.04, 1/(1+luma) weighting on the first step against fireflies | Jimenez, SIGGRAPH 2014 [9]; LearnOpenGL guest article [10] | The upsample chain and the HDR target. [10] uses `R11F_G11F_B10F` and 5 to 6 levels | Downsample exists (`src/lite/Post.ts:82-97`). Upsample, HDR and firefly weight do not |
| Dual filter (dual Kawase) blur | Bjorge, ARM, SIGGRAPH 2015 [16] | Cheap wide blur on mobile from a down and up pyramid | **UNVERIFIED**: the ARM page returned HTTP 404. The technique is also named by `pixi-filters` `KawaseBlurFilter` [4] |
| Depth of field, bokeh | Jimenez 2014, scatter-as-gather [9] | Circle-of-confusion gather at half resolution | Needs a depth target first (2.1) |
| Refraction with a backbuffer texture, per-channel IOR, Fresnel | Heckel 2023 [12] | Render what is behind into an FBO, sample it at refracted offsets, one IOR per channel | L1 analogue exists in `bakeGlass` (`src/lite/treatBake.ts:386`), unused at runtime |
| LUT colour grading | Selan, GPU Gems 2, chapter 24 [13] | 32x32x32 lattice stored as a 2D strip or a 3D texture; scale and offset by `(N-1)/N` and `1/(2N)`; 8-bit storage bands, prefer more precision | None. WebGL2 has `TEXTURE_3D` in core, so a real 3D LUT is possible |
| Blue-noise dithering | Peters, free blue-noise textures, CC0 [14] | 64x64 tileable textures, 1 to 4 channels; replaces white hash noise in grain and stipple | White hash only (`src/lite/Post.ts:129`, `:292`) |
| Film grain | Newson, Faraj, Galerne, Delon, IPOL 2017 [15] | Physically based grain, resolution independent, by Monte Carlo. Too slow for a frame; use it as the reference look and approximate with filtered blue noise | Hash grain (`src/lite/Post.ts:290-296`) |
| Lens flare, anamorphic streak, lens dirt, chromatic ghosts | Chapman 2017 [11] | Reuse the bloom downsample, generate ghosts and halo, blur, add with a dirt texture | None |
| Chromatic aberration | Per-channel sampling offsets; described inside [11] and [12] | Radial: scale UV about the centre per channel | Lateral only (`src/lite/Post.ts:199`) |
| Kuwahara | Kyprianidis, Kang, Dollner, Pacific Graphics 2009 [17] | Painterly flattening that keeps edges | None |
| Frequency separation | Standard practice: low = Gaussian blur, high = image minus low. **UNVERIFIED** (no primary source fetched) | Use in analysis (section 4) to separate tone from texture, and in L1 to treat them apart | None |

### 3.3 WebGL2 facts that bound the design

- Float render targets are not core. `EXT_color_buffer_float` makes `R16F`, `RG16F`, `RGBA16F`, `R32F`, `RG32F`, `RGBA32F` and `R11F_G11F_B10F` colour-renderable, WebGL2 only [26]. `EXT_color_buffer_half_float` covers systems that render only to 16-bit float; on WebGL2 it accepts `RGBA16F` only [27].
- "Render-to-float32 doesn't imply float32-blending" and "Float16-blending is always supported" [28]. The dots are blended into the scene target (`src/lite/LiteEngine.ts:513`), so an HDR scene must be `RGBA16F`, with an `RGBA8` fallback when the extension is missing.
- Multiple render targets are core: `drawBuffers` is part of WebGL2 [29]. A depth or mask target next to the colour target is possible in one draw of the points. Blending applies to every target with the same function, which complicates writing depth under screen blend. Not tried.
- Safe limits that "effectively all systems support": `MAX_TEXTURE_SIZE` 4096, 8 fragment texture units, 4 vertex texture units [28]. The compose pass already binds 5 to 6 units (`src/lite/Post.ts:442-446`, `:472`). A LUT, a dirt texture and a leak texture would exceed 8. Budget: merge overlay textures into one atlas, or use a second compose pass.
- Mipmapped blur: `generateMipmap` needs a colour-renderable and filterable format [28]. It is a box filter per level and shimmers under motion; the explicit downsample chain already in `Post.ts` is the better base.
- Mobile: `highp` in fragment shaders can fail on old hardware; `mediump` can corrupt results [28]. `Post.ts` shaders declare `precision highp float` (`:67`, `:83`, `:100`). The dot fragment shader is `mediump` (`src/lite/shaders.ts:1460`).
- Tiled GPUs pay for stored attachments; `invalidateFramebuffer` after a pass is the stated remedy [28]. `Post.ts` does not call it.
- Rendering to a smaller back buffer and upscaling is the standard quality trade [28]. The engine already scales by `dpr` (`src/lite/LiteEngine.ts:803`).

### 3.4 Fill rate at 500k points plus N passes

No render benchmark script exists in the repo. `scripts/bench-depth.mjs` times depth inference only. The numbers below are arithmetic from code facts, not measurements.

- Dots: up to 524,288 points (`src/core/params.ts:257`), each `round(dpr)` pixels square (`src/lite/LiteEngine.ts:896-898`). At `dpr` 1.5 that rounds to 2 px: about 2.1 M fragment writes. At `dpr` 1: about 0.5 M. Each is one colour write with blending.
- Canvas: a 1440 x 900 CSS stage at the default `maxDpr` 1.5 (`src/lite/LiteEngine.ts:490`) is 2160 x 1350 = 2.9 Mpx.
- Existing post chain: prefilter at 1/2 size (0.73 Mpx, 4 reads), three downsamples at 1/4, 1/8, 1/16 (0.18 + 0.05 + 0.01 Mpx, 13 reads each), then one compose at full size (2.9 Mpx, up to about 12 reads with every option on).
- So one extra full-size pass costs more fragments than the whole dot draw. Passes at 1/2 size cost a quarter of that. Rule: new work goes inside the compose pass or runs at 1/2 size or smaller. At most one extra full-size pass.
- An `RGBA16F` scene target doubles the bytes of the scene target (8 bytes per pixel against 4): 23 MB at 2.9 Mpx. `docs/RESEARCH_EFFECTS_UI.md` section 0.1 reached the same per-target figure for a phone.
- The quality ladder (`src/lite/LiteEngine.ts:1195-1217`) sheds trails, then resolution, then points when the frame time average passes 21 ms. It never sheds post passes. A recipe-heavy look needs a rung that halves post resolution first.

---

## 4. Reference analysis: how to decompose a reference into a stack

Two cases. Case (ii) allows far more.

- **(i) Single treated image.** Only statistics of the image itself. No ground truth for "what was the source".
- **(ii) Source and target of the same subject.** Aligned pixel pairs. Transfer functions and displacement fields can be fitted.

Tools present on this machine (checked in this session): Node with `sharp` and `playwright` in `node_modules`; Python 3.14 with NumPy 2.5, SciPy 1.18, scikit-image 0.26, Pillow 12.3. Not present: `cv2`, `torch`. `tools/treat/treat.py` already depends on Pillow, NumPy and SciPy (`:16`). Recommendation: one Python script, `tools/analyze/analyze.py`, that writes a JSON report and a contact sheet. OpenCV.js is not needed.

| # | Measurement | Method | Tool | Needs pair? | Reliability |
|---|---|---|---|---|---|
| 1 | Palette | k-means in Lab on subject pixels, with area share and mean position of each cluster | scikit-image, SciPy | No | Reliable |
| 2 | Tone curve | Pair: per-channel histogram matching gives a monotone curve per channel (`match_histograms` [31]). Single: luminance histogram, black and white points, midtone, contrast | scikit-image | Curve needs a pair | Reliable for global grades. Wrong when the treatment is local (bloom, vignette) unless those are removed first |
| 3 | Colour grade as a 3D LUT | Pair: bin source colours on a 17 or 33 lattice, average the target colour per bin, fill empty bins by smoothing. Residual after the LUT shows what is not a grade | NumPy | Yes | Reliable where source colours are well spread. Empty lattice regions are guesses |
| 4 | Simple colour transfer | Mean and standard deviation per channel in a decorrelated space (Reinhard et al. 2001 [32], UNVERIFIED: PDF not readable) | NumPy | No (works between any two images) | Reliable as a first-order summary |
| 5 | Global blur | Variance of the Laplacian (higher = sharper) and edge-width: 10% to 90% rise distance across the strongest edges | SciPy | Pair gives a ratio; single gives an absolute value that depends on content | Edge width is fairly reliable. Laplacian variance alone is fragile: grain raises it, so denoise or measure after a small blur |
| 6 | Selective focus | Measurement 5 on a grid of tiles; a map of edge width | SciPy | No | Reliable only where tiles contain edges. Flat tiles return nothing |
| 7 | Bloom or halo radius and threshold | Find the top highlights (connected regions above the 99th percentile). Average the luminance as a function of distance from each region's boundary. Fit a falloff: radius at 50% and at 10%, and the tail level. Threshold: the lowest source luminance that still shows a halo in the target | SciPy `distance_transform_edt` | Radius: no. Threshold: yes | Reliable on dark backgrounds. Fragile on busy backgrounds |
| 8 | Streaks and flares | Radial profile per angle around each highlight. A peak at one angle = streak (anamorphic if at 0 degrees). Secondary bright discs on the line through the image centre = ghosts | NumPy | No | Streak angle and length are reliable. Ghost detection is fragile |
| 9 | Grain intensity | Robust noise sigma from wavelet detail coefficients (`estimate_sigma`, Donoho and Johnstone, assumes Gaussian noise [33]) on flat regions; per channel | scikit-image | No | Reliable when flat regions exist |
| 10 | Grain size and colour | Radially averaged power spectrum of a flat patch minus its low-pass. The frequency where power falls to half gives grain size in pixels. Correlation of the noise between R, G and B tells mono from chroma grain | NumPy FFT | No | Reliable with a flat patch of 64 px or more. JPEG blocks show as peaks at 1/8 px |
| 11 | Halftone or dither | 2D FFT magnitude of luminance. Isolated peaks away from the centre = periodic screen. Peak position gives pitch and angle. Four peaks at 90 degrees = dot screen; two = line screen. Ordered dither shows peaks at the matrix period; blue noise shows an empty low-frequency disc and no peaks | NumPy FFT | No | Reliable for regular screens. Stochastic stipple gives only a ring |
| 12 | Chromatic aberration | Edge maps of R, G and B. Shift between channels per tile by phase correlation (`phase_cross_correlation` [30]). Shift growing with distance from the centre = radial (lens). Constant shift = lateral (RGB split) | scikit-image | No | Reliable above about 0.5 px shift. Colourful subjects give false shifts; restrict to strong neutral edges |
| 13 | Distortion or refraction field | Pair, after global alignment: dense optical flow from source to target (`optical_flow_tvl1` [30]) on edge or luminance-normalised images. The flow is the displacement map | scikit-image | Yes | Fragile. Works for mild warps on similar-looking pairs. Fails when the treatment also changes colour and tone strongly (chrome, glass). Phase correlation per tile is sturdier but coarse |
| 14 | Global misalignment | Phase correlation for shift; subject bounding box for scale | scikit-image | Yes | Reliable for shift. Scale from boxes is rough |
| 15 | Blend or overlay | Pair: for each pixel, test which formula maps source to target with one overlay colour per region: multiply `t = s*o`, screen `t = 1-(1-s)(1-o)`, add `t = s+o`. The formula with the lowest residual and a smooth `o` wins. `o` is then the recovered overlay (light leak, gradient, vignette) | NumPy | Yes | Reliable for one smooth overlay. Fragile for stacked overlays |
| 16 | Vignette | Mean luminance against radius, after removing the subject | NumPy | No | Reliable on plain backgrounds |
| 17 | Specular structure | Share of pixels above a high percentile, the size distribution of those regions, their elongation and direction | SciPy `label` | No | Reliable. Tells "many small glints" from "few broad bands" |
| 18 | Tonal banding | Number of modes in the luminance histogram and the gradient histogram shape (hard steps against smooth ramps) | NumPy | No | Reliable |
| 19 | Field polarity | Mean luminance of the border against the subject. Light field with dark subject triggers the L3 paper rule (section 6) | NumPy | No | Reliable |

Order matters. Remove what can be removed, then measure the next: vignette and overlays (15, 16), then grade (2, 3), then bloom (7), then blur (5), then grain (9, 10). Each fitted component is applied to the source and the residual is inspected. The residual sheet is the honest record of what the stack does not explain.

### 4.1 What a vision model adds, and what it does not

Adds:
- Names of materials and of the likely stack ("glass body, rim light, lens flare, grain"). Useful to choose which measurements to run and which layer to try first.
- Semantics no statistic gives: what the subject is, what must stay recognisable, which element is the light source.
- A sanity read of the residual sheet.

Does not add:
- Numbers. A radius in pixels, a grain sigma, a hue angle, a displacement field or a blend formula from looking is a guess. Use the scripts.
- A repeatable score. Two readings of the same pair can differ. A model's "looks 80% similar" is not a measurement and must not be reported as one.
- Detection of small effects: a 1 px channel shift, 2% grain, a slight vignette.

Rule for the workflow: the vision read proposes components; a component enters the recipe only with a measurement next to it, or with the label "by eye".

---

## 5. Measuring similarity: what "70%" can mean

### 5.1 Metrics and their sources

| Metric | Measures | Source | Range, direction | Fit here |
|---|---|---|---|---|
| SSIM | Local luminance, contrast and structure agreement | Wang, Bovik, Sheikh, Simoncelli, IEEE TIP 13(4), 2004 [34] | up to 1, higher is closer | Good after blur and downscale. The authors' page advises downsampling so the image is about 256 px before computing [34] |
| MS-SSIM | SSIM over several scales | Wang, Simoncelli, Bovik, Asilomar 2003 [35] (UNVERIFIED: PDF not readable) | up to 1, higher is closer | Good idea (coarse scales tolerate dots). Not in scikit-image; easy to build from SSIM on a pyramid |
| LPIPS | Distance between deep network features | Zhang, Isola, Efros, Shechtman, Wang, CVPR 2018 [36] | 0 upward, lower is closer | Tolerates small misalignment better than SSIM. Needs PyTorch [36] |
| DISTS | Structure and texture similarity on deep features; stated as robust to texture variance and mild misalignment | Ding, Ma, Wang, Simoncelli, 2020 [37] | lower is closer | The best conceptual fit for dots (a dot field is a texture resampling). Needs PyTorch [37] |
| FLIP | Error map for rendered images, built for alternating-image comparison | Ebelin, Akenine-Moller and others, NVlabs [38] | 0 to 1 per pixel, lower is closer | Strict per-pixel judge. Useful for "bake A against bake B", too strict for dots |
| CIEDE2000 | Perceptual colour difference in Lab | Sharma, Wu, Dalal, Color Research and Application 30(1), 2005 [39] | 0 upward | The colour component. In scikit-image as `deltaE_ciede2000` |
| GMSD | Gradient-magnitude similarity, pooled by standard deviation | Xue, Zhang, Mou, Bovik, 2013 [40] | 0 upward, lower is closer | Cheap edge and detail component. About 20 lines of NumPy |
| Histogram distance | Distribution of colour, alignment free | Standard; earth mover's distance in SciPy (`wasserstein_distance`) | 0 upward | The only kind that works when reference and output show different subjects |

### 5.2 Implementations and install cost (Windows, Node 20)

| Package | Licence | Install | Notes |
|---|---|---|---|
| scikit-image `structural_similarity`, `deltaE_ciede2000`, `match_histograms` | BSD (UNVERIFIED, not fetched) | Already installed | Pass `data_range` explicitly; `gaussian_weights=True` uses sigma 1.5 [41] |
| `ssim.js` | MIT [42] | `npm i -D ssim.js` | Pure JavaScript port of Wang et al.; default variant "weber" [42]. Native-dependency status not stated on the page |
| `pixelmatch` | ISC [43] | `npm i -D pixelmatch` | No dependencies. Counts mismatched pixels with an anti-alias detector [43]. A regression tool, not a similarity score. Useful to prove "the TypeScript bake equals the Python bake" |
| `sharp` | UNVERIFIED | Already in `node_modules` | Resize, blur, raw pixel access for a Node scorer |
| `lpips` | BSD-2-Clause [36] | `pip install lpips` plus PyTorch (CPU wheel, several hundred MB; Python 3.14 wheel availability UNVERIFIED) | Inputs in [-1, 1] |
| `dists-pytorch` | MIT [37] | `pip install dists-pytorch` plus PyTorch | |
| `flip-evaluator` | BSD-3-Clause [38] | `pip install flip-evaluator`, Python 3.10 or newer, no PyTorch for the core tool [38] | |
| `pyiqa` | PolyForm Noncommercial 1.0.0 plus other licences [44] | `pip install pyiqa` plus PyTorch | Many metrics in one package. The non-commercial licence makes it a poor base for project tooling |
| ONNX route | n/a | `onnxruntime-node` is already in `node_modules` (a dependency of `@huggingface/transformers`) | An LPIPS or DISTS model exported to ONNX could run in Node with no PyTorch. UNVERIFIED: no export was tried and no ready model was checked |

Recommendation: start with scikit-image only (zero install). Add DISTS or LPIPS later as a sixth, optional component if calibration (5.6) shows the hand-built components disagree with the owner's eye.

### 5.3 The alignment problem

1. **Framing.** A canvas screenshot has the subject at another scale and position than the reference, with tilt from PAN and parallax from depth. Fix: render the score shot with motion off (`drift` 0, `panAmount` 0, depth relief 0, trails off), no UI, at a fixed size; crop both images to the subject box; then refine with phase correlation [30].
2. **Dot structure.** The output is a field of 1 to 2 px squares with gaps. Any metric with a small window sees noise. Fix: compare at a blur scale larger than the dot spacing. Score structure at low frequency only. Score texture by statistics, not by position.
3. **Different subject.** Most references show another subject than the owner's picture. Then no pixel pairing exists at all. Only alignment-free components apply (colour distribution, grain spectrum, glow profile, blur level, edge density). A "70%" for such a reference is a style-statistics score. It is weaker evidence than a paired score and must be labelled as such.
4. **Getting a pair.** Either the owner supplies source and target of the same subject, or the treatment is first reproduced as a flat picture (L1 plus an offline L3 emulation) on the reference's own subject when the untreated original is available.

### 5.4 Proposed composite score (PROPOSAL, uncalibrated)

Both images are cropped to the subject box and resized so the long side is 256 px (the SSIM authors' advice [34]). `sigma` values are in pixels at that size.

| Component | Weight | How it is computed | Scale | Needs pair? |
|---|---|---|---|---|
| **C** colour and tone | 0.25 | Paired: `1 - clamp(mean CIEDE2000 / 30)` on images blurred with sigma 2. Unpaired: `1 - clamp(EMD of L, a, b histograms / k)` | sigma 2 | Both forms exist |
| **S** low-frequency structure | 0.30 | SSIM on luminance after Gaussian blur, averaged over sigma 2 and sigma 4 (a two-scale MS-SSIM) | sigma 2, 4 | Yes |
| **E** edge and detail | 0.15 | `1 - clamp(GMSD / 0.25)` on luminance blurred with sigma 1, plus the ratio of edge-width medians (measurement 5) | sigma 1 | GMSD yes; edge width no |
| **T** texture statistics | 0.15 | `1 - clamp(log-spectral distance)` between radially averaged power spectra of the high-pass (image minus sigma 2 blur), in 8 log bands. No pixel pairing | high-pass | No |
| **G** glow profile | 0.15 | Agreement of the highlight falloff curves (measurement 7): radius at 50%, radius at 10%, tail level. `1 - mean relative error`, clamped | native | No |

`score = 100 * (0.25 C + 0.30 S + 0.15 E + 0.15 T + 0.15 G)`. For an unpaired reference, S and the GMSD half of E are dropped and the rest is renormalised; the result is reported as `style score`, never as `similarity`.

The clamp divisors (30, 0.25, `k`) and the weights are my starting values. They rest on nothing but the ranges seen in 5.5 and on common use of delta E. They need the calibration of 5.6.

### 5.5 Two scoring points, and the ceiling of the dot layer

- **Score A: treated picture against reference.** The flat result of L1, with L3 emulated offline, before particles. It answers "is the recipe right?".
- **Score B: canvas screenshot against reference.** After particles. It answers "does it survive the dots?".

MEASURED in this session, as a first look at the ceiling. Inputs: the six treated pictures `docs/effect-library/samples/sample-10__*.png` and the studio DOTS screenshots of those same pictures `docs/effect-library/studio/*.png` (made by `scripts/verify-treated.mjs`). Method: composite the treated picture on black; crop both to the bright bounding box; resize to 512 px tall; SSIM on luminance (scikit-image) after a Gaussian blur of sigma 0, 2, 4, 8, 16 px; mean CIEDE2000 at sigma 8. Alignment was by bounding box only; the screenshots have PAN tilt and a faint stage grid. The scratch script was not saved in the repo.

| Look | SSIM s0 | s2 | s4 | s8 | s16 | mean dE00 at s8 | Note |
|---|---|---|---|---|---|---|---|
| holo | 0.17 | 0.42 | 0.55 | 0.67 | 0.79 | 3.7 | |
| glass | 0.15 | 0.42 | 0.56 | 0.67 | 0.79 | 2.4 | |
| crystal | 0.20 | 0.46 | 0.57 | 0.67 | 0.77 | 2.7 | |
| neon | 0.25 | 0.43 | 0.52 | 0.63 | 0.76 | 8.0 | |
| chrome | 0.06 | 0.09 | 0.16 | 0.34 | 0.56 | 11.5 | Bounding box failed (pedestal cut). Misaligned. Discard |
| stipple | 0.14 | 0.15 | 0.17 | 0.26 | 0.56 | 14.0 | Likely misaligned or an older sample. Discard |

What this supports:
- A dot render against its own input scores 0.15 to 0.25 SSIM with no blur. Raw pixel metrics are useless here.
- With crude alignment, 0.63 to 0.67 at sigma 8 (of 512 px) and about 0.78 at sigma 16. Better alignment (motion off, phase correlation) should raise these. How far is not known.
- Colour survives: mean CIEDE2000 2.4 to 3.7 on three looks. The dots keep palette and tone well and lose structure. That matches the layer tables in 2.2.
- Two of six failed on alignment alone. The scorer must check its own alignment and refuse to score when it fails.

What it does not support: any statement about similarity to a real reference. No reference image exists in the repo for these looks (1.3).

**The ceiling, defined.** For each reference, render the reference image itself as plain DOTS, screenshot it with motion off, and compute Score B against the reference. Call it `B_max`. No effect can beat `B_max` on that reference through this engine. Report every Score B next to `B_max`.

**What "70%" maps to (PROPOSAL).**
- Paired reference: Score A at or above 70, and Score B at or above 70% of `B_max`. Report both the raw value and the ratio.
- Unpaired reference: style score at or above 70, labelled as style score.
- The owner's "70%" is a judgement by eye. Whether 70 on this scale matches that judgement is unknown until 5.6 is done.

### 5.6 Calibration experiment (required before the thresholds mean anything)

1. Collect pairs. For each existing look the owner cares about (the task named ids 44 to 49; the code now has 46 to 51 plus the older finishes), store the real reference picture next to the look. None are stored today. `docs/reference/` holds four files that were not inspected in this session.
2. For each look, produce: the treated flat picture (bake sheet), the canvas screenshot with motion off, and `B_max`.
3. The owner rates each output against its reference from 0 to 100, blind to the computed numbers. Ten to twenty pairs is enough to start. Include known-bad outputs on purpose.
4. Compute C, S, E, T, G for all.
5. Fit: rank correlation (Spearman) of each component with the ratings; then least-squares weights with weights kept non-negative. Drop a component that does not correlate.
6. Set the threshold at the score where the owner's rating crosses "acceptable".
7. Re-check on three pairs kept out of the fit.
8. If the hand-built components fail to track the ratings, add DISTS [37] and repeat.

---

## 6. Feasibility gate (before any implementation)

The agent fills this in per reference and shows it to the owner. No code before it is accepted.

### 6.1 Template (filled example: "clear glass bust, lens flare, film grain, dark studio")

```
FEASIBILITY REPORT
Reference:            ref/glass-bust.jpg      Pair: no (single treated image)
Class:                Achievable with limitations
Expected similarity:  style score 60-75 (unpaired, so no structural score).
                      Basis: colour, glow and grain components are alignment-free and all
                      three can be fitted (C, G, T). Material continuity is the weak part.
                      Range is an estimate, not a measurement: no calibrated data exists yet.
Components (from analysis):
  #  component               measured                      layer  technique                 status
  1  dark field, light subj  border L 0.04, subject 0.41   -      default polarity          exists
  2  glass body, refraction  by eye; no pair, no field     L1     normal-map refraction,    bake exists, not wired
                                                                  per-channel offset
  3  rim light               specular share 3%, thin       L2     Fresnel on depth normal   exists (finGlass)
  4  soft continuous body    edge width 6 px at 768        L3     unthresholded soft fill   MISSING
  5  bloom                   r50 9 px, r10 40 px           L3     bloom, radius 0.6         exists (coarse)
  6  anamorphic streak       angle 0 deg, length 0.3 W     L3     1D streak pass            MISSING
  7  film grain              sigma 0.035, size 1.6 px,     L3     grain, amount 0.3         exists (white, mono)
                             mono
  8  cool grade              a* -4, b* -9 shift            L3     duotone or LUT            duotone exists, LUT missing
Technical limitations:
  - Body will read as fine grain, not clear glass, until component 4 exists.
  - Streak cannot be made today. Without it the flare is a round glow only.
  - Refraction field is a guess (single image): it follows the picture's own relief.
Required techniques by layer:   L1: refraction bake.  L2: rim.  L3: fill, bloom, streak, grain, grade.
Additional requirements:
  - From the owner: the untreated source of this subject, if it exists (turns 2 and 8 into measurements).
  - Assets: none. Libraries: none.
  - Renderer work: soft fill pass, streak pass (section 8, phase R2).
Android:               L3 components will not show (post chain not ported).
Decision asked:        build with today's passes (expected lower end of range), or build R2 first.
```

### 6.2 Decision rules

Apply in order. The first rule that matches sets the class. A lower class from any component wins.

| Rule | Condition | Class |
|---|---|---|
| R1 | A component cannot be assigned to any layer of section 2 (true 3D relighting, cast shadows across the subject, generated detail that is not in the source, readable new text or objects) and it is central to the look | Not currently feasible |
| R2 | The reference is dark-on-light (measurement 19) and no L3 paper or multiply pass exists yet | Partially achievable. Becomes "with limitations" once the paper pass exists |
| R3 | A central component needs a continuous smooth surface (clear glass, liquid, mirror gradient, soft focus on the subject) and the L3 soft fill does not exist | Partially achievable |
| R4 | A central component needs detail finer than about 2 px at 768 px (hairlines, fine print, micro-scratches on the subject) | Partially achievable. The 768 px cap is `src/lite/sample.ts:23` |
| R5 | A component needs a pass that is missing from `Post.ts` (section 2.1) but is a known technique | Achievable with limitations, and the report lists the pass as required work |
| R6 | A component needs an asset (overlay texture, displacement map, LUT) or a source picture the owner has not given | Stop and ask (6.4). Class is set after the answer |
| R7 | The reference is unpaired | At most "Achievable with limitations". The report must say the score is a style score |
| R8 | Every component maps to an existing capability and the reference is light-on-dark | Achievable (high confidence) |

"Central" = the vision read and the owner agree the look does not read without it. If unsure, ask.

### 6.3 Default class per treatment family in this engine

| Family | Default class | Why |
|---|---|---|
| Lighting: bloom, glow, halo | Achievable (high confidence) | Exists in L3. Dots are bright points on black, the ideal bloom input. Limit: coarse wide glow, no HDR (1.4) |
| Lighting: streaks, flares, light leaks | Achievable with limitations | Standard L3 techniques [11]; passes missing. Leaks may need a texture |
| Material: holographic, iridescent, neon | Achievable (high confidence) | Colour-driven; colour survives dots (5.5) |
| Material: chrome, metal | Achievable with limitations | Hard bands survive; smooth mirror gradients turn to grain. Weak on dark subjects (`.agents/skills/effects/chrome/SKILL.md:51`) |
| Material: glass, liquid, translucent | Partially achievable | Needs continuity (R3). With soft fill and a lit backdrop: with limitations |
| Distortion: frame-level CA, lens warp | Achievable with limitations | Trivial in L3; not built |
| Distortion: refraction, displacement of the subject | Achievable with limitations (paired) / Partially (single) | Needs L1 wired; the field can be measured only from a pair (measurement 13) |
| Texture: grain, noise | Achievable (high confidence) | Exists. Blue-noise and chroma grain are small additions |
| Texture: halftone, dither | Achievable (high confidence) | Cell looks and the bitmap overlay exist |
| Texture: scratches, dust, paper | Achievable with limitations | Needs an overlay asset and a blend mode |
| Compositing: grade, duotone | Achievable (high confidence) for two-colour; with limitations for a full grade | Duotone exists; LUT missing |
| Compositing: blend overlays, masks | Achievable with limitations | Blend modes missing; masks follow dots |
| Compositing: dark subject on light field | Partially achievable | Dots cannot darken (1.4). Needs the L3 paper pass |
| Blur: whole frame, radial, directional | Achievable with limitations | L3 passes missing; technique standard |
| Blur: selective focus by screen region | Achievable with limitations | L3 with a mask |
| Blur: true depth of field | Partially achievable | No depth target; L0 size-by-depth is a rough stand-in |
| Painterly (Kuwahara, oil) | Partially achievable | L1 can flatten; dots re-add grain |

### 6.4 Stop rule: ask the owner instead of proceeding

Stop and ask when any of these is true:
1. The class is "Partially achievable" or "Not currently feasible".
2. The expected range has its lower end under 70 (once calibrated; until then, whenever any central component is "MISSING").
3. A component needs an asset, a source picture or a pair (R6).
4. The analysis and the vision read disagree on a central component (for example the read says "glass", the measurements show no refraction or specular structure).
5. Reaching the look needs renderer work (a new pass). The owner decides whether to build the pass or accept the lower result.
6. The reference is unpaired and the owner asked for a similarity number. Explain that only a style score is possible, and ask for a pair.

Ask one question at a time, in full sentences, with the options stated.

---

## 7. Proposed workflow (the owner's 7 steps made concrete)

Scripts named here do not exist yet unless a path is cited. They are the build items of section 8.

| Step | Inputs | Tool | Output artefact | Exit condition |
|---|---|---|---|---|
| **1. Reference analysis** | Reference image; source image if a pair | `tools/analyze/analyze.py` (section 4) plus one vision read | `scratch/<name>/analysis.json`, `analysis.png` (contact sheet: reference, each measured map, residual) | Every measurement either has a value or the reason it could not run |
| **2. Technique identification** | `analysis.json`, vision read | Agent, with the tables of 2.2 | Component list: name, measured values, layer, technique, exists or missing | Every visible quality of the reference is on the list or named as out of scope |
| **3. Implementation research** | Components marked missing | Sources of 3.2; `Post.ts`, `shaders.ts`, `treatBake.ts` | Per missing component: source link, pass count, cost, licence | Each missing component has one chosen technique, or is marked not feasible |
| **4. Implementation strategy** | Steps 2 and 3 | Agent | Draft recipe (7.2) | Each component has exactly one layer and a parameter set |
| **5. Feasibility confirmation** | Draft recipe | Template 6.1, rules 6.2 | Feasibility report shown to the owner | **The owner accepts the class and the plan in chat. No code before this.** |
| **6. Effect development** | Accepted recipe | L1 bake in TypeScript, L2 finish, L3 params or pass; `scripts/bake-sheet.mjs` (exists) | Code, recipe file, bake sheet on the 10 samples | `tsc` and tests pass; the recipe renders in the studio |
| **7. Visual validation** | Reference, flat result, canvas screenshot | `tools/analyze/score.py`; `scripts/score-shot.mjs` (Playwright, motion off) | `score.json`: A, B, `B_max`, per-component values, side-by-side sheet | Thresholds met, or 3 rounds used and the result is reported as partial with the failing components named |

### 7.1 Iteration loop (step 6 to step 7)

- Maximum 3 rounds, as today (`.agents/skills/image-to-effect/SKILL.md:69`).
- Each round changes only the components whose sub-score failed:

| Failing component | Change |
|---|---|
| C colour and tone | Refit the grade (measurement 2 or 3) against the current output, not the source. Adjust `fx` levels or the duotone or LUT |
| S structure | The L1 treatment is wrong or misaligned. Check the bake against the reference at sigma 4. Do not touch L3 |
| E edge and detail | Too soft: reduce fill or blur. Too hard: add fill, raise blur. Compare edge-width medians |
| T texture | Refit grain amount and size from the spectrum; check that the dots' own grain is not already enough |
| G glow | Refit threshold and radius from the falloff curve; change bloom level mix |

- Score A is fixed first. Score B is worked on only after A passes. If A passes and B fails, the loss is in the dots: change L0 (dot size, count) or L3 (fill), never L1.
- If a round does not raise the failing sub-score, stop early and report.
- Record every round in the recipe's `history`.

### 7.2 The effect recipe (PROPOSAL)

A recipe is data. It lists components in order, each with its layer, technique, parameters and the measurement it was fitted from. It is reusable (apply to another picture) and composable (take the lighting of one, the material of another).

```ts
// sketch, not compiled
interface EffectRecipe {
  id: string;                    // 'glass-flare-01'
  name: string;
  reference: { file: string; paired: boolean; source?: string };
  feasibility: { cls: 'high' | 'limited' | 'partial' | 'none'; expected: [number, number]; basis: string };
  components: RecipeComponent[]; // applied in layer order L1, L0/L2, L3; inside a layer, list order
  score?: { a: number; b: number; bMax: number; parts: Record<'C' | 'S' | 'E' | 'T' | 'G', number>; paired: boolean };
  history?: { round: number; changed: string[]; score: number }[];
}

interface RecipeComponent {
  family: 'lighting' | 'material' | 'distortion' | 'texture' | 'compositing' | 'blur';
  name: string;                  // 'bloom', 'refraction', 'grain'
  layer: 'L0' | 'L1' | 'L2' | 'L3';
  technique: string;             // 'tent-upsample bloom', 'normal-map refraction'
  // exactly one of the two below
  params?: Record<string, unknown>;   // dotted paths into Params: { 'glow.bloomRadius': 0.6, 'bloomOn': true }
  pre?: { op: string; args: Record<string, number> }; // L1 only: name of a registered picture op
  fittedFrom: { measure: string; value: unknown } | 'by eye';
  android: boolean;              // false for every L3 component today
}
```

Mapping onto the code, with no engine change:

| Layer | Recipe field | Lands in | Code fact |
|---|---|---|---|
| L0 | `params` | `trailSize`, `pointCount`, `fx.*`, `trail.*` | `src/core/params.ts:5-21`, `:42`, `:130` |
| L1 | `pre` | A registry of picture ops (blur, displace, channel offset, ramp, relief) called through the existing `bake` argument | `src/lite/sample.ts:75`, `:90`; ops already written in `src/lite/treatBake.ts:57-207` |
| L2 | `params` | An existing `...On` flag with its slider object, or `treat` plus `treatSet` | `src/core/params.ts:64-106`, `:80-81` |
| L3 | `params` | `bloomOn`, `haloOn`, `grainOn`, `duoOn`, `glow.*`, `surface.*`, `signal.*` | `src/core/params.ts:62-63`, `:107-120`; consumed at `src/lite/LiteEngine.ts:917-921` |

So the L0, L2 and L3 parts of a recipe are a `Partial<Params>`, the same shape as `presets` (`src/core/params.ts:271`). They can be saved and applied today. `serializeParams` and `parseParams` already round-trip them (`src/core/params.ts:368-406`). Only `pre` needs a small new registry and the one-line wiring in `src/main.ts:576`. The sample cache key must include a hash of the `pre` list (`src/main.ts:491-493`).

A LOOK tile then becomes "apply this recipe" instead of "set one flag". `src/core/styles.ts` keeps the name, category and title; the recipe holds the rest. New L3 passes add fields under `glow` or a new `post` block in `Params` first, as `CLAUDE.md` requires ("Add new controls as fields in `params.ts` first").

For Android, `scripts/export-pack.mjs` already takes dotted `--set` paths into `Params` (`docs/PACK_FORMAT.md:15`). A recipe's `params` map is that list. The L1 part can be baked into `subject.png` offline. L3 components are dropped with a warning until the post chain is ported.

---

## 8. Recommended build order

Two tracks. The tooling track changes no renderer code and gives the largest gain first: it makes the gap visible and stops wrong effects from being called done.

### Track T: tooling for the agent

| Phase | What | Files | Risk | Verified by |
|---|---|---|---|---|
| **T1. Scoring** | `score.py` (C, S, E, T, G; alignment check; refuses on failed alignment). `score-shot.mjs`: studio screenshot with motion off, no UI, fixed size; also renders `B_max` | New: `tools/analyze/score.py`, `scripts/score-shot.mjs` | Low. Read-only tools | Self-test: an image against itself scores 100; against a blurred copy lower; against another subject fails alignment. Reproduce the table in 5.5 with proper alignment |
| **T2. Analysis** | `analyze.py`: measurements 1 to 19, JSON plus contact sheet and residual sheet | New: `tools/analyze/analyze.py` | Low | Synthetic tests: apply known blur, grain, vignette, channel shift and bloom to a sample with `treat.py` helpers; the tool must recover the parameters within a stated tolerance |
| **T3. Calibration** | Experiment 5.6. Store references per look | New: `docs/effect-library/references/`, a results table in this file | Needs the owner's time (ratings) | Held-out pairs track the owner's ratings |
| **T4. Skill rewrite** | Replace the two skills with one seven-step skill (section 7), the gate template (6.1) and the recipe shape (7.2). Remove the four archetypes as the default path. Fix stale ids and the "implemented in `treatBake.ts`" lines. Retire `docs/EFFECT_MAKER_RUNBOOK.md` or point it at the new skill | `.agents/skills/effect-maker/SKILL.md`, `.agents/skills/image-to-effect/SKILL.md`, `.agents/skills/effects/*/SKILL.md`, `docs/EFFECT_MAKER_RUNBOOK.md` | Low. Text only | Dry run on one old reference: the gate must produce a report before any code |

### Track R: renderer capabilities

| Phase | What | Files | Risk | Verified by |
|---|---|---|---|---|
| **R1. One renderer for gate and product** | Wire L1: pass the active recipe's picture ops to `sampleLite`; key the cache on them. Decide per look whether it is an L1 bake or an L2 finish, and make `bake-sheet.mjs` render what ships (for L2 looks: a studio screenshot, not a CPU bake) | `src/main.ts`, `src/lite/treatBake.ts` (registry), `scripts/bake-sheet.mjs` | Medium. Re-sample on slider change costs time; debounce exists per the skill text. Check with `scripts/bake-time.mjs` | Score A of the sheet equals Score A of the studio's own treated picture. `scripts/verify-web-studio.mjs` still passes |
| **R2. Post passes that close the largest gaps** | Inside the compose pass: radial chromatic aberration, vignette, blend modes, paper field (dark-on-light), soft fill (mix of unthresholded 1/2 and 1/4 levels). As small passes: tent upsample chain for bloom, 1D streak at 1/4 size | `src/core/params.ts` first, then `src/lite/Post.ts`, `src/web/WebEngine.ts`, `index.html`, `src/ui/Panel.ts` | Medium. Compose shader grows; texture-unit budget (3.3); frame time on phones | Score B rises on glass and soft references; frame time on the test phone and a laptop; `adapt()` gets a "halve post resolution" rung |
| **R3. HDR scene and grade** | `RGBA16F` scene target with `RGBA8` fallback [26][27][28]; 3D LUT lookup [13]; blue-noise grain [14] | `src/lite/Post.ts`; one 64x64 texture asset; LUT loader | Medium. Memory (3.4); extension missing on some devices | Bloom G component; LUT fitted from a pair reproduces the pair's grade (C component) |
| **R4. Blur family and depth** | Directional, zoom and tilt-shift blur at 1/2 size. Depth of field only after a depth target is proven (MRT under screen blend is untested) | `src/lite/Post.ts`, `src/lite/LiteEngine.ts` (second target) | High for depth of field; low for the others | E component on blur references |
| **R5. GPU pre-pass and Android post** | Move L1 ops to GLSL if CPU bakes are too slow. Export `Post.ts` shaders for Android | `src/lite/`, `scripts/export-shaders.mjs`, Android renderer | High. Two platforms | Bake time; pack looks match on the phone |

Suggested order: T1, T2, R1, T4, T3 (runs alongside, needs the owner), R2, R3, R4, R5. T1 and R1 alone remove causes 1.3 and 1.6 item 1.

### 8.1 Hero bundle budget

- Budget: under 200 kB gzip, last measured about 192.8 kB (`CLAUDE.md`). About 7 kB of headroom.
- `npm run build:hero` builds `src/hero.ts` (`vite.config.hero.ts:10`). `src/hero.ts` imports `core/Engine`, `core/Sampler` and `core/params` (`src/hero.ts:2-4`). It does not import `src/lite`.
- So new passes in `src/lite/Post.ts` and new bakes in `src/lite/treatBake.ts` are **not** in the hero build as configured.
- Two things do reach it: any field added to `src/core/params.ts` (small), and anything added to `src/core/styles.ts` that `params.ts` imports (`src/core/params.ts:2`).
- Caution: `src/hero-lite.ts` imports `LiteEngine` (`src/hero-lite.ts:4`), and `LiteEngine` imports `Post` statically (`src/lite/LiteEngine.ts:6`). Its header names a `build:hero-lite` script that `package.json` does not define. If that entry is ever built, every post shader string ships with it. Then `Post` should be loaded lazily or the new passes kept in a separate module.
- Verify after each renderer phase: `npm run build:hero` and the gzip size of `dist-hero/hero.js`. Not run in this session.

---

## 9. Open questions for the owner, and what was not verified

### 9.1 Open questions for the owner

1. What does "70%" mean to you: the flat treated picture looks right, or the moving dots look right? This decides whether Score A or Score B is the target.
2. Will you rate 10 to 20 output and reference pairs (0 to 100) for the calibration of 5.6?
3. Can you store the real reference picture for each existing look? None are in the repo.
4. For most references, can you supply a source and target of the same subject? If not, only a style score is possible.
5. Should the six treatments (46 to 51) be picture bakes (L1) or dot finishes (L2)? Today the skills say one and the code does the other. Ids 44 and 45 have sliders but render nothing.
6. Is commercial use planned (the Android app, client work)? This decides whether LYGIA code may ever be used, and how Shadertoy code is treated.
7. Is an overlay texture asset (lens dirt, light leak, paper) acceptable in the studio bundle, and in the hero bundle?
8. Should a LOOK tile be allowed to switch post settings (bloom, grain, grade) on, or must those stay under the user's own controls?
9. Is the Android wallpaper allowed to look different from the web look until the post chain is ported?
10. Is dark-on-light (a paper field) a look you want? It needs the L3 paper pass and has no dot-layer route.

### 9.2 Not verified

Not run:
- No build, no `tsc`, no unit tests, no dev server, no Playwright script. No frame-time measurement. `scripts/bake-time.mjs` and `scripts/bake-sheet.mjs` were read, not run.
- The hero bundle size was not rebuilt.
- No new pass, bake or script was written or compiled. All GLSL and TypeScript in this file is a sketch.
- The composite score was not implemented. Only SSIM and CIEDE2000 were computed, once, with crude alignment (5.5). Two of six pairs were discarded for misalignment.
- No comparison against a real reference was possible: none is stored.
- LPIPS, DISTS and FLIP were not installed or run. PyTorch availability for Python 3.14 on Windows was not checked.
- MRT with screen blending (depth target) was not tested.
- `docs/reference/*.png` and the Android renderer sources were not inspected.
- `src/lite/treatBake.ts` and `src/lite/shaders.ts` were read in part (structure, the glass and dispatch functions, the main point shader), not line by line.

Not fetched or not readable (claims that rest on them are marked UNVERIFIED in the text):
- Shadertoy terms page: HTTP 403. The default licence statement is from memory and secondary pages.
- OpenCV.js usage page and the npm page of `@techstark/opencv-js`: HTTP 403. No size figure.
- The Book of Shaders licence file: HTTP 404. Only the README's "All rights reserved" line was seen.
- ARM page for Bjorge's dual filter talk: HTTP 404.
- Reinhard et al. colour transfer PDF and the MS-SSIM PDF: fetched as binary, not readable. Citations are from memory.
- Khronos WebGL 2.0 specification: the URL redirected and was not followed. WebGL facts come from MDN [26][27][28][29].
- Bundle sizes of three.js passes, pmndrs `postprocessing`, `pixi-filters`, regl, twgl, glfx.js: not stated on the fetched pages, not measured.
- Licences of scikit-image and `sharp`: not fetched.
- The full pass list of three.js may be longer than the 30 files seen: the page ended with "View all files".
- Frequency separation: no primary source fetched.

---

## 10. Sources

Fetched in this session unless marked.

1. three.js post-processing directory: https://github.com/mrdoob/three.js/tree/dev/examples/jsm/postprocessing
2. three.js licence (MIT): https://github.com/mrdoob/three.js/blob/dev/LICENSE
3. pmndrs postprocessing README: https://github.com/pmndrs/postprocessing
4. PixiJS filters README: https://github.com/pixijs/filters
5. LYGIA README: https://github.com/patriciogonzalezvivo/lygia
6. LYGIA licence file: https://raw.githubusercontent.com/patriciogonzalezvivo/lygia/main/LICENSE.md
7. glfx.js: https://github.com/evanw/glfx.js
8. OpenCV repository (licence): https://github.com/opencv/opencv . NOT FETCHED (HTTP 403): https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html , https://www.npmjs.com/package/@techstark/opencv-js
9. Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", SIGGRAPH 2014, author's page and comments: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/ (the slide deck itself was not opened)
10. LearnOpenGL, "Physically Based Bloom" (guest article): https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
11. Chapman, "Screen Space Lens Flare", 2017: https://john-chapman.github.io/2017/11/05/pseudo-lens-flare.html
12. Heckel, "Refraction, dispersion, and other shader light effects", 2023: https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/
13. Selan, "Using Lookup Tables to Accelerate Color Transformations", GPU Gems 2, chapter 24: https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-24-using-lookup-tables-accelerate-color
14. Peters, "Free blue noise textures" (CC0): https://momentsingraphics.de/BlueNoise.html
15. Newson, Faraj, Galerne, Delon, "Realistic Film Grain Rendering", IPOL 2017: https://www.ipol.im/pub/art/2017/192/
16. Bjorge, "Bandwidth-Efficient Rendering", SIGGRAPH 2015 (dual filter blur). NOT FETCHED (HTTP 404): https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/siggraph-2015---mobile-graphics-and-gaming
17. Kyprianidis, Kang, Dollner, "Image and Video Abstraction by Anisotropic Kuwahara Filtering", Computer Graphics Forum 28(7), 2009: https://www.kyprianidis.com/p/pg2009/
18. regl: https://github.com/regl-project/regl
19. twgl.js: https://github.com/greggman/twgl.js
20. OGL: https://github.com/oframe/ogl
21. gl-react: https://github.com/gre/gl-react
22. glsl-canvas: https://github.com/actarian/glsl-canvas
23. ISF specification: https://github.com/mrRay/ISF_Spec
24. Shadertoy terms. NOT FETCHED (HTTP 403): https://www.shadertoy.com/terms
25. The Book of Shaders repository README: https://github.com/patriciogonzalezvivo/thebookofshaders . Licence file NOT FETCHED (HTTP 404)
26. MDN, `EXT_color_buffer_float`: https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float
27. MDN, `EXT_color_buffer_half_float`: https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_half_float
28. MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
29. MDN, `WebGL2RenderingContext.drawBuffers()`: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawBuffers
30. scikit-image, `skimage.registration` (phase correlation, TV-L1 and iLK optical flow): https://scikit-image.org/docs/stable/api/skimage.registration.html
31. scikit-image, `skimage.exposure` (`match_histograms`): https://scikit-image.org/docs/stable/api/skimage.exposure.html
32. Reinhard, Ashikhmin, Gooch, Shirley, "Color Transfer between Images", IEEE CG&A 2001. NOT READABLE (binary PDF): https://www.cs.tau.ac.il/~turkel/imagepapers/ColorTransfer.pdf
33. scikit-image, `skimage.restoration` (`estimate_sigma`): https://scikit-image.org/docs/stable/api/skimage.restoration.html
34. SSIM authors' page (citation and usage advice): https://www.cns.nyu.edu/~lcv/ssim/
35. Wang, Simoncelli, Bovik, "Multi-scale structural similarity for image quality assessment", 2003. NOT READABLE (binary PDF): https://www.cns.nyu.edu/pub/eero/wang03b.pdf
36. LPIPS repository: https://github.com/richzhang/PerceptualSimilarity
37. DISTS repository: https://github.com/dingkeyan93/DISTS
38. FLIP repository: https://github.com/NVlabs/flip
39. Sharma, CIEDE2000 implementation notes and test data: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
40. Xue, Zhang, Mou, Bovik, "Gradient Magnitude Similarity Deviation": https://arxiv.org/abs/1308.3052
41. scikit-image, `skimage.metrics`: https://scikit-image.org/docs/stable/api/skimage.metrics.html
42. ssim.js: https://github.com/obartra/ssim
43. pixelmatch: https://github.com/mapbox/pixelmatch
44. IQA-PyTorch (`pyiqa`): https://github.com/chaofengc/IQA-PyTorch
