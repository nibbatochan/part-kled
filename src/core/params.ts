// src/core/params.ts
export interface Params {
  // sliders, all 0..1
  drift: number;   // default 0.8: streaming trails towards right
  splash: number;  // default 0.4: kinetic burst
  gather: number;  // default 0.7: spring back to home
  depth: number;   // default 0.8: z displacement + 3D relief

  // toggles
  draw: boolean;    // paint flow strokes
  track: boolean;   // pointer repel + tracker follow
  links: boolean;   // lines between trackers
  scan: boolean;    // sweep line
  trails: boolean;  // streaming pixel trails

  travel: 'swarm' | 'melt';
  background: 'dark' | 'white';      // ON WHITE
  colorMode: 'true' | 'negative';
  light: 'cream' | 'ice' | 'orange' | 'red' | 'green' | 'violet' | 'off';
  lightOn: boolean;                  // S key
  lightDirection: 'left' | 'top' | 'bottom' | 'highlights';

  line: { angle: number; length: number }; // LINE widget: radians, 0..1
  lineMode: 'streak' | 'dot';        // dot vs line rendering
  pointCount: number; // dynamically adapted to subject image
  quality: 'auto' | 'low' | 'high';
}

export const defaults: Params = {
  drift: 0.8,
  splash: 0.35,
  gather: 0.7,
  depth: 0.8,

  draw: false,
  track: true,
  links: false,
  scan: true,
  trails: true,

  travel: 'swarm',
  background: 'dark',
  colorMode: 'true',
  light: 'cream',
  lightOn: true,
  lightDirection: 'left',

  line: { angle: 0.0, length: 0.85 }, // default pointing towards the right (0 rad = +X)
  lineMode: 'streak',
  pointCount: 65536,
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
    splash: 0.35,
    gather: 0.75,
    scan: true,
    links: true,
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
