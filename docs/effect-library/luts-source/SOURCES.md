# LUT and blue-noise sources

Downloaded 2026-11-12 for phase R3 (see `docs/RESEARCH_LUT_PRESETS.md`). These are source files; the app will ship small repacked versions, not these.
Licence files were read from the downloaded copies (`LICENSE` beside each set). Re-read them before a public release.

| File | Source | Licence | Credit line | Size | sha256 (first 16) |
|---|---|---|---|---|---|
| `slay/slay-01-amber.cube` | https://raw.githubusercontent.com/slaycamera/luts/main/luts/slay-01-amber.cube | CC BY 4.0 (`slay/LICENSE`) | LUTs: slay (CC BY 4.0), slaycamera.com | 970,501 B | 5912a5761bb96639 |
| `slay/slay-02-fade.cube` | same repo, `luts/slay-02-fade.cube` | CC BY 4.0 | same | 970,500 B | 0fc029d88a11c13a |
| `slay/slay-03-neon.cube` | same repo, `luts/slay-03-neon.cube` | CC BY 4.0 | same | 970,500 B | 07ac89f666c74e63 |
| `slay/slay-04-film.cube` | same repo, `luts/slay-04-film.cube` | CC BY 4.0 | same | 970,500 B | d846f24a0ce3affb |
| `lumix/DuskTide.cube` | https://raw.githubusercontent.com/t0saki/lumix-original-looks/main/luts/DuskTide.cube | MIT, Copyright (c) 2026 Zhengxiao Wu (t0saki) (`lumix/LICENSE`) | keep the MIT notice | 1,402,063 B | 3f43fe2baefe5828 |
| `blue-noise/LDR_LLL1_0_64.png` | `Data/64_64/LDR_LLL1_0.png` inside http://momentsingraphics.de/Media/BlueNoise/FreeBlueNoiseTextures.zip (Christoph Peters) | CC0 (`blue-noise/LICENSE.txt`, `COPYING.txt`) | none required | 7,115 B | 140c55bd97c21b9b |

All five `.cube` files are 33-point (`LUT_3D_SIZE 33`). The blue-noise PNG is 64 x 64, 8-bit, equal grey in R, G and B.
The blue-noise zip was 42 MB (1,743 entries); only the one texture and its licence files were kept.
