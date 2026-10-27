import { describe, expect, it } from 'vitest';
import { bitrateFor, frameSize } from '../src/web/frameSize';

describe('frameSize', () => {
  it('keeps the short side and makes the long side from the ratio', () => {
    expect(frameSize(16 / 9, 1080)).toEqual({ w: 1920, h: 1080 });
    expect(frameSize(9 / 16, 1080)).toEqual({ w: 1080, h: 1920 });
    expect(frameSize(1, 720)).toEqual({ w: 720, h: 720 });
  });

  it('always returns even sides (H.264)', () => {
    for (const a of [9 / 19.5, 4 / 5, 21 / 9, 1170 / 2532, 1.3333]) {
      const { w, h } = frameSize(a, 1080);
      expect(w % 2).toBe(0);
      expect(h % 2).toBe(0);
    }
  });

  it('clamps absurd ratios', () => {
    const { w, h } = frameSize(1000, 480);
    expect(w).toBeLessThanOrEqual(480 * 8);
    expect(h).toBe(480);
  });
});

describe('bitrateFor', () => {
  it('follows the pixel count and the frame rate', () => {
    const a = bitrateFor(1080, 1920, 1080, 30);
    expect(a).toBe(12_000_000);
    expect(bitrateFor(1080, 1080, 1920, 30)).toBe(a); // same pixels, same rate
    expect(bitrateFor(1080, 1920, 1080, 60)).toBe(18_000_000);
    expect(bitrateFor(1080, 1080, 1080, 30)).toBeLessThan(a);
  });
});
