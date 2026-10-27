# Research: Refining the Six Weak Particle Looks (lite renderer)

**Scope:** `src/lite/shaders.ts`, `src/lite/LiteEngine.ts`, `src/lite/sample.ts` (stateless WebGL2, `gl.POINTS`, `blendFunc(ONE, ONE_MINUS_SRC_COLOR)`, no framebuffers).
**Builds on:** `docs/RESEARCH_STYLES_AND_EXPORT.md` (section A). That file proposed "coarse luma texture, no FBO" for ASCII; this file takes it further and covers every style.
**Method:** repo code read in full for the three files above; primary sources fetched this session. Every external claim has a URL. **UNVERIFIED** marks anything not confirmed against a source (mostly GL spec details, because the Khronos spec PDFs came back as unreadable binary through the fetch tool, and several numbers I know from practice but could not cite). GLSL below is a sketch, not compiled or run.

---

## 0. Diagnosis from the code (why the six looks are weak)

Facts read from the repo:

1. `place()` is called with the particle's own `home`, and `lum` comes from that particle's own colour `mc` (`shaders.ts` POINTS main). With about 2.5 particles per cell (`keep = 2.5 / rawCover`, `LiteEngine.ts` ~line 563), each particle samples a different spot of the source (importance-sampled, sub-texel jitter in `sample.ts` lines 76-77, bilinear colour), so brightness and glyph differ inside one cell.
2. `keep` is Poisson-like: with a mean of 2.5 points per cell, a share of cells have 0 points (e^-2.5 = 8 percent, arithmetic) and those cells are holes. Cells with 5 points differ from cells with 1 only through stacking.
3. Under screen blending, stacks of binary shapes (Bayer threshold, glyph, bar) union rather than add. Already noted in `RESEARCH_STYLES_AND_EXPORT.md` A.0.
4. Styled points are limited by `ALIASED_POINT_SIZE_RANGE` (Apple Silicon [0, 64], from the earlier doc) and cannot be non-square or perspective-correct: a 3D tilt turns each snapped square into an unrotated square, so mosaic cells do not tile.
5. The picture texture the CPU already decodes (`sample.ts`: `rgba` plus `depth` at up to 768 px on the long side, then thrown away after sampling) is exactly what a cell-tone lookup needs. No new decode is required.

Everything below follows from one idea: **tone must be a property of the cell, not of the particle.**

---

## 1. Cell-consistent tone: texture lookup vs post pass

### 1.1 Options compared

| | (a) Cell-tone texture, sampled in the vertex shader | (b) Full-screen post pass into an FBO |
|---|---|---|
| New resources | one RGBA8 mipmapped texture per picture (colour in rgb, depth in alpha) | FBO + colour texture sized to the canvas, resize path, export path |
| Stateless? | yes, nothing persists between frames | needs a framebuffer, so it breaks the "no framebuffers" rule |
| Works with morph | sample two textures and mix (1.4) | cells average whatever was drawn, so a morph shows as blur |
| Works with 3D tilt/relief | tone is looked up at image-space position, so it is independent of the view | screen cells average a warped picture; tone is right but cells are screen-aligned, fine, but streaming particles pollute the average |
| Streaming particles | do not affect tone (the picture's tone is a property of the picture) | a bright streamer inside a cell brightens it for that frame, so glyph/threshold flicker as particles pass |
| Cost | 1 `textureLod` per styled primitive in the vertex shader | an extra full-screen pass plus a texture read per fragment |
| Export | nothing special | FBO at export size, `preserveDrawingBuffer` interplay |

**Recommendation: (a).** It is cheaper (one vertex-stage fetch, no extra pass), simpler (one upload when the picture loads), and robust to morph, tilt, pointer push, scan and streaming because tone never depends on where particles currently are. The post pass is only better for one thing: styles that should respond to the *rendered* image (for example outlines around streaming particles). Not needed here.

Vertex-stage texture reads: `textureLod` exists in GLSL ES 3.00 (Khronos ref page lists it for 3.00, not 1.00: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/textureLod.xhtml ). That page does not say which stage may call it; vertex-stage use is standard practice but **UNVERIFIED here** (ES 3.0 requires at least 16 vertex texture units per my memory, **UNVERIFIED**; check `gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)` at init, we need 2). Mipmaps on non-power-of-two textures are legal in WebGL2 (ES 3.0 dropped the NPOT restriction; **UNVERIFIED by fetch**), so `generateMipmap` on a 768x512 picture is fine.

### 1.2 What the texture is and how to build it

`sampleLite` already has `rgba` (w x h, un-premultiplied from `getImageData`) and `depth` (Float32, w x h). Add to `LiteSample`:

```ts
grid: { w: number; h: number; rgba: Uint8Array }   // alpha channel = depth * 255
```

Build once, right after `computeImportanceWeights` (alpha overwritten with `Math.round(depth[i]*255)`; the picture has no meaningful alpha today). Upload per slot:

```ts
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);   // alpha is depth, never premultiply
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);              // row 0 = picture top, so v = 0.5 - worldY
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, grid.rgba);
gl.generateMipmap(gl.TEXTURE_2D);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
```

Area average: the mip chain is a box filter, so `textureLod(uImg, uv, log2(cellTexels))` returns the mean of about `cellTexels^2` texels (trilinear between two levels when fractional). That is the "area-average" the question asks for, with no CPU resampling per cell-size change. For better quality when a cell is not a power of two, take 4 taps at `lod - 1` around the centre (still trivial: one primitive per cell, not per particle).

Colour averaging runs on sRGB bytes, which biases dark. Optional polish: `SRGB8_ALPHA8` internal format so the hardware averages in linear and leaves alpha (depth) linear. Whether `generateMipmap` accepts that format in every browser is **UNVERIFIED**; start with RGBA8.

### 1.3 Exact math: why snap at home xy, and the screen-cell inverse if ever needed

**Preferred trick: snap in image space, not screen space.** Define the grid on the picture:

```
cw = uCell / uScale                      // cell width in world units (picture height = 1)
cell centre  ws = (floor(home.xy / cw) + 0.5) * cw
uv           = vec2(ws.x / aspect + 0.5, 0.5 - ws.y)     // aspect = 2*uHalfW
cellTexels   = cw * texHeight
tone, depth  = textureLod(uImg, uv, log2(max(cellTexels, 1.0)))
```

Then run `place()` and `toClip()` with `home = vec3(ws, depth - 0.5)`. Every particle of a cell now has the same home, same tone, same depth; the cell moves, tilts and perspective-warps with the picture for free. Advantages over snapping the *projected* pixel position:

* No inverse projection, no dependence on yaw, pitch, dolly, relief, sway or float.
* Tone cannot swim when the camera moves, because the grid is glued to the picture.
* Depth is looked up from the same texel, so relief matches.

Cost: the grid is perspective-warped, not axis-aligned in pixels, when the picture is tilted (pan up to about 26 degrees per the code comments, 3D drag any angle). For a "card in 3D" look that is a feature; for crisp pixel-grid looks (dither, ASCII) it loses pixel alignment only during tilt.

**If a screen-aligned grid is ever required** (reference only, not recommended): dropping relief (z = 0), `toClip` reduces to

```
A = [[ cy,      0  ],        a = ( -sy*cp ,  sp )        // from toClip with p = (x, y, 0)
     [ sy*sp,   cp ]]
zc = a . w + uDolly          persp = 1 / (1 - 0.5*zc)    px = (A w) * persp * uScale + uOffset
```

For a screen cell centre `px`, let `u = (px - uOffset) / uScale`. Then `A w = u * (1 - 0.5*(a.w + uDolly))`, i.e. the 2x2 linear system

```
( A + 0.5 * u * a^T ) w = u * (1 - 0.5*uDolly)
```

whose solution is `w`; `uv` follows as above. It is exact for a flat card and wrong by the relief shift (`z * 0.45 * uDepth` moves the true projection), and the depth needed to correct it comes from the texture being looked up, a circular dependency. That is the second reason to prefer the home-xy snap.

### 1.4 Morph

Today morph mixes `aHome/aHome2` and `aMeta/aMeta2` per particle index. With cells there is no index correspondence, so morph becomes a **per-cell dissolve**: sample `uImg` and `uImg2` at the same cell, `e = smoothstep(0,1, uMorph + (rnd(cellId, 9u) - 0.5)*0.4)`, `tone = mix(t1, t2, e)`, `depth = mix(z1, z2, e)`. Simple and looks like the existing per-particle stagger.

---

## 2. One drawn primitive per cell: instanced grid

### 2.1 Why not "keep the minimal-hash particle per cell"

Stateless culling cannot pick the min-hash particle of a cell (a vertex shader sees one vertex). Raising `keep` to about 6 per cell lowers empty cells to e^-6 = 0.25 percent (arithmetic) but multiplies overdraw 2.4x and still leaves stacking. Rejected as the main path, usable as a quick stopgap (see plan step 1b).

### 2.2 Instanced cell grid (recommended)

Draw `nx * ny` instances, no vertex attributes (the code already uses `gl_VertexID`/`gl_InstanceID`; WebGL2 allows attribute-less draws):

```ts
gl.bindVertexArray(this.emptyVao);                       // no attributes
gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nx * ny);
```

Per cell: `ij = ivec2(id % nx, id / nx)`, centre from the grid, tone/depth from the texture (section 1), then **treat the cell as a particle**: call the existing `place(cellId, home, luma, 0.0, shareMul, ...)` with `home = vec3(centre, depth-0.5)`. That keeps pointer push (TRACK), click burst, shimmer, FLOW streaming, lean, randomness, scan bands (`scanBand(w, ...)` takes the world position), PULSE (uses `home.z`) and the drift direction exactly as dots have them, because all of those are functions of `(id, home, light)`.

The four corners are `toClip(w + (corner - 0.5) * vec2(cw, ch) * grow, z)` for corner in the strip order (0,0), (1,0), (0,1), (1,1). Consequences:

* Resting cells share corner coordinates, so they tile with no gaps or overlap even under perspective tilt, which is impossible with snapped square points. (GL's top-left fill rule handles shared edges; **UNVERIFIED here, standard rasterisation rule**.)
* No `gl_PointSize` limit: a 24 px cell works on Apple Silicon, where the earlier doc recorded a 64 px cap.
* Cells can be non-square (ASCII 1:2) and can be rotated (halftone, lines) by rotating the *grid in world space*, not the screen.
* Fragment gets `vUv` (0..1 across the cell) instead of `gl_PointCoord`, so no origin-flip risk (the Khronos ref page implies `gl_PointCoord` is top-left origin, y down: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/gl_PointCoord.xhtml ).
* No overlap, so under screen blending a cell is just its colour. The "dither tone collapses under blend" and "ASCII smear" problems disappear by construction.

Cost at 450k particles worth of budget: at an 8 css px cell on 1080p, about 32k cells (the earlier doc's figure); two layers (below) are about 65k vertex invocations x 4 vertices, versus 450k point vertices for DOTS and about 80k big points for the current styled path. Fill is about one screen of pixels per layer instead of `points x cell^2`. This is cheaper than anything the styled path does today. The 450k particle VBO is simply not read in styled modes.

### 2.3 Keeping drift, trails, pointer and scan visible

* **Layer A "picture":** every cell, `shareMul = 0` (never a streamer; `place()` already supports this by multiplying the share), so the picture has no holes. Pointer push, burst, scan and PULSE act on it.
  * Gate the per-id shimmer in `place()` for this layer (add `uniform float uGridA`; multiply the shimmer term by `1.0 - uGridA`), otherwise neighbouring cells wobble by up to `0.0015*(0.3+uDrift)` world units (about 1.6 px at 1080p) and open 1 px cracks.
* **Layer B "drift":** the same instanced draw with `shareMul = 1`; the vertex shader culls the instance unless `streaming > 0.02` (so it only draws cells that have left). Those cells fly out along the existing path, fade (`alpha`), take `uTrailSize`, and carry the same style shape, so you see little halftone dots or glyphs peeling off the picture. Cost: a second instanced draw of the same count, mostly culled.
  * Known side effect: layer A keeps the home copy, so a leaving cell leaves a ghost at home (dots style lets the hole form). That is the safer default (no dimming, no visible holes). A subtler variant is to dim layer A by the leaving cell's own `streaming`, but that needs `place()` called twice per A cell; decide after a visual check.
* **Trails:** the trail pass currently reads `aHome` from the particle VBO and is skipped for styled looks (`!styled`). Add a `uGrid` branch to `TRAILS`: instance = cell, head from `place(..., shareMul=1)`, tail as now; draw `gl.LINES` instanced over `nx*ny`. Cull non-streaming instances exactly as the existing code does (`streaming < 0.5`). Lines keep the colour of the cell (tinted by `partSat`). Enable trails in styled looks only for Mosaic, Halftone, Stipple, ASCII if the look test passes; leave off for Dither (binary look).
* **Scan band / pulse:** both are computed from `w` and `home.z` per cell; add the glow to the cell colour and, optionally, to `grow` (cell scale up to 1.15) as the PULSE branch does with `gl_PointSize`.
* **Pointer push:** `place()` displaces the cell rigidly. Neighbours near the cursor separate and open gaps; this is the intended "repel" read in a grid look.

### 2.4 Alternatives considered and rejected

* **Single picture quad with per-fragment styles** (sample the texture in the fragment shader for every pixel, evaluate halftone/dither/ASCII analytically). Pixel-perfect and the best choice for RGB-rotated colour halftone, but it is a rigid sheet: no pointer push, no streaming. Use it only for an optional "colour halftone" variant (section 3.1) because it needs no per-cell displacement.
* **Particles snapped to the grid with a boosted `keep`** (stopgap only).
* **FBO post pass** (section 1.1).

---

## 3. Per-style best practice

Common to all grid styles: the fragment shader gets `vUv` (cell-local 0..1), `vTone` (0..1, luma of the cell colour after Effects, auto-levelled, optionally inverted), `vCol` (cell colour), flat `vCell` (ij) and style params. The cell is never shaped by a particle's private luma again.

### 3.1 Halftone

* AM screening = regular grid of dots whose size varies; FM = varying spacing at fixed size. https://en.wikipedia.org/wiki/Halftone
* Dot shape: round is the usual choice, "suited to light images and skin tones", dots touching at 70 percent tone; square corners meet at 50 percent and can show a visible tone jump; elliptical meets at 40 and 60 percent. Same URL. The 50 percent jump is worth knowing: a square-dot halftone shows a step near mid-grey, so keep round as default and soften square with a tiny blend in `smoothstep`.
* Screen angle: rotating screens relative to each other reduces moire; for single-screen black-and-white work 45 degrees is the standard choice (stated as convention, **UNVERIFIED by a fetched source**; the Wikipedia page only gives angles for a purple screen: 90, 105, 165 degrees). Classic CMYK triple 15/75/0 plus K at 45 is a widely used convention, **UNVERIFIED**.
* Dot gain: the printed dot area is larger than the film dot area; the gain is largest in the midtones (about 23 percent at a 40 percent tone on coated paper at 150 lpi in the article's example) and is corrected with a tone reproduction curve. https://en.wikipedia.org/wiki/Dot_gain . For us dot gain is a user curve: `area = pow(tone, 1/(1+gain))`, `gain` positive gives bigger, brighter dots.
* Area vs tone: in linear light, area fraction should equal linear luminance; the current code uses `R = sqrt(lum)` (area = sRGB lum), which reads brighter than physical. Surma notes sRGB values are not perceptual mid-greys and dithering in sRGB makes gradients look bright too quickly (https://surma.dev/things/ditherpunk/). For a dark-picture complaint, brighter is what the user wants, so default area = `tone` and expose a `Tone` curve; do not default to physical.
* Grid rotation in the cell scheme: rotate the *world grid* by the angle before snapping (`R * home.xy`), place the quad's corners along the rotated axes. The cell corners rotate with `uAngle`, so no moire between grid and the pixel raster.
* Implementation shapes (fragment, `p = vUv - 0.5`, `R = sqrt(area) * 0.5 * 1.414` so a full tone fills the cell corner to corner):
  * round: `length(p) < R`; square: `max(abs(p.x),abs(p.y)) < R*0.7071`; diamond: `abs(p.x)+abs(p.y) < R`; cross: `min(abs(p.x),abs(p.y)) < thickness && max(...) < R`; line: `abs(p.y) < area*0.5`.
  * Antialias with `fwidth` as the current shader does.
* Colour halftone (optional, later): three screens of dots (R, G, B) at 15/75/0 degrees evaluated per fragment from `texture(uImg, uv)` on one picture quad (additive on black is the natural analogue of RGB light). Not in the cell-grid path.

### 3.2 Mosaic (flat, pixel art)

* One cell = one flat colour = the area average of the picture under it (section 1). The current noise came from per-particle colour.
* Colour quantisation: per channel `floor(c*(L-1) + 0.5)/(L-1)`, `L` 3 to 16 (posterize). For a "limited palette" look, run k-means (or median cut) on the grid texture on the CPU once per picture, 4 to 16 colours, upload as `uniform vec3 uPal[16]`, and in the vertex shader pick the nearest palette colour (16 distance tests per cell, negligible). **Palette extraction code is mine, no source cited.**
* Grout: `g` = gap as a fraction of the cell. `inside = step(g*0.5, vUv) * step(vUv, 1.0 - g*0.5)` per axis, with `fwidth` softening; rounded corners via a rounded-box SDF `length(max(abs(p) - (0.5 - g*0.5 - r), 0.0)) - r`.
* Outline (pixel-art look): sample the 4 neighbouring cell tones (4 extra `textureLod` per cell) and darken the cell edge facing a neighbour whose tone differs by more than a threshold. Cheap because it is per cell, impossible per particle.

### 3.3 Dither

* Bayer matrix recursion and thresholding `brightness > T(x,y)`: `Bayer(n) = [[4B, 4B+2],[4B+3, 4B+1]]`, level n has size 2^(n+1), normalise by 2^(2n+2). Bayer output is biased brighter; the fix is the inverted map `brightness > 1 - T`. Source: https://surma.dev/things/ditherpunk/ . Our `bayer8()` in `FRAG` already matches this recursion.
* Threshold bias is a user control (a signed offset added to tone before the threshold), covering the brightness bias above.
* Tone lives in linear light: sRGB to linear is `b/12.92` for b <= 0.04045 else `((b+0.055)/1.055)^2.4` (same Surma page). Dithering linear values then outputting full ink gives correct mean brightness; dithering sRGB values reads brighter. Provide it as the default off (matches "dark pictures dim" complaint) with a switch only if testers prefer it; keep as a hidden constant for now.
* **Error diffusion (Floyd-Steinberg, Atkinson) is sequential**: Surma says it is unsuitable for the GPU (same page). It does not have to run on the GPU. Because the picture is static per sample, run it **on the CPU on the cell grid** whenever the picture, cell size, levels or bias change, and upload the 1-bit (or L-level) result as an R8 texture sampled with `texelFetch(uDith, ij, 0)`. 32k to 130k cells is a few ms in JS. Atkinson weights are 1/8 on six neighbours (right, two right, next row at -1, 0, +1, and two rows down), with only 6/8 of the error diffused, which raises perceived contrast (same page). That gives the "1-bit Atkinson Mac" look statelessly at runtime.
* Methods to offer: Bayer 4x4 (visible pattern, retro), Bayer 8x8, blue noise (threshold from a 64x64 R8 void-and-cluster tile, `texelFetch(uBlue, ij & 63, 0)`; Surma describes the generation, sigma 1.5, and Obra Dinn's use of both: Bayer for characters/objects, blue noise for environment), Atkinson (CPU-baked). Ship the blue-noise tile as a 4 KB constant generated offline; free tiles exist at https://momentsingraphics.de/BlueNoise.html (licence **UNVERIFIED**, the earlier doc also flagged this; generate our own to be safe).
* Palette levels: ordered dither to `L` levels per channel is `floor(c*(L-1) + b)/(L-1)` with `b` in [0,1) the matrix value (unbiased version of the Wikipedia formula, https://en.wikipedia.org/wiki/Ordered_dithering ). Ordered dithering assumes evenly spaced palette levels (Surma); for arbitrary palettes use the CPU error-diffusion bake.
* Stability under motion: the grid is world-locked, so the pattern does not "swim" when the camera orbits. Surma points to Lucas Pope's forum post for camera-stability tricks in Obra Dinn; the world-glued cell is our free version of it.
* Under the instanced grid each cell is one dither pixel: a binary decision per cell, no stacking, so the tone collapse is gone. Cell size is the pixel size: 3 to 6 px reads as chunky pixel dither.
* 1-bit ink and paper: `col = mix(paper, ink, on)`; defaults ink = near-white or the Light colour, paper = black. For colour sources, `on` per channel with L=2 (RGB dither) or luma-only on with source hue (current behaviour).

### 3.4 ASCII

* **Ramp:** `" .:-=+*#%@"` is a standard 10-step density ramp; a 21st.dev article cites `.:-=+*#%@` as nine ink levels, coarse but deliberate, and longer ramps smoother but mushier (https://21st.dev/blog/react-ascii-art-components ). Paul Bourke's longer ramp is commonly quoted but I could not confirm it from a fetched page, so **UNVERIFIED**.
* **Build the ramp by measurement, not by hand:** draw every candidate glyph from the chosen monospace font into a 2D canvas at atlas cell size, read `getImageData`, take mean alpha as ink coverage, sort ascending, then pick N glyphs at evenly spaced coverage quantiles. This equalises tone steps; the current hand-ordered ramp has uneven steps (`-` and `=` and `+` are not evenly spaced in ink).
* **Atlas details that fix "reads weakly":**
  * cell aspect 1:2 (width:height) is the monospace norm: JetBrains Mono advance is 0.6 em per the font's metrics (**UNVERIFIED**, from memory), so use cell width = 0.5 to 0.6 of height and draw glyph rects at that aspect. Alex Harri also makes cells taller than wide to match monospace (https://alexharri.com/blog/ascii-rendering ), without a number.
  * bold weight, atlas cell 16x32 or 24x48, 1 px transparent padding inside each cell and `texelFetch`/inset UVs (the current atlas samples `(idx + pc.x)/10` with `LINEAR`, so neighbouring glyphs bleed at the edges),
  * contrast in the fragment: `a = smoothstep(0.25, 0.6, texel)` instead of `*1.8` clamp.
  * a dim "paper" behind the glyph at 8 to 15 percent of the cell colour makes glyphs readable on busy colour and removes the empty-cell look.
* **Luma-only vs shape-matching:** luma-only treats a cell as a pixel and gives blurry, jagged edges; shape-matching picks the glyph whose ink distribution fits the cell and gives much higher effective resolution. https://alexharri.com/blog/ascii-rendering describes 6 staggered sampling circles per cell, per-component normalisation of glyph vectors, nearest glyph by Euclidean distance, contrast enhancement (global exponent on the normalised vector and directional "external" samples from neighbouring cells), and a GPU pipeline. That page also notes a cache keyed on 5-bit-per-component quantised vectors for CPU lookups.
  * With one instance per cell this is feasible in our vertex shader: 6 `textureLod` taps at `lod-1` per cell plus a loop over about 64 glyph vectors (uploaded as a small RGBA32F or RGBA8 texture, `texelFetch`); 30k cells x 64 glyphs x 6 components is about 12M multiply-adds per frame, trivial for the GPU. It is not feasible per particle (450k x 64). **This is the single biggest ASCII quality jump and is only practical because of the grid.**
  * Treat as phase 3; phase 1 uses the measured luma ramp.
* **Colour modes:** source colour (glyph tinted by the cell colour on dim paper), green terminal (ink `#33ff66`-like phosphor, paper near black; palette choice is design, not a spec), mono tint (ink = Light colour), duotone. Alex Harri deliberately did not explore colour (same page), so no guidance there; the choice is ours.

### 3.5 Stipple

* Quality reference: weighted centroidal Voronoi stippling with Lloyd relaxation (Secord 2002). The PDF at https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/secord.2002b.pdf was not readable through the fetch tool (compressed streams), so only its outline is confirmed: Voronoi diagrams, centroidal Voronoi diagrams, stippling with weighted CVDs, precomputed stipple levels. Algorithm details above that are therefore **UNVERIFIED here**; the Wikipedia "Stippling" page has no digital method.
* Cheap stateless substitute that works with the grid: **jittered grid stipple**. One dot per cell, position `(0.5 + (h2 - 0.5)*jitter) * cell` from two hashes of the cell id (bounded jitter keeps the pattern even, blue-noise-like), radius `r = rmin + (rmax - rmin)*sqrt(tone)`, presence `tone*density > threshold(cell)` with the threshold from the blue-noise tile so dark areas thin out evenly instead of randomly. Dots keep full ink colour so they are never dim; a floor on `rmin` (0.12 cell) and auto-levelled tone fix "sparse dim dark pictures".
* A real stipple (relaxed) can be baked on the CPU if wanted: take the existing importance-sampled points (`sample.ts` positions) and run a few rounds of neighbour repulsion in a cell-binned hash (O(N) per round) before upload. Not needed for v1.
* Dot size by tone (not just density) is the classic read: both vary together here.

### 3.6 Lines

* Hatching: tone comes from line count, thickness and spacing; more or thicker lines is darker; cross-hatching adds layers in other directions (simplest is 90 degrees to the first; slight angle differences give a moire ripple). https://en.wikipedia.org/wiki/Hatching . On a black canvas, "darker ink" is "brighter": invert the mapping (more tone = thicker/more lines).
* Why today's bars are scratchy: each bar is an independent particle with its own luma and a random x. Fix with continuous strokes:
  * **Scan/engraving lines:** one row of cells per line; each cell draws a segment whose thickness is interpolated between the tone at its left and right edge (2 taps), so thickness is continuous across cell borders. Lines can run at any angle by rotating the grid.
  * **Hatch / cross-hatch:** in the fragment compute the stripe coordinate in world/picture space (`vWorld` varying) so strokes are continuous across cells, `d = abs(fract(dot(vWorld, dir)/pitch) - 0.5)`, `line = d < thickness(tone)`. Add second layer at +90 degrees for `tone` above one threshold and a diagonal at a higher one. Tone is read per fragment from `texture(uImg, uv)` so thickness changes smoothly instead of in cell steps.
* **Joy Division ridges:** rows displaced vertically by tone, as a polyline per row. The search found no authoritative shader write-up (only generic heightmap material, e.g. the University of Bremen exercise: displace a flat grid by a heightmap read in the shader, https://cgvr.informatik.uni-bremen.de/teaching/cg1_2122/uebungen/uebung04.pdf ), so the following is **my design, UNVERIFIED**: instance = row segment, quad extruded in screen space around the segment between `(x0, y0 + h*tone0)` and `(x1, y0 + h*tone1)`. Hidden-line removal needs an opaque black fill under each ridge, which our additive/screen blend cannot do. Drawing rows top to bottom with blending disabled for that style is a way, because GL renders primitives of one draw call in order. Treat as an optional extra.

### 3.7 Extra styles that read well and are cheap

* **Braille dots.** 2 x 4 dots per cell (cell aspect 1:2), each dot lit if its own sub-tone beats a Bayer value. Sub-tone from 8 taps at `lod-1` or one tap per dot. Effective resolution is 4x the cell count, so it reads detail that ASCII loses. Colour = ink on dark paper. Self-designed, no source needed.
* **LED matrix / CRT triad.** Cell = lit circle (or rounded square) with dark gap (`g` setting), brightness quantised. CRT variant: split the cell into three vertical bars coloured R, G, B with intensity per channel and an optional scanline darkening every second row. Triads are triangular arrangements of the three phosphors; the aperture-grille stripe layout could not be confirmed (https://en.wikipedia.org/wiki/Shadow_mask , **stripe layout UNVERIFIED**). Cheap and strong on dark backgrounds.
* **Crosses/plus, diamonds:** halftone shape options (3.1), no extra style.
* **Hex grid:** snap in axial coordinates; the earlier doc already flagged this maths as UNVERIFIED. Skip.

---

## 4. Per-style settings

### 4.1 Shared (apply to all grid styles)

| Setting | Range | Default | What it does |
|---|---|---|---|
| Cell size | 4 to 24 css px (today 4 to 16) | 8 | grid pitch; scales with export size as today (`ps`) |
| Colour mode | Source / Mono / Duotone | Source | Source = cell colour as ink; Mono = ink colour x shape; Duotone = tone mixes paper to ink |
| Ink / Paper | colour pickers (reuse the Light colour for ink if set) | white / black | used by Mono and Duotone; paper fills the cell background |
| Invert | on/off | off | `tone = 1 - tone`, swaps ink and paper roles |
| Auto levels | on/off | on | stretches the picture's tone to its 2nd to 98th percentile (computed on the CPU from the grid texture once) so dark pictures fill the style's range |

Contrast, gamma, black/white points and hue/saturation already exist as the Effects tab (`effects()` runs before the style), so do **not** add a second contrast slider. Each style's own "tone" setting (below) is a shaping curve on already-levelled tone, only where it changes the look.

### 4.2 Per style (2 to 4 each)

**Halftone**
* Shape: Round / Square / Diamond / Cross / Line, default Round.
* Angle: 0 to 90 degrees, default 45.
* Dot gain: -0.5 to 0.5, default 0.15 (positive = bigger, brighter dots; compensates dark pictures).
* (later) Screens: 1 or 3 (RGB at 15/75/0), default 1.

**Mosaic**
* Colours: Off or 4 to 32 (palette size, k-means), default 16.
* Gap: 0 to 0.3 of the cell, default 0.06.
* Corner: 0 to 1, default 0.
* Outline: 0 to 1, default 0 (pixel-art edge darkening).

**Dither**
* Method: Bayer 4 / Bayer 8 / Blue noise / Atkinson, default Bayer 8.
* Levels: 2 to 6 per channel, default 2 (1-bit with ink and paper).
* Bias: -0.25 to 0.25, default 0 (threshold shift).
* Default colour mode here: Duotone (ink white, paper black), because 1-bit reads best that way.

**ASCII**
* Ramp: Classic 10 / Dense 16 / Blocks (` ░▒▓█`, needs glyph support) / Binary (`01`), default Classic.
* Match: Tone / Shape, default Tone (Shape from phase 3).
* Paper: 0 to 0.3, default 0.1 (dim cell-colour fill behind each glyph).
* Default colour mode: Source; offer a Green terminal chip as a Mono preset.

**Stipple**
* Dot size: 0.1 to 0.6 of the cell, default 0.35.
* Density: 0.25 to 2, default 1.
* Jitter: 0 to 1, default 0.6 (0 = regular grid, 1 = fully random inside the cell).

**Lines**
* Mode: Scan / Hatch / Cross-hatch (Ridges later), default Scan.
* Angle: 0 to 180 degrees, default 0 for Scan, 45 for Hatch.
* Weight: 0.5 to 2, default 1 (line thickness gain).
* Pitch uses Cell size (no separate control).

**Extra 1: Braille** — Threshold bias -0.25 to 0.25 (0); Dot size 0.3 to 0.9 of the sub-cell (0.7).
**Extra 2: LED / CRT** — Pattern: LED round / RGB triad / RGB stripe (LED round); Gap 0 to 0.5 (0.15); Scanlines 0 to 1 (0.3).

Total new engine params: about 14 plus the 5 shared. Pack into one `uniform vec4 uStyleP` (per-style meaning) plus `uInk`, `uPaper`, `uColorMode`, `uInvert`, `uLevels`, so the shader signature stays small.

---

## 5. Recommended implementation plan (in order of value)

### Step 1: cell-tone texture (CPU + upload) and quick fix on the existing point path (1b is optional)
* **CPU:** extend `sampleLite` to return `grid` (rgba, w, h) with depth in alpha; compute a luma histogram for auto-levels (`lo`, `hi` percentiles). **Data:** one RGBA8 texture per slot, mipmapped, TEXTURE1 (TEXTURE2 for the morph target).
* **Uniforms:** `uImg`, `uImg2`, `uTexSize`, `uLevels` (lo, hi).
* **1b stopgap (shader-only, about a day):** in the existing `POINTS` path, snap `home.xy` to the world grid (`ws = (floor(home.xy/cw)+0.5)*cw`) before `place()`, take `mc`/`z` from `textureLod(uImg, uvOf(ws), lod)`, set `keep` to about 6 per cell. Immediately gives cell-consistent glyph, threshold and radius with no new draw path. Cost: overdraw 2.4x on fewer points. Risk: low. Throw-away once step 2 lands, but it proves the texture/orientation (`v = 0.5 - y`) in a day.
* **Verify:** debug view that outputs `vec3(tone)` for every cell: should be a clean low-res version of the picture (check orientation, no flip).

### Step 2: instanced cell grid renderer (the main change)
* **Shader:** new `CELL_VERT` (reuses `place()`, `toClip()`, `effects()`, `tint()`, `scanBand()`), new fragment style library (3.1 to 3.6) reading `vUv`, `vTone`, `vCol`, flat `vCell`. **TS:** empty VAO, `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, nx*ny)` twice (layer A: `shareMul=0`, layer B: `shareMul=1`, culled to leavers); `nx = ceil(aspect/cw)`, `ny = ceil(1/cw)`; `cw = cell/uScale` (and `ch = 2*cw*0.55` for ASCII/Braille).
* **Gate in `place()`:** shimmer scale `(1.0 - uGridA)`.
* **Remove:** `keep`, `vLum` per particle, `gl_PointSize`/atlas bleed in the point path for styled looks; `cover` is not needed for styled looks (one primitive per cell, no stack).
* **Cost at 450k:** vertex work drops from 450k to about 65k x 4; fill is about one screen per layer. Lower than the current styled path. **Risk:** medium. Main risks: seams between cells from float rounding (verify at several zooms/DPRs, add `+0.5 px` of corner growth only if seams show), depth steps cracking at relief discontinuities (use centre z for all four corners; accept), morph needs per-cell dissolve (1.4), trails need the cell branch (2.3).
* **Verify:** see below.

### Step 3: per-style fragment upgrades in order of visible gain
1. Mosaic (flat, quantised, gap, optional outline) and Halftone (shape, angle, dot gain): minutes each once the grid exists.
2. Dither: Bayer by cell index in the vertex shader, blue-noise texture, then CPU Atkinson bake (R8 texture rebuilt on picture/cell/levels/bias change, debounced).
3. ASCII: measured-ink ramp atlas with padding and `texelFetch`, dim paper, then 1:2 cell aspect; shape-matching (Alex Harri method, 6 taps and glyph-vector texture) after.
4. Stipple: jittered grid, size and presence by tone.
5. Lines: Scan with edge-interpolated thickness; Hatch and Cross-hatch with world-space stripes; Ridges later.
6. Extras: Braille, then LED/CRT.
* **Shader-only vs CPU:** shader-only: halftone, mosaic, stipple, lines, braille, LED/CRT, Bayer/blue-noise dither, luma ASCII. CPU needed: auto-levels (histogram), palette extraction (mosaic), Atkinson bake (dither), glyph ramp and shape vectors (ASCII), blue-noise tile (offline).

### Step 4: shared settings UI and colour modes
* `uColorMode`, `uInk`, `uPaper`, `uInvert` plus the per-style `uStyleP`; export engine must pass `cell*ps` as today (`LiteEngine.ts` line 544), and because the grid is defined in world units by `cw = cell/uScale`, cell count relative to the picture stays equal at any export size.

### Step 5: trails in styled looks, optional colour halftone, optional ridges
* Trails from cells (2.3); colour halftone via picture quad; ridges with blending off.

### How to verify visually (compare, do not just run)
Add `scripts/verify-styles.mjs` (Playwright, like the existing verify scripts). It should render each style at fixed `exactT = 0` (the engine already supports `frame(0, exactT)`), with drift 0, scan off, pointer off, on three pictures: a dark low-key photo, a high-key photo, a portrait.
1. **Tone fidelity:** downsample the canvas to the cell grid and compare to the source luma; mean luma within 5 percent, and per-style SSIM or mean absolute error against the cell-averaged source, to catch the "dim dark picture" case with a number.
2. **Cell uniformity:** inside every cell, the colour must be one of at most (ink, paper, shape) values; count distinct colours per cell for mosaic (should be exactly 1 plus gap).
3. **Seams:** render with pan at 0.5 and 3D orbit at several angles and zoom 1, 1.5, 3; check no 1 px gaps (look for black pixels with all four neighbours lit).
4. **Motion:** drift 0.6 with TRACK on: screenshot at 3 times; confirm no holes in layer A, leavers visible in layer B, cells push away from the cursor.
5. **Loop/export:** `t = 0` and `t = T` pixel-identical (existing loop test; `place()` is unchanged).
6. **Side-by-side:** old vs new per style on the three pictures at 2 cell sizes (6 and 12), plus dots as the reference for brightness.
7. **Perf:** ms/frame at 450k, 1080p and 4K export, per style. The ladder (`adapt()`) should not drop quality for styled looks.

---

## 6. Open items (not verified; test before relying)

* Vertex-stage `textureLod`, `MAX_VERTEX_TEXTURE_IMAGE_UNITS` >= 2, NPOT mipmaps in WebGL2, `SRGB8_ALPHA8` mip generation: standard but not confirmed by a fetched page.
* `gl_PointCoord` origin: only inferred from the Khronos ref page; moot after the grid (uses `vUv`).
* Secord stippling details (PDF unreadable), Paul Bourke ramp, JetBrains Mono advance ratio, CMYK/RGB angle sets, aperture-grille layout.
* Blue-noise licence; we should generate our own tile.
* Joy Division / hidden-line approach and Braille are my designs.
* Everything in "Cost at 450k" is arithmetic from the code, not a measurement.

## Sources

* Repo: `src/lite/shaders.ts`, `src/lite/LiteEngine.ts`, `src/lite/sample.ts`, `docs/RESEARCH_STYLES_AND_EXPORT.md`
* https://surma.dev/things/ditherpunk/ (Bayer recursion, bias, linear light, blue noise, Atkinson, GPU suitability)
* https://alexharri.com/blog/ascii-rendering (shape-matching ASCII, 6 sampling circles, contrast enhancement, taller cells)
* https://en.wikipedia.org/wiki/Halftone (AM/FM, dot shapes, screen frequency)
* https://en.wikipedia.org/wiki/Dot_gain
* https://en.wikipedia.org/wiki/Hatching
* https://en.wikipedia.org/wiki/Ordered_dithering
* https://en.wikipedia.org/wiki/Shadow_mask
* https://21st.dev/blog/react-ascii-art-components (ramp levels)
* https://registry.khronos.org/OpenGL-Refpages/es3.0/html/gl_PointCoord.xhtml
* https://registry.khronos.org/OpenGL-Refpages/es3.0/html/textureLod.xhtml
* https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/secord.2002b.pdf (outline only)
* https://cgvr.informatik.uni-bremen.de/teaching/cg1_2122/uebungen/uebung04.pdf (heightmap displacement, generic)
* https://momentsingraphics.de/BlueNoise.html
