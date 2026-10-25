// src/core/params.ts
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
  length: number;   // 0.3..2 trail length multiplier
  detail: number;   // 0..1 0 = soft full-length glow, 1 = crisp tapered tails
}

export interface Params {
  // sliders, all 0..1
  drift: number;   // default 0.8: noise flow around home
  splash: number;  // default 0.6: burst on fast pointer / click
  gather: number;  // default 0.8: spring back to home
  depth: number;   // default 0.8: z displacement + parallax

  // toggles
  draw: boolean;    // paint flow strokes
  track: boolean;   // pointer repel
  scanMode: number; // 0 SWEEP, 1 RING, 2 RADAR, 3 LINES, 4 DEPTH
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
  drift: 0.75,
  splash: 0.5,
  gather: 0.5,
  depth: 0.5,

  draw: false,
  track: true,
  scan: false,
  scanMode: 0,
  scanLevel: 3,
  trails: true,

  travel: 'swarm',
  background: 'dark',
  colorMode: 'true',
  light: 'cream',
  lightOn: true,

  line: { angle: 0.2, length: 0.9 }, // direction the particles drift, as drawn in the LINE box
  lineMode: 'streak',
  pointCount: 524288,
  quality: 'auto',

  fx: { black: 0, white: 1, gamma: 1, contrast: 0, opacity: 1, hue: 0, saturation: 1 },
  trail: { amount: 1, strength: 1, length: 1, detail: 0.5 },
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
