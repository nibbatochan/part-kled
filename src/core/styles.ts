// src/core/styles.ts
// The cell looks (web build): their names, per-look settings and how those settings reach the shader.
// Kept free of DOM and GL code so the studio panel, the engine and tests share one description.

/** Look numbers: 0 DOTS (the point look), then the cell looks. Each look keeps its own cell, colour and tone. */
export const STYLE_NAMES = ['DOTS', 'HALFTONE', 'MOSAIC', 'DITHER', 'ASCII', 'LINES', 'LINED', 'WIRE', 'GLASS', 'CRT', 'BARS', 'STICKER', 'BLOOD SHADOW', 'SCAN', 'CROSS', 'BLOCKS', 'CLUSTER', 'PALETTE', 'INK', 'DISSOLVE', 'CGA', 'STIPPLE', 'PIXEL ART', 'HALO', 'AURA', 'CHROME', 'PRISMATIC', 'X-RAY', 'ECSTASY', 'BLIGHT', 'REDMET', 'SHAKE-MASK', 'CONVULSIONS'] as const; // 5 (LINES) and 14 to 16 are retired: their slots stay so the numbers do not move. 25 CHROME is a filter on the dots

/** Every look sits in one category; the LOOK picker shows them grouped. */
export const LOOK_CATEGORIES: { name: string; looks: number[] }[] = [
  { name: 'DOTS', looks: [0, 1, 6, 29] },
  { name: 'PIXEL', looks: [2, 22] },
  { name: 'TEXT', looks: [4, 31] },
  { name: 'METAL', looks: [25, 26, 30] },
  { name: 'RETRO', looks: [9] },
  { name: 'GRAPHIC', looks: [10, 11, 12, 32] },
  { name: 'DITHER', looks: [3, 13, 17] },
  { name: 'BITMAP', looks: [18, 19, 20, 21] },
  { name: 'HALO', looks: [23, 24, 27, 28] },
];

/** The HALOS tile is a filter: it turns on the halo layer (glow bitMode 5) over the dots instead of changing the look. */
export const HALO_FILTER = 23;

/** The CHROME tile is a filter too: it puts a metal finish on the dots (chromeOn) and keeps the dots base, with no cell. */
export const CHROME_FILTER = 25;

/** The AURA tile replaces BLUE HALO in slot 24: a filter on the dots, a figure lit from within. */
export const AURA_FILTER = 24;

/** The PRISMATIC tile is a filter on the dots: bright parts split into rainbow streaks that run outward. */
export const PRISMATIC_FILTER = 26;

/** The ECSTASY tile is a filter on the dots: a translucent blue resin figure, lit from within. */
export const ECSTASY_FILTER = 28;

/** The BLIGHT tile is a filter on the dots: black ink washes with a grey haze and speckled edges, like sumi ink on paper. */
export const BLIGHT_FILTER = 29;

/** The REDMET tile is a filter on the dots: a red-hot mirror finish, the picture reflecting a red sky, with white rim highlights. */
export const REDMET_FILTER = 30;

/** The LINED tile is a filter on the dots (it replaced the GLOW look): vertical lines, wider where the picture is brighter. */
export const LINED_FILTER = 6;

/** The BLOOD SHADOW tile is a filter on the dots (it replaced the BRUTAL look): a two-ink screenprint, black masses with a red plate printed slightly off register. */
export const BLOOD_FILTER = 12;

/** The CONVULSIONS tile is a filter on the dots in GRAPHIC: ink contour lines and jittering hatch strokes, like a fine line drawing. */
export const CONVULSIONS_FILTER = 32;

/** The SHAKE-MASK tile is a cell look in TEXT: a motion-blurred photo with a word of letters showing through in patches. */
export const SHAKE_MASK_LOOK = 31;

/** The hint shown on each look's button. */
export const LOOK_TITLES: Record<number, string> = {
  0: 'Soft dots, the default look',
  1: 'Dot size follows brightness, on a turned grid',
  2: 'Flat square tiles',
  3: 'Ordered dither: pure ink dots, a printed-pixel pattern',
  4: 'Text characters, thin to dense',
  6: 'Lined filter: the dots gather into vertical lines, wider where the picture is brighter, like a moire print',
  7: 'The cell grid drawn as thin lines, like a wireframe',
  8: 'Bevelled glass tiles with a highlight',
  9: 'Red, green and blue bars in each cell, with scan lines',
  10: 'Little 3D blocks: brighter parts stand taller',
  11: 'Glossy stickers with a white border and a drop shadow',
  12: 'Blood shadow filter: shadows turn to black ink with a red plate printed slightly off register, like a two-ink screenprint',
  13: 'Scan dither: rows of light on a dark screen, green phosphor',
  17: 'Palette dither: four colours, black, navy, orange and cream',
  18: 'One ink on black, a fine per-pixel noise dither (1-bit print)',
  19: 'Pixel cells on a gradient ramp, dithered so it breaks into dots. Black stays empty',
  20: 'CGA 16-colour palette: nearest colour, dithered between the two closest',
  21: 'Stipple: dots placed at random, dense where the picture is bright',
  22: 'Pixel art: each cell snapped to a fixed 24-colour palette, the colours of a pixel-art picture',
  23: 'Halo filter: the whole picture in amber and blue light, glowing outward, dark stays dark',
  24: 'Aura filter: the bright parts turn white and glow ice blue over the dark ground, like a figure lit from within',
  27: 'X-ray: a blue scan on black. Bright parts glow pale like bone, mid parts run blue, dark parts go black',
  25: 'Chrome filter: the dots take a polished blue steel finish. Edges and details catch light, flat areas keep the picture',
  26: 'Prismatic filter: bright parts split into rainbow streaks that run outward, like light through a prism',
  28: 'Ecstasy filter: a translucent blue resin figure, dark navy in the shadows, bright azure and pale white where it is lit from within',
  29: 'Blight filter: black ink washes on paper, a grey haze bleeding out from the dark masses, with speckled edges',
  31: 'Shake-mask: the photo smeared sideways like a shaken camera, with a word of letters showing through in patches, pale on dark and dark on light',
  30: 'Redmet filter: polished metal that mirrors a red sky, dark silhouettes with white rim highlights on their edges',
  32: 'Convulsions filter: fine ink contour lines and jittering hatch strokes, dense where the picture is dark, like a line drawing',
};

export type StyleSetting =
  | { kind: 'range'; key: string; label: string; styles: number[]; min: number; max: number; step: number; def: number; title: string }
  | { kind: 'seg'; key: string; label: string; styles: number[]; options: string[]; def: number; title: string };

/** Two to four controls per look. Each look's cell size, colour and tone are in LOOK_TONE_DEFAULTS. */
export const STYLE_SETTINGS: StyleSetting[] = [
  // HALFTONE
  { kind: 'seg', key: 'hShape', label: 'SHAPE', styles: [1], options: ['ROUND', 'SQUARE', 'DIAMOND', 'CROSS', 'LINE', 'DASH', 'STAR', 'RINGS'], def: 0, title: 'Pattern of the screen: the dot, the square, the lines, the strokes, the net or the rings' },
  { kind: 'range', key: 'hAngle', label: 'GRID ANGLE', styles: [1], min: 0, max: 90, step: 1, def: 45, title: 'Turn of the dot grid, degrees' },
  { kind: 'range', key: 'hGain', label: 'DOT GROWTH', styles: [1], min: -0.5, max: 0.5, step: 0.01, def: 0.15, title: 'Bigger, brighter dots (positive) or smaller (negative)' },
  // MOSAIC
  { kind: 'range', key: 'mLevels', label: 'COLOUR LEVELS', styles: [2], min: 2, max: 32, step: 1, def: 32, title: 'Levels per colour channel. 32 keeps every colour.' },
  { kind: 'range', key: 'mGap', label: 'GAP', styles: [2], min: 0, max: 0.3, step: 0.01, def: 0.06, title: 'Space between tiles' },
  { kind: 'range', key: 'mCorner', label: 'ROUNDNESS', styles: [2], min: 0, max: 1, step: 0.01, def: 0, title: 'Rounded tile corners' },
  { kind: 'range', key: 'mOutline', label: 'OUTLINE', styles: [2], min: 0, max: 1, step: 0.01, def: 0, title: 'Dark edge where brightness changes' },
  // DITHER
  { kind: 'seg', key: 'dMethod', label: 'PATTERN', styles: [3], options: ['BAYER 4', 'BAYER 8', 'NOISE'], def: 1, title: 'Threshold pattern' },
  { kind: 'range', key: 'dLevels', label: 'LEVELS', styles: [3, 13], min: 2, max: 6, step: 1, def: 2, title: 'Steps per colour. 2 is pure ink and paper.' },
  { kind: 'range', key: 'dBias', label: 'BRIGHTNESS SHIFT', styles: [3, 13, 17], min: -0.25, max: 0.25, step: 0.01, def: 0, title: 'Shifts the threshold: brighter or darker' },
  // ASCII
  { kind: 'seg', key: 'aRamp', label: 'CHARACTERS', styles: [4], options: ['CLASSIC', 'DENSE', 'BINARY'], def: 0, title: 'Characters used, thin to dense' },
  { kind: 'range', key: 'aPaper', label: 'LETTER FILL', styles: [4], min: 0, max: 0.3, step: 0.01, def: 0.1, title: 'Dim fill behind each character' },
  // WIRE
  { kind: 'range', key: 'wWidth', label: 'LINE WIDTH', styles: [7], min: 0.02, max: 0.2, step: 0.005, def: 0.06, title: 'Width of the grid lines' },
  { kind: 'seg', key: 'wMode', label: 'GRID', styles: [7], options: ['SQUARE', 'DIAGONAL', 'CROSSED'], def: 0, title: 'Square grid, with a diagonal, or crossed diagonals' },
  { kind: 'range', key: 'wFill', label: 'FILL', styles: [7], min: 0, max: 0.6, step: 0.01, def: 0.2, title: 'Dim fill inside each cell' },
  // GLASS
  { kind: 'range', key: 'yBevel', label: 'BEVEL', styles: [8], min: 0.05, max: 0.4, step: 0.01, def: 0.18, title: 'Width of the bevelled edge' },
  { kind: 'range', key: 'yGloss', label: 'GLOSS', styles: [8], min: 0, max: 1, step: 0.01, def: 0.6, title: 'How bright and dark the bevel is' },
  { kind: 'range', key: 'yShine', label: 'SHINE', styles: [8], min: 0, max: 1, step: 0.01, def: 0.5, title: 'Highlight spot on each tile' },
  { kind: 'range', key: 'yGap', label: 'GAP', styles: [8], min: 0, max: 0.2, step: 0.01, def: 0.05, title: 'Space between tiles' },
  // CRT
  { kind: 'range', key: 'cWidth', label: 'BAR WIDTH', styles: [9], min: 0.5, max: 1, step: 0.01, def: 0.8, title: 'Width of the red, green and blue bars' },
  { kind: 'range', key: 'cScan', label: 'SCAN LINES', styles: [9], min: 0, max: 1, step: 0.01, def: 0.5, title: 'Dark line between rows' },
  { kind: 'range', key: 'cGain', label: 'BRIGHTNESS', styles: [9], min: 0.8, max: 2, step: 0.01, def: 1.7, title: 'Brightness of the bars' },
  // BARS
  { kind: 'range', key: 'rHeight', label: 'HEIGHT', styles: [10], min: 0.3, max: 1.2, step: 0.01, def: 1, title: 'How tall the brightest blocks stand' },
  { kind: 'range', key: 'rLean', label: 'TILT', styles: [10], min: 0.04, max: 0.3, step: 0.01, def: 0.16, title: 'How far the top and side show' },
  { kind: 'range', key: 'rGap', label: 'GAP', styles: [10], min: 0, max: 0.3, step: 0.01, def: 0.08, title: 'Space between blocks' },
  // STICKER
  { kind: 'range', key: 'sBorder', label: 'BORDER', styles: [11], min: 0.03, max: 0.2, step: 0.01, def: 0.08, title: 'Width of the white sticker border' },
  { kind: 'range', key: 'sShadow', label: 'SHADOW', styles: [11], min: 0, max: 1, step: 0.01, def: 0.5, title: 'Drop shadow under each sticker' },
  { kind: 'range', key: 'sRound', label: 'ROUNDNESS', styles: [11], min: 0.05, max: 0.3, step: 0.01, def: 0.16, title: 'Rounded corners' },
  // INK 1-BIT
  { kind: 'range', key: 'iLevel', label: 'THRESHOLD', styles: [18], min: 0, max: 1, step: 0.01, def: 0.5, title: 'Brightness where ink starts. Low is darker, high is lighter' },
  { kind: 'range', key: 'iSpread', label: 'NOISE', styles: [18], min: 0, max: 1, step: 0.01, def: 0.5, title: 'Width of the noise dither. 0 is a hard cut' },
  // CGA
  { kind: 'range', key: 'cDither', label: 'DITHER', styles: [20], min: 0, max: 1, step: 0.01, def: 0.7, title: 'Mix between the two nearest CGA colours. 0 is nearest only' },
  // STIPPLE
  { kind: 'range', key: 'pDensity', label: 'DENSITY', styles: [21], min: 0, max: 1, step: 0.01, def: 0.75, title: 'Share of cells that get a dot' },
  { kind: 'range', key: 'pSize', label: 'DOT SIZE', styles: [21], min: 0.3, max: 1, step: 0.01, def: 0.9, title: 'Largest dot, as a share of the cell' },
  // SHAKE-MASK
  { kind: 'range', key: 'kShake', label: 'SHAKE', styles: [31], min: 0, max: 1, step: 0.01, def: 0.5, title: 'How far the photo behind the letters is smeared sideways' },
  { kind: 'range', key: 'kCover', label: 'COVER', styles: [31], min: 0, max: 1, step: 0.01, def: 0.3, title: 'How much of the picture the letters cover' },
  { kind: 'range', key: 'kClump', label: 'PATCH SIZE', styles: [31], min: 0, max: 1, step: 0.01, def: 0.5, title: 'Scattered letters (low) or large patches (high)' },
];

export type StyleValues = Record<string, number>;

export function defaultStyleValues(): StyleValues {
  const v: StyleValues = {};
  for (const s of STYLE_SETTINGS) v[s.key] = s.def;
  return v;
}

/** One look's own cell size, colour and tone. colour: 0 SOURCE, 1 MONO ink, 2 DUO ink on paper. */
export interface LookTone {
  cell: number;      // css px
  gap: number;       // cell looks: 0 touching, up to 0.6 leaves a gap between the particles, as a share of the cell
  colour: number;
  ink: string;       // hex
  paper: string;     // hex
  invert: boolean;   // swap light and dark
  autoLevels: boolean; // stretch the picture's brightness to fill the look
}

/** Quality defaults for each look, tuned by look: a fine look starts fine, a bold one starts bold. */
export const LOOK_TONE_DEFAULTS: Record<number, LookTone> = {
  0: { cell: 2, colour: 0, ink: '#ffffff', paper: '#000000', invert: false, autoLevels: true, gap: 0 },
  1: { cell: 2, colour: 0, ink: '#ffffff', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // HALFTONE: source colour dots
  2: { cell: 2, colour: 0, ink: '#ffffff', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // MOSAIC: source colour tiles
  3: { cell: 2, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // DITHER: fine mono pattern
  4: { cell: 3, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // ASCII: mono characters
  7: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // WIRE: source colour grid
  8: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // GLASS: source colour tiles
  9: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // CRT: source colour bars
  10: { cell: 4, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // BARS: source colour blocks
  11: { cell: 4, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // STICKER
  13: { cell: 2, colour: 2, ink: '#b6f23a', paper: '#050805', invert: false, autoLevels: true, gap: 0 },  // SCAN: green phosphor
  17: { cell: 2, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // PALETTE: its own four colours
  18: { cell: 2, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // INK: one ink on black
  19: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // DISSOLVE: the ramp replaces the colour
  20: { cell: 2, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // CGA: source colour, snapped to CGA
  21: { cell: 3, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 },  // STIPPLE: mono dots
  27: { cell: 6, colour: 0, ink: '#8fe4ff', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // X-RAY: blue scan ramp on black
  22: { cell: 8, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // PIXEL ART: the 8 px grid, palette from the picture
  31: { cell: 7, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, gap: 0 }, // SHAKE-MASK: source colour photo, letters 7 x 14 px
};

/** The cell size (css px) at which each HALFTONE pattern reads well, in the order of its SHAPE choices. */
export const HALFTONE_CELL = [2, 3, 3, 4, 2, 6, 8, 2]; // round, square, diamond, cross, line, dash, star, rings

/** How small a cell each look can go (css px). DITHER goes to 2 px so its pattern keeps detail. */
export const CELL_RANGE: Record<number, [number, number]> = {
  0: [2, 24],
  1: [2, 24],
  2: [2, 24],
  3: [2, 16],
  4: [3, 24],
  5: [2, 24],
  7: [3, 32],
  8: [3, 32],
  9: [3, 24],
  10: [4, 40],
  11: [4, 40],
  13: [2, 16],
  17: [2, 16],
  18: [2, 16],
  19: [2, 24],
  20: [2, 16],
  21: [3, 24],
  22: [4, 24],
  31: [4, 16],
};

/**
 * The two-level layout of each look. Essentials sit under the picture: one choice (seg) and up to two values
 * (a pad, or a single slider). Everything else is in MORE FOR THIS LOOK.
 */
export const LOOK_ESSENTIALS: Record<number, { seg?: string; pad?: [string, string]; range?: string[] }> = {
  1: { seg: 'hShape', pad: ['hAngle', 'hGain'] },
  2: { pad: ['mGap', 'mCorner'] },
  3: { seg: 'dMethod', pad: ['dLevels', 'dBias'] },
  4: { seg: 'aRamp', range: ['aPaper'] },
  7: { seg: 'wMode', pad: ['wWidth', 'wFill'] },
  8: { pad: ['yBevel', 'yGloss'] },
  9: { pad: ['cWidth', 'cScan'] },
  10: { pad: ['rHeight', 'rLean'] },
  11: { pad: ['sBorder', 'sShadow'] },
  13: { pad: ['dLevels', 'dBias'] },
  17: { range: ['dBias'] },
  18: { pad: ['iLevel', 'iSpread'] },
  20: { range: ['cDither'] },
  21: { pad: ['pDensity', 'pSize'] },
};

/** Whole-look presets: each sets the cell size and a few values of its look, and keeps its colour. */
export interface LookPreset {
  label: string;
  cell: number;
  values: Record<string, number>;
}
export const LOOK_PRESETS: Record<number, LookPreset[]> = {
  1: [
    { label: 'FINE', cell: 5, values: { hGain: 0.05 } },
    { label: 'STANDARD', cell: 7, values: { hGain: 0.15 } },
    { label: 'BOLD', cell: 12, values: { hGain: 0.35 } },
  ],
  2: [
    { label: 'FINE', cell: 5, values: { mGap: 0.02, mCorner: 0 } },
    { label: 'STANDARD', cell: 10, values: { mGap: 0.06, mCorner: 0 } },
    { label: 'SOFT', cell: 16, values: { mGap: 0.14, mCorner: 0.3 } },
  ],
  3: [
    { label: 'FINE', cell: 2, values: { dMethod: 1, dLevels: 2 } },
    { label: 'STANDARD', cell: 3, values: { dMethod: 1, dLevels: 2 } },
    { label: 'GREY', cell: 4, values: { dMethod: 2, dLevels: 4 } },
  ],
  4: [
    { label: 'CLASSIC', cell: 10, values: { aRamp: 0 } },
    { label: 'DENSE', cell: 8, values: { aRamp: 1 } },
    { label: 'BINARY', cell: 12, values: { aRamp: 2 } },
  ],
  7: [
    { label: 'GRID', cell: 10, values: { wMode: 0, wWidth: 0.05, wFill: 0.15 } },
    { label: 'DIAGONAL', cell: 12, values: { wMode: 1, wWidth: 0.05, wFill: 0.2 } },
    { label: 'CROSSED', cell: 16, values: { wMode: 2, wWidth: 0.04, wFill: 0.3 } },
  ],
  8: [
    { label: 'FLAT', cell: 12, values: { yBevel: 0.08, yGloss: 0.3, yShine: 0.1, yGap: 0.04 } },
    { label: 'GLASS', cell: 12, values: { yBevel: 0.18, yGloss: 0.6, yShine: 0.5, yGap: 0.05 } },
    { label: 'GEM', cell: 18, values: { yBevel: 0.32, yGloss: 0.9, yShine: 0.8, yGap: 0.08 } },
  ],
  9: [
    { label: 'LCD', cell: 8, values: { cWidth: 0.9, cScan: 0.1, cGain: 1.5 } },
    { label: 'CRT', cell: 9, values: { cWidth: 0.8, cScan: 0.5, cGain: 1.7 } },
    { label: 'ARCADE', cell: 12, values: { cWidth: 0.65, cScan: 0.85, cGain: 2 } },
  ],
  10: [
    { label: 'LOW', cell: 12, values: { rHeight: 0.45, rLean: 0.1, rGap: 0.06 } },
    { label: 'CITY', cell: 14, values: { rHeight: 1, rLean: 0.16, rGap: 0.08 } },
    { label: 'TOWERS', cell: 20, values: { rHeight: 1.2, rLean: 0.24, rGap: 0.12 } },
  ],
  11: [
    { label: 'THIN', cell: 12, values: { sBorder: 0.04, sShadow: 0.3, sRound: 0.1 } },
    { label: 'GLOSSY', cell: 14, values: { sBorder: 0.08, sShadow: 0.5, sRound: 0.16 } },
    { label: 'CHUNKY', cell: 20, values: { sBorder: 0.15, sShadow: 0.8, sRound: 0.26 } },
  ],
};

/** Characters in each ASCII ramp: CLASSIC, DENSE, BINARY. */
export const RAMP_SIZES = [10, 16, 3];

export interface PackedStyle {
  /** uSP: the four numbers the shader reads for this look */
  sp: [number, number, number, number];
  /** Number of glyphs in the chosen ASCII ramp */
  ramp: number;
  /** Grid turn in radians */
  angle: number;
  /** Cell height over cell width (ASCII cells are twice as tall as wide) */
  cellAspect: number;
}

export function packStyle(style: number, v: StyleValues): PackedStyle {
  const rad = (d: number) => (d * Math.PI) / 180;
  const base: PackedStyle = { sp: [0, 0, 0, 0], ramp: 10, angle: 0, cellAspect: 1 };
  switch (style) {
    case 1:
      return { ...base, sp: [v.hShape, v.hGain, 0, 0], angle: rad(v.hAngle) };
    case 2:
      return { ...base, sp: [v.mLevels, v.mGap, v.mCorner, v.mOutline] };
    case 3:
      return { ...base, sp: [v.dMethod, v.dLevels, v.dBias, 0] };
    case 13:
      return { ...base, sp: [0, v.dLevels, v.dBias, 0] };
    case 17:
      return { ...base, sp: [0, 4, v.dBias, 0] };
    case 18:
      return { ...base, sp: [v.iSpread, v.iLevel, 0, 0] };
    case 20:
      return { ...base, sp: [v.cDither, 0, 0, 0] };
    case 21:
      return { ...base, sp: [v.pDensity, v.pSize, 0, 0] };
    case 31:
      return { ...base, sp: [v.kShake, v.kCover, v.kClump, 0], cellAspect: 2 };
    case 4:
      return { ...base, sp: [v.aRamp, v.aPaper, 0, 0], ramp: RAMP_SIZES[Math.round(v.aRamp)] ?? 10, cellAspect: 2 };
    case 7:
      return { ...base, sp: [v.wWidth, v.wMode, v.wFill, 0] };
    case 8:
      return { ...base, sp: [v.yBevel, v.yGloss, v.yShine, v.yGap] };
    case 9:
      return { ...base, sp: [v.cWidth, v.cScan, v.cGain, 0] };
    case 10:
      return { ...base, sp: [v.rHeight, v.rLean, v.rGap, 0] };
    case 11:
      return { ...base, sp: [v.sBorder, v.sShadow, v.sRound, 0] };
    default:
      return base;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
