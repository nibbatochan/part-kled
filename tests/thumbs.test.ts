import { describe, it, expect } from 'vitest';
import { slotPlan, MAX_IMAGES } from '../src/ui/Thumbs';

describe('picture slots', () => {
  it('always total five, empty ones included', () => {
    for (let n = 0; n <= MAX_IMAGES; n++) {
      const p = slotPlan(n);
      expect(p.filled + p.addButton + p.placeholders).toBe(MAX_IMAGES);
    }
  });
  it('with no pictures: the add button first, then four empty slots', () => {
    expect(slotPlan(0)).toEqual({ filled: 0, addButton: 1, placeholders: 4 });
  });
  it('with five pictures: no add button, no empty slots', () => {
    expect(slotPlan(5)).toEqual({ filled: 5, addButton: 0, placeholders: 0 });
  });
  it('never counts more than five pictures', () => {
    expect(slotPlan(9)).toEqual({ filled: 5, addButton: 0, placeholders: 0 });
  });
});
