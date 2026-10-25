// src/core/Sampler.ts
export interface SamplePointData {
  home: Float32Array;  // length N * 4 (x, y, z, 1.0)
  color: Uint8Array;   // length N * 4 (r, g, b, a)
  count: number;
  texWidth: number;
  texHeight: number;
  activeSubjectPixels: number;
  /** Half-size of the sampled subject in world units */
  halfW: number;
  halfH: number;
}

/** Cheap integer hash -> [0, 1). Independent stream per (index, salt). */
export function hash01(i: number, salt: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
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
  return { jx: u - 0.5, jy: v - 0.5 };
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
 * Cut out a flat background. Estimates the backdrop colour from the image border and flood-fills
 * inward from the edges through pixels that match it. Returns a 0/1 mask (1 = subject), or null
 * when the border is not a flat colour (a busy photo) or the fill would swallow the picture.
 */
export function removeFlatBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number
): Uint8Array | null {
  const n = w * h;

  // Mean and spread of the border pixels
  let mr = 0, mg = 0, mb = 0, count = 0;
  const sampleBorder = (x: number, y: number, fn: (r: number, g: number, b: number) => void) => {
    const i = (y * w + x) * 4;
    fn(rgba[i], rgba[i + 1], rgba[i + 2]);
  };
  const border: Array<[number, number]> = [];
  for (let x = 0; x < w; x += 2) { border.push([x, 0], [x, h - 1]); }
  for (let y = 0; y < h; y += 2) { border.push([0, y], [w - 1, y]); }
  for (const [x, y] of border) {
    sampleBorder(x, y, (r, g, b) => { mr += r; mg += g; mb += b; count++; });
  }
  mr /= count; mg /= count; mb /= count;

  let spread = 0;
  for (const [x, y] of border) {
    sampleBorder(x, y, (r, g, b) => {
      spread += Math.hypot(r - mr, g - mg, b - mb);
    });
  }
  spread /= count;
  if (spread > 22) return null; // border is not a flat colour

  const tol = 46 + spread * 2; // in 0..441 RGB distance
  const isBg = (i: number) =>
    Math.hypot(rgba[i * 4] - mr, rgba[i * 4 + 1] - mg, rgba[i * 4 + 2] - mb) < tol;

  const mask = new Uint8Array(n).fill(1);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (mask[i] === 1 && isBg(i)) {
      mask[i] = 0;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  let kept = 0;
  for (let i = 0; i < n; i++) kept += mask[i];
  if (kept < n * 0.01 || kept > n * 0.995) return null; // nothing cut, or everything cut

  // Grow the cut back by one pixel so anti-aliased fringe is not left as a halo of background
  const out = mask.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] === 1 && (mask[i - 1] === 0 || mask[i + 1] === 0 || mask[i - w] === 0 || mask[i + w] === 0)) {
        if (isBg(i) || Math.hypot(rgba[i * 4] - mr, rgba[i * 4 + 1] - mg, rgba[i * 4 + 2] - mb) < tol * 1.6) {
          out[i] = 0;
        }
      }
    }
  }
  return out;
}

/**
 * Builds importance weights for sampling. Particles are spent where the picture has something
 * to show, so the static image keeps its line work and tonal detail:
 *   mask * (floor + edge strength + luminance + saturation)
 */
export function computeImportanceWeights(
  rgba: Uint8ClampedArray | Uint8Array,
  depth: Float32Array,
  w: number,
  h: number
): { weights: Float32Array; mask: Float32Array; activeCount: number } {
  const n = w * h;
  const mask = new Float32Array(n);
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const weights = new Float32Array(n);
  let activeCount = 0;

  let hasExplicitAlpha = false;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 240) {
      hasExplicitAlpha = true;
      break;
    }
  }

  const cut = hasExplicitAlpha ? null : removeFlatBackground(rgba, w, h);

  // 1. Mask, luminance and saturation
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    const a = rgba[i * 4 + 3] / 255;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    sat[i] = maxC === 0 ? 0 : (maxC - minC) / maxC;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;

    // Faint alpha is cut-out fringe or grain, not subject: do not spend particles on it
    if (hasExplicitAlpha) mask[i] = a > 0.15 ? a : 0.0;
    else mask[i] = cut ? cut[i] : 1.0;

    if (mask[i] > 0) activeCount++;
  }

  // 2. Weight = floor + edge strength + tone. Edges matter most: they carry the line work.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] <= 0) continue;

      let edge = 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const gradX = lum[idx + 1] - lum[idx - 1];
        const gradY = lum[idx + w] - lum[idx - w];
        edge = Math.min(1.0, Math.hypot(gradX, gradY) * 3.0);
      }

      const tone = Math.pow(lum[idx], 1.2);
      // Flat areas need enough grain to read as a photo, so the floor is high
      weights[idx] = mask[idx] * (0.4 + 0.6 * edge + 0.5 * tone + 0.2 * sat[idx]);
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

  // 1024 x 512 = 524,288 particles
  const texWidth = 1024;
  const texHeight = 512;
  const N = texWidth * texHeight;

  const home = new Float32Array(N * 4);
  const color = new Uint8Array(N * 4);

  for (let i = 0; i < N; i++) {
    // Stratified jittered pick: even coverage of the weight CDF, but no fixed lattice.
    // (A low-discrepancy sequence on both the pick and the jitter makes repeating S-curve bands.)
    const u = (i + hash01(i, 1)) / N;
    const targetVal = u * totalWeight;
    const px = lowerBound(cdf, targetVal);

    const basePxX = px % w;
    const basePxY = Math.floor(px / w);

    const jx = hash01(i, 2) - 0.5;
    const jy = hash01(i, 3) - 0.5;
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
    home[homeIdx + 3] = 0.0; // light weight, filled below once the colour is sampled

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

    // Light weight: how bright the source pixel is. Bright particles stream more often.
    const lr = color[colIdx + 0] / 255;
    const lg = color[colIdx + 1] / 255;
    const lb = color[colIdx + 2] / 255;
    home[homeIdx + 3] = Math.min(1, 0.299 * lr + 0.587 * lg + 0.114 * lb);
  }

  // Subject half-extent: 1st..99th percentile of the particle positions (ignores stray specks)
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = Math.abs(home[i * 4]);
    ys[i] = Math.abs(home[i * 4 + 1]);
  }
  xs.sort();
  ys.sort();
  const halfW = Math.max(0.1, xs[Math.floor(N * 0.99)]);
  const halfH = Math.max(0.1, ys[Math.floor(N * 0.99)]);

  return {
    home,
    color,
    count: N,
    texWidth,
    texHeight,
    activeSubjectPixels: activeCount,
    halfW,
    halfH,
  };
}
