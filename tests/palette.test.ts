import { describe, expect, it } from 'vitest';
import { paletteFrom } from '../src/audio/palette';

/** A grid of blocks: each block is one colour, filling a row. */
function grid(colours: [number, number, number][], w = 40, h = 40) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const c = colours[Math.floor((y / h) * colours.length)];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return { w, h, rgba };
}

describe('paletteFrom', () => {
  it('returns both picture colours', () => {
    const p = paletteFrom(grid([[200, 40, 30], [30, 90, 220]]));
    expect(p.length).toBe(2);
    expect(p.some((c) => c[0] > 150 && c[2] < 80)).toBe(true); // red
    expect(p.some((c) => c[2] > 150 && c[0] < 80)).toBe(true); // blue
  });

  it('ignores pure black and white backgrounds', () => {
    const p = paletteFrom(grid([[0, 0, 0], [255, 255, 255], [240, 120, 20]]));
    expect(p.length).toBe(1);
    expect(p[0][0]).toBeGreaterThan(200);
  });

  it('falls back to greys when there is no grid', () => {
    expect(paletteFrom(undefined).length).toBeGreaterThan(0);
  });

  it('never returns more colours than asked', () => {
    const p = paletteFrom(grid([[200, 40, 30], [30, 200, 40], [40, 30, 200], [200, 200, 30], [30, 200, 200], [200, 30, 200]]), 3);
    expect(p.length).toBeLessThanOrEqual(3);
  });
});
