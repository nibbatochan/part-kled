import { describe, it, expect } from 'vitest';
import { defaults, parseParams, serializeParams, type Params } from '../src/core/params';

describe('params', () => {
  it('serializes and parses without loss', () => {
    const custom: Params = {
      ...defaults,
      drift: 0.42,
      splash: 0.99,
      lightDirection: 'highlights',
      line: { angle: 1.2, length: 0.7 },
    };
    const serialized = serializeParams(custom);
    const parsed = parseParams(serialized);
    expect(parsed.drift).toBe(0.42);
    expect(parsed.splash).toBe(0.99);
    expect(parsed.lightDirection).toBe('highlights');
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
