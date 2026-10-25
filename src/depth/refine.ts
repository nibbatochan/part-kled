// src/depth/refine.ts
/**
 * Edge-aware depth refinement:
 * 1. Percentile normalisation (2nd..98th percentile clip to 0..1)
 * 2. Bilinear upsampling to guide image dimensions
 * 3. Guided filter with photo luminance as guide (radius 8, eps 1e-3)
 * 4. 3x3 median filter for speckle removal
 */

export function normalizeDepth(depth: Float32Array, width: number, height: number): Float32Array {
  const n = width * height;
  const sampleStep = Math.max(1, Math.floor(n / 10000));
  const samples: number[] = [];
  for (let i = 0; i < n; i += sampleStep) {
    samples.push(depth[i]);
  }
  samples.sort((a, b) => a - b);

  const p2 = samples[Math.floor(samples.length * 0.02)] ?? samples[0];
  const p98 = samples[Math.floor(samples.length * 0.98)] ?? samples[samples.length - 1];
  const range = p98 - p2 > 1e-6 ? p98 - p2 : 1;

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const clamped = Math.max(p2, Math.min(p98, depth[i]));
    out[i] = (clamped - p2) / range;
  }
  return out;
}

export function upsampleBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  const xRatio = (srcW - 1) / Math.max(1, dstW - 1);
  const yRatio = (srcH - 1) / Math.max(1, dstH - 1);

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const yLerp = srcY - y0;

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const xLerp = srcX - x0;

      const p00 = src[y0 * srcW + x0];
      const p10 = src[y0 * srcW + x1];
      const p01 = src[y1 * srcW + x0];
      const p11 = src[y1 * srcW + x1];

      const top = p00 + (p10 - p00) * xLerp;
      const bot = p01 + (p11 - p01) * xLerp;
      dst[y * dstW + x] = top + (bot - top) * yLerp;
    }
  }
  return dst;
}

/** Fast separable box filter for 2D array */
export function boxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    let sum = 0;
    // initial window
    for (let x = 0; x <= r && x < w; x++) {
      sum += src[rowOffset + x];
    }
    for (let x = 0; x < w; x++) {
      const left = Math.max(0, x - r);
      const right = Math.min(w - 1, x + r);
      const count = right - left + 1;
      if (x > 0) {
        if (x + r < w) sum += src[rowOffset + x + r];
        if (x - r - 1 >= 0) sum -= src[rowOffset + x - r - 1];
      }
      tmp[rowOffset + x] = sum / count;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= r && y < h; y++) {
      sum += tmp[y * w + x];
    }
    for (let y = 0; y < h; y++) {
      const top = Math.max(0, y - r);
      const bot = Math.min(h - 1, y + r);
      const count = bot - top + 1;
      if (y > 0) {
        if (y + r < h) sum += tmp[(y + r) * w + x];
        if (y - r - 1 >= 0) sum -= tmp[(y - r - 1) * w + x];
      }
      dst[y * w + x] = sum / count;
    }
  }

  return dst;
}

/**
 * Guided filter (He et al.)
 * Guide I: normalized luminance [0..1]
 * Input P: upsampled normalized depth [0..1]
 * Radius r: default 8
 * Epsilon eps: default 1e-3
 */
export function guidedFilter(
  I: Float32Array,
  P: Float32Array,
  w: number,
  h: number,
  r = 8,
  eps = 1e-3
): Float32Array {
  const n = w * h;
  const mean_I = boxFilter(I, w, h, r);
  const mean_p = boxFilter(P, w, h, r);

  const II = new Float32Array(n);
  const Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    II[i] = I[i] * I[i];
    Ip[i] = I[i] * P[i];
  }

  const mean_II = boxFilter(II, w, h, r);
  const mean_Ip = boxFilter(Ip, w, h, r);

  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const var_I = mean_II[i] - mean_I[i] * mean_I[i];
    const cov_Ip = mean_Ip[i] - mean_I[i] * mean_p[i];
    const aVal = cov_Ip / (var_I + eps);
    a[i] = aVal;
    b[i] = mean_p[i] - aVal * mean_I[i];
  }

  const mean_a = boxFilter(a, w, h, r);
  const mean_b = boxFilter(b, w, h, r);

  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    q[i] = Math.max(0, Math.min(1, mean_a[i] * I[i] + mean_b[i]));
  }
  return q;
}

/** 3x3 median filter */
export function medianFilter3x3(src: Float32Array, w: number, h: number): Float32Array {
  const dst = new Float32Array(w * h);
  const window = new Float32Array(9);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          window[k++] = src[(y + dy) * w + (x + dx)];
        }
      }
      // Insertion sort for 9 elements
      for (let i = 1; i < 9; i++) {
        const val = window[i];
        let j = i - 1;
        while (j >= 0 && window[j] > val) {
          window[j + 1] = window[j];
          j--;
        }
        window[j + 1] = val;
      }
      dst[y * w + x] = window[4]; // median element
    }
  }

  // Copy borders
  for (let x = 0; x < w; x++) {
    dst[x] = src[x];
    dst[(h - 1) * w + x] = src[(h - 1) * w + x];
  }
  for (let y = 0; y < h; y++) {
    dst[y * w] = src[y * w];
    dst[y * w + (w - 1)] = src[y * w + (w - 1)];
  }

  return dst;
}

/** Otsu's thresholding method */
export function otsuThreshold(data: Float32Array, n: number): number {
  const bins = 256;
  const hist = new Int32Array(bins);
  for (let i = 0; i < n; i++) {
    const val = Math.max(0, Math.min(255, Math.floor(data[i] * 255)));
    hist[val]++;
  }

  let total = n;
  let sum = 0;
  for (let t = 0; t < bins; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold / 255.0;
}
