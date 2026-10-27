// src/core/params.ts
import { defaultStyleValues } from './styles';

/** Colour levels / curve / hue / saturation applied to the final picture. */
export interface FxParams {
  black: number;      // 0..0.5   levels: black point
  white: number;      // 0.5..1   levels: white point
  gamma: number;      // 0.4..2.2 levels: midtone gamma (1 = none)
  contrast: number;   // -1..1    curve: contrast around mid grey
  opacity: number;    // 0..1     image opacity (the picture only, not the trails)
  hue: number;        // -180..180 degrees
  saturation: number; // 0..2     1 = unchanged
}

/** Drift trails. */
export interface TrailParams {
  amount: number;   // 0..1 share of trail lines drawn
  strength: number; // 0..2 brightness of trails
  length: number;   // -1..1 trail length: positive trails back, negative trails forward
  detail: number;   // 0..1 0 = soft full-length glow, 1 = crisp tapered tails
}


export interface Params {
  // sliders, all 0..1
  drift: number;   // default 0.8: noise flow around home
  splash: number;  // default 0.6: burst on fast pointer / click
  gather: number;  // default 0.8: spring back to home
  depth: number;   // default 0.8: z displacement + parallax
  lean: number;    // -1..1 light-based side bias: bright parts drift toward + (right), dark toward - (left)

  // toggles
  draw: boolean;    // paint flow strokes
  track: boolean;   // pointer repel
  scanMode: number; // 0 SWEEP, 1 RING, 2 RADAR, 3 LINES, 4 DEPTH, 5 BURST, 6 PULSE (web build)
  panMode: boolean; // PAN on/off
  panAmount: number; // 0..1 how far PAN tilts
  panStyle: 'cursor' | 'orbit'; // PAN style: tilt toward the cursor, or a fuller 3D orbit
  floatOn: boolean; // FLOAT: the picture hovers gently
  threeD: boolean; // 3D: drag to turn in any direction, wheel to move through
  randomness: number; // 0..1 randomness of the particle path
  trailSize: number; // dot size of drifting particles (multiplier)
  trailAngle: number; // degrees, trail direction turned away from the drift path
  pSat: number; // 0..2 particle saturation
  style: number; // particle look: 0 DOTS, 1 HALFTONE, 2 MOSAIC, 3 DITHER, 4 ASCII, 5 STIPPLE, 6 LINES (web build)
  cell: number; // 4..24 cell size of the cell looks, css px
  ss: Record<string, number>; // settings of each look (core/styles.ts)
  emitOn: boolean; // EMITTERS panel: region weights, spots, scatter, trail variety
  emit: Record<string, number>; // r0..r8 (3 x 3 regions, top left first, 0..2), spots, scatter, lenRand, turn
  styleColor: number; // cell looks: 0 SOURCE colour, 1 MONO ink, 2 DUO ink on paper
  styleInvert: boolean; // cell looks: swap light and dark
  autoLevels: boolean; // cell looks: stretch the picture's brightness to fill the look
  ink: string; // hex colours of MONO and DUO
  paper: string;
  trackStyle: 'old' | 'soft'; // TRACK style: OLD repels and follows the motion, SOFT is a gentle push
  scan: boolean;    // sweep line
  scanLevel: number; // 1..5 scan impact (3 = the original strength)
  trails: boolean;  // fading streaks

  travel: 'swarm' | 'melt';
  background: 'dark' | 'white';      // ON WHITE
  colorMode: 'true' | 'bw';          // TRUE colour or black & white
  light: 'cream' | 'ice' | 'orange' | 'red' | 'green' | 'violet' | 'off';
  lightOn: boolean;                  // S key

  line: { angle: number; length: number }; // LINE widget: radians, 0..1
  lineMode: 'streak' | 'dot';        // dot vs line rendering
  pointCount: number; // dynamically adapted to subject image
  quality: 'auto' | 'low' | 'high';

  fx: FxParams;
  trail: TrailParams;
}

export const defaults: Params = {
  drift: 0.6,
  splash: 0.5,
  gather: 0.5,
  depth: 0.5,
  lean: 0,

  draw: false,
  track: true,
  scan: false,
  scanMode: 0,
  panMode: true,
  panAmount: 0.5,
  panStyle: 'cursor',
  floatOn: false,
  threeD: false,
  randomness: 0.3,
  trailSize: 1,
  trailAngle: 0,
  pSat: 1.2,
  style: 0,
  cell: 8,
  ss: defaultStyleValues(),
  emitOn: true,
  emit: { r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1, r6: 1, r7: 1, r8: 1, spots: 0, scatter: 0.35, lenRand: 1, turn: 0.3 },
  styleColor: 0,
  styleInvert: false,
  autoLevels: true,
  ink: '#ffffff',
  paper: '#000000',
  trackStyle: 'old',
  scanLevel: 3,
  trails: true,

  travel: 'swarm',
  background: 'dark',
  colorMode: 'true',
  light: 'cream',
  lightOn: true,

  line: { angle: 0.2, length: 0.5 }, // direction the particles drift, as drawn in the LINE box
  lineMode: 'streak',
  pointCount: 524288,
  quality: 'auto',

  fx: { black: 0, white: 1, gamma: 1, contrast: 0, opacity: 1, hue: 0, saturation: 1 },
  trail: { amount: 0.35, strength: 0.5, length: 0.6, detail: 0.25 },
};

export const presets: Record<string, Partial<Params>> = {
  calm: {
    drift: 0.25,
    splash: 0.3,
    gather: 0.9,
    depth: 0.5,
    trails: false,
    travel: 'swarm',
  },
  storm: {
    drift: 0.95,
    splash: 0.85,
    gather: 0.6,
    depth: 0.9,
    trails: true,
    travel: 'swarm',
  },
  scan: {
    drift: 0.4,
    splash: 0.4,
    gather: 0.85,
    scan: true,
  },
};

/**
 * Start settings: applied on every page load and to every new picture. Values are the studio's
 * starting look (flow, direction, particles, trail, interaction, toggles).
 */
export function withLightStart(p: Params): Params {
  return {
    ...p,
    drift: 0.3,                       // FLOW: 30%
    depth: 0.5,                       // DEPTH 50%
    lean: 0,
    line: { angle: (31 * Math.PI) / 180, length: 0.55 }, // ANGLE 31 degrees (top right), STRENGTH 55
    randomness: 0.1,                  // RANDOM 10%
    trailSize: 0.45,                  // PARTICLE SIZE 0.45
    pSat: 1,                          // PART SAT 1
    trailAngle: 0,                    // TRAIL DIR 0
    trail: { ...defaults.trail, amount: 1.1, length: 0.3 }, // TRAIL AMT 0.55, TRAIL LEN inside the particles
    track: false,                     // HOVER off
    scan: true,                       // SCANNER on, BURST
    scanMode: 5,
    panMode: true,                    // CURSOR on
    panAmount: 0.25,                  // AMOUNT 25%
    floatOn: false,
    threeD: false,
  };
}

export function serializeParams(params: Params): string {
  return JSON.stringify(params);
}

export function parseParams(json: string, fallback: Params = defaults): Params {
  try {
    const parsed = JSON.parse(json);
    return {
      ...fallback,
      ...parsed,
      line: {
        ...fallback.line,
        ...(parsed.line || {}),
      },
      fx: { ...fallback.fx, ...(parsed.fx || {}) },
      ss: { ...fallback.ss, ...(parsed.ss || {}) },
      emit: { ...fallback.emit, ...(parsed.emit || {}) },
      trail: { ...fallback.trail, ...(parsed.trail || {}) },
    };
  } catch {
    return { ...fallback };
  }
}

// v2: defaults and simulation changed, so older saved settings would look wrong
const STORAGE_KEY = 'particle_depth_studio_params_v3';

export function saveToStorage(params: Params): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeParams(params));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

export function loadFromStorage(): Params {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseParams(raw);
  } catch (e) {
    console.warn('LocalStorage load failed:', e);
  }
  return { ...defaults };
}
