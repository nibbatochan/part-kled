# Research Report: Particle Styles (lite renderer) and Browser-Side Export

**Scope:** `src/lite/LiteEngine.ts`, `src/lite/shaders.ts` (stateless WebGL2, `gl.POINTS` + instanced trail lines, `blendFunc(ONE, ONE_MINUS_SRC_COLOR)`, no framebuffers).
**Method:** primary sources fetched this session (MDN, Khronos WebGL spec, WebKit blog, caniuse, library READMEs). Each claim carries a URL. Items marked **UNVERIFIED** were not confirmed against a source and need a test before shipping.

---

## 0. What the current code does (constraints that shape everything below)

Read from the two files:

- The fragment shader is `o = vec4(vCol, 1.0)`. There is no `gl_PointCoord` shaping today. Each point is a flat square of `gl_PointSize`.
- `pointPx = max(1, round(dpr))` (LiteEngine.ts ~line 438). Dots are one device pixel. A point of 1 px has no interior, so **no style can show shape until the point is bigger**. All styles below therefore need a larger `gl_PointSize` and fewer points. The vertex shader can cull by hash exactly as the trail path already does (`if (rnd(id, 6u) > uTrailAmount * 0.5) gl_Position = vec4(2.0)`).
- Brightness is normalised so that `k` stacked dots land on the source colour: `o = 1 - pow(1 - cb, aMeta.a*5/uCover)`. `uCover` = expected dots per pixel. Any style that changes dot area must change `cover` the same way, or the picture goes too dark or too bright.
- Time terms (all feed the loop section): per-streamer `cycle = (5 + 5*r2)/uSpeed`, `age = fract(uTime/cycle + r1)`, shimmer `sin(uTime*0.9)`, `sin(uTime*0.7)`, flow phase `uTime*0.25`, PULSE `sin(uTime*2.4 - ...)`, CPU side: sway `sin(t*0.23)`, `0.11`, `0.17`, `0.09`, float `sin(t*0.7)`, `0.37`, scan `((t - clickT)*SCAN_RATE) % 1`.
- Canvas is created with `preserveDrawingBuffer: false`, `alpha: false`, `antialias: false`. DPR is capped (`maxDpr` 1.5) and drops x0.75 on the quality ladder.
- `resize()` and `applySize()` set `canvas.width/height` from CSS size x dpr and call `relayout()`.

---

## A. STYLES

### A.0 Facts that apply to every style

| Fact | Source |
|---|---|
| WebGL only guarantees a max point size of 1. Apple Silicon reports a range of [0, 64]; other devices reported 512 to 2048. Query `gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)` and clamp. Cell sizes of 4 to 16 px are safe everywhere. | https://developer.apple.com/forums/thread/714831 , https://discourse.threejs.org/t/working-around-the-low-aliased-pointsize-on-the-new-m1-macbook-pros/26819 |
| `ALIASED_POINT_SIZE_RANGE` returns a 2-element `Float32Array`. | https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter |
| `gl_PointCoord` runs 0..1 across the point, origin top-left in GLSL ES (y points down). **UNVERIFIED this session** (GLSL ES 3.00 spec not fetched). Test with a gradient. | https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf |
| Bayer matrix recursion: `M_2n = 1/(2n)^2 * [[4Mn, 4Mn+2Jn],[4Mn+3Jn, 4Mn+Jn]]`, dither `c' = nearest(c + r*(M(x mod n, y mod n) - 1/2))`. M2 = 1/4 [[0,2],[3,1]]. | https://en.wikipedia.org/wiki/Ordered_dithering |
| Free blue-noise textures (Christoph Peters, licence not confirmed here). POV-Ray ships a 64x64 void-and-cluster pattern. | https://momentsingraphics.de/BlueNoise.html |

**Blend failure mode that hits every style.** Screen blending accumulates every overlapping point. A style that makes a hard binary decision per fragment (dither, line, glyph) loses tone when `k` points stack, because the union of k identical binary shapes is one shape, not k times brighter. Two fixes:

1. **Snap to a grid in the vertex shader and cull to about 2 to 4 points per cell.** Then overlap is small and bounded. Cell count at 1080p, 8 px cells = 240 x 135 = 32 k cells, so about 65 to 130 k points. This is cheaper than today's 450 k tiny points.
2. **Fold the stack count into the opacity** (`cover` = dots per cell, not per pixel) so `1-(1-o)^k` still lands on the source colour.

Fill-rate warning (arithmetic, not sourced): fragments per frame = points x pointPx^2. 450 k points at 8 px = 29 M fragments before overdraw. Always cull when the cell is above 2 px.

### A.1 Ranking (cheapest and safest first)

Rank = visual payoff / (cost + risk of looking wrong under screen blend).

| # | Style | Needs texture | Needs FBO | Cost | Risk under screen blend |
|---|---|---|---|---|---|
| 1 | Pixel / voxel mosaic (square cells, optional hex) | no | no | lowest | low: solid fill, stacking only brightens |
| 2 | Halftone dots (radius from luma) | no | no | low | low-medium: overlapped discs of different radius union to the largest |
| 3 | Sparkle / cross stars | no | no | low | low: additive glow is the intended look |
| 4 | Stipple / noise dots | no | no | lowest (fewer points) | low: density carries tone |
| 5 | Scanline / line-art bars | no | no | low | medium: needs row snapping |
| 6 | Ordered dither (Bayer 8x8, 1-bit or palette) | optional (blue noise) | no | low | high: tone must come from density, see A.2.3 |
| 7 | ASCII per point (atlas) | yes, glyph atlas | no | medium | high: overlapped glyphs smear |
| 8 | ASCII / dither as post pass | yes | **yes** | medium | none: cell luma is exact |

### A.2 Techniques, math, failure modes

**A.2.1 Pixel / voxel mosaic.** Vertex: snap the projected pixel position to a grid, `px = (floor(px/cell) + 0.5) * cell`, set `gl_PointSize = cell`. Fragment: solid square, optionally quantise colour `floor(c*L + 0.5)/L`. Hex variant: snap in axial coordinates (`q = (sqrt(3)/3*x - y/3)/size`, `r = 2/3*y/size`, cube-round, convert back) and shade a hexagon in the fragment with `max(abs(p.x)*0.866 + abs(p.y)*0.5, abs(p.y))`. The hex formulas are standard grid maths, **UNVERIFIED against a cited source**. Failure: snapped points land on the same pixel, so brightness is the sum of all points in the cell. Use `cover = pointsPerCell` in the opacity formula.

**A.2.2 Halftone.** Vertex: rotate the pixel position by 45 degrees (`mat2`), snap to cell centre, rotate back. Fragment: `r = length(pc - 0.5) * 2.0`; target radius `R = sqrt(lum)` (area proportional to brightness); `a = 1.0 - smoothstep(R - w, R + w, r)` with `w = fwidth(r)`. Bright on dark (our background is black) so large dot = bright. Failure: with 2 to 4 points per cell with slightly different luma, you see the largest disc. Acceptable. For a clean look, use the luma of the cell, which only a post pass knows exactly.

**A.2.3 Ordered dither.** Threshold the point's own brightness against a Bayer value taken at the **fragment's screen pixel**, `gl_FragCoord.xy`. 1-bit: `on = lum > bayer(frag)`; output the ink colour (or the source hue at full value). Palette: quantise each channel to `L` levels with `floor(c*(L-1) + bayer - 0.5 + 0.5)/(L-1)` (the Wikipedia formula with spread `r = 1/(L-1)`). Bayer needs no texture: it is computed from bits (see the sketch). Blue noise is better looking but needs a 64x64 R8 texture bound as `sampler2D` with `REPEAT` wrap and `NEAREST` filter.
**Failure with additive blend:** a pixel covered by k points, each testing the same threshold, shows the pixel on if the brightest point passes. Tone then follows the maximum of the stack, not the sum. Mitigation: keep points per pixel low (1 to 2, so points are density-culled by luma, see stipple) and use dither only for the colour quantisation, or take the post-pass route. Treat as the riskiest per-point style; ship it behind a visual check.

**A.2.4 Stipple / noise dots.** Keep a point only if `rnd(id, 11u) < pow(lum, gamma) * keep`; draw each as a small round dot, 2 to 3 px, constant colour. Tone is density. Cheapest style: it removes points instead of adding fragments. Source images are already importance-sampled (`aMeta.a` is the density gain), so the stipple pattern is blue-noise-ish for free. Failure: at low `lum` the picture goes empty, so lift with `gamma ~ 0.6`.

**A.2.5 Scanline / line art.** Vertex: snap `px.y` to a row pitch `P` (4 to 8 px), set `gl_PointSize = P`. Fragment: a bar whose thickness follows luma, `thick = lum; a = step(abs(pc.y - 0.5)*2.0, thick)`; horizontal extent is the full point. Variant: displace row `y` by luma (Joy-Division look) in the vertex shader. Failure: if row snapping is not applied, bars at different y overlap into a soft smear.

**A.2.6 Sparkle / cross stars.** Fragment: `p = abs(pc - 0.5)*2; star = exp(-p.x*14.0 - p.y*2.0) + exp(-p.y*14.0 - p.x*2.0) + 0.5*exp(-dot(p,p)*8.0)`. Only draw large points (8 to 16 px) for the brightest 3 to 5 percent (`rnd < lum^4 * 0.05`). Additive blend is exactly right here. Pair with a twinkle `0.5 + 0.5*sin(uTime*3.0 + r1*40.0)`.

**A.2.7 ASCII / glyph per point.** Build a glyph atlas at init with a 2D canvas: draw the ramp `" .:-=+*#%@"` (10 glyphs, ordered by ink coverage) into a `10*G x G` canvas, `G` = 16, white on black, upload with `texImage2D`, `LINEAR` (or `NEAREST` for crisp), `CLAMP_TO_EDGE`. Vertex: snap to cell grid, `gl_PointSize = G_screen` (cell), pass `vIdx = floor(clamp(lum,0.,.999) * 10.)`. Fragment: `uv = vec2((vIdx + pc.x)/10.0, pc.y); a = texture(uAtlas, uv).r`. `texImage2D` from a canvas may need `UNPACK_FLIP_Y_WEBGL` depending on `gl_PointCoord` orientation, test it.
**Failure:** points of one cell choose their glyph from their own luma, so neighbours in the same cell can pick different glyphs and overlap into mush. Fix: derive `lum` from the **cell** not the point: hash the snapped cell id and look up a coarse luma from a small (e.g. 256x128) luma texture built once on the CPU from the sample, so every point in the cell picks the same glyph. That is one extra texture, no FBO. For particles that are streaming off the picture, skip the glyph and draw a dot.

**Post pass alternative for ASCII and dither.** Render the points normally into an FBO texture (`RGBA8`, canvas-sized), then draw one full-screen triangle that, per cell, samples the cell centre (or a 3x3 average), picks a glyph or a Bayer threshold, and writes the result. Exact tone, no overlap problems, cost = one extra pass. This breaks the "no framebuffers" rule, adds a resize path, and breaks `preserveDrawingBuffer` assumptions for export. Only do it if per-point ASCII looks bad. **Recommendation: per-point cell-lookup now (above), post pass later only for ASCII.**

### A.3 Recommended set of six (no FBO needed for any)

1. **Halftone** (rotated 45 deg grid, dot radius = sqrt(luma)).
2. **Mosaic** (square cells, colour quantised; hex as a toggle).
3. **Dither** (Bayer 8x8, 1-bit ink or 4-level palette).
4. **Glyph / ASCII** (atlas + coarse luma lookup).
5. **Stipple** (density by luma, tiny round dots).
6. **Lines** (row-snapped bars, thickness by luma).
Bonus seventh at near-zero cost: **Sparkle stars**.

### A.4 GLSL ES 3.00 sketch (not compiled or run)

New uniforms: `uniform int uStyle; uniform float uCell; uniform float uKeep; uniform sampler2D uAtlas; uniform sampler2D uLuma;` and outputs `out float vLum; out vec2 vCellId; flat out int vStyle;`.

```glsl
// ---- vertex, after place()/toClip() have produced gl_Position and c / cb -----------------
// styles: 0 dot, 1 halftone, 2 mosaic, 3 dither, 4 glyph, 5 stipple, 6 lines, 7 sparkle
vec2 snapPx(vec2 px, float cell, int style) {
  if (style == 1) {                                  // halftone: 45 degree grid
    const mat2 R = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    vec2 q = R * px;  q = (floor(q / cell) + 0.5) * cell;  return transpose(R) * q;
  }
  if (style == 6) return vec2(px.x, (floor(px.y / cell) + 0.5) * cell);   // lines: rows only
  return (floor(px / cell) + 0.5) * cell;            // mosaic, dither, glyph
}

// in main(), after gl_Position = toClip(w, home.z):
if (uStyle != 0) {
  // keep fraction: fewer, bigger points. uKeep ~ (screen area / cell^2) * 3 / drawnCount
  float keep = uKeep;
  if (uStyle == 5) keep *= pow(lum, 0.6);                    // stipple: density by luma
  if (uStyle == 7) keep *= pow(lum, 4.0) * 0.05;             // sparkle: brightest only
  if (rnd(id, 11u) > keep || streaming > 0.5 && uStyle >= 3 && uStyle <= 6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return;   // same cull trick as TRAILS
  }
  vec2 px = gl_Position.xy * uView * 0.5;                    // back to px, origin at centre
  if (uStyle >= 1 && uStyle <= 4 || uStyle == 6) {
    px = snapPx(px, uCell, uStyle);
    gl_Position.xy = px / (uView * 0.5);
  }
  gl_PointSize = (uStyle == 5) ? 2.0 : (uStyle == 7) ? uCell * 2.0 : uCell;
  vLum = lum;  vStyle = uStyle;
  // opacity: points per cell replaces dots per pixel (see A.0)
  // o = 1 - pow(1 - cb, aMeta.a * 5. / max(uCoverCell, .25));
}

// ---- fragment ---------------------------------------------------------------------------
#version 300 es
precision mediump float;
in vec3 vCol; in float vLum; flat in int vStyle;
uniform sampler2D uAtlas;
out vec4 o;

float bayer8(vec2 fc) {                       // M(i,j): level 0 (finest bit) is most significant
  ivec2 p = ivec2(fc) & 7; int v = 0;
  for (int i = 0; i < 3; i++) {
    int x = (p.x >> i) & 1, y = (p.y >> i) & 1;
    v += (((x ^ y) << 1) | y) << (2 * (2 - i));
  }
  return (float(v) + 0.5) / 64.0;             // verify against M2 = [[0,2],[3,1]]/4 in a unit test
}

void main() {
  vec2 pc = gl_PointCoord;                    // 0..1, y down (UNVERIFIED, test)
  vec2 d = pc - 0.5;
  float a = 1.0;
  if      (vStyle == 1) { float r = length(d) * 2.0, R = sqrt(vLum), w = fwidth(r);
                          a = 1.0 - smoothstep(R - w, R + w, r); }                    // halftone
  else if (vStyle == 2) { a = 1.0; }                                                  // mosaic
  else if (vStyle == 3) { a = step(bayer8(gl_FragCoord.xy), vLum); }                  // 1-bit dither
  else if (vStyle == 4) { float idx = floor(clamp(vLum, 0.0, 0.999) * 10.0);
                          a = texture(uAtlas, vec2((idx + pc.x) / 10.0, pc.y)).r; }   // glyph
  else if (vStyle == 5) { a = 1.0 - smoothstep(0.35, 0.5, length(d)); }               // stipple
  else if (vStyle == 6) { a = step(abs(d.y) * 2.0, vLum); }                           // lines
  else if (vStyle == 7) { vec2 p = abs(d) * 2.0;
                          a = exp(-p.x*14.0 - p.y*2.0) + exp(-p.y*14.0 - p.x*2.0)
                            + 0.5 * exp(-dot(p, p) * 8.0); }                          // sparkle
  o = vec4(vCol * a, 1.0);                    // blendFunc(ONE, ONE_MINUS_SRC_COLOR) keeps working
}
```

Implementation notes for the person wiring this:

- Add `style`, `cell` as fields in the lite params and pass `uStyle`, `uCell` (device px), `uKeep`, `uCoverCell`. `uKeep = clamp(cells*3/drawn, 0.02, 1)`.
- `uCell` must scale with the export resolution (section B.1).
- With `precision mediump float` in the fragment shader (as now), `gl_FragCoord` bit ops are on `ivec2`, fine; the Bayer loop has constant bounds, valid in GLSL ES 3.00.
- Trails (`gl.LINES`) are unaffected by styles; hide them for mosaic, glyph, dither, lines.

---

## B. EXPORT

### B.1 Stills

**Recommended path: a second, off-screen engine at export size** (own canvas, never attached to the DOM), not a resize of the live canvas. Reasons: no visible flicker, no fight with the ResizeObserver, `preserveDrawingBuffer: true` there costs nothing, and the live canvas stays on its quality ladder.

| Question | Answer | Source |
|---|---|---|
| Read the image back | `canvas.toBlob(cb, type, quality)`. `type` `image/png` default; `image/jpeg` and `image/webp` in many browsers; unsupported type falls back to PNG; `quality` 0..1 applies to jpeg and webp only. Callback gets `null` on failure. | https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob |
| Why `preserveDrawingBuffer` matters | By default the drawing buffer is cleared after compositing; reading it later can be undefined. The spec suggests reading in the same function that renders, or setting `preserveDrawingBuffer: true`. | https://registry.khronos.org/webgl/specs/latest/1.0/ |
| Requested size too large | The implementation may create a smaller drawing buffer. Real size is `gl.drawingBufferWidth/Height`. Always compare to what you asked for. | https://registry.khronos.org/webgl/specs/latest/1.0/ |
| Minimum limits you can assume | `MAX_VIEWPORT_DIMS`, `MAX_RENDERBUFFER_SIZE`, `MAX_TEXTURE_SIZE` = 4096 on effectively all systems. 3840x2160 fits that. | https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices |
| `readPixels` cost | Synchronous CPU readback is a finish plus round trip; use a PBO plus fence if you ever need async. For a single still, `toBlob` is enough. | https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices |
| Large canvases and memory | 4K RGBA8 = 33 MB per buffer. Browser-specific canvas area limits exist. **UNVERIFIED** (no primary source fetched). Check `drawingBufferWidth` and fall back to a lower size. | n/a |

**Fixed sizes** (16:9): 854x480, 1280x720, 1920x1080, 2560x1440, 3840x2160 (4K, gated by the limit check). Use even numbers; H.264 needs even width and height (also matters for video).

**What must scale with output size** (read from LiteEngine.ts):

1. `canvas.width/height = W, H`; `gl.viewport(0,0,W,H)`. No DPR multiplication for export: the target is exact pixels. Set `dpr = 1` and bypass the `applySize` DPR logic.
2. `relayout()` derives `scale = imgH` from the canvas, so the picture refits automatically. Aspect: the picture's aspect rarely equals 16:9, so framing follows `layout.fit` (contain or cover) and `zoom`. Export "as seen": pass the same `fit`, `zoom`, `alignX` as the live view; the picture then fills the same fraction of the frame height.
3. **Point size and cell size are pixel units, so scale them:** `k = H / liveDeviceHeight`; `pointPx = max(1, round(livePointPx * k))`; `uCell = round(liveCell * k)`. Without this a 4K still has 4x sparser dots. `cover(pointPx)` already re-derives dots per pixel from the point size, so brightness stays right; check it uses `W*H`, not a cached value.
4. The `drawn` count (quality ladder) must be reset to full for export, and the ladder disabled (`adapt()` off), so a slow frame cannot step quality down mid-export.
5. Disable pointer, click burst and scan for a deterministic result (`uPtrOn = 0`, `burstW = 0`, `scanOn = false` unless the user wants it).
6. Render once at fixed `t`, then immediately `canvas.toBlob(...)` in the same task, with `preserveDrawingBuffer: true` as belt and braces. (MDN's `toBlob` page does not state when the bitmap is captured, so do not rely on timing alone.)
7. JPEG has no alpha; the canvas is `alpha: false`, so black background is correct. WebP via `toBlob` is browser-dependent; check `blob.type` and fall back to PNG.

Suggested still quality: PNG lossless (no setting); JPEG 0.92; WebP 0.90.

### B.2 Video

#### Two approaches

| | MediaRecorder + `canvas.captureStream` | WebCodecs `VideoEncoder` + muxer |
|---|---|---|
| Frame-exact, deterministic | **No.** Captures in real time. With `captureStream(0)` and `track.requestFrame()` you control when a frame is captured, but timestamps still come from the wall clock. | **Yes.** You pass the timestamp of every frame. |
| Can run faster than real time | no | yes (encode as fast as the GPU/CPU allows) |
| Bitrate control | `videoBitsPerSecond` | `bitrate`, `bitrateMode`, `latencyMode`, `keyFrame` per frame |
| Container | browser decides | you choose (MP4, WebM) via muxer |
| Browser support | wide | Chrome 94+, Edge 94+, Firefox desktop 130+, Safari 26 full (partial 16.4 to 18.7) |
| Extra code | tiny | one library |

Sources: `captureStream(frameRate)`: unset = frame each time canvas changes; `0` = only on `requestFrame()`; negative throws `NotSupportedError` ( https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream ). WebCodecs support table ( https://caniuse.com/webcodecs ). MediaRecorder support Chrome 49, Edge 79, Safari 14.1, Firefox 29 ( https://caniuse.com/mediarecorder ). `VideoEncoder` is "Limited availability", secure contexts only, available in dedicated workers ( https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder ). `captureStream(0)` plus `requestFrame()` code shape is **UNVERIFIED**: the MDN `requestFrame` page returned 404 when fetched.

#### WebCodecs workflow (verified pieces)

- Build a frame from the canvas with an explicit timestamp: `new VideoFrame(canvas, { timestamp })`. Timestamps are in **microseconds**. `frame.close()` as soon as it is encoded. Use `encodeQueueSize` for backpressure. Force a key frame with `encode(frame, { keyFrame: true })`. Check `VideoEncoder.isConfigSupported(config)` first; `configure()` throws `NotSupportedError` otherwise. `flush()` before finishing. ( https://developer.chrome.com/docs/web-platform/best-practices/webcodecs )
- Frame `i` at `fps`: `timestamp = Math.round(i * 1e6 / fps)`, `duration = Math.round(1e6 / fps)`. Use integer frames, never accumulate floats.
- Build the `VideoFrame` right after the draw, in the same task, from the export canvas that has `preserveDrawingBuffer: true`. No authoritative statement was found on `VideoFrame(canvas)` timing vs `preserveDrawingBuffer`. **UNVERIFIED**, keep the flag on.

#### Muxer library (verified)

| Library | Status | Licence | Size | Source |
|---|---|---|---|---|
| `mp4-muxer` | **Deprecated**, "will not receive any new features or bug fixes" | MIT | not stated | https://github.com/Vanilagy/mp4-muxer |
| `webm-muxer` | **Deprecated** the same way | MIT | not stated | https://github.com/Vanilagy/webm-muxer |
| **`mediabunny`** (npm `mediabunny`) | Maintained successor of both, pure TypeScript, zero dependencies, sponsor-funded | **MPL-2.0** (modifying its own files means publishing those changes; using it unmodified in a closed app is allowed) | "as small as 5 kB gzipped" tree-shaken (best case, README claim) | https://github.com/Vanilagy/mediabunny , https://mediabunny.dev/guide/introduction |

Mediabunny has a `CanvasSource(canvas, { codec, quality })` and `add(timestamp, duration, { keyFrame })` in **seconds**, returns a promise for backpressure, `keyFrameInterval` default 2 s, `Quality` accepts a qualitative level, a `bitrate`, or a `quantizer`. It "figures out the necessary codec configuration and sets up encoders" itself. ( https://mediabunny.dev/guide/media-sources ). Measured bundle size for our build: **not measured, do it**. Note the hero bundle budget (under 200 kB gzip) applies to `<particle-hero>`, not to this web build; load the export module with a dynamic `import()` so normal visitors never download it.

**Recommendation: Mediabunny.** Do not adopt the deprecated muxers for new code. The MPL-2.0 licence is file-level copyleft and fine for us as long as we do not edit its sources.

#### Codec and container support matrix

| Target | Chrome / Edge | Firefox | Safari |
|---|---|---|---|
| WebCodecs `VideoEncoder` | yes (94+) | desktop 130+ | 26+ full, partial 16.4 to 18.7 |
| MP4 + H.264 (`avc1.*`) via WebCodecs | yes | **UNVERIFIED** (encoder availability depends on platform codec) | yes (expected) |
| WebM + VP9 (`vp09.00.10.08`) via WebCodecs | yes | **UNVERIFIED** | **UNVERIFIED** |
| WebM + AV1 (`av01.0.04M.08`) via WebCodecs | yes (software or HW) | **UNVERIFIED** | **UNVERIFIED** |
| `MediaRecorder` mp4 | recent Chrome: `video/mp4` accepted, **UNVERIFIED** | no (**UNVERIFIED**) | yes, H.264 + AAC since STP 105 / iOS 14.3, "currently supports the MP4 file format" |
| `MediaRecorder` webm | yes | yes | not stated; the WebKit WWDC25 article does not mention WebM |

Sources: https://caniuse.com/webcodecs , https://webkit.org/blog/11353/mediarecorder-api/ , https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-in-safari-26-beta/ (Safari 26 adds `AudioEncoder`/`AudioDecoder` and ALAC/PCM MediaRecorder; nothing new said about video). The WebKit MediaRecorder post is from Nov 2020, so newer behaviour may differ.

`MediaRecorder.isTypeSupported` strings worth probing (from MDN's list, https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static ), in this order:

```
video/mp4;codecs=avc1.640028        // H.264 High L4.0   (UNVERIFIED level suffix for our sizes)
video/mp4
video/webm;codecs=vp9
video/webm;codecs=av01.0.19M.08     // MDN lists av01.0.19M.08 inside mp4; webm AV1 string UNVERIFIED
video/webm;codecs=vp8
video/webm
```

`true` is not a guarantee, "recording can still fail when resources are insufficient" (same MDN page). For WebCodecs, probe with `VideoEncoder.isConfigSupported({codec, width, height, bitrate, framerate})` per candidate, in order `avc1.640028` (1080p), `avc1.640032` (1440p, level 5.0), `avc1.640033` (2160p, level 5.1), then `vp09.00.10.08`, then `av01.0.08M.08`. The AVC level numbers (0x28, 0x32, 0x33) come from the H.264 level tables, **UNVERIFIED here**; Mediabunny can pick them for you.

**Fallback chain:** Mediabunny + WebCodecs MP4/H.264 -> Mediabunny + WebCodecs WebM/VP9 -> `MediaRecorder` best supported type (real time, tell the user it is not frame-exact) -> disable video export and offer stills.

#### Frame-exact deterministic recording

Prerequisite: the engine must render from an explicit time, not from an accumulated `dt`. `LiteEngine` keeps `this.time`; add `renderAt(t)` that sets it, and bypass the smoothing state (`look`, `ptr`, `burstAge`). Then:

```ts
// sketch, UNVERIFIED API details for Mediabunny; check the README at integration time
const out = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
const src = new CanvasSource(exportCanvas, { codec: 'avc', bitrate: BITRATE[res] });
out.addVideoTrack(src); await out.start();
for (let i = 0; i < N; i++) {                     // N = fps * T
  engine.renderAt(i / fps);                       // pure function of time: no dt, no wall clock
  await src.add(i / fps, 1 / fps);                // awaiting = backpressure
  if (i % 8 === 0) await new Promise(r => setTimeout(r)); // let the UI repaint progress
}
await out.finalize(); const blob = new Blob([out.target.buffer], { type: 'video/mp4' });
```

This is the only deterministic option: our scene is a pure function of `(home, light, hash(id), t)`, so frame `i` is reproducible. Progress UI: `i/N`. Cancel flag checked each iteration; `src.close()` and `canvas = null` on cancel to free GPU memory. Running the loop in a worker with an `OffscreenCanvas` is possible (VideoEncoder is available in dedicated workers, MDN above) but optional; main thread is fine for 8 s clips.

Cost estimate (reasoned, not measured): the draw is about the same as one live frame; encode at 1080p H.264 is real-time or faster on hardware encoders; 8 s x 30 fps = 240 frames, so expect seconds to tens of seconds.

#### Bitrate table (recommended)

Baseline: YouTube's recommended SDR upload bitrates ( https://support.google.com/youtube/answer/1722171 ):

| Res | 24/25/30 fps | 48/50/60 fps |
|---|---|---|
| 480p | 2.5 Mbps | 4 Mbps |
| 720p | 5 Mbps | 7.5 Mbps |
| 1080p | 8 Mbps | 12 Mbps |
| 1440p | 16 Mbps | 24 Mbps |
| 2160p | 35 to 45 Mbps | 53 to 68 Mbps |

Particle frames are high-frequency noise (hundreds of thousands of 1 px dots) and compress badly. **My estimate, not from a source: x1.5** over the baseline, H.264 High, CBR-ish (`bitrateMode: 'variable'` with a cap is fine for files).

| Res | Size | 30 fps (recommended) | 60 fps | ~Size for 8 s at 30 fps |
|---|---|---|---|---|
| 480p | 854x480 | 4 Mbps | 6 Mbps | 4 MB |
| 720p | 1280x720 | 8 Mbps | 11 Mbps | 8 MB |
| 1080p | 1920x1080 | 12 Mbps | 18 Mbps | 12 MB |
| 2K | 2560x1440 | 24 Mbps | 36 Mbps | 24 MB |
| 4K | 3840x2160 | 50 Mbps | 80 Mbps | 50 MB |

Use VP9 at about 0.7x these numbers, AV1 at about 0.55x (rule of thumb, **UNVERIFIED**). Default fps 30; offer 60 only up to 1080p. Keyframe interval 2 s (Mediabunny default) so the file seeks and loops cleanly.

### B.3 Seamless loop

The scene is `f(t)` with several periodic terms of **different** periods, so it only loops at a common multiple. Pick a loop length `T` (default 8 s; user choice 4, 6, 8, 10, 12) and force every time term onto integer cycles per `T`.

1. **Quantise angular frequencies.** For each `sin(w * t)` use `w' = 2*pi*round(w*T/(2*pi)) / T`. Applies to the shader terms (`0.9`, `0.7`, `2.4`, `uTime*0.25` flow phase) and the CPU terms (sway `0.23, 0.11, 0.17, 0.09`; float `0.7, 0.37`). Rounding moves each frequency by at most `pi/T` rad/s (0.39 rad/s at T = 8), which is visible only on the slowest terms; keep `round >= 1`.
2. **Quantise each streamer's cycle.** Today `age = fract(uTime/cycle + r1)` with `cycle = (5 + 5*r2)/uSpeed`. That loops only if `T/cycle` is an integer. Replace by `n = max(1.0, floor(T/cycle + 0.5)); age = fract(uTime * n / T + r1)`. With T = 8 and cycle in [5, 10], `n` is 1 or 2, so the speed of each streamer changes by up to about 33 percent at the extremes; use a longer `T` (12 to 16 s) to keep speed variance small (with T = 16, `n` is 2 or 3, error at most about 20 percent). This is the main trade-off. Alternative with no speed error: choose `cycle_i = T / n_i` for `n_i` drawn from `{1, 2}` weighted, i.e. bake the quantisation into the hash instead of rounding, which is the same maths.
3. **Disable non-periodic input** during export: pointer, click burst, drag orbit, wheel dolly; or require `SCAN_RATE * T` to be an integer for scan.
4. **State.** `look`/`sway` smoothing on the CPU is stateful (lerp toward target). Evaluate sway and float as closed-form functions of `t` in export mode and skip the lerp.
5. **Verify** with a test: render at `t = 0` and `t = T`, read both back, require max channel difference of 0 (same code path, so it should be bit-identical). Add as a Playwright script like `scripts/verify-*.mjs`.
6. **Fallback if some term cannot be made periodic: crossfade.** Draw the scene twice at `t` and `t - T` into the same frame with weights `w` and `1 - w` over the last `X` seconds. In our blend, scaling `vCol` by the weight approximates a crossfade (screen blending is approximately additive at low coverage), at 2x draw cost. Ghosting is possible where the two states differ. Prefer step 1 and 2.

Frame count: `N = fps * T` exactly, last frame is `t = (N-1)/fps`, so frame `N` equals frame 0. Do not render frame `N`.

### B.4 GIF

| Item | Fact | Source |
|---|---|---|
| Library | `gifenc` by mattdesl: MIT, 9 KB before gzip, "experimental" badge | https://github.com/mattdesl/gifenc |
| Palette | max 256 colours per frame; no built-in dithering; quantiser suited to "simple flat-style" graphics, not photographs | same |
| Speed (author's claim) | 150 frames of 1024x1024 about 2 s with 4 workers, about 5 s on the main thread | same |
| Transparency | 1-bit only | same |

Particle imagery is gradients on black; 256 colours with no dither will band, and GIF size explodes (a noisy 480p, 15 fps, 8 s clip is easily tens of MB, **estimate**). **Recommendation: do not ship GIF in the first export release.** Offer MP4 (and WebM). If asked for later: cap at 480 px wide, 15 fps, 6 s, one global palette from frame 0 (`quantize` once, `applyPalette` per frame), and add our own Bayer dither (we already have `bayer8`) before palette mapping. Animated WebP cannot be made with `toBlob` (it writes still images only), so it is not an option without extra encoders (**UNVERIFIED**).

### B.5 Recommended approach (one pick)

1. **Stills:** off-screen second `LiteEngine` at the chosen size, `preserveDrawingBuffer: true`, `renderAt(t)` then `toBlob`. PNG default, JPEG 0.92, WebP 0.90. Sizes 480p to 2K; 4K only if `MAX_VIEWPORT_DIMS`, `MAX_RENDERBUFFER_SIZE` and `drawingBufferWidth` all confirm.
2. **Video:** same export engine, **WebCodecs + Mediabunny**, MP4/H.264 first, WebM/VP9 fallback, stepping fixed `dt = 1/fps`; MediaRecorder as a non-exact last resort. 30 fps, bitrates from the table above.
3. **Loop:** 8 s default, all time terms quantised to whole cycles per `T`; automated t=0 versus t=T equality check.
4. **GIF:** not in v1.

### B.6 Open items (not verified; test before relying)

- `gl_PointCoord` origin and flip on all targets (Chrome/ANGLE, Safari/Metal, Firefox).
- `VideoFrame(canvas)` with `preserveDrawingBuffer`, and `toBlob` capture timing.
- Firefox and Safari H.264/VP9/AV1 encoder availability via `isConfigSupported`.
- Safari MediaRecorder codecs after 2020 (the only primary source is the 2020 WebKit post).
- `MediaStreamTrack.requestFrame` details (MDN page returned 404).
- AVC level strings for 1440p and 2160p.
- Mediabunny gzipped size in our bundle and exact API names at the pinned version.
- x1.5 bitrate multiplier and VP9/AV1 ratios (estimates from reasoning).
- Hex-grid snap maths (standard, not cited).
- Maximum canvas area limits per browser for 4K.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
- https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter
- https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
- https://registry.khronos.org/webgl/specs/latest/1.0/
- https://caniuse.com/webcodecs , https://caniuse.com/mediarecorder
- https://webkit.org/blog/11353/mediarecorder-api/ , https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-in-safari-26-beta/
- https://github.com/Vanilagy/mediabunny , https://mediabunny.dev/guide/introduction , https://mediabunny.dev/guide/media-sources
- https://github.com/Vanilagy/mp4-muxer , https://github.com/Vanilagy/webm-muxer
- https://github.com/mattdesl/gifenc
- https://support.google.com/youtube/answer/1722171
- https://en.wikipedia.org/wiki/Ordered_dithering
- https://momentsingraphics.de/BlueNoise.html
- https://developer.apple.com/forums/thread/714831 , https://discourse.threejs.org/t/working-around-the-low-aliased-pointsize-on-the-new-m1-macbook-pros/26819
