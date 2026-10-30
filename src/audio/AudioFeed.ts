// src/audio/AudioFeed.ts
// Where the sound comes from: a file, or a shared tab or screen. Web Audio reads its spectrum
// each frame and FeatureExtractor turns it into numbers. Nothing here knows about particles.
import { BAND_COUNT, FeatureExtractor, SILENT, waveColumns, type AudioFeatures } from './features';

export type AudioSource = 'file' | 'tab';

export class AudioFeed {
  kind: AudioSource | null = null;
  label = '';
  /** Fires when a shared tab stops sharing (the browser's own "Stop sharing" button). */
  onEnded: (() => void) | null = null;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private spec = new Uint8Array(0);
  private time = new Float32Array(0);
  private waveOut = new Float32Array(BAND_COUNT);
  private extractor = new FeatureExtractor();
  private node: AudioNode | null = null;
  private el: HTMLAudioElement | null = null;
  private url = '';
  private stream: MediaStream | null = null;

  /** The browser only lets audio start after a click, so the context is made on the first source. */
  private ensure(): { ctx: AudioContext; analyser: AnalyserNode } {
    if (!this.ctx || !this.analyser) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6;
      this.spec = new Uint8Array(this.analyser.frequencyBinCount);
      this.time = new Float32Array(this.analyser.fftSize);
    }
    return { ctx: this.ctx, analyser: this.analyser };
  }

  /** Plays an audio file through the speakers and listens to it. Loops until stopped. */
  async useFile(file: File): Promise<void> {
    this.stop();
    const { ctx, analyser } = this.ensure();
    const el = new Audio();
    this.url = URL.createObjectURL(file);
    el.src = this.url;
    el.loop = true;
    const src = ctx.createMediaElementSource(el);
    src.connect(analyser);
    analyser.connect(ctx.destination); // you hear it too
    await ctx.resume();
    await el.play();
    this.el = el;
    this.node = src;
    this.kind = 'file';
    this.label = file.name;
  }

  /**
   * A shared tab or screen with its sound (YouTube, Spotify web, any player). The browser asks which one each
   * time. The share box "also share audio" has to be ticked.
   */
  async useTab(): Promise<void> {
    this.stop();
    const { ctx, analyser } = this.ensure();
    const shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const tracks = shared.getAudioTracks();
    shared.getVideoTracks().forEach((t) => t.stop()); // only the sound is wanted
    if (tracks.length === 0) {
      shared.getTracks().forEach((t) => t.stop());
      throw new Error('NO SOUND SHARED: TICK SHARE AUDIO');
    }
    const stream = new MediaStream(tracks);
    tracks[0].addEventListener('ended', () => {
      if (this.stream === stream) {
        this.stop();
        this.onEnded?.();
      }
    });
    this.node = ctx.createMediaStreamSource(stream);
    this.node.connect(analyser);
    this.stream = stream;
    await ctx.resume();
    this.kind = 'tab';
    this.label = 'SHARED SOUND';
  }

  stop(): void {
    this.node?.disconnect();
    this.analyser?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el = null;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = '';
    this.kind = null;
    this.label = '';
    this.extractor = new FeatureExtractor();
  }

  /** One frame: reads the spectrum and returns the features. Silent when no source is on. */
  step(dt: number): AudioFeatures {
    if (!this.kind || !this.analyser || !this.ctx) return SILENT;
    this.analyser.getByteFrequencyData(this.spec);
    this.analyser.getFloatTimeDomainData(this.time);
    waveColumns(this.time, this.waveOut);
    return { ...this.extractor.process(this.spec, dt, this.ctx.sampleRate, this.analyser.fftSize), wave: this.waveOut };
  }
}
