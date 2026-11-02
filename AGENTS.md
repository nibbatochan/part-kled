# AGENTS.md

Instructions, architecture, and constraints for AI agents working in this repository.

## Project Overview

**Particle Depth Studio**: An interactive WebGL2 particle simulation engine. It converts up to 5 uploaded photos (or dropped 3D `.glb`/`.obj` models) into a depth-driven 3D animation (524,288 particles in the GPU simulation, or functional particle shaders in the Lite engine).

The engine compiles into two main targets:
1. **Web Studio App** (`src/main.ts`): Full interactive studio with collapsible sections, style looks (SURFACE, TEXT, CELL, DOTS), audio reactivity, video clip mode, and export tools.
2. **Standalone Portfolio Hero** (`<particle-hero>`, `src/hero.ts` / `src/hero-lite.ts`): Standalone embeddable web component / JS module with offline-baked depth and zero depth-model download overhead.

**Attribution Rule:** Credit line is strictly `BY SUMANTH REDDY`. Do NOT copy reference DAO logos, DAO marks (e.g. 聚), or the name "GATHER" (see `docs/BUILD.md`).

---

## Branches

- `master-web`: Current working branch. Web studio built on the Lite renderer (`src/lite`).
- `master-studio`: Full GPU simulation studio (`src/core/` Three.js ping-pong textures).
- Commit style: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`).

---

## Commands & Workflows

> **Windows PowerShell Note:** If PowerShell script execution policy restricts `npm.ps1`, prefix CLI commands with `cmd.exe /c` (e.g. `cmd.exe /c npm test`).

```bash
# Dependencies (Node 20+)
cmd.exe /c npm install

# Development server (http://localhost:5173/)
cmd.exe /c npm run dev

# Full build (typecheck + vite build)
cmd.exe /c npm run build

# Standalone hero bundle build (dist-hero/hero.js)
cmd.exe /c npm run build:hero

# Unit tests (vitest)
cmd.exe /c npm test

# Typecheck only
cmd.exe /c npx tsc --noEmit
```

### Verification Scripts
Verification and automated browser tests live in `scripts/*.mjs`:
- `scripts/verify-simulation.mjs`: Playwright headless sim check.
- `scripts/verify-hero.mjs`: Hero embed bundle and render check.
- `scripts/verify-web-studio.mjs`: Web studio UI and look picker verification.
- `scripts/verify-clip.mjs`: Video clip playback and sampling verification.
- `scripts/bake-sample-depths.mjs`: Offline depth map generation.

---

## Architecture & Subsystems

```
src/
├── core/            # Engine core (UI-agnostic). Three.js + GPU simulation.
│   ├── Engine.ts            # Coordinates sim, renderer, camera, and pointer state
│   ├── Simulation.ts        # GPU ping-pong computation shaders (GPUComputationRenderer)
│   ├── ParticleRenderer.ts  # WebGL2 points & streak geometry rendering
│   ├── Camera.ts            # Orbit, perspective, tilt controls
│   ├── FlowField.ts         # 256x256 vector field painting & decay
│   ├── Sampler.ts           # R2 quasi-random sampling & CDF brightness importance
│   ├── params.ts            # Single source of truth for serialisable Params object
│   └── styles.ts            # Look categories, filter presets, and dot styles
├── lite/            # Lite WebGL2 engine for web studio (fast, low-spec hardware)
│   ├── LiteEngine.ts        # Pure functional WebGL2 renderer without heavy framebuffers
│   ├── Post.ts              # Post-processing passes
│   ├── shaders.ts           # Lite vertex/fragment shaders and material shaders
│   ├── bitmapGlsl.ts        # Procedural texture patterns & overlays
│   └── glyphs.ts            # Monospace text glyph atlas for text looks (SHAKE-MASK)
├── depth/           # Depth estimation pipeline
│   ├── DepthEstimator.ts    # Depth Anything V2 Small via @huggingface/transformers
│   ├── depth.worker.ts      # Dedicated Web Worker running inference off the main thread
│   ├── refine.ts            # Guided edge-aware filter & relief heuristics
│   └── bake.ts              # Offline baking for instant hero loading
├── model/           # 3D Model ingestion (.glb, .obj)
│   ├── modelInput.ts        # Drag-and-drop 3D asset parsing
│   └── renderModel.ts       # Off-screen rasterization of 3D models into picture slots
├── audio/           # Sound reactivity & Music panel
│   ├── AudioFeed.ts         # Web Audio API mic / file input analyzer
│   ├── AudioMap.ts          # Frequency bin mapping to simulation params
│   └── palette.ts           # Equalizer particle color ramps
├── video/           # Video Clip Mode
│   ├── clip.ts              # Clip metadata and frame indexing
│   ├── ClipPlayer.ts        # Video decode & scrub playback engine
│   └── ClipSampler.ts       # Dynamic video frame stipple particle sampling
├── shaders/         # GLSL shader files (imported via vite-plugin-glsl)
│   └── lifecycle.ts         # Single shared particle lifecycle definition
├── ui/              # Vanilla TypeScript UI (tokens.css, panel.css)
│   ├── Panel.ts             # Sidebar console with collapsible sections (01 to 05)
│   ├── LookPicker.ts        # Style looks grid (DOTS, SURFACE, TEXT, CELL)
│   ├── Dropzone.ts          # Drag-and-drop image/model loader
│   ├── LineWidget.ts        # Directional drift & streak dial
│   └── ExportPanel.ts       # Video / WebCodecs export modal
└── main.ts          # Web studio entry point
```

---

## Architectural Invariants & Rules

1. **Strict Core Separation:**
   - `src/core/` and `src/lite/` must NEVER import from `src/ui/` or access the DOM. The studio UI and the hero embed are independent front ends on the engine.
2. **Single State Source of Truth:**
   - Every user-facing parameter must exist as a typed field in `Params` (`src/core/params.ts`). Never introduce detached component state for engine properties.
3. **Depth Relief Consistency:**
   - Particle displacement relief is `home.z * depth * 0.55` in sim shaders and `DEPTH_RELIEF` in `ParticleRenderer.ts`. Keep them equal across engines.
4. **Particle Lifecycle Centralization:**
   - Particle lifespan and respawn logic is defined once in `src/shaders/lifecycle.ts`. Change timing there, not per individual shader.
5. **Hero Bundle Budget:**
   - Standalone hero bundle (`dist-hero/hero.js`) must strictly remain under **200 kB gzipped** (currently ~192 kB). Do not bundle transformers or Three.js in `hero-lite`.
6. **WebGL2 Target:**
   - Primary graphics target is WebGL2. WebGPU is only used where available to accelerate depth inference in the worker.
7. **Karpathy Coding Guidelines:**
   - Make surgical, minimal edits. Touch only what is necessary.
   - Do not add speculative features or unrequested abstractions.
   - Verify every change: ensure `cmd.exe /c npm test` and `cmd.exe /c npx tsc --noEmit` pass with zero errors.
