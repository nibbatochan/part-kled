---
name: effect-stipple-ink
description: Pointillist ink stipple drawing treatment (dark dots on warm paper, density follows tone). Use for stipple, engraving-style dot shading, sketch looks before particle conversion.
---

# STIPPLE INK

Tool: `python tools/treat/treat.py stipple in.png out.png [--n_dots 42000] [--on_black 1]`
Status: **implemented, checked in studio.** Default `on_black=1`: bright dots on black, density follows brightness, because the studio places particles on bright pixels. `--on_black 0` gives ink-on-paper for print use only; it renders as a negative in the studio.

## Visual objective
A hand-stippled ink drawing. Light areas are paper. Shadows are packed dots. Form comes only from dot density.

## Reference interpretation
Weighted Voronoi stippling (Secord, NPAR 2002): density follows tone, dots keep minimum spacing, all dots the same size. Hand engraving stipple has the same rules. It is not noise and not halftone.

## Required visual treatment
1. Tone map: local-normalised luminance so even a white subject gets shadow structure.
2. Variable-radius dart throwing: radius 2.4 px in darkest areas up to 7 px in light ones, so spacing stays even.
3. Dots same diameter (about 2 px at 1024), soft anti-aliased edge.
4. Warm paper (0.95,0.93,0.88), blue-black ink (0.06,0.05,0.08).

## Details that matter
- No clumps, no empty rings. Even spacing is the quality signal.
- Silhouette is implied by density change, with no outline.
- Darkest areas stay dotted, not solid black.

## Preserve
Subject proportions, shadow shapes under the jaw, hair mass, folds.

## Avoid
- Uniform random noise (looks like film grain).
- Variable dot size as the tone carrier (that is halftone, a different effect already in the app).
- Grey wash behind the dots.
- Dots finer than about 1/400 of the picture height: the studio resample erases them.

## Expected output
Opaque RGB PNG on paper.
