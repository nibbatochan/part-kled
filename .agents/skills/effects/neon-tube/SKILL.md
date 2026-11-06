---
name: effect-neon-tube
description: Neon tube line-art treatment of a source picture (glowing coloured outline on black with white-hot core and bloom). Use for neon, emissive, glowing-outline looks before particle conversion.
---

# NEON TUBE

Tool: `python tools/treat/treat.py neon in.png out.png [--glow 1.0]`
Status: **implemented and visually checked** (best result of the set; works on both test subjects).

## Visual objective
The subject is drawn as bent glass tubes on a black wall. Light comes from the lines only. The body of the subject is dark.

## Reference interpretation
Real neon signs and neon-outline portraits: thin even line, white-hot centre, saturated halo, wide soft bloom on the wall. The look is the line quality, not the glow.

## Required visual treatment
1. Lines = silhouette outline + form edges from the picture (smoothed first so lines follow shapes, not noise).
2. Thin the edges to one consistent width. Drop weak edges.
3. Compose per line: core (blur 0.9, white), halo (blur 3.5, coloured), bloom (blur 14), haze (blur 40).
4. Two hues blended top to bottom (default magenta to cyan). Soft filmic roll-off so the core goes white.
5. Background pure black, no ambient fill.

## Colour and material
Magenta (1,0.1,0.75) and cyan (0.1,0.9,1). Cores near white. Overlapping lines add up, never darken.

## Details that matter
- Line width stays constant across the subject.
- Face lines break at features (eyes, nose bridge, mouth) instead of one wobbly scribble.
- Bloom stays inside about 15% of the subject width.

## Preserve
Silhouette, feature positions, proportions.

## Avoid
- Colour-filled shapes (it is a line effect).
- A grey body: the interior should be black.
- Uniform thick outline around everything: the interior form lines are what make it a portrait.
- Edge noise: if hair turns into scribble, smooth the source more (the tool blurs at 1.8 px; raise it).

## Expected output
Opaque RGB PNG on black. Black means no particles in the studio.
