// src/video/clip.ts
// Clip timing for video input. Pure functions, no DOM. A clip is a range of the source video. Its
// picture is refreshed at keyframes KEYFRAME_SECONDS apart, so the sim only ever holds one keyframe's
// depth at a time, and nothing outside the range is decoded or estimated.

/** Longest clip the studio accepts. Bounds depth prep, memory and export time. */
export const CLIP_MAX_SECONDS = 10;
/** Spacing of depth keyframes inside a clip, in seconds of source video. */
export const KEYFRAME_SECONDS = 0.5;
/** Long side (px) of each keyframe's picture and depth. Half the still picture's working size. */
export const KEYFRAME_MAX_SIDE = 512;
/** Particles per keyframe sample. 16 bytes each, so 200k is 3.2 MB per keyframe (about 64 MB for a 10 s clip). */
export const VIDEO_PARTICLE_CAP = 200000;

export interface ClipRange {
  start: number;
  end: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Keep the range inside the source and no longer than CLIP_MAX_SECONDS. End may equal start (empty clip). */
export function clampClip(start: number, end: number, duration: number): ClipRange {
  const s = clamp(start, 0, duration);
  const e = clamp(end, s, Math.min(duration, s + CLIP_MAX_SECONDS));
  return { start: s, end: e };
}

/** Number of keyframes for a range. Zero for an empty range. */
export function keyframeCount(range: ClipRange): number {
  const len = range.end - range.start;
  return len <= 0 ? 0 : Math.ceil(len / KEYFRAME_SECONDS);
}

/** Source time of keyframe k. */
export function keyframeTime(range: ClipRange, k: number): number {
  return range.start + k * KEYFRAME_SECONDS;
}

/** Which keyframe holds source time t: the last one at or before t, kept inside 0..count-1. */
export function keyframeIndexAt(range: ClipRange, t: number, count: number): number {
  return clamp(Math.floor((t - range.start) / KEYFRAME_SECONDS), 0, Math.max(0, count - 1));
}
