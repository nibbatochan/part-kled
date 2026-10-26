// src/depth/DepthEstimator.ts
import { guidedFilter, medianFilter3x3, normalizeDepth, upsampleBilinear } from './refine';

export interface DepthResult {
  depth: Float32Array; // values [0..1], width x height (at most DEPTH_MAX_SIDE on the long edge)
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

export type ProgressCallback = (progress: number, text: string) => void;

/**
 * Depth is estimated and refined at this size, not at the picture's full size. The particle sampler
 * reads the picture at the same size (src/lite/sample.ts), so nothing is lost, and the guided filter
 * (the slow part) works on about a tenth of the pixels.
 */
export const DEPTH_MAX_SIDE = 768;

const MODEL = 'onnx-community/depth-anything-v2-small';

export class DepthEstimator {
  private pipelinePromise: Promise<any | null> | null = null;
  private lastProgress = 0;

  /**
   * Load the model once. Tries WebGPU first, then WASM, and remembers the outcome, so a machine where
   * both fail does not retry (and re-download) for every picture.
   */
  private loadPipeline(onProgress?: ProgressCallback): Promise<any | null> {
    if (this.pipelinePromise) return this.pipelinePromise;
    this.pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      if (env) env.allowLocalModels = false;
      for (const device of ['webgpu', 'wasm'] as const) {
        try {
          return await pipeline('depth-estimation', MODEL, {
            device,
            // WebGPU runs fp16 natively; int8 (q8) is the better size for the CPU/WASM path
            dtype: device === 'webgpu' ? 'fp16' : 'q8',
            progress_callback: (p: any) => {
              // transformers.js reports 0..100 per file; keep the bar monotonic and inside 0..1
              if (p?.status === 'progress' && typeof p.progress === 'number') {
                const frac = Math.min(1, Math.max(0, p.progress / 100));
                this.lastProgress = Math.max(this.lastProgress, frac);
                onProgress?.(0.2 + this.lastProgress * 0.4, `DOWNLOADING MODEL ${Math.round(this.lastProgress * 100)}%`);
              }
            },
          });
        } catch (err) {
          console.warn(`Depth pipeline on ${device} failed:`, err);
        }
      }
      return null;
    })();
    return this.pipelinePromise;
  }

  /** Start loading the model in the background so the first upload does not wait for it. */
  public warmup(): void {
    void this.loadPipeline()
      .then(async (model) => {
        if (!model) return;
        // One throwaway run compiles the GPU shaders now, so the first real picture is as fast as the rest
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        await model(c);
      })
      .catch(() => {});
  }

  public async estimateDepth(
    imageCanvas: HTMLCanvasElement,
    onProgress?: ProgressCallback
  ): Promise<DepthResult> {
    // Work at a reduced size: model input, guide image and refinement all use it
    const k = Math.min(1, DEPTH_MAX_SIDE / Math.max(imageCanvas.width, imageCanvas.height));
    const w = Math.max(2, Math.round(imageCanvas.width * k));
    const h = Math.max(2, Math.round(imageCanvas.height * k));
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const ctx = work.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Cannot get 2d context for image');
    ctx.drawImage(imageCanvas, 0, 0, w, h);

    const d = ctx.getImageData(0, 0, w, h).data;
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
      const model = await this.loadPipeline(onProgress);
      if (model) {
        onProgress?.(0.65, 'RUNNING NEURAL ESTIMATION...');
        const output = await model(work);
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

    // High-quality photometric & shape fallback if neural model is not active
    if (!rawDepth) {
      onProgress?.(0.6, 'COMPUTING PHOTOMETRIC RELIEF...');
      rawDepth = new Float32Array(n);
      const cx = w / 2;
      const cy = h / 2;
      const maxDist = Math.hypot(cx, cy);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const a = alphaMask[i];
          if (a < 0.05) {
            rawDepth[i] = 0;
            continue;
          }
          const lum = guideI[i];
          const distNorm = 1.0 - Math.min(1.0, Math.hypot(x - cx, y - cy) / (maxDist * 0.75));
          rawDepth[i] = 0.4 * lum + 0.6 * distNorm;
        }
      }
    }

    onProgress?.(0.85, 'REFINING DEPTH EDGES...');
    // 1. Percentile normalisation
    let refined = normalizeDepth(rawDepth, rawW, rawH);

    // 2. Upsample to the working size if needed
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
