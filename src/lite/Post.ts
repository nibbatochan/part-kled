// src/lite/Post.ts
import { BITMAP_GLSL } from './bitmapGlsl';
// LIGHT: bloom and halo. The scene is drawn into a texture; its bright parts are copied to a half-size
// texture, shrunk step by step (each step blurs, the last ones are very wide), and the soft copies are added
// back over the scene with a screen blend. Bloom is the tight glow (the two largest copies, set by RADIUS);
// halo is the wide, tinted glow (the two smallest copies, set by SIZE). Both read the same bright copy, cut at THRESHOLD.

export interface PostParams {
  bloomOn: boolean;
  haloOn: boolean;
  threshold: number;   // 0..1 brightness above which a pixel glows
  bloomAmount: number; // 0..1.5
  bloomRadius: number; // 0..1 tight (0) to wide (1)
  haloAmount: number;  // 0..1.5
  haloSize: number;    // 0..1 wide (0) to very wide (1)
  haloTint: [number, number, number];
  vhsOn: boolean;
  vhsAmount: number;   // 0..1 line wobble, tracking band and colour bleed
  vhsNoise: number;    // 0..1 tape noise and scan lines
  glitchOn: boolean;
  glitchAmount: number; // 0..1 how far the slices jump and how much the colours split
  glitchRate: number;   // 0..1 how often a burst happens
  glitchBeat: boolean;  // bursts on the beat of the music instead of on time
  grainOn: boolean;
  grainAmount: number;  // 0..1
  grainSize: number;    // 0..1 fine to coarse
  holoOn: boolean;
  holoAmount: number;   // 0..1 how much of the picture turns iridescent
  holoSpeed: number;    // 0..1 how fast the colours travel
  duoOn: boolean;
  duoAmount: number;    // 0..1
  duoShadow: [number, number, number];
  duoLight: [number, number, number];
  cloudOn: boolean;
  cloudAmount: number;  // 0..1
  cloudScale: number;   // 0..1 large to small clouds
  cloudTint: [number, number, number];
  meshOn: boolean;
  meshAmount: number;   // 0..1
  meshPalette: number;  // 0 AURORA, 1 SUNSET, 2 ICE
  stackOn: boolean;     // GRAPHIC: moving points joined by lines
  stackWords: boolean;  // a word tag at each point
  stackCount: number;   // 4..16 points
  stackWidth: number;   // line width, px
  stackColour: [number, number, number];
  glowPat: number;      // STACK glow: 0 off, 1 GLOW, 2 DOTS, 3 GRID, 4 SCAN, 5 HAZE
  glowPatAmt: number;   // 0..1.5 strength
  bitMode: number;      // BITMAP overlay: 0 OFF, 1 INK, 2 GRADE, 3 CGA, 4 STIPPLE
  bitAmount: number;    // 0..1 how much of the overlay replaces the picture
  bitCell: number;      // 1..12 px: the STIPPLE cell
  bitLevel: number;     // 0..1: INK threshold, STIPPLE density
  bitRamp: number;      // GRADE ramp: 0 DUSK, 1 ICE, 2 EMBER
  bitMid: number;       // 0.15..0.85 GRADE midpoint
  bitDither: number;    // 0..1 CGA dither
  bitSize: number;      // 0.3..1 INK noise width, STIPPLE dot size
}

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_PREFILTER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThr;
out vec4 o;
void main() {
  vec3 c = 0.25 * (texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb
                 + texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb);
  float l = max(max(c.r, c.g), c.b);
  float k = clamp((l - uThr) / max(1.0 - uThr, 0.001), 0.0, 1.0);
  o = vec4(c * k, 1.0);
}`;

// A 13-tap downsample: the centre, the four near corners and the four far corners, weighted. Soft, no shimmer.
const FRAG_DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 o;
void main() {
  vec2 t = uTexel;
  vec3 a = texture(uTex, vUv + t * vec2(-2.0, -2.0)).rgb, b = texture(uTex, vUv + t * vec2(0.0, -2.0)).rgb, c = texture(uTex, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 d = texture(uTex, vUv + t * vec2(-2.0, 0.0)).rgb, e = texture(uTex, vUv).rgb, f = texture(uTex, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture(uTex, vUv + t * vec2(-2.0, 2.0)).rgb, h = texture(uTex, vUv + t * vec2(0.0, 2.0)).rgb, i = texture(uTex, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 j = texture(uTex, vUv + t * vec2(-1.0, -1.0)).rgb, k = texture(uTex, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 l = texture(uTex, vUv + t * vec2(-1.0, 1.0)).rgb, m = texture(uTex, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  o = vec4(r, 1.0);
}`;

const FRAG_COMPOSE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uBit;     // BITMAP: mode, amount, cell px, level
uniform vec4 uBit2;    // BITMAP: ramp, midpoint, dither, size
uniform sampler2D uScene;${BITMAP_GLSL}
uniform sampler2D uL1;
uniform sampler2D uL2;
uniform sampler2D uL3;
uniform sampler2D uL4;
uniform vec3 uBloom;   // on, amount, radius
uniform vec3 uHalo;    // on, amount, size
uniform vec3 uTint;
uniform vec4 uVhs;     // on, distortion, noise, time
uniform vec4 uGl;      // on, amount, rate, on-beat (1) or on-time (0)
uniform vec2 uSig;     // beat 0..1, time
uniform vec2 uRes;
uniform vec3 uGrain;   // on, amount, size
uniform vec3 uHolo;    // on, amount, speed
uniform vec3 uDuo;     // on, amount
uniform vec3 uDuoA;
uniform vec3 uDuoB;
uniform vec3 uCloud;   // on, amount, scale
uniform vec3 uCloudT;
uniform vec3 uMesh;    // on, amount, palette
uniform vec4 uStack;   // on, points, line width px, words
uniform vec3 uStackCol;
uniform vec2 uGPat;    // STACK glow: pattern (0 off, 1 GLOW, 2 DOTS, 3 GRID, 4 SCAN, 5 HAZE), amount
uniform sampler2D uWords; // 16 word tags, 192 x 32 px each, stacked downward
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}
// GRAPHIC STACK: points wander on slow looping paths; each is joined to the next and to the third next
vec2 stackPt(int k, float t) {
  float fk = float(k);
  vec2 f = vec2(0.31 + 0.23 * hash(vec2(fk, 1.0)), 0.27 + 0.29 * hash(vec2(fk, 2.0)));
  vec2 ph = vec2(hash(vec2(fk, 3.0)), hash(vec2(fk, 4.0))) * 6.2831853;
  return 0.5 + 0.42 * vec2(sin(t * f.x * 0.6 + ph.x), cos(t * f.y * 0.6 + ph.y));
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}
vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }
vec3 meshCorner(int pal, int k) {
  if (pal == 0) return k == 0 ? vec3(0.17, 0.06, 0.33) : (k == 1 ? vec3(0.46, 0.59, 0.87) : (k == 2 ? vec3(0.96, 0.34, 0.42) : vec3(0.26, 0.91, 0.48)));
  if (pal == 1) return k == 0 ? vec3(1.0, 0.32, 0.18) : (k == 1 ? vec3(0.87, 0.14, 0.46) : (k == 2 ? vec3(0.10, 0.16, 0.42) : vec3(0.99, 0.73, 0.18)));
  return k == 0 ? vec3(0.06, 0.12, 0.15) : (k == 1 ? vec3(0.17, 0.33, 0.39) : (k == 2 ? vec3(0.56, 0.83, 0.96) : vec3(0.52, 0.98, 0.70)));
}
void main() {
  vec2 uv = vUv;
  float chroma = 0.0;
  float noiseAmt = 0.0;
  float tq = floor(uSig.y * 24.0);

  if (uVhs.x > 0.5) {
    // VHS: each tape line wobbles sideways, a band of tracking error crawls up the picture, colour bleeds
    float a = uVhs.y;
    float line = floor(vUv.y * uRes.y * 0.5);
    float jitter = (hash(vec2(line, tq)) - 0.5) * 0.014 * a;
    float wave = sin(vUv.y * 9.0 + uSig.y * 1.4) * 0.005 * a;
    float bandPos = fract(uSig.y * 0.07);
    float inBand = smoothstep(0.0, 0.03, vUv.y - bandPos) * (1.0 - smoothstep(0.03, 0.09, vUv.y - bandPos));
    uv.x += jitter + wave + inBand * (hash(vec2(line, tq + 3.0)) - 0.3) * 0.09 * a;
    chroma += 0.009 * a;
    noiseAmt = uVhs.z;
  }

  if (uGl.x > 0.5) {
    // GLITCH: slices of the picture jump sideways and the colours split, in bursts
    float seed = uGl.w > 0.5 ? floor(uSig.y * 30.0) : floor(uSig.y * (2.0 + 10.0 * uGl.z));
    float live = uGl.w > 0.5 ? step(0.35, uSig.x) : step(0.5, hash(vec2(seed, 3.7)));
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float y0 = hash(vec2(seed, fk + 1.0));
      float hh = 0.01 + 0.09 * hash(vec2(seed, fk + 9.0));
      if (vUv.y > y0 && vUv.y < y0 + hh) {
        uv.x += (hash(vec2(seed, fk + 17.0)) - 0.5) * 0.35 * uGl.y * live;
        chroma += 0.012 * uGl.y * live;
      }
    }
  }

  vec3 s = vec3(texture(uScene, uv + vec2(chroma, 0.0)).r, texture(uScene, uv).g, texture(uScene, uv - vec2(chroma, 0.0)).b);
  if (uVhs.x > 0.5) {
    float n = hash(vUv * uRes + tq);
    s += (n - 0.5) * 0.32 * noiseAmt;
    s *= 1.0 - 0.3 * noiseAmt * (0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159));
    s = clamp(s, 0.0, 1.0);
  }

  // SURFACE: the picture's colour treatment. Duotone first, then holographic sheen, mesh gradient, cloud haze, grain last.
  float t = uSig.y;
  if (uDuo.x > 0.5) {
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    s = mix(s, mix(uDuoA, uDuoB, smoothstep(0.0, 1.0, l)), uDuo.y);
  }
  if (uHolo.x > 0.5) {
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    float h = l * 1.2 + vUv.x * 0.8 - vUv.y * 0.5 + t * uHolo.z * 0.25;
    vec3 sheen = rainbow(h) * (0.25 + 0.9 * l);
    s = mix(s, sheen, uHolo.y * 0.85 * smoothstep(0.02, 0.25, l));   // dark parts stay dark
  }
  if (uMesh.x > 0.5) {
    vec2 w = vUv + 0.12 * vec2(sin(t * 0.2 + vUv.y * 3.0), cos(t * 0.17 + vUv.x * 3.0));
    int pal = int(uMesh.z + 0.5);
    vec3 m = mix(mix(meshCorner(pal, 0), meshCorner(pal, 1), clamp(w.x, 0.0, 1.0)), mix(meshCorner(pal, 2), meshCorner(pal, 3), clamp(w.x, 0.0, 1.0)), clamp(w.y, 0.0, 1.0));
    float lm = dot(s, vec3(0.299, 0.587, 0.114));
    s = mix(s, s * (0.35 + 1.3 * m) + m * 0.12 * lm, uMesh.y);
    s = clamp(s, 0.0, 1.0);
  }
  if (uCloud.x > 0.5) {
    vec2 q = vUv * vec2(uRes.x / uRes.y, 1.0) * mix(1.5, 7.0, uCloud.z) + vec2(t * 0.03, t * 0.012);
    float c = smoothstep(0.32, 0.85, fbm(q));
    s = 1.0 - (1.0 - s) * (1.0 - uCloudT * c * uCloud.y * 0.85);
  }
  vec3 g = vec3(0.0);
  if (uBloom.x > 0.5) {
    vec3 b = texture(uL1, uv).rgb * (1.0 - uBloom.z) + texture(uL2, uv).rgb * 0.7 + texture(uL3, uv).rgb * uBloom.z * 1.3;
    g += b * uBloom.y * 1.6;
  }
  if (uHalo.x > 0.5) {
    vec3 h = mix(texture(uL3, uv).rgb, texture(uL4, uv).rgb, uHalo.z);
    g += h * uTint * uHalo.y * 2.2;
  }
  // STACK glow: the light glows through a pattern (dots, grid, scanlines), or as a warm haze. It stacks over the look.
  if (uGPat.x > 0.5) {
    int gp = int(uGPat.x + 0.5);
    vec3 src = texture(uL1, uv).rgb * 0.6 + texture(uL2, uv).rgb * 0.9 + texture(uL3, uv).rgb;
    if (gp == 5) src = texture(uL3, uv).rgb * 0.5 + texture(uL4, uv).rgb * 1.4;
    vec2 f = fract(vUv * uRes / 8.0);
    float m = 1.0;
    if (gp == 2) m = 1.0 - smoothstep(0.1, 0.42, length(f - 0.5));
    if (gp == 3) m = 0.25 + 0.75 * smoothstep(0.0, 0.18, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    if (gp == 4) m = 0.35 + 0.65 * step(0.5, fract(vUv.y * uRes.y / 4.0));
    g += src * m * uGPat.y * 2.6;
  }
  vec3 res = 1.0 - (1.0 - s) * (1.0 - clamp(g, 0.0, 1.0));
  if (uStack.x > 0.5) {
    vec2 px = vUv * uRes;
    int n = int(uStack.y + 0.5);
    float m = 0.0;
    float sc = max(1.0, uRes.y / 540.0);
    for (int k = 0; k < 16; k++) {
      if (k >= n) break;
      vec2 a = stackPt(k, t) * uRes;
      vec2 b = stackPt((k + 1) % n, t) * uRes;
      vec2 c = stackPt((k + 3) % n, t) * uRes;
      float lw = uStack.z * sc;
      m = max(m, 1.0 - smoothstep(lw - 0.5, lw + 0.5, sdSeg(px, a, b)));
      m = max(m, 0.55 * (1.0 - smoothstep(lw - 0.5, lw + 0.5, sdSeg(px, a, c))));
      vec2 dd = abs(px - a);
      m = max(m, 1.0 - smoothstep(4.0 * sc, 5.0 * sc, max(dd.x, dd.y)));
      if (uStack.w > 0.5) {
        vec2 lc = px - (a + vec2(9.0, -7.0) * sc);
        vec2 tc = vec2(lc.x / sc, -lc.y / sc);
        if (tc.x >= 0.0 && tc.x < 88.0 && tc.y >= 0.0 && tc.y < 24.0) {
          float tx = texture(uWords, vec2(tc.x / 192.0, (float(k) * 32.0 + tc.y + 4.0) / 512.0)).r;
          res = mix(res, uStackCol, 1.0);
          res = mix(res, vec3(0.0), tx);
        }
      }
    }
    res = mix(res, uStackCol, m);
  }
  if (uGrain.x > 0.5) {
    float cell = mix(1.0, 4.0, uGrain.z);
    float n = hash(floor(vUv * uRes / cell) + tq * 1.37);
    float l = dot(res, vec3(0.299, 0.587, 0.114));
    float w = 0.4 + 0.6 * (1.0 - abs(l - 0.5) * 2.0);
    res += (n - 0.5) * uGrain.y * 0.55 * w;
  }
  // BITMAP: the last layer, over the finished picture. Mode 0 passes it through.
  res = bitmapStage(res, gl_FragCoord.xy, uRes, uScene, uBit, uBit2);
  o = vec4(clamp(res, 0.0, 1.0), 1.0);
}`;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

function link(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
  return p;
}

export class Post {
  private scene: Target | null = null;
  private levels: Target[] = [];
  private pre: WebGLProgram;
  private down: WebGLProgram;
  private compose: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private words: WebGLTexture | null = null;

  constructor(private gl: WebGL2RenderingContext) {
    this.pre = link(gl, FRAG_PREFILTER);
    this.down = link(gl, FRAG_DOWN);
    this.compose = link(gl, FRAG_COMPOSE);
    this.vao = gl.createVertexArray()!;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  private free(t: Target | null): void {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  /** Make the targets for this canvas size (the scene, then four copies at 1/2, 1/4, 1/8, 1/16). */
  private ensure(w: number, h: number): void {
    if (this.scene && this.scene.w === w && this.scene.h === h) return;
    this.free(this.scene);
    this.levels.forEach((l) => this.free(l));
    this.scene = this.target(w, h);
    this.levels = [];
    for (let k = 1; k <= 4; k++) {
      this.levels.push(this.target(Math.max(1, w >> k), Math.max(1, h >> k)));
    }
  }

  /** The word tags of GRAPHIC STACK: 16 words drawn once into a 192 x 512 texture, white on black, 32 px per row. */
  private ensureWords(): void {
    if (this.words) return;
    const gl = this.gl;
    const cv = document.createElement('canvas');
    cv.width = 192;
    cv.height = 512;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 192, 512);
    ctx.fillStyle = '#fff';
    ctx.font = "bold 16px 'Martian Mono', monospace";
    ctx.textBaseline = 'middle';
    const words = ['SIGNAL', 'DEPTH', 'NULL', 'FORM', 'VOID', 'PIXEL', 'DRIFT', 'EDGE', 'LOOP', 'TRACE', 'FIELD', 'NOISE', 'MOTION', 'GRID', 'LIGHT', 'WAVE'];
    words.forEach((w, k) => ctx.fillText(w, 6, k * 32 + 16));
    this.words = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.words);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** From here the scene is drawn into the scene texture. */
  begin(w: number, h: number): void {
    this.ensure(w, h);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene!.fbo);
    gl.viewport(0, 0, w, h);
  }

  /** Back to the canvas: bright copy, the shrinking chain, and the composite over the scene. */
  end(p: PostParams, w: number, h: number, time: number, beat: number): void {
    const gl = this.gl;
    const scene = this.scene!;
    const [l1, l2, l3, l4] = this.levels;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    const pass = (prog: WebGLProgram, src: Target, dst: Target | null, thr?: number) => {
      gl.useProgram(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
      gl.viewport(0, 0, dst ? dst.w : w, dst ? dst.h : h);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 7);
      gl.uniform2f(gl.getUniformLocation(prog, 'uTexel'), 1 / src.w, 1 / src.h);
      if (thr !== undefined) gl.uniform1f(gl.getUniformLocation(prog, 'uThr'), thr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    pass(this.pre, scene, l1, p.threshold);
    pass(this.down, l1, l2);
    pass(this.down, l2, l3);
    pass(this.down, l3, l4);

    gl.useProgram(this.compose);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const unit = (name: string, t: Target, u: number) => {
      gl.activeTexture(gl.TEXTURE0 + u);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(gl.getUniformLocation(this.compose, name), u);
    };
    unit('uScene', scene, 4);
    unit('uL1', l1, 5);
    unit('uL2', l2, 6);
    unit('uL3', l3, 7);
    unit('uL4', l4, 8);
    gl.uniform3f(gl.getUniformLocation(this.compose, 'uBloom'), p.bloomOn ? 1 : 0, p.bloomAmount, p.bloomRadius);
    gl.uniform3f(gl.getUniformLocation(this.compose, 'uHalo'), p.haloOn ? 1 : 0, p.haloAmount, p.haloSize);
    gl.uniform2f(gl.getUniformLocation(this.compose, 'uGPat'), p.glowPat, p.glowPatAmt);
    gl.uniform3f(gl.getUniformLocation(this.compose, 'uTint'), p.haloTint[0], p.haloTint[1], p.haloTint[2]);
    gl.uniform4f(gl.getUniformLocation(this.compose, 'uVhs'), p.vhsOn ? 1 : 0, p.vhsAmount, p.vhsNoise, time);
    gl.uniform4f(gl.getUniformLocation(this.compose, 'uGl'), p.glitchOn ? 1 : 0, p.glitchAmount, p.glitchRate, p.glitchBeat ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(this.compose, 'uSig'), beat, time);
    gl.uniform2f(gl.getUniformLocation(this.compose, 'uRes'), w, h);
    const u3 = (name: string, a: number, b: number, c: number) => gl.uniform3f(gl.getUniformLocation(this.compose, name), a, b, c);
    u3('uGrain', p.grainOn ? 1 : 0, p.grainAmount, p.grainSize);
    u3('uHolo', p.holoOn ? 1 : 0, p.holoAmount, p.holoSpeed);
    u3('uDuo', p.duoOn ? 1 : 0, p.duoAmount, 0);
    u3('uDuoA', p.duoShadow[0], p.duoShadow[1], p.duoShadow[2]);
    u3('uDuoB', p.duoLight[0], p.duoLight[1], p.duoLight[2]);
    u3('uCloud', p.cloudOn ? 1 : 0, p.cloudAmount, p.cloudScale);
    u3('uCloudT', p.cloudTint[0], p.cloudTint[1], p.cloudTint[2]);
    u3('uMesh', p.meshOn ? 1 : 0, p.meshAmount, p.meshPalette);
    gl.uniform4f(gl.getUniformLocation(this.compose, 'uStack'), p.stackOn ? 1 : 0, p.stackCount, p.stackWidth, p.stackWords ? 1 : 0);
    u3('uStackCol', p.stackColour[0], p.stackColour[1], p.stackColour[2]);
    gl.uniform4f(gl.getUniformLocation(this.compose, 'uBit'), p.bitMode, p.bitAmount, p.bitCell, p.bitLevel);
    gl.uniform4f(gl.getUniformLocation(this.compose, 'uBit2'), p.bitRamp, p.bitMid, p.bitDither, p.bitSize);
    if (p.stackOn && p.stackWords) {
      this.ensureWords();
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, this.words!);
      gl.uniform1i(gl.getUniformLocation(this.compose, 'uWords'), 9);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    if (this.words) this.gl.deleteTexture(this.words);
    this.free(this.scene);
    this.levels.forEach((l) => this.free(l));
    this.scene = null;
    this.levels = [];
  }
}
