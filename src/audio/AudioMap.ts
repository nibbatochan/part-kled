// src/audio/AudioMap.ts
// Audio features in, small offsets for the particle settings out. The user's own sliders are never touched:
// the engine adds these offsets on top each frame, so presets and exports stay as they were.
import type { AudioMod } from '../lite/LiteEngine';
import type { AudioFeatures } from './features';

/** Moves toward a target: fast when rising (attack), slow when falling (release). tau in seconds. */
class Smooth {
  v = 0;
  step(target: number, dt: number, attack: number, release: number): number {
    const tau = Math.max(1e-3, target > this.v ? attack : release);
    this.v += (target - this.v) * (1 - Math.exp(-dt / tau));
    return this.v;
  }
}

export interface MapSettings {
  amount: number; // 0..1, how strongly the sound moves the picture
}

export interface MapResult {
  mod: AudioMod;
}

/** Hard limit on the whole-picture brightness swing, so the sound can never make the picture blink. */
export const MAX_BRIGHT = 0.15;

export class AudioMapper {
  settings: MapSettings = { amount: 0.7 };
  private s = {
    rate: new Smooth(), bright: new Smooth(), dolly: new Smooth(), depth: new Smooth(),
    drift: new Smooth(), sway: new Smooth(), trailGain: new Smooth(), scatter: new Smooth(),
  };
  private beatEnv = 0;

  step(f: AudioFeatures, dt: number): MapResult {
    const g = this.settings.amount;
    // Silence: every term glides back to 0 over about 2 s, so the scene returns to its own idle look
    const rel = (t: number) => (f.active ? t : Math.max(2, t));

    this.beatEnv = f.beat ? 1 : this.beatEnv * Math.exp(-dt / 0.2);

    const mod: AudioMod = {
      rate: 1 + this.s.rate.step(0.6 * g * f.level, dt, 0.15, rel(0.8)),
      bright: Math.min(MAX_BRIGHT, this.s.bright.step(MAX_BRIGHT * g * f.level, dt, 0.08, rel(0.5))),
      dolly: this.s.dolly.step(0.06 * g * f.bass, dt, 0.05, rel(0.3)),
      depth: this.s.depth.step(0.15 * g * f.bass, dt, 0.08, rel(0.6)),
      drift: this.s.drift.step(0.08 * g * f.mid, dt, 0.2, rel(1.2)),
      sway: this.s.sway.step(1.0 * g * f.mid, dt, 0.3, rel(1.5)),
      trailGain: this.s.trailGain.step(0.6 * g * f.high, dt, 0.06, rel(0.25)),
      scatter: this.s.scatter.step(0.4 * g * f.high, dt, 0.06, rel(0.25)),
      trailLen: 0.3 * g * this.beatEnv,
    };
    return { mod };
  }
}
