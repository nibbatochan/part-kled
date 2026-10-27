// src/depth/DepthEstimator.ts
// Page-side client for the depth worker (depth.worker.ts). Same API as before, so the studio and the
// clip sampler do not change. The model, inference and refinement run in the worker; this file only
// sizes the picture, hands it over as an ImageBitmap, and routes progress and results back.
import { DEPTH_MAX_SIDE, type DepthRequest, type DepthResponse } from './protocol';

export { DEPTH_MAX_SIDE };

export interface DepthResult {
  depth: Float32Array; // values [0..1], width x height (at most DEPTH_MAX_SIDE on the long edge)
  width: number;
  height: number;
}

export type ProgressCallback = (progress: number, text: string) => void;

interface Job {
  resolve: (r: DepthResult) => void;
  reject: (e: Error) => void;
  onProgress?: ProgressCallback;
}

export class DepthEstimator {
  private worker: Worker | null = null;
  private jobs = new Map<number, Job>();
  private nextId = 1;

  private getWorker(): Worker {
    if (!this.worker) {
      const w = new Worker(new URL('./depth.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<DepthResponse>) => this.onMessage(e.data);
      w.onerror = (e) => {
        // A crashed worker takes its jobs with it. Drop it so the next call starts a fresh one.
        this.failAll(new Error(e.message || 'Depth worker failed'));
        w.terminate();
        this.worker = null;
      };
      this.worker = w;
    }
    return this.worker;
  }

  private onMessage(msg: DepthResponse): void {
    const job = this.jobs.get(msg.id);
    if (msg.type === 'progress') {
      job?.onProgress?.(msg.p, msg.text);
      return;
    }
    if (!job) return; // warmup runs use id 0 and have no job
    this.jobs.delete(msg.id);
    if (msg.type === 'result') job.resolve({ depth: msg.depth, width: msg.width, height: msg.height });
    else job.reject(new Error(msg.message));
  }

  private failAll(err: Error): void {
    for (const job of this.jobs.values()) job.reject(err);
    this.jobs.clear();
  }

  /** Start loading the model in the worker so the first upload does not wait for the download. */
  public warmup(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    createImageBitmap(c).then((bitmap) => {
      const req: DepthRequest = { type: 'estimate', id: 0, bitmap, w: 64, h: 64 };
      this.getWorker().postMessage(req, [bitmap]);
    });
  }

  public estimateDepth(imageCanvas: HTMLCanvasElement, onProgress?: ProgressCallback): Promise<DepthResult> {
    // Work at a reduced size: model input, guide image and refinement all use it
    const k = Math.min(1, DEPTH_MAX_SIDE / Math.max(imageCanvas.width, imageCanvas.height));
    const w = Math.max(2, Math.round(imageCanvas.width * k));
    const h = Math.max(2, Math.round(imageCanvas.height * k));
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const ctx = work.getContext('2d');
    if (!ctx) return Promise.reject(new Error('Cannot get 2d context for image'));
    ctx.drawImage(imageCanvas, 0, 0, w, h);

    const id = this.nextId++;
    return createImageBitmap(work).then(
      (bitmap) =>
        new Promise<DepthResult>((resolve, reject) => {
          this.jobs.set(id, { resolve, reject, onProgress });
          const req: DepthRequest = { type: 'estimate', id, bitmap, w, h };
          this.getWorker().postMessage(req, [bitmap]);
        })
    );
  }
}
