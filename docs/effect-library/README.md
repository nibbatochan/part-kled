# Effect Research Library

Scope: visual effects only. The particle engine, behaviour and physics are untouched.
Date: 2026-11-07.

## 1. Status at a glance

| Effect | Skill | Treatment tool | Status |
|---|---|---|---|
| CHROME | `.agents/skills/effects/chrome` | `treat.py chrome` | Implemented, checked on 2 subjects (good on bust, blotchy on black coat) |
| HOLO FOIL | `.../holo-foil` | `treat.py holo` | Implemented, checked, good |
| NEON TUBE | `.../neon-tube` | `treat.py neon` | Implemented, checked, best |
| STIPPLE INK | `.../stipple-ink` | `treat.py stipple` | Implemented, checked, sparse but correct |
| REFRACT GLASS | `.../refract-glass` | `treat.py glass` | Implemented, partial (reads glass/resin, no caustics) |
| CRYSTAL FACET | `.../crystal-facet` | `treat.py crystal` | Implemented, partial (form reads, busy facets) |
| Thermal / gradient map | none | none | Researched only, skipped (generic) |
| Liquid mercury | folded into CHROME `--liquid` | | Researched, partly implemented |

"Checked" = I rendered the PNG and looked at it next to the source. Outputs: `docs/effect-library/samples/`.

### Studio test (DOTS look, bust, `scripts/verify-treated.mjs`, shots in `docs/effect-library/studio/`)

The treated PNG was served in place of sample-10 (its baked depth still fits), then screenshotted.

| Effect | As particles |
|---|---|
| CHROME | Survives. Bands and highlights read clearly. |
| HOLO FOIL | Survives. Colour cycles and sheen band read. |
| NEON TUBE | Survives. Glow turns into fuzzy bloom, lines still read. |
| CRYSTAL | Survives. Blue facets read better than in the flat PNG. |
| STIPPLE | First version failed (paper got the dots, reads as negative). **Fixed:** `on_black=1` puts bright dots on black, density follows brightness. Now reads as the bust with face and folds. |
| GLASS | First version failed (backdrop became a noisy rectangle). **Fixed:** `bg_keep=0` leaves a black field. Now reads as a glassy cyan bust with bright rim. |

Rule learned: the studio treats bright as "place dots" and black as "nothing". A treatment must put its subject in bright pixels on a dark or transparent field.

## 2. What the research could and could not reach

Pinterest, Cosmos, Behance, Dribbble image feeds and Shadertoy pages did not come back through web search as browsable image sets. I did not see their pictures. What I got is technique documentation and tool/component pages. Those are real, listed below, and I used them for the recipes. **The visual references for each effect still need to be real pictures chosen by you (or fetched in the browser pane); the skills' "Reference interpretation" sections are built from the technique sources, not from looking at gallery shots.** That is the main gap.

Sources used:

- Chrome / liquid metal: [21st.dev Liquid Chrome](https://21st.dev/@ham7a311/components/liquid-chrome.md), [Holo Chrome Flow](https://21st.dev/@kedhareswer/components/holo-chrome-flow.md), [Liquid Metal](https://21st.dev/@educalvolpz/components/liquid-metal.md); trend note: [AIGA Eye on Design, liquid metal](https://eyeondesign.aiga.org/the-futuristic-gleam-of-liquid-metal-is-everywhere-right-now-heres-why/); matcap idea: [Foundry Modo MatCap](https://learn.foundry.com/modo/Content/help/pages/shading_lighting/shader_items/matcap.html).
- Holographic: [Holographic foil in Jetpack Compose](https://proandroiddev.com/how-a-holographic-foil-effect-works-in-jetpack-compose-9535d621c055) (relief + thin-film + moving band + glitter; thickness range matters), [Alan Zucconi thin-film](https://www.alanzucconi.com/2017/10/27/carpaint-shader-thin-film-interference/).
- Stipple: [Weighted Voronoi Stippling notes](https://anilkeshwani.github.io/garden/Papers/Weighted-Voronoi-Stippling) (Secord 2002).
- Glass: [LogRocket liquid glass with SVG](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/) (displacement map plus per-channel scale for chromatic aberration), [rizroze/liquid-glass](https://github.com/rizroze/liquid-glass).
- Neon: [Neon Outline & Glow Edges tool notes](https://vayce.pages.dev/tools/neon-outline-glow-edges-effect) (core vs glow, edge detail), [AKVIS Neon](https://akvis.com/en/neon-tutorial/howwork/index.php).
- Crystal: [Low Poly Generator](https://imageonline.io/low-poly-generator/) (edge focus, average vs centre colour per triangle), [Solar2D thread](https://forums.solar2d.com/t/deluanay-triangulation-shaders/338306?page=2) (triangulation is a preprocessing job).
- Thermal: [Made Good gradient map](https://madegooddesigns.com/tools/gradient-map/) (ramp baked to LUT, luminance indexes it).

## 3. Selection (why these six)

Chosen for: distinct material, reproducible from the picture alone, survives the studio's 768 px resample, and not a duplicate of an existing look.

| Effect | Distinct because | Fit with the app |
|---|---|---|
| CHROME | Hard mirror bands, not a grey ramp. Existing CHROME tile is a per-dot finish; this treats the picture. | High on bright subjects; weak on black subjects |
| HOLO FOIL | Hue driven by form, multiple cycles | High; lots of colour for dots to carry |
| NEON TUBE | Line art on black; black = no particles, so dots cluster on lines | Very high |
| STIPPLE INK | Dots already are the medium | Medium: dense dots get resampled away |
| REFRACT GLASS | Backdrop bends through the body | Medium: needs bright backdrop to read |
| CRYSTAL FACET | Few large flat facets | Medium: overlaps existing FACET |

Rejected: thermal / duotone / gradient map (a luminance ramp, many generic variants), halftone and glitch (already in the app), anything needing animation.

## 4. Why the existing effect-maker was inconsistent (diagnosis)

Read from `.agents/skills/effect-maker/SKILL.md` and `docs/RESEARCH_EFFECT_INPUTS_AND_FIDELITY.md`.

1. **It extracts numbers, not looks.** Step 2 samples 5 luminance tiers and one light vector. A look is mostly structure (hard bands, edge lines, iridescent phase, rim). Those are gone before the shader is written.
2. **Everything is forced into four archetypes** (glass, stone, chrome, candy), all "luminance to palette ramp plus noise". A new reference gets bent into the nearest bin, so results look alike.
3. **No visual brief.** Nothing says what must be preserved or avoided, so the model defaults to a generic reading of the name.
4. **No fidelity gate.** Step 6 checks `tsc` and unit tests. Nothing compares the output with the reference. A wrong-looking effect passes.
5. **Filter and particles are one step.** The look is computed per dot from a blurred, dot-grid-resolution copy of the picture. It cannot make fine structure, and it hides whether the filter or the particles are at fault.
6. **It needs a source/target pair.** Most references (Pinterest, etc.) are not of the user's subject, so the "target" is a different subject and the extraction is noisy.
7. **Wiring noise.** Nine files to edit per effect, and the instructions spend most of their length on GLSL archetypes. The visual part gets little attention.

Fix: treat the picture first, gate it visually, convert second. See `.agents/skills/image-to-effect/SKILL.md`. The effect-maker skill now points there before any shader work.

## 5. Image-to-effect framework

`.agents/skills/image-to-effect/SKILL.md`. Two operations: treat the picture (tool `tools/treat/treat.py`), then upload the PNG into the existing studio. Visual brief and a 6-question fidelity gate sit between them.

## 6. Open items

- Upload each treated PNG in the studio and record how it looks as particles.
- Add 1 to 3 real reference pictures per effect (you pick or fetch them in the browser pane) and re-run the gate against them.
- Crystal and glass need another pass; chrome on dark subjects needs a brightness pre-step.
- Optional later: port a winning treatment into a shader tile through `effect-maker`.
