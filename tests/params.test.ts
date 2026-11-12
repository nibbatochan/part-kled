import { describe, it, expect } from 'vitest';
import { defaults, parseParams, serializeParams, withEffectsStart, type Params } from '../src/core/params';

describe('params', () => {
  it('serializes and parses without loss', () => {
    const custom: Params = {
      ...defaults,
      drift: 0.42,
      splash: 0.99,
      scan: true,
      line: { angle: 1.2, length: 0.7 },
    };
    const serialized = serializeParams(custom);
    const parsed = parseParams(serialized);
    expect(parsed.drift).toBe(0.42);
    expect(parsed.splash).toBe(0.99);
    expect(parsed.scan).toBe(true);
    expect(parsed.line.angle).toBe(1.2);
    expect(parsed.line.length).toBe(0.7);
  });

  it('ignores invalid JSON and unknown fields gracefully', () => {
    const invalid = parseParams('invalid-json');
    expect(invalid.drift).toBe(defaults.drift);

    const withExtra = parseParams('{"drift":0.5,"fakeProperty":123}');
    expect(withExtra.drift).toBe(0.5);
    expect((withExtra as unknown as { fakeProperty: number }).fakeProperty).toBe(123);
  });
});

describe('finish passes (R2)', () => {
  const flags = ['caOn', 'vignetteOn', 'paperOn', 'softOn', 'tentOn', 'streakOn'] as const;
  it('are off by default and after EFFECTS RESET', () => {
    flags.forEach((k) => {
      expect(defaults[k]).toBe(false);
      expect(withEffectsStart()[k]).toBe(false);
    });
    expect(defaults.finish.mixMode).toBe(0);
  });
});

describe('first load', () => {
  it('has emitters off and nothing else changed', () => {
    const p = withEffectsStart();
    expect(p.emitOn).toBe(false);
    expect({ ...p, emitOn: true }).toEqual({ ...withEffectsStart(), emitOn: true });
    expect(defaults.emitOn).toBe(true);
  });
});
