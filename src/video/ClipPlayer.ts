// src/video/ClipPlayer.ts
// Owns the source video element and the clip state: range, prepared keyframe samples, play, pause and
// loop. The studio reads nextSample() each frame and morphs to it when the keyframe changes.
import type { DepthEstimator } from '../depth/DepthEstimator';
import type { LiteSample } from '../lite/sample';
import { clampClip, keyframeIndexAt, VIDEO_PARTICLE_CAP, type ClipRange } from './clip';
import { frameCanvas, prepareClip, seekTo } from './ClipSampler';
import { sampleLite } from '../lite/sample';

export class ClipPlayer {
  readonly video: HTMLVideoElement;
  readonly duration: number;
  range: ClipRange;
  samples: LiteSample[] | null = null;
  private url: string;
  private cancelled = false;
  private lastIndex = -1;

  private constructor(video: HTMLVideoElement, url: string) {
    this.video = video;
    this.url = url;
    this.duration = video.duration;
    this.range = clampClip(0, this.duration, this.duration);
  }

  /** Load the file's metadata. Rejects if the browser cannot decode the file. */
  static open(file: File): Promise<ClipPlayer> {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;
    return new Promise((resolve, reject) => {
      const ok = () => {
        cleanup();
        resolve(new ClipPlayer(video, url));
      };
      const fail = (message: string) => {
        cleanup();
        URL.revokeObjectURL(url);
        reject(new Error(message));
      };
      const onError = () => fail('This browser cannot play this video. Try an mp4 (H.264) or webm file.');
      // A file that never reports its length would otherwise leave the page waiting for ever
      const timer = window.setTimeout(() => fail('The video took too long to open.'), 20000);
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener('loadedmetadata', ok);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', ok);
      video.addEventListener('error', onError);
    });
  }

  /** The clip's first frame as particles with flat depth: shown at once, before any depth is built. */
  async previewSample(particles: number): Promise<LiteSample> {
    await seekTo(this.video, this.range.start);
    return sampleLite(frameCanvas(this.video), null, 0, 0, Math.min(particles, VIDEO_PARTICLE_CAP));
  }

  /** Set the in point to the current playhead. Keeps the clip within the length cap. */
  setInHere(): void {
    this.range = clampClip(this.video.currentTime, this.range.end, this.duration);
    this.samples = null;
  }

  /** Set the out point to the current playhead. Keeps the clip within the length cap. */
  setOutHere(): void {
    this.range = clampClip(this.range.start, this.video.currentTime, this.duration);
    this.samples = null;
  }

  get hasRange(): boolean {
    return this.range.end - this.range.start > 0.05;
  }

  /** Build the keyframe samples for the current range. Resolves to false if cancelled. */
  async prepare(
    estimator: DepthEstimator,
    particles: number,
    onProgress: (fraction: number, text: string) => void
  ): Promise<boolean> {
    this.cancelled = false;
    this.samples = null;
    const samples = await prepareClip({
      video: this.video,
      range: this.range,
      estimator,
      particles: Math.min(particles, VIDEO_PARTICLE_CAP),
      onProgress,
      isCancelled: () => this.cancelled,
    });
    if (!samples) return false;
    this.samples = samples;
    this.lastIndex = -1;
    return true;
  }

  /** Stop an in-progress prepare(). */
  cancelPrepare(): void {
    this.cancelled = true;
  }

  get playing(): boolean {
    return !this.video.paused;
  }

  play(): void {
    if (!this.samples) return;
    this.video.currentTime = this.range.start;
    this.video.play().catch(() => {});
  }

  pause(): void {
    this.video.pause();
  }

  /**
   * Call once per frame while playing. Loops the clip at the out point and returns the keyframe sample
   * to show if it changed since the last call, or null.
   */
  nextSample(): LiteSample | null {
    if (!this.samples || this.samples.length === 0) return null;
    if (this.playing && this.video.currentTime >= this.range.end - 0.02) {
      this.video.currentTime = this.range.start;
    }
    const idx = keyframeIndexAt(this.range, this.video.currentTime, this.samples.length);
    if (idx === this.lastIndex) return null;
    this.lastIndex = idx;
    return this.samples[idx];
  }

  /** Release the video, its object URL and the samples. */
  dispose(): void {
    this.cancelled = true;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    URL.revokeObjectURL(this.url);
    this.samples = null;
  }
}
