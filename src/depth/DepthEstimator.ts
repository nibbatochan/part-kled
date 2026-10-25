// src/depth/DepthEstimator.ts
import { boxFilter, guidedFilter, medianFilter3x3, normalizeDepth, upsampleBilinear } from './refine';

export interface DepthResult {
  depth: Float32Array; // values [0..1]
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

export type ProgressCallback = (progress: number, text: string) => void;

export class DepthEstimator {
  private pipelineInstance: any = null;
  private isModelLoading = false;

  constructor() {}

  public async estimateDepth(
    imageCanvas: HTMLCanvasElement,
    onProgress?: ProgressCallback
  ): Promise<DepthResult> {
    const w = imageCanvas.width;
    const h = imageCanvas.height;
    const ctx = imageCanvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context for image');

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;

    // Extract luminance guide
    const guideI = new Float32Array(n);
    const alphaMask = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const idx = i * 4;
      const r = d[idx] / 255;
      const g = d[idx + 1] / 255;
      const b = d[idx + 2] / 255;
      alphaMask[i] = d[idx + 3] / 255;
      guideI[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    let rawDepth: Float32Array | null = null;
    let rawW = w;
    let rawH = h;

    try {
      onProgress?.(0.2, 'INITIALIZING DEPTH PIPELINE...');
      // Try loading depth model if WebGPU/WASM available in browser
      if (!this.pipelineInstance && !this.isModelLoading) {
        this.isModelLoading = true;
        try {
          // Dynamic import to prevent bundler freeze
          const { pipeline, env } = await import('@huggingface/transformers');
          if (env) {
            env.allowLocalModels = false;
          }
          this.pipelineInstance = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
            device: 'webgpu',
            dtype: 'q8',
            progress_callback: (p: any) => {
              if (p?.status === 'progress' && p?.progress) {
                onProgress?.(0.2 + p.progress * 0.4, `DOWNLOADING MODEL ${(p.progress * 100).toFixed(0)}%`);
              }
            },
          });
        } catch (pipelineErr) {
          console.warn('WebGPU depth pipeline failed, trying wasm or fallback:', pipelineErr);
        } finally {
          this.isModelLoading = false;
        }
      }

      if (this.pipelineInstance) {
        onProgress?.(0.65, 'RUNNING NEURAL ESTIMATION...');
        // Run model on image canvas
        const output = await this.pipelineInstance(imageCanvas);
        if (output && output.depth) {
          const map = output.depth;
          rawW = map.width;
          rawH = map.height;
          rawDepth = new Float32Array(map.data);
        }
      }
    } catch (e) {
      console.warn('Transformers pipeline execution failed, using edge-refined depth fallback:', e);
    }

    // Advanced multi-scale computer-vision depth pipeline
    if (!rawDepth) {
      onProgress?.(0.6, 'COMPUTING PHOTOMETRIC 3D RELIEF...');
      rawDepth = computePhotometricDepth(d, guideI, alphaMask, w, h);
    }

    onProgress?.(0.85, 'REFINING DEPTH EDGES...');
    // 1. Percentile normalisation
    let refined = normalizeDepth(rawDepth, rawW, rawH);

    // 2. Upsample to full resolution if needed
    if (rawW !== w || rawH !== h) {
      refined = upsampleBilinear(refined, rawW, rawH, w, h);
    }

    // 3. Guided filter with photo luminance
    refined = guidedFilter(guideI, refined, w, h, 8, 1e-3);

    // 4. Median filter for speckle removal
    refined = medianFilter3x3(refined, w, h);

    // Apply alpha mask
    for (let i = 0; i < n; i++) {
      if (alphaMask[i] < 0.05) {
        refined[i] = 0;
      }
    }

    onProgress?.(1.0, 'DEPTH READY');

    // Create depth preview canvas
    const depthCanvas = document.createElement('canvas');
    depthCanvas.width = w;
    depthCanvas.height = h;
    const depthCtx = depthCanvas.getContext('2d');
    if (depthCtx) {
      const outImgData = depthCtx.createImageData(w, h);
      const od = outImgData.data;
      for (let i = 0; i < n; i++) {
        const val = Math.floor(refined[i] * 255);
        const idx = i * 4;
        od[idx] = val;
        od[idx + 1] = val;
        od[idx + 2] = val;
        od[idx + 3] = 255;
      }
      depthCtx.putImageData(outImgData, 0, 0);
    }

    return {
      depth: refined,
      width: w,
      height: h,
      canvas: depthCanvas,
    };
  }
}

/**
 * Multi-scale computer vision depth estimation:
 * 1. Automatic foreground segmentation (alpha mask or boundary color difference)
 * 2. Silhouette distance transform (provides anatomical convex volume for the subject)
 * 3. Multi-scale photometric shape-from-shading (large-scale diffuse volume + mid-scale ridges)
 * 4. Sobel edge gradient relief
 */
export function computePhotometricDepth(
  rgba: Uint8ClampedArray | Uint8Array,
  lum: Float32Array,
  alphaMask: Float32Array,
  w: number,
  h: number
): Float32Array {
  const n = w * h;
  const depth = new Float32Array(n);

  // 1. Identify foreground mask
  let hasExplicitAlpha = false;
  for (let i = 0; i < n; i++) {
    if (alphaMask[i] < 0.9) {
      hasExplicitAlpha = true;
      break;
    }
  }

  const isForeground = new Uint8Array(n);
  if (hasExplicitAlpha) {
    for (let i = 0; i < n; i++) {
      isForeground[i] = alphaMask[i] > 0.08 ? 1 : 0;
    }
  } else {
    // Sample border colors to detect dominant background tone
    let cornerR = 0, cornerG = 0, cornerB = 0;
    const borderSamples = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1];
    borderSamples.forEach(idx => {
      cornerR += rgba[idx * 4];
      cornerG += rgba[idx * 4 + 1];
      cornerB += rgba[idx * 4 + 2];
    });
    cornerR /= 4; cornerG /= 4; cornerB /= 4;

    for (let i = 0; i < n; i++) {
      const dr = Math.abs(rgba[i * 4] - cornerR);
      const dg = Math.abs(rgba[i * 4 + 1] - cornerG);
      const db = Math.abs(rgba[i * 4 + 2] - cornerB);
      const diff = (dr + dg + db) / 3;
      isForeground[i] = diff > 16 || lum[i] > 0.12 ? 1 : 0;
    }
  }

  // 2. Fast 2-pass distance transform from boundary
  const dist = new Float32Array(n);
  const INF = 999999;
  for (let i = 0; i < n; i++) {
    dist[i] = isForeground[i] ? INF : 0;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (dist[idx] > 0) {
        let minD = dist[idx];
        if (x > 0) minD = Math.min(minD, dist[idx - 1] + 1);
        if (y > 0) minD = Math.min(minD, dist[idx - w] + 1);
        dist[idx] = minD;
      }
    }
  }
  let maxDist = 1;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const idx = y * w + x;
      if (dist[idx] > 0) {
        let minD = dist[idx];
        if (x < w - 1) minD = Math.min(minD, dist[idx + 1] + 1);
        if (y < h - 1) minD = Math.min(minD, dist[idx + w] + 1);
        dist[idx] = minD;
        if (minD > maxDist && minD < INF) maxDist = minD;
      }
    }
  }

  const normDist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (dist[i] < INF && dist[i] > 0) {
      normDist[i] = Math.sqrt(dist[i] / maxDist);
    }
  }

  // 3. Multi-scale luminance: large-scale smooth volume vs local detail ridges
  const smoothLum = boxFilter(lum, w, h, 14);
  const midLum = boxFilter(lum, w, h, 4);

  // 4. Combine into rich 3D topographic relief
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!isForeground[idx]) {
        depth[idx] = 0;
        continue;
      }

      const ridge = midLum[idx] - smoothLum[idx];
      const dx = (lum[idx + 1] - lum[idx - 1]) * 0.5;
      const dy = (lum[idx + w] - lum[idx - w]) * 0.5;
      const edge = Math.min(1.0, Math.hypot(dx, dy) * 2.5);

      const val = 0.45 * normDist[idx] + 0.35 * smoothLum[idx] + 0.20 * Math.max(0, ridge * 2.0) - edge * 0.12;
      depth[idx] = Math.max(0.02, Math.min(1.0, val));
    }
  }

  return depth;
}
