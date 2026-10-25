# Particle Depth Studio

An interactive WebGL2 particle simulation engine that turns up to five uploaded photos into a 524,288-particle, depth-driven 3D animation. The same core engine also compiles into a standalone, UI-free header embed (`<particle-hero>`) with zero depth-model downloads for portfolio websites.

Designed & built by **Sumanth Reddy**.

---

## Features

- **524,288 Particles:** GPU ping-pong computation with `GPUComputationRenderer` simulating position, velocity, kinetic springs, and fluid 3D curl noise.
- **In-Browser Depth Estimation:** Uses Depth Anything V2 Small via `@huggingface/transformers` (WebGPU with WASM fallback), with guided edge-aware filtering and photometric relief fallback.
- **Interactive Stipple Relief:** Stipple particle sampling driven by low-discrepancy R2 sequences and importance CDFs based on gradient and color saturation.
- **Dynamic Controls:**
  - **DRIFT:** Fluid curl noise turbulence
  - **SPLASH:** Pointer velocity burst and cursor repulsion
  - **GATHER:** Spring force snapping particles back to their home positions
  - **DEPTH:** 3D parallax displacement and relief extrusion
  - **DRAW:** Paint directional flow strokes into a 256×256 decaying vector field
  - **TRACK:** Cursor interaction: particles react to the pointer
  - **SCAN:** Traveling directional sweep wave
  - **TRAILS:** Fine velocity streak line segments
  - **TRAVEL:** `SWARM` (cohesive cluster motion) vs `MELT` (gravitational downward sag)
  - **LIGHT Swatches:** 6 spectral tints (cream, ice, orange, red, green, violet) + light toggle
  - **ON WHITE & NEGATIVE:** Light/dark paper inversion
- **Seamless Morphing:** Smooth ripple transitions when switching between images (`Space` or thumbnail clicks).
- **Portfolio Hero Embed (`dist-hero/hero.js`):** Lightweight standalone library build (under 195 KB gzip) with instant poster paint, offscreen pause, and non-blocking interaction.

---

## Getting Started

### Prerequisites
- Node.js 20+ LTS
- Modern browser with WebGL2 support

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open `http://localhost:5173/` in your browser.

### Build
```bash
# Build studio web application
npm run build

# Build standalone portfolio hero library
npm run build:hero
```

### Tests
```bash
npm test
```

---

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Next image (ripple morph transition) |
| `S` | Toggle light tint on/off |
| `F` | Toggle fullscreen |
| `H` | Hide / show UI panels |
| `1` – `4` | Jump directly to image slots 1 through 4 |
| `Pointer Move` | Repel particles (`TRACK`) & 3D parallax tilt |
| `Pointer Drag` | Orbit 3D perspective (or paint flow strokes when `DRAW` is active) |
| `Click` | Kinetic splash burst |
| `Wheel` | Zoom in / out |

---

## Portfolio Hero Integration

The hero runs the particle engine with pre-baked assets and no depth-model overhead:

```html
<!-- Include as Web Component -->
<script type="module" src="/particle-hero/hero.js"></script>

<particle-hero
  src="/hero/subject.webp"
  depth="/hero/subject-depth.png"
  poster="/hero/poster.webp"
  config="/hero/hero.json"
  alt="Sumanth Reddy">
</particle-hero>
```

Or programmatically via ES Module:

```ts
import { createHero } from './particle-hero/hero.js';

const hero = createHero(document.querySelector('#hero-container'), {
  image: '/hero/subject.webp',
  depth: '/hero/subject-depth.png',
  poster: '/hero/poster.webp',
  config: '/hero/hero.json',
  pointer: 'window',
  pointCount: 'auto',
  pauseOffscreen: true,
});

hero.setParams({ gather: 0.7, drift: 0.3 });
```

---

## Deviations & Architecture Notes

1. **Depth Model Pipeline:** Added a photometric gradient and relief fallback with edge-aware guided filtering, ensuring instant responsiveness if the client environment is offline or still downloading model weights.
2. **Library Size:** `dist-hero/hero.js` achieves 192.8 kB gzip, beating the strict 200 kB budget.
3. **Credit Line:** All branding and credits correctly display `BY SUMANTH REDDY`.
