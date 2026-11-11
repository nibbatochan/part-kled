---
name: image-to-effect
description: Two-stage workflow for Particle Depth Studio. Stage 1 applies a visual treatment (chrome, holo foil, neon, stipple, glass, crystal) to the source picture and checks it against a visual brief. Stage 2 hands the treated PNG to the existing particle studio as an ordinary upload. Use when the user wants a look from a reference applied to their image, before any particle conversion.
---

# Image-to-Effect (treat the picture first, then particles)

Two separate operations. Never mix them.

1. **Treat the picture.** Source image in, treated PNG out. No particle code, no shader edits.
2. **Convert.** Upload the treated PNG to the studio. The existing system does the rest.

If the treated picture does not look like the reference, the particles cannot fix it. Do not touch particle parameters to imitate a look.

## Step 1: Read the source (write these down)

- Subject box, silhouette, cut-out or full frame (alpha present?).
- Where the light comes from, where the darkest and brightest areas are.
- Features that must survive: eyes, mouth, hair mass, folds, text, logo edges.
- Dominant material of the source (matte stone, black fabric, skin). It decides how hard the treatment must work. A black coat has almost no luminance relief, so chrome on it turns into camouflage blotches. Say so in the report.

## Step 2: Read the reference (write a visual brief, not a mood)

Fill every line, in plain visual terms. A line you cannot fill means you have not understood the reference yet.

| Line | Question | Example (chrome) |
|---|---|---|
| Material | What is it made of and what does it do to light? | Mirror metal, reflects a studio, no diffuse colour |
| Tonal structure | Hard bands or soft gradients? How many dark/light bands? | Hard bands, black floor, white horizon hairline |
| Palette | 3 to 5 named colours with rough values, plus where each sits | Steel blue shadows, near-white highs, black floor |
| Edges | How do the borders of the subject look? | Dark rim then thin bright bevel |
| Detail scale | Largest and smallest visible feature, in % of subject height | Bands 5-15%, glints 0.5% |
| Must keep | What from the source must still be recognisable | Face, laurel, folds |
| Must avoid | What makes it look like a different or generic effect | Flat grey gradient, plastic sheen, rainbow tint |

Reference quality: use real images (Pinterest, Behance, Dribbble, Cosmos, Shadertoy, CodePen, Awwwards). If the user gives only a name, ask for or find one real picture first. Do not invent a look from the word.

## Step 3: Treat

Run the matching treatment in `tools/treat/treat.py`:

```bash
python tools/treat/treat.py <chrome|holo|neon|stipple|glass|crystal> in.png out.png [--param value]
python tools/treat/treat.py --all in.png outdir/
```

Rules the tool already follows (keep them when extending it):

- Relief comes from the picture itself (normalised luminance plus inflated silhouette), so the treated image keeps the subject's form.
- Silhouette stays. Cut-outs keep alpha. Emissive looks (neon) and scene looks (glass, stipple) come out opaque on their own background; the background's black or paper tone is "nothing" to the particle system.
- Deterministic. Fixed seeds.
- One effect per treatment. No stacking filters to hide a weak result.

If the effect does not exist yet, write it as a new function in `treat.py` and a new skill in `.agents/skills/effects/<name>/SKILL.md`.

## Step 4: Fidelity gate (mandatory, before conversion)

First the measured gate, on the real studio canvas, not the bake sheet (the studio does not run the CPU bakes at runtime):

```bash
python tools/analyze/analyze.py reference.png
node scripts/score-look.mjs reference.png --look=<id> --source=<source picture> [--unpaired]
```

Report Score B, `B_max` and the ratio. They are uncalibrated proposals (`docs/RESEARCH_EFFECT_RECREATION.md` 5.4 to 5.6); never call a number "similarity" for an unpaired reference. Then look at the result next to the reference and the source. Answer each with yes or no.

1. Same subject? Features from "Must keep" recognisable at thumbnail size.
2. Same silhouette and proportions as the source?
3. Material reads as the reference's material in one second, not as a coloured version of the source?
4. Tonal structure matches (bands vs gradient, contrast range)?
5. Palette within the brief?
6. None of "Must avoid" present?

Any "no": fix the treatment parameters or the treatment, re-render, look again. Max 3 rounds. After 3 rounds, report it as partial with the failing lines named. Never send a failing image on and call it done.

## Step 5: Convert

Upload the treated PNG in the studio like any picture. Use the plain DOTS look first so the treatment shows. See `docs/EFFECT_MAKER_RUNBOOK.md` for slots. If the user wants the look as a built-in tile later, port the winning treatment to a shader through `effect-maker`; that is a separate job.

Known limit: the studio resamples the picture to 768 px on the long side. Details finer than about 1/400 of the height will not survive. Stipple dots are sized for this.

## Step 6: Report

- Effect, source, parameters used.
- Gate result per line (yes/no) and any partial lines.
- Output path of the treated PNG.
- Not yet converted/verified in the studio unless you actually did it.
