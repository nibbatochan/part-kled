// src/web/Exporter.ts
// Stills and video from a second, off-screen LiteEngine at an exact pixel size. The scene is a pure
// function of time, so frame i of a video is the scene at i / fps: no wall clock, no dropped frames.
// Video uses WebCodecs through Mediabunny (loaded on demand, so visitors who never export never fetch it).
import { LiteEngine } from '../lite/LiteEngine';
import type { ExportSnapshot } from './WebEngine';

export type ExportKind = 'image' | 'video' | 'loop';
export type ImageFormat = 'png' | 'jpg' | 'webp';
export type VideoFormat = 'mp4' | 'webm';

export interface ExportSize {
  /** The short side in px, also the id used by the buttons */
  h: number;
  w: number;
}

/** 16:9 output sizes, all even (H.264 needs even sides). */
export const EXPORT_SIZES: Record<number, ExportSize> = {
  480: { w: 854, h: 480 },
  720: { w: 1280, h: 720 },
  1080: { w: 1920, h: 1080 },
  1440: { w: 2560, h: 1440 },
  2160: { w: 3840, h: 2160 },
};

/** Video bitrate at 30 fps. Particle frames are noisy, so these sit above common upload guides. */
const BITRATE_30: Record<number, number> = {
  480: 4_000_000,
  720: 8_000_000,
  1080: 12_000_000,
  1440: 24_000_000,
  2160: 50_000_000,
};

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export interface ExportResult {
  blob: Blob;
  ext: string;
  note?: string;
}

/** Everything the same, drawn on its own canvas at w x h. Throws when the device cannot make that size. */
function makeEngine(snap: ExportSnapshot, size: ExportSize): { engine: LiteEngine; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  const engine = new LiteEngine(canvas, { preserve: true });
  engine.setSample(snap.sample);
  engine.setParams(snap.params);
  engine.setLayout(snap.layout);
  engine.setView(snap.view);
  engine.setOutput(size.w, size.h, size.h / snap.liveCssH);
  const gl = engine.gl;
  if (gl.drawingBufferWidth < size.w || gl.drawingBufferHeight < size.h) {
    engine.dispose();
    throw new Error(`This device cannot draw ${size.w} x ${size.h}. Pick a smaller size.`);
  }
  return { engine, canvas };
}

export async function exportImage(snap: ExportSnapshot, size: ExportSize, format: ImageFormat): Promise<ExportResult> {
  const { engine, canvas } = makeEngine(snap, size);
  try {
    engine.renderAt(snap.time);
    // Read in the same task as the draw; preserveDrawingBuffer is on as well
    const mime = MIME[format];
    const quality = format === 'jpg' ? 0.92 : format === 'webp' ? 0.9 : undefined;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
    if (!blob) throw new Error('The browser could not encode the image.');
    // A browser that cannot write WebP hands back a PNG
    const real = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
    return { blob, ext: real, note: real !== format ? `${format.toUpperCase()} is not available here, saved as ${real.toUpperCase()}.` : undefined };
  } finally {
    engine.dispose();
  }
}

export function videoSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export interface VideoOptions {
  fps: number;
  seconds: number;
  /** Seamless loop: every time term snaps to whole cycles per clip, and the clip starts at t = 0 */
  loop: boolean;
  format: VideoFormat;
}

export async function exportVideo(
  snap: ExportSnapshot,
  size: ExportSize,
  opts: VideoOptions,
  onProgress: (done: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (!videoSupported()) throw new Error('Video export needs a browser with WebCodecs (Chrome, Edge, or a current Firefox or Safari).');
  const mb = await import('mediabunny');
  const bitrate = Math.round(BITRATE_30[size.h] * (opts.fps > 30 ? 1.5 : 1));

  // MP4 with H.264 first; fall back to WebM when the browser cannot encode it
  let format: VideoFormat = opts.format;
  let codec = await mb.getFirstEncodableVideoCodec(format === 'mp4' ? ['avc'] : ['vp9', 'vp8', 'av1'], {
    width: size.w, height: size.h, bitrate,
  });
  let note: string | undefined;
  if (!codec && format === 'mp4') {
    format = 'webm';
    codec = await mb.getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width: size.w, height: size.h, bitrate });
    note = 'MP4 is not available here, saved as WebM.';
  }
  if (!codec) throw new Error(`This browser cannot encode ${size.w} x ${size.h} video. Pick a smaller size.`);

  const { engine, canvas } = makeEngine(snap, size);
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: format === 'mp4' ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat(), target });
  try {
    const source = new mb.CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: opts.fps });
    await output.start();
    const frames = Math.max(1, Math.round(opts.fps * opts.seconds));
    const t0 = opts.loop ? 0 : snap.time;
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) {
        await output.cancel();
        throw new DOMException('Export cancelled', 'AbortError');
      }
      // The scene at exactly this time. The last loop frame is (frames-1)/fps, so frame `frames` would equal frame 0.
      engine.renderAt(t0 + i / opts.fps, opts.loop ? opts.seconds : 0);
      await source.add(i / opts.fps, 1 / opts.fps);
      onProgress((i + 1) / frames);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // let the page repaint its progress bar
    }
    source.close();
    await output.finalize();
    return { blob: new Blob([target.buffer!], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }), ext: format, note };
  } finally {
    engine.dispose();
  }
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
