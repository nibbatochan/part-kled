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

## Add a photo, or import a pack, on the phone

**ADD PHOTO** (gallery) takes a picture from the phone's gallery (pictures only), shrinks it to 768 px, estimates a rough depth map on the phone and stores it as a plain-dots effect (a normal pack in the app's private storage). Use the LOOK row on its customise screen to restyle it. The depth is a guess, not the web studio's depth model.

**IMPORT PACK** takes a `.pdspack` from the exporter, described next.

### `.pdspack` import

A `.pdspack` is a zip with exactly three files: `pack.json` and the two pictures it names. Make one with the exporter:

```bash
node scripts/export-pack.mjs --id my-photo --name "My photo" --image photo.png --depth photo-depth.png   --max-side 768 --set glassGreenOn=true --zip my-photo.pdspack
```

The depth map comes from the web studio's depth model (or any grey depth PNG). Copy the file to the phone and tap **IMPORT** in the gallery. Imported effects are marked with `*`, can be deleted from their customise screen, and are stored in the app's private storage (at most 30).

The importer checks the archive before writing anything, then loads the pack exactly like a built-in one:

| Check | Rule |
|---|---|
| Entries | At most 3, flat, plain file names; no folders, no `..`, no repeats; exactly `pack.json` plus the two files the config names |
| Sizes | `pack.json` 64 KB, each picture 2 MB, 5 MB read in total (a zip bomb is stopped at the cap, not inflated) |
| Config, hashes, pixels | The same checks as a built-in pack (schema, ranges, SHA-256 of both pictures, 2048 x 2048 pixel cap, decodable) |
| Id | Must not be the id of a built-in effect; the folder name must match `id` |
| Failure | Nothing is kept: the temporary folder is removed and the previous wallpaper stays |

Tested on a realme X2 (2026-11-08): a good pack imports and gets a thumbnail; a tampered picture, a built-in id and a `../` entry are each refused with a clear message. 12 JVM tests attack the archive reader (`PackArchiveTest`).

## Not in format 1

Pack download and signing (phase 4 in `docs/ANDROID_SCOPE.md`), animated or video sources, per-device tier tables.

## Tests

`./gradlew testDebugUnitTest` in `android/`. `PackConfigTest` loads the exporter's real output and expects zero warnings, so a key the exporter writes and `ParamSpec.kt` lacks fails the build. `SamplerGoldenTest` checks the Kotlin sampler against the web sampler (`node scripts/gen-sampler-golden.mjs` regenerates the golden data).
