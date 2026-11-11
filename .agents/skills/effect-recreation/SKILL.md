---
name: effect-recreation
description: Use when the user supplies a reference image (one treated image, or a source and target pair) and wants its look recreated as a Particle Depth Studio effect, or when an effect result looks far from its reference. Use before effect-maker or image-to-effect, which only build.
---

# Effect Recreation

A reference is a stack of treatments across three places: the picture, the dots, and the final frame. Decompose it, check what this engine can do, get the owner's yes, build, then measure. Do not pick one filter that looks similar.

**Background:** `docs/RESEARCH_EFFECT_RECREATION.md` (sections 2, 4, 5, 6, 7). Build with `.agents/skills/effect-maker/SKILL.md`. Engine rules in `CLAUDE.md`: do not touch the particle engine, physics or depth.

**Numbers are uncalibrated.** Score weights and the 0.70 threshold are proposals. Say "uncalibrated" whenever you report a score. Never invent a similarity percentage; a range needs a stated basis.

## The seven steps

| # | Step | Do this | Done when |
|---|---|---|---|
| 1 | Analyse | If the image holds app UI, margins or text, crop to the effect area first (Pillow, to a scratch file) and measure the crop. Then `python tools/analyze/analyze.py <reference>` and one look at the image | Every measure has a value, or a named reason it could not run. A measure that could not run on a central component goes to the owner as a question |
| 2 | Identify | List each visible quality as a component: family, measured value, layer, technique, exists or missing. A logo, mark or name in the reference is out of scope (`CLAUDE.md`): list it as such | Nothing visible is left off the list (or it is named out of scope) |
| 3 | Research | For each missing component find one standard technique (research doc sections 2.1, 3 and 6.3). Read `src/lite/Post.ts` and `src/lite/shaders.ts` first to see what exists | Each missing component has a technique, or is marked not feasible |
| 4 | Strategy | Give each component exactly one layer and a parameter set (the recipe, below) | The plan reads as one cohesive effect |
| 5 | Feasibility | Fill the report below and show it | **The owner accepts the class and the plan in chat. No code before this.** |
| 6 | Develop | Build with `effect-maker`. L0, L2 and L3 parts are a `Partial<Params>`; add new fields to `params.ts` first | `npx tsc --noEmit` and tests pass; it renders in the studio |
| 7 | Validate | `node scripts/score-look.mjs <reference> --look=<id> --source=<picture>` and look at the canvas | Ratio at or above 0.70 of `B_max`, or 3 rounds used and reported as partial |

## Layers (where a component can live)

- **L0** dot size and count, fx levels, trails (existing `Params`).
- **L1** picture work before sampling. The studio does not run `TREAT_BAKES` at runtime today; do not rely on it without checking.
- **L2** per-dot finish in `src/lite/shaders.ts` (the `...On` flags).
- **L3** screen-space post chain in `src/lite/Post.ts` (bloom, halo, grain, duotone and the other existing passes).

Dots render by screen blend, so they cannot darken a bright field, cannot show smooth continuous surfaces, and the working picture is capped at 768 px.

## Feasibility report (fill every line)

```
Reference / pair?:
Class:        Achievable (high confidence) | Achievable with limitations | Partially achievable | Not currently feasible
Expected similarity: a range, with its basis. Unpaired reference: say "style score".
Components:   # | component | measured | layer | technique | exists or MISSING
Central components: (the ones the look does not read without; the owner may correct this)
Limitations:
Required techniques by layer:
Additional requirements: assets, source picture, libraries, renderer work
Android:      L3 components do not show (post chain not ported)
Decision asked of the owner: ONE question, in a full sentence. Put every other question in Limitations or Additional requirements, and ask it after the owner answers this one.
```

Class rules, first match wins, a lower class from any component wins:

| Condition | Class |
|---|---|
| A central component fits no layer (true relighting, cast shadows, new generated detail, readable new text) | Not currently feasible |
| Dark subject on a light field, and no paper pass exists | Partially achievable |
| A central component needs a continuous smooth surface (clear glass, liquid, mirror gradient) and no soft fill pass exists | Partially achievable |
| A central component needs detail under about 2 px at 768 px | Partially achievable |
| A component needs a known pass that `Post.ts` lacks | Achievable with limitations, and the pass is listed as required work |
| A component needs an asset or a source picture the owner has not given | Stop and ask |
| The reference is unpaired | At most Achievable with limitations, and the score is a style score |
| Every component maps to existing capability, light-on-dark | Achievable (high confidence) |

"Central" means the look does not read without it. If unsure, ask.

**Stop and ask the owner, one question at a time, in full sentences, when:** the class is Partially or Not feasible; any central component is MISSING; an asset, source or pair is needed; the measurements and your read of the image disagree on a central component; a new renderer pass is needed (build it or accept the lower result); the reference is unpaired and a similarity number was requested.

## The recipe

Save each accepted effect as `docs/effect-library/recipes/<id>.json`: `id`, `name`, `reference` (file, paired, source), `feasibility` (class, expected range, basis), and `components`. Each component has `family`, `name`, `layer`, `technique`, `params` (dotted paths into `Params`) or `pre` (an L1 op), and `fittedFrom` (the measure and value, or the literal `"by eye"`). Append each validation round to `history`. A component enters the recipe only with a measurement beside it, or the label `"by eye"`.

## Iteration (step 6 to step 7)

Maximum 3 rounds. Change only the failing component, and stop early if a round does not raise it.

| Failing part of the score | Change |
|---|---|
| C colour and tone | Refit the grade against the current output |
| S structure | The picture-level treatment or alignment is wrong; do not touch L3 |
| E edge and detail | Too soft: less fill or blur. Too hard: more |
| T texture | Refit grain amount and size from the spectrum |
| G glow | Refit threshold and radius from the falloff |

If the canvas scores well below `B_max` while the flat picture is fine, the loss is in the dots: change L0 or L3, not the picture.

## Red flags: stop and go back to step 5

- Writing code before the owner accepted the report.
- Reporting a similarity percentage with no stated basis, or without the word "uncalibrated".
- Calling a look done because it compiles, or because the bake sheet looks right.
- Fitting colours only (a palette) and calling it a recreation.
- Stacking filters to hide a weak component.
