// src/depth/DepthEstimator.ts
import { guidedFilter, medianFilter3x3, normalizeDepth, upsampleBilinear } from './refine';

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
