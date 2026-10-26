# Web studio (branch `master-web`)

The studio UI and controls from `master-studio`, running on the light renderer in `src/lite/`. Same
pictures, same depth estimate (in the browser), far less GPU work per frame. `master-studio` is unchanged.

## Audit (what was cheap, what was heavy)

- `App` talks to the engine through about ten methods. Keep those names and the UI needs no change.
- The heavy part is the 524,288-point GPU simulation in `core/Engine.ts` (three.js ping-pong). The light
  renderer replaces it: positions are a function of time, so there are no framebuffers.
- The depth estimate (`depth/DepthEstimator.ts`, WebGPU or WASM) is per picture and stays.
- `core/Sampler.ts` builds 524k points and sorts them for the bounds. Replaced by `lite/sample.ts`, which
  resamples the picture to 768 px and writes a shuffled prefix, so the point budget can drop at runtime.

## Structure

| Piece | File | Role |
|---|---|---|
| Engine adapter | `src/web/WebEngine.ts` | Same methods as `core/Engine`; maps `Params` to light settings |
| Light renderer | `src/lite/LiteEngine.ts`, `shaders.ts` | Points, trail lines, effects, tint, scan (from `shaders/lifecycle.ts`), click burst |
| Sampler | `src/lite/sample.ts` | Picture + depth to a 16-byte-per-point buffer |
| Studio | `src/main.ts`, `index.html`, `src/ui/*` | Unchanged apart from the engine and sampler calls |
| Hero | `src/hero-lite.ts` | Shares the light renderer; unchanged behaviour |

## Kept

Flow (drift) and drift direction, burst, relief, track, trails with amount, length, strength,
detail, scan (all styles, levels 1 to 5), light tint and LIGHT on/off, Effects (levels, gamma, curve,
hue, saturation, B&W, opacity; picture only, trails untouched), five pictures, delete, next, light start values.

## Not in the web build (controls disabled in `index.html`)

- **DRAW**: flow strokes would need a per-frame field. Dropped.
- **PULL**: the gather spring pulls particles home. The light renderer has no spring. Dropped.
- **MELT** travel: needs the spring. Dropped.
- **Morph between pictures**: the light build switches picture at once (`WebEngine.startMorph`).

## Points and quality

Budget from device tiers (`pointBudget()`): 200k low, 300k default, 450k strong. The render ladder in
`LiteEngine.adapt` drops trails, then render scale, then points down to 40k when frames stay slow.

## Shortcut with a known limit

- `shortcut: picture switch is a cut, not a morph, upgrade by blending two sample buffers in the shader`.

## Checks

- `npx tsc --noEmit`, `npm test`, `npm run build`.
- `STUDIO_URL=http://localhost:5173/ node scripts/verify-web-studio.mjs`: loads, switches picture, turns
  the scan on, reads back pixels and GL errors, fails on any console error.
- Not measured on a real low-end laptop yet.
