// src/core/styles.ts
// The cell looks (web build): their names, per-look settings and how those settings reach the shader.
// Kept free of DOM and GL code so the studio panel, the engine and tests share one description.

export const STYLE_NAMES = ['DOTS', 'HALFTONE', 'MOSAIC', 'DITHER', 'ASCII', 'STIPPLE', 'LINES'] as const;

export type StyleSetting =
  | { kind: 'range'; key: string; label: string; styles: number[]; min: number; max: number; step: number; def: number; title: string }
  | { kind: 'seg'; key: string; label: string; styles: number[]; options: string[]; def: number; title: string };

/** Two to four controls per look. Colour, invert and levels are shared and live in the STYLE box. */
export const STYLE_SETTINGS: StyleSetting[] = [
  // HALFTONE
  { kind: 'seg', key: 'hShape', label: 'SHAPE', styles: [1], options: ['ROUND', 'SQUARE', 'DIAMOND', 'CROSS', 'LINE'], def: 0, title: 'Shape of each dot' },
  { kind: 'range', key: 'hAngle', label: 'GRID ANGLE', styles: [1], min: 0, max: 90, step: 1, def: 45, title: 'Turn of the dot grid, degrees' },
  { kind: 'range', key: 'hGain', label: 'DOT GROWTH', styles: [1], min: -0.5, max: 0.5, step: 0.01, def: 0.15, title: 'Bigger, brighter dots (positive) or smaller (negative)' },
  // MOSAIC
  { kind: 'range', key: 'mLevels', label: 'COLOUR LEVELS', styles: [2], min: 2, max: 32, step: 1, def: 32, title: 'Levels per colour channel. 32 keeps every colour.' },
  { kind: 'range', key: 'mGap', label: 'GAP', styles: [2], min: 0, max: 0.3, step: 0.01, def: 0.06, title: 'Space between tiles' },
  { kind: 'range', key: 'mCorner', label: 'ROUNDNESS', styles: [2], min: 0, max: 1, step: 0.01, def: 0, title: 'Rounded tile corners' },
  { kind: 'range', key: 'mOutline', label: 'OUTLINE', styles: [2], min: 0, max: 1, step: 0.01, def: 0, title: 'Dark edge where brightness changes' },
  // DITHER
  { kind: 'seg', key: 'dMethod', label: 'PATTERN', styles: [3], options: ['BAYER 4', 'BAYER 8', 'NOISE'], def: 1, title: 'Threshold pattern' },
  { kind: 'range', key: 'dLevels', label: 'LEVELS', styles: [3], min: 2, max: 6, step: 1, def: 2, title: 'Steps per colour. 2 is pure black and white ink.' },
  { kind: 'range', key: 'dBias', label: 'BRIGHTNESS SHIFT', styles: [3], min: -0.25, max: 0.25, step: 0.01, def: 0, title: 'Shifts the threshold: brighter or darker' },
  // ASCII
  { kind: 'seg', key: 'aRamp', label: 'CHARACTERS', styles: [4], options: ['CLASSIC', 'DENSE', 'BINARY'], def: 0, title: 'Characters used, thin to dense' },
  { kind: 'range', key: 'aPaper', label: 'LETTER FILL', styles: [4], min: 0, max: 0.3, step: 0.01, def: 0.1, title: 'Dim fill behind each character' },
  // STIPPLE
  { kind: 'range', key: 'sSize', label: 'DOT SIZE', styles: [5], min: 0.1, max: 0.6, step: 0.01, def: 0.35, title: 'Largest dot, as a share of the cell' },
  { kind: 'range', key: 'sDensity', label: 'DENSITY', styles: [5], min: 0.25, max: 2, step: 0.01, def: 1.2, title: 'How many cells get a dot' },
  { kind: 'range', key: 'sJitter', label: 'JITTER', styles: [5], min: 0, max: 1, step: 0.01, def: 0.6, title: '0 is a regular grid, 1 is scattered inside the cell' },
  // LINES
  { kind: 'seg', key: 'lMode', label: 'MODE', styles: [6], options: ['SCAN', 'HATCH', 'CROSS'], def: 0, title: 'Scan lines, hatching or cross-hatching' },
  { kind: 'range', key: 'lAngle', label: 'LINE ANGLE', styles: [6], min: 0, max: 180, step: 1, def: 0, title: 'Direction of the lines, degrees' },
  { kind: 'range', key: 'lWeight', label: 'LINE WEIGHT', styles: [6], min: 0.5, max: 2, step: 0.01, def: 1, title: 'Line thickness' },
];

export type StyleValues = Record<string, number>;

export function defaultStyleValues(): StyleValues {
  const v: StyleValues = {};
  for (const s of STYLE_SETTINGS) v[s.key] = s.def;
  return v;
}

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
    case 4:
      return { ...base, sp: [v.aRamp, v.aPaper, 0, 0], ramp: RAMP_SIZES[Math.round(v.aRamp)] ?? 10, cellAspect: 2 };
    case 5:
      return { ...base, sp: [v.sSize, v.sDensity, v.sJitter, 0] };
    case 6:
      return { ...base, sp: [v.lMode, v.lWeight, 0, 0], angle: rad(v.lAngle) };
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
