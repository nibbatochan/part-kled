// src/lite/sample.ts
// Picture + depth -> one interleaved vertex buffer (16 bytes per particle: f32 xyz, u8 rgb, u8 density gain).
// Particles are written in a low-discrepancy shuffled order, so ANY prefix of the buffer is an even
// subset of the picture. That is what lets the engine drop quality at runtime by drawing fewer points.
import { buildCDF, computeImportanceWeights, hash01, lowerBound } from '../core/Sampler';

export interface LiteSample {
  /** Interleaved: f32 x, y, z then u8 r, g, b, gain/5. Stride 16 bytes. */
  buffer: ArrayBuffer;
  count: number;
  aspect: number;
  /** Share of the picture area that holds the subject (0..1). */
  subjectFraction: number;
}

const MAX_SIDE = 768;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function sampleLite(
  img: CanvasImageSource & { width: number; height: number },
  depthImg: (CanvasImageSource & { width: number; height: number }) | null,
  count: number
): LiteSample {
  const sw = img.width;
  const sh = img.height;
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(2, Math.round(sw * k));
  const h = Math.max(2, Math.round(sh * k));

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;

  const depth = new Float32Array(w * h);
  if (depthImg) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(depthImg, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < depth.length; i++) depth[i] = d[i * 4] / 255;
  } else {
    depth.fill(0.5);
  }

  const { weights, activeCount } = computeImportanceWeights(rgba, depth, w, h);
  const cdf = buildCDF(weights);
  const total = cdf[cdf.length - 1];
  // Dense where the weights are high: each dot carries the inverse so local brightness stays true
  const meanWeight = total / Math.max(1, activeCount);
  const aspect = w / h;

  // Multiplier coprime with count: j = i * mul mod count visits every stratum exactly once
  let mul = Math.floor(count * 0.6180339887) | 1;
  while (gcd(mul, count) !== 1) mul += 2;

  const buffer = new ArrayBuffer(count * 16);
  const f32 = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);

  for (let i = 0; i < count; i++) {
    const j = (i * mul) % count; // < 2^53 for any sane count, so exact in doubles
    const u = (j + hash01(i, 1)) / count;
    const px = lowerBound(cdf, u * total);
    const x = Math.max(0, Math.min(w - 1.001, (px % w) + hash01(i, 2)));
    const y = Math.max(0, Math.min(h - 1.001, Math.floor(px / w) + hash01(i, 3)));
    const x0 = x | 0;
    const y0 = y | 0;
    const fx = x - x0;
    const fy = y - y0;

    const at = (xx: number, yy: number, c: number) => rgba[(yy * w + xx) * 4 + c];
    const mix = (c: number) =>
      (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) +
      (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy;
    const dz = (xx: number, yy: number) => depth[yy * w + xx];
    const z =
      (dz(x0, y0) * (1 - fx) + dz(x0 + 1, y0) * fx) * (1 - fy) +
      (dz(x0, y0 + 1) * (1 - fx) + dz(x0 + 1, y0 + 1) * fx) * fy;

    const r = mix(0);
    const g = mix(1);
    const b = mix(2);

    f32[i * 4] = (x / w - 0.5) * aspect;
    f32[i * 4 + 1] = 0.5 - y / h;
    f32[i * 4 + 2] = z - 0.5;
    const o = i * 16 + 12;
    u8[o] = r;
    u8[o + 1] = g;
    u8[o + 2] = b;
    const gain = Math.min(5, Math.max(0.2, meanWeight / Math.max(1e-4, weights[px])));
    u8[o + 3] = Math.round((gain / 5) * 255);
  }

  return { buffer, count, aspect, subjectFraction: Math.max(0.05, activeCount / (w * h)) };
}
