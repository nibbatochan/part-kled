import { describe, it, expect } from 'vitest';
import { buildCDF, lowerBound, r2Sequence1D, r2Jitter } from '../src/core/Sampler';

describe('Sampler algorithms', () => {
  it('buildCDF builds monotonic prefix sums', () => {
    const weights = new Float32Array([1, 2, 3, 4]);
    const cdf = buildCDF(weights);
    expect(cdf[0]).toBe(1);
    expect(cdf[1]).toBe(3);
    expect(cdf[2]).toBe(6);
    expect(cdf[3]).toBe(10);
  });

  it('lowerBound finds correct indices', () => {
    const cdf = new Float32Array([1, 3, 6, 10]);
    expect(lowerBound(cdf, 0.5)).toBe(0);
    expect(lowerBound(cdf, 1.0)).toBe(0);
    expect(lowerBound(cdf, 1.5)).toBe(1);
    expect(lowerBound(cdf, 3.0)).toBe(1);
    expect(lowerBound(cdf, 5.0)).toBe(2);
    expect(lowerBound(cdf, 9.5)).toBe(3);
  });

  it('r2Sequence produces well distributed values in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const u = r2Sequence1D(i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('r2Jitter produces sub-pixel offsets', () => {
    for (let i = 0; i < 50; i++) {
      const { jx, jy } = r2Jitter(i);
      expect(Math.abs(jx)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(jy)).toBeLessThanOrEqual(0.5);
    }
  });
});
