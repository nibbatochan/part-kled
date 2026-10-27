import { describe, expect, it } from 'vitest';
import { RAMP_SIZES, STYLE_NAMES, STYLE_SETTINGS, defaultStyleValues, hexToRgb, packStyle } from '../src/core/styles';

describe('style settings', () => {
  it('has a default inside the range for every setting', () => {
    for (const s of STYLE_SETTINGS) {
      if (s.kind === 'range') {
        expect(s.def).toBeGreaterThanOrEqual(s.min);
        expect(s.def).toBeLessThanOrEqual(s.max);
      } else {
        expect(s.def).toBeLessThan(s.options.length);
      }
      for (const st of s.styles) expect(st).toBeGreaterThan(0), expect(st).toBeLessThan(STYLE_NAMES.length);
    }
  });

  it('uses unique keys and gives each cell look at most four settings', () => {
    const keys = STYLE_SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (let st = 1; st < STYLE_NAMES.length; st++) {
      const n = STYLE_SETTINGS.filter((s) => s.styles.includes(st)).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('packs the settings of one look into the shader slots', () => {
    const v = defaultStyleValues();
    const half = packStyle(1, v);
    expect(half.sp[0]).toBe(v.hShape);
    expect(half.angle).toBeCloseTo((45 * Math.PI) / 180);
    const ascii = packStyle(4, { ...v, aRamp: 1 });
    expect(ascii.ramp).toBe(RAMP_SIZES[1]);
    expect(ascii.cellAspect).toBe(2);
    expect(packStyle(0, v).sp).toEqual([0, 0, 0, 0]);
  });
});

describe('hexToRgb', () => {
  it('reads six-digit hex and falls back to white', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('00ff00')).toEqual([0, 1, 0]);
    expect(hexToRgb('nope')).toEqual([1, 1, 1]);
  });
});
