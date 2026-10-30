import { describe, expect, it } from 'vitest';
import { FeatureExtractor } from '../src/audio/features';
import { AudioMapper, MAX_BRIGHT } from '../src/audio/AudioMap';

const N = 1024;
const SR = 48000;
const FFT = 2048;
const DT = 1 / 60;

/** A spectrum with a steady level on every bin, plus a kick-like burst on bins 3..200. */
function spec(base: number, burst = 0): Uint8Array {
  const s = new Uint8Array(N);
  s.fill(base);
  for (let i = 3; i <= 200; i++) s[i] = Math.min(255, base + burst);
  return s;
}

function run(ex: FeatureExtractor, seconds: number, frame: (t: number) => Uint8Array) {
  const out = [];
  for (let t = 0; t < seconds; t += DT) out.push({ t, f: ex.process(frame(t), DT, SR, FFT) });
  return out;
}

describe('FeatureExtractor', () => {
  it('stays silent and idle on digital silence', () => {
    const r = run(new FeatureExtractor(), 3, () => new Uint8Array(N));
    expect(r.every((x) => !x.f.beat)).toBe(true);
    expect(r[r.length - 1].f.active).toBe(false);
    expect(r[r.length - 1].f.level).toBe(0);
  });

  it('ignores steady hiss: the gate stays closed', () => {
    const r = run(new FeatureExtractor(), 8, () => spec(25));
    expect(r.slice(-60).every((x) => x.f.level === 0 && !x.f.beat)).toBe(true);
  });

  it('finds beats in a pulsing spectrum, never closer than 333 ms', () => {
    const r = run(new FeatureExtractor(), 6, (t) => spec(25, 200 * Math.exp(-(t % 0.5) * 12)));
    const beats = r.filter((x) => x.f.beat).map((x) => x.t);
    expect(beats.length).toBeGreaterThanOrEqual(6); // about 12 kicks in 6 s, at least half found
    for (let i = 1; i < beats.length; i++) expect(beats[i] - beats[i - 1]).toBeGreaterThanOrEqual(0.333 - 1e-9);
  });

  it('never reports more than 3 beats in any second, even on a very fast pulse', () => {
    const r = run(new FeatureExtractor(), 6, (t) => spec(25, 200 * Math.exp(-(t % 0.15) * 15)));
    const beats = r.filter((x) => x.f.beat).map((x) => x.t);
    for (const b of beats) expect(beats.filter((x) => x >= b && x < b + 1).length).toBeLessThanOrEqual(3);
  });

  it('goes idle 1.5 s after the sound stops', () => {
    const ex = new FeatureExtractor();
    run(ex, 3, (t) => spec(25, 200 * Math.exp(-(t % 0.5) * 12)));
    const after = run(ex, 3, () => new Uint8Array(N));
    expect(after[30].f.active).toBe(true); // 0.5 s later: still counts as active
    expect(after[after.length - 1].f.active).toBe(false);
  });
});

describe('AudioMapper', () => {
  const z = new Float32Array(32);
  const loud = { bass: 1, mid: 1, high: 1, level: 1, beat: false, active: true, bands: z, wave: z };
  const quiet = { bass: 0, mid: 0, high: 0, level: 0, beat: false, active: false, bands: z, wave: z };

  it('keeps the brightness swing under the safety cap, even at full amount', () => {
    const m = new AudioMapper();
    m.settings.amount = 1;
    let max = 0;
    for (let i = 0; i < 600; i++) max = Math.max(max, m.step(loud, DT).mod.bright);
    expect(max).toBeLessThanOrEqual(MAX_BRIGHT + 1e-9);
    expect(max).toBeGreaterThan(0.1);
  });

  it('speeds the clock up with loudness and glides back to normal in silence', () => {
    const m = new AudioMapper();
    for (let i = 0; i < 300; i++) m.step(loud, DT);
    expect(m.step(loud, DT).mod.rate).toBeGreaterThan(1.3);
    let r = m.step(quiet, DT);
    for (let i = 0; i < 60 * 12; i++) r = m.step(quiet, DT); // idle glide: 2 s time constant
    expect(r.mod.rate).toBeCloseTo(1, 2);
    expect(r.mod.dolly).toBeCloseTo(0, 3);
  });

  it('rises quickly and falls slowly (attack shorter than release)', () => {
    const m = new AudioMapper();
    for (let i = 0; i < 6; i++) m.step(loud, DT); // 0.1 s of bass
    const rise = m.step(loud, DT).mod.dolly;
    expect(rise).toBeGreaterThan(0.06 * 0.7 * 0.5); // reached over half of the target in 0.1 s
    for (let i = 0; i < 300; i++) m.step(loud, DT);
    const top = m.step(loud, DT).mod.dolly;
    for (let i = 0; i < 6; i++) m.step({ ...loud, bass: 0 }, DT); // 0.1 s of nothing
    expect(m.step({ ...loud, bass: 0 }, DT).mod.dolly).toBeGreaterThan(top * 0.5); // still over half
  });

});
