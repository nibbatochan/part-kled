// src/web/WebEngine.ts
// Same surface as core/Engine, so the studio UI and App run unchanged. Motion and drawing come from the
// light renderer in src/lite. Not in this build: DRAW (flow strokes), PULL (gather spring), MELT travel,
// and the separate burst slider (BURST is now a scan style). Those controls are removed from index.html.
import { LiteEngine, type LiteParams } from '../lite/LiteEngine';
import type { LiteSample } from '../lite/sample';
import type { Params } from '../core/params';

/** Scan style index of BURST in the web build (after SWEEP, RING, RADAR, LINES, DEPTH). */
export const BURST_MODE = 5;

/** Studio settings in, light renderer settings out. */
export function toLiteParams(p: Params): Partial<LiteParams> {
  const bursting = p.scanMode === BURST_MODE;
  return {
    drift: p.drift,
    angle: p.line.angle,
    length: p.line.length,
    lean: p.lean,
    depth: p.depth,
    pan: p.panMode ? p.panAmount : 0,
    floatOn: p.floatOn,
    threeD: p.threeD,
    randomness: p.randomness,
    trailSize: p.trailSize,
    trailAngle: p.trailAngle,
    pSat: p.pSat,
    track: p.track,
    trackOld: p.trackStyle === 'old',
    // BURST scan style: the click shock, its strength set by the scanner level (3 = studio strength)
    burst: bursting ? p.scanLevel / 3 : 0,
    trails: true, // trails are off when TRAIL AMOUNT is 0
    trailAmount: p.trail.amount,
    trailLength: p.trail.length,
    trailStrength: p.trail.strength,
    trailDetail: p.trail.detail,
    opacity: p.fx.opacity,
    bw: p.colorMode === 'bw',
    fx: { ...p.fx },
    light: null, // no tint control in the web build (the TINT row is removed)
    scan: p.scan && !bursting,
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
  private pending: LiteSample | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.lite = new LiteEngine(canvas, { maxDpr: 1.5 });
    this.lite.setLayout({ fit: 'contain', zoom: 0.72 }); // same picture size as the studio

    // 3D: drag to turn in any direction, wheel to move through, double-click to reset
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.threeD) return;
      this.drag = { x: e.clientX, y: e.clientY };
      this.lite.dragStart();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.lite.dragMove(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => {
      this.drag = null;
      this.lite.dragEnd();
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.threeD) return;
      e.preventDefault();
      this.lite.wheelMove(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => this.lite.resetOrbit());
  }

  private threeD = false;
  private drag: { x: number; y: number } | null = null;

  setParams(p: Params): void {
    this.threeD = p.threeD;
    this.lite.setParams(toLiteParams(p));
  }

  setHasActiveImage(_has: boolean): void {}

  /**
   * The studio hands over the picture on screen and the one it is switching to. The light build shows
   * the current one now; startMorph then runs the pixel shift into the next one (same task, no flicker).
   */
  loadSampleData(current: LiteSample, next: LiteSample): void {
    this.pending = next;
    this.lite.setSample(current);
  }

  startMorph(onComplete?: () => void): void {
    if (this.pending) {
      this.lite.transitionTo(this.pending);
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
