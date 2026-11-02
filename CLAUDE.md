# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

**Particle Depth Studio**: an interactive WebGL2 particle simulation engine. Up to five uploaded photos (or dropped 3D `.glb`/`.obj` models) become a 524,288-particle (1024 x 512) depth-driven 3D animation. The same engine also builds as a standalone header embed, `<particle-hero>`, for Sumanth Reddy's portfolio site, with no depth-model download.

Credit line is `BY SUMANTH REDDY`. Do not copy the reference's DAO logo, its mark, or the name GATHER (see `docs/BUILD.md` section 1).

## Commands

> **Windows PowerShell note:** If PowerShell script execution policy restricts `npm.ps1`, run commands via `cmd.exe /c` (e.g. `cmd.exe /c npm test`).

```bash
npm install            # deps (Node 20+)
npm run dev            # Vite dev server, http://localhost:5173/
npm run build          # tsc + vite build (studio app)
npm run build:hero     # vite build --config vite.config.hero.ts (-> dist-hero/hero.js)
npm test               # vitest run (tests/ - 38 unit tests)
npx tsc --noEmit       # typecheck only (tsconfig includes src, tests, vite.config.ts)
```

`scripts/*.mjs` are Playwright verification scripts (e.g. `verify-simulation.mjs`, `verify-hero.mjs`, `verify-web-studio.mjs`, `verify-clip.mjs`). They start Vite themselves. Run them with `node` after a dev server or build exists.

## Architecture & Subsystems

- `src/core/`: the original GPU engine. Must not depend on the UI.
  - `Engine.ts`: orchestrates the sim, renderer, camera and pointer state.
  - `Simulation.ts`: GPU ping-pong via `GPUComputationRenderer`. Position and velocity run in shaders.
  - `ParticleRenderer.ts`, `Camera.ts`, `FlowField.ts`, `Sampler.ts`, `styles.ts`.
  - `params.ts`: one serialisable `Params` object. Every control is a field here, so presets, hero config and UI stay in sync.
- `src/lite/`: lightweight WebGL2 renderer for ordinary laptops/phones. Powers the web studio on `master-web`. Functional particle evaluation without heavy framebuffers.
- `src/shaders/`: GLSL (`sim_position`, `sim_velocity`, `particle.*`, `streak.*`, `trail_*`, `composite`). Imported via `vite-plugin-glsl`.
- `src/depth/`: `DepthEstimator.ts` (Depth Anything V2 Small via `@huggingface/transformers`), `depth.worker.ts` (worker offload), `refine.ts` (guided filter), `bake.ts` (offline baking for the hero).
- `src/model/`: 3D model parsing (`.glb`, `.obj`) and rasterization into picture slots.
- `src/audio/`: audio reactivity, FFT analysis, equalizer particles, and MUSIC section.
- `src/video/`: LAB / VIDEO switch, video clip playback and sampling (`ClipPlayer`, `ClipSampler`).
- `src/ui/`: vanilla-TS UI (`Panel`, `Frame`, `Thumbs`, `Dropzone`, `LineWidget`, `LookPicker`, `ExportPanel`, `MusicPanel`), with `panel.css` and `tokens.css`.
- `src/main.ts`: web studio entry point. `src/hero.ts`: hero embed entry point.
- `tests/`: vitest unit tests (`sampler`, `frameSize`, `palette`, `clip`, `params`, `styles`, `audio`, `model`).
- `docs/`: `BUILD.md` is the spec and decision record. `PROJECT_LOG.md` tracks timeline and changes.
- `public/samples/`: sample images and depth maps. `public/fonts/`: self-hosted woff2.

## Conventions and rules

- No React in the core. Frameworks only in thin wrappers.
- Keep `core/` and `lite/` free of DOM/UI imports. The studio and hero are two front ends on one engine.
- Depth is computed in-browser for the studio (in a worker) and baked offline for the hero.
- Hero bundle budget: under 200 kB gzip. Last measured ~192.8 kB.
- Particle lifecycle (rest at home, stream along LINE, fade, respawn) is defined once in `src/shaders/lifecycle.ts`.
- Depth relief is `home.z * depth * 0.55` in the sim shaders and `DEPTH_RELIEF` in `ParticleRenderer.ts`. Keep them equal.
- Target is WebGL2. WebGPU is only used to speed up depth inference.
- Add new controls as fields in `params.ts` first, then wire the UI and shaders.
- Verify visual changes in a browser (`scripts/*.mjs`), not only with unit tests.
- `dist/` and `dist-hero/` are build output and are git-ignored. Do not edit them.

## Git

- Current working branch: `master-web` (web studio). Main studio: `master-studio`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, etc.).
