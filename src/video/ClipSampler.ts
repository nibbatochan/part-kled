// src/video/ClipSampler.ts
// Builds one LiteSample per keyframe of a clip. Runs only on an explicit "prepare" from the user, one
// keyframe at a time, yielding to the page between keyframes. Nothing is decoded outside the clip range.
import type { DepthEstimator } from '../depth/DepthEstimator';
import { sampleLite, type LiteSample } from '../lite/sample';
import { KEYFRAME_MAX_SIDE, keyframeCount, keyframeTime, type ClipRange } from './clip';

export interface PrepOptions {
  video: HTMLVideoElement;
  range: ClipRange;
  estimator: DepthEstimator;
  particles: number;
  onProgress: (fraction: number, text: string) => void;
  /** Checked between keyframes. When it returns true, preparation stops and resolves to null. */
  isCancelled: () => boolean;
}

const yieldToPage = () => new Promise<void>((r) => setTimeout(r, 0));

/** Seek the video to source time t and resolve once that frame is ready to draw. */
function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => {
      video.removeEventListener('seeked', ok);
      video.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener('seeked', ok);
      video.removeEventListener('error', fail);
      reject(new Error('Video seek failed'));
    };
    video.addEventListener('seeked', ok);
    video.addEventListener('error', fail);
    video.currentTime = t;
  });
}

/** Draw the video's current frame into a canvas whose long side is KEYFRAME_MAX_SIDE at most. */
function frameCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const k = Math.min(1, KEYFRAME_MAX_SIDE / Math.max(vw, vh));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(vw * k));
  c.height = Math.max(2, Math.round(vh * k));
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

/**
 * One sample per keyframe, in clip order. Resolves to null if cancelled. The caller owns the result;
 * dropping it frees the memory (each sample is particles x 16 bytes).
 */
export async function prepareClip(opts: PrepOptions): Promise<LiteSample[] | null> {
  const { video, range, estimator, particles, onProgress, isCancelled } = opts;
  const count = keyframeCount(range);
  const samples: LiteSample[] = [];

  for (let k = 0; k < count; k++) {
    if (isCancelled()) return null;
    const base = k / count;
    await seekTo(video, keyframeTime(range, k));
    const canvas = frameCanvas(video);
    const depth = await estimator.estimateDepth(canvas, (p, text) => {
      onProgress(base + (p * 0.8) / count, text);
    });
    onProgress(base + (0.85 / count), `KEYFRAME ${k + 1} / ${count}`);
    samples.push(sampleLite(canvas, depth.depth, depth.width, depth.height, particles));
    onProgress((k + 1) / count, `KEYFRAME ${k + 1} / ${count}`);
    await yieldToPage();
  }

  if (isCancelled()) return null;
  return samples;
}
