import { describe, it, expect } from 'vitest';
import { PANEL_TABS, parseTab, startTab, tabVisibility } from '../src/ui/panelTabs';

describe('panel tabs', () => {
  it('are in flow order', () => {
    expect(PANEL_TABS).toEqual(['effect', 'image', 'emitter', 'video']);
  });

  it('show exactly one body for every tab', () => {
    for (const t of PANEL_TABS) {
      const v = tabVisibility(t);
      expect(Object.values(v).filter(Boolean).length).toBe(1);
      expect(v[t]).toBe(true);
    }
  });

  it('fall back to effect for a missing or unknown saved value', () => {
    for (const bad of [null, '', 'nonsense', 'EFFECT', '{"x":1}']) expect(parseTab(bad)).toBe('effect');
    expect(parseTab('emitter')).toBe('emitter');
  });
});

describe('index.html placement', async () => {
  const html = (await import('node:fs')).readFileSync('index.html', 'utf8');
  const at = (s: string) => {
    const i = html.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };
  const bodyAt = (t: string) => at(`data-tab-body="${t}"`);
  const end = at('<!-- end panel tabs -->');
  const nextStart: Record<string, number> = {
    effect: bodyAt('image'), image: bodyAt('emitter'), emitter: bodyAt('video'), video: end,
  };
  const placed: [string, string][] = [
    ['data-collapse="look"', 'effect'], ['data-collapse="particle"', 'effect'], ['data-collapse="tone"', 'image'],
    ['data-collapse="emitters"', 'emitter'], ['data-collapse="particles"', 'emitter'],
    ['data-collapse="reactions"', 'emitter'], ['data-collapse="music"', 'emitter'], ['id="clip-panel"', 'video'],
  ];
  for (const [marker, tab] of placed) {
    it(`${marker} sits in the ${tab} body`, () => {
      const p = at(marker);
      expect(p).toBeGreaterThan(bodyAt(tab));
      expect(p).toBeLessThan(nextStart[tab]);
    });
  }
  it('picture strip sits above the tab bar, in one box with it', () => {
    const head = at('id="panel-head"');
    expect(at('id="thumbnail-strip"')).toBeGreaterThan(head);
    expect(at('id="thumbnail-strip"')).toBeLessThan(at('id="panel-tabs"'));
    expect(at('id="panel-tabs"')).toBeLessThan(bodyAt('effect'));
    expect(html.includes('id="source-box"')).toBe(false);
  });
});

describe('panel.css hierarchy', () => {
  const css = (require('node:fs') as typeof import('node:fs')).readFileSync('src/ui/panel.css', 'utf8');
  it('declares the box heading size in exactly one rule', () => {
    const rules = [...css.matchAll(/^\.box h2 \{([^}]*)\}/gm)].map((m) => m[1]);
    expect(rules.filter((r) => /font-size/.test(r)).length).toBe(1);
    expect(rules.filter((r) => /\bheight:/.test(r)).length).toBe(1);
  });
  it('stacks boxes inside a tab body with the same gap as the console', () => {
    expect(css).toMatch(/\.panel-tab-body \{[^}]*flex-direction: column[^}]*gap: 8px/);
  });
});

describe('startTab', () => {
  it('opens effect in the lab', () => expect(startTab('lab')).toBe('effect'));
  it('opens video in the video view', () => expect(startTab('video')).toBe('video'));
  it('opens effect for any unknown mode', () => expect(startTab('')).toBe('effect'));
});
