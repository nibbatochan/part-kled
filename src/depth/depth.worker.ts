// src/depth/depth.worker.ts
// Depth estimation off the main thread: the model, the guide image and the refinement all run here, so
// the page keeps painting while inference runs. Jobs run one at a time, in the order they arrive.
import { MODEL, type DepthRequest, type DepthResponse } from './protocol';
import { guidedFilter, medianFilter3x3, normalizeDepth, upsampleBilinear } from './refine';

// Typed locally: the tsconfig includes both DOM and WebWorker libs, so `self` has no single type
const scope = self as unknown as {
  postMessage(msg: DepthResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<DepthRequest>) => void) | null;
};

let pipelinePromise: Promise<any | null> | null = null;
let currentId = 0;
let queue: Promise<void> = Promise.resolve();

function send(msg: DepthResponse, transfer?: Transferable[]): void {
  scope.postMessage(msg, transfer);
}

/**
 * Load the model once. Tries WebGPU first, then WASM, and remembers the outcome, so a machine where
 * both fail does not retry (and re-download) for every picture.
 */
function loadPipeline(): Promise<any | null> {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    // The model takes an OffscreenCanvas directly (RawImage.read accepts it), so no RawImage import here
    const { pipeline, env } = await import('@huggingface/transformers');
    if (env) env.allowLocalModels = false;
    for (const device of ['webgpu', 'wasm'] as const) {
      try {
        return await pipeline('depth-estimation', MODEL, {
          device,
          // WebGPU runs fp16 natively; int8 (q8) is the better size for the CPU/WASM path
          dtype: device === 'webgpu' ? 'fp16' : 'q8',
          progress_callback: (p: any) => {
            // transformers.js reports 0..100 per file; map it into the 0.2..0.6 band of the job
            if (p?.status === 'progress' && typeof p.progress === 'number') {
              const frac = Math.min(1, Math.max(0, p.progress / 100));
              send({
                type: 'progress',
                id: currentId,
                p: 0.2 + frac * 0.4,
                text: `DOWNLOADING MODEL ${Math.round(frac * 100)}%`,
              });
            }
          },
        });
      } catch (err) {
        console.warn(`Depth pipeline on ${device} failed:`, err);
      }
    }
    return null;
  })();
  return pipelinePromise;
}

async function estimate(id: number, bitmap: ImageBitmap, w: number, h: number): Promise<void> {
  currentId = id;
  const progress = (p: number, text: string) => send({ type: 'progress', id, p, text });

  const work = new OffscreenCanvas(w, h);
  const ctx = work.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot get 2d context for image');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

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
    progress(0.2, 'INITIALIZING DEPTH PIPELINE...');
    const model = await loadPipeline();
    if (model) {
      progress(0.65, 'RUNNING NEURAL ESTIMATION...');
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
    progress(0.6, 'COMPUTING PHOTOMETRIC RELIEF...');
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

  progress(0.85, 'REFINING DEPTH EDGES...');
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
    if (alphaMask[i] < 0.05) refined[i] = 0;
  }

  send({ type: 'result', id, depth: refined, width: w, height: h }, [refined.buffer]);
}

scope.onmessage = (e: MessageEvent<DepthRequest>) => {
  const msg = e.data;
  queue = queue.then(async () => {
    try {
      await estimate(msg.id, msg.bitmap, msg.w, msg.h);
    } catch (err) {
      send({ type: 'error', id: msg.id, message: (err as Error).message || 'Depth failed' });
    }
  });
};
