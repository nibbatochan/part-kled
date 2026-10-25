// src/core/Sampler.ts
export interface SamplePointData {
  home: Float32Array;  // length N * 4 (x, y, z, 1.0)
  color: Uint8Array;   // length N * 4 (r, g, b, a)
  count: number;
  texWidth: number;
  texHeight: number;
  activeSubjectPixels: number;
}

/** R2 low discrepancy sequence */
const PHI2 = 1.324717957244746;
const A1 = 1.0 / PHI2;
const A2 = 1.0 / (PHI2 * PHI2);

export function r2Sequence1D(i: number): number {
  return (0.5 + i * A1) % 1.0;
}

export function r2Jitter(i: number): { jx: number; jy: number } {
  const u = (0.5 + i * A1) % 1.0;
  const v = (0.5 + i * A2) % 1.0;
  return { jx: (u - 0.5) * 0.9, jy: (v - 0.5) * 0.9 };
}

/** Binary search for lower bound in cumulative distribution array */
export function lowerBound(cdf: Float32Array, val: number): number {
  let low = 0;
  let high = cdf.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cdf[mid] < val) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Builds importance weights for sampling:
 * mask * (0.35 + 0.65 * saliency)
 * where saliency = normalized gradient + saturation
 */
export function computeImportanceWeights(
  rgba: Uint8ClampedArray | Uint8Array,
  depth: Float32Array,
  w: number,
  h: number
): { weights: Float32Array; mask: Float32Array; activeCount: number } {
  const n = w * h;
  const mask = new Float32Array(n);
  const saliency = new Float32Array(n);
  const weights = new Float32Array(n);
  let activeCount = 0;

  let hasExplicitAlpha = false;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 240) {
      hasExplicitAlpha = true;
      break;
    }
  }

  // 1. Compute mask and color saturation
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const r = rgba[idx * 4] / 255;
      const g = rgba[idx * 4 + 1] / 255;
      const b = rgba[idx * 4 + 2] / 255;
      const a = rgba[idx * 4 + 3] / 255;

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

      if (hasExplicitAlpha) {
        mask[idx] = a > 0.05 ? 1.0 : 0.0;
      } else {
        mask[idx] = 1.0;
      }

      if (mask[idx] > 0) activeCount++;
      saliency[idx] = sat * 0.4;
    }
  }

  // 2. Add gradient magnitude to saliency
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (mask[idx] <= 0) continue;

      const lumL = (rgba[(idx - 1) * 4] + rgba[(idx - 1) * 4 + 1] + rgba[(idx - 1) * 4 + 2]) / (3 * 255);
      const lumR = (rgba[(idx + 1) * 4] + rgba[(idx + 1) * 4 + 1] + rgba[(idx + 1) * 4 + 2]) / (3 * 255);
      const lumT = (rgba[(idx - w) * 4] + rgba[(idx - w) * 4 + 1] + rgba[(idx - w) * 4 + 2]) / (3 * 255);
      const lumB = (rgba[(idx + w) * 4] + rgba[(idx + w) * 4 + 1] + rgba[(idx + w) * 4 + 2]) / (3 * 255);

      const gradX = lumR - lumL;
      const gradY = lumB - lumT;
      const gradMag = Math.min(1.0, Math.hypot(gradX, gradY) * 2.0);

      saliency[idx] = Math.min(1.0, saliency[idx] + gradMag * 0.5);
      weights[idx] = mask[idx] * (0.55 + 0.45 * saliency[idx]);
    }
  }

  // Fallback if weights sum is 0
  let sum = 0;
  for (let i = 0; i < n; i++) sum += weights[i];
  if (sum <= 1e-4) {
    for (let i = 0; i < n; i++) weights[i] = 1.0;
    activeCount = n;
  }

  return { weights, mask, activeCount };
}

export function buildCDF(weights: Float32Array): Float32Array {
  const n = weights.length;
  const cdf = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += weights[i];
    cdf[i] = acc;
  }
  return cdf;
}

export function sampleImageParticles(
  imageCanvas: HTMLCanvasElement,
  depth: Float32Array
): SamplePointData {
  const w = imageCanvas.width;
  const h = imageCanvas.height;
  const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot get 2d context for sampling');

  const imgData = ctx.getImageData(0, 0, w, h);
  const rgba = imgData.data;

  const { weights, activeCount } = computeImportanceWeights(rgba, depth, w, h);
  const cdf = buildCDF(weights);
  const totalWeight = cdf[cdf.length - 1];

  const aspect = w / h;

  // Ultra high-density 512x512 = 262,144 particles (photographic stipple reproduction, ultra-fine dust)
  const texWidth = 512;
  const texHeight = 512;
  const N = texWidth * texHeight;

  const home = new Float32Array(N * 4);
  const color = new Uint8Array(N * 4);

  for (let i = 0; i < N; i++) {
    const u = r2Sequence1D(i);
    const targetVal = u * totalWeight;
    const px = lowerBound(cdf, targetVal);

    const basePxX = px % w;
    const basePxY = Math.floor(px / w);

    const { jx, jy } = r2Jitter(i);
    const x = Math.max(0, Math.min(w - 1, basePxX + jx));
    const y = Math.max(0, Math.min(h - 1, basePxY + jy));

    const x0 = Math.floor(x);
    const x1 = Math.min(w - 1, x0 + 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;

    const d00 = depth[y0 * w + x0] || 0;
    const d10 = depth[y0 * w + x1] || 0;
    const d01 = depth[y1 * w + x0] || 0;
    const d11 = depth[y1 * w + x1] || 0;
    const zDepth = (d00 * (1 - fx) + d10 * fx) * (1 - fy) + (d01 * (1 - fx) + d11 * fx) * fy;

    const homeIdx = i * 4;
    home[homeIdx + 0] = (x / w - 0.5) * aspect;
    home[homeIdx + 1] = 0.5 - y / h;
    home[homeIdx + 2] = (zDepth - 0.5);
    home[homeIdx + 3] = 1.0;

    // High-fidelity bilinear color interpolation
    const idx00 = (y0 * w + x0) * 4;
    const idx10 = (y0 * w + x1) * 4;
    const idx01 = (y1 * w + x0) * 4;
    const idx11 = (y1 * w + x1) * 4;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;

    const colIdx = i * 4;
    color[colIdx + 0] = Math.round(rgba[idx00 + 0] * w00 + rgba[idx10 + 0] * w10 + rgba[idx01 + 0] * w01 + rgba[idx11 + 0] * w11);
    color[colIdx + 1] = Math.round(rgba[idx00 + 1] * w00 + rgba[idx10 + 1] * w10 + rgba[idx01 + 1] * w01 + rgba[idx11 + 1] * w11);
    color[colIdx + 2] = Math.round(rgba[idx00 + 2] * w00 + rgba[idx10 + 2] * w10 + rgba[idx01 + 2] * w01 + rgba[idx11 + 2] * w11);
    color[colIdx + 3] = Math.round(rgba[idx00 + 3] * w00 + rgba[idx10 + 3] * w10 + rgba[idx01 + 3] * w01 + rgba[idx11 + 3] * w11);
  }

  return {
    home,
    color,
    count: N,
    texWidth,
    texHeight,
    activeSubjectPixels: activeCount,
  };
}
