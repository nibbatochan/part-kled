// src/core/params.ts
export interface Params {
  // sliders, all 0..1
  drift: number;   // default 0.8: noise flow around home
  splash: number;  // default 0.6: burst on fast pointer / click
  gather: number;  // default 0.8: spring back to home
  depth: number;   // default 0.8: z displacement + parallax

  // toggles
  draw: boolean;    // paint flow strokes
  track: boolean;   // pointer repel + tracker follow
  links: boolean;   // lines between trackers
  scan: boolean;    // sweep line
  trails: boolean;  // fading streaks
  marks: boolean;   // bracket labels

  trackers: 'sparse' | 'dense';      // 12 vs 40 boxes
  travel: 'swarm' | 'melt';
  background: 'dark' | 'white';      // ON WHITE
  colorMode: 'true' | 'negative';
  light: 'cream' | 'ice' | 'orange' | 'red' | 'green' | 'violet' | 'off';
  lightOn: boolean;                  // S key

  line: { angle: number; length: number }; // LINE widget: radians, 0..1
  lineMode: 'streak' | 'dot';        // dot vs line rendering
  pointCount: number; // dynamically adapted to subject image
  quality: 'auto' | 'low' | 'high';
}

export const defaults: Params = {
  drift: 0.8,
  splash: 0.6,
  gather: 0.8,
  depth: 0.8,

  draw: false,
  track: true,
  links: false,
  scan: false,
  trails: true,
  marks: true,

  trackers: 'sparse',
  travel: 'swarm',
  background: 'dark',
  colorMode: 'true',
  light: 'cream',
  lightOn: true,

  line: { angle: 0.05, length: 0.85 }, // default streak angle pointing towards the right
  lineMode: 'streak',
  pointCount: 131072,
  quality: 'auto',
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
    links: true,
    marks: true,
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
    };
  } catch {
    return { ...fallback };
  }
}

export function saveToStorage(params: Params): void {
  try {
    localStorage.setItem('particle_depth_studio_params', serializeParams(params));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

export function loadFromStorage(): Params {
  try {
    const raw = localStorage.getItem('particle_depth_studio_params');
    if (raw) return parseParams(raw);
  } catch (e) {
    console.warn('LocalStorage load failed:', e);
  }
  return { ...defaults };
}
