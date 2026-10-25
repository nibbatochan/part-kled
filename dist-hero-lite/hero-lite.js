var tt = Object.defineProperty;
var et = (s, e, t) => e in s ? tt(s, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : s[e] = t;
var h = (s, e, t) => et(s, typeof e != "symbol" ? e + "" : e, t);
const G = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aHome;  // world x, y (height = 1), z depth -0.5..0.5
layout(location = 1) in vec4 aMeta;  // rgb colour, a = density gain / 5 (undoes importance-sampling bias)

uniform vec2 uView;       // drawing buffer size, px
uniform float uScale;     // px per world unit
uniform vec2 uOffset;     // px, picture centre relative to canvas centre (y up)
uniform float uTime;
uniform float uDrift;     // 0..1
uniform float uDepth;     // 0..1
uniform float uSpeed;     // 1 = default
uniform vec2 uDir;        // drift direction (unit) * strength factor
uniform vec2 uLook;       // parallax look, -1..1
uniform vec2 uPtr;        // pointer in world units
uniform float uPtrOn;
uniform float uCover;     // expected dots per pixel over the subject
uniform float uPointPx;
uniform float uBright;
uniform float uTrailLen;
uniform float uTrailGain;

out vec3 vCol;

uint hashu(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint id, uint salt) {
  return float(hashu(id * 747796405u + salt * 2891336453u)) * (1.0 / 4294967296.0);
}

// World position and opacity of one particle; sOff pulls it back along its own path (trail tails).
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec2 place(uint id, vec3 home, float light, float sOff, out float alpha, out float streaming) {
  float r0 = rnd(id, 1u);
  float r1 = rnd(id, 2u);
  float r2 = rnd(id, 3u);
  float r3 = rnd(id, 4u);

  // Bright parts of the picture shed more particles: light weighting
  float lw = 0.2 + 1.6 * light * light;
  float share = clamp((0.02 + 0.55 * uDrift) * lw * 0.5, 0.0, 0.5);
  bool streamer = r0 < share;

  vec2 pos = home.xy;
  alpha = 1.0;
  streaming = 0.0;

  if (streamer) {
    float cycle = (5.0 + 5.0 * r2) / max(uSpeed, 0.05);
    float age = fract(uTime / cycle + r1);
    float rest = 0.30;
    float s = clamp((age - rest) / (1.0 - rest) + sOff, 0.0, 1.0);
    float ease = pow(s, 1.4);

    float reach = (0.18 + 0.62 * uDrift) * (0.45 + 1.1 * r3);
    vec2 perp = vec2(-uDir.y, uDir.x);
    pos += uDir * reach * ease;
    pos += perp * sin(s * 5.0 + r2 * 6.2831) * 0.035 * uDrift * s * (0.5 + r3);

    alpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.35, 1.0, s));
    streaming = step(0.001, s);
  }

  // Tiny shimmer so the held picture is alive
  pos += 0.0015 * (0.3 + uDrift) * vec2(sin(uTime * 0.9 + r1 * 40.0), cos(uTime * 0.7 + r2 * 40.0));

  // Soft cursor push
  vec2 dq = pos - uPtr;
  float dl = length(dq);
  float f = uPtrOn * smoothstep(0.14, 0.0, dl);
  pos += dq / max(dl, 1e-4) * f * f * 0.03;

  // Depth parallax
  pos += uLook * home.z * 0.10 * uDepth;
  return pos;
}

vec4 toClip(vec2 world) {
  vec2 px = world * uScale + uOffset;
  return vec4(px / (uView * 0.5), 0.0, 1.0);
}
`, it = `
void main() {
  float alpha, streaming;
  vec2 w = place(uint(gl_VertexID), aHome, luma(aMeta.rgb), 0.0, alpha, streaming);
  gl_Position = toClip(w);
  gl_PointSize = streaming > 0.5 ? max(1.0, uPointPx) : uPointPx;

  // Screen blending k overlapping dots gives 1-(1-o)^k; pick o so the stack lands on the source colour
  vec3 c = clamp(aMeta.rgb * uBright, 0.0, 1.0);
  vec3 o = 1.0 - pow(1.0 - c, vec3(aMeta.a * 5.0 / max(uCover, 0.25)));
  vCol = o * alpha * (streaming > 0.5 ? 0.7 : 1.0);
}
`, st = `
void main() {
  // Instanced 2-vertex lines: vertex 0 is the head, vertex 1 is the tail further back along the path
  float alpha, streaming;
  bool tail = gl_VertexID == 1;
  vec2 w = place(uint(gl_InstanceID) * 3u, aHome, luma(aMeta.rgb), tail ? -uTrailLen : 0.0, alpha, streaming);
  if (streaming < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  gl_Position = toClip(w);
  vCol = tail ? vec3(0.0) : aMeta.rgb * alpha * 0.12 * uTrailGain;
}
`, ot = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`, nt = G + it, rt = G + st, Y = ot, j = {
  drift: 0.75,
  angle: 0.2,
  length: 0.9,
  depth: 0.5,
  speed: 1,
  sway: 0.6,
  trails: !0,
  trailLength: 1,
  trailStrength: 1,
  brightness: 1
}, V = 3, N = 4e4;
function W(s, e, t) {
  const i = s.createShader(e);
  if (s.shaderSource(i, t), s.compileShader(i), !s.getShaderParameter(i, s.COMPILE_STATUS)) {
    const o = s.getShaderInfoLog(i);
    throw s.deleteShader(i), new Error("lite shader: " + o);
  }
  return i;
}
function X(s, e, t) {
  const i = s.createProgram();
  if (s.attachShader(i, W(s, s.VERTEX_SHADER, e)), s.attachShader(i, W(s, s.FRAGMENT_SHADER, t)), s.linkProgram(i), !s.getProgramParameter(i, s.LINK_STATUS)) throw new Error("lite link: " + s.getProgramInfoLog(i));
  return i;
}
class at {
  constructor(e, t = {}) {
    h(this, "gl");
    h(this, "params", { ...j });
    h(this, "layout", { fit: "contain", alignX: 0, alignY: 0 });
    h(this, "canvas");
    h(this, "pointProg");
    h(this, "trailProg");
    h(this, "pointU", {});
    h(this, "trailU", {});
    h(this, "vbo");
    h(this, "vaoPoints");
    h(this, "vaoTrails");
    h(this, "sample", null);
    h(this, "drawn", 0);
    h(this, "maxDpr");
    h(this, "dpr", 1);
    h(this, "cssW", 1);
    h(this, "cssH", 1);
    h(this, "scale", 1);
    h(this, "offX", 0);
    h(this, "offY", 0);
    h(this, "time", 0);
    h(this, "ptr", { x: 0, y: 0, on: 0, targetOn: 0 });
    h(this, "look", { x: 0, y: 0 });
    h(this, "lookTarget", { x: 0, y: 0 });
    // adaptive quality
    h(this, "ema", 16);
    h(this, "slow", 0);
    h(this, "level", 0);
    /** Set by the host to react to quality steps (for logging or tests). */
    h(this, "onQuality");
    h(this, "trailsAllowed", !0);
    const i = e.getContext("webgl2", {
      alpha: !1,
      antialias: !1,
      depth: !1,
      stencil: !1,
      powerPreference: "high-performance",
      preserveDrawingBuffer: !1
    });
    if (!i) throw new Error("WebGL2 unavailable");
    this.gl = i, this.canvas = e, this.maxDpr = t.maxDpr ?? 1.5, this.pointProg = X(i, nt, Y), this.trailProg = X(i, rt, Y);
    const o = [
      "uView",
      "uScale",
      "uOffset",
      "uTime",
      "uDrift",
      "uDepth",
      "uSpeed",
      "uDir",
      "uLook",
      "uPtr",
      "uPtrOn",
      "uCover",
      "uPointPx",
      "uBright",
      "uTrailLen",
      "uTrailGain"
    ];
    for (const n of o)
      this.pointU[n] = i.getUniformLocation(this.pointProg, n), this.trailU[n] = i.getUniformLocation(this.trailProg, n);
    this.vbo = i.createBuffer(), this.vaoPoints = i.createVertexArray(), this.vaoTrails = i.createVertexArray(), i.disable(i.DEPTH_TEST), i.disable(i.CULL_FACE), i.enable(i.BLEND), i.blendFunc(i.ONE, i.ONE_MINUS_SRC_COLOR), i.clearColor(0, 0, 0, 1);
  }
  setSample(e) {
    const t = this.gl;
    this.sample = e, this.drawn = e.count, t.bindBuffer(t.ARRAY_BUFFER, this.vbo), t.bufferData(t.ARRAY_BUFFER, e.buffer, t.STATIC_DRAW), t.bindVertexArray(this.vaoPoints), t.enableVertexAttribArray(0), t.vertexAttribPointer(0, 3, t.FLOAT, !1, 16, 0), t.enableVertexAttribArray(1), t.vertexAttribPointer(1, 4, t.UNSIGNED_BYTE, !0, 16, 12), t.bindVertexArray(this.vaoTrails), t.enableVertexAttribArray(0), t.vertexAttribPointer(0, 3, t.FLOAT, !1, 16 * V, 0), t.vertexAttribDivisor(0, 1), t.enableVertexAttribArray(1), t.vertexAttribPointer(1, 4, t.UNSIGNED_BYTE, !0, 16 * V, 12), t.vertexAttribDivisor(1, 1), t.bindVertexArray(null), this.relayout();
  }
  setParams(e) {
    this.params = { ...this.params, ...e };
  }
  setLayout(e) {
    this.layout = { ...this.layout, ...e }, this.relayout();
  }
  resize(e, t) {
    this.cssW = Math.max(1, e), this.cssH = Math.max(1, t), this.applySize();
  }
  /** Pointer in CSS px relative to the canvas, or null when it leaves. */
  setPointer(e, t) {
    if (e === null || t === null) {
      this.ptr.targetOn = 0, this.lookTarget.x = 0, this.lookTarget.y = 0;
      return;
    }
    const i = ((e - this.cssW / 2) * this.dpr - this.offX) / this.scale, o = (-(t - this.cssH / 2) * this.dpr - this.offY) / this.scale;
    this.ptr.x = i, this.ptr.y = o, this.ptr.targetOn = 1, this.lookTarget.x = (e / this.cssW - 0.5) * 2, this.lookTarget.y = -(t / this.cssH - 0.5) * 2;
  }
  applySize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * (this.level >= 2 ? 0.75 : 1), this.dpr = Math.max(1, this.dpr);
    const e = Math.round(this.cssW * this.dpr), t = Math.round(this.cssH * this.dpr);
    (this.canvas.width !== e || this.canvas.height !== t) && (this.canvas.width = e, this.canvas.height = t), this.gl.viewport(0, 0, e, t), this.relayout();
  }
  relayout() {
    const e = this.sample;
    if (!e) return;
    const t = this.canvas.width, i = this.canvas.height, o = this.layout.fit === "cover" ? Math.max(i, t / e.aspect) : Math.min(i, t / e.aspect);
    this.scale = o;
    const n = o * e.aspect;
    this.offX = this.layout.alignX * Math.max(0, (t - n) / 2), this.offY = this.layout.alignY * Math.max(0, (i - o) / 2);
  }
  /** Dots per pixel over the subject, from the current draw count and layout. */
  cover(e) {
    const t = this.sample, i = this.scale * this.scale * t.aspect * t.subjectFraction;
    return this.drawn * e * e / Math.max(i, 1);
  }
  frame(e) {
    const t = this.gl;
    if (!this.sample) return;
    const o = Math.min(e, 0.05);
    this.time += o;
    const n = 1 - Math.exp(-o * 5);
    this.ptr.on += (this.ptr.targetOn - this.ptr.on) * n;
    const a = this.time, c = this.params.sway, v = (Math.sin(a * 0.23) * 0.6 + Math.sin(a * 0.11 + 1.3) * 0.4) * c, g = (Math.sin(a * 0.17 + 0.6) * 0.6 + Math.sin(a * 0.09) * 0.4) * c * 0.6;
    this.look.x += (this.lookTarget.x * 0.6 + v - this.look.x) * n, this.look.y += (this.lookTarget.y * 0.6 + g - this.look.y) * n;
    const m = this.params, w = Math.max(1, Math.round(this.dpr)), M = this.cover(w) >= 1.3 ? w : w * 2, l = 0.45 + 0.55 * m.length, x = Math.cos(m.angle) * l, f = Math.sin(m.angle) * l;
    t.clear(t.COLOR_BUFFER_BIT);
    const b = (p) => {
      t.uniform2f(p.uView, this.canvas.width, this.canvas.height), t.uniform1f(p.uScale, this.scale), t.uniform2f(p.uOffset, this.offX, this.offY), t.uniform1f(p.uTime, a), t.uniform1f(p.uDrift, m.drift), t.uniform1f(p.uDepth, m.depth), t.uniform1f(p.uSpeed, m.speed), t.uniform2f(p.uDir, x, f), t.uniform2f(p.uLook, this.look.x, this.look.y), t.uniform2f(p.uPtr, this.ptr.x, this.ptr.y), t.uniform1f(p.uPtrOn, this.ptr.on), t.uniform1f(p.uCover, this.cover(M)), t.uniform1f(p.uPointPx, M), t.uniform1f(p.uBright, m.brightness), t.uniform1f(p.uTrailLen, 0.08 * m.trailLength), t.uniform1f(p.uTrailGain, m.trailStrength);
    };
    t.useProgram(this.pointProg), b(this.pointU), t.bindVertexArray(this.vaoPoints), t.drawArrays(t.POINTS, 0, this.drawn), m.trails && this.trailsAllowed && m.drift > 0.02 && (t.useProgram(this.trailProg), b(this.trailU), t.bindVertexArray(this.vaoTrails), t.drawArraysInstanced(t.LINES, 0, 2, Math.floor(this.drawn / V))), t.bindVertexArray(null), this.adapt(e * 1e3);
  }
  /**
   * Quality ladder, one step down whenever frames stay slow:
   *   1. trails off   2. render scale x0.75   3+. draw 25% fewer particles (down to a floor)
   * It never climbs back, so it cannot oscillate. Hidden-tab hiccups are ignored (dt is clamped by host).
   */
  adapt(e) {
    if (!(e > 100 || (this.ema += (e - this.ema) * 0.08, this.slow = this.ema > 21 ? this.slow + 1 : Math.max(0, this.slow - 2), this.slow < 45) || (this.slow = 0, this.ema = 16, !this.sample))) {
      if (this.level === 0)
        this.trailsAllowed = !1;
      else if (this.level === 1) {
        this.level = 2, this.applySize(), this.onQuality?.({ drawn: this.drawn, dpr: this.dpr, trails: this.trailsAllowed });
        return;
      } else {
        if (this.drawn <= N) return;
        this.drawn = Math.max(N, Math.floor(this.drawn * 0.75));
      }
      this.level++, this.onQuality?.({ drawn: this.drawn, dpr: this.dpr, trails: this.trailsAllowed });
    }
  }
  /** Test hook: jump straight to a lower quality step. */
  forceDrawn(e) {
    this.sample && (this.drawn = Math.min(this.sample.count, Math.max(1e3, e)));
  }
  dispose() {
    const e = this.gl;
    e.deleteBuffer(this.vbo), e.deleteVertexArray(this.vaoPoints), e.deleteVertexArray(this.vaoTrails), e.deleteProgram(this.pointProg), e.deleteProgram(this.trailProg), e.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
function H(s, e) {
  let t = (Math.imul(s + 1, 2654435761) ^ Math.imul(e + 1, 2246822507)) >>> 0;
  return t = Math.imul(t ^ t >>> 16, 2246822507) >>> 0, t = Math.imul(t ^ t >>> 13, 3266489909) >>> 0, t = (t ^ t >>> 16) >>> 0, t / 4294967296;
}
function lt(s, e) {
  let t = 0, i = s.length - 1;
  for (; t < i; ) {
    const o = t + i >>> 1;
    s[o] < e ? t = o + 1 : i = o;
  }
  return t;
}
function ht(s, e, t) {
  const i = e * t;
  let o = 0, n = 0, a = 0, c = 0;
  const v = (r, d, u) => {
    const A = (d * e + r) * 4;
    u(s[A], s[A + 1], s[A + 2]);
  }, g = [];
  for (let r = 0; r < e; r += 2)
    g.push([r, 0], [r, t - 1]);
  for (let r = 0; r < t; r += 2)
    g.push([0, r], [e - 1, r]);
  for (const [r, d] of g)
    v(r, d, (u, A, y) => {
      o += u, n += A, a += y, c++;
    });
  o /= c, n /= c, a /= c;
  let m = 0;
  for (const [r, d] of g)
    v(r, d, (u, A, y) => {
      m += Math.hypot(u - o, A - n, y - a);
    });
  if (m /= c, m > 22) return null;
  const w = 46 + m * 2, M = (r) => Math.hypot(s[r * 4] - o, s[r * 4 + 1] - n, s[r * 4 + 2] - a) < w, l = new Uint8Array(i).fill(1), x = [], f = (r, d) => {
    const u = d * e + r;
    l[u] === 1 && M(u) && (l[u] = 0, x.push(u));
  };
  for (let r = 0; r < e; r++)
    f(r, 0), f(r, t - 1);
  for (let r = 0; r < t; r++)
    f(0, r), f(e - 1, r);
  for (; x.length; ) {
    const r = x.pop(), d = r % e, u = r / e | 0;
    d > 0 && f(d - 1, u), d < e - 1 && f(d + 1, u), u > 0 && f(d, u - 1), u < t - 1 && f(d, u + 1);
  }
  let b = 0;
  for (let r = 0; r < i; r++) b += l[r];
  if (b < i * 0.01 || b > i * 0.995) return null;
  const p = l.slice();
  for (let r = 1; r < t - 1; r++)
    for (let d = 1; d < e - 1; d++) {
      const u = r * e + d;
      l[u] === 1 && (l[u - 1] === 0 || l[u + 1] === 0 || l[u - e] === 0 || l[u + e] === 0) && (M(u) || Math.hypot(s[u * 4] - o, s[u * 4 + 1] - n, s[u * 4 + 2] - a) < w * 1.6) && (p[u] = 0);
    }
  return p;
}
function ct(s, e, t, i) {
  const o = t * i, n = new Float32Array(o), a = new Float32Array(o), c = new Float32Array(o), v = new Float32Array(o);
  let g = 0, m = !1;
  for (let l = 0; l < o; l++)
    if (s[l * 4 + 3] < 240) {
      m = !0;
      break;
    }
  const w = m ? null : ht(s, t, i);
  for (let l = 0; l < o; l++) {
    const x = s[l * 4] / 255, f = s[l * 4 + 1] / 255, b = s[l * 4 + 2] / 255, p = s[l * 4 + 3] / 255, r = Math.max(x, f, b), d = Math.min(x, f, b);
    c[l] = r === 0 ? 0 : (r - d) / r, a[l] = 0.299 * x + 0.587 * f + 0.114 * b, m ? n[l] = p > 0.15 ? p : 0 : n[l] = w ? w[l] : 1, n[l] > 0 && g++;
  }
  for (let l = 0; l < i; l++)
    for (let x = 0; x < t; x++) {
      const f = l * t + x;
      if (n[f] <= 0) continue;
      let b = 0;
      if (x > 0 && x < t - 1 && l > 0 && l < i - 1) {
        const r = a[f + 1] - a[f - 1], d = a[f + t] - a[f - t];
        b = Math.min(1, Math.hypot(r, d) * 3);
      }
      const p = Math.pow(a[f], 1.2);
      v[f] = n[f] * (0.4 + 0.6 * b + 0.5 * p + 0.2 * c[f]);
    }
  let M = 0;
  for (let l = 0; l < o; l++) M += v[l];
  if (M <= 1e-4) {
    for (let l = 0; l < o; l++) v[l] = 1;
    g = o;
  }
  return { weights: v, mask: n, activeCount: g };
}
function ut(s) {
  const e = s.length, t = new Float32Array(e);
  let i = 0;
  for (let o = 0; o < e; o++)
    i += s[o], t[o] = i;
  return t;
}
const ft = 768;
function pt(s, e) {
  for (; e; ) [s, e] = [e, s % e];
  return s;
}
function dt(s, e, t) {
  const i = s.width, o = s.height, n = Math.min(1, ft / Math.max(i, o)), a = Math.max(2, Math.round(i * n)), c = Math.max(2, Math.round(o * n)), v = document.createElement("canvas");
  v.width = a, v.height = c;
  const g = v.getContext("2d", { willReadFrequently: !0 });
  g.drawImage(s, 0, 0, a, c);
  const m = g.getImageData(0, 0, a, c).data, w = new Float32Array(a * c);
  if (e) {
    g.clearRect(0, 0, a, c), g.drawImage(e, 0, 0, a, c);
    const y = g.getImageData(0, 0, a, c).data;
    for (let S = 0; S < w.length; S++) w[S] = y[S * 4] / 255;
  } else
    w.fill(0.5);
  const { weights: M, activeCount: l } = ct(m, w, a, c), x = ut(M), f = x[x.length - 1], b = f / Math.max(1, l), p = a / c;
  let r = Math.floor(t * 0.6180339887) | 1;
  for (; pt(r, t) !== 1; ) r += 2;
  const d = new ArrayBuffer(t * 16), u = new Float32Array(d), A = new Uint8Array(d);
  for (let y = 0; y < t; y++) {
    const q = (y * r % t + H(y, 1)) / t, R = lt(x, q * f), O = Math.max(0, Math.min(a - 1.001, R % a + H(y, 2))), _ = Math.max(0, Math.min(c - 1.001, Math.floor(R / a) + H(y, 3))), P = O | 0, E = _ | 0, T = O - P, C = _ - E, k = (D, B, $) => m[(B * a + D) * 4 + $], F = (D) => (k(P, E, D) * (1 - T) + k(P + 1, E, D) * T) * (1 - C) + (k(P, E + 1, D) * (1 - T) + k(P + 1, E + 1, D) * T) * C, L = (D, B) => w[B * a + D], U = (L(P, E) * (1 - T) + L(P + 1, E) * T) * (1 - C) + (L(P, E + 1) * (1 - T) + L(P + 1, E + 1) * T) * C, Q = F(0), K = F(1), J = F(2);
    u[y * 4] = (O / a - 0.5) * p, u[y * 4 + 1] = 0.5 - _ / c, u[y * 4 + 2] = U - 0.5;
    const I = y * 16 + 12;
    A[I] = Q, A[I + 1] = K, A[I + 2] = J;
    const Z = Math.min(5, Math.max(0.2, b / Math.max(1e-4, M[R])));
    A[I + 3] = Math.round(Z / 5 * 255);
  }
  return { buffer: d, count: t, aspect: p, subjectFraction: Math.max(0.05, l / (a * c)) };
}
function mt(s) {
  if (!s || typeof s != "object") return {};
  const e = s.params ?? s, t = {}, i = (o) => typeof o == "number" && isFinite(o) ? o : void 0;
  for (const o of ["drift", "angle", "length", "depth", "speed", "sway", "trailLength", "trailStrength", "brightness"]) {
    const n = i(e[o]);
    n !== void 0 && (t[o] = n);
  }
  if (typeof e.trails == "boolean" && (t.trails = e.trails), e.line) {
    const o = i(e.line.angle), n = i(e.line.length);
    o !== void 0 && (t.angle = o), n !== void 0 && (t.length = n);
  }
  if (e.trail) {
    const o = i(e.trail.length), n = i(e.trail.strength);
    o !== void 0 && (t.trailLength = o), n !== void 0 && (t.trailStrength = n);
  }
  return t;
}
function gt() {
  const s = navigator.hardwareConcurrency || 4, e = navigator.deviceMemory || 4;
  return window.innerWidth < 768 || s <= 4 || e <= 4 ? 2e5 : s >= 8 && e >= 8 && window.innerWidth >= 1280 ? 45e4 : 3e5;
}
function z(s) {
  return new Promise((e, t) => {
    const i = new Image();
    i.crossOrigin = "anonymous", i.decoding = "async", i.onload = () => e(i), i.onerror = () => t(new Error("image failed: " + s)), i.src = s;
  });
}
class vt {
  constructor(e, t) {
    h(this, "container");
    h(this, "canvas");
    h(this, "posterEl");
    h(this, "engine");
    h(this, "options");
    h(this, "destroyed", !1);
    h(this, "visible", !0);
    h(this, "raf", 0);
    h(this, "last", 0);
    h(this, "ro");
    h(this, "io");
    h(this, "cleanups", []);
    if (this.container = e, this.options = t, t.poster) {
      const o = document.createElement("img");
      o.src = t.poster, o.alt = t.alt || "Particle animation", o.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;pointer-events:none;transition:opacity 600ms ease", e.appendChild(o), this.posterEl = o;
    }
    if (this.canvas = document.createElement("canvas"), this.canvas.setAttribute("aria-hidden", "true"), this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2;opacity:0;transition:opacity 800ms ease", e.appendChild(this.canvas), window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.posterEl && (this.posterEl.style.opacity = "1");
      return;
    }
    const i = () => void this.init();
    "requestIdleCallback" in window ? window.requestIdleCallback(i, { timeout: 1200 }) : setTimeout(i, 80);
  }
  async init() {
    if (!this.destroyed)
      try {
        const e = this.options, [t, i, o] = await Promise.all([
          z(e.image),
          e.depth ? z(e.depth).catch(() => null) : Promise.resolve(null),
          typeof e.config == "string" ? fetch(e.config).then((g) => g.json()).catch(() => ({})) : Promise.resolve(e.config ?? {})
        ]);
        if (this.destroyed) return;
        const n = new at(this.canvas, { maxDpr: e.maxDpr });
        this.engine = n, n.setParams({ ...j, ...mt(o) }), n.setLayout({ fit: e.fit ?? "contain", alignX: e.alignX ?? 0, alignY: e.alignY ?? 0 });
        const a = typeof e.pointCount == "number" ? e.pointCount : gt();
        n.setSample(dt(t, i, a));
        const c = this.container.getBoundingClientRect();
        n.resize(c.width, c.height), this.bind(), this.canvas.style.opacity = "1", this.posterEl && setTimeout(() => this.posterEl && (this.posterEl.style.opacity = "0"), 400);
        const v = (g) => {
          if (!this.destroyed) {
            if (this.raf = requestAnimationFrame(v), !this.visible || document.hidden) {
              this.last = g;
              return;
            }
            n.frame(this.last ? (g - this.last) / 1e3 : 1 / 60), this.last = g;
          }
        };
        this.raf = requestAnimationFrame(v);
      } catch (e) {
        console.warn("particle-hero (lite) failed, keeping poster:", e), this.posterEl && (this.posterEl.style.opacity = "1"), this.canvas.remove();
      }
  }
  bind() {
    const e = this.engine, t = this.options.pointer === "element" ? this.container : window, i = (n) => {
      const a = n, c = this.canvas.getBoundingClientRect(), v = a.clientX >= c.left && a.clientX <= c.right && a.clientY >= c.top && a.clientY <= c.bottom;
      e.setPointer(v ? a.clientX - c.left : null, v ? a.clientY - c.top : null);
    };
    t.addEventListener("pointermove", i, { passive: !0 }), this.cleanups.push(() => t.removeEventListener("pointermove", i)), this.ro = new ResizeObserver(() => {
      const n = this.container.getBoundingClientRect();
      n.width > 0 && n.height > 0 && e.resize(n.width, n.height);
    }), this.ro.observe(this.container), this.options.pauseOffscreen !== !1 && (this.io = new IntersectionObserver((n) => {
      for (const a of n) this.visible = a.isIntersecting;
    }), this.io.observe(this.container));
    const o = (n) => {
      n.preventDefault(), cancelAnimationFrame(this.raf), this.posterEl && (this.posterEl.style.opacity = "1");
    };
    this.canvas.addEventListener("webglcontextlost", o), this.cleanups.push(() => this.canvas.removeEventListener("webglcontextlost", o));
  }
  /** Live tuning from the portfolio page (or from the studio's exported values). */
  setParams(e) {
    this.engine?.setParams(e);
  }
  /** Test and debugging access. */
  get debugEngine() {
    return this.engine;
  }
  destroy() {
    this.destroyed = !0, cancelAnimationFrame(this.raf), this.ro?.disconnect(), this.io?.disconnect(), this.cleanups.forEach((e) => e()), this.engine?.dispose(), this.canvas.remove(), this.posterEl?.remove();
  }
}
function xt(s, e) {
  return new vt(s, e);
}
class yt extends HTMLElement {
  constructor() {
    super(...arguments);
    h(this, "hero");
  }
  connectedCallback() {
    const t = this.getAttribute("src") || this.getAttribute("image") || "";
    if (!t) return;
    this.style.position = "relative", this.style.display = "block", this.style.width = this.style.width || "100%", this.style.height = this.style.height || "100%";
    const i = (o) => this.hasAttribute(o) ? Number(this.getAttribute(o)) : void 0;
    this.hero = xt(this, {
      image: t,
      depth: this.getAttribute("depth") || void 0,
      config: this.getAttribute("config") || void 0,
      poster: this.getAttribute("poster") || void 0,
      alt: this.getAttribute("alt") || void 0,
      fit: this.getAttribute("fit") || void 0,
      alignX: i("align-x"),
      alignY: i("align-y"),
      pointCount: i("points"),
      pointer: this.getAttribute("pointer") === "element" ? "element" : "window"
    });
  }
  disconnectedCallback() {
    this.hero?.destroy(), this.hero = void 0;
  }
}
typeof customElements < "u" && !customElements.get("particle-hero") && customElements.define("particle-hero", yt);
export {
  vt as HeroLite,
  gt as autoCount,
  xt as createHero,
  mt as toLiteParams
};
