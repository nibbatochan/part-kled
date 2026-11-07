# Wallpaper pack format, `pds.effect/1`

A pack is one folder: a config, a picture and a depth map. The Android wallpaper reads packs, so a new effect is a new folder, not new code. Source of truth for the allowed settings: `android/app/src/main/java/app/particledepth/wallpaper/pack/ParamSpec.kt`. Parser: `PackConfig.kt`. Loader: `PackLoader.kt`. Exporter: `scripts/export-pack.mjs`.

## Make a pack

```bash
node scripts/export-pack.mjs --id glass-green --name "Glass Green" \
  --image public/samples/sample-1.png --depth public/samples/sample-1-depth.png \
  --set glassGreenOn=true --set drift=0.3 --set depth=0.4 --set panAmount=0.35
```

Output: `android/app/src/main/assets/packs/<id>/` with `pack.json`, `subject.png`, `depth.png`. The app lists every folder under `assets/packs` and lets the user pick one.

- `--set path=json`: a web studio setting, a dotted path into `Params` in `src/core/params.ts` (for example `glassGreen.gloss=0.5`). The exporter runs the web build's own `toLiteParams`, so the phone receives exactly the numbers the web renderer uses.
- `--lite key=json`: a renderer setting written as is, after the studio mapping (for example `light=[0.95,0.9,0.79]`).
- Only PNG pictures. The depth map is grey: the red channel is the depth, 0 to 1.

## `pack.json`

```json
{
  "schema": "pds.effect/1",
  "id": "glass-green",
  "name": "Glass Green",
  "author": "Sumanth Reddy",
  "minEngine": 1,
  "assets": {
    "subject": { "file": "subject.png", "sha256": "<64 hex>", "w": 1125, "h": 2000 },
    "depth":   { "file": "depth.png",   "sha256": "<64 hex>", "w": 1125, "h": 2000 }
  },
  "params": { "drift": 0.3, "depth": 0.4, "glassGreenOn": true, "fx": { "gamma": 1 }, "emit": { "r0": 1 }, "light": null },
  "mobile": { "pointCount": 150000 }
}
```

| Field | Rule |
|---|---|
| `schema` | `pds.effect/<major>`. This app reads major 1. Any other major: the pack is refused. |
| `minEngine` | Integer. Above the app's engine version (1): refused with "update the app". |
| `id` | `^[a-z0-9][a-z0-9-]{0,63}$`. Also the folder name. |
| `name`, `author` | Strings, at most 256 characters. |
| `assets.*.file` | A plain file name, `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. No slashes, no `..`. |
| `assets.*.sha256` | 64 lowercase hex characters, checked against the file. A mismatch refuses the pack. |
| `assets.*.w`, `h` | Optional, informational, 1 to 4096. |
| `params` | Settings. See below. |
| `mobile.pointCount` | Optional ceiling on the particle count, clamped to 1,000 to 1,000,000. The device's quality level can use fewer, never more. |

## `params`

Names are the web renderer's `LiteParams` names. Every setting has a default and a range in `ParamSpec.kt`.

- **Numbers** (drift, depth, angle, trail settings, every look's sliders, and so on): a number inside its range. Outside the range it is clamped and reported.
- **Flags** (`floatOn`, `trails`, `scan`, `bw`, `emitOn`, every `...On` look switch): `true` or `false`.
- **`fx`**: `black`, `white`, `gamma`, `contrast`, `hue`, `saturation`.
- **`emit`**: `r0` to `r8`, `spots`, `scatter`, `lenRand`, `turn`.
- **`light`**: `null` (no tint) or `[r, g, b]`, each 0 to 1.
- Missing settings use the default.

Looks drawn today (plain DOTS style): CHROME, PRISMATIC, AURA, ECSTASY, BLIGHT, REDMET, CHROMA 2, CONVULSIONS, LINED, BLOOD, FUR, ARANCIA, ROCK, CUMULUS, BLEND, GLASS GREEN, CANDY, C-ABR.

Accepted but not drawn yet (ignored with a warning): SHAKE-MASK, SOFTWORD, the glow and post-processing group (`glow`), cell looks (`style` above 0, `cell`, `gap`, `styleSet`, `colorMode`, `invert`, `autoLevels`, `ink`, `paper`), music and motion settings, touch settings (`track`, `trackOld`, `burst`, `threeD`).

## What the loader does

In this order; the first failure stops the load and the previous wallpaper stays.

1. `pack.json` at most 64 KB, valid JSON, nesting at most 4 levels, strings at most 256 characters.
2. Schema, `minEngine`, `id`, file names, hash format.
3. Each image at most 2 MB, SHA-256 equals the config, at most 2048 by 2048 pixels, decodable.
4. Settings: unknown key (ignored, warning), not drawn yet (ignored, warning), wrong type (default, warning), out of range (clamped, warning), `style` above 0 (forced to 0, warning).

Warnings go to logcat, tag `PDS`, one line each. They never stop the wallpaper.

No value from the config is ever placed in shader source. Values reach the GPU only as uniforms.

## Not in format 1

Pack download and signing (phase 4 in `docs/ANDROID_SCOPE.md`), packs read from app storage instead of assets, animated or video sources, per-device tier tables.

## Tests

`./gradlew testDebugUnitTest` in `android/`. `PackConfigTest` loads the exporter's real output and expects zero warnings, so a key the exporter writes and `ParamSpec.kt` lacks fails the build. `SamplerGoldenTest` checks the Kotlin sampler against the web sampler (`node scripts/gen-sampler-golden.mjs` regenerates the golden data).
