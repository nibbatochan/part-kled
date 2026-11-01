# Research: high-quality bitmap effects for the studio panel

Research only. No source code was changed. Nothing was committed. Date: 2026-11-01. Branch `master-web`.

Evidence rules (same as the other `RESEARCH_*.md` notes):
- "Code fact" = read from the repo this session. Paths are relative to the repo root, with line numbers.
- Outside claims carry a source number `[n]`, listed in section 0.2.
- **UNVERIFIED** = not traced to a primary source this session. Stated as memory or design judgement.
- GLSL is a sketch. Not compiled, not run.

---

## 0. Summary and sources

### 0.1 Summary

- **Families.** Single-colour (1-bit), duotone / gradient map, glow (bloom), multi-colour (palette), multi-pattern (halftone, ordered dither, error diffusion, stipple, ASCII, scanline/CRT).
- **Much already exists.** The studio already has DITHER (ordered Bayer, IGN), HALFTONE (rotated grid), ASCII (glyph atlas), CRT/scan dither, a 4-colour PALETTE look, a two-colour duotone post pass, bloom and halo, and a MONO / DUO colour mode (code facts below). A new family must not repeat these.
- **Gaps (code fact).** No blue-noise or stipple look. No error-diffusion (serial, not GPU-friendly). No three-stop gradient map. No palette look with a retro hardware palette (CGA, Game Boy, PICO-8). Bloom has no Karis (luma-weighted) first tap, as far as the post shader reads.
- **Five chosen variations** (section 5): INK 1-BIT (single colour), GRADIENT MAP (duotone, three stops in Oklab), KARIS BLOOM (glow), CGA PALETTE (multi-colour), STIPPLE (multi-pattern, per-particle blue-noise threshold).
- **Cost.** Four of five need no framebuffer: INK, GRADIENT, CGA and STIPPLE are per-particle or per-cell colour and threshold work. Only KARIS BLOOM needs the scene FBO and a mip chain.

### 0.2 Sources

Read this session (content retrieved):
1. Wikipedia, Ordered dithering: https://en.wikipedia.org/wiki/Ordered_dithering (Bayer recursion formula; original Bayer 1973 reference; 2x2 and 4x4 matrices; threshold centring).
2. Bryce Bayer, "An optimum method for two-level rendition of continuous-tone pictures", IEEE ICC 1973, vol. 1, pp. 11-15. Cited via [1], not opened directly.
3. Wikipedia, Floyd-Steinberg dithering: https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering (weights 7/16 right, 3/16 below-left, 5/16 below, 1/16 below-right; serial scan; serpentine variant; Atkinson only as a link).
4. Floyd and Steinberg, "An Adaptive Algorithm for Spatial Greyscale", Proc. SID 17(2), pp. 75-77, 1976. Metadata via search snippets (a few sources give 1975): https://steveomohundro.com/wp-content/uploads/2009/03/omohundro90_floyd_steinberg_dithering.pdf (Omohundro 1990, read as search snippet only; notes low-intensity structure).
5. R. A. Ulichney, "The Void-and-Cluster Method for Dither Array Generation", Proc. SPIE 1913, pp. 332-343, 1993. Metadata and method description from secondary sources (a patent summary, arXiv 1907.05073): https://patents.google.com/patent/US5912745 and https://arxiv.org/pdf/1907.05073. **The SPIE paper itself was not read.**
6. R. A. Ulichney, "Dithering with blue noise", Proc. IEEE 76(1), 56-79, 1988. Cited by title in the same secondary sources; not opened.
7. Wronski, Dithering part three: https://bartwronski.com/2016/10/30/dithering-part-three-real-world-2d-quantization-dithering/ (read in the earlier repo note `docs/RESEARCH_EFFECTS_UI.md` [3]: avoid Bayer; IGN or blue noise; triangular remap).
8. Surma, Ditherpunk: https://surma.dev/things/ditherpunk/ (earlier repo note [4]: Atkinson kernel, error diffusion is sequential, void-and-cluster, dither in linear light).
9. Adrian Secord, "Weighted Voronoi Stippling", NPAR 2002, pp. 37-44, ACM. DOI 10.1145/508530.508537. Search result metadata: https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/secord.2002b.pdf (PDF link in search; **content not read**).
10. Wikipedia, Halftone: https://en.wikipedia.org/wiki/Halftone (read this session: round, elliptical and square dot shapes meet at 70%, 40/60% and 50%; lpi values tagged "citation needed"; screen angle is defined from the 9 o'clock line; the article gives no ink-by-ink angles).
11. Wikipedia, Color Graphics Adapter: https://en.wikipedia.org/wiki/Color_Graphics_Adapter (read this session: 16-colour RGBI table with hex values; mode 4 palette 1 = cyan, magenta, light grey, plus high intensity).
12. gbdev Pan Docs, Palettes: https://gbdev.io/pandocs/Palettes.html (read this session: DMG BGP register maps four 2-bit colour indices to White, Light gray, Dark gray, Black; the page gives no RGB values).
13. Wikipedia, Ordered dithering and Bayer: covered by [1].
14. Ottosson, Oklab: https://bottosson.github.io/posts/oklab/ (earlier repo note [10]: even lightness; use for palette and gradient interpolation). Oklab matrices in the GLSL sketches are from memory and must be checked against this page.
15. Jimenez, CoD:AW post-processing: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare (earlier repo note [6]: pyramid bloom, luma-weighted downsample, 3x3 tent upsample). Not re-fetched this session.
16. Unity URP Bloom docs, earlier repo note [8] (threshold, scatter, clamp, high quality filtering).
17. Timothy Lottes, CRT shader: **primary not reached.** The Lottes homepage returned 404. Secondary: a public-domain CRT scanline snippet and libretro forum posts (https://forums.libretro.com/t/the-scanline-classic-shader/41497?page=3). Treat the CRT mask claims as UNVERIFIED.
18. PICO-8 palette: https://pico-8.fandom.com/wiki/Palette returned HTTP 402 (not read). The search snippet names the fan wiki as the common reference and says it is not official. **Hex values in section 2.4 are from memory, UNVERIFIED.**
19. Adobe Photoshop Duotone help: https://helpx.adobe.com/photoshop/using/duotone-mode.html returned HTTP 403 (not read). **Duotone ink-curve claims are UNVERIFIED.**
20. Ulichney and others on stipple: Secord [9] is the only stipple source reached.

Tried and failed (so every claim that would have rested on them is UNVERIFIED):
- Lottes CRT primary (404). PICO-8 wiki (402). Photoshop duotone (403). Wikipedia Halftone angles (the article gives none; the 45/15/75/0 ink angles in section 2.5 are from printing practice, UNVERIFIED).
- SPIE 1993 void-and-cluster paper (not opened; method from patent and arXiv summaries).
- Inigo Quilez and Playdead slides (already failed in the earlier repo note).

---

## 1. Code facts that shape everything

- **One pass for dots, cells for looks.** `LiteEngine` draws trails, then points or cells straight to the default framebuffer (`src/lite/LiteEngine.ts:325`, blend `ONE, ONE_MINUS_SRC_COLOR`). Points use `gl.POINTS`; cell looks are instanced quads with tone from a mipmapped picture texture (earlier note `docs/RESEARCH_EFFECTS_UI.md` section 1).
- **Look list.** `STYLE_NAMES` in `src/core/styles.ts:4` has 18 names; looks 14 to 16 are retired and 17 is PALETTE. `LOOK_CATEGORIES` (`src/core/styles.ts:9-17`) groups them: DOTS [0,1,6], PIXEL [2,8], TEXT [4], LINES [5,7], RETRO [9], GRAPHIC [10,11,12], DITHER [3,13,17].
- **Existing dither.** `bayer()` and `ign()` are built in the shader without a texture (`src/lite/shaders.ts:611-622`). DITHER (3) chooses Bayer 4x4, Bayer 8x8 or IGN by `uSP.x` (`src/lite/shaders.ts:667`). SCAN (13) and PALETTE (17) reuse the same threshold (`src/lite/shaders.ts:669-676`). PALETTE hard-codes four colours (`:676-678`).
- **Existing halftone and ASCII.** HALFTONE (1) has ROUND, SQUARE, DIAMOND, CROSS, LINE, DASH, STAR, RINGS (`src/lite/shaders.ts:641-660`). ASCII (4) uses a glyph atlas (`src/lite/shaders.ts:681-686`).
- **Colour mode.** `colorMode` is 0 SOURCE, 1 MONO ink, 2 DUO ink on paper for cell looks (`src/lite/LiteEngine.ts:57`); the web build maps `p.colorMode === 'bw'` (`src/web/WebEngine.ts:62`). So a mono mode already exists for cell looks; it is not a 1-bit threshold with its own palette.
- **Duotone post pass.** `uDuo` mixes the picture between `uDuoA` and `uDuoB` by luma with `smoothstep(0,1,l)` in sRGB, after the scene is drawn (`src/lite/Post.ts:198-201`). This is a two-stop map, without Oklab.
- **Bloom post.** Scene drawn to a texture when light post is on (`src/lite/LiteEngine.ts:740`, `lightPost` at `:740`). Bloom and halo read one bright copy at half size, cut at a threshold (`src/lite/Post.ts:2-5`). Bloom is a tight glow from the two largest copies; halo from the two smallest. The file header does not say whether the first tap is luma-weighted (Karis); check before claiming a change.
- **Params.** `Params.glow` holds `threshold`, `bloomAmount`, `bloomRadius`, `haloAmount`, `haloSize`, `haloTint`, `glowPat`, `glowPatAmt` (`src/core/params.ts:77`, defaults `:149`). `Params.surface.duoShadow` / `duoLight` are the duotone stops (`:76`, defaults `:148`). `Params.colorMode: 'true' | 'bw'` (`:81`). `Params.style: number` (`:45`). `Params.ss` holds per-look settings (`:46`).
- **Per-look tone.** Each cell look keeps its own cell size, colour and tone (`lookTone`, `src/core/params.ts:95-97`), and per-look settings are declared in `src/core/styles.ts:39-51` as `range` or `seg` controls with a `styles:` list.
- **Panel.** Controls are built in `src/ui/Panel.ts` (886 lines). Per the studio CLAUDE.md, a new control is a field in `params.ts` first, then UI, then shader.

---

## 2. Algorithm background (what the families are)

### 2.1 Single colour (1-bit)

Threshold each pixel's luma against a threshold `t(x,y)`, output ink or paper. The only design choice is the threshold source:
- A constant 0.5: posterised, banding, no texture.
- An ordered matrix (Bayer): regular, visible cross-hatch at mid-tones [1].
- Blue noise or IGN with a triangular remap: fewer structured artefacts [3][5][6][7].

Bayer threshold: the 2x2 matrix is 1/4 [[0,2],[3,1]], and the 4x4 is 1/16 [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] [1]. The article centres thresholds by subtracting half the largest value, so the average is zero [1].

### 2.2 Duotone and gradient map

Map luma to a colour ramp. Two stops is a duotone; three or more is a gradient map. Duotone ink curves in Photoshop are not verified (section 0.2 item 19). Interpolating in Oklab keeps lightness even and avoids the muddy midpoints of sRGB mixes [14]. The studio's `uDuo` mixes in sRGB (`src/lite/Post.ts:198-201`), which is the difference the variation fixes.

### 2.3 Glow (bloom)

Threshold bright pixels, downsample through a mip chain, blur, upsample and add. Jimenez's method: a 13-tap downsample with a Karis average on the first mip to stop fireflies (luma-weighted, each block divided by `1 + luma`), then a 3x3 tent upsample [15]. Unity exposes threshold, intensity, scatter, clamp and a high-quality filter [16]. A separable Gaussian with ping-pong is simpler but blurs only one radius [7].

### 2.4 Multi-colour (palette)

Quantise each colour to the nearest palette entry, optionally dithering between the two nearest entries. Distance is best measured in a perceptual space. Oklab is the standard choice for even lightness [14].

Retro palettes with sources:
- **CGA 16-colour** (RGBI, 4-bit), hex values verified [11]:

  | # | Name | Hex |
  |---|---|---|
  | 0 | Black | #000000 |
  | 1 | Blue | #0000AA |
  | 2 | Green | #00AA00 |
  | 3 | Cyan | #00AAAA |
  | 4 | Red | #AA0000 |
  | 5 | Magenta | #AA00AA |
  | 6 | Brown | #AA5500 |
  | 7 | Light gray | #AAAAAA |
  | 8 | Dark gray | #555555 |
  | 9 | Light blue | #5555FF |
  | 10 | Light green | #55FF55 |
  | 11 | Light cyan | #55FFFF |
  | 12 | Light red | #FF5555 |
  | 13 | Light magenta | #FF55FF |
  | 14 | Yellow | #FFFF55 |
  | 15 | White | #FFFFFF |

  Mode 4 palette 1 is cyan, magenta, light gray, plus high-intensity cyan, light magenta, white [11]. The "cyan, red, brown" set is mode 5, which Wikipedia says IBM does not document [11].
- **Game Boy DMG:** four shades selected by the BGP register, 2-bit indices mapped to White, Light gray, Dark gray, Black [12]. The page gives no RGB; the greens of the handheld are UNVERIFIED and must be chosen by the designer.
- **PICO-8:** 16 colours. The fan wiki is the common reference; it is not official [18]. **Hex values from memory, UNVERIFIED:** 000000, 1D2B53, 7E2553, 008751, AB5236, 5F574F, C2C3C7, FFF1E8, FF004D, FFA300, FFEC27, 00E436, 29ADFF, 83769C, FF77A8, FFCCAA. Check them against the software before shipping.

### 2.5 Multi-pattern

- **Halftone:** a dot screen on a rotated grid. Dot shape and tone meeting points: round dots meet at 70%, elliptical at 40% and 60%, square at 50% [10]. Screen angle is measured from 9 o'clock [10]. Ink-by-ink angles (45, 15, 75, 0) are from printing practice: UNVERIFIED. The existing HALFTONE look covers this.
- **Ordered (Bayer) dither:** threshold matrix from the recursion `M(2n) = [[4M, 4M+2J],[4M+3J, 4M+J]] / (2n)^2` [1]. Bayer 1973 is the original [1][2].
- **Error diffusion (Floyd-Steinberg):** scan left to right, top to bottom, quantise, push the error to unprocessed neighbours with weights 7/16 (right), 3/16 (below-left), 5/16 (below), 1/16 (below-right) [3][4]. It is **serial**: each pixel depends on the one before it [3][8]. Omohundro notes it makes structured patterns at low intensity [4]. Atkinson is named by [3] and [8], weights not read.
- **Blue noise / void-and-cluster:** Ulichney builds a threshold array with the largest-void and tightest-cluster steps [5]. Blue noise is what the eye tolerates best for dither [3][8]. A precomputed 64x64 or larger texture is the usual GPU form. IGN (interleaved gradient noise) is a cheap texture-free stand-in used by the repo already (`src/lite/shaders.ts:611`).
- **Stipple:** place dots with density proportional to darkness. Weighted Lloyd (centroidal Voronoi) iteration gives even, non-overlapping dots [9]. This is an offline method; on screen it is approximated by a per-dot random threshold against tone (section 3.5).
- **ASCII:** shape-matching of glyph vectors, or simply a luma ramp. Alex Harri's approach samples six circles per cell and matches shape vectors [earlier note `docs/RESEARCH_EFFECTS_UI.md` [5]]. The repo already uses a luma ramp on an atlas (`src/lite/shaders.ts:681`).
- **Scanline / CRT:** a scanline mask (alternate rows darker) plus a shadow mask (RGB triads). Lottes' shader is the common reference for this look [17], but the primary was not reached. The repo covers it with look 9 (CRT) and look 13 (SCAN).

### 2.6 Cost on GPU

- Threshold families (Bayer, IGN, blue noise, stipple) are one texture or bit-op per fragment: cheap.
- Palette nearest search is a loop over N colours (N up to 16) per fragment in Oklab: about 16 mix-and-distance steps. Cheap at 200k points; per-particle, not per-pixel.
- Bloom needs the scene FBO and about 5 to 6 mip passes. WebGL best practice: avoid FBO attachment changes, use half resolution, and use `invalidateFramebuffer` on tile-based GPUs [MDN, earlier repo note 11]. The repo already budgets one scene FBO at most (earlier note section 0.1).
- Float render targets need `EXT_color_buffer_float` [earlier note 12]. Bloom can use RGBA8 with a gamma-safe clamp if float is unavailable.

---

## 3. Mapping onto a particle system

The inputs are per-particle or per-cell:
- **Luma** of the source picture at the particle's home (cell look: `textureLod` tone; dots: sampled at the particle's home UV).
- **Per-particle colour**: `vCol` in `POINTS` (`src/lite/shaders.ts` point path). Cell colour: `vInk`, `vBg`, `vTone`.
- **Screen grid**: `gl_FragCoord` for threshold textures; `vCell` (flat int) for cell looks (`src/lite/shaders.ts:600-601`).
- **Particle id**: `hash(id)` from `place()` (`src/lite/shaders.ts`, earlier note section 1). Stable per particle, so a particle-based threshold does not flicker.

### 3.1 Single colour (INK 1-BIT): cell input
Needs luma per cell (`vTone`) and the cell index for the threshold (`vCell`). Output to `vInk` / `vBg`.

### 3.2 Gradient map: post or per-fragment
Needs the final picture's luma. As a post pass it is free of particle state. Applies after the scene (same place as `uDuo`).

### 3.3 Karis bloom: post
Needs the scene FBO. Input is the bright copy of the scene. No particle state.

### 3.4 Palette: per-particle or per-cell
Needs the particle's or cell's colour (`vCol` or the sampled picture colour). The palette is applied to the colour before blending, so the result stays one colour per particle.

### 3.5 Stipple: per particle
Keep a particle only when its own hash is below the tone at its home. This needs the tone sampled at the home UV in the vertex shader, passed as a varying, then `discard` or zero alpha in the fragment shader. No grid, no cell index, no texture: the particle is the dot.

---

## 4. Parameters and what to build

### 4.1 Proposed fields in `params.ts`

Following the studio CLAUDE.md, add fields in `params.ts` first. Proposed, all new unless marked:

```ts
// new
bitmap: {
  inkOn: boolean;            // INK 1-BIT on (cell look MONO path, see 5.1)
  inkThreshold: number;      // 0..1 default 0.5
  inkSpread: number;         // 0..1 default 0.5, width of the noise threshold
  inkLight: string;          // hex, default '#f2efe6'
  inkDark: string;           // hex, default '#0b0b0b'
  gradStops: [string, string, string]; // hex, default ['#1a0d4d','#c2306b','#ffd980']
  gradMix: number;           // 0..1 default 1 (0 = off)
  palette: number;           // 0 CGA mode 4 palette 1, 1 Game Boy greens, 2 PICO-8 (UNVERIFIED hex)
  paletteDither: number;     // 0..1 default 0.5
  stippleDensity: number;    // 0..1 default 0.6
  stippleGamma: number;      // 0.5..3 default 1.2
  stippleSize: number;       // 1..3 px default 1.5
};
// existing, reused
glow: { threshold, bloomAmount, bloomRadius, ... }  // src/core/params.ts:77
```

Add `karis: boolean` (default true) and `knee: number` (0..1, default 0.5) to `glow` for KARIS BLOOM. Defaults in `defaults` (`src/core/params.ts:99`), serialisation via `parseParams` (`:251`) already merges nested objects, so add a `bitmap` merge line there.

### 4.2 The five variations: quick table

| Name | Family | Where | FBO | Existing overlap |
|---|---|---|---|---|
| INK 1-BIT | single colour | cell look, shader | no | MONO colour mode (`colorMode`, `LiteEngine.ts:57`); look 3 DITHER |
| GRADIENT MAP | duotone / multi-stop | post, after scene | no (post, scene already drawn) | `uDuo` two-stop sRGB (`Post.ts:198`) |
| KARIS BLOOM | glow | post | yes | bloom / halo (`Post.ts:2-5`) |
| CGA PALETTE | multi-colour | per particle or cell | no | look 17 PALETTE, four colours |
| STIPPLE | multi-pattern | per particle | no | look 6 GLOW, look 1 HALFTONE |

### 4.3 Caveats on overlap

- CGA PALETTE overlaps look 17 (PALETTE) in intent. The difference: a hardware palette (16 colours, nearest in Oklab) against a fixed four-colour set with ordered dither. Confirm visually before shipping both.
- KARIS BLOOM is a rewrite of the existing bloom pass, not a new effect. Check `Post.ts` before claiming a change; the first tap may already be luma-weighted.

---

## 5. Five variations to build

Each: name, family, algorithm (3-6 lines), GLSL core function (sketch, not compiled), parameters with default and range, and the `params.ts` fields it needs.

### 5.1 INK 1-BIT (single colour)

**Family:** single colour (1-bit).

**Algorithm.** Take the picture luma at the cell. Compare it with a threshold drawn from a triangular-remapped noise texture (IGN here, blue noise when available). Output the ink colour where luma is above the threshold, paper elsewhere. One ink, one paper, no grey. Triangular remap keeps the threshold centred and removes banding [3][7].

**GLSL sketch** (fragment side of the cell path):

```glsl
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Triangular remap of a uniform value in [0,1) to [0,1], centred on 0.5 [3].
float triRemap(float u) {
  return u < 0.5 ? sqrt(u * 0.5) : 1.0 - sqrt((1.0 - u) * 0.5);
}

vec3 inkBit(float luma, vec2 fragXY, float threshold, float spread, vec3 ink, vec3 paper) {
  float n = triRemap(ign(fragXY));              // 0..1, triangular
  float t = threshold + (n - 0.5) * spread;     // spread widens the threshold band
  float bit = step(t, luma);                    // 1 = paper side, 0 = ink side
  return mix(ink, paper, bit);
}
```

The `sqrt` remap is the standard triangular form for a uniform input (the `[0,1]` version); check the exact constants against [3] before use.

**Parameters.**
- `inkThreshold`: default 0.5, range 0..1. Moves the cut. Below 0.5 gives a darker picture.
- `inkSpread`: default 0.5, range 0..1. Width of the dither band. 0 gives a hard posterise.
- `inkLight`, `inkDark`: default `#f2efe6`, `#0b0b0b`.

**Fields needed.** `bitmap.inkOn`, `bitmap.inkThreshold`, `bitmap.inkSpread`, `bitmap.inkLight`, `bitmap.inkDark`. Tone from `vTone`; cell index from `vCell` (or `gl_FragCoord` for points).

### 5.2 GRADIENT MAP (duotone, three stops in Oklab)

**Family:** duotone and multi-stop gradient map.

**Algorithm.** Compute luma of the final picture. Convert the three stops from sRGB to Oklab once on the CPU. Look up the colour at luma `l` by linear interpolation between the two nearest stops in Oklab, convert back to sRGB, then mix with the original by `gradMix`. Oklab keeps lightness even between stops [14]; the current `uDuo` mixes in sRGB and gives muddy midtones (`src/lite/Post.ts:198-201`).

**GLSL sketch** (post shader; Oklab matrices from [14], to be checked):

```glsl
uniform vec3 uStop0; uniform vec3 uStop1; uniform vec3 uStop2; // Oklab, precomputed on CPU
uniform float uGradMix;

vec3 gradMap(vec3 srgb) {
  float l = dot(srgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 lab = mix(uStop0, uStop1, smoothstep(0.0, 0.5, l));
  lab = mix(lab, uStop2, smoothstep(0.5, 1.0, l));
  vec3 mapped = oklabToSrgb(lab);               // standard inverse of Oklab, see [14]
  return mix(srgb, mapped, uGradMix);
}
```

`smoothstep` on luma here is a stand-in for a proper ramp; a 256-entry LUT built on the CPU is the more predictable choice and is cheaper per pixel.

**Parameters.**
- `gradStops`: default `['#1a0d4d','#c2306b','#ffd980']` (the current `duoShadow`/`duoLight` already live in `surface`, `src/core/params.ts:76`), range any hex.
- `gradMix`: default 1, range 0..1.

**Fields needed.** `bitmap.gradStops`, `bitmap.gradMix`. Post-only, so no particle state. Reuses the post pass where `uDuo` sits.

### 5.3 KARIS BLOOM (glow)

**Family:** glow (bloom).

**Algorithm.** Threshold the scene into a soft-knee bright copy. Downsample through a mip chain. On the first downsample, weight each 4x4 block by `1/(1+luma)` (Karis average) so a single very bright pixel cannot flare [15]. Upsample with a 3x3 tent and add back. Keep the existing `threshold` and `bloomAmount`; the change is the first-tap weighting and the knee.

**GLSL sketch** (Jimenez first tap [15]; the 13-tap pattern is simplified here to a 4-tap box):

```glsl
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThr;   // glow.threshold
uniform float uKnee;  // glow.knee, 0..1

vec3 soft(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float k = uThr * uKnee;
  float s = clamp(l - uThr + k, 0.0, 2.0 * k);
  s = s * s / (4.0 * k + 1e-5);
  return c * max(s, l - uThr) / max(l, 1e-5);
}

vec3 karisFirst(vec2 uv) {
  vec3 a = soft(texture(uScene, uv + uTexel * vec2(-1, -1)).rgb);
  vec3 b = soft(texture(uScene, uv + uTexel * vec2( 1, -1)).rgb);
  vec3 c = soft(texture(uScene, uv + uTexel * vec2(-1,  1)).rgb);
  vec3 d = soft(texture(uScene, uv + uTexel * vec2( 1,  1)).rgb);
  float wa = 1.0 / (1.0 + dot(a, vec3(0.2126, 0.7152, 0.0722)));
  float wb = 1.0 / (1.0 + dot(b, vec3(0.2126, 0.7152, 0.0722)));
  float wc = 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)));
  float wd = 1.0 / (1.0 + dot(d, vec3(0.2126, 0.7152, 0.0722)));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
```

The soft-knee function is Unity's form [16]; the Karis weight is Jimenez's [15]. Check constants against [15][16] before use.

**Parameters.**
- `glow.threshold`: existing, default 0.55, range 0..1.
- `glow.bloomAmount`: existing, default 0.9, range 0..1.5.
- `glow.knee`: new, default 0.5, range 0..1.
- `glow.karis`: new boolean, default true.

**Fields needed.** `glow.karis`, `glow.knee` (new); `glow.threshold`, `glow.bloomAmount` (existing, `src/core/params.ts:77`). Needs the scene FBO, which `lightPost` already creates (`src/lite/LiteEngine.ts:740`). Use half resolution for the mip chain [7][15]. Float is not required if the bright copy is clamped.

### 5.4 CGA PALETTE (multi-colour)

**Family:** multi-colour palette quantisation, with ordered dither between the two nearest colours.

**Algorithm.** Convert the particle or cell colour to Oklab. Find the nearest and second-nearest palette entries by Oklab distance. Choose between them with a Bayer threshold weighted by the distance ratio, so mid-tones show dithered pairs. Default palette is CGA mode 4 palette 1 [11], a verified 4-colour subset: black, cyan, magenta, light gray, plus the high-intensity set. Other palettes are selectable: Game Boy greens (colours UNVERIFIED), PICO-8 (UNVERIFIED hex).

**GLSL sketch** (fragment, per particle colour):

```glsl
uniform vec3 uPal[16];     // Oklab, precomputed on CPU for the chosen palette
uniform int uPalN;         // 4 for CGA palette 1 (black, cyan, magenta, light grey)
uniform float uPalDither;  // 0..1

vec3 palette(vec3 srgbOk, float bayer) {
  float d1 = 1e9; float d2 = 1e9; int i1 = 0; int i2 = 0;
  for (int i = 0; i < 16; i++) {
    if (i >= uPalN) break;
    float d = dot(srgbOk - uPal[i], srgbOk - uPal[i]);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  float w = d1 / (d1 + d2 + 1e-6);                 // 0 at nearest, 0.5 when equal
  float pick = (w > bayer * uPalDither) ? 1.0 : 0.0;
  int idx = pick > 0.5 ? i2 : i1;
  return okToSrgb(uPal[idx]);                      // inverse conversion, see [14]
}
```

`bayer` comes from the existing `bayer()` (`src/lite/shaders.ts:613`). Distance in Oklab is a standard perceptual choice [14]; the exact dither rule is a design choice, not from a source.

**Parameters.**
- `palette`: default 0 = CGA mode 4 palette 1 [11]; 1 = Game Boy (colours UNVERIFIED); 2 = PICO-8 (hex UNVERIFIED).
- `paletteDither`: default 0.5, range 0..1. 0 = nearest only, 1 = full dither.

**Fields needed.** `bitmap.palette`, `bitmap.paletteDither`. Per particle colour (`vCol`) on DOTS; per cell colour on cell looks.

### 5.5 STIPPLE (multi-pattern, per particle)

**Family:** stipple (weighted random dot placement) on the particle system.

**Algorithm.** Each particle is a dot. Its own hash `h = hash(id)` is fixed, so the dot pattern does not flicker. The particle is drawn only if `h < density * tone^gamma`, with tone sampled at the particle's home UV. Dark areas keep more dots, light areas keep fewer, which is the stipple rule [9] implemented as a random threshold. Blue-noise texture can replace the hash for even spacing [5][3].

**GLSL sketch** (vertex side passes a varying; fragment discards):

```glsl
// vertex: tone at home UV, per-particle hash from place()
float tone = texture(uPicture, homeUV).r;   // luma
float keep = (hash1(float(id)) < uStippleDensity * pow(tone, uStippleGamma)) ? 1.0 : 0.0;
vKeep = keep;
gl_PointSize = uStippleSize * uPx;

// fragment: round dot, zero alpha when dropped
if (vKeep < 0.5) discard;
float r = length(gl_PointCoord - 0.5);
if (r > 0.5) discard;
o = vec4(vCol, 1.0);
```

`hash1` is any cheap float hash; the repo already has `hash21` in the cell shader (`src/lite/shaders.ts:609`). Weighted Lloyd [9] would give even spacing but is offline; not proposed for the live path.

**Parameters.**
- `stippleDensity`: default 0.6, range 0..1.
- `stippleGamma`: default 1.2, range 0.5..3. >1 pushes dots into the darks.
- `stippleSize`: default 1.5, range 1..3 px.

**Fields needed.** `bitmap.stippleDensity`, `bitmap.stippleGamma`, `bitmap.stippleSize`. Per particle: needs `id` and the home UV (both already in `place()`, earlier note section 1). No FBO.

---

## 6. Open questions (UNVERIFIED or not checked)

- Lottes CRT primary and the PICO-8 hex values are not verified (section 0.2 items 17 and 18).
- Photoshop duotone ink curves not read (item 19). The GRADIENT MAP claims rest on Oklab only.
- SPIE 1993 void-and-cluster not read; blue-noise texture generation method is from secondary summaries.
- Error diffusion on GPU: not proposed as a variation. Options if wanted later: an ordered approximation (done here as blue noise), or tile-based Jacobi passes. The latter is a design idea, not a sourced method.
- Whether the existing `Post.ts` bloom already uses a luma-weighted first tap (section 1). Read the full shader before the KARIS change.
- Halftone ink angles (45/15/75/0) are not sourced. The existing HALFTONE look uses 45 by default (`src/core/styles.ts:46`).
- Mobile cost of Oklab palette search at 200k points has not been measured.

---

## 7. Sources to check

Primary references were not all reached. Priority for a follow-up pass, in order:
1. Ulichney 1993 SPIE 1913 (void-and-cluster): cited by title; not opened.
2. Bayer 1973 IEEE ICC: cited via [1]; not opened.
3. Floyd and Steinberg 1976 SID: cited via [4]; not opened.
4. Lottes CRT shader source (GitHub, public domain snippet).
5. PICO-8 palette: official manual or the running software.
6. Adobe Photoshop duotone and halftone docs (403 this session).
