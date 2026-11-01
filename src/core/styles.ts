// src/core/styles.ts
// The cell looks (web build): their names, per-look settings and how those settings reach the shader.
// Kept free of DOM and GL code so the studio panel, the engine and tests share one description.

/** Look numbers: 0 DOTS (the point look), then the cell looks. Each look keeps its own cell, colour and tone. */
export const STYLE_NAMES = ['DOTS', 'HALFTONE', 'MOSAIC', 'DITHER', 'ASCII', 'LINES', 'GLOW', 'WIRE', 'GLASS', 'CRT', 'BARS', 'STICKER', 'BRUTAL', 'SCAN', 'CROSS', 'BLOCKS', 'CLUSTER', 'PALETTE'] as const; // 14 to 16 are retired: their slots stay so the numbers do not move

/** Every look sits in one category; the LOOK picker shows them grouped. */
export const LOOK_CATEGORIES: { name: string; looks: number[] }[] = [
  { name: 'DOTS', looks: [0, 1, 6] },
  { name: 'PIXEL', looks: [2, 8] },
  { name: 'TEXT', looks: [4] },
  { name: 'LINES', looks: [5, 7] },
  { name: 'RETRO', looks: [9] },
  { name: 'GRAPHIC', looks: [10, 11, 12] },
  { name: 'DITHER', looks: [3, 13, 17] },
];

/** The hint shown on each look's button. */
export const LOOK_TITLES: Record<number, string> = {
  0: 'Soft dots, the default look',
  1: 'Dot size follows brightness, on a turned grid',
  2: 'Flat square tiles',
  3: 'Ordered dither: pure ink dots, a printed-pixel pattern',
  4: 'Text characters, thin to dense',
  5: 'Lines, thickness follows brightness',
  6: 'Soft glowing dots with a bright core',
  7: 'The cell grid drawn as thin lines, like a wireframe',
  8: 'Bevelled glass tiles with a highlight',
  9: 'Red, green and blue bars in each cell, with scan lines',
  10: 'Little 3D blocks: brighter parts stand taller',
  11: 'Glossy stickers with a white border and a drop shadow',
  12: 'Neo-brutalism: flat colours, thick black outlines, hard offset shadows',
  13: 'Scan dither: rows of light on a dark screen, green phosphor',
  17: 'Palette dither: four colours, black, navy, orange and cream',
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
  // GLOW
  { kind: 'range', key: 'oSize', label: 'GLOW SIZE', styles: [6], min: 0.3, max: 1.2, step: 0.01, def: 0.8, title: 'How far each glow reaches' },
  { kind: 'range', key: 'oSoft', label: 'SOFTNESS', styles: [6], min: 0.1, max: 1, step: 0.01, def: 0.6, title: 'Crisp edge (low) or soft falloff (high)' },
  { kind: 'range', key: 'oCore', label: 'HOT CORE', styles: [6], min: 0, max: 1.5, step: 0.01, def: 0.6, title: 'White-hot centre of each glow' },
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
  // BRUTAL
  { kind: 'range', key: 'bBorder', label: 'OUTLINE', styles: [12], min: 0.02, max: 0.12, step: 0.005, def: 0.05, title: 'Thickness of the black outline' },
  { kind: 'range', key: 'bShadow', label: 'SHADOW', styles: [12], min: 0, max: 0.2, step: 0.005, def: 0.1, title: 'Distance of the hard offset shadow' },
  { kind: 'range', key: 'bLevels', label: 'COLOURS', styles: [12], min: 2, max: 8, step: 1, def: 4, title: 'Flat colour steps per channel' },
  // LINES
  { kind: 'seg', key: 'lMode', label: 'MODE', styles: [5], options: ['SCAN', 'HATCH', 'CROSS'], def: 0, title: 'Scan lines, hatching or cross-hatching' },
  { kind: 'range', key: 'lAngle', label: 'LINE ANGLE', styles: [5], min: 0, max: 180, step: 1, def: 0, title: 'Direction of the lines, degrees' },
  { kind: 'range', key: 'lWeight', label: 'LINE WEIGHT', styles: [5], min: 0.5, max: 2, step: 0.01, def: 1, title: 'Line thickness' },
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
  sizeBy: number;    // cell looks: 0 FIXED, 1 LIGHT (brighter, bigger cells), 2 COLOUR (more colourful, bigger cells)
  colour: number;
  ink: string;       // hex
  paper: string;     // hex
  invert: boolean;   // swap light and dark
  autoLevels: boolean; // stretch the picture's brightness to fill the look
}

/** Quality defaults for each look, tuned by look: a fine look starts fine, a bold one starts bold. */
export const LOOK_TONE_DEFAULTS: Record<number, LookTone> = {
  0: { cell: 2, colour: 0, ink: '#ffffff', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },
  1: { cell: 2, colour: 0, ink: '#ffffff', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },  // HALFTONE: source colour dots
  2: { cell: 2, colour: 0, ink: '#ffffff', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // MOSAIC: source colour tiles
  3: { cell: 2, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },  // DITHER: fine mono pattern
  4: { cell: 3, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // ASCII: mono characters
  5: { cell: 2, colour: 1, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },  // LINES: mono lines
  6: { cell: 2, colour: 0, ink: '#ffd9a0', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },  // GLOW: source colour glows
  7: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // WIRE: source colour grid
  8: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // GLASS: source colour tiles
  9: { cell: 3, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },  // CRT: source colour bars
  10: { cell: 4, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // BARS: source colour blocks
  11: { cell: 4, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // STICKER
  12: { cell: 5, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 }, // BRUTAL
  13: { cell: 2, colour: 2, ink: '#b6f23a', paper: '#050805', invert: false, autoLevels: true, sizeBy: 0 },  // SCAN: green phosphor
  17: { cell: 2, colour: 0, ink: '#e9ecee', paper: '#000000', invert: false, autoLevels: true, sizeBy: 0 },  // PALETTE: its own four colours
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
  6: [2, 24],
  7: [3, 32],
  8: [3, 32],
  9: [3, 24],
  10: [4, 40],
  11: [4, 40],
  12: [5, 48],
  13: [2, 16],
  17: [2, 16],
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
  5: { seg: 'lMode', pad: ['lAngle', 'lWeight'] },
  6: { pad: ['oSize', 'oSoft'], range: ['oCore'] },
  7: { seg: 'wMode', pad: ['wWidth', 'wFill'] },
  8: { pad: ['yBevel', 'yGloss'] },
  9: { pad: ['cWidth', 'cScan'] },
  10: { pad: ['rHeight', 'rLean'] },
  11: { pad: ['sBorder', 'sShadow'] },
  12: { pad: ['bBorder', 'bShadow'] },
  13: { pad: ['dLevels', 'dBias'] },
  17: { range: ['dBias'] },
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
  5: [
    { label: 'SCAN', cell: 6, values: { lMode: 0, lAngle: 0 } },
    { label: 'HATCH', cell: 6, values: { lMode: 1, lAngle: 45 } },
    { label: 'CROSS', cell: 8, values: { lMode: 2, lAngle: 30 } },
  ],
  6: [
    { label: 'SOFT', cell: 8, values: { oSize: 0.9, oSoft: 0.9, oCore: 0.3 } },
    { label: 'NEON', cell: 8, values: { oSize: 0.8, oSoft: 0.5, oCore: 1 } },
    { label: 'PINPOINT', cell: 6, values: { oSize: 0.45, oSoft: 0.3, oCore: 0.8 } },
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
  12: [
    { label: 'FINE', cell: 12, values: { bBorder: 0.03, bShadow: 0.06, bLevels: 5 } },
    { label: 'BOLD', cell: 16, values: { bBorder: 0.05, bShadow: 0.1, bLevels: 4 } },
    { label: 'POSTER', cell: 24, values: { bBorder: 0.08, bShadow: 0.16, bLevels: 3 } },
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
    case 4:
      return { ...base, sp: [v.aRamp, v.aPaper, 0, 0], ramp: RAMP_SIZES[Math.round(v.aRamp)] ?? 10, cellAspect: 2 };
    case 5:
      return { ...base, sp: [v.lMode, v.lWeight, 0, 0], angle: rad(v.lAngle) };
    case 6:
      return { ...base, sp: [v.oSize, v.oSoft, v.oCore, 0] };
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
    case 12:
      return { ...base, sp: [v.bBorder, v.bShadow, v.bLevels, 0] };
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
