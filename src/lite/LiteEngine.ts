// src/lite/LiteEngine.ts
// Raw WebGL2, no three.js, no framebuffers. Points and optional trail lines. A new picture morphs in
// from the picture on screen (same particle index, same rule as the studio's morph).
import { FRAG_SRC, POINT_VERT, TRAIL_VERT } from './shaders';
import type { LiteSample } from './sample';

export interface LiteFx {
  black: number;      // 0..0.5
  white: number;      // 0.5..1
  gamma: number;      // 0.4..2.2
  contrast: number;   // -1..1
  hue: number;        // degrees
  saturation: number; // 0..2
}

export interface LiteParams {
  drift: number;        // FLOW: 0..1 how many particles drift and how far
  angle: number;        // radians, counter-clockwise from +x
  length: number;       // 0.25..1 drift strength (dial)
  lean: number;         // -1..1 side of the picture the streamers come from (0 = centred)
  depth: number;        // RELIEF: 0..1
  randomness: number;   // 0..1 path randomness (direction and distance per particle)
  trailSize: number;    // dot size of drifting particles, 0.2..3
  trailAngle: number;   // degrees, trail direction turned away from the drift path
  speed: number;        // 1 = default
  sway: number;         // 0..1 idle camera drift (always on, not PAN)
  pan: number;          // 0..1 tilt amount; 0 = PAN off
  floatOn: boolean;     // FLOAT: the picture hovers gently
  track: boolean;       // cursor acts on the particles
  trackOld: boolean;    // TRACK style: true = OLD (repel + follow motion), false = SOFT (gentle push)
  burst: number;        // 0..1 click burst strength (BURST scan style)
  trails: boolean;      // trail lines on
  trailAmount: number;  // 0..1 share of streaks kept
  trailLength: number;  // PARTICLE LENGTH: 0.3..2
  trailStrength: number;// 0..2
  trailDetail: number;  // 0..1
  dim: number;          // 0..1 procedural dimming along the drift paths
  pSat: number;         // 0..2 particle saturation, 1 = as sampled
  brightness: number;   // 1 = as the source
  opacity: number;      // 0..1 picture only
  bw: boolean;
  fx: LiteFx;
  light: [number, number, number] | null; // tint colour, null = no tint
  scan: boolean;
  scanMode: number;     // 0 SWEEP, 1 RING, 2 RADAR, 3 LINES, 4 DEPTH, (5 BURST is the click shock)
  scanLevel: number;    // 1..5, 3 = studio strength
}

export const liteDefaults: LiteParams = {
  drift: 0.6,
  angle: 0.5,
  length: 0.5,
  lean: 0,
  depth: 0.5,
  randomness: 0.3,
  trailSize: 1,
  trailAngle: 0,
  speed: 1,
  sway: 0.6,
  pan: 0.5,
  floatOn: false,
  track: true,
  trackOld: false,
  burst: 0,
  trails: true,
  trailAmount: 0.35,
  trailLength: 0.6,
  trailStrength: 0.5,
  trailDetail: 0.25,
  dim: 0.3,
  pSat: 1.2,
  brightness: 1.15,
  opacity: 1,
  bw: false,
  fx: { black: 0, white: 1, gamma: 1, contrast: 0, hue: 0, saturation: 1 },
  light: [0.95, 0.9, 0.79],
  scan: false,
  scanMode: 0,
  scanLevel: 3,
};

export interface LiteLayout {
  fit: 'contain' | 'cover';
  /** Picture size as a share of the fitted size (the studio shows it at about 0.72 of the stage height) */
  zoom: number;
  /** -1 left, 0 centre, 1 right */
  alignX: number;
  alignY: number;
}

const TRAIL_STRIDE = 2;
const MIN_DRAWN = 40000;
const SCAN_RATE = 0.155; // the studio's scan speed: one pass about every 6.5 s
const BURST_LIFE = 1.1;  // seconds, the studio's burst lifetime
const MORPH_S = 1.6;     // seconds, the studio's morph time

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('lite shader: ' + log);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('lite link: ' + gl.getProgramInfoLog(p));
  return p;
}

const UNIFORMS = [
  'uView', 'uScale', 'uOffset', 'uTime', 'uDrift', 'uDepth', 'uSpeed', 'uDir', 'uLean', 'uHalfW',
  'uRandom', 'uTrailSize', 'uTrailAngle', 'uDim', 'uPSat', 'uLook', 'uSway', 'uPtr', 'uPtrOn', 'uPtrVel', 'uTrackOld', 'uBurst',
  'uCover', 'uPointPx', 'uBright', 'uTrailLen', 'uTrailGain', 'uTrailAmount', 'uTrailDetail', 'uLightCol',
  'uLightOn', 'uScanOn', 'uScan', 'uScanMode', 'uScanCenter', 'uZScale', 'uOpacity', 'uMorph', 'uRole',
  'uScanLevel', 'uFx1', 'uFx2', 'uBW',
];

interface Slot {
  vbo: WebGLBuffer;
  vaoPoints: WebGLVertexArrayObject;
  vaoTrails: WebGLVertexArrayObject;
  count: number;
}

export class LiteEngine {
  readonly gl: WebGL2RenderingContext;
  params: LiteParams = { ...liteDefaults, fx: { ...liteDefaults.fx } };
  layout: LiteLayout = { fit: 'contain', zoom: 1, alignX: 0, alignY: 0 };

  private canvas: HTMLCanvasElement;
  private pointProg: WebGLProgram;
  private trailProg: WebGLProgram;
  private pointU: Record<string, WebGLUniformLocation | null> = {};
  private trailU: Record<string, WebGLUniformLocation | null> = {};
  // Two buffer slots: the picture on screen and the one arriving during a morph
  private slots: Slot[] = [];
  private cur = 0;
  private morphFrom = 0;
  private morphing = false;
  private morphT = 0;
  private morphVao: WebGLVertexArrayObject;
  private morphCount = 0;

  private sample: LiteSample | null = null;
  private drawn = 0;
  private maxDpr: number;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private scale = 1;
  private offX = 0;
  private offY = 0;

  private time = 0;
  private ptr = { x: 0, y: 0, on: 0, targetOn: 0 };
  private prevPtr = { x: 0, y: 0 };
  private ptrVel = { x: 0, y: 0 };
  private look = { x: 0, y: 0 };
  private lookTarget = { x: 0, y: 0 };
  private sway = { x: 0, y: 0 };
  private burstX = 0;
  private burstY = 0;
  private burstAge = BURST_LIFE;
  // Click: the scan starts from here and restarts its sweep
  private clickX = 0;
  private clickY = 0;
  private clickT = 0;

  // adaptive quality
  private ema = 16;
  private slow = 0;
  private level = 0;
  /** Set by the host to react to quality steps (for logging or tests). */
  onQuality?: (info: { drawn: number; dpr: number; trails: boolean }) => void;
  private trailsAllowed = true;

  constructor(canvas: HTMLCanvasElement, opts: { maxDpr?: number } = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas = canvas;
    this.maxDpr = opts.maxDpr ?? 1.5;

    this.pointProg = program(gl, POINT_VERT, FRAG_SRC);
    this.trailProg = program(gl, TRAIL_VERT, FRAG_SRC);
    for (const n of UNIFORMS) {
      this.pointU[n] = gl.getUniformLocation(this.pointProg, n);
      this.trailU[n] = gl.getUniformLocation(this.trailProg, n);
    }
    this.slots = [this.createSlot(), this.createSlot()];
    this.morphVao = gl.createVertexArray()!;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // Screen blend: src + dst * (1 - src). Order independent, no depth sort, no accumulation buffer.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    gl.clearColor(0, 0, 0, 1);
  }

  private createSlot(): Slot {
    const gl = this.gl;
    const slot: Slot = {
      vbo: gl.createBuffer()!,
      vaoPoints: gl.createVertexArray()!,
      vaoTrails: gl.createVertexArray()!,
      count: 0,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.vbo);
    gl.bindVertexArray(slot.vaoPoints);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 16, 12);
    // Trail lines read every 2nd particle as instances
    gl.bindVertexArray(slot.vaoTrails);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16 * TRAIL_STRIDE, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 16 * TRAIL_STRIDE, 12);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    return slot;
  }

  private upload(slot: Slot, s: LiteSample): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, s.buffer, gl.STATIC_DRAW);
    slot.count = s.count;
  }

  /** Show this picture at once, no morph. */
  setSample(s: LiteSample): void {
    this.upload(this.slots[this.cur], s);
    this.sample = s;
    this.drawn = s.count;
    this.morphing = false;
    this.relayout();
  }

  /**
   * Morph from the picture on screen into this one. Particle i goes from its place in the old picture
   * to its place in the new one, with a short per-particle delay (the studio's morph, same rule).
   */
  transitionTo(s: LiteSample): void {
    const gl = this.gl;
    this.morphFrom = this.cur;
    this.cur = 1 - this.cur;
    this.upload(this.slots[this.cur], s);
    this.sample = s;
    this.drawn = s.count;
    this.morphCount = Math.min(this.slots[this.morphFrom].count, s.count);

    // Attributes 0-1 read the old picture, 2-3 the new one, both from the same index
    const from = this.slots[this.morphFrom];
    const to = this.slots[this.cur];
    gl.bindVertexArray(this.morphVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, from.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 16, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, to.vbo);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 16, 12);
    gl.bindVertexArray(null);

    this.morphing = true;
    this.morphT = 0;
    this.relayout();
  }

  setParams(p: Partial<LiteParams>): void {
    this.params = { ...this.params, ...p, fx: { ...this.params.fx, ...(p.fx ?? {}) } };
  }

  setLayout(l: Partial<LiteLayout>): void {
    this.layout = { ...this.layout, ...l };
    this.relayout();
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.applySize();
  }

  /** Pointer in CSS px relative to the canvas, or null when it leaves. */
  setPointer(x: number | null, y: number | null): void {
    if (x === null || y === null) {
      this.ptr.targetOn = 0;
      this.lookTarget.x = 0;
      this.lookTarget.y = 0;
      return;
    }
    const [wx, wy] = this.toWorld(x, y);
    this.ptr.x = wx;
    this.ptr.y = wy;
    this.ptr.targetOn = 1;
    this.lookTarget.x = (x / this.cssW - 0.5) * 2;
    this.lookTarget.y = -(y / this.cssH - 0.5) * 2;
  }

  /** Click: the burst and the scan both start here. */
  burst(x: number, y: number): void {
    [this.burstX, this.burstY] = this.toWorld(x, y);
    this.burstAge = 0;
    [this.clickX, this.clickY] = [this.burstX, this.burstY];
    this.clickT = this.time;
  }

  private toWorld(x: number, y: number): [number, number] {
    const wx = ((x - this.cssW / 2) * this.dpr - this.offX) / this.scale;
    const wy = (-(y - this.cssH / 2) * this.dpr - this.offY) / this.scale;
    return [wx, wy];
  }

  private applySize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * (this.level >= 2 ? 0.75 : 1);
    this.dpr = Math.max(1, this.dpr);
    const w = Math.round(this.cssW * this.dpr);
    const h = Math.round(this.cssH * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.relayout();
  }

  private relayout(): void {
    const s = this.sample;
    if (!s) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const fitH = this.layout.fit === 'cover' ? Math.max(H, W / s.aspect) : Math.min(H, W / s.aspect);
    const imgH = fitH * this.layout.zoom;
    this.scale = imgH; // world height is 1
    const imgW = imgH * s.aspect;
    this.offX = this.layout.alignX * Math.max(0, (W - imgW) / 2);
    this.offY = this.layout.alignY * Math.max(0, (H - imgH) / 2);
  }

  /** Dots per pixel over the subject, from the current draw count and layout. */
  private cover(pointPx: number): number {
    const s = this.sample!;
    const area = this.scale * this.scale * s.aspect * s.subjectFraction;
    return (this.drawn * pointPx * pointPx) / Math.max(area, 1);
  }

  frame(dtSec: number): void {
    const gl = this.gl;
    const s = this.sample;
    if (!s) return;

    // Clamp both ends: a frame timestamp earlier than the last one gives a negative step, which made the smoothing diverge
    const dt = Math.max(0, Math.min(dtSec, 0.05));
    this.time += dt;
    this.burstAge = Math.min(BURST_LIFE, this.burstAge + dt);
    const k = 1 - Math.exp(-dt * 5);
    this.ptr.on += (this.ptr.targetOn - this.ptr.on) * k;
    // Pointer velocity for OLD track: smoothed, in world units per second
    const dtp = Math.max(dt, 1e-3);
    this.ptrVel.x += ((this.ptr.x - this.prevPtr.x) / dtp - this.ptrVel.x) * k;
    this.ptrVel.y += ((this.ptr.y - this.prevPtr.y) / dtp - this.ptrVel.y) * k;
    this.prevPtr.x = this.ptr.x;
    this.prevPtr.y = this.ptr.y;
    if (this.morphing) {
      this.morphT += dt / MORPH_S;
      if (this.morphT >= 1) this.morphing = false;
    }
    const t = this.time;
    const p = this.params;

    // PAN: cursor tilt scaled by the amount. CURSOR style tilts; ORBIT style turns the picture further.
    // Cursor turn: at the edge of the stage the picture turns by about 26 degrees at amount 0.5
    const tgtX = this.lookTarget.x * p.pan * 0.9;
    const tgtY = this.lookTarget.y * p.pan * 0.5;
    this.look.x += (tgtX - this.look.x) * k;
    this.look.y += (tgtY - this.look.y) * k;
    // Idle sway is separate and always on
    const sw = p.sway;
    this.sway.x = (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.11 + 1.3) * 0.4) * sw;
    this.sway.y = (Math.sin(t * 0.17 + 0.6) * 0.6 + Math.sin(t * 0.09) * 0.4) * sw * 0.6;
    // FLOAT: the whole picture hovers up and down, slowly
    const floatY = p.floatOn ? (Math.sin(t * 0.7) * 0.012 + Math.sin(t * 0.37 + 1) * 0.006) * this.scale : 0;

    const base = Math.max(1, Math.round(this.dpr));
    const pointPx = base; // fine grain: one device pixel per point (studio dots are this size)
    const dirLen = 0.45 + 0.55 * p.length;
    const dx = Math.cos(p.angle) * dirLen;
    const dy = Math.sin(p.angle) * dirLen;
    const burstW = (1 - this.burstAge / BURST_LIFE) * p.burst;
    const light = p.light ?? [0, 0, 0];
    const fx = p.fx;
    const hue = (fx.hue * Math.PI) / 180;
    // SCAN starts where the user clicked and restarts its sweep there
    const scanPhase = ((t - this.clickT) * SCAN_RATE) % 1;
    const scanOn = p.scan && p.scanMode !== 5; // BURST is the click shock, not a band
    const velX = Math.max(-2, Math.min(2, this.ptrVel.x));
    const velY = Math.max(-2, Math.min(2, this.ptrVel.y));

    gl.clear(gl.COLOR_BUFFER_BIT);

    const setU = (U: Record<string, WebGLUniformLocation | null>, role: number, morph: number, cover: number) => {
      gl.uniform2f(U.uView, this.canvas.width, this.canvas.height);
      gl.uniform1f(U.uScale, this.scale);
      gl.uniform2f(U.uOffset, this.offX, this.offY + floatY);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uDrift, p.drift);
      gl.uniform1f(U.uDepth, p.depth);
      gl.uniform1f(U.uSpeed, p.speed);
      gl.uniform2f(U.uDir, dx, dy);
      gl.uniform1f(U.uLean, p.lean);
      gl.uniform1f(U.uHalfW, s.aspect / 2);
      gl.uniform1f(U.uRandom, p.randomness);
      gl.uniform1f(U.uTrailSize, p.trailSize);
      gl.uniform1f(U.uTrailAngle, (p.trailAngle * Math.PI) / 180);
      gl.uniform1f(U.uDim, p.dim);
      gl.uniform1f(U.uPSat, p.pSat);
      gl.uniform2f(U.uLook, this.look.x, this.look.y);
      gl.uniform2f(U.uSway, this.sway.x, this.sway.y);
      gl.uniform2f(U.uPtr, this.ptr.x, this.ptr.y);
      gl.uniform1f(U.uPtrOn, p.track ? this.ptr.on : 0);
      gl.uniform2f(U.uPtrVel, velX, velY);
      gl.uniform1f(U.uTrackOld, p.trackOld ? 1 : 0);
      gl.uniform4f(U.uBurst, this.burstX, this.burstY, this.burstAge, burstW);
      gl.uniform1f(U.uCover, cover);
      gl.uniform1f(U.uPointPx, pointPx);
      gl.uniform1f(U.uBright, p.brightness);
      gl.uniform1f(U.uTrailLen, 0.12 * p.trailLength);
      gl.uniform1f(U.uTrailGain, p.trailStrength);
      gl.uniform1f(U.uTrailAmount, p.trailAmount);
      gl.uniform1f(U.uTrailDetail, p.trailDetail);
      gl.uniform3f(U.uLightCol, light[0], light[1], light[2]);
      gl.uniform1f(U.uLightOn, p.light ? 1 : 0);
      gl.uniform1f(U.uScanOn, scanOn ? 1 : 0);
      gl.uniform1f(U.uScan, scanPhase);
      gl.uniform1f(U.uScanMode, p.scanMode);
      gl.uniform2f(U.uScanCenter, this.clickX, this.clickY);
      gl.uniform1f(U.uZScale, p.depth * 0.275);
      gl.uniform1f(U.uOpacity, p.opacity);
      gl.uniform1f(U.uMorph, morph);
      gl.uniform1f(U.uRole, role);
      gl.uniform1f(U.uScanLevel, p.scanLevel);
      gl.uniform4f(U.uFx1, fx.black, fx.white, fx.gamma, fx.contrast);
      gl.uniform2f(U.uFx2, hue, fx.saturation);
      gl.uniform1f(U.uBW, p.bw ? 1 : 0);
    };

    const cover = this.cover(pointPx);
    gl.useProgram(this.pointProg);
    if (this.morphing) {
      setU(this.pointU, 3, this.morphT, cover);
      gl.bindVertexArray(this.morphVao);
      gl.drawArrays(gl.POINTS, 0, Math.min(this.morphCount, this.drawn));
    } else {
      setU(this.pointU, 0, 0, cover);
      gl.bindVertexArray(this.slots[this.cur].vaoPoints);
      gl.drawArrays(gl.POINTS, 0, this.drawn);
    }

    // Trails are not drawn during the morph; they come back when it ends
    if (!this.morphing && p.trails && this.trailsAllowed && p.drift > 0.02) {
      gl.useProgram(this.trailProg);
      setU(this.trailU, 0, 0, cover);
      gl.bindVertexArray(this.slots[this.cur].vaoTrails);
      gl.drawArraysInstanced(gl.LINES, 0, 2, Math.floor(this.drawn / TRAIL_STRIDE));
    }
    gl.bindVertexArray(null);

    this.adapt(dtSec * 1000);
  }

  /**
   * Quality ladder, one step down whenever frames stay slow:
   *   1. trails off   2. render scale x0.75   3+. draw 25% fewer particles (down to a floor)
   * It never climbs back, so it cannot oscillate. Hidden-tab hiccups are ignored (dt is clamped by host).
   */
  private adapt(ms: number): void {
    if (ms > 100) return; // tab switch or first-frame compile, not sustained load
    this.ema += (ms - this.ema) * 0.08;
    this.slow = this.ema > 21 ? this.slow + 1 : Math.max(0, this.slow - 2);
    if (this.slow < 45) return;
    this.slow = 0;
    this.ema = 16;
    const s = this.sample;
    if (!s) return;
    if (this.level === 0) {
      this.trailsAllowed = false;
    } else if (this.level === 1) {
      this.level = 2; // applySize reads the level for its render scale
      this.applySize();
      this.onQuality?.({ drawn: this.drawn, dpr: this.dpr, trails: this.trailsAllowed });
      return;
    } else {
      if (this.drawn <= MIN_DRAWN) return;
      this.drawn = Math.max(MIN_DRAWN, Math.floor(this.drawn * 0.75));
    }
    this.level++;
    this.onQuality?.({ drawn: this.drawn, dpr: this.dpr, trails: this.trailsAllowed });
  }

  /** Test hook: jump straight to a lower quality step. */
  forceDrawn(n: number): void {
    if (this.sample) this.drawn = Math.min(this.sample.count, Math.max(1000, n));
  }

  dispose(): void {
    const gl = this.gl;
    for (const slot of this.slots) {
      gl.deleteBuffer(slot.vbo);
      gl.deleteVertexArray(slot.vaoPoints);
      gl.deleteVertexArray(slot.vaoTrails);
    }
    gl.deleteVertexArray(this.morphVao);
    gl.deleteProgram(this.pointProg);
    gl.deleteProgram(this.trailProg);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
