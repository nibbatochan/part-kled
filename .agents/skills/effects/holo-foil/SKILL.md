---
name: effect-holo-foil
description: Holographic iridescent foil treatment of a source picture (thin-film rainbow driven by surface thickness, with a diagonal light band). Use for holographic, iridescent, pearlescent or oil-slick looks before particle conversion.
---

# HOLO FOIL

Tool: `python tools/treat/treat.py holo in.png out.png [--film 1.0] [--sheen 1.0]`
Status: **implemented and visually checked** (bust good, dark-coat figure good).

## Visual objective
Crumpled holographic foil: pastel rainbow that changes hue with the surface slope, over a bright silvery base. One bright diagonal light band crosses the subject.

## Reference interpretation
Thin-film interference (soap bubble, oil slick) and holographic foil. Colour depends on film thickness and view angle, so hue bands follow the form like contour lines. See the library section "Holographic".

## Required visual treatment
1. Height field from the picture (relief, silhouette inflate smaller than chrome).
2. Thickness `t` = height + slope term. Hue = cosine palette of `t` with phases 0, 1/3, 2/3 (this is what makes the full spectrum cycle).
3. Keep the hue pastel: mix 35% flat + 65% cosine, then multiply onto a bright silver base.
4. Add a diagonal sheen band (narrow, soft) and tight white glints where the normal faces the key light.

## Colour and material
Pink, mint, pale blue, lemon cycling in order along the form. Base near white. No dark saturated tones. Shadows are lavender-grey, not black.

## Details that matter
- Hue contours follow folds and the jaw/shoulder curves.
- Rainbow reappears more than once across the subject (film 1.0 gives 2-3 cycles). Fewer cycles reads as a gradient overlay.
- Sheen band crosses at about 45 degrees.

## Preserve
Silhouette, alpha, face landmarks.

## Avoid
- A single linear rainbow gradient laid over the picture.
- Neon-saturated colours (that is a different effect).
- Losing form: if the face goes flat, raise the detail term or lower `--film`.

## Expected output
RGBA PNG, same size, alpha kept.
