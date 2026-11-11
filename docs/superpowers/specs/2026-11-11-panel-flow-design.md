# Panel flow design: the right-hand panel for first-time and returning users

Date: 2026-11-11
Scope: the web studio's side panel only (`index.html` panel markup, `src/ui/Panel.ts`, `src/ui/panel.css`, `src/ui/tokens.css`). The canvas, particle engine, depth system and shaders stay as they are.

## 1. Intent and why

The canvas already looks right to the owner. The panel does not. Its controls are all there, but they sit in groups that do not follow how a person uses the app, and spacing and hierarchy differ from block to block. A new visitor cannot tell what to do first.

The panel should follow the order a person works in:

1. Look at a picture.
2. Pick an effect.
3. Adjust the picture (image settings).
4. Adjust particle emission (emitter settings).

A new visitor should understand this order from the screen alone, without docs.

## 2. Goals

- A new user opens the app and sees a working canvas at once: a default picture, no effect, no emitters.
- The panel reads top to bottom in the order of section 1.
- Every existing control stays. Nothing is removed.
- Image slots and effect picker are always visible.
- Image settings and emitter settings sit in separate tabs, and switching between them is one click.
- Spacing, type size and section headings follow one scale.

## 3. Non-goals

- No new effects, controls or engine behaviour.
- No change to what any slider does.
- No change to the canvas, the particle system, the depth pipeline or the export.
- No change to the hero embed (`src/hero.ts`).
- No redesign of the top bar, the help overlay, the export dialog or the music modal.

## 4. Anti-goals (what would make this a failure even if it works)

- A tab that hides a control a returning user needs every visit.
- Any control that moves when the user switches tabs or effects.
- Hidden state: a user changes something and cannot find where it went.
- A first-run tour, modal or overlay that blocks the canvas.

## 5. Layout

Top to bottom in the right-hand panel:

| Order | Block | Always visible | Content |
|---|---|---|---|
| 1 | Picture slots, merged with the effects header | Yes | Five slots. Tapping a slot puts that picture on the canvas. |
| 2 | Tab bar | Yes | Four tabs in this order: **Effect** \| **Image** \| **Emitter** \| **Video**. One open at a time. |
| 3 | Tab body | One tab at a time | The open tab's controls. |

Opening state: the **Effect** tab is open. The default picture is on the canvas, with no effect applied.

### 5.1 Picture slots (block 1)

- Five slots, numbered 1 to 5, always shown. Slot 1 holds the default picture.
- Tapping a slot makes it the active picture on the canvas and marks it active.
- A slot with no picture shows an empty state, not a missing box.
- The add control sits in the slot row (per the current markup, the picture row already has an add control).

### 5.2 Effect tab

- Effect tiles grouped by category, as today (METAL, GLOW, DITHER, GLASS, SURFACE and so on). Each category is a labelled group.
- The effect-specific settings for the chosen effect appear under the tiles, as today.
- Contains the **Effects** section (EFFECTS / STACK switch, sub-tabs LOOK, MOTION, LIGHT, SURFACE, RESET) and the **Particle effects** section (PRESET, PARTICLE COLOUR, drift).
- Opening state: no effect selected; the picture shows as-is.

### 5.3 Image tab

- One block named **COLOUR AND TONE**, with the controls in this order: PICTURE (COLOUR / GREY), OPACITY, SHADOWS, HIGHLIGHTS, MIDTONES, CONTRAST, HUE, SATURATION.
- The RESET control for this block stays in the block heading.

### 5.4 Emitter tab

- The ON toggle first.
- Below it, the region grid: TOP LEFT, TOP, TOP RIGHT, LEFT, CENTRE, RIGHT (and the lower row as in the markup).
- Emitter controls are off by default, so a new user sees no emitter effect until they turn them on.
- Also contains **Particles and trails**, **Reactions** and **Music**: everything that makes dots leave the picture or move.

### 5.4b The video view

The studio has two views: the lab (default) and the video view (`?view=video`, `src/main.ts:76`). The VIDEO section is hidden in the lab by existing CSS. Resolved at build time (builder's call, owner may veto): the Video tab is shown only in the video view, where it opens first and the picture strip is hidden (as the old `#source-box` was). In the lab the Video tab is hidden, so it is never an empty tab.

### 5.5 Where every existing section goes

| Existing section | Tab |
|---|---|
| Effects (EFFECTS/STACK, LOOK, MOTION, LIGHT, SURFACE, RESET) | Effect |
| Particle effects (PRESET, PARTICLE COLOUR, drift) | Effect |
| Colour and tone | Image |
| Emitters | Emitter |
| Particles and trails | Emitter |
| Reactions | Emitter |
| Music | Emitter |
| Video (open, pick the part, build depth, play) | Video (its own tab; owner decision 2026-11-11, added after the reviewer check) |

Decided by the owner, 2026-11-11 (recommendation accepted).

## 6. Hierarchy and visual rules

- One heading style for every block: a numbered or lettered mark, then the name, in the existing type scale. Block headings use the same size everywhere.
- One spacing unit for padding and gaps. Blocks use the same inner padding. Rows use the same vertical gap.
- The tab bar is visually heavier than the controls under it, so the tab bar reads as navigation.
- The active tab and the active picture slot use the same accent style, so the user connects the two.
- No control appears in two blocks.

## 7. Behaviour

- Tab switching changes only the tab body. It does not reset the effect, the picture or any setting.
- Choosing an effect does not change the Image or Emitter values.
- Picking a picture slot does not change the active tab.
- The panel keeps the last open tab for the session. (Assumption: not saved across reloads.)
- On first load: the default picture, Effect tab open, no effect, emitters off (`emitOn` false). This changes today's first-load canvas, which has emitters on.

## 8. Decisions made (my call, marked for the reviewer)

- **Default tab on load:** Effect. Stated by the owner.
- **Tab order:** Effect, Image, Emitter. Follows the flow in section 1. (My call from the owner's order of use.)
- **Picture slot count:** five. Stated by the owner. Current markup shows two slots and an add control. Treat this as a change to make.
- **Persistence of the open tab across reloads:** not saved. (My call; the owner did not say.)
- **Emitter default state:** off. Stated by the owner ("no particle emitters" on load).

## 9. Open points (for the owner)

1. **Decided:** picture row merged with the effects header. One box holds the picture slots and the Effect tab header. Current markup has them as two boxes ("01 PICTURE" and "02 EFFECTS"), so the builder merges them.
2. **Decided:** all five slots always shown, including empty ones.
3. **Decided:** emitters off on load uses a separate ON flag (`emitOn`, already in the Emitter tab). Region values (`emit.r0..r8`, default 1) stay unchanged.
4. **Decided (supersedes the earlier "keep first load"):** emitters off on load. The first-load canvas therefore changes from today (today: `emitOn: true`, `src/core/params.ts:176`). Everything else in the first load stays as today.
5. **Decided:** picture dropzone ("DROP UP TO FIVE PICTURES") and slot delete both kept, in place.

## 10. Verification (when built, not now)

- Visual check in the browser at desktop and phone width, with the Playwright skill. Screenshot the first-load state and each tab.
- Each control still moves its value: one slider per tab checked by changing it and reading the canvas.
- No layout shift when switching tabs.
- `npx tsc --noEmit` and `npm test` pass.

## 11. Not decided here (for the builder)

- The exact pixel values for padding and type size, within the existing tokens.
- How the tab bar is coded: reuse the `top-word` button pattern or a new component.
- Whether the picture row and the effect header merge into one box or stay as two (see open point 1).
