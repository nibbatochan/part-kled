// src/web/frameSize.ts
// Export frame maths, kept apart from the renderer so it can be tested without a browser.

/** The "p" of 480p, 720p, 1080p, 2K, 4K is the short side of the frame, so a phone video is 1080 x 1920. */
export const SHORT_SIDES = [480, 720, 1080, 1440, 2160] as const;

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2); // H.264 needs even sides
}

/** Pixel size of a frame with this width / height ratio and this short side. */
export function frameSize(aspect: number, short: number): { w: number; h: number } {
  const a = Math.min(8, Math.max(1 / 8, aspect));
  return a >= 1 ? { w: even(short * a), h: even(short) } : { w: even(short), h: even(short / a) };
}

/** Video bitrate at 30 fps: the 16:9 table scaled by how many pixels this frame has. */
const BITRATE_30: Record<number, number> = {
  480: 4_000_000,
  720: 8_000_000,
  1080: 12_000_000,
  1440: 24_000_000,
  2160: 50_000_000,
};

export function bitrateFor(short: number, w: number, h: number, fps: number): number {
  const base = BITRATE_30[short] ?? 12_000_000;
  const standardPx = short * short * (16 / 9);
  const rate = base * Math.min(2, Math.max(0.5, (w * h) / standardPx));
  return Math.round(rate * (fps > 30 ? 1.5 : 1));
}
