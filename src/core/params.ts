// src/core/params.ts
import { LOOK_TONE_DEFAULTS, defaultStyleValues, type LookTone } from './styles';

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
  style: number; // look: 0 DOTS, 1 HALFTONE, 2 MOSAIC, 3 DITHER, 4 ASCII, 5 LINES (web build)
  ss: Record<string, number>; // settings of each look (core/styles.ts)
  emitOn: boolean; // EMITTERS panel: region weights, spots, scatter, trail variety
  emit: Record<string, number>; // r0..r8 (3 x 3 regions, top left first, 0..2), spots, scatter, lenRand, turn
  // each cell look keeps its own cell size, colour and tone (see lookTone)
  looks: Record<string, Partial<LookTone>>; // key = look number
  audioAmount: number; // MUSIC: 0..1 how strongly sound moves the picture
  motionFx: number; // MOTION effect: 0 off, 1 STARDUST, 2 BREAKDOWN, 3 DISAPPEAR, 4 COSMIC
  motionAmount: number; // 0..1 how strong
  motionSpeed: number; // 0.2..2 how fast a cycle runs
  musicLook: number; // MUSIC look: 0 off, 1 EQUALIZER, 2 LISTEN, 3 BLOOM, 4 RIPPLE
  eqStyle: number; // EQUALIZER: 0 off, 1 DOTS, 2 CROSS, 3 SPARKS (particles beside the picture)
  eqSize: number; // EQUALIZER dot size, CSS px
  trackStyle: 'old' | 'soft'; // TRACK style: OLD repels and follows the motion, SOFT is a gentle push
  scan: boolean;    // sweep line
  scanLevel: number; // 1..5 scan impact (3 = the original strength)
  trails: boolean;  // fading streaks
  bloomOn: boolean; // LIGHT: a tight soft glow around bright parts
  haloOn: boolean;  // LIGHT: a wide tinted glow
  chromeOn: boolean; // METAL filter: a chrome finish on the dots (no cells)
  chrome: { bevel: number; shine: number; hue: number; depth: number }; // CHROME: bevel, shine, depth 0..1, hue in degrees
  prismaticOn: boolean; // PRISMATIC filter: rainbow streaks from the bright parts, on the dots
  prismatic: { length: number; spread: number; glow: number; threshold: number }; // PRISMATIC: each 0..1
  auraOn: boolean; // AURA filter: the bright parts turn white and glow ice blue, on the dots
  aura: { glow: number; reach: number; core: number; tint: number }; // AURA: each 0..1
  ecstasyOn: boolean; // ECSTASY filter: a translucent blue resin, lit from within, on the dots
  ecstasy: { tint: number; depth: number; glow: number; core: number }; // ECSTASY: each 0..1
  blightOn: boolean; // BLIGHT filter: black ink washes with a grey haze and speckled edges, on the dots
  blight: { spread: number; grain: number; ink: number; haze: number }; // BLIGHT: each 0..1
  redmetOn: boolean; // REDMET filter: a red-hot mirror finish with white rim highlights, on the dots
  redmet: { heat: number; rim: number; bevel: number }; // REDMET: each 0..1
  chroma2On: boolean; // CHROMA 2 filter: a dark glossy slab with a blue, orange and red spectrum and white edge light, on the dots
  chroma2: { rim: number; spectrum: number; bevel: number }; // CHROMA 2: each 0..1
  vbrntFingOn: boolean; // VBRNT-FING filter on the dots: engraved hatching in a multi-hue palette
  vbrntFing: { pattern: number; color: number; ink: number }; // VBRNT-FING: each 0..1
  glassGreenOn: boolean; // GLASS GREEN filter on the dots: emerald green glass with high gloss specular highlights and rim light
  glassGreen: { gloss: number; rim: number; depth: number; bevel: number }; // GLASS GREEN: each 0..1
  candyOn: boolean; // CANDY filter on the dots: glossy translucent orange candy
  candy: { gloss: number; glow: number; tone: number }; // CANDY: each 0..1
  cabrOn: boolean; // C-ABR filter on the dots: dark obsidian glass with chromatic aberration caustics and slick specular highlights
  cabr: { disp: number; gloss: number; rim: number }; // C-ABR: each 0..1
  softwordOn: boolean; // SOFTWORD filter: ASCII characters on the dots, picked by brightness, with a soft glow
  softword: { glow: number }; // SOFTWORD: glow 0..1
  convulsionsOn: boolean; // CONVULSIONS filter: ink contour lines and jittering hatch strokes, on the dots
  convulsions: { line: number; hatch: number; jitter: number }; // CONVULSIONS: each 0..1
  linedOn: boolean; // LINED filter: the dots gather into vertical lines, thicker where the picture is brighter
  lined: { count: number; weight: number; contrast: number }; // LINED: lines across the picture height (20..160), weight and contrast 0..1
  bloodOn: boolean; // BLOOD SHADOW filter: black ink masses with a red plate printed off register, on the dots
  blood: { shift: number; bleed: number; grain: number }; // BLOOD SHADOW: each 0..1
  shakeOn: boolean; // SHAKE-MASK filter: a motion-smeared photo with a word showing through in patches, on the dots
  shake: { smear: number; cover: number; patch: number }; // SHAKE-MASK: each 0..1
  furOn: boolean; // FUR filter: a short felt pile with fine fibres and a frayed edge, on the dots
  fur: { pile: number; length: number; fuzz: number }; // FUR: each 0..1
  aranciaOn: boolean; // ARANCIA filter: a citrus skin with pores, a pith web and a gloss, on the dots
  arancia: { pores: number; web: number; gloss: number }; // ARANCIA: each 0..1
  rockOn: boolean; // ROCK filter: carved stone with grain, cracks and chipped edges, on the dots
  rock: { cracks: number; grain: number; wear: number }; // ROCK: each 0..1
  cumulusOn: boolean; // CLOUD filter: a puffy white cloud lit from above, warm light bleeding into it, on the dots
  cumulus: { puff: number; glow: number; soft: number }; // CLOUD: each 0..1
  blendOn: boolean; // BLEND filter: soft-light blend of each dot with a softened copy of the picture, on the dots
  blend: { amount: number; warm: number; soft: number }; // BLEND: each 0..1
  vhsOn: boolean;   // SIGNAL: tape look
  glitchOn: boolean; // SIGNAL: sliced, colour-split bursts
  glitchBeat: boolean; // SIGNAL: bursts on the beat instead of on time
  signal: { vhsAmount: number; vhsNoise: number; glitchAmount: number; glitchRate: number };
  grainOn: boolean; // SURFACE: film grain
  holoOn: boolean;  // SURFACE: iridescent sheen
  duoOn: boolean;   // SURFACE: two-colour map of the brightness
  cloudOn: boolean; // SURFACE: drifting haze
  meshOn: boolean;  // SURFACE: soft gradient mesh over the picture
  caOn: boolean;       // FINISH: colour fringes that grow toward the corners
  vignetteOn: boolean; // FINISH: dark corners
  paperOn: boolean;    // FINISH: ink on a paper field (dark on light)
  softOn: boolean;     // FINISH: soft fill between the dots
  tentOn: boolean;     // FINISH: smoother bloom
  streakOn: boolean;   // FINISH: horizontal light streaks
  hdrOn: boolean;      // FINISH: 16-bit scene and glow (less banding; 8-bit where the device cannot)
  lutOn: boolean;      // FINISH: colour grade from a lookup table
  blueGrainOn: boolean; // FINISH: the film grain uses blue noise (needs grain on)
  stackOn: boolean; // GRAPHIC: moving points joined by lines
  stackWords: boolean; // GRAPHIC: a word tag at each point
  graphic: { stackCount: number; stackWidth: number; stackColour: string };
  surface: { grainAmount: number; grainSize: number; holoAmount: number; holoSpeed: number; duoAmount: number; duoShadow: string; duoLight: string; cloudAmount: number; cloudScale: number; cloudTint: string; meshAmount: number; meshPalette: number };
  finish: { caAmount: number; vignetteAmount: number; vignetteSize: number; mixMode: number; paperAmount: number; paperTint: string; softAmount: number; streakAmount: number; streakLength: number; lutId: number; lutAmount: number }; // FINISH; lutId 0 NEUTRAL, 1 AMBER, 2 FADE, 3 NEON, 4 FILM, 5 DUSK, 6 B&W, 7 CROSS; mixMode 0 SCREEN, 1 ADD, 2 SOFT LIGHT
  glow: { threshold: number; bloomAmount: number; bloomRadius: number; haloAmount: number; haloSize: number; haloTint: string; glowPat: number; glowPatAmt: number; bitMode: number; bitAmount: number; bitCell: number; bitLevel: number; bitRamp: number; bitMid: number; bitDither: number; bitSize: number };

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

/** The look's own cell size, colour and tone: its saved values over its quality defaults. */
export function lookTone(p: Params): LookTone {
  return { ...(LOOK_TONE_DEFAULTS[p.style] ?? LOOK_TONE_DEFAULTS[0]), ...(p.looks[String(p.style)] ?? {}) };
}

export const defaults: Params = {
  drift: 0,
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
  ss: defaultStyleValues(),
  emitOn: true,
  emit: { r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1, r6: 1, r7: 1, r8: 1, spots: 0, scatter: 0.35, lenRand: 1, turn: 0.3 },
  looks: {},
  audioAmount: 0.7,
  motionFx: 0,
  motionAmount: 0.6,
  motionSpeed: 1,
  musicLook: 0,
  eqStyle: 0,
  eqSize: 1.8,
  trackStyle: 'old',
  scanLevel: 3,
  trails: true,
  bloomOn: false,
  haloOn: false,
  chromeOn: false,
  chrome: { bevel: 0.5, shine: 0.5, hue: 0, depth: 0.5 },
  prismaticOn: false,
  prismatic: { length: 0.5, spread: 0.5, glow: 0.5, threshold: 0.4 },
  auraOn: false,
  aura: { glow: 0.5, reach: 0.5, core: 0.6, tint: 0.5 },
  ecstasyOn: false,
  ecstasy: { tint: 0.8, depth: 0.5, glow: 0.5, core: 0.5 },
  blightOn: false,
  blight: { spread: 0.5, grain: 0.5, ink: 0.5, haze: 0.5 },
  redmetOn: false,
  redmet: { heat: 0.7, rim: 0.6, bevel: 0.5 },
  chroma2On: false,
  chroma2: { rim: 0.6, spectrum: 0.7, bevel: 0.5 },
  vbrntFingOn: false,
  vbrntFing: { pattern: 0.5, color: 0.5, ink: 0.5 },
  glassGreenOn: false,
  glassGreen: { gloss: 0.85, rim: 0.90, depth: 0.70, bevel: 0.65 },
  candyOn: false,
  candy: { gloss: 0.85, glow: 0.70, tone: 0.50 },
  cabrOn: false,
  cabr: { disp: 0.85, gloss: 0.90, rim: 0.85 },
  softwordOn: false,
  softword: { glow: 0.6 },
  convulsionsOn: false,
  convulsions: { line: 0.5, hatch: 0.5, jitter: 0.5 },
  linedOn: false,
  lined: { count: 60, weight: 0.6, contrast: 0.5 },
  bloodOn: false,
  blood: { shift: 0.5, bleed: 0.5, grain: 0.5 },
  shakeOn: false,
  shake: { smear: 0.5, cover: 0.3, patch: 0.5 },
  furOn: false,
  fur: { pile: 0.6, length: 0.4, fuzz: 0.5 },
  aranciaOn: false,
  arancia: { pores: 0.6, web: 0.6, gloss: 0.5 },
  rockOn: false,
  rock: { cracks: 0.5, grain: 0.6, wear: 0.5 },
  cumulusOn: false,
  cumulus: { puff: 0.5, glow: 0.5, soft: 0.5 },
  blendOn: false,
  blend: { amount: 0.6, warm: 0.4, soft: 0.5 },
  vhsOn: false,
  glitchOn: false,
  glitchBeat: false,
  signal: { vhsAmount: 0.5, vhsNoise: 0.5, glitchAmount: 0.5, glitchRate: 0.4 },
  grainOn: false,
  holoOn: false,
  duoOn: false,
  cloudOn: false,
  meshOn: false,
  caOn: false,
  vignetteOn: false,
  paperOn: false,
  softOn: false,
  tentOn: false,
  streakOn: false,
  hdrOn: false,
  lutOn: false,
  blueGrainOn: false,
  stackOn: false,
  stackWords: true,
  graphic: { stackCount: 9, stackWidth: 1, stackColour: '#ffffff' },
  surface: { grainAmount: 0.5, grainSize: 0.3, holoAmount: 0.5, holoSpeed: 0.5, duoAmount: 0.8, duoShadow: '#1a0d4d', duoLight: '#ffd980', cloudAmount: 0.5, cloudScale: 0.4, cloudTint: '#ccd9ff', meshAmount: 0.6, meshPalette: 0 },
  finish: { caAmount: 0.5, vignetteAmount: 0.5, vignetteSize: 0.45, mixMode: 0, paperAmount: 0.9, paperTint: '#efe8d6', softAmount: 0.5, streakAmount: 0.3, streakLength: 0.5, lutId: 1, lutAmount: 0.8 },
  glow: { threshold: 0.55, bloomAmount: 0.9, bloomRadius: 0.4, haloAmount: 0.7, haloSize: 0.6, haloTint: '#ffd9a0', glowPat: 0, glowPatAmt: 0.8, bitMode: 0, bitAmount: 1, bitCell: 4, bitLevel: 0.5, bitRamp: 0, bitMid: 0.5, bitDither: 0.7, bitSize: 0.9 },

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

/** MOTION presets: how much the picture moves. FLOW is the start look. */
export const MOTION_PRESETS = [
  { id: 'calm', label: 'CALM', title: 'Slow and quiet', drift: 0.12, depth: 0.4, randomness: 0.05, trailAmount: 0.6 },
  { id: 'flow', label: 'FLOW', title: 'The start look', drift: 0.3, depth: 0.5, randomness: 0.1, trailAmount: 1.1 },
  { id: 'storm', label: 'STORM', title: 'Fast and wild', drift: 0.85, depth: 0.8, randomness: 0.35, trailAmount: 1.6 },
] as const;

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
/** The EFFECTS reset state, also the state on every load: the DOTS look, zero movement, no effects, no trails. */
export function withEffectsStart(): Params {
  return {
    ...withLightStart(defaults),
    style: 0,
    drift: 0,
    emitOn: false, // first load: emitters off (the EMITTER tab ON button turns them on)
    motionFx: 0,
    glow: { ...defaults.glow, glowPat: 0 },
    bloomOn: false,
    haloOn: false,
    chromeOn: false,
    auraOn: false,
    ecstasyOn: false,
    blightOn: false,
    redmetOn: false,
    chroma2On: false,
    vbrntFingOn: false,
    glassGreenOn: false,
    candyOn: false,
    cabrOn: false,
    convulsionsOn: false,
    softwordOn: false,
    prismaticOn: false,
    linedOn: false,
    bloodOn: false,
    shakeOn: false,
    furOn: false,
    aranciaOn: false,
    rockOn: false,
    cumulusOn: false,
    blendOn: false,
    holoOn: false,
    vhsOn: false,
    glitchOn: false,
    glitchBeat: false,
    grainOn: false,
    duoOn: false,
    cloudOn: false,
    meshOn: false,
    caOn: false,
    vignetteOn: false,
    paperOn: false,
    softOn: false,
    tentOn: false,
    streakOn: false,
    hdrOn: false,
    lutOn: false,
    blueGrainOn: false,
    stackOn: false,
    stackWords: false,
  };
}

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

/** Cell size and gap are not set by the user any more: saved values are dropped, so every look uses its own defaults. */
function withoutCellSettings(looks: Record<string, Partial<LookTone>>): Record<string, Partial<LookTone>> {
  const out: Record<string, Partial<LookTone>> = {};
  for (const [key, tone] of Object.entries(looks)) {
    const { cell: _cell, gap: _gap, ...rest } = tone;
    out[key] = rest;
  }
  return out;
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
      looks: withoutCellSettings({ ...fallback.looks, ...(parsed.looks || {}) }),
      glow: { ...fallback.glow, ...(parsed.glow || {}) },
      signal: { ...fallback.signal, ...(parsed.signal || {}) },
      surface: { ...fallback.surface, ...(parsed.surface || {}) },
      graphic: { ...fallback.graphic, ...(parsed.graphic || {}) },
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
