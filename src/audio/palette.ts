// src/audio/palette.ts
// The colours of the picture for the equalizer: the most common saturated colours, so the bars pick up the
// picture's own palette. Pure logic, so it can be tested without a browser.

export type Rgb = [number, number, number];

const FALLBACK: Rgb[] = [[233, 236, 238], [154, 163, 168], [91, 98, 104]];

/** Up to `count` distinct colours from the picture's grid (rgb per pixel, alpha ignored). */
export function paletteFrom(grid: { w: number; h: number; rgba: Uint8Array } | undefined, count = 5): Rgb[] {
  if (!grid || grid.w * grid.h === 0) return FALLBACK;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((grid.w * grid.h) / 4000))); // sample about 4000 pixels
  for (let y = 0; y < grid.h; y += step) {
    for (let x = 0; x < grid.w; x += step) {
      const i = (y * grid.w + x) * 4;
      const r = grid.rgba[i];
      const g = grid.rgba[i + 1];
      const b = grid.rgba[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luma < 0.08 || luma > 0.97) continue; // black and white backgrounds are not a palette
      const sat = max === 0 ? 0 : (max - min) / max;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const w = 1 + 3 * sat; // a vivid colour counts more than a grey of the same size
      const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n += w;
      e.r += r * w;
      e.g += g * w;
      e.b += b * w;
      bins.set(key, e);
    }
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n);
  const out: Rgb[] = [];
  for (const e of sorted) {
    const c: Rgb = [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)];
    // keep colours apart: a new one must differ clearly from every one already picked
    if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 60)) out.push(c);
    if (out.length === count) break;
  }
  return out.length ? out : FALLBACK;
}

export function cssRgb(c: Rgb, alpha = 1): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}
