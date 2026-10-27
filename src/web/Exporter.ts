// src/web/Exporter.ts
// Stills and video from a second LiteEngine at an exact pixel size and frame shape. The scene is a pure
// function of time, so frame i of a video is the scene at i / fps: no wall clock, no dropped frames.
// Video uses WebCodecs through Mediabunny (loaded on demand, so visitors who never export never fetch it).
import { LiteEngine } from '../lite/LiteEngine';
import { bitrateFor, frameSize } from './frameSize';
import type { ExportSnapshot } from './WebEngine';

export type ExportKind = 'image' | 'video' | 'loop';
export type ImageFormat = 'png' | 'jpg' | 'webp';
export type VideoFormat = 'mp4' | 'webm';

/** The frame being exported: its shape, size, and how the picture sits in it. */
export interface ExportFrame {
  aspect: number; // width / height
  short: number;  // short side in px
  zoom: number;   // 1 = the live view's picture size, scaled to the frame
  panX: number;   // picture moved by this share of the frame height
  panY: number;
}

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export interface ExportResult {
  blob: Blob;
  ext: string;
  note?: string;
}

/**
 * The scene on a canvas of this frame size. Pass a canvas to draw into it (the preview); otherwise a
 * detached canvas is made. Throws when the device cannot make that size.
 */
export function makeEngine(
  snap: ExportSnapshot,
  frame: ExportFrame,
  opts: { canvas?: HTMLCanvasElement; w?: number; h?: number; preserve?: boolean } = {},
): { engine: LiteEngine; canvas: HTMLCanvasElement } {
  const size = opts.w && opts.h ? { w: opts.w, h: opts.h } : frameSize(frame.aspect, frame.short);
  const canvas = opts.canvas ?? document.createElement('canvas');
  const engine = new LiteEngine(canvas, { preserve: opts.preserve ?? true });
  engine.setSample(snap.sample);
  engine.setParams(snap.params);
  applyFrame(engine, snap, frame);
  engine.setView(snap.view);
  engine.setOutput(size.w, size.h, snap.liveScaleCss, snap.liveDpr);
  const gl = engine.gl;
  if (gl.drawingBufferWidth < size.w || gl.drawingBufferHeight < size.h) {
    engine.dispose();
    throw new Error(`This device cannot draw ${size.w} x ${size.h}. Pick a smaller size.`);
  }
  return { engine, canvas };
}

/** The picture's place in the frame: the live fit, scaled by the user's zoom, moved by the user's drag. */
export function applyFrame(engine: LiteEngine, snap: ExportSnapshot, frame: ExportFrame): void {
  engine.setLayout({ ...snap.layout, zoom: snap.layout.zoom * frame.zoom, panX: frame.panX, panY: frame.panY });
}

export async function exportImage(snap: ExportSnapshot, frame: ExportFrame, format: ImageFormat): Promise<ExportResult> {
  const { engine, canvas } = makeEngine(snap, frame);
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
  frame: ExportFrame,
  opts: VideoOptions,
  onProgress: (done: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (!videoSupported()) throw new Error('Video export needs a browser with WebCodecs (Chrome, Edge, or a current Firefox or Safari).');
  const mb = await import('mediabunny');
  const size = frameSize(frame.aspect, frame.short);
  const bitrate = bitrateFor(frame.short, size.w, size.h, opts.fps);

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

  const { engine, canvas } = makeEngine(snap, frame);
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
