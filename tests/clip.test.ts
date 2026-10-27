import { describe, expect, it } from 'vitest';
import {
  CLIP_MAX_SECONDS,
  KEYFRAME_SECONDS,
  clampClip,
  keyframeCount,
  keyframeIndexAt,
  keyframeTime,
} from '../src/video/clip';

describe('clampClip', () => {
  it('keeps a short range as it is', () => {
    expect(clampClip(2, 5, 60)).toEqual({ start: 2, end: 5 });
  });

  it('caps the length at CLIP_MAX_SECONDS', () => {
    const r = clampClip(0, 60, 60);
    expect(r.end - r.start).toBe(CLIP_MAX_SECONDS);
  });

  it('keeps the range inside the source', () => {
    expect(clampClip(-3, 4, 10)).toEqual({ start: 0, end: 4 });
    expect(clampClip(8, 99, 10)).toEqual({ start: 8, end: 10 });
  });

  it('gives an empty range when end is before start', () => {
    const r = clampClip(5, 2, 10);
    expect(r.end).toBe(r.start);
  });
});

describe('keyframes', () => {
  it('counts keyframes at KEYFRAME_SECONDS spacing, rounding up', () => {
    expect(keyframeCount({ start: 0, end: 10 })).toBe(20);
    expect(keyframeCount({ start: 0, end: 1.2 })).toBe(3);
    expect(keyframeCount({ start: 3, end: 3 })).toBe(0);
  });

  it('places keyframe k at start + k * spacing', () => {
    expect(keyframeTime({ start: 2, end: 10 }, 0)).toBe(2);
    expect(keyframeTime({ start: 2, end: 10 }, 3)).toBeCloseTo(2 + 3 * KEYFRAME_SECONDS);
  });

  it('finds the keyframe at a time and clamps it inside the clip', () => {
    const r = { start: 2, end: 4 };
    const count = keyframeCount(r); // 4
    expect(keyframeIndexAt(r, 2, count)).toBe(0);
    expect(keyframeIndexAt(r, 2.49, count)).toBe(0);
    expect(keyframeIndexAt(r, 2.5, count)).toBe(1);
    expect(keyframeIndexAt(r, 1, count)).toBe(0);
    expect(keyframeIndexAt(r, 99, count)).toBe(count - 1);
  });
});
