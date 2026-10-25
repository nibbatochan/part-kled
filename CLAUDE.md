# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

**Particle Depth Studio**: a WebGL2 particle engine. Up to five uploaded photos become a 524,288-particle (1024 x 512) depth-driven 3D animation. The same engine also builds as a standalone header embed, `<particle-hero>`, for Sumanth Reddy's portfolio site, with no depth-model download.

Credit line is `BY SUMANTH REDDY`. Do not copy the reference's DAO logo, its mark, or the name GATHER (see `docs/BUILD.md` section 1).

## Commands

```bash
npm install            # deps (Node 20+)
npm run dev            # Vite dev server, http://localhost:5173/
npm run build          # tsc + vite build (studio app)
npm run build:hero     # vite build --config vite.config.hero.ts (-> dist-hero/hero.js)
npm test               # vitest run (tests/)
npx tsc --noEmit       # typecheck only (tsconfig includes src, tests, vite.config.ts)
```

`scripts/*.mjs` are Playwright verification scripts (e.g. `verify-simulation.mjs`, `verify-hero.mjs`). They start Vite themselves. Run them with `node` after a dev server or build exists.

## Architecture

- `src/core/`: the engine. Must not depend on the UI.
  - `Engine.ts`: orchestrates the sim, renderer, camera and pointer state.
  - `Simulation.ts`: GPU ping-pong via `GPUComputationRenderer`. Position and velocity run in shaders.
  - `ParticleRenderer.ts`, `Camera.ts`, `FlowField.ts`, `Sampler.ts`.
  - `params.ts`: one serialisable `Params` object. Every control is a field here, so presets, hero config and UI stay in sync.
- `src/shaders/`: GLSL (`sim_position`, `sim_velocity`, `particle.*`, `streak.*`, `trail_*`, `composite`). Imported via `vite-plugin-glsl`.
- `src/depth/`: `DepthEstimator.ts` (Depth Anything V2 Small via `@huggingface/transformers`, WebGPU with WASM fallback), `refine.ts` (guided filter), `bake.ts` (offline baking for the hero).
- `src/ui/`: vanilla-TS UI (`Panel`, `Frame`, `Thumbs`, `Dropzone`, `LineWidget` (drift dial)), with `panel.css` and `tokens.css`.
- `src/main.ts`: studio app (`App` class). `src/hero.ts`: hero embed entry point.
- `tests/`: vitest unit tests (`params`, `sampler`).
- `docs/`: `BUILD.md` is the spec and decision record. `RESEARCH_DISSOLUTION_EFFECT.md` covers the disintegration/trail effect. `reference/` and `screenshots/` hold visual references.
- `public/samples/`: sample images and depth maps. `public/fonts/`: self-hosted woff2.

## Conventions and rules

- No React in the core. Frameworks only in thin wrappers.
- Keep `core/` free of DOM/UI imports. The studio and hero are two front ends on one engine.
- Depth is computed in-browser for the studio and baked offline for the hero.
- Hero bundle budget: under 200 kB gzip. Last measured 192.8 kB.
- Particle lifecycle (rest at home, stream along LINE, fade, respawn) is defined once in `src/shaders/lifecycle.ts` and prepended to the sim and render shaders. `tPos.w < 0` marks a core particle held at home. Change timing there, not per shader.
- Depth relief is `home.z * depth * 0.55` in the sim shaders and `DEPTH_RELIEF` in `ParticleRenderer.ts`. Keep them equal.
- Browser pane verification: the pane throttles `requestAnimationFrame`, so the sim barely advances. Step it with `__engine.update(1/30, t)` in a loop, then await two `requestAnimationFrame`s before a screenshot.
- Target is WebGL2. WebGPU is only used to speed up depth inference.
- Add new controls as fields in `params.ts` first, then wire the UI and shaders.
- Verify visual changes in a browser (Playwright script or the `playwright-testing` skill in `.agents/skills/`), not only with unit tests.
- `dist/` and `dist-hero/` are build output and are git-ignored. Do not edit them.

## Git

- Branch: `master` is current. Default base for PRs is `main`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`), as in recent history.
