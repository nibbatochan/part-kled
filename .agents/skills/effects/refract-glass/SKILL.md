---
name: effect-refract-glass
description: Clear refractive glass sculpture treatment of a source picture (backdrop bends through the body, bright Fresnel rim, inner bevel line). Use for glass, translucent, frosted-resin looks before particle conversion.
---

# REFRACT GLASS

Tool: `python tools/treat/treat.py glass in.png out.png [--strength 0.45] [--frost 0.0] [--bg_keep 0.0]`
Status: **implemented, checked in studio.** Backdrop outside the body is black by default (`bg_keep 0`); a lit backdrop becomes a visible rectangle of particles. Still partial: Reads as translucent glass or resin, identity kept. Does not yet show true caustics or internal reflections. First version (dark body) failed and was rewritten.

## Visual objective
A solid clear glass casting of the subject. You see a lit studio backdrop through and bent by the body. The edges glow.

## Reference interpretation
Real glass sculptures and "liquid glass" UI: the body is mostly the backdrop, distorted; the shape is shown by rim light and edge lines, not by painted shading. See the library section "Glass".

## Required visual treatment
1. Build a lit backdrop: mid-grey gradient, two vertical light strips, a bright floor line.
2. Refract it using only a large-scale normal (smoothed relief + inflate), strength about 0.45. Fine photo detail must not drive refraction.
3. Split channels slightly (scale 1.0 / 1.1 / 1.22) for dispersion.
4. Body = refracted backdrop, pale cyan tint, with faint form shading from the source (about 30%).
5. Add Fresnel rim (bright at grazing normals), a tight specular, and one inner bevel line about 4-5 px inside the silhouette.
6. `--frost` blurs the refracted view for sandblasted glass.

## Colour and material
Backdrop-driven. Tint pale cyan (0.88,1,0.97). Rim near white with a cool tint. No local colour from the source.

## Details that matter
- Backdrop light strips visibly bend along the contours.
- Rim is brighter at the shoulders and head top.
- Inner bevel line gives thickness.

## Preserve
Silhouette, face landmarks, readable form.

## Avoid
- A dark silhouette (first attempt failed this way).
- A tinted photo (the version at `strength` 0 with tint looks like teal marble).
- Strong refraction from fine detail: face turns to soup.

## Expected output
Opaque RGB PNG on the studio backdrop.
