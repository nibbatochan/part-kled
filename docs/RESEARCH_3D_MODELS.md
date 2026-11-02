# Research: 3D models as a particle source

## Question

How can the studio accept simple 3D models (glTF/GLB, OBJ; FBX and USDZ are out of scope for v1) as a new input, next to the image section, so that a dropped model becomes a particle source and the existing looks, effects, dissolution/trail behaviour and look picker all apply to it?

## Short answer

1. Render the model from a fixed camera into a colour image plus a depth image, then feed both into the existing `sampleLite` path unchanged. This is the cheapest route to "same as the image section" and keeps every look working.
2. Use `GLTFLoader` (GLB first) and `OBJLoader`. Skip Draco, KTX2 and Meshopt in v1. Keep the loaders out of the hero bundle (already at 192.8 of 200 kB gzip).
3. Use `MeshSurfaceSampler` only in a later phase, for a true 3D point cloud mode. Cell looks still need a 2D raster, so it needs the same render step anyway.
4. Do not support glTF animation in v1. A model is a static home set, like a photo.
5. Ship GLB and OBJ only, with a size cap and no external resource fetches.

## Current image pipeline

**Entry and depth.** The studio uses the lite path, not `core/Engine`.

- `src/main.ts:3-4`: imports `WebEngine` and `sampleLite`. `src/main.ts:5`: imports `DepthEstimator`.
- `src/main.ts:495-510`: when no baked depth exists, `depthEstimator.estimateDepth(img.canvas, ...)` runs with a 'stall' timeout. On failure or timeout the picture loads flat: `FLAT_DEPTH_SIDE` filled with 0.5.
- `src/main.ts:527`: `sampleData = sampleLite(img.canvas, depthArr, dw, dh, pointBudget())`.
- `src/web/WebEngine.ts:198-203`: `pointBudget()` returns 200,000 on small or weak devices and 450,000 on strong ones. The studio does not use 524,288 on the lite path. The 1024 x 512 grid (524,288) belongs to the core path (below).
- Accepted types: `src/ui/Dropzone.ts:75` (png, jpeg, webp by MIME or extension); `src/main.ts:709` (image MIME check); `src/main.ts:755` (video, separate path).

**Lite sampler: `sampleLite` in `src/lite/sample.ts`.**

- `:23` `MAX_SIDE = 768`. The picture is resized so its longest side is at most 768 px (`:76-87`).
- `:99-101` depth is resampled to working size, or 0.5 if null.
- `:103-108` `computeImportanceWeights` (from `src/core/Sampler.ts:138`) gives per-pixel weights from mask, edges, luminance and saturation. `buildCDF` (`Sampler.ts:210`) is the cumulative table.
- `:111-112` a multiplier coprime to `count` gives a low-discrepancy shuffled order, so any prefix of the buffer is an even subset. This is how quality drops at runtime.
- `:114-151` writes the output buffer: **16 bytes per particle**. Layout: f32 x, y, z (`:142-144`); u8 r, g, b from bilinear colour (`:138-147`); u8 gain, `gain/5` (`:149-150`).
  - Position: `x = (px/w - 0.5) * aspect`, `y = 0.5 - py/h`, `z = depth - 0.5` (`:142-144`).
- `:153-182` builds the `grid` texture: colour rgb, depth in alpha, plus brightness percentiles `lo`/`hi` for AUTO LEVELS. Cell looks read this.
- `:183` `palette`: 24-colour k-means over the picture (for PIXEL ART).
- Returned object (`LiteSample`, `:7-21`): `buffer`, `count`, `aspect`, `subjectFraction`, `grid`, `palette`.

**Core sampler: `sampleImageParticles` in `src/core/Sampler.ts`** (`:221`).

- Produces `SamplePointData` (`:2-12`): `home` (N*4 floats: x, y, z, light weight), `color` (N*4 u8), `count`, `texWidth`/`texHeight` (1024 x 512, `:240-242`), `activeSubjectPixels`, `halfW`, `halfH`.
- `:276-278`: home `x = (px/w - 0.5)*aspect`, `y = 0.5 - py/h`, `z = zDepth - 0.5`. `:301`: home.w = luminance (light weight, "bright particles stream more often").
- Depth relief: `home.z *= uDepth * 0.55` in `src/shaders/sim_position.glsl:52` and `sim_velocity.glsl:126`. The renderer's z scale is `params.depth * 0.55 * 0.5` (`src/core/Simulation.ts:179`, `src/core/ParticleRenderer.ts:356` and `:385`). `DEPTH_RELIEF = 0.55` is `ParticleRenderer.ts:21`. CLAUDE.md requires these to stay equal.

**What the effects assume.**

- Home positions are a 2D picture plane. `home.xy` is the picture coordinate (`LiteEngine` uniform `uHalfW = aspect/2`, `src/lite/LiteEngine.ts:715`; shaders use `home.xy` for lookups and noise, e.g. `src/lite/shaders.ts:222, 232, 262, 318, 952`).
- Depth is a single value per picture pixel, in a texture or as particle z.
- Cell looks need `s.grid` (`LiteEngine.ts:867`): without a raster colour/depth grid they are disabled.
- Looks: `src/core/styles.ts:6` `STYLE_NAMES` (40 entries, some retired). `:9-22` `LOOK_CATEGORIES`: DOTS, PIXEL, TEXT, METAL, RETRO, GRAPHIC, DITHER, BITMAP, GLOW, SURFACE.
- `LiteEngine.ts:186-209` shows the style set; `LiteEngine.ts:1090` packs styles.

## Options compared

| | a. Surface sampling (`MeshSurfaceSampler`) | b. Vertices directly | c. Render to colour + depth, feed `sampleLite` | d. Offline baked depth (hero-style) |
|---|---|---|---|---|
| Fidelity | True 3D cloud, all sides, but no occlusion or lighting from a camera | Uneven density, unusable on sparse meshes | One view, like a photo; hides back and occluded faces | Same as c, depth from a model |
| Count budget | Any N, fixed by us (uses 200k to 450k or 524k) | Limited by vertex count | Uses `pointBudget()` unchanged | Same as c |
| Speed | CPU, one pass, O(N) after build; fine at 524k (no measurement made) | Trivial | Software render at 768 px plus readback: tens of ms | Offline; no runtime cost |
| Determinism | Default uses `Math.random` (`MeshSurfaceSampler.js:55`); `setRandomGenerator` (`:162`) makes it seedable | Deterministic | Deterministic | Deterministic |
| Bundle | Adds sampler plus three addons (see Loading) | None | Adds GLTFLoader plus a small depth shader | Adds nothing at runtime; needs an offline bake step |
| Keeps core/ free of UI | Yes if placed in `core/` or `lite/` as pure data | Yes | Render step needs a WebGL context: place in `lite/` or a new `model/` module, not `core/` UI code | Yes |
| Effects | Needs a rasterised grid for cell looks: a second render anyway | Same | All effects work unchanged | All effects work |

**Verdict.** Option c for v1. Option a is the right second phase if the user wants a true volumetric cloud. Option d is for offline bakes like the hero, not a drop-in input.

### Option a details (verified in source)

- `node_modules/three/examples/jsm/math/MeshSurfaceSampler.js`: `constructor(mesh)` (`:53`) reads `index`, `position`, `normal`, `color`, `uv` attributes. `setWeightAttribute(name)` (`:79`). `build()` (`:94`). `sample(targetPosition, targetNormal, targetColor, targetUV)` (`:180`). `setRandomGenerator(fn)` (`:162`). Export at `:315`.
- `targetColor` is read from the `color` vertex attribute only. A textured model (`map`) needs manual UV lookup. This is a gap: glTF baseColorTexture requires our own sampling.
- The sampler does not check visibility, so a sample may be on a back face.

### Option c details

- Render the model into an RGBA8 colour target with a fixed camera. Orthographic is the default: it matches the flat photo layout and keeps `aspect` meaningful. Perspective is possible but changes the look.
- Depth: pass 2 writes linear depth. Read back either with a float colour target (needs `EXT_color_buffer_float`, UNVERIFIED for the exact WebGL2 rule) or by packing depth into RGBA8 and decoding on the CPU. Packing is the safer choice: no extension, readback with `readPixels` as RGBA/UNSIGNED_BYTE.
- Normalise depth to 0..1 for `sampleLite`, where 0.5 is the mid plane. Background pixels get alpha 0 so `computeImportanceWeights` treats them as empty (it uses alpha when present, `Sampler.ts:151-175`).
- Multi-view: a single front view loses the back. Multi-view means several images, which the existing one-picture model does not support. Keep v1 to one view, with a view selector later.
- Comparison with the baked depth model: the photo path uses a learned depth estimate; a model path has exact depth from the mesh, so the depth map is better than the estimator and needs no model download.
- Feed `sampleLite(canvas, depthArr, w, h, budget)` with the canvas and depth. No change to `sampleLite` is needed.

### Option d

Offline bake, as in `scripts/bake-sample-depths.mjs` for the hero. Good for shipping sample models; not a user drop path. Mentioned for the hero only.

## Loading

**Imports** (three r186.1, installed `node_modules/three/package.json` version 0.186.1, MIT; verified):

- `three/examples/jsm/loaders/GLTFLoader.js` (`export { GLTFLoader }` at `GLTFLoader.js:4925`). `setDRACOLoader` (`:349`), `setKTX2Loader` (`:363`), `setMeshoptDecoder` (`:377`).
- `three/examples/jsm/loaders/OBJLoader.js` (`export { OBJLoader }` at `OBJLoader.js:955`). `load` (`:483`), `parse(text)` (`:537`).
- `three/examples/jsm/loaders/DRACOLoader.js`, `KTX2Loader.js`, `three/examples/jsm/libs/meshopt_decoder.module.js`: optional.
- `three/examples/jsm/math/MeshSurfaceSampler.js`: option a.

**Size.** Measured in the scratch folder with esbuild 0.x minify and gzip level 9 (not the repo build; numbers are indicative):

- GLTFLoader plus OBJLoader plus MeshSurfaceSampler: 410,829 bytes minified, **97,805 bytes gzip**. Most of this is three core classes it pulls in.
- DRACOLoader plus KTX2Loader: 347,054 bytes minified, **90,991 bytes gzip**. Overlapping three core, so not additive.
- Decoder wasm files, fetched separately, not in the JS bundle: `draco_decoder.wasm` 285,747 bytes; `basis_transcoder.wasm` 527,333 bytes (`node_modules/three/examples/jsm/libs/`).

**Tree-shaking.** Partial. GLTFLoader imports animation, skin and utility code (`GLTFLoader.js:1-69`), so it is not tree-shakable down to a small size. Only a dynamic `import()` in the studio keeps it out of the first paint.

**Browser without server.** Yes. Read a dropped file with `File` and `URL.createObjectURL` or `FileReader` (`ArrayBuffer`), then `loader.parse(arrayBuffer, '', ...)`. OBJ: read text and call `parse(text)`. The loaders need no server; the Draco/KTX2 wasm would need a served path (not needed in v1).

**glTF 2.0 features that matter** (Khronos spec, `registry.khronos.org/glTF/specs/2.0/glTF-2.0.html`, TOC read; body sections 5.23 Mesh, 5.24 Mesh Primitive with 5.24.1 `attributes` and 5.24.4 `mode`, 5.22 Material PBR with 5.22.1 `baseColorFactor` and 5.22.2 `baseColorTexture`, 3.9.2 Metallic-Roughness, 3.6.2.5 Accessor bounds). Body text was truncated in the fetch: the attribute and mode details are from the spec TOC and are marked UNVERIFIED at the detail level.

- Needed: meshes (POSITION), NORMAL optional, COLOR_0 (vertex colour, good for option a), TEXCOORD_0 plus baseColorTexture or baseColorFactor (needed for a textured look), mode TRIANGLES.
- Ignore for v1: skins, morph targets, animations, cameras, lights, extensions.
- GLB is a single binary file (one JSON chunk plus one BIN chunk). Prefer GLB; .gltf may reference external URIs.

**Security and limits.**

- Cap file size (suggest 25 MB; UNVERIFIED as a good number) and triangle count (suggest 2 M, to bound CPU render time).
- Reject `.gltf` external buffer or image URIs: a `data:` or GLB-only policy avoids outbound fetches from a dropped file.
- Draco, KTX2 and Meshopt decoders are wasm; they are a parsing attack surface. Out of scope for v1 (decision recorded below).
- Parse on the main thread; a large model blocks UI. Put parse behind a progress overlay like the photo path does.
- Failure path: on parse error, notify and keep the current picture (as the photo flat-depth fallback does).

## Animation

**Recommendation: no glTF animation in v1.**

- The sim has a fixed home set and a lifecycle (rest at home, stream along LINE, fade, respawn) defined in `src/shaders/lifecycle.ts`. A model replaces `home` and the `aHome` vertex data; the lifecycle does not change.
- A moving model would need a new home per frame. The lite path puts home in a static vertex buffer with `aHome` and `aHome2` for MORPH (`src/lite/shaders.ts:15, 940`). Animated homes mean per-frame re-sampling or GPU skinning. Both are large changes with no clear user gain for the look-based effects.
- The MORPH between two pictures (`aHome2`) already works for two static models. A model drop can use MORPH as-is.

## Effects compatibility

Looks from `src/core/styles.ts:9-22`. For option c, all rows are "works unchanged" because the model arrives as an ordinary picture plus depth. Only option a needs extra data.

| Look / effect group | Image-specific data used | Option c (render to image) | Option a (surface cloud) |
|---|---|---|---|
| DOTS (0, 1, 6, 29, 33, 37) and lite particle draw | `home.xy`, colour buffer, gain | Works | Works; needs a colour and depth raster for home.xy |
| PIXEL (2, 22) | `grid` colour, `palette` (k-means) | Works | Needs grid raster + palette from the same render |
| TEXT (4, 31) | `grid` brightness, lo/hi | Works | Needs grid raster |
| METAL (25, 26, 30, 39), CHROME/PRISMATIC/REDMET/CHROMA 2 | `home.xy` as picture coordinates for chrome finish (`shaders.ts:952`) | Works | Works if home.xy is a valid 2D position |
| RETRO (9), CGA-like cell looks | `grid` | Works | Needs grid raster |
| GRAPHIC (10, 11, 12, 32), BLOOD SHADOW, SHAKE-MASK | `grid` colour and alpha (depth) | Works | Needs grid raster |
| DITHER (3, 13, 17), STIPPLE | `grid`, depth in alpha | Works | Needs grid raster |
| BITMAP (18-21), HALO, AURA | `grid` colour, `haloImage.ts` edge work | Works | Needs grid raster |
| GLOW (24, 27, 28), ECSTASY, BLIGHT | `home.xy`, colour, depth | Works | Works |
| SURFACE (34, 35, 36, 38), FUR, CLOUD, ROCK, ARANCIA | `home.xy` noise, depth | Works | Works |
| Dissolution and trail effects (per `docs/RESEARCH_DISSOLUTION_EFFECT.md`) | Particle lifecycle and home | Works | Works |
| Look picker (UI) | None | Works | Works |

Limitations of this table: I read `LOOK_CATEGORIES`, `STYLE_NAMES` and the lite shader references. I did not read the `docs/RESEARCH_*.md` files in full, so the dissolution and per-look data needs are inferred from code, not checked against those docs. UNVERIFIED for the detail of each look.

## Licensing

- three.js: MIT (`node_modules/three/LICENSE`, "The MIT License", copyright 2010-2026 three.js authors; verified). Loader addons ship in the same repo under the same MIT licence.
- meshoptimizer decoder: MIT (header of `node_modules/three/examples/jsm/libs/meshopt_decoder.module.js`; verified).
- Draco decoder: Apache-2.0 per Google's project (UNVERIFIED: not read in this pass; check `node_modules/three/examples/jsm/libs/draco/README.md`).
- Basis/KTX2 transcoder: Apache-2.0 per project (UNVERIFIED: not read).
- Khronos glTF-Sample-Assets: repository licence CC-BY-4.0 (Khronos page footer). Per-model licences are in each model's README and are not on the index page. Only one model's licence is shown on the index (Glass Hurricane Candle Holder, CC BY 4.0, Wayfair). The index says models without suitable licences were removed, and five models (Antique Camera, Box Textured, Box Textured not 2^N, Cesium Man, Cesium Milk Truck) have unstated status. **Recommendation:** do not bundle sample models unless each model's own README is checked. Prefer user-supplied models, or CC0 sources (Poly Haven and Kenney are named as CC0 on the Khronos page; their own licences UNVERIFIED here).
- CC-BY needs attribution in the UI. The studio's credit line is `BY SUMANTH REDDY` (CLAUDE.md), so model attribution needs a separate note if a CC-BY sample ships.

## Recommended design

### Phase 1 (v1): static models, option c

**File types:** `.glb` and `.obj`. Single-file only. `.gltf` with embedded data URIs allowed; external URIs rejected.

**Pipeline:**

1. Dropzone accepts `model/gltf-binary`, `.glb`, `.obj` (`src/ui/Dropzone.ts:70-75` pattern; a new `model` branch next to `video` and `image`).
2. Parse with `GLTFLoader` or `OBJLoader`, via dynamic `import()` so it stays out of the hero bundle and the first paint.
3. Fit the model: compute its bounding box, centre it, scale so the longest side fits a unit square.
4. Render from a fixed front view (orthographic) into an offscreen WebGL2 target at `MAX_SIDE` (768) to get colour (RGBA8, alpha = coverage) and packed depth.
5. Decode depth to a Float32Array (0..1, background = 0 with alpha 0).
6. Call `sampleLite(colourCanvas, depthArr, w, h, pointBudget())` unchanged. Cache under a model key in `sampleCache` (`src/main.ts:537-545`).
7. Reuse the photo UI path (Thumbs, look picker, export) with no change to looks.

**Where the code lives:**

- New `src/model/` (or `src/lite/model/`) for loading, fitting and the render-to-image step. It may import `three` and must not import from `src/ui/` (CLAUDE.md: keep `core/` free of UI; the render step is a lite-side module).
- Changes: `src/ui/Dropzone.ts` (accept model files), `src/main.ts` (a `loadModel` path next to the image path, cache key), `src/web/WebEngine.ts` only if a new thumbnail type is needed.
- New `params.ts` fields: none for v1 beyond an optional `modelView` enum (front, only). CLAUDE.md requires controls as fields in `params.ts`; v1 needs none.

**Tests and verification:**

- Unit (vitest, `tests/`): fit transform (bbox centred, scale), depth packing round-trip (encode then decode equals input within 1/255), fixture GLB with a known size. Existing tests are `params` and `sampler`.
- Browser: a Playwright script in `scripts/`, following `scripts/verify-simulation.mjs` and `scripts/verify-hero.mjs`. It drops a fixture GLB, steps the sim with `__engine.update(1/30, t)` per CLAUDE.md, waits two rAFs, screenshots a cube and a sphere in DOTS and HALFTONE, and checks the particle count matches `pointBudget()`.
- Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Hero size check: `npm run build:hero` must stay under 200 kB gzip (currently 192.8).

**Effort:** about 3 to 4 days of work: loader and dropzone 0.5 day, fit and render-to-image 1.5 days, depth packing and tests 0.5 day, Playwright check and polish 1 day, docs 0.5 day. Estimate, not measured.

### Phase 2: true 3D cloud (option a)

- Sample the mesh with `MeshSurfaceSampler`, seeded with `setRandomGenerator` for determinism, into 3D home positions.
- Add a 3D mode: home.z from geometry rather than depth. This needs a second projection: the picture grid (for cell looks) is still rendered from a fixed camera, so option c is the basis.
- A textured model needs manual UV sampling of `baseColorTexture`. This is the largest gap.
- Effort: about 4 to 6 days, including a shader change in `src/shaders/` for a 3D home and the depth-relief constant kept equal (`DEPTH_RELIEF`).

### Phase 3 (later, only if asked)

- Multi-view or turntable: several renders and the MORPH between views (`aHome2`).
- glTF animation: a home per frame. Not recommended before Phase 2 is proven.
- Draco and KTX2 decoders, with the wasm served from `public/`. Only if files are large enough to need it.

## Risks

- Option c loses the back of the model; users may expect a full 3D cloud. Mitigation: label it as a view (e.g. "FRONT").
- Ortho depth from a flat render gives a relief that looks like a photo, not a sculpture. Visual check needed.
- Software render at 768 px on weak devices: the render step is not measured. Keep it under `pointBudget()`-scaled size if slow.
- GLTFLoader cost (about 98 kB gzip) is only acceptable in the studio, not the hero.
- Texture-less models: `computeImportanceWeights` falls back to weight 1 when weights sum to zero (`Sampler.ts:199-205`), and a flat model gives weak edges. Check the look.
- Untrusted files: size and triangle caps, external URI rejection, main-thread parse blocking.
- Licence: sample models may carry CC-BY attribution requirements that the UI does not show.

## Open questions

1. Should the model fill the frame the way a photo does, or keep its real aspect with padding?
2. Is orthographic (flat) acceptable, or does the user want a perspective look?
3. Which sample models to ship, if any, and with which licence records?
4. Phase 2 or Phase 1 first, if the user expects a volumetric cloud from day one?
5. Is `FBX`/`USDZ` out of scope permanently? (Recommend yes: no mature parser in three addons for FBX in the browser; USDZ is a zip of USD, out of scope.)
6. Measure the render-to-image time on a mid-range device before committing to a 768 px target.

## Sources

1. `C:\Users\suman\Projects\particled\CLAUDE.md` (architecture, rules, bundle budget).
2. `C:\Users\suman\Projects\particled\src\core\Sampler.ts` lines 2-12, 58-131, 138-208, 210-219, 221-326.
3. `C:\Users\suman\Projects\particled\src\lite\sample.ts` lines 7-21, 23-24, 26-62, 69-185.
4. `C:\Users\suman\Projects\particled\src\main.ts` lines 3-9, 495-545, 709, 755.
5. `C:\Users\suman\Projects\particled\src\web\WebEngine.ts` lines 198-203 (`pointBudget`).
6. `C:\Users\suman\Projects\particled\src\ui\Dropzone.ts` lines 70-75.
7. `C:\Users\suman\Projects\particled\src\core\styles.ts` lines 6, 9-22, 23-71 (look constants).
8. `C:\Users\suman\Projects\particled\src\lite\LiteEngine.ts` lines 186-209 (style set), 715 (`uHalfW`), 867 (`styled` requires grid), 1090 (style pack).
9. `C:\Users\suman\Projects\particled\src\shaders\sim_position.glsl` line 52; `sim_velocity.glsl` line 126; `particle.vert.glsl`.
10. `C:\Users\suman\Projects\particled\src\core\Simulation.ts` line 179; `C:\Users\suman\Projects\particled\src\core\ParticleRenderer.ts` lines 20-21, 356, 385.
11. `C:\Users\suman\Projects\particled\src\lite\shaders.ts` lines 15, 222-240, 262, 318, 940-952.
12. `C:\Users\suman\Projects\particled\node_modules\three\package.json` (version 0.186.1); `node_modules\three\LICENSE` (MIT).
13. `C:\Users\suman\Projects\particled\node_modules\three\examples\jsm\math\MeshSurfaceSampler.js` lines 1-40 (example), 53-70 (constructor), 79 (`setWeightAttribute`), 94 (`build`), 162 (`setRandomGenerator`), 180 (`sample`), 315 (export).
14. `C:\Users\suman\Projects\particled\node_modules\three\examples\jsm\loaders\GLTFLoader.js` lines 1-69 (imports), 349 (`setDRACOLoader`), 363 (`setKTX2Loader`), 377 (`setMeshoptDecoder`), 4925 (export).
15. `C:\Users\suman\Projects\particled\node_modules\three\examples\jsm\loaders\OBJLoader.js` lines 453, 483 (`load`), 537 (`parse`), 955 (export).
16. `C:\Users\suman\Projects\particled\node_modules\three\examples\jsm\libs\draco\` (README, decoder wasm 285,747 bytes); `libs\basis\basis_transcoder.wasm` (527,333 bytes); `libs\meshopt_decoder.module.js` (MIT header).
17. Measurement: esbuild minify plus gzip of GLTFLoader, OBJLoader, MeshSurfaceSampler (97,805 bytes gzip), and of DRACOLoader plus KTX2Loader (90,991 bytes gzip). Scratch files only; repo not changed.
18. Khronos glTF 2.0 specification: `https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html` (TOC: 3.6.2.5, 3.7.2, 3.9.2, 5.22, 5.22.1, 5.22.2, 5.23, 5.24, 5.24.1, 5.24.4). Body text truncated in fetch; attribute and mode details UNVERIFIED at the body level.
19. Khronos glTF-Sample-Assets: `https://github.com/KhronosGroup/glTF-Sample-Assets` (CC-BY-4.0 footer; per-model licence statement; removed and unverified models list).
20. Wavefront OBJ format: not fetched in this pass. UNVERIFIED for any OBJ-format claim beyond what `OBJLoader.js` handles.
21. WebGL 2.0 specification (readback and float colour target rules, `EXT_color_buffer_float`): not fetched. UNVERIFIED.
22. Existing docs: `C:\Users\suman\Projects\particled\docs\BUILD.md` (hero bundle, depth models section), `docs\RESEARCH_DISSOLUTION_EFFECT.md` (not read in this pass).
