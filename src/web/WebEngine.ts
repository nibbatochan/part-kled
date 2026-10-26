// src/web/WebEngine.ts
// Same surface as core/Engine, so the studio UI and App run unchanged. Motion and drawing come from the
// light renderer in src/lite. Not in this build: DRAW (flow strokes), PULL (gather spring), MELT travel
// and the morph between pictures. Those controls are disabled in index.html.
import { LiteEngine, type LiteParams } from '../lite/LiteEngine';
import type { LiteSample } from '../lite/sample';
import type { Params } from '../core/params';

const LIGHT_RGB: Record<Params['light'], [number, number, number] | null> = {
  cream: [0.95, 0.9, 0.79],
  ice: [0.75, 0.88, 1],
  orange: [1, 0.6, 0.24],
  red: [1, 0.29, 0.24],
  green: [0.25, 0.88, 0.69],
  violet: [0.56, 0.42, 1],
  off: null,
};

/** Studio settings in, light renderer settings out. */
export function toLiteParams(p: Params): Partial<LiteParams> {
  return {
    drift: p.drift,
    angle: p.line.angle,
    length: p.line.length,
    depth: p.depth,
    track: p.track,
    burst: p.splash,
    trails: p.trails,
    trailAmount: p.trail.amount,
    trailLength: p.trail.length,
    trailStrength: p.trail.strength,
    trailDetail: p.trail.detail,
    opacity: p.fx.opacity,
    bw: p.colorMode === 'bw',
    fx: { ...p.fx },
    light: p.lightOn ? LIGHT_RGB[p.light] : null,
    scan: p.scan,
    scanMode: p.scanMode,
    scanLevel: p.scanLevel,
    // calibrated so the mean brightness matches the studio's (measured: studio 10.1, web 10.5 on the same frame)
    brightness: 1.1,
  };
}

/** Particle budget from what the device can plausibly afford (same tiers as the hero). */
export function pointBudget(): number {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  if (window.innerWidth < 768 || cores <= 4 || mem <= 4) return 200000;
  if (cores >= 8 && mem >= 8 && window.innerWidth >= 1280) return 450000;
  return 300000;
}

export class WebEngine {
  private lite: LiteEngine;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.lite = new LiteEngine(canvas, { maxDpr: 1.5 });
    this.lite.setLayout({ fit: 'contain', zoom: 0.72 }); // same picture size as the studio
  }

  setParams(p: Params): void {
    this.lite.setParams(toLiteParams(p));
  }

  setHasActiveImage(_has: boolean): void {}

  private pending: LiteSample | null = null;

  /**
   * The studio hands over the picture on screen and the one it is switching to. The light build has
   * no morph, so it shows the current one now and swaps to the next one at startMorph (same task, no flicker).
   */
  loadSampleData(current: LiteSample, next: LiteSample): void {
    this.pending = next;
    this.lite.setSample(current);
  }

  // shortcut: picture switch is a cut, not a morph; upgrade by blending two sample buffers in the shader
  startMorph(onComplete?: () => void): void {
    if (this.pending) {
      this.lite.setSample(this.pending);
      this.pending = null;
    }
    onComplete?.();
  }

  private local(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  }

  setPointer(clientX: number, clientY: number): void {
    const [x, y] = this.local(clientX, clientY);
    const r = this.canvas.getBoundingClientRect();
    const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    this.lite.setPointer(inside ? x : null, inside ? y : null);
  }

  setPointerInside(inside: boolean): void {
    if (!inside) this.lite.setPointer(null, null);
  }

  triggerSplash(clientX?: number, clientY?: number): void {
    if (clientX === undefined || clientY === undefined) return;
    const [x, y] = this.local(clientX, clientY);
    this.lite.burst(x, y);
  }

  update(dt: number, _time: number): void {
    this.lite.frame(dt);
  }

  resize(width: number, height: number): void {
    this.lite.resize(width, height);
  }

  dispose(): void {
    this.lite.dispose();
  }
}
