// src/web/WebEngine.ts
// Same surface as core/Engine, so the studio UI and App run unchanged. Motion and drawing come from the
// light renderer in src/lite. Not in this build: DRAW (flow strokes), PULL (gather spring), MELT travel,
// and the separate burst slider (BURST is now a scan style). Those controls are removed from index.html.
import { LiteEngine, type AudioMod, type LiteLayout, type LiteParams, type MusicState } from '../lite/LiteEngine';
import type { LiteSample } from '../lite/sample';
import { lookTone, type Params } from '../core/params';
import { hexToRgb } from '../core/styles';

export interface ExportSnapshot {
  sample: LiteSample;
  params: LiteParams;
  layout: LiteLayout;
  view: { lookX: number; lookY: number; dolly: number };
  time: number;
  /** Css px per world unit of the live view: the reference that keeps dot and cell size right at any export size */
  liveScaleCss: number;
  /** Device px per css px of the live view: its trails are 1 device px wide */
  liveDpr: number;
}

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
    style: p.style,
    cell: lookTone(p).cell,
    sizeBy: lookTone(p).sizeBy,
    styleSet: { ...p.ss },
    emitOn: p.emitOn,
    emit: { ...p.emit },
    colorMode: lookTone(p).colour,
    invert: lookTone(p).invert,
    autoLevels: lookTone(p).autoLevels,
    ink: hexToRgb(lookTone(p).ink),
    paper: hexToRgb(lookTone(p).paper),
    track: p.track,
    trackOld: p.trackStyle === 'old',
    // BURST scan style: the click shock, its strength set by the scanner level (3 = studio strength)
    burst: bursting ? p.scanLevel / 3 : 0,
    trails: p.trails, // the TRAILS switch; trails are also off when the trail amount is 0
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
    musicLook: p.musicLook,
    motionFx: p.motionFx,
    motionAmount: p.motionAmount,
    motionSpeed: p.motionSpeed,
    glow: {
      bloomOn: p.bloomOn,
      haloOn: p.haloOn,
      glowPat: p.glow.glowPat,
      glowPatAmt: p.glow.glowPatAmt,
      threshold: p.glow.threshold,
      bloomAmount: p.glow.bloomAmount,
      bloomRadius: p.glow.bloomRadius,
      haloAmount: p.glow.haloAmount,
      haloSize: p.glow.haloSize,
      haloTint: hexToRgb(p.glow.haloTint),
      vhsOn: p.vhsOn,
      vhsAmount: p.signal.vhsAmount,
      vhsNoise: p.signal.vhsNoise,
      glitchOn: p.glitchOn,
      glitchAmount: p.signal.glitchAmount,
      glitchRate: p.signal.glitchRate,
      glitchBeat: p.glitchBeat,
      grainOn: p.grainOn,
      grainAmount: p.surface.grainAmount,
      grainSize: p.surface.grainSize,
      holoOn: p.holoOn,
      holoAmount: p.surface.holoAmount,
      holoSpeed: p.surface.holoSpeed,
      duoOn: p.duoOn,
      duoAmount: p.surface.duoAmount,
      duoShadow: hexToRgb(p.surface.duoShadow),
      duoLight: hexToRgb(p.surface.duoLight),
      cloudOn: p.cloudOn,
      cloudAmount: p.surface.cloudAmount,
      cloudScale: p.surface.cloudScale,
      cloudTint: hexToRgb(p.surface.cloudTint),
      meshOn: p.meshOn,
      meshAmount: p.surface.meshAmount,
      meshPalette: p.surface.meshPalette,
      stackOn: p.stackOn,
      stackWords: p.stackWords,
      stackCount: p.graphic.stackCount,
      stackWidth: p.graphic.stackWidth,
      stackColour: hexToRgb(p.graphic.stackColour),
    },
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
    this.setPictureZoom(0.72, 1);

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
  private audioSettings: { amount: number; look: number; eq: number; eqSize: number } = { amount: 0.7, look: 0, eq: 0, eqSize: 1.8 };

  setParams(p: Params): void {
    this.threeD = p.threeD;
    this.audioSettings = { amount: p.audioAmount, look: p.musicLook, eq: p.eqStyle, eqSize: p.eqSize };
    this.lite.setParams(toLiteParams(p));
  }

  /** MUSIC controls of the sidebar (how strongly, the look and the equalizer). The music panel reads them every frame. */
  getAudioSettings(): { amount: number; look: number; eq: number; eqSize: number } {
    return this.audioSettings;
  }

  /** The picture on screen (for its colours, the equalizer palette). */
  getPicture(): LiteSample | null {
    return this.lite.getSample();
  }

  /** EQUALIZER particles: on or off, dot size, 12 column levels, the picture's colours. */
  setEqualizer(style: number, levels: Float32Array, wave: Float32Array, cols: [number, number, number][], size: number): void {
    this.lite.setEqualizer(style, levels, wave, cols, size * this.dotScale);
  }

  /** Picture size and equalizer dot size. The desktop wallpaper uses a smaller picture (the screen is larger). */
  setPictureZoom(zoom: number, dotScale: number): void {
    this.dotScale = dotScale;
    this.lite.setLayout({ fit: 'contain', zoom });
  }
  private dotScale = 1;

  /** The sound as the particles see it this frame (the MUSIC looks). */
  setMusic(m: MusicState): void {
    this.lite.setMusic(m);
  }

  setAudioMod(m: AudioMod): void {
    this.lite.setAudioMod(m);
  }


  setHasActiveImage(_has: boolean): void {}

  /** Everything the exporter needs to redraw the scene on its own canvas at another size. */
  exportSnapshot(): ExportSnapshot | null {
    const sample = this.lite.getSample();
    if (!sample) return null;
    const params: LiteParams = { ...this.lite.params, fx: { ...this.lite.params.fx } };
    params.track = false; // no cursor, no click shock in an export
    params.burst = 0;
    params.musicLook = 0; // no sound in an export
    return {
      sample,
      params,
      layout: { ...this.lite.layout },
      view: this.lite.getView(),
      time: this.lite.getTime(),
      liveScaleCss: Math.max(1, this.lite.getScaleCss()),
      liveDpr: this.lite.getDpr(),
    };
  }

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

  /** Show this sample at once, no morph (the first frame of a video). */
  showSample(s: LiteSample): void {
    this.lite.setSample(s);
  }

  /** Morph from the picture on screen into the next keyframe of a video clip. */
  morphTo(next: LiteSample): void {
    this.lite.transitionTo(next);
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
