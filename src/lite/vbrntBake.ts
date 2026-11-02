// src/lite/vbrntBake.ts
// VBRNT-FING, baked into the picture before it becomes dots: a riso-style engraving. Each tone picks an ink
// from a small set (navy, teal, green, lime, orange, skin pink), and diagonal burin lines get wider where the
// picture is darker. The effect runs on the picture's own pixels, so the hatch is drawn at picture resolution,
// not on the dot grid. Alpha (the depth) is left alone.

export interface VbrntControls {
  pattern: number; // 0..1 how much of the burin hatch shows
  color: number;   // 0..1 grey to the riso inks
  ink: number;     // 0..1 how deep the hatch cuts into the ink
}

/** Ink ramp, dark to light. Positions are luma 0..1. */
const INKS: [number, [number, number, number]][] = [
  [0.0, [0.12, 0.31, 0.39]],  // navy
  [0.25, [0.18, 0.56, 0.48]], // teal
  [0.45, [0.42, 0.68, 0.24]], // green
  [0.65, [0.85, 0.85, 0.29]], // lime
  [0.82, [0.95, 0.6, 0.18]],  // orange
  [1.0, [0.91, 0.63, 0.57]],  // skin pink
];

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function inkAt(lum: number): [number, number, number] {
  let i = 0;
  while (i < INKS.length - 2 && lum > INKS[i + 1][0]) i++;
  const [t0, c0] = INKS[i];
  const [t1, c1] = INKS[i + 1];
  const k = smooth(t0, t1, lum);
  return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
}

/** Returns a new RGBA buffer, w x h, with the engraving in rgb and the original alpha. */
export function bakeVbrnt(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, c: VbrntControls): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  // about 110 lines across the picture, whatever its size
  const period = Math.max(2, w / 110);
  const cx = 0.866 / period;
  const cy = 0.5 / period;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 8) continue; // no subject here
      const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const ink = inkAt(lum);
      const gray = lum;
      const inkCol = [0, 1, 2].map((k) => gray + (ink[k] - gray) * c.color);
      // burin line: its width grows with darkness
      const ph = x * cx + y * cy;
      const ln = Math.abs(ph - Math.floor(ph) - 0.5);
      const lw = 0.05 + 0.41 * (1 - lum);
      const line = 1 - smooth(lw - 0.08, lw, ln);
      const cover = (1 - lum) + (line - (1 - lum)) * c.pattern;
      const shade = 1 - 0.5 * cover * c.ink;
      out[i] = Math.round(Math.min(1, Math.max(0, inkCol[0] * shade)) * 255);
      out[i + 1] = Math.round(Math.min(1, Math.max(0, inkCol[1] * shade)) * 255);
      out[i + 2] = Math.round(Math.min(1, Math.max(0, inkCol[2] * shade)) * 255);
    }
  }
  return out;
}
