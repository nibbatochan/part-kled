# Sidebar UX review: Particle Depth Studio (web build, branch `master-web`)

Research only. No UI was changed. Date: 2026-10-28.

Evidence rules used in this file:
- "Code fact" = read from `index.html`, `src/ui/Panel.ts`, `src/core/params.ts`, `src/core/styles.ts`, `src/ui/ExportPanel.ts`.
- Every guidance claim carries a URL. Sources I could not read, or could only see as a search snippet, are marked **UNVERIFIED**.
- No direct quotes are used. All source text is paraphrased.
- Counting method: a segmented group (for example the 7 look buttons) counts as ONE control; its buttons are not counted separately. A range slider counts as one control. Hidden per-slider number boxes (created in `Panel.bindValueInputs`) are not counted.

---

## 0. Headline findings

1. The sidebar is **70 controls** (incl. 18 per-look controls shown 2 to 4 at a time). On first load (image mode, DOTS look) **41 controls are on screen at once, 30 of them range sliders**. All seven boxes are open, there is no collapse.
2. Across the whole app (sidebar + header + export dialog + canvas tools + dropzone) there are **94 controls, 48 of them range sliders (51%)**.
3. Control type does vary a little (look picker, toggles, stepper, colour inputs), but the controls that decide the *first impression* (MOTION, PARTICLES, EMITTERS, EFFECTS) are almost all sliders with jargon labels and near-identical weight.
4. Sections 04 to 07 (and most of 05 and 06) are advanced for a first-time user but have the same weight as 02 STYLE.
5. Several label collisions will confuse new users: ANGLE (halftone, lines, drift dial), PAPER (ASCII dim fill vs DUO paper colour), SIZE (trail dot size vs export frame size), HOVER (push particles) vs CURSOR (tilt picture) vs PAN (icon that opens CURSOR/FLOAT), STRENGTH (drift) vs AMOUNT (pan, trails).
6. Code smells that affect UX (not fixed here):
   - `fx-reset` in section 07 also resets `params.trail` to `defaults.trail` (amount 0.35, length 0.6), not the start values in `withLightStart` (amount 1.1, length 0.3). A button labelled "Reset effects" silently changes the PARTICLES trail sliders (`Panel.bindEffects`).
   - `Panel.ts` binds `[data-travel]`, `[data-colormode]`, `.swatch-btn`, `#btn-next`, `#btn-light`, `#btn-add-pictures`, but none of those elements exist in `index.html` now. Params `travel`, `colorMode`, `light`, `lightOn`, `trails`, `splash`, `gather`, `draw` have no sidebar control.
   - Section number `V` (CLIP) is not part of the 01 to 07 numbering and appears only in VIDEO mode.
   - Default text in HTML (`in-strength` value 90) differs from the start value (55); the sync overwrites it, so only a flash risk.

---

## 1. AUDIT

Importance key: **P** = primary (a first-timer plausibly touches it in the first minute), **S** = secondary (touches it after the first change), **A** = advanced (most users never touch it).

Control types: RS = range slider, SEG = segmented buttons (one of N), TOG = on/off toggle button, STEP = stepper, COL = colour input, NUM = number box, DIAL = dial, ICON = icon button, BTN = push button.

All ranges and defaults come from `index.html` and `params.ts`. "Default" is the value after `withLightStart` (what the user sees on load), with the base `defaults` value in brackets where they differ.

### 1.0 Header and mode switch

| # | Label shown | What it does for the picture | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| H1 | PARTICLE DEPTH STUDIO (title) | Names the app. | static | - | - | - |
| H2 | Export icon (download arrow, no text) | Opens the export dialog to save an image or video. | ICON | - | - | P |
| M1 | LAB / VIDEO | Switches between pictures and video clips. | SEG (tabs) | 2 | LAB | S |

### 1.1 Section 01 SOURCE (2 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 01a | Picture slots 1, 2 (up to 5) | Chooses which uploaded picture is shown. | SEG-like thumbnails | 1 to 5 | slot 1 | P |
| 01b | + (add picture) | Opens the file picker to add a picture or video. | BTN | - | - | P |

### 1.2 Section V CLIP (VIDEO mode only, 6 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| Va | SET IN | Marks where the clip starts. | BTN | - | - | S |
| Vb | SET OUT | Marks where the clip ends (max 10 s). | BTN | - | - | S |
| Vc | PLAY | Plays or pauses the clip. | BTN | - | - | P |
| Vd | Playhead (aria-label only, no visible label) | Moves through the clip. | RS | 0 to 1 | 0 | P |
| Ve | OPEN VIDEO | Chooses a video file. | BTN | - | - | P |
| Vf | PREPARE | Estimates depth for each keyframe so the clip can play in 3D. | BTN | - | - | P (required step) |

### 1.3 Section 02 STYLE (7 shared + 18 per-look = 25 controls)

Shared (always present; items 02c to 02g hidden when look = DOTS):

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 02a | DOTS / HALFTONE / MOSAIC / DITHER / ASCII / STIPPLE / LINES | Picks how the picture is drawn (7 looks). | SEG (7, wraps in a grid) | 0 to 6 | DOTS | P |
| 02b | CELL | Size of one cell (disabled for DOTS, so it is a dead slider on first load). | RS | 4 to 24 px, step 1 | 8 | S |
| 02c | COLOUR: SOURCE / MONO / DUO | Uses the picture's colours, one ink colour, or ink on paper. | SEG (3) | 0 to 2 | SOURCE | S |
| 02d | INK | The ink colour (shown for MONO and DUO). | COL | hex | #ffffff | S |
| 02e | PAPER | The paper colour (DUO only). | COL | hex | #000000 | S |
| 02f | INVERT | Swaps light and dark. | TOG | on/off | off | S |
| 02g | AUTO LEVELS | Stretches brightness so the look uses its full range. | TOG | on/off | on | A |

Per-look (only the chosen look's group is shown; from `STYLE_SETTINGS` in `styles.ts`):

| Look | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| HALFTONE | SHAPE | Round, square, diamond, cross or line dots. | SEG (5) | 0 to 4 | ROUND | S |
| HALFTONE | ANGLE | Turns the dot grid. | RS | 0 to 90 deg | 45 | A |
| HALFTONE | DOT GAIN | Makes dots bigger and brighter or smaller. | RS | -0.5 to 0.5 | 0.15 | A |
| MOSAIC | COLOURS | Limits colours per channel (2 to 32). | RS | 2 to 32 | 32 | S |
| MOSAIC | GAP | Space between tiles. | RS | 0 to 0.3 | 0.06 | S |
| MOSAIC | ROUND | Rounds tile corners. | RS | 0 to 1 | 0 | A |
| MOSAIC | OUTLINE | Dark edge where brightness changes. | RS | 0 to 1 | 0 | A |
| DITHER | METHOD | Bayer 4, Bayer 8 or noise pattern. | SEG (3) | 0 to 2 | BAYER 8 | A |
| DITHER | LEVELS | Steps per colour; 2 = pure black and white. | RS | 2 to 6 | 2 | S |
| DITHER | BIAS | Makes the result brighter or darker. | RS | -0.25 to 0.25 | 0 | A |
| ASCII | RAMP | Which characters are used. | SEG (3) | 0 to 2 | CLASSIC | S |
| ASCII | PAPER | Dim fill behind each character. | RS | 0 to 0.3 | 0.1 | A |
| STIPPLE | DOT SIZE | Largest dot, as share of the cell. | RS | 0.1 to 0.6 | 0.35 | S |
| STIPPLE | DENSITY | How many cells get a dot. | RS | 0.25 to 2 | 1.2 | S |
| STIPPLE | JITTER | Regular grid (0) to scattered (1). | RS | 0 to 1 | 0.6 | A |
| LINES | MODE | Scan lines, hatching or cross-hatching. | SEG (3) | 0 to 2 | SCAN | S |
| LINES | ANGLE | Direction of the lines. | RS | 0 to 180 deg | 0 | A |
| LINES | WEIGHT | Line thickness. | RS | 0.5 to 2 | 1 | S |

Per-look totals: 4 SEG + 14 RS = 18. Section 02 totals: 25 controls, 15 sliders (CELL + 14).
Maximum shown at once: shared 7 + largest group (MOSAIC, 4) = 11. On load (DOTS): 2 (picker + disabled CELL).

### 1.4 Section 03 MOTION (3 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 03a | FLOW | How strongly particles drift and swirl around the picture. | RS (shown %) | 0 to 1 | 0.30 [0.6] | P |
| 03b | DEPTH | How far near and far parts of the picture separate in 3D. | RS (%) | 0 to 1 | 0.50 | P |
| 03c | LEAN | Which side of the picture the particles come from (centre = all sides); bright parts go one way, dark the other. | RS (signed) | -1 to 1 | 0 | A |

### 1.5 Section 04 MODES (5 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 04a | HOVER: ON | Particles react to the mouse cursor. | TOG | on/off | **off** (start) [on] | S |
| 04b | HARSH / SOFT | Strong push that follows cursor motion, or a gentle push away (disabled while HOVER is off). | SEG (2) | old / soft | HARSH | A |
| 04c | SCANNER: ON | A moving effect passes over the picture and lifts particles. | TOG | on/off | **on** | S |
| 04d | scan style button (shows SWEEP, RING, DEPTH, BURST or PULSE; click cycles) | Chooses which of 5 scan effects plays. Cycle-only: you cannot see the options. | BTN (cycle) | 5 values | BURST | S |
| 04e | scan level - [3] + | How strong the scan is. | STEP | 1 to 5 | 3 | S |

Section 04 totals: 5 controls, 0 sliders. Note: the only stepper in the app, and the only "cycle button" (hidden option list).

### 1.6 Section 05 PARTICLES (6 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 05a | RANDOM | How different each particle's path is (direction and distance). | RS (%) | 0 to 1 | 0.10 [0.3] | A |
| 05b | PART SAT | How colourful the drifting particles are. | RS | 0 to 2 | 1 | S |
| 05c | SIZE | Dot size of the drifting particles. | RS | 0.2 to 3 | 0.45 [1] | S |
| 05d | TRAIL DIR | Bends the trails away from the drift direction. | RS | -60 to 60 deg | 0 | A |
| 05e | TRAIL LEN | How long each trail is; negative trails forward, positive trails back. | RS (signed) | -1 to 1 | 0.30 | S |
| 05f | TRAIL AMT | How many particles leave a trail. | RS | 0 to 2 | 1.10 | S |

Section 05 totals: 6 controls, 6 sliders.

### 1.7 Section 06 EMITTERS (14 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 06a | ON (header) | Turns region-based shedding on. Off = by brightness only. | TOG | on/off | on | S |
| 06b-j | 9 unlabelled sliders in a 3x3 grid (aria-labels TOP LEFT ... BOTTOM RIGHT; the label is only in the tooltip) | How many particles each region of the picture sheds (1 = normal, 0 = none). | 9 x RS | 0 to 2 | 1 | A |
| 06k | SPOTS | A few small bright patches shed far more particles. | RS (%) | 0 to 1 | 0 | A |
| 06l | SCATTER | Moves where each trail starts so it is not an exact pixel. | RS (%) | 0 to 1 | 0.35 | A |
| 06m | LEN VARY | How different trail lengths are; 0 = all same. | RS (%) | 0 to 1 | 1 | A |
| 06n | TURN | Each trail leans a small random angle off the common direction. | RS (%) | 0 to 1 | 0.3 | A |

Section 06 totals: 14 controls, 13 sliders. Largest block in the sidebar, rated advanced, yet it is open on load. A 3x3 grid of unlabelled horizontal sliders is also a poor map of "regions of a picture".

### 1.8 Section 07 EFFECTS - IMAGE (8 controls)

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| 07a | RESET (header) | Resets the 7 effect sliders AND the `trail` object (see headline finding). | BTN | - | - | S |
| 07b | OPACITY | How see-through the picture is (not the trails). | RS | 0 to 1 | 1 | S |
| 07c | BLACK | Black point: crushes shadows to black. | RS | 0 to 0.5 | 0 | A |
| 07d | WHITE | White point: pushes highlights to white. | RS | 0.5 to 1 | 1 | A |
| 07e | GAMMA | Midtone brightness. | RS | 0.4 to 2.2 | 1 | A |
| 07f | CONTRAST | Difference between light and dark. | RS (signed) | -1 to 1 | 0 | S |
| 07g | HUE | Rotates colours around the colour wheel. | RS | -180 to 180 deg | 0 | S |
| 07h | SATURATION | Colour strength of the picture. | RS | 0 to 2 | 1 | S |

Section 07 totals: 8 controls, 7 sliders.

### 1.9 Export dialog (opened from header icon): 13 controls

| # | Label | What it does | Type | Range / options | Default | Use |
|---|---|---|---|---|---|---|
| E1 | Close (X) | Closes the dialog. | ICON | - | - | P |
| E2 | RATIO (8 chips) | Shape of the saved frame (16:9, 9:16, 9:19.5, 1:1, 4:5, 4:3, 3:4, 21:9). | SEG (8) | 8 | 16:9 | P |
| E3 | CUSTOM W : H | Type your own frame shape. | 2 x NUM | 1 to 99 | 16 : 9 | A |
| E4 | THIS SCREEN | Matches the frame to this screen. | BTN | - | - | S |
| E5 | SIZE | Output resolution (480P, 720P, 1080P, 2K, 4K). | SEG (5) | 5 | 1080P | P |
| E6 | ZOOM | Zoom of the picture inside the frame. | RS | 0.3 to 6 | 100% | S |
| E7 | PICTURE: FIT / FILL / RESET | Fits the whole picture, fills the frame, or goes back to the live view. | 3 x BTN | - | - | P |
| E8 | TYPE: IMAGE / VIDEO / LOOP | What to save. | SEG (3) | 3 | IMAGE | P |
| E9 | FORMAT | File type (PNG, JPG, WEBP / MP4, WEBM). | SEG (2 or 3) | - | PNG / MP4 | S |
| E10 | FPS | Video frame rate (video and loop only). | SEG (2) | 30, 60 | 30 | A |
| E11 | LENGTH | Clip seconds (video and loop only). | RS | 2 to 20 s (loop min 4) | 8 s | S |
| E12 | EXPORT / CANCEL | Starts or cancels rendering. | BTN | - | - | P |
| E13 | Preview drag and wheel | Moves the picture and zooms in the preview (hint text only). | direct manipulation | - | - | S |

Totals: 13 controls, 2 sliders. This dialog is the best-organised part of the app (FRAME / VIEW / OUTPUT groups, live preview, conditional rows). It is evidence that the owner already knows how to build a grouped layout.

### 1.10 Canvas tools and overlays: 10 controls

| # | Label | What it does | Type | Range | Default | Use |
|---|---|---|---|---|---|---|
| C1 | Hand icon (title "Pan") | Opens a small panel with CURSOR, AMOUNT and FLOAT. | ICON (popover) | - | closed | S |
| C2 | CURSOR: ON | The picture turns in 3D toward the mouse. | TOG | on/off | on | S |
| C3 | AMOUNT | How far the picture turns. | RS (%) | 0 to 1 | 0.25 | S |
| C4 | FLOAT: ON | The picture hovers up and down slowly. | TOG | on/off | off | A |
| C5 | 3D (cube icon) | Drag to rotate in any direction; wheel moves through the picture. | ICON toggle | on/off | off | S |
| C6 | Full screen icon (key F) | Enters or leaves full screen. | ICON | - | - | S |
| C7 | Drift dial (compass) | Aims the drift direction; distance from centre sets strength. Double-click resets. | DIAL | 360 deg x 25 to 100% | 31 deg, 55% | P |
| C8 | ANGLE (number beside dial) | Typed drift direction. | NUM | -180 to 180 | 31 | A |
| C9 | STRENGTH (number beside dial) | Typed drift strength. | NUM | 25 to 100 | 55 | A |
| C10 | CHOOSE PICTURES (dropzone) | Opens the file picker; shown when no picture is loaded. | BTN | - | - | P |

Not controls but state: frame readout "01 / 01 3B4E83186AA6E41A83DDEE" (a hex ID with no explanation), loader "ESTIMATING DEPTH..." with progress bar. Keyboard shortcuts SPACE (turn page), S (light), F (full screen) are only shown in the dropzone sub-text and one tooltip; they disappear once a picture is loaded.

### 1.11 Counts

| Area | Controls | Range sliders | Visible at first load (image mode) |
|---|---|---|---|
| Header + mode switch | 2 | 0 | 2 |
| 01 SOURCE | 2 | 0 | 2 |
| V CLIP (video mode) | 6 | 1 | 0 |
| 02 STYLE (shared 7 + per-look 18) | 25 | 15 | 2 (picker + disabled CELL) |
| 03 MOTION | 3 | 3 | 3 |
| 04 MODES | 5 | 0 | 5 |
| 05 PARTICLES | 6 | 6 | 6 |
| 06 EMITTERS | 14 | 13 | 14 |
| 07 EFFECTS | 8 | 7 | 8 |
| **Sidebar subtotal** (rows above: 2 + 2 + 6 + 25 + 3 + 5 + 6 + 14 + 8) | **71** (70 without the export icon) | **45** | **42** (41 without the export icon; this is the "41" quoted in the headline) |
| Export dialog | 13 | 2 | 0 (hidden) |
| Canvas tools + dropzone | 10 | 1 | 9 (dropzone only when empty) |
| **Grand total** | **94** | **48 (51%)** | about 52 on screen at once |

Sliders in the sidebar on first load: CELL (disabled) + 3 + 6 + 13 + 7 = 30 (29 usable). Plus AMOUNT inside the closed pan popover.

### 1.12 Audit conclusions

- Hierarchy: all seven boxes share the same size, border, heading style and open state. Only the number prefix (01 to 07) implies order; it implies a workflow that does not exist (EFFECTS-IMAGE at 07 is a colour grade a new user may want earlier than EMITTERS).
- Primary user goals on first visit (my inference, not measured): see something move, try a different look, get the picture to look "mine", save it. These map to: SOURCE, STYLE picker, FLOW and DEPTH, drift dial, EXPORT. That is 6 to 8 controls; the sidebar shows about 41 in the sections.
- Control-type mismatch: 13 sliders in EMITTERS are really 9 "per-region weights" (a map) + 4 "variety" amounts; 14 per-look sliders hide inside a picker; RS used for angles (TRAIL DIR, ANGLE x2, HUE, LINES ANGLE), for steps (COLOURS 2 to 32, LEVELS 2 to 6), and for signed bidirectional values (LEAN, TRAIL LEN, CONTRAST, BIAS) with no centre marker.
- Value readout: the number is shown in a tiny `output` that turns into a number box on click (discoverability is low; no visible affordance).
- Discoverability: scan style is a cycle button (you must click to see the next name), pan lives under an icon, export under an icon with no text, drift under a dial at bottom right far from MOTION.
- Naming: jargon and abbreviations (LEAN, PART SAT, TRAIL DIR, TRAIL AMT, LEN VARY, HARSH, BURST, GAMMA, BIAS, RAMP, DOT GAIN). Tooltips exist for many but tooltips need hover and do not exist on touch.

---

## 2. HIERARCHY

### 2.1 What the sources say (and do not say)

| Principle | What the source says (paraphrased) | URL | Use here |
|---|---|---|---|
| Progressive disclosure | Show a few most important options first and reveal specialised ones on request; showing something up front signals importance; novices make fewer mistakes, experts save scanning. | https://www.nngroup.com/articles/progressive-disclosure/ | Core of the proposal. |
| Choosing what is primary | Use task analysis and field studies for new designs, frequency-of-use data for existing systems, and observation, since traffic can be accidental. | same | Basis for the 5-user test in section 7. |
| Levels | Two levels is the practical norm; three or more often leave users lost. | same | Limit to: visible, and one "More" level. Avoid nested disclosures inside disclosures (the current STYLE has a per-look layer inside the section; keep it as the single second level). |
| Disclosure access | Make the route to secondary options obvious and label it so users can predict what they find. | same | Disclosure headers must say what is inside ("Fine tune motion", not "More"). |
| Accordions | Good for independent sections when most users do not need most of the content; bad when most users need most sections, or when headings do not summarise their content. | https://www.nngroup.com/articles/accordions-on-desktop/ | Use for sections 04 to 07; keep 01 to 03 always open. |
| Accordion details | Allow several panels open at once; add Expand all / Collapse all; make heading and icon both clickable; headings must predict content. | same | Multi-open, not auto-collapse; creative users compare settings across panels. |
| Hidden content risk | Hidden content is easily missed; crucial information should not be buried in collapsed panels. | same | Put live summary text on collapsed headers so state stays visible. |
| F-pattern | People scan in an F shape on unformatted pages; distinct headings that start with their most informative words help; group related content visually. | https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/ | Section headers: put the plain-language noun first ("Look", "Motion"); the left edge of the panel is where eyes travel. Caveat: the finding is about reading text pages; applying it to a control panel is my extrapolation (UNVERIFIED for panels). |
| Hick's law | **UNVERIFIED in a primary source.** An NN/g video page on long menus exists (https://www.nngroup.com/videos/hicks-law-long-menus/) and, per its search snippet, says more options lengthen decision time but other techniques can keep long menus usable; I could not read the page. The formula RT = a + b log2(n) appears in secondary sources only (https://en.wikipedia.org/wiki/Hick%27s_law). | - | Use only as supporting rationale; do not rely on it for numbers. |
| Accessibility of disclosure | Header is a button inside a heading; `aria-expanded` reports state; Enter or Space toggles; `aria-controls` links to the panel. | https://www.w3.org/WAI/ARIA/apg/patterns/accordion/ and https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ | Implementation spec for collapsible boxes. |

### 2.2 Tiering of current sections

| Tier | Sections / items | Why |
|---|---|---|
| **Primary** (visible on landing, always open) | Picture (01), Look picker + one size control (02a/02b), Motion preset chips + 2 sliders (03a/03b), Export button | They answer: what am I looking at, how does it look, how does it move, how do I save it. |
| **Secondary** (collapsed accordion, summary on header) | Reactions (04 MODES: hover and scan), Particles and trails (05), Colour and tone (07 effects) | Visible change, but not needed in the first minute. |
| **Advanced** (collapsed, behind a second "Advanced" disclosure inside the section) | Emitters (06), per-look fine controls (halftone angle, dot gain, outline...), LEAN, RANDOM, TRAIL DIR, levels (BLACK/WHITE/GAMMA), export CUSTOM ratio, FPS | Rarely touched; powerful for experts. |
| **Move out of sidebar** | Drift dial (already on canvas), pan/3D/full screen (already), possibly scan toggle and emitter map (see section 6) | Direct manipulation fits them better. |

### 2.3 Proposed outline

Default state at first load (image mode, picture loaded):

| Order | Section name (plain) | Replaces | Default | Contents visible on load | Controls visible |
|---|---|---|---|---|---|
| Header | Title + **Export** button (text label plus icon) | H2 icon-only | always | Export | 1 |
| 1 | **Picture** | 01 SOURCE | open | Thumbnails, add | 2 |
| 2 | **Look** | 02 STYLE | open | 7 look chips (thumbnails), Size slider; "More for this look" disclosure closed | 2 |
| 3 | **Motion** | 03 MOTION | open | Preset chips Calm / Flow / Storm (3 chips as one SEG), "Movement" and "3D depth" sliders; "Fine tune" disclosure closed | 3 |
| 4 | **Reactions** | 04 MODES | closed, summary "Light sweep: Burst. Cursor push: off" | - | 0 |
| 5 | **Particles and trails** | 05 PARTICLES | closed, summary "Size 0.45 . Trails 110%" | - | 0 |
| 6 | **Colour and tone** | 07 EFFECTS + COLOUR/INK/PAPER/INVERT from 02 | closed, summary "Source colours" | - | 0 |
| 7 | **Emitters** (advanced) | 06 EMITTERS | closed, summary "Even on all regions" | - | 0 |

Visible at first load: **8 controls** (header Export 1 + Picture 2 + Look 2 + Motion 3), against 41 section controls today (about 80% fewer). Four collapsed headers show a one-line live summary. The "More" disclosures inside Look and Motion are the single second level (compliant with the two-level norm).

Reasoning tied to sources:
- Few items up front, specialised ones on request: https://www.nngroup.com/articles/progressive-disclosure/
- Accordions suit independent sections where most users do not need most content: https://www.nngroup.com/articles/accordions-on-desktop/ . Sections 04 to 07 are independent of each other; 01 to 03 are needed by almost everyone, so they stay open (the accordion article warns against hiding what most users need).
- Several panels open at once, plus Expand all: same article.
- Summaries on collapsed headers address the "hidden content is easily missed" risk.
- Moving COLOUR / INK / PAPER / INVERT / AUTO LEVELS out of LOOK and into Colour and tone removes the cell-look-only controls that appear and vanish when the look changes (a layout jump, and a mixed-concern box).
- Open question: whether "Reactions" (scan, hover) should be open on load. Scan is ON and BURST by default, so something moves; the user may want to turn it off quickly. Recommended: closed with a summary toggle in the header (see section 3).

---

## 3. UI CHANGES

### 3.1 Layout

| Change | Detail | Trade-off |
|---|---|---|
| Collapsible section headers | Header = heading + button with `aria-expanded` (APG: https://www.w3.org/WAI/ARIA/apg/patterns/accordion/). Click anywhere on the header; caret on the left. | Costs one click for advanced users; mitigate by remembering open state in `localStorage` and by Expand all. |
| Live summary on collapsed headers | Short text of the key state: "Look: Halftone, size 8", "Motion: Flow 30%, depth 50%". | Needs a small summary function per section (low cost). Can go stale if not driven from `params`. |
| Header toggles for features | EMITTERS already has one. Add to Reactions (scan), Particles trails, and Colour effects. Pattern: toggle in header, body greys out when off. Toggle should take effect instantly: https://www.nngroup.com/articles/toggle-switch-guidelines/ and https://atlassian.design/components/toggle/usage | A header toggle plus a collapse caret on the same line needs good spacing and separate hit targets. |
| Per-group reset | Small RESET in each header (as 07 already does). Lightroom Classic documents double-clicking a slider name to reset one slider and Alt/Option-click on the group name for the group (from search snippet of https://helpx.adobe.com/lightroom-classic/help/keyboard-shortcuts.html : **UNVERIFIED**, page not fetched). Fix the existing RESET so it only resets effects. | Reset buttons add clutter; show only on hover/focus or when the group differs from default (a dot indicator). |
| "Changed" indicator | Dot or highlighted label on any control that differs from default. | Requires default tracking (params already has `defaults`; low cost). |
| Sticky header and sticky Export | Keep title and Export visible while the console scrolls. | Takes vertical space on short screens. |
| Width | Console is about a quarter of the window; slider rows are cramped. Keep width but give labels their own line above the slider (NN/g notes labels are better above or beside the slider so a finger does not hide them: https://www.nngroup.com/articles/gui-slider-controls/ ). | More vertical space per row; offsets by hiding 30 of 41 controls. |
| Section numbers 01 to 07 | Remove or use only for the first three ("1 Picture, 2 Look, 3 Motion"). The numbers imply a sequence that sections 04 to 07 do not have. | Loses the engineered look the owner likes; keep numbers in a quieter colour. |

### 3.2 Labels: plain language

Rules: put the key term first (F-pattern and NN/g toggle label guidance: https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/ , https://www.nngroup.com/articles/toggle-switch-guidelines/ ), describe the effect on the picture, avoid abbreviations, and keep one meaning per word. Wording below is a proposal to be validated in testing.

| Current | Problem | Proposed label | Helper text (short) |
|---|---|---|---|
| FLOW | Ambiguous (flow of what?) | Movement | How much the particles drift around. |
| DEPTH | Fine, but combined with "relief" in code | 3D depth | How far near and far parts separate. |
| LEAN | Jargon | Side bias (or "Drift side") | Which side particles come from. Centre = all sides. |
| HOVER / HARSH / SOFT | HOVER is vague; HARSH sounds negative | Cursor push: Strong / Gentle | Particles move away from your mouse. |
| SCANNER | Sounds like a document scanner | Light sweep | A moving band of light passes over the picture. |
| SWEEP / RING / DEPTH / BURST / PULSE | One-word names, hidden behind a cycle button | Sweep, Ring, Depth, Burst, Pulse as visible chips with tiny icons; helper under the selected one: "Burst: particles pop outward from a point." | Needs real descriptions per mode (UNVERIFIED which are accurate; owner to write). |
| scan level (3) | Number with no unit | Strength 1 to 5 | - |
| RANDOM | Random what? | Variety | How different each particle's path is. |
| PART SAT | Abbreviation | Particle colour | Colour strength of the drifting particles. |
| SIZE (05) | Collides with export SIZE | Particle size | - |
| TRAIL DIR | Abbreviation | Trail bend | Turns trails away from the drift path. |
| TRAIL LEN | Abbreviation; signed range is confusing | Trail length (ends labelled "Forward" and "Behind") | - |
| TRAIL AMT | Abbreviation | Trails (amount) | How many particles leave a trail. |
| SPOTS | Unclear | Hot spots | Some bright patches shed far more particles. |
| SCATTER | Close to RANDOM | Start jitter | Trails start slightly off the exact pixel. |
| LEN VARY | Abbreviation | Length variety | 0 = all trails the same length. |
| TURN | Collides with ANGLE meanings | Angle variety | Each trail leans a little off the common direction. |
| 9 unlabelled sliders | Meaning only in tooltip | Region map (see section 5) | - |
| BLACK / WHITE / GAMMA | Photo jargon | Shadows / Highlights / Midtones, or one "Levels" control | - |
| EFFECTS - IMAGE | Unclear; "image" vs particles | Colour and tone | Adjusts the picture's colours (not the trails). |
| COLOUR: SOURCE / MONO / DUO | OK | Colours: Original / One ink / Ink on paper | - |
| AUTO LEVELS | Jargon | Auto contrast | Stretches brightness to fill the look. |
| DOT GAIN, BIAS, RAMP, METHOD | Print/dither jargon | Dot growth, Brightness shift, Characters, Pattern | - |
| ANGLE (three places) | Collision | Grid angle (halftone), Line angle (lines), Drift direction (dial) | - |
| PAPER (two places) | Collision | Background colour (duo), Fill behind letters (ASCII) | - |
| HEX "3B4E83186AA6E41A83DDEE" in frame readout | Meaningless | Picture 1 of 2 (hide the hash) | - |

### 3.3 Helper text and tooltips

- Today: `title=` tooltips exist on most controls but need mouse hover, are invisible on touch, and are not reliably read by assistive tech. Material Design and Apple guidance on tooltips and on slider value labels could not be fetched (**UNVERIFIED**).
- Proposal: (1) one-line visible helper under the group headline for primary controls; (2) `title`/tooltip kept for advanced ones; (3) an inline "?" popover per section with a 2-line description and a tiny before/after; (4) value units always visible (%, degrees, px).
- Trade-off: visible helper text raises height per row. Use only for the 8 primary controls and for modes whose names are not self-explanatory.

### 3.4 Progressive disclosure inside sections

- Look: always show the picker + Size; put per-look settings behind "More for this look" (closed). Currently 14 per-look sliders are one click away but rendered inline at full weight.
- Motion: preset chips + two sliders; "Fine tune" reveals Side bias, Variety.
- Keep to two levels (visible, and "More"). Source: https://www.nngroup.com/articles/progressive-disclosure/ .

### 3.5 Search / quick find

| Option | Pro | Con | Verdict |
|---|---|---|---|
| Search box in the sidebar | Finds "trail" quickly; Unity's Add Component popup is searchable (UNVERIFIED, general knowledge only: the Unity Inspector docs page I fetched did not describe it: https://docs.unity.com/en-us/engine/current/manual/unity-editor/editor-windows-views-reference/using-the-inspector ) | With about 60 controls and good grouping, search adds clutter; a first-timer does not know the vocabulary they would search | Not recommended now. Revisit if controls exceed about 100 or presets grow. |
| Keyboard command palette (Ctrl+K) | No visual cost; helps power users | Hidden; discoverability only for experts | Optional later. |

### 3.6 What can move out of the sidebar

| Element | Move to | Pros | Cons |
|---|---|---|---|
| Export | Header text button (already opens a modal) | Already moved out; make it a labelled primary button | Icon-only today; first-timers may not find it. |
| Pan / Cursor tilt / Float / 3D | Already a canvas toolbar | Good. Rename hand icon "Tilt" so it does not clash with "pan" (drag to move) | Popover contents (CURSOR, AMOUNT, FLOAT) is itself a mini sidebar. |
| Scan toggle + mode | Canvas chip row or toolbar (section 6) | Visible effect next to the picture | Takes canvas space. |
| Emitter regions | On-canvas 3x3 overlay (section 6) | Spatial map matches the task | Covers the picture; mobile touch. |
| Reset all | Header overflow menu ("Reset to start") | Safe single escape hatch | Needs confirmation or undo. |
| Keyboard shortcuts | Help popover (a "?" icon) | Currently only seen in the empty dropzone | One more icon. |

---

## 4. CONTROL CHANGES

### 4.1 Evidence for control choice

| Source | Claim (paraphrased) | URL |
|---|---|---|
| NN/g sliders | A slider fits only when an approximate value or range is enough; if the exact number matters use something else; hard to control precisely on touch; labels above or beside; offer tap or type as an alternative where precision matters. | https://www.nngroup.com/articles/gui-slider-controls/ |
| Carbon slider | Use for choosing one number in a set range; pair the track with a label and a number input so users can type an exact value (or show the value in a tooltip if no input); avoid for very wide ranges, very narrow ranges (the page's own example is 1 to 3), and non-numeric values. | https://carbondesignsystem.com/components/slider/usage/ |
| NN/g toggle | Toggles are for two opposing states that apply immediately; label states what happens when on; key term first. | https://www.nngroup.com/articles/toggle-switch-guidelines/ |
| Carbon toggle | Toggle = single binary setting applied instantly; not for more than two options (use dropdown, radios or checkboxes). | https://carbondesignsystem.com/components/toggle/usage/ |
| Atlassian toggle | Simple on/off applied immediately; use a checkbox if a confirm press is needed. | https://atlassian.design/components/toggle/usage |
| Carbon content switcher | For alternate views of related content; short noun labels (2 to 3 words); one always selected; selection shows content at once. Do not mix icon and text items. | https://carbondesignsystem.com/components/content-switcher/usage/ |
| Segmented control (several design systems, search snippet only) | Small number of options (commonly 2 to 5), related, mutually exclusive, immediate effect, always one active, not for actions. | Trimble https://modus.trimble.com/components/in-field/segmented-controls/ , Visma https://designsystem.vismaspcs.se/development/documentation/docs/segmented-button-group/ , GitLab https://design.gitlab.com/components/segmented-control , Workday https://canvas.workday.com/components/buttons/segmented-control , Primer https://primer.style/product/components/segmented-control/accessibility (all **UNVERIFIED**: read through a search summary, not the pages). Apple HIG segmented controls page returned only its title: https://developer.apple.com/design/human-interface-guidelines/segmented-controls (**UNVERIFIED**). |
| APG slider | Slider role with `aria-valuenow/min/max`; `aria-valuetext` when the raw number is not meaningful; arrows step, Home/End jump; test on touch. | https://www.w3.org/WAI/ARIA/apg/patterns/slider/ |
| APG switch | `role="switch"` with `aria-checked`; label should not change with state; Space toggles. | https://www.w3.org/WAI/ARIA/apg/patterns/switch/ |
| APG radio | `radiogroup` of `radio`; arrows move and check; Tab enters and leaves the group. | https://www.w3.org/WAI/ARIA/apg/patterns/radio/ |

### 4.2 Recommendation by function type

| Function type | Examples in this app | Best alternative to a plain slider | Reason | When a slider IS right |
|---|---|---|---|---|
| Amount / intensity | FLOW, DEPTH, SATURATION, OPACITY, TRAIL AMT, scan level | Keep slider for the 2 or 3 primary ones; for the rest, one "Intensity" macro slider or a 3-step Low/Med/High SEG; stepper for scan level | Approximate value is enough and the user wants to see live feedback (NN/g: approximate is the use case). | Continuous, previewed live, approximate: FLOW, DEPTH, OPACITY, SATURATION. |
| Direction / angle | Drift dial (done), TRAIL DIR, HALFTONE ANGLE, LINES ANGLE, HUE | Dial for angles (drift already has it), with typed degrees; hue as a colour-ring slider with a gradient track | An angle is circular (0 and 360 meet); a linear slider has an artificial end. APG slider is linear; a dial needs custom ARIA (APG slider with `aria-valuetext`, UNVERIFIED for circular use). | Small bend ranges like -60 to 60 where centre = none. |
| On/off feature | HOVER, SCANNER, EMITTERS, CURSOR, FLOAT, INVERT, AUTO LEVELS | Switch in the section header or row, instant effect, label that reads well with "on" appended | NN/g and Carbon: toggles for instant binary settings. Today they are text buttons labelled "ON" that look like other buttons; state is by colour only. | Never (use a switch). |
| Mode choice 2 to 7 | Look (7), COLOUR (3), SCAN style (5), HARSH/SOFT (2), SHAPE (5), METHOD (3), RAMP (3), MODE (3), RATIO (8), SIZE (5), TYPE (3) | SEG for 2 to 5; icon/thumbnail chips for 5 to 8; never a cycle button | Segmented/content-switcher guidance: small related options, one always selected, immediate. The scan cycle button hides the option list. For 7 looks, thumbnails beat words (the user chooses by appearance). | Never for categorical choices. |
| Colour | INK, PAPER, picture colours | Colour input with small swatches (recent and palette), eyedropper from the picture | Native `input[type=color]` is already used; add swatches for source colours. | Not a slider. Use sliders only inside the colour picker (hue ring). |
| Size / scale | CELL, SIZE, DOT SIZE, WEIGHT, GAP | Slider with visible unit; stepper or SEG (S / M / L) for CELL | Cells are integers 4 to 24: a range of 21 values, wide for a slider (Carbon warns about very wide ranges); S/M/L chips plus a typed value is quicker. | Continuous sizes where the live preview guides the user. |
| Seed / randomness | RANDOM, SCATTER, LEN VARY, TURN, SPOTS | One "Variety" slider (macro) for the average user + a **Shuffle** button for a new seed; advanced three behind a disclosure | "Randomness" amount is a slider; "give me another one" is a button. There is no seed control or shuffle today (not found in code: UNVERIFIED that the engine exposes a seed). | The amount of variety, yes. |
| Time / speed | FLOW (partly), LENGTH (export), clip playhead | Slider for scrubbing and length (time is continuous); 30/60 SEG for fps; play/pause button | Scrubbing is a classic slider case. Add a pause button for the whole animation (not found today). | Playhead, duration. |
| Position / region map | EMITTERS 3x3 | **Region map**: a 3x3 grid on a thumbnail of the picture, each cell shaded by weight, click or drag up/down to change, click header to reset; optional on-canvas overlay | Position is spatial, so a spatial control removes the need to read 9 tooltips. Figma shows on-canvas handles for direct manipulation (corner radius handles on hover: https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing ). | If fine numerical weights are needed, a slider under the selected cell. |
| Preset looks | Motion (Calm, Storm, Scan in `presets`), Look | Preset chips with thumbnails; picking a preset sets many params; "Custom" chip when edited | `presets` already exists in `params.ts` (calm, storm, scan) but is not shown in the UI (not found in index.html). Presets lower the number of decisions for first-timers (progressive disclosure article: novices steered to useful features). | N/A. |

### 4.3 Mapping table: current control -> recommended control -> why

| Current | Recommended | Why |
|---|---|---|
| 02a look SEG (7 text buttons) | Chip row with a live thumbnail of the current picture in each look | Users choose looks by appearance. |
| 02b CELL slider (disabled in DOTS) | Hide in DOTS; otherwise "Size" S/M/L SEG plus number | Disabled controls invite confusion; wide integer range. |
| 02c COLOUR SEG | Keep SEG, move to Colour and tone | OK as is. |
| 02d/e INK / PAPER | Swatch buttons opening the colour picker; show only for One ink / Ink on paper | Already conditional. |
| 02f INVERT, 02g AUTO LEVELS | Two switches | Binary, instant. |
| HALFTONE SHAPE SEG | Icon chips (round, square, diamond, cross, line) | Shapes are pictures, not words. |
| HALFTONE ANGLE, LINES ANGLE | Angle dial or number, 0 to 90 / 0 to 180 | Angle is circular. |
| MOSAIC COLOURS (2 to 32) | Stepper or SEG (Few / Some / All) with number | Discrete and large steps. |
| DITHER LEVELS (2 to 6) | Stepper | 5 values only. |
| DITHER METHOD, ASCII RAMP, LINES MODE | SEG with icons or sample text | Already SEG; add examples. |
| 03a FLOW, 03b DEPTH | Keep sliders (primary), add preset chips Calm / Flow / Storm above | Approximate, live. |
| 03c LEAN (-1 to 1) | 3-position SEG Left / All / Right, "Fine tune" slider | Mostly used as 3 states; centre is the default. |
| 04a HOVER ON + 04b HARSH/SOFT | One row: switch + SEG Strong / Gentle (disabled until on) | Already similar; clearer labels. |
| 04c SCANNER ON + 04d cycle button | Switch + 5 chips (Sweep, Ring, Depth, Burst, Pulse) | Show all options; the cycle button hides them. |
| 04e scan level STEP | Keep stepper, label "Strength 3 of 5" or 5-dot SEG | Discrete 1 to 5. |
| 05a RANDOM | "Variety" slider (macro with LEN VARY, TURN) | Three similar concepts; one macro plus advanced. |
| 05b PART SAT | "Particle colour" slider | Approximate. |
| 05c SIZE | "Particle size" slider with unit | Approximate. |
| 05d TRAIL DIR | Small dial or slider with centre marker (0) and number | Signed; centre is meaningful. |
| 05e TRAIL LEN (-1 to 1) | Slider with "Forward / Behind" end labels and a centre mark | Signed range. |
| 05f TRAIL AMT | Switch "Trails" + amount slider (like Emitters) | Amount 0 means off; a switch is clearer. |
| 06a ON | Switch | Already a toggle; restyle. |
| 06b-j nine sliders | 3x3 region map (heat cells), on-canvas version later | Spatial task. |
| 06k-n SPOTS, SCATTER, LEN VARY, TURN | Four sliders under "Advanced" | Advanced. |
| 07b OPACITY | Slider | Approximate. |
| 07c-e BLACK / WHITE / GAMMA | A single "Levels" mini histogram with 3 handles, or hide behind "Advanced tone" | Levels is a 3-handle control in photo tools; three separate sliders hide the relationship. Lightroom/Photoshop practice is general knowledge (UNVERIFIED here). |
| 07f CONTRAST, 07h SATURATION | Sliders with centre marker | Signed or centred around 1. |
| 07g HUE | Gradient hue slider or colour ring | Visual feedback. |
| C3 AMOUNT (pan) | Slider | Fine. |
| C8/C9 ANGLE, STRENGTH number boxes | Keep, add unit labels (deg, %) | Exact entry is useful (NN/g: offer typing where precision matters). |
| E6 ZOOM | Slider plus % box; FIT/FILL chips | Already there; add typed value. |
| E11 LENGTH | Slider plus SEG 4 / 8 / 12 / 20 s | Common lengths as chips. |

Additional global fix: every slider shows its value in a click-to-edit `output` (hidden number box). Carbon recommends pairing a visible number input with the track (https://carbondesignsystem.com/components/slider/usage/); NN/g recommends typing as an alternative where precision matters (https://www.nngroup.com/articles/gui-slider-controls/). Make the box visible always (small, right aligned) or reveal on row hover/focus with a visible affordance.

---

## 5. GROUPING INTO INTERACTIVE COMPONENTS ("feature cards")

Card anatomy: header (title + optional switch + reset + collapse caret) -> one-line description -> primary control or preset chips -> optional live preview/direct action -> "Fine tune" disclosure -> live summary when collapsed. The Export dialog already follows the same idea (groups with a preview).

Cost classes: **Low** = mostly HTML/CSS/TS wiring using existing params; **Medium** = new rendering or a new custom control; **High** = new engine capability, shared canvas overlay interaction, or large cross-cutting refactor.

| Component | What it is | Pros | Cons | Cost | First-timer value |
|---|---|---|---|---|---|
| **Look card**: picker with thumbnails of the user's picture in each look | 7 chips each showing the current picture rendered in that look; selected one shows its primary setting (Size) and a "More" disclosure | Choose by appearance; fewer words; best answer to problem 4 (what does it do?) | Needs thumbnail rendering (7 small GPU renders, refreshed when the picture changes) or static sample thumbnails; thumbnails of a stale picture would mislead | Medium (static sample thumbnails: Low; live per-picture: Medium to High) | **Highest** |
| **Motion card**: presets Calm / Flow / Storm + "Customise" | Reuses `presets` in `params.ts` (calm, storm, scan exist). Chip applies several params; "Custom" appears after edits | Fewer decisions on first visit; teaches what params do by comparison | The existing presets mix motion with scan/trails/travel; define a clean motion-only set; need a "matches preset?" check to light the chip | Low to Medium | **High** |
| **Reactions card**: header switch "Light sweep" + 5 style chips + strength; second row "Cursor push" switch + Strong/Gentle | Groups 04 | Reveals options; consistent switches | Header switch plus chips can be heavy | Low | Medium |
| **Particles and trails card**: Trails switch; Size, Trail length, Amount; "Advanced" (Variety, Bend, Colour) | Groups 05 and the trail parts of 06 | Related controls near each other (problem 3) | Overlap with Emitters concept (trail variety now lives in 06) needs reshuffling | Low | Medium |
| **Emitters as region map** | Thumbnail of the picture with a 3x3 grid; each cell heat-coloured; drag vertical or click to set weight; "Spots", "Start jitter" etc. under Advanced | One spatial control replaces 9 sliders; strongest improvement for problem 2 | Custom control, touch and keyboard support (arrow keys per cell, ARIA grid); small cells; picture thumbnail needs updating | Medium (in-sidebar) to High (on-canvas overlay, see section 6) | Medium (it is advanced; but it removes the worst clutter) |
| **Colour and tone card**: colours SEG, ink/paper swatches, Auto contrast, Opacity/Contrast/Saturation/Hue, "Levels" disclosure | Merges 07 and shared parts of 02 | One place for colour (problem 3) | Mixed concerns between "particle colour" and "picture colour" must be explained | Low | Medium |
| **Header switch + live summary** pattern on every card | Collapsed state shows "Light sweep: Burst, strength 3" | Keeps state visible when collapsed | Summary strings need maintenance | Low | High (reduces fear of hidden state) |
| **Intensity macro slider** | One slider "Energy" driving FLOW, DEPTH, RANDOM, trail amount together | Fast exploration; one control instead of many | Hidden mapping may surprise experts; need to disclose "this moves 4 sliders"; hard to undo cleanly | Medium (needs a mapping design and tests) | Medium to High |
| **Shuffle / surprise me** button | Randomises look + motion within safe bounds | Delight; helps exploration | Needs seed handling; can produce poor results | Low to Medium | Medium |

Notes:
- Header toggles and presets are the cheapest and most effective step; they reuse existing params.
- Dependence: the Look thumbnails and Motion presets together change the first-impression flow the most.
- Evidence base: progressive disclosure article (novices steered to likely-useful features) https://www.nngroup.com/articles/progressive-disclosure/ . For comparable apps' use of presets and sliders (Lightroom presets panel, VSCO, CapCut, Canva) I could not fetch first-party pages (Adobe help returned 403): **UNVERIFIED**.

---

## 6. CANVAS PLACEMENT

### 6.1 Candidates

| Element | Direct-manipulation precedent | Pros | Risks | Recommendation |
|---|---|---|---|---|
| Drift direction dial (done) | Compass on the canvas, typed ANGLE and STRENGTH beside | Spatial, close to the result | Currently at bottom right, far from the Motion section; label is only a tooltip | Keep. Add a visible label "Drift direction". |
| Pan / 3D / Full screen (done) | Canvas toolbar | Common viewer pattern | Hand icon naming; popover with a slider and two toggles | Keep; rename "Tilt", add text tooltip. |
| Emitter region map overlay | On-canvas handles that appear on hover/selection: Figma shows corner-radius handles on hover and drags (https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing ) | Matches the mental model "this part of the picture sheds more"; zero sidebar controls | Covers the picture while editing; touch targets must be 44 px or similar (Apple/Material guidance not fetched: UNVERIFIED); conflicts with 3D drag and pan gestures; off-axis in 3D view | Phase 3. Edit only while the Emitters card is open (overlay shows only then), with a "Done" chip. |
| Scan on/off + style chips | Floating chip row | Visible effect while toggling | Occupies bottom or top edge; small screens | Phase 2 as an optional floating chip row; keep the toggle also in the sidebar summary. |
| Look picker as a floating chip row | Filter-chip row over the picture (common in photo editors; first-party sources not fetched: UNVERIFIED) | Keeps the picture central; one-tap look changes | Duplicates the sidebar; can cover the picture on mobile | Recommended only if the sidebar collapses on narrow screens; otherwise keep in sidebar with thumbnails. |
| Picture thumbnails as a bottom filmstrip | Filmstrip (common in photo tools; first-party sources not fetched: UNVERIFIED) | Larger thumbnails; saves 80 px in the sidebar | Competes with DRIFT dial and tools at the bottom; max 5 pictures so little benefit | Low priority. Keep in the sidebar (Picture). |
| Export button | Top bar | Always visible | Already header; the icon is unlabelled | Make it a labelled primary button in a sticky header. |
| Play/pause and speed | Bottom timeline bar | Needed for video mode | Overlaps tools | Consider with video mode work. |

### 6.2 Risks of on-canvas controls

- Occlusion: anything over the picture hides the result being edited; use auto-hide after a few seconds idle, and keep controls at the edges.
- Gesture conflict: canvas drag already means "turn picture" in 3D mode and wheel moves through depth; handles need their own hit areas and pointer-capture.
- Touch: `user-scalable=no` is set; small round buttons (18 px icons) are small for fingers. Apple and Material touch target figures were not retrievable (UNVERIFIED); common practice is about 44 pt (Apple) and 48 dp (Material) minimum, treat as UNVERIFIED here.
- Mobile layout: the console is a right column about a quarter of the window; on narrow screens this will need a bottom sheet. Not assessed because I did not open the page in a narrow viewport.
- Export frame: on-canvas overlays must not be baked into exports (already separate: export uses its own engine in `ExportPanel.ts`).

### 6.3 Recommendation

Keep canvas tools as is (drift dial, tilt, 3D, full screen). Do NOT add many more overlays now. Add one: an optional on-canvas **region map** for Emitters, shown only while that card is open, in a later phase. Everything else stays in the sidebar but gets grouped, collapsed and renamed.

---

## 7. RECOMMENDED OVERALL DIRECTION

**Direction:** keep the visual style (square borders, mono type, grid). Change the *structure*: three always-open "make it yours" cards (Picture, Look, Motion) with presets and thumbnails, followed by collapsed, summarised, resettable cards for everything else (Reactions, Particles and trails, Colour and tone, Emitters). Replace sliders with the control that fits (switches, chips with icons or thumbnails, region map, stepper), keep sliders for approximate, continuous amounts, and always show numeric values. Use plain-language labels with helper text on the primary controls. Move nothing else onto the canvas except the existing tools, and add an optional emitter map later.

### 7.1 Phased plan

| Phase | Scope | Changes | Cost | Expected effect on a first-time user |
|---|---|---|---|---|
| **1. Quick wins** (labels and grouping only; no new controls) | Rename labels (section 3.2); fix duplicate labels; collapse sections 04 to 07 by default with `aria-expanded` headers; add live summaries; fix 07 RESET so it only resets effects; label the 9 emitter sliders or at least show their names on hover and focus; make Export a labelled button; show shortcut hints in a help popover; hide CELL in DOTS | Low | Visible controls drop from 41 to about 11 (picture 2, look picker 1, motion 3, collapsed headers 4); jargon reduced. Time to first meaningful change should fall because the first screen has fewer decisions (to be measured). |
| **2. Medium** | Motion presets (Calm / Flow / Storm / Custom) using `presets`; header switches (Light sweep, Trails, Colour effects); scan style as visible chips; replace cycle button; stepper -> 5-dot SEG; switches restyled; per-look settings behind "More"; "changed from default" dots; per-group reset; always-visible numeric boxes | Low to Medium | New users see an immediate, cheap way to change the feel; fewer sliders (from 30 visible to about 2 on load). |
| **3. Larger redesign** | Look picker with live thumbnails of the user's picture; emitter region map (sidebar, then optional on-canvas overlay); Levels control; Energy macro slider and Shuffle; mobile bottom-sheet layout; collapsed-state persistence; onboarding tour of 3 steps | Medium to High | Highest comprehension at a glance; spatial control for position; fewer total controls on screen. |

### 7.2 Test plan with 5 first-time users

Rationale for n = 5 for finding problems comes from NN/g usability testing guidance (https://www.nngroup.com/articles/how-many-test-users/ : **UNVERIFIED**, not fetched; cited from general knowledge). Run it before and after Phase 1 with different users, same tasks. Use think-aloud, no hints, screen + audio recording, a laptop with a mouse.

Pre-test: use the same sample picture; load the page cold (clear `localStorage` key `particle_depth_studio_params_v3`).

Task list (read one at a time):
1. "Add a picture of your own." (SOURCE)
2. "Make it look like a halftone print." (Look)
3. "Make the particles move more." (Motion)
4. "Make the particles come out mostly from the left side." (LEAN, Emitters; tests labels)
5. "Turn off the moving light band." (Scanner)
6. "Make the trails longer." (Particles)
7. "Change the colours so it is black and white." (Colour)
8. "Put it back the way it started." (Reset)
9. "Save a square image for Instagram." (Export, ratio)

Measures (record per task):
- **Time to first change** (from page ready to first control touched that changes the picture), and time on task.
- **Success** (completed without help / with help / failed).
- **Errors**: wrong control touched, undo needed, wrong section opened.
- **Controls touched** (count of distinct controls) and **sliders dragged vs ignored**.
- **Sections opened/closed** (Phase 1 and later).
- **Comprehension questions** after the tasks: "In your own words, what does TRAIL DIR / LEAN / Side bias / Variety do?" (open answer, score 0 to 2); "Which part of the screen would you use to change X?" (location accuracy); "What do you think happens when you press the icon at the top right?" (Export discoverability).
- **Subjective**: 1 to 5 "overwhelming" and 1 to 5 "I felt in control".

Success thresholds (proposal, to adjust after the baseline): at least 4 of 5 users complete tasks 2, 3, 5 and 9 unaided; median time to first change under 15 s; at least 4 of 5 describe the primary controls correctly.

---

## 8. SOURCES

Read directly (content retrieved):
1. NN/g, Progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
2. NN/g, Slider design rules of thumb: https://www.nngroup.com/articles/gui-slider-controls/
3. NN/g, Accordions on desktop: https://www.nngroup.com/articles/accordions-on-desktop/
4. NN/g, Toggle switch guidelines: https://www.nngroup.com/articles/toggle-switch-guidelines/
5. NN/g, F-shaped pattern: https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
6. W3C APG, Accordion: https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
7. W3C APG, Slider: https://www.w3.org/WAI/ARIA/apg/patterns/slider/
8. W3C APG, Switch: https://www.w3.org/WAI/ARIA/apg/patterns/switch/
9. W3C APG, Disclosure: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
10. W3C APG, Radio group: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
11. Carbon, Slider usage: https://carbondesignsystem.com/components/slider/usage/
12. Carbon, Content switcher usage: https://carbondesignsystem.com/components/content-switcher/usage/
13. Carbon, Toggle usage: https://carbondesignsystem.com/components/toggle/usage/
14. Atlassian, Toggle usage: https://atlassian.design/components/toggle/usage
15. Figma Help, Right sidebar properties: https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar (panel is selection-driven with Design and Prototype tabs; collapse behaviour not stated)

Seen only through search summaries (treat as UNVERIFIED):
16. Figma Help, Corner radius on-canvas handles: https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
17. Adobe, Lightroom Classic keyboard shortcuts (slider reset by double-click, group reset by Alt/Option-click): https://helpx.adobe.com/lightroom-classic/help/keyboard-shortcuts.html
18. NN/g video on Hick's law and long menus: https://www.nngroup.com/videos/hicks-law-long-menus/
19. Hick's law (secondary, not relied upon): https://en.wikipedia.org/wiki/Hick%27s_law
20. Segmented-control guidance of Trimble, Visma, GitLab, Workday, Primer (URLs in section 4.1).

Could not retrieve (page text empty, blocked or truncated), therefore **UNVERIFIED** and not used for any claim:
- Apple HIG sliders / segmented controls / toggles / disclosure controls (pages returned only titles): https://developer.apple.com/design/human-interface-guidelines/sliders , .../segmented-controls , .../toggles , .../disclosure-controls
- Material Design 3 sliders: https://m3.material.io/components/sliders/guidelines
- Blender manual (Tabs & Panels, Input Fields; fetch truncated): https://docs.blender.org/manual/en/latest/interface/window_system/tabs_panels.html
- Unity Inspector (page lacks foldout details): https://docs.unity.com/en-us/engine/current/manual/unity-editor/editor-windows-views-reference/using-the-inspector
- Adobe Lightroom help pages (HTTP 403): https://helpx.adobe.com/lightroom-classic/help/develop-module-panels.html , https://helpx.adobe.com/lightroom-cc/using/edit-photos.html
- Polaris range slider (page moved): https://polaris.shopify.com/components/selection-and-input/range-slider
- Not attempted for lack of time: Spline, Rive, Procreate, Canva, DaVinci Resolve inspector, Cavalry, TouchDesigner, Particle Playground, Apple Photos edit mode, VSCO, CapCut. Any statement in this file about how those tools work is from general knowledge and is UNVERIFIED.
