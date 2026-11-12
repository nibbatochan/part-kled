# R2 Post Passes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Add the seven R2 finishing passes to the lite renderer's post chain, all off by default, with panel controls.

**Architecture:** New `Params` fields first (`finish` group plus one `...On` flag per pass), mapped through `WebEngine` into `PostParams`, drawn by `src/lite/Post.ts`. Passes that only need the finished frame live in the compose shader. Passes that need blurred copies (soft fill, tent bloom, streak) get small extra targets and are skipped when off.

**Tech Stack:** TypeScript, WebGL2/GLSL, vitest, Playwright.

**Spec:** none written (the owner opted out of questions). Scope is `docs/RESEARCH_EFFECT_RECREATION.md` section 8, row R2.

## Global Constraints

- Every new pass is off by default; with all flags off the frame must be unchanged (same uniforms, same branches).
- `core/` and `lite/` import no UI. Add fields to `params.ts` first, then shaders, then UI.
- New samplers use texture units 10 to 14 (units 4 to 9 are taken; WebGL2 guarantees 16 in a fragment shader).
- Hero bundle stays under 200 kB gzip (`npm run build:hero`); `Post.ts` is not in the hero build.
- Android does not get these passes (post chain not ported). Say so in the log.
- Numbers are by eye until fitted; label them so.

## Review Focus

- All flags off must equal the old output: test by toggling every pass on then off and comparing the frame.
- Resize while a pass is on: extra targets must be remade at the new size (no stale-size sampling, no GL error).
- Streak/soft/tent targets must not leak when a pass is turned off and the engine is disposed (`dispose()` frees them).
- Phone width: new controls fit at 390 px, no horizontal scroll.
- EFFECTS RESET turns every new flag off.

---

### Task 1: Params and wiring

**Files:** Modify `src/core/params.ts`, `src/web/WebEngine.ts`, `src/lite/LiteEngine.ts`, `src/lite/Post.ts` (interface only); Test `tests/params.test.ts`.

**Interfaces:** Produces on `Params`: `caOn, vignetteOn, paperOn, softOn, tentOn, streakOn: boolean`; `finish: { caAmount, vignetteAmount, vignetteSize, mixMode, paperAmount, paperTint: string, softAmount, tentAmount?, streakAmount, streakLength }`. `mixMode`: 0 SCREEN, 1 ADD, 2 SOFT-LIGHT. `PostParams` gets the same names with `paperTint: [n,n,n]`.

- [ ] Step 1: failing test in `tests/params.test.ts`: `withEffectsStart()` has all six flags false and `defaults.finish.mixMode === 0`.
- [ ] Step 2: add fields to `Params`, `defaults`, `withEffectsStart`; run `timeout 100 npx vitest run tests/params.test.ts` (pass).
- [ ] Step 3: map in `WebEngine.ts` glow block; add defaults in `LiteEngine.ts` glow default; add flags to `lightPost`.
- [ ] Step 4: `npx tsc --noEmit` passes.

### Task 2: Compose-shader passes (CA, vignette, mix mode, paper)

**Files:** Modify `src/lite/Post.ts` (FRAG_COMPOSE and uniform upload).

**Interfaces:** Consumes Task 1 `PostParams`. Uniforms: `uFx1 = (caOn, caAmount, vignetteOn, vignetteAmount)`, `uFx2 = (vignetteSize, mixMode, paperOn, paperAmount)`, `uPaper` (rgb).

- [ ] CA: sample r and b along the radial direction from the centre, offset `caAmount * 0.012 * dist`.
- [ ] Mix mode: replace the final `1 - (1-s)(1-g)` with a switch on `mixMode` (screen, add, soft-light).
- [ ] Vignette: multiply by `1 - vignetteAmount * smoothstep(size, size + 0.45, dist)`.
- [ ] Paper: `mix(res, mix(paper * fibre, ink, lum), paperAmount)` with fibre from `fbm`, placed before grain.
- [ ] Verified in Task 5.

### Task 3: Extra-target passes (soft fill, tent bloom, streak)

**Files:** Modify `src/lite/Post.ts`.

**Interfaces:** New programs `FRAG_UP` (tent upsample, adds a base), `FRAG_STREAK` (1D horizontal). New targets `soft1`, `soft2` (unthresholded 1/2, 1/4), `tent3/2/1`, `streak`; units 10 to 14.

- [ ] Soft fill: `pre` with threshold 0 into `soft1`, `down` into `soft2`; compose adds `max(res, mix(soft1, soft2, .5) * softAmount)`.
- [ ] Tent bloom: `tent3 = up(l4) + l3*w3`, `tent2 = up(tent3)*.5 + l2*w2`, `tent1 = up(tent2)*.5 + l1*w1`; compose uses `tent1` for bloom when `tentOn`.
- [ ] Streak: 24-tap horizontal blur of `l2` into `streak` (1/4 size); compose adds it tinted.
- [ ] Targets are made in `ensure()`, freed in `dispose()`, and only drawn when the flag is on.

### Task 4: Panel controls

**Files:** Modify `index.html` (new block in the STACK panel), `src/ui/Panel.ts` (toggle keys, mix-mode buttons).

- [ ] Block "FINISH" with a toggle and slider per pass; mix-mode seg buttons `data-mixmode`.
- [ ] Add the six flags to `toggleKeys`; `bindMixMode` and sync like `bindGlowPat`.

### Task 5: Verify, review, log, commit

**Files:** Create `scripts/verify-finish.mjs`; Modify `docs/PROJECT_LOG.md`.

- [ ] Playwright: for each pass, turning it on changes the canvas pixels; turning all on then off restores the original frame; no page errors, no GL errors; resize with passes on; 390 px width, no horizontal scroll.
- [ ] Frame time with every pass on versus off (report numbers).
- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run build:hero` gzip size.
- [ ] Ponytail review of the diff; fix findings.
- [ ] Log entry; commit only on the owner's word.
