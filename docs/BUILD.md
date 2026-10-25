# Particle Depth Studio — Build Documentation

Oct 25, 2026 · @sumi

## 1. Overview and decisions

We are building a web app that turns up to four uploaded photos into a 524,288-particle, depth-driven animation, and the same engine also runs as the header of Sumanth Reddy's portfolio site.

**What it does**

- The user drops up to four pictures. A depth model runs in the browser and estimates a depth map for each.
- Each picture becomes 524,288 particles (1024 × 512) coloured from the photo and placed in 3D using the depth map.
- Sliders and toggles control drift, splash, gather, depth, trails, scan, tracker markers, links, light colour and more.
- The cursor pushes particles apart; trails and streaks fly off in a direction the user sets.

**Credit and branding.** The app credit reads **by Sumanth Reddy** wherever the reference says "BY DAO". Do not copy the reference's DAO logo, its 聚 mark, or the name GATHER. Working title: **Particle Depth Studio** (rename freely). Third-party licence notices stay (section 12).

**Framework decision.** Build with **Vite + TypeScript + Three.js (WebGL2)**, a vanilla-TypeScript UI, and no React in the core.

| Option | Verdict | Why |
| --- | --- | --- |
| Vite + TypeScript + Three.js, GPU simulation in textures | **Chosen** | 524k particles need the GPU to simulate and draw them. Small build, easy to embed in any site. |
| Next.js / React for the core | No | The engine is a canvas; React adds nothing and complicates embedding in a non-React portfolio. A thin React wrapper is provided instead. |
| p5.js, tsParticles, PixiJS | No | CPU-bound or 2D. They stall well below 500k particles. |
| WebGPU only | Later | Not on every browser yet. WebGL2 covers far more devices. WebGPU is used only to speed up depth inference where present. |
| Unity WebGL | No | Multi-megabyte builds, wrong weight for a page header. |

**Design rules that follow from this**

1. The engine (`core/`) knows nothing about the UI. The studio app and the portfolio hero are two thin front ends on the same engine.
2. Depth is computed in the browser for the studio, and **baked offline** for the hero, so the portfolio loads instantly with no model download.
3. Every control is a field in one serialisable state object, so presets, the hero config and the UI stay in sync.

## 2. Reference analysis (from your screenshots)

The reference is one full-screen black stage with a particle image at the centre and every control placed at the screen edges. Behaviour marked *inferred* is read from labels and pixels; confirm it against the live site before treating it as fixed.

**Layout map**

| Region | What the screenshots show |
| --- | --- |
| Top-left | Wide-tracked title, then three small lines: `DEPTH MODEL · FASTDEPTH`, `524,288 POINTS`, `BY DAO`. |
| Top-right | Three icon buttons stacked: brand glyph, a yin-yang icon (inferred: light/dark or ON WHITE toggle), a fullscreen icon. `CREDITS` link below. |
| Left edge | Vertical thumbnail strip: numbered image slots (1, 2) plus a `+` slot. The active slot has a white border. |
| Bottom-left | `▶ NEXT  SPACE`, `● LIGHT  S`, `ADD PICTURES`. The key hints are the Space bar and the S key. |
| Bottom-centre | Row 1: four sliders `DRIFT`, `SPLASH`, `GATHER`, `DEPTH`. Row 2: toggles `DRAW TRACK LINKS SCAN TRAILS MARKS`, then `TRACKERS` with `SPARSE / DENSE`. Active items are white and underlined. |
| Bottom-right of centre | A small square box labelled `LINE` holding a diagonal line with two handles (inferred: sets the direction and length of the streaks). |
| Bottom-right | Logo, then `TRAVEL: SWARM / MELT`, `ON WHITE: NEGATIVE / TRUE`, and `LIGHT:` six colour swatches (cream, ice blue, orange, red, green, violet) plus a dotted circle. |
| Stage frame | Faint crosshair corners, tick-mark rulers along the top and sides, and a centred readout `02 / 02  3B4E83186AA6E41A83DDEE` (image index and a hash of the image). |

**What the stage shows**

- The photo is made only of particles, in a stipple (random dot) pattern, not a pixel grid. The background is empty black, so the subject is cut out.
- Long thin streaks fly off the subject to the right. They fade from pink-white to nothing. Curved arcs wrap the figure.
- **Tracker overlays** (`MARKS`/`TRACK` on): small corner brackets sit on points of the image with a monospace label like `04 +0.57 +0.19 +0.03` (index, then x, y, z).
- **Cursor effect** (third screenshot): where the cursor sits, the face breaks into a bright white cloud and the particles are pushed apart.

**Control behaviour (inferred unless noted)**

| Control | Behaviour to build |
| --- | --- |
| DRIFT | Strength of the slow noise flow that moves particles around their home position. |
| SPLASH | Size of the burst when the cursor moves fast or the user clicks. |
| GATHER | Strength of the pull back to home; low values leave particles scattered, high values snap them back. |
| DEPTH | How far the depth map pushes particles in z; also the amount of 3D parallax when the view tilts. |
| DRAW | The user paints strokes on the stage; strokes become a flow field that steers particles. |
| TRACK | Cursor tracking: particles react to the pointer and tracker boxes follow it. |
| LINKS | Thin lines connect nearby tracker points. |
| SCAN | A sweep line crosses the image and lights up or releases particles as it passes. |
| TRAILS | Particles leave fading streaks behind them. |
| MARKS | Shows the bracketed tracker labels. |
| TRACKERS SPARSE / DENSE | Number of tracker boxes shown (few vs many). |
| LINE widget | Direction and length of the global streak or wind. |
| TRAVEL SWARM / MELT | Motion style of loose particles: SWARM drifts in flowing clusters, MELT sags downward and slows. |
| ON WHITE | Render on a white background with dark particles. |
| NEGATIVE / TRUE | NEGATIVE inverts particle colours; TRUE keeps the photo's colours. |
| LIGHT swatches | Tint of the glow, streaks and highlights. |
| NEXT (Space) | Morph the particles into the next uploaded image. |
| LIGHT (S) | Turn the light tint on or off. |
| Fullscreen | Standard fullscreen toggle. |

## 3. Architecture and data flow

&#91;embedded content: data flow · 4 load-time steps, 3 per-frame steps\]

Loading happens once per image: depth is estimated, refined and turned into two textures. The per-frame loop only reads those textures plus the live inputs. For the portfolio hero, the depth steps are done ahead of time by the Export button (section 10).

**Textures held on the GPU**

| Texture | Format | Size | Holds |
| --- | --- | --- | --- |
| `tHome`, `tHomeNext` | RGBA32F | 1024 × 512 | Target position of each particle for the current and next image (x, y, z from depth, 1). |
| `tColor`, `tColorNext` | RGBA8 | 1024 × 512 | Photo colour at each sample. |
| `tPos` | RGBA32F ping-pong | 1024 × 512 | Current position and age. |
| `tVel` | RGBA32F ping-pong | 1024 × 512 | Current velocity and a per-particle seed. |
| `tFlow` | RG16F | 256 × 256 | Painted direction strokes; decays each frame. |
| `tTrail` | RGBA8 | half screen size | Fading streak accumulation. |

524,288 points = 1024 × 512 texels, one texel per particle. Smaller counts use 512 × 256 (131,072) or 512 × 512 (262,144); a 1,048,576 option uses 1024 × 1024 on strong GPUs only.

## 4. Tech stack and installs

Everything runs in the browser; the only tool to install on the machine is Node.js.

**Machine requirements**

- Node.js 20 LTS or newer, and npm
- Chrome or Edge for development (best WebGPU and DevTools support); test Safari 16.4+ and Firefox before release
- A GPU with WebGL2 and float-texture rendering (`EXT_color_buffer_float`); almost every desktop and recent phone has it

**Packages**

| Package | Role | Required |
| --- | --- | --- |
| `vite`, `typescript` | Build tool and language | Yes |
| `three`, `@types/three` | WebGL2 renderer and the GPU-compute helper (`GPUComputationRenderer`) | Yes |
| `vite-plugin-glsl` | Import `.glsl` shader files as strings | Yes |
| `@huggingface/transformers` | Runs the depth model in the browser (`depth-estimation` pipeline; WebGPU with a WASM fallback) | Yes, studio only |
| `onnxruntime-web` | Direct ONNX runtime, used for the optional FastDepth model | Optional |
| `vitest`, `playwright` | Unit tests and screenshot tests | Recommended |

Install commands:

```bash
npm create vite@latest particle-depth-studio -- --template vanilla-ts
cd particle-depth-studio
npm i three @huggingface/transformers
npm i -D @types/three vite-plugin-glsl vitest playwright
# optional, only if adding FastDepth:
npm i onnxruntime-web
```

The agent installs the latest stable versions and the lockfile records them; do not hand-pin versions from this document.

**Depth models**

| Model | Use | Notes |
| --- | --- | --- |
| Depth Anything V2 Small, Transformers.js build [`onnx-community/depth-anything-v2-small`](https://huggingface.co/onnx-community/depth-anything-v2-small) | **Default.** Best depth quality for the size. | The repo ships fp32 (`onnx/model.onnx`) and quantised (`onnx/model_int8.onnx`) files. Use the int8 file first; it downloads faster. Downloaded once, then cached by the browser. Apache-2.0. |
| FastDepth (MIT) | Optional fast mode, which the reference uses as its primary model. | Low-resolution output (about 224 × 224), so it needs the guided upsample in section 8. No ready browser build is assumed here; the agent exports the PyTorch model to ONNX itself, or skips this and ships Depth Anything only. |

Loading pattern (studio):

```ts
import { pipeline } from '@huggingface/transformers';
const depth = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
  device: 'webgpu',   // falls back to 'wasm' when WebGPU is missing
  dtype: 'q8',        // quantised weights
});
const { depth: map } = await depth(imageUrlOrBitmap); // map = a grayscale image, near = bright
```

**Fonts.** Geist for UI text and Geist Mono for readouts (web-studio; master-studio still uses Manrope + JetBrains Mono), both free under the SIL Open Font License. Self-host them; do not link Google Fonts at runtime, so the hero loads fast and offline-safe.

## 5. Project structure

One repository, two entry points. The agent must keep `core/` free of any DOM-UI code so the hero build stays small.

```text
particle-depth-studio/
  index.html                 studio app page
  hero.html                  demo page that shows the hero embed
  vite.config.ts             app build + library build (hero)
  public/
    fonts/                   self-hosted Geist, Geist Mono
    samples/                 3 sample photos + baked depth PNGs
  src/
    main.ts                  studio entry: UI + engine
    hero.ts                  library entry: engine only, plus <particle-hero> element
    core/
      Engine.ts              public class: init, load, update, dispose
      Simulation.ts          GPU compute: position + velocity textures
      ParticleRenderer.ts    draws points, streak lines, trails, tracker overlay data
      Sampler.ts             picks 524,288 sample points from the image
      FlowField.ts           painted direction strokes -> flow texture
      Morph.ts               image-to-image transition
      Camera.ts              tilt, parallax, pointer mapping
      params.ts              the one state object + defaults + presets
    depth/
      DepthEstimator.ts      model loading, inference, caching
      depth.worker.ts        runs inference off the main thread
      refine.ts              guided upsample + edge-aware smoothing
      bake.ts                exports image + depth PNG for the hero
    shaders/
      sim_position.glsl      sim_velocity.glsl
      particle.vert.glsl     particle.frag.glsl
      streak.vert.glsl       streak.frag.glsl
      trail_fade.frag.glsl   composite.frag.glsl
    ui/
      Panel.ts Slider.ts Toggle.ts LineWidget.ts
      Thumbs.ts Hud.ts Frame.ts Dropzone.ts
      tokens.css panel.css
    utils/
      device.ts              GPU tier detection, adaptive quality
      hash.ts                SHA-256 of the image for the frame readout
      keys.ts                Space and S shortcuts
  tests/
    sampler.test.ts  params.test.ts  visual.spec.ts
  README.md
```

Rules for the agent:

1. `core/` imports only `three`, its own shaders and `params.ts`. No `document.querySelector` there.
2. `hero.ts` must not import anything from `ui/` or `depth/DepthEstimator.ts`.
3. Shaders live in `.glsl` files, never as long strings inside TypeScript.

## 6. Design system

The look is near-black, hairline, uppercase, wide-tracked and tiny; the image is the only colour on screen. Only the background `#050506` is confirmed from the reference. The other values below are estimated from the screenshots, so tune them by eye against the originals.

```css
:root {
  --bg: #050506;
  --ink: #f4f4f2;                 /* active text */
  --ink-dim: rgba(244,244,242,.45); /* inactive labels */
  --ink-faint: rgba(244,244,242,.18); /* hairlines, ticks, grid */
  --light-cream: #f2e6c9;  --light-ice: #bfe0ff;  --light-orange: #ff9a3c;
  --light-red: #ff4a3d;    --light-green: #3fe0b0; --light-violet: #8e6bff;
  --font-ui: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;
  --label-size: 9.5px;  --label-track: .22em;  /* uppercase everywhere */
  --edge: 28px;         /* distance of UI from the screen edge */
  --ease: cubic-bezier(.2,.7,.2,1);  --t: 220ms;
}
```

**Components**

| Part | Spec |
| --- | --- |
| Title | `PARTICLE DEPTH STUDIO` (or your name), 12px, tracking .5em, weight 500. Three sub-lines at 8.5px in `--ink-dim`: depth model name, live particle count, `BY SUMANTH REDDY`. |
| Toggle | Text only. Inactive `--ink-dim`; active `--ink` with a 1px underline, 4px below the text. Hover raises to `--ink`. |
| Slider | 64px hairline track in `--ink-faint`, 7px white round knob, label above-left. Keyboard-focusable; arrow keys move 0.02. No numeric box. |
| Segmented pair | Two words (`SPARSE / DENSE`, `SWARM / MELT`) with the same underline rule. |
| Light swatches | 12px circles; the active one has a 1px ring 3px outside. A dotted circle means light off. |
| Thumbnails | 40px squares, 1px border `--ink-faint`; the active one is `--ink`. Number beside each. A `+` slot while fewer than 4 images. |
| LINE widget | 36px square box, 1px border, a line with two 4px handles. Drag a handle to set angle and length. |
| Stage frame | SVG overlay: four crosshair corners, tick marks every 8px along the top and sides, a faint centre grid, and the readout `NN / NN  <first 22 hex of the image hash>` centred at the top in the mono font. |
| Tracker | 14px corner brackets in `--ink`, label in mono 9px: `ID  +x  +y  +z`. |
| Dropzone | Before any image: centred text `DROP UP TO FOUR PICTURES`, dashed hairline border, a single `ADD PICTURES` toggle. |

**Behaviour**

- UI fades to 25% opacity after 3 s without pointer movement and returns on movement (hero mode has no UI at all).
- Motion: UI changes use `--t` and `--ease`; nothing bounces.
- Responsive: below 720px width the bottom rows stack into two lines and the thumbnail strip moves to the top-left under the title.
- Respect `prefers-reduced-motion` (section 10).

The app credit is `BY SUMANTH REDDY`. No DAO mark, no brand glyph from the reference.

## 7. Controls, state and shortcuts

Every control is one field of a single state object. The UI writes it, the engine reads it each frame, and the hero is configured with the same shape. Defaults are starting points; tune against the reference.

```ts
// src/core/params.ts
export interface Params {
  // sliders, all 0..1
  drift: number;   // default 0.8   noise flow around home
  splash: number;  // default 0.6   burst on fast pointer / click
  gather: number;  // default 0.8   spring back to home
  depth: number;   // default 0.8   z displacement + parallax

  // toggles
  draw: boolean;    // paint flow strokes
  track: boolean;   // pointer repel + tracker follow  (default true)
  links: boolean;   // lines between trackers
  scan: boolean;    // sweep line
  trails: boolean;  // fading streaks               (default true)
  marks: boolean;   // bracket labels               (default true)

  trackers: 'sparse' | 'dense';      // 12 vs 40 boxes
  travel: 'swarm' | 'melt';
  background: 'dark' | 'white';      // ON WHITE
  colorMode: 'true' | 'negative';
  light: 'cream' | 'ice' | 'orange' | 'red' | 'green' | 'violet' | 'off';
  lightOn: boolean;                  // S key

  line: { angle: number; length: number }; // LINE widget, radians, 0..1
  lineMode: 'streak' | 'dot';        // dot vs line rendering
  pointCount: 131072 | 262144 | 524288 | 1048576;
  quality: 'auto' | 'low' | 'high';
}
```

**Rules**

- `params.ts` exports `defaults`, a `serialize()` / `parse()` pair, and three named presets (`calm`, `storm`, `scan`).
- State persists in `localStorage` (try/catch every access) and in the URL hash for sharing a look.
- Changing `pointCount` rebuilds textures; every other change takes effect on the next frame with no rebuild.

**Keyboard and pointer**

| Input | Action |
| --- | --- |
| Space | Next image (morph) |
| S | Light on/off |
| F | Fullscreen |
| H | Hide or show the UI |
| 1–4 | Jump to image 1–4 |
| Pointer move | Repels particles (TRACK) and tilts the 3D view slightly |
| Pointer drag | With DRAW on, paints a flow stroke; otherwise orbits the 3D view |
| Click | Splash burst at the pointer |
| Wheel | Zoom (clamped) |
| Touch | One finger = pointer; two fingers = orbit and zoom |

## 8. Core algorithms and shaders

This section is the heart of the build. The agent implements each part as a separate module and tests it alone before wiring it in.

### 8.1 Cut-out (foreground mask)

The reference shows the subject on empty black. Mask priority: (1) the image's own alpha channel; (2) a depth threshold chosen with Otsu's method on the depth histogram, exposed as a `cutout` slider; (3) optional model-based background removal, added only if (2) is not good enough. Feather the mask edge by 1–2 px so the particle edge is soft.

### 8.2 Depth refinement (quality-critical)

A raw depth map is blurry and noisy, which makes faces look melted for the wrong reasons.

1. Normalise: clip to the 2nd–98th percentile, rescale to 0..1, near = 1.
2. Upsample the depth map to the colour image's size (max 2048 on the long edge).
3. Apply an edge-aware **guided filter** (radius 8, eps 1e-3) with the photo's luminance as the guide, so depth edges snap to the subject's real edges.
4. 3×3 median to remove speckle, then store as an 8-bit PNG (16-bit if the browser allows).

### 8.3 Sampling: 524,288 stipple points

Sampling by importance gives the random-dot look, with more dots on detail and fewer on flat areas.

```ts
// weight per pixel: mask * (0.35 + 0.65 * saliency), saliency = normalised gradient + saturation
const cdf = buildCDF(weights);            // Float32Array, length W*H
for (let i = 0; i < N; i++) {
  const u = r2(i);                         // low-discrepancy sequence, not Math.random()
  const px = lowerBound(cdf, u * cdf.at(-1));
  const x = (px % W) + jitter1(i), y = ((px / W) | 0) + jitter2(i);   // sub-pixel jitter
  home[i] = [ (x / W - .5) * aspect, (.5 - y / H), (depthAt(x, y) - .5) ];   // z from depth
  color[i] = bilinearSample(photo, x, y);
}
```

Store `home` in an `RGBA32F` texture of 1024 × (N / 1024) and `color` in an `RGBA8` texture of the same size. Run the sampler in a worker so the page does not freeze for large images.

### 8.4 Simulation (GPU, ping-pong)

Use three's `GPUComputationRenderer` with two variables, `tPos` (xyz + age) and `tVel` (xyz + seed), in `FloatType` (fall back to `HalfFloatType` if float rendering is missing). Velocity shader outline:

```glsl
// sim_velocity.glsl  (resolution comes from GPUComputationRenderer)
uniform sampler2D tHome, tHomeNext, tFlow;
uniform float uTime, uDt, uDrift, uSplash, uGather, uDepth, uMorph, uMelt;
uniform vec3  uPointer, uPointerVel;  uniform float uRadius;
uniform vec2  uLine;                         // LINE widget as a vector
void main() {
  vec2 uv  = gl_FragCoord.xy / resolution.xy;
  vec3 p   = texture2D(tPos, uv).xyz;
  vec4 vs  = texture2D(tVel, uv);  vec3 v = vs.xyz;  float seed = vs.w;
  vec3 home = mix(texture2D(tHome, uv).xyz, texture2D(tHomeNext, uv).xyz, smoothstep(0., 1., uMorph + (seed - .5) * .4));
  home.z *= uDepth * 2.0;

  vec3 F  = (home - p) * mix(.4, 7., uGather);                 // GATHER: spring to home
  F      += curlNoise(p * 1.4 + uTime * .08) * uDrift * .7;    // DRIFT: noise flow
  vec2 fl = texture2D(tFlow, p.xy * .5 + .5).xy;                // DRAW strokes
  F.xy   += (fl + uLine) * (.4 + uDrift);                        // LINE direction
  vec3 d  = p - uPointer;  float r = length(d.xy);
  float k = smoothstep(uRadius, 0., r);                          // TRACK: repel near cursor
  F      += normalize(d + 1e-4) * k * (1.5 + uSplash * 8. * length(uPointerVel));
  F.y    -= uMelt * .9 * (1. - uGather);                         // TRAVEL: melt sags down

  v = v * exp(-1.8 * uDt) + F * uDt;                             // damping + integrate
  gl_FragColor = vec4(v, seed);
}
// sim_position.glsl:  gl_FragColor = vec4(p + v * uDt, age);
```

The agent writes `curlNoise(vec3)` as the curl of a 3D simplex-noise gradient (finite differences) in a shared GLSL include. Clamp `uDt` to 1/30 s so a slow frame does not explode the simulation.

### 8.5 Drawing the particles

- One `THREE.Points` with a `BufferGeometry` that holds only a `ref` attribute (the texel `uv` of each particle). The vertex shader reads `tPos` and `tColor` from textures; there are no per-frame CPU uploads.
- `gl_PointSize = max(1.0, uSize * uDpr * (1.0 + z))`; additive blending; `depthWrite = false`. Round soft sprite in the fragment shader.
- Colour: photo colour, brightened by speed (`+ speed * uLightColor`) so fast particles glow in the light colour. NEGATIVE inverts the colour; ON WHITE switches to normal blending with a dark colour on a white background.
- **Streaks:** a second `THREE.LineSegments` with 2 vertices per particle for a quarter of the particles. Vertex 0 sits at the position, vertex 1 at `position - velocity * streakLength`; the alpha fades along the segment. Skip slow particles in the fragment shader.
- **Trails:** render the scene into a half-resolution render target that is multiplied by 0.94 each frame (a full-screen quad with `rgba(0,0,0,.06)`), then composite it over the live frame. TRAILS off clears the target.
- Add a cheap bloom (a 5-tap blur of the bright parts) only if the particle look is flat; default off in hero mode.
- Add 1/255 ordered dither to the final composite to stop banding in dark gradients.

### 8.6 Trackers (MARKS, TRACK, LINKS)

- At load, pick K indices (12 sparse, 40 dense) from high-saliency samples, well spread apart.
- Each frame, render those K texels into a K × 1 render target and read it back; use `readRenderTargetPixelsAsync` when available, else the synchronous read of a 40-pixel target, which is cheap.
- HUD: project the 3D position to screen, draw bracket corners and the label `NN +x.xx +y.xx +z.xx` in a 2D canvas or absolutely positioned elements. LINKS draws thin lines between trackers closer than a threshold.

### 8.7 Scan

A phase `uScan` runs 0 → 1 along the LINE direction. Particles within a thin band of the scan line get a brightness boost and a short push in z; a one-pixel line is drawn across the stage. Speed and width are fixed constants first; expose them later if wanted.

### 8.8 Morph between images (NEXT)

Both images are sampled to the same N points, so morphing is just blending `tHome` into `tHomeNext`. Tween `uMorph` over 1.6 s; the per-particle offset in the velocity shader makes it ripple. After it completes, swap the textures and reset `uMorph`.

### 8.9 Frame readout

`NN / TT  <hash>`: SHA-256 of the image bytes using `crypto.subtle.digest`, shown as the first 22 hex characters in upper case.

## 9. Build phases

The agent builds in this order and stops at each "Done when" to show a screenshot before moving on. A phase is not finished until its check passes in the browser, not just in the code.

| # | Phase | Tasks | Done when |
| --- | --- | --- | --- |
| 0 | Scaffold | Create the Vite + TypeScript project; install packages (section 4); add self-hosted fonts, `tokens.css`, the empty `core/` and `ui/` folders, ESLint and Vitest. | `npm run dev` shows a black page with the title in the right font. |
| 1 | Upload | Dropzone and picker for up to 4 JPG/PNG/WebP files; resize to 2048 on the long edge; thumbnail strip; the frame readout with the image hash. | Dropping 4 images fills the strip; the hash changes per image. |
| 2 | Depth | Load the depth model in a worker, show progress, run it, refine (8.2), show a depth preview toggle. Cache the model. | A portrait gives a clean depth map; edges follow the subject; second run is fast. |
| 3 | Sampling | Implement the cut-out (8.1) and sampler (8.3) with tests: count is exactly N, points stay inside the mask, density follows detail. | Unit tests pass; a plain 2D point plot of the samples looks like the photo. |
| 4 | Static render | Three.js scene, `Points` fed from textures, additive blending, DPR handling, resize. No simulation yet. | The photo appears as a sharp stipple image at 524,288 points on a retina screen. |
| 5 | Simulation | `GPUComputationRenderer`, velocity and position shaders (8.4): spring, drift, damping. | Particles settle on the image; raising DRIFT makes them breathe without losing the picture. |
| 6 | 3D view | Camera tilt and orbit, DEPTH slider, parallax from pointer. | Dragging rotates the image as a relief; DEPTH 0 flattens it. |
| 7 | Cursor | TRACK repel and SPLASH burst, with a pointer velocity estimate. | The cursor tears a hole that heals; a fast swipe makes a bigger burst (matches screenshot 3). |
| 8 | Streaks and trails | Streak line segments, the half-resolution trail target, the LINE widget, TRAILS toggle. | Long pink-white streaks leave the subject in the LINE direction and fade out. |
| 9 | Draw | Paint strokes into the flow texture; strokes decay over time; DRAW toggle. | A brushed stroke bends nearby particles along it. |
| 10 | Scan | Scan sweep with the glow band and line. | A bright band crosses the image in a few seconds and loops. |
| 11 | Trackers | Pick tracker points, readback, HUD brackets and labels, MARKS, LINKS, TRACKERS sparse/dense. | Labels follow their points and stay readable at 60 fps. |
| 12 | Look and modes | LIGHT swatches and S key, NEGATIVE/TRUE, ON WHITE, SWARM/MELT, dot vs line style, stage frame with ticks. | Each toggle visibly changes the picture and matches the reference mood. |
| 13 | Multi-image | NEXT with the ripple morph, thumbnails to jump, keyboard shortcuts. | Space morphs between images with no pop or gap. |
| 14 | Panel polish | Full panel styling from section 6, auto-fade, responsive layout, fullscreen, presets, URL-hash state. | Panel matches the screenshots; usable on a phone width. |
| 15 | Quality and speed | Adaptive point count, frame-time monitor, context-loss handling, memory clean-up (`dispose`). | 60 fps at 524k on a mid laptop; no memory growth over 5 minutes. |
| 16 | Hero export | `bake.ts` and the Export button; `hero.ts` library build; `<particle-hero>` element; demo page. | The demo page shows the effect with no depth model download (section 10). |
| 17 | Ship | README, tests, build, deploy (section 12). | A public URL works on desktop and a mid-range phone. |

**Agent working rules**

1. After each phase, run the app in a real browser with Playwright, take a screenshot and compare it with the reference screenshots; describe differences before continuing.
2. Commit after every phase with a message of the form `phase N: <what works>`.
3. If a feature cannot be built as described, write the deviation into `README.md` under "Deviations" instead of silently dropping it.
4. Never block the main thread for more than 50 ms: the depth model and the sampler run in workers.
5. No network calls at runtime except downloading the depth model (studio) and the hero's own two image files.

## 10. Using it as the portfolio header

The portfolio uses the same engine without the UI and without the depth model: the studio exports a small package of four files, and the hero loads only those. The portfolio's framework is not known, so the hero is a plain ES module plus a web component, which work in any stack.

**Step 1: bake in the studio.** An **EXPORT FOR HERO** button writes four files:

| File | Contents | Target size |
| --- | --- | --- |
| `subject.webp` | The cut-out colour image, up to 2048 px on the long edge | ≤ 250 KB |
| `subject-depth.png` | The refined depth map from 8.2 | ≤ 150 KB |
| `hero.json` | A snapshot of `Params` plus the focal point | < 2 KB |
| `poster.webp` | One rendered frame of the effect, for the instant first paint | ≤ 120 KB |

**Step 2: use it.**

```ts
import { createHero } from './particle-hero/hero.js';

const hero = createHero(document.querySelector('#hero'), {
  image: '/hero/subject.webp',
  depth: '/hero/subject-depth.png',
  config: '/hero/hero.json',        // or pass params inline
  poster: '/hero/poster.webp',
  alt: 'Sumanth Reddy',             // for screen readers
  pointer: 'window',                // react to the cursor anywhere on the page
  pointCount: 'auto',               // 131k phone, 262k laptop, 524k desktop GPU
  transparent: true,                // page background shows through; text can sit on top
  pauseOffscreen: true,
  scrollLink: true,                 // particles loosen as the header scrolls away
});
hero.setParams({ gather: 0.5 });    // any field from section 7
hero.destroy();                     // removes canvas, listeners, GPU memory
```

As a web component: `<particle-hero src="/hero/subject.webp" depth="/hero/subject-depth.png" config="/hero/hero.json" poster="/hero/poster.webp"></particle-hero>`.

React or Next.js wrapper (about 20 lines, supplied in `hero-react.tsx`): create the hero inside `useEffect`, destroy it on cleanup, and in Next.js load the component with `dynamic(() => import(...), { ssr: false })`.

**Hero rules the agent must implement**

1. **Fast first paint.** Show `poster.webp` immediately in the header; start the engine after the page is idle (`requestIdleCallback`, with a timeout fallback), then cross-fade from poster to canvas.
2. **Text stays usable.** The canvas has `pointer-events: none` and `aria-hidden="true"`; pointer position is read from `window`, so header links and buttons still work.
3. **Pause when not needed.** Stop the render loop when the header is off-screen (IntersectionObserver) or the tab is hidden.
4. **Adaptive quality.** If the average frame time stays above 20 ms for 2 s, halve the point count and rebuild once; never go below 65,536. Cap the pixel ratio at 2 on desktop and 1.5 on phones.
5. **Reduced motion.** With `prefers-reduced-motion: reduce`, show only the poster, or run with drift at 0.15 and no streaks.
6. **Theme.** Expose `setParams({ background: 'dark' | 'white' })` so the portfolio's light/dark switch can drive it.
7. **Resize.** A `ResizeObserver` refits the canvas; the subject is framed with `object-fit: cover` logic around the focal point from `hero.json`.
8. **Failure is silent.** If WebGL2 or float textures are missing, or the context is lost twice, keep showing the poster and log one console warning.
9. **Size budget.** The hero build is lazy-loaded and should be about 200 KB gzip or less including tree-shaken three. If it is larger, the agent first removes unused three imports; only then does it propose swapping the renderer for the smaller `ogl` library behind the same `core/` interface.

**Build commands**

- `npm run build` builds the studio app.
- `npm run build:hero` runs `vite build --mode hero` in library mode (`build.lib.entry = 'src/hero.ts'`, `formats: ['es']`) and writes `dist-hero/hero.js`.
- To use it in the portfolio: copy `dist-hero/` to the portfolio's `public/particle-hero/` and the four baked files to `public/hero/`.

## 11. Quality, performance and testing

The quality bar is the reference screenshots: crisp, stippled, high-contrast particles with fine streaks and no visible banding or blur. Targets below are starting budgets; measure on real hardware and adjust.

**Image quality rules**

- Render at the device pixel ratio (cap 2). Point sprites are 1–1.5 CSS px; never let them go blurry by scaling the canvas with CSS.
- Sample colours from the full-size photo (up to 2048 px), not the depth model's input size.
- Work in linear colour for blending and convert to sRGB once at the end (`renderer.outputColorSpace = SRGBColorSpace`).
- Use the guided depth refinement (8.2); raw model output is the main cause of mushy faces.
- Keep dither in the final pass; check dark gradients at 100% zoom.

**Performance budget**

| Metric | Target |
| --- | --- |
| Frame rate, studio, 524,288 points, mid-range laptop GPU | 60 fps |
| Frame rate, hero, phone | 45 fps or better at the auto-chosen point count |
| Depth inference per image | under 3 s with WebGPU, under 10 s on WASM |
| Sampling 524,288 points | under 1.5 s, in a worker |
| Main-thread blocking | no task over 50 ms after first paint |
| Hero first paint (poster) | within the page's normal LCP; engine adds nothing before idle |
| GPU memory | no growth over a 5-minute run |

**Test checklist**

- [ ] Sampler returns exactly N points, all inside the mask, deterministic for a given seed
- [ ] Params serialise and parse without loss; unknown fields are ignored
- [ ] Depth map of a portrait has the face nearer than the wall behind it
- [ ] Each slider and toggle changes the render (Playwright screenshot diff)
- [ ] Cursor hole opens and heals; no particles stay stuck
- [ ] NEXT morph works for 2, 3 and 4 images and wraps round
- [ ] Dropping a transparent PNG, a JPG with no alpha and a very large 8000 px photo all work
- [ ] Tab hidden and shown again: no jump, no time explosion
- [ ] WebGL context loss and restore recovers
- [ ] Hero: poster shows first, canvas fades in, header links stay clickable
- [ ] Hero: reduced-motion and no-WebGL2 paths show the poster only
- [ ] Safari, Firefox, Chrome on desktop; Chrome on Android; Safari on iPhone
- [ ] Lighthouse on the portfolio page does not drop after adding the hero

## 12. Deployment and licensing

**Deploy**

- The studio is a static site: `npm run build` produces `dist/`, which any static host serves (Vercel, Netlify, Cloudflare Pages).
- The depth model downloads from Hugging Face on first use and is cached by the browser, so the host stores no model file.
- Multi-threaded WASM needs cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`). It is optional: without it inference runs single-threaded, and WebGPU does not need it. If you add the headers, check that fonts and images still load.
- The hero ships as plain static files inside the portfolio; it needs no headers and no server.

**Licences**

| Component | Licence | What to do |
| --- | --- | --- |
| three.js, onnxruntime-web | MIT | Keep notices in `THIRD_PARTY_NOTICES.md`. |
| Transformers.js | Apache-2.0 | Keep the notice. |
| Depth Anything V2 **Small** | Apache-2.0 | Keep the notice. The Base, Large and Giant models carry different, non-commercial terms; check before swapping any of them in. |
| FastDepth | MIT | Keep the notice if used. |
| Geist, Geist Mono | SIL OFL 1.1 | Keep the licence file with the fonts. |

- Add a `CREDITS` link in the studio that opens a panel listing these notices, as the reference does.
- The reference site asks that work made with its tool credit its author. This build is an independent implementation of the same kind of idea: do not copy the reference's code, images, name, logo or DAO mark, and check the reference's own terms if you want to go closer than the behaviour and layout described here. The credit line in your app is `BY SUMANTH REDDY`.

**Sources:** [reference site](https://gather.be-of-dao.com/) (read as rendered text only, plus your three screenshots) · [Depth Anything V2 Small, ONNX build](https://huggingface.co/onnx-community/depth-anything-v2-small) · [Transformers.js depth-estimation pipeline](https://app.unpkg.com/@huggingface/transformers@4.2.0/files/src/pipelines/depth-estimation.js). Licence terms of the other packages are stated from general knowledge; the agent verifies each in the package's own `LICENSE` file when installing.

## 13. Prompts for Antigravity

**Before you start:** export this document as Markdown and save it in the new project as `docs/BUILD.md`. Save your three screenshots as `docs/reference/ref-1.png`, `ref-2.png` and `ref-3.png`. The agent should read both before writing any code.

**Master prompt (paste first)**

```text
You are building "Particle Depth Studio", a web app by Sumanth Reddy.
Read docs/BUILD.md completely and look at docs/reference/ref-1.png, ref-2.png, ref-3.png before doing anything.

Goal: upload up to 4 photos, estimate depth in the browser, turn each into 524,288 GPU-simulated particles,
and reproduce the look and controls shown in the reference screenshots. The same engine must also ship as a
UI-free hero embed for a portfolio website header.

Rules:
- Follow the stack, file structure, state shape and shader outlines in BUILD.md. Do not change the framework.
- Work phase by phase using section 9. After each phase: run the app in a real browser with Playwright,
  take a screenshot, compare it to the reference, write 3 lines on what differs, then commit as "phase N: ...".
- Stop and ask me only if a phase cannot be completed as written. Otherwise decide, and record the decision
  in README.md under "Deviations".
- Keep core/ free of UI code. Keep heavy work (depth model, sampling) in workers.
- Do not copy any code, images, names or logos from the reference website. Credit line is "BY SUMANTH REDDY".
- Visual quality is the priority: sharp points at device pixel ratio, dithered output, refined depth.

Start with phase 0 and 1 only, then show me the result.
```

**Per-phase prompt (paste after each approval)**

```text
Continue with phase <N> from section 9 of docs/BUILD.md.
Implement exactly its tasks, make its "Done when" check pass in the browser, add tests where the doc lists them,
send me a screenshot, list any deviation, and stop.
```

**Fix prompts (use when something looks off)**

```text
The render does not match docs/reference/ref-<n>.png. Differences I see: <describe>.
Find the cause in the relevant section of BUILD.md (8.x), fix it, and show a before and after screenshot.
```

```text
Performance is below the budget in section 11 on <device>. Profile one frame, report the three most expensive
steps with numbers, fix the biggest one, and re-measure.
```

**Hero prompt (phase 16)**

```text
Implement phase 16 and section 10. Build src/hero.ts and the <particle-hero> element, the EXPORT FOR HERO button,
and a demo page hero.html that loads only the four baked files. Prove the demo page never downloads the depth
model (show the network log) and that header links stay clickable above the canvas.
```

Tip: run phases 0–5 first and judge the base look before spending time on the controls; if the stipple and depth look right at that point, the rest is additive.

## 14. Open items and assumptions

**Assumptions made**

- The reference's source code could not be read, so behaviour is inferred from its rendered text and your three screenshots. Items marked *inferred* in section 2 are the most likely to differ.
- The product name is a working title; the credit line is `BY SUMANTH REDDY`.
- The portfolio's framework is unknown, so the hero is plain ES module plus web component, with an optional React wrapper.
- Numeric defaults (slider values, colours, sizes) are estimated from screenshots and need visual tuning.
- FastDepth is optional; Depth Anything V2 Small is the default because a ready browser build exists.

**Questions for you**

- [ ] Final product name?
- [ ] Which framework does the portfolio use (React, Next.js, Astro, plain HTML)? Only the wrapper changes.
- [ ] Should the hero show one subject, or cycle through several images?
- [ ] Should the studio include video export (WebM) later? It is not in the current scope.
- [ ] Do you want the studio hosted publicly, or only used to make hero assets for your portfolio?
