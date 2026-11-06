---
name: effect-crystal-facet
description: Cut-crystal faceted treatment of a source picture (flat polygon facets in an ice-blue ramp with bright bevel lines). Use for crystalline, low-poly gem, ice-sculpture looks before particle conversion.
---

# CRYSTAL FACET

Tool: `python tools/treat/treat.py crystal in.png out.png [--cells 1100] [--bevel 1.0]`
Status: **implemented, partial.** Form reads (face, folds, shoulder light). The facet pattern is still busy and the face is weak. First two versions failed (mosaic tile, high-frequency noise).
Note: the app already has a FACET look (slot 43). This one differs by treating the picture first.

## Visual objective
The subject carved from flat-faced ice or cut crystal. Few large facets, one coherent light direction, bright bevelled edges.

## Reference interpretation
Low-poly / Delaunay faceting: points denser on features, sparse in flats, one flat colour per facet. Averaging the facet colour gives smooth facets; sampling the centre gives cut-crystal contrast. Facet lighting must agree with the form, or it reads as tile.

## Required visual treatment
1. Seed points with density from edge strength (floor 35% so flats still get facets). Relax twice toward the weighted centroid to remove slivers.
2. Each facet takes the mean of the smoothed, normalised tone (blur 3 px), not of raw pixels. Raw pixels give mottle.
3. Light each facet from the relief normal under it plus small jitter, one key light upper left.
4. Grade tone through an ice ramp: near-black navy, mid blue, pale blue, white.
5. Thin bright bevel on facet borders, stronger on light-facing facets. A few specular facets.

## Colour and material
Navy (0.02,0.05,0.14) to white via blue (0.16,0.34,0.62) and pale blue (0.62,0.82,0.97). Facets flat, no gradient inside.

## Details that matter
- Facet size follows form: smaller around eyes, hair, folds.
- Light side and dark side each group of facets, with a clear terminator.
- Bevel lines unbroken.

## Preserve
Silhouette, alpha, face landmarks.

## Avoid
- Per-facet random colour (mosaic tile).
- Equal-size facets everywhere.
- Facets so small the studio resample turns them to noise. Under about 900 cells is safer on a full figure.

## Expected output
RGBA PNG, same size, alpha kept.
