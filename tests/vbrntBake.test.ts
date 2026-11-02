import { describe, expect, it } from 'vitest';
import { bakeVbrnt } from '../src/lite/vbrntBake';

const ctrl = { pattern: 0.5, color: 1, ink: 0.5 };

describe('bakeVbrnt', () => {
  it('keeps alpha (the depth) and leaves empty pixels alone', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 255, 10, 10, 10, 0]);
    const out = bakeVbrnt(rgba, 2, 1, ctrl);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(0);
    expect(Array.from(out.slice(4, 7))).toEqual([10, 10, 10]);
  });

  it('colours a bright pixel towards the pink end of the ink ramp', () => {
    const out = bakeVbrnt(new Uint8ClampedArray([250, 250, 250, 255]), 1, 1, ctrl);
    expect(out[0]).toBeGreaterThan(out[2]); // pink: red over blue
  });

  it('colours a dark pixel towards navy', () => {
    const out = bakeVbrnt(new Uint8ClampedArray([20, 20, 20, 255]), 1, 1, ctrl);
    expect(out[2]).toBeGreaterThan(out[0]); // navy: blue over red
  });

  it('with colour at 0 the output is grey, not inked', () => {
    const out = bakeVbrnt(new Uint8ClampedArray([250, 250, 250, 255]), 1, 1, { ...ctrl, color: 0, pattern: 0 });
    expect(Math.abs(out[0] - out[2])).toBeLessThanOrEqual(1);
  });
});
