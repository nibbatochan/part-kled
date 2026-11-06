---
name: effect-chrome
description: Liquid mirror chrome treatment of a source picture. Use when the user wants polished mirror metal, liquid chrome or mercury look applied to a photo or cut-out before particle conversion.
---

# CHROME (liquid mirror metal)

Tool: `python tools/treat/treat.py chrome in.png out.png [--liquid 0.35] [--bands 1.0]`
Status: **implemented and visually checked** on a marble bust (good) and a dark-coat figure (partial).

## Visual objective
The subject looks cast in mirror-polished metal that reflects a studio. The shape of the reflections tells the form. It must look like a different material, not a grey-scaled photo.

## Reference interpretation
- Real references: liquid-chrome/mercury posters and chrome type (see the library, section "Chrome"). The recurring signature is a hard-edged horizon line, black "floor" reflections and white "sky" reflections.
- Read it as an environment reflected off a bumpy surface, not as a colour.

## Required visual treatment
1. Make a height field from the picture: luminance form (normalised so white marble and black cloth both give relief) plus an inflated silhouette (centre bulges toward the viewer).
2. Reflect a studio environment off that surface: dark floor below a sharp horizon, bright hairline on the horizon, cool sky above, one or two softbox bars.
3. Quantise the reflected tone into bands (cosine banding) so reflections read as folded metal.
4. Let a little of the source contrast ride on top so the face and folds stay readable.
5. `--liquid` adds slow ripples to the surface. 0 for a rigid statue, 0.35 default, 0.7 for molten.

## Colour and material
- Neutral steel: shadows near black with blue lean (about 0.02,0.03,0.08), mids steel blue (about 0.4,0.5,0.68), highs near white with a warm tint (about 1,0.97,0.9).
- No diffuse colour. No source colours survive.
- Roughness: very low. Edges of reflections are sharp.

## Lighting
One overhead studio (horizon + sky), one bar softbox upper right. Highlights come from the environment, not from a point light.

## Details that matter
- Dark thin rim on the silhouette, then a bright bevel just inside.
- Horizon hairline visible as a bright line crossing curved areas.
- Bands change direction with the form.

## Preserve
Silhouette, alpha, face/feature positions, proportions.

## Avoid
- A flat grey or silver gradient (reads as greyscale).
- Plastic sheen: soft white blobs with no dark counterpart.
- Rainbow tint (that is holo foil).
- Camouflage blotches. They appear when the source is mostly black with no luminance relief. Fix: lower `--bands` to 0.6, raise the inflate (silhouette term) or brighten the source with a levels pass first.

## Expected output
Opaque-in-silhouette PNG, same size as the resized source (max side 1024), transparent outside the cut-out.
