// src/audio/features.ts
// Turns one frequency spectrum per frame into a few numbers the particles can use: bass, mids, highs, loudness
// and a beat flag. No Web Audio here, only the maths, so it can be tested with made-up spectra.

export interface AudioFeatures {
  bass: number;   // 0..1, after the noise gate and the slow auto gain
  mid: number;
  high: number;
  level: number;  // overall loudness
  beat: boolean;  // true on the one frame a beat is found
  active: boolean; // false once the sound has been silent for a while (the scene returns to its idle look)
  bands: Float32Array; // 32 log-spaced bands from 40 Hz to 16 kHz, 0..1, smoothed
  wave: Float32Array;  // the waveform in 32 columns, -1..1 (filled by AudioFeed)
}

export const BAND_COUNT = 32;

export const SILENT: AudioFeatures = {
  bass: 0, mid: 0, high: 0, level: 0, beat: false, active: false,
  bands: new Float32Array(BAND_COUNT), wave: new Float32Array(BAND_COUNT),
};

/** Edges of the 32 log bands: 40 Hz to 16 kHz, each band a fixed step wider than the one before. */
const EDGE_HZ = Array.from({ length: BAND_COUNT + 1 }, (_, i) => 40 * Math.pow(400, i / BAND_COUNT));

/** The waveform as 32 columns: each column takes the sample with the largest size in its share of the window. */
export function waveColumns(wave: Float32Array, out: Float32Array): void {
  const per = Math.floor(wave.length / BAND_COUNT);
  for (let c = 0; c < BAND_COUNT; c++) {
    let best = 0;
    for (let i = c * per; i < (c + 1) * per; i++) if (Math.abs(wave[i]) > Math.abs(best)) best = wave[i];
    out[c] = Math.max(-1, Math.min(1, best));
  }
}

// Hz ranges. The beat is looked for in 150 Hz to 4 kHz, where kicks and snares show up as sudden jumps.
const BASS: [number, number] = [20, 150];
const MID: [number, number] = [150, 2000];
const HIGH: [number, number] = [2000, 12000];
const BEAT: [number, number] = [150, 4000];

const MIN_BEAT_GAP = 0.333; // s. Three beats a second at most, which also keeps the flashes inside the WCAG 2.3.1 limit
const FLOOR_CAP = 0.15;     // the noise floor never swallows more than this much of a loud signal
const GATE_OPEN = 0.04;
const GATE_CLOSE = 0.02;
const IDLE_AFTER = 1.5;     // s of closed gate before the scene is told to go idle

function binRange(lo: number, hi: number, binHz: number, n: number): [number, number] {
  const a = Math.max(1, Math.round(lo / binHz));
  const b = Math.min(n - 1, Math.max(a, Math.round(hi / binHz)));
  return [a, b];
}

const KEYS = ['bass', 'mid', 'high', 'level'] as const;

export class FeatureExtractor {
  private prev: Float32Array | null = null;
  private peak = { bass: 0.2, mid: 0.2, high: 0.2, level: 0.2 };
  private buckets: number[] = []; // quietest level of each 0.25 s, last 5 s: the noise floor
  private bucketMin = 1;
  private bucketT = 0;
  private open = false;
  private closedFor = 99;
  private fluxHist: { t: number; v: number }[] = [];
  private clock = 0;
  private lastBeat = -10;
  private bPeak = new Float32Array(BAND_COUNT).fill(0.2);
  private bSmooth = new Float32Array(BAND_COUNT);

  /** spec: byte spectrum from AnalyserNode.getByteFrequencyData (0..255 per bin). */
  process(spec: Uint8Array, dt: number, sampleRate: number, fftSize: number): AudioFeatures {
    const n = spec.length;
    const binHz = sampleRate / fftSize;
    this.clock += dt;

    const mean = (lo: number, hi: number): number => {
      const [a, b] = binRange(lo, hi, binHz, n);
      let s = 0;
      for (let i = a; i <= b; i++) s += spec[i];
      return s / ((b - a + 1) * 255);
    };
    const raw = { bass: mean(...BASS), mid: mean(...MID), high: mean(...HIGH), level: mean(20, 20000) };

    // Noise floor: the quietest stretch of the last 5 s, capped. Steady hiss is taken off; music stays.
    this.bucketMin = Math.min(this.bucketMin, raw.level);
    this.bucketT += dt;
    if (this.bucketT >= 0.25) {
      this.buckets.push(this.bucketMin);
      if (this.buckets.length > 20) this.buckets.shift();
      this.bucketMin = 1;
      this.bucketT = 0;
    }
    const floor = Math.min(FLOOR_CAP, this.buckets.length ? Math.min(...this.buckets, this.bucketMin) : 0);
    const gated = Math.max(0, raw.level - floor);

    // Gate with hysteresis, so a signal hovering at the edge does not chatter
    if (this.open ? gated < GATE_CLOSE : gated > GATE_OPEN) this.open = !this.open;
    this.closedFor = this.open ? 0 : this.closedFor + dt;

    // Auto gain: each band is divided by its own slow peak (decays over ~10 s), with a floor so hiss is never boosted
    const decay = Math.exp(-dt / 10);
    const norm = { bass: 0, mid: 0, high: 0, level: 0 };
    for (const k of KEYS) {
      this.peak[k] = Math.max(this.peak[k] * decay, raw[k], 0.12);
      norm[k] = this.open ? Math.min(1, raw[k] / this.peak[k]) : 0;
    }

    // 32 bands for the MUSIC looks: each with its own auto gain, a fast rise and a slow fall
    const bands = this.bSmooth;
    for (let b = 0; b < BAND_COUNT; b++) {
      const r = mean(EDGE_HZ[b], EDGE_HZ[b + 1]);
      this.bPeak[b] = Math.max(this.bPeak[b] * decay, r, 0.12);
      const target = this.open ? Math.min(1, r / this.bPeak[b]) : 0;
      bands[b] += (target - bands[b]) * (1 - Math.exp(-dt / (target > bands[b] ? 0.04 : 0.25)));
    }

    // Beat: spectral flux (how much the spectrum rose since the last frame) against an adaptive threshold
    const [fa, fb] = binRange(BEAT[0], BEAT[1], binHz, n);
    if (!this.prev || this.prev.length !== n) this.prev = new Float32Array(n);
    let flux = 0;
    for (let i = fa; i <= fb; i++) {
      const v = spec[i] / 255;
      if (v > this.prev[i]) flux += v - this.prev[i];
    }
    flux /= fb - fa + 1;
    for (let i = 0; i < n; i++) this.prev[i] = spec[i] / 255;

    this.fluxHist.push({ t: this.clock, v: flux });
    while (this.fluxHist.length && this.clock - this.fluxHist[0].t > 1) this.fluxHist.shift();
    let avg = 0;
    for (const h of this.fluxHist) avg += h.v;
    avg /= this.fluxHist.length;
    const threshold = avg * 1.4 + 0.015;
    const beat = this.open && flux > threshold && this.clock - this.lastBeat > MIN_BEAT_GAP;
    if (beat) this.lastBeat = this.clock;

    return {
      ...norm, beat, active: this.open || this.closedFor < IDLE_AFTER,
      bands: Float32Array.from(bands), wave: new Float32Array(BAND_COUNT), // AudioFeed fills wave
    };
  }
}
