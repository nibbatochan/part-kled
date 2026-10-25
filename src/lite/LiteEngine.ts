// src/lite/LiteEngine.ts
// Raw WebGL2, no three.js, no framebuffers. Two draw calls per frame: points, then optional trail lines.
import { FRAG_SRC, POINT_VERT, TRAIL_VERT } from './shaders';
import type { LiteSample } from './sample';

export interface LiteParams {
  drift: number;        // 0..1 how many particles drift and how far
  angle: number;        // radians, counter-clockwise from +x
  length: number;       // 0.25..1 drift strength
  depth: number;        // 0..1 parallax
  speed: number;        // 1 = default
  sway: number;         // 0..1 idle camera drift
  trails: boolean;
  trailLength: number;  // 0.3..2
  trailStrength: number;// 0..2
  brightness: number;   // 1 = as the source
}

export const liteDefaults: LiteParams = {
  drift: 0.75,
  angle: 0.2,
  length: 0.9,
  depth: 0.5,
  speed: 1,
  sway: 0.6,
  trails: true,
  trailLength: 1,
  trailStrength: 1,
  brightness: 1,
};

export interface LiteLayout {
  fit: 'contain' | 'cover';
  /** -1 left, 0 centre, 1 right */
  alignX: number;
  alignY: number;
}

const TRAIL_STRIDE = 3;
const MIN_DRAWN = 40000;

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

export class LiteEngine {
  readonly gl: WebGL2RenderingContext;
  params: LiteParams = { ...liteDefaults };
  layout: LiteLayout = { fit: 'contain', alignX: 0, alignY: 0 };

  private canvas: HTMLCanvasElement;
  private pointProg: WebGLProgram;
  private trailProg: WebGLProgram;
  private pointU: Record<string, WebGLUniformLocation | null> = {};
  private trailU: Record<string, WebGLUniformLocation | null> = {};
  private vbo: WebGLBuffer;
  private vaoPoints: WebGLVertexArrayObject;
  private vaoTrails: WebGLVertexArrayObject;

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
  private look = { x: 0, y: 0 };
  private lookTarget = { x: 0, y: 0 };

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
    const names = [
      'uView', 'uScale', 'uOffset', 'uTime', 'uDrift', 'uDepth', 'uSpeed', 'uDir', 'uLook', 'uPtr',
      'uPtrOn', 'uCover', 'uPointPx', 'uBright', 'uTrailLen', 'uTrailGain',
    ];
    for (const n of names) {
      this.pointU[n] = gl.getUniformLocation(this.pointProg, n);
      this.trailU[n] = gl.getUniformLocation(this.trailProg, n);
    }

    this.vbo = gl.createBuffer()!;
    this.vaoPoints = gl.createVertexArray()!;
    this.vaoTrails = gl.createVertexArray()!;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // Screen blend: src + dst * (1 - src). Order independent, no depth sort, no accumulation buffer.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    gl.clearColor(0, 0, 0, 1);
  }

  setSample(s: LiteSample): void {
    const gl = this.gl;
    this.sample = s;
    this.drawn = s.count;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, s.buffer, gl.STATIC_DRAW);

    gl.bindVertexArray(this.vaoPoints);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 16, 12);

    // Trail lines read every 3rd particle as instances
    gl.bindVertexArray(this.vaoTrails);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16 * TRAIL_STRIDE, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 16 * TRAIL_STRIDE, 12);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);

    this.relayout();
  }

  setParams(p: Partial<LiteParams>): void {
    this.params = { ...this.params, ...p };
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
    const wx = ((x - this.cssW / 2) * this.dpr - this.offX) / this.scale;
    const wy = (-(y - this.cssH / 2) * this.dpr - this.offY) / this.scale;
    this.ptr.x = wx;
    this.ptr.y = wy;
    this.ptr.targetOn = 1;
    this.lookTarget.x = (x / this.cssW - 0.5) * 2;
    this.lookTarget.y = -(y / this.cssH - 0.5) * 2;
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
    const imgH = this.layout.fit === 'cover' ? Math.max(H, W / s.aspect) : Math.min(H, W / s.aspect);
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

    const dt = Math.min(dtSec, 0.05);
    this.time += dt;
    const k = 1 - Math.exp(-dt * 5);
    this.ptr.on += (this.ptr.targetOn - this.ptr.on) * k;
    const t = this.time;
    const sw = this.params.sway;
    const idleX = (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.11 + 1.3) * 0.4) * sw;
    const idleY = (Math.sin(t * 0.17 + 0.6) * 0.6 + Math.sin(t * 0.09) * 0.4) * sw * 0.6;
    this.look.x += (this.lookTarget.x * 0.6 + idleX - this.look.x) * k;
    this.look.y += (this.lookTarget.y * 0.6 + idleY - this.look.y) * k;

    const p = this.params;
    // Whole pixels only: the rasteriser rounds point sizes, and the brightness maths must see the real size
    const pointPx = Math.max(2, Math.round(1.5 * this.dpr));
    const dirLen = 0.45 + 0.55 * p.length;
    const dx = Math.cos(p.angle) * dirLen;
    const dy = Math.sin(p.angle) * dirLen;

    gl.clear(gl.COLOR_BUFFER_BIT);

    const setU = (U: Record<string, WebGLUniformLocation | null>) => {
      gl.uniform2f(U.uView, this.canvas.width, this.canvas.height);
      gl.uniform1f(U.uScale, this.scale);
      gl.uniform2f(U.uOffset, this.offX, this.offY);
      gl.uniform1f(U.uTime, t);
      gl.uniform1f(U.uDrift, p.drift);
      gl.uniform1f(U.uDepth, p.depth);
      gl.uniform1f(U.uSpeed, p.speed);
      gl.uniform2f(U.uDir, dx, dy);
      gl.uniform2f(U.uLook, this.look.x, this.look.y);
      gl.uniform2f(U.uPtr, this.ptr.x, this.ptr.y);
      gl.uniform1f(U.uPtrOn, this.ptr.on);
      gl.uniform1f(U.uCover, this.cover(pointPx));
      gl.uniform1f(U.uPointPx, pointPx);
      gl.uniform1f(U.uBright, p.brightness);
      gl.uniform1f(U.uTrailLen, 0.10 * p.trailLength);
      gl.uniform1f(U.uTrailGain, p.trailStrength);
    };

    gl.useProgram(this.pointProg);
    setU(this.pointU);
    gl.bindVertexArray(this.vaoPoints);
    gl.drawArrays(gl.POINTS, 0, this.drawn);

    if (p.trails && this.trailsAllowed && p.drift > 0.02) {
      gl.useProgram(this.trailProg);
      setU(this.trailU);
      gl.bindVertexArray(this.vaoTrails);
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
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vaoPoints);
    gl.deleteVertexArray(this.vaoTrails);
    gl.deleteProgram(this.pointProg);
    gl.deleteProgram(this.trailProg);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
