// src/lite/shaders.ts
// Stateless particle motion. Nothing is simulated: every particle's position is a pure function of
// (home, light, hash(id), time), so there are no framebuffers, no ping-pong and no per-frame uploads.
// The scan bands come from the studio's own GLSL (src/shaders/lifecycle.ts), so both builds agree.
import { LIFECYCLE_GLSL } from '../shaders/lifecycle';

const VERSION = `#version 300 es
precision highp float;
precision highp int;
`;

const DECLS = `
layout(location = 0) in vec3 aHome;   // world x, y (height = 1), z depth -0.5..0.5
layout(location = 1) in vec4 aMeta;   // rgb colour, a = density gain / 5 (undoes importance-sampling bias)
layout(location = 2) in vec3 aHome2;  // MORPH: the arriving picture's home (same particle index)
layout(location = 3) in vec4 aMeta2;  // MORPH: the arriving picture's colour

uniform vec2 uView;       // drawing buffer size, px
uniform float uScale;     // px per world unit
uniform vec2 uOffset;     // px, picture centre relative to canvas centre (y up)
uniform float uTime;
uniform float uDrift;     // FLOW: 0..1
uniform float uDepth;     // RELIEF: 0..1
uniform float uSpeed;     // 1 = default
uniform vec2 uDir;        // drift direction (unit) * strength factor
uniform float uLean;      // -1..1 which side of the picture the streamers come from
uniform float uHalfW;     // half the picture width in world units
uniform float uRandom;    // 0..1 randomness of the path (direction and distance per particle)
uniform float uTrailSize; // dot size of drifting particles, multiplier of the picture dot
uniform float uTrailAngle; // radians, trail direction turned away from the drift path
uniform float uPSat;      // particle saturation, 1 = as sampled
uniform vec2 uLook;       // PAN: cursor tilt, already scaled by the pan amount and style
uniform vec2 uSway;       // idle camera sway, not affected by PAN
uniform vec2 uPtr;        // pointer in world units
uniform float uPtrOn;     // TRACK on and the cursor is over the stage
uniform vec2 uPtrVel;     // pointer velocity, world units per second (clamped on the CPU)
uniform float uTrackOld;  // 1 = OLD track (repel + follow the motion), 0 = SOFT track (gentle push)
uniform vec4 uBurst;      // click burst: x, y (world), age (s), amplitude (0 when done)
uniform float uCover;     // expected dots per pixel over the subject
uniform float uPointPx;
uniform float uBright;
uniform float uTrailLen;
uniform float uTrailGain;
uniform float uTrailAmount; // 0..1 share of streaks kept
uniform float uTrailDetail; // 0 soft glow .. 1 crisp taper
uniform vec3 uLightCol;
uniform float uLightOn;
uniform float uScanOn;
uniform float uScan;        // 0..1 position of the band
uniform float uScanMode;    // 0 SWEEP, 1 RING, 2 RADAR, 3 LINES, 4 DEPTH
uniform vec2 uScanCenter;   // where the user last clicked
uniform float uZScale;
uniform float uOpacity;     // picture only, trails are not dimmed
uniform float uMorph;       // 0..1 progress of the morph into the next picture
uniform float uRole;        // 0 normal, 3 morphing
uniform float uDolly;       // 3D: move through the picture (camera distance)
uniform float uLoop;        // export loop length in s, 0 = not looping
uniform float uTrailFade;   // 0..1 trails fade in while a new picture morphs in
uniform float uLineW;      // trail width in px: 1 = plain GL lines, wider = quads (export at a larger size)
uniform float uEmitW[9];   // EMITTERS: how much each region of the picture sheds (3 x 3, top left first)
uniform vec4 uEmitX;       // EMITTERS: spots, scatter, length variety, turn
uniform float uEmitOn;
uniform sampler2D uImg;     // the picture on screen: rgb colour, a = depth (cell looks and the PULSE scan)
uniform sampler2D uImg2;    // the picture arriving (cell looks)
uniform vec2 uTexSize;      // picture texture size, px
uniform float uHasImg;      // 1 when uImg holds a picture
uniform float uGridA;      // 1 while drawing the resting cells of a cell look (no shimmer, so cells stay edge to edge)

out vec3 vCol;

// EMITTERS: the 3 x 3 region weights, blended smoothly across the picture so there are no visible blocks
float regionWeight(vec2 h) {
  vec2 g = vec2(clamp(h.x / max(uHalfW, 1e-3) * 0.5 + 0.5, 0.0, 1.0), clamp(0.5 - h.y, 0.0, 1.0)) * 2.0;
  int x0 = int(min(floor(g.x), 1.0));
  int y0 = int(min(floor(g.y), 1.0));
  vec2 f = g - vec2(float(x0), float(y0));
  int i = y0 * 3 + x0;
  return mix(mix(uEmitW[i], uEmitW[i + 1], f.x), mix(uEmitW[i + 3], uEmitW[i + 4], f.x), f.y);
}

// LOOP: an angular frequency snapped to whole cycles per loop, so frame 0 and frame T match
float tw(float w, float minCycles) {
  if (uLoop <= 0.0) return w;
  float tau = 6.2831853;
  return tau * max(minCycles, floor(w * uLoop / tau + 0.5)) / uLoop;
}

uint hashu(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint id, uint salt) {
  return float(hashu(id * 747796405u + salt * 2891336453u)) * (1.0 / 4294967296.0);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 partSat(vec3 c) { return clamp(mix(vec3(luma(c)), c, uPSat), 0.0, 1.0); }

// World position and opacity of one particle; sOff pulls it back along its own path (trail tails).
vec2 place(uint id, vec3 home, float light, float sOff, float shareMul, out float alpha, out float streaming, out vec2 dirOut) {
  float r0 = rnd(id, 1u);
  float r1 = rnd(id, 2u);
  float r2 = rnd(id, 3u);
  float r3 = rnd(id, 4u);
  float r4 = rnd(id, 8u); // path randomness: direction

  // LEAN: the chance to stream depends on where the particle sits across the picture.
  // Lean right: most streamers come from the right side; lean left: from the left. A floor keeps
  // some streamers on the far side, and brightness (lw) still decides the rest.
  float xn = clamp(home.x / max(uHalfW, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  float origin = (0.12 + exp(uLean * 8.0 * (xn - 0.5))) / 1.12;

  // Bright parts of the picture shed more particles: light weighting
  float lc = min(light, 0.7); // the brightest specks (eyes) do not get to shed more
  float lw = 0.2 + 1.6 * lc * lc;
  float emitK = 1.0;
  if (uEmitOn > 0.5) {
    emitK = regionWeight(home.xy);
    // SPOTS: a few small patches of the picture shed far more, the brighter the patch the more
    ivec2 gc = ivec2(floor(home.xy * 18.0));
    float spot = step(0.88, rnd(uint(gc.x) * 73856093u ^ uint(gc.y) * 19349663u, 21u));
    emitK *= 1.0 + uEmitX.x * 8.0 * spot * smoothstep(0.35, 0.8, light);
  }
  float share = clamp((0.02 + 0.55 * uDrift) * lw * 0.5 * shareMul * origin * emitK, 0.0, 0.95);
  bool streamer = r0 < share;

  vec2 pos = home.xy;
  alpha = 1.0;
  streaming = 0.0;

  if (streamer) {
    float cycle = (5.0 + 5.0 * r2) / max(uSpeed, 0.05);
    // LOOP: whole streamer cycles per loop (1 or more), so the last frame meets the first
    float age = uLoop > 0.0 ? fract(fract(uTime / uLoop * max(1.0, floor(uLoop / cycle + 0.5))) + r1) : fract(uTime / cycle + r1);
    float rest = 0.30;
    float s = clamp((age - rest) / (1.0 - rest) + sOff, 0.0, 1.0);
    float ease = pow(s, 1.4);

    // PATH RANDOMNESS: each streamer turns a little off the drift direction and goes its own distance
    float ang = (r4 - 0.5) * uRandom * 1.2;
    float ca = cos(ang), sa = sin(ang);
    vec2 dir = vec2(uDir.x * ca - uDir.y * sa, uDir.x * sa + uDir.y * ca);
    // Reach also sets the trail: a trail is the same path, a little further back. Max about 2 picture heights at full flow.
    float reach = (0.4 + 1.6 * uDrift) * mix(1.0, 0.45 + 1.1 * r3, uRandom);
    vec2 perp = vec2(-dir.y, dir.x);
    pos += dir * reach * ease;
    // SCATTER: the start of the path is not the exact pixel; each particle leaves from a slightly different place
    pos += (vec2(rnd(id, 13u), rnd(id, 14u)) - 0.5) * uEmitX.y * 0.05 * ease * step(0.5, uEmitOn);
    // Streamlines: the bend depends on where the particle starts, so neighbours curve together
    float flow = dot(home.xy, vec2(5.3, 3.7)) + uTime * tw(0.25, 0.0);
    pos += perp * (sin(s * 4.0 + flow) * 0.05 + sin(s * 9.0 + flow * 1.7) * 0.015) * uDrift * s * (0.6 + r3);

    alpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.35, 1.0, s));
    // Streaks fade out before they leave the picture's neighbourhood
    // Streaks fade only far out, so drifting particles can travel past the canvas edges
    alpha *= 1.0 - smoothstep(1.2, 2.0, length(dir * reach * ease));
    dirOut = normalize(dir);
    streaming = smoothstep(0.0, 0.12, s); // 0 on the picture, 1 once drifting (smooth, so colour blends)
  }

  // Tiny shimmer so the held picture is alive
  pos += 0.0015 * (0.3 + uDrift) * (1.0 - uGridA) * vec2(sin(uTime * tw(0.9, 1.0) + r1 * 40.0), cos(uTime * tw(0.7, 1.0) + r2 * 40.0));

  // TRACK. OLD: repel from the cursor and follow its motion (the earlier behaviour).
  // SOFT: a gentle push (the later behaviour).
  vec2 dq = pos - uPtr;
  float dl = length(dq);
  vec2 away = dq / max(dl, 1e-4);
  if (uTrackOld > 0.5) {
    float fall = uPtrOn * exp(-(dl * dl) / 0.0625);
    pos += away * fall * 0.06 + clamp(uPtrVel, -2.0, 2.0) * fall * 0.05;
  } else {
    float f = uPtrOn * smoothstep(0.14, 0.0, dl);
    pos += away * f * f * 0.03;
  }

  // Click burst (BURST scan style): a ring that travels outward and pushes what it passes
  vec2 bq = pos - uBurst.xy;
  float bl = length(bq);
  float ring = (bl - uBurst.z * 0.9) / 0.06;
  pos += bq / max(bl, 1e-4) * uBurst.w * exp(-ring * ring) * 0.05;

  return pos;
}

// Tilt the whole picture like a card in 3D: depth pushes near parts toward the viewer.
vec4 toClip(vec2 world, float z) {
  vec3 p = vec3(world, z * 0.45 * uDepth);
  float yaw = uLook.x + uSway.x * 0.14;      // uLook holds the angles (PAN cursor tilt or ORBIT drag)
  float pitch = -(uLook.y + uSway.y * 0.09);
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  vec3 q = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  q = vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
  float zc = q.z + uDolly;
  float persp = 1.0 / (1.0 - zc * 0.5);
  vec2 px = q.xy * persp * uScale + uOffset;
  return vec4(px / (uView * 0.5), 0.0, 1.0);
}

// Light tint: the picture's bright parts take the chosen colour (same rule as the studio)
vec3 tint(vec3 c) {
  if (uLightOn < 0.5) return c;
  return mix(c, uLightCol, clamp(luma(c) * 0.4, 0.0, 0.55));
}

// PULSE: light glancing off the picture. A light circles the picture; where the surface (the depth map) turns
// to face it and the picture is bright, it flashes, and a soft sheet of light sweeps along the light's direction
// over the bright parts. Dark parts stay dark. Returns 0..1.
float glint(vec2 h, float lum) {
  float lit = smoothstep(0.15, 0.8, lum);
  float a = uTime * tw(0.7, 1.0);
  vec2 ld = vec2(cos(a), sin(a));
  float spec = 0.0;
  if (uHasImg > 0.5) {
    vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
    vec2 e = 2.0 / uTexSize;
    float zx = textureLod(uImg, uv + vec2(e.x, 0.0), 1.0).a - textureLod(uImg, uv - vec2(e.x, 0.0), 1.0).a;
    float zy = textureLod(uImg, uv + vec2(0.0, e.y), 1.0).a - textureLod(uImg, uv - vec2(0.0, e.y), 1.0).a;
    // depth change per picture height, as a slope of the relief (y is flipped: the texture runs downward)
    float k = 0.45 * max(uDepth, 0.3) * uTexSize.y * 0.5 * 0.25;
    vec3 n = normalize(vec3(-zx * k, zy * k, 1.0));
    vec3 l = normalize(vec3(ld * 0.9, 0.75));
    vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
    spec = pow(max(dot(n, hv), 0.0), 40.0);
  }
  // The sheet: a band of light moving along the light's direction, only where the picture is bright
  float sheet = pow(0.5 + 0.5 * sin(dot(h, ld) * 5.0 - uTime * tw(1.6, 1.0)), 6.0);
  return clamp(spec * 1.6 + sheet * 0.5, 0.0, 1.0) * lit;
}
`;

// Levels, curve, hue, saturation and black & white: the studio's Effects tab, applied to the picture only
const FX = `
uniform vec4 uFx1;   // black, white, gamma, contrast
uniform vec2 uFx2;   // hue (radians), saturation
uniform float uBW;

vec3 hueRotate(vec3 c, float a) {
  float cs = cos(a), sn = sin(a);
  mat3 m = mat3(
    0.213 + cs * 0.787 - sn * 0.213, 0.213 - cs * 0.213 + sn * 0.143, 0.213 - cs * 0.213 - sn * 0.787,
    0.715 - cs * 0.715 - sn * 0.715, 0.715 + cs * 0.285 + sn * 0.140, 0.715 - cs * 0.715 + sn * 0.715,
    0.072 - cs * 0.072 + sn * 0.928, 0.072 - cs * 0.072 - sn * 0.283, 0.072 + cs * 0.928 + sn * 0.072);
  return m * c;
}

vec3 effects(vec3 c) {
  c = clamp((c - uFx1.x) / max(uFx1.y - uFx1.x, 1e-3), 0.0, 1.0);
  c = pow(c, vec3(1.0 / uFx1.z));
  c = clamp(0.5 + (c - 0.5) * (1.0 + uFx1.w), 0.0, 1.0);
  c = clamp(hueRotate(c, uFx2.x), 0.0, 1.0);
  c = clamp(mix(vec3(luma(c)), c, uFx2.y), 0.0, 1.0);
  if (uBW > 0.5) c = vec3(luma(c));
  return c;
}
`;

const POINTS = `
void main() {
  // MORPH: the dot moves from its place in the old picture to its place in the new one.
  uint id = uint(gl_VertexID);
  float morphing = step(2.5, uRole);
  float e = clamp(uMorph + (rnd(id, 9u) - 0.5) * 0.4, 0.0, 1.0);
  e = smoothstep(0.0, 1.0, e) * morphing;
  vec3 home = mix(aHome, aHome2, e);
  vec3 mc = mix(aMeta.rgb, aMeta2.rgb, e);

  float alpha, streaming;
  vec2 dirP;
  vec2 w = place(id, home, luma(mc), 0.0, 1.0, alpha, streaming, dirP);
  gl_Position = toClip(w, home.z);

  // IMAGE dots get the Effects tab. DRIFTING dots get particle saturation instead.
  // streaming is 0 on the picture and 1 on the drifting particles, so the two blend smoothly.
  vec3 c = tint(mix(effects(mc), partSat(mc), streaming));
  float lum = luma(c);

  // PULSE scan: a wave of light travels through the depth, front to back, and lights the dots it passes
  float pulse = 0.0;
  if (uScanOn > 0.5 && uScanMode > 5.5) {
    pulse = glint(home.xy, lum) * (uScanLevel / 3.0);
    c = clamp(c + (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * pulse * (0.22 + 0.4 * lum), 0.0, 1.0);
  } else if (uScanOn > 0.5) {
    vec2 ld = normalize(uDir + vec2(1e-4, 0.0));
    float g = scanBand(w, ld, uScan, uScanMode, uScanCenter, home.z, uZScale, lum);
    c += (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * g * (0.12 + 0.4 * lum);
  }
  // TRAIL SIZE: drifting dots are sized by it. The pulse makes the lit dots bigger.
  gl_PointSize = mix(uPointPx, max(1.0, uPointPx * uTrailSize), streaming) + pulse * 0.8;

  // Screen blending k overlapping dots gives 1-(1-o)^k; pick o so the stack lands on the source colour
  vec3 cb = clamp(c * uBright, 0.0, 1.0);
  vec3 o = 1.0 - pow(1.0 - cb, vec3(aMeta.a * 5.0 / max(uCover, 0.25)));
  float opacity = mix(uOpacity, 1.0, streaming); // OPACITY is for the image only
  vCol = o * alpha * (1.0 - 0.3 * streaming) * opacity * (1.0 + pulse * 0.3);
}
`;

const TRAILS = `
void main() {
  // One trail per particle: a fixed length back along the drift direction, so trails show at any FLOW,
  // not only near the maximum. Live they are GL lines (always 1 px). An export at a larger size draws them
  // as quads uLineW wide, so the trails grow with the picture like the dots do (4 vertices: head, head, tail, tail).
  bool strip = uLineW > 1.25;
  bool tail = strip ? gl_VertexID >= 2 : gl_VertexID == 1;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  uint id = uint(gl_InstanceID);
  // TRAIL AMOUNT: 0..2, where 1 keeps half of the particles
  if (rnd(id, 6u) > uTrailAmount * 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  // LENGTH VARIETY (EMITTERS): 1 = no two streaks the same length, 0 = all the same
  float lenVar = mix(1.0, 0.4 + rnd(id, 5u), uEmitOn > 0.5 ? uEmitX.z : 1.0);
  float luminance = luma(aMeta.rgb);

  float alpha, streaming;
  vec2 dirT;
  vec2 head = place(id, aHome, luminance, 0.0, 1.0, alpha, streaming, dirT);
  if (streaming < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  // TRAIL DIRECTION: turn the tail away from the drift path by uTrailAngle
  // Positive length: the tail runs back along the particle's own path and stops at its home pixel.
  // Negative length: the tail runs forward along the drift direction.
  float L = uTrailLen * lenVar;
  vec2 disp = head - aHome.xy;
  vec2 back = L >= 0.0 ? -normalize(disp + vec2(1e-6)) * min(L, length(disp)) : -dirT * L;
  // TURN (EMITTERS): each trail leans a tiny random angle off the common direction
  float turn = uEmitOn > 0.5 ? (rnd(id, 12u) - 0.5) * uEmitX.w * 0.35 : 0.0;
  float ca = cos(uTrailAngle + turn), sa = sin(uTrailAngle + turn);
  vec2 tailW = head + vec2(back.x * ca - back.y * sa, back.x * sa + back.y * ca);
  gl_Position = toClip(tail ? tailW : head, aHome.z);
  if (strip) {
    // Push the two vertices of each end apart, across the trail, by half the width in px
    vec2 a = toClip(head, aHome.z).xy * uView * 0.5;
    vec2 b = toClip(tailW, aHome.z).xy * uView * 0.5;
    vec2 d = b - a;
    vec2 dir = d / max(length(d), 1e-4);
    gl_Position.xy += vec2(-dir.y, dir.x) * side * (uLineW * 0.43) / (uView * 0.5); // 0.43 = half of 0.86: matches a 1 px GL line's coverage
  }
  // Trails carry no Effects: only particle saturation and the light tint. Head bright, tail tapers with detail.
  // Thinner than 1.25 px they stay 1 px lines, so the brightness drops with the width instead.
  float tailK = mix(0.22, 0.04, uTrailDetail);
  float gain = strip ? 1.0 : min(uLineW, 1.25);
  vCol = tint(partSat(aMeta.rgb)) * alpha * (tail ? tailK : 0.3) * uTrailGain * gain * uTrailFade;
}
`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

// CELL LOOKS: one instance per grid cell (HALFTONE, MOSAIC, DITHER, ASCII, STIPPLE, LINES). A cell is treated as
// a particle (place()), so flow, pointer, burst, scan and pulse all act on it, but its colour and tone come
// from the picture under the whole cell, so every cell is one clean value.
const CELLS = `
uniform vec4 uGrid;         // nx, ny, cell width, cell height (world units)
uniform float uGridAng;     // radians, the grid turned about the picture centre
uniform float uLayer;       // 0 the picture, 1 the cells that have drifted off it
uniform vec2 uLv;           // AUTO LEVELS: brightness range stretched to 0..1
uniform float uColorMode;   // 0 SOURCE, 1 MONO, 2 DUO
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uInvert;
uniform float uStyle;       // 1 HALFTONE, 2 MOSAIC, 3 DITHER, 4 ASCII, 5 STIPPLE, 6 LINES
uniform vec4 uSP;           // settings of the look

out vec2 vUv;               // 0..1 across the cell
out vec3 vInk;
out vec3 vBg;
out float vTone;
out float vFade;
out vec4 vEdge;             // MOSAIC outline: left, right, bottom, top border a cell of another brightness
out vec2 vTn;               // LINES: brightness of the cells to the left and right
flat out ivec2 vCell;

float toneOf(vec3 c) {
  float t = clamp((luma(c) - uLv.x) / max(uLv.y - uLv.x, 0.05), 0.0, 1.0);
  return mix(t, 1.0 - t, uInvert);
}
float toneAt(vec2 uv, float lod) { return toneOf(effects(textureLod(uImg2, uv, lod).rgb)); }

void main() {
  int nx = int(uGrid.x + 0.5);
  int id = gl_InstanceID;
  ivec2 ij = ivec2(id % nx, id / nx);
  vec2 cw = uGrid.zw;
  float ca = cos(uGridAng), sa = sin(uGridAng);
  mat2 R = mat2(ca, sa, -sa, ca);
  vec2 local = (vec2(ij) + 0.5 - 0.5 * uGrid.xy) * cw;
  vec2 c = R * local;
  float aspect = uHalfW * 2.0;
  vCell = ij;
  vUv = vec2(0.0);
  vInk = vec3(0.0);
  vBg = vec3(0.0);
  vTone = 0.0;
  vFade = 0.0;
  vEdge = vec4(0.0);
  vTn = vec2(0.0);

  // Outside the picture
  if (abs(c.x) > uHalfW + 0.5 * cw.x || abs(c.y) > 0.5 + 0.5 * cw.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // The picture under the whole cell (mip level = cell size in texels), mixed old to new during a morph
  vec2 uv = vec2(c.x / aspect + 0.5, 0.5 - c.y);
  float lod = log2(max(0.5 * (cw.x + cw.y) * uTexSize.y, 1.0));
  float morphing = step(2.5, uRole);
  float e = smoothstep(0.0, 1.0, clamp(uMorph + (rnd(uint(id), 9u) - 0.5) * 0.4, 0.0, 1.0)) * morphing;
  vec4 t = mix(textureLod(uImg, uv, lod), textureLod(uImg2, uv, lod), e);
  vec3 mc = t.rgb;
  float z = t.a - 0.5;

  float alpha, streaming;
  vec2 dirP;
  vec2 w = place(uint(id), vec3(c, z), luma(mc), 0.0, uLayer, alpha, streaming, dirP);
  if (uLayer > 0.5 && streaming < 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 col = tint(mix(effects(mc), partSat(mc), streaming));
  float lum = luma(col);
  float pulse = 0.0;
  if (uScanOn > 0.5 && uScanMode > 5.5) {
    pulse = glint(c, lum) * (uScanLevel / 3.0);
    col = clamp(col + (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * pulse * (0.22 + 0.4 * lum), 0.0, 1.0);
  } else if (uScanOn > 0.5) {
    vec2 ld = normalize(uDir + vec2(1e-4, 0.0));
    float g = scanBand(w, ld, uScan, uScanMode, uScanCenter, z, uZScale, lum);
    col += (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * g * (0.12 + 0.4 * lum);
  }
  vec3 cb = clamp(col * uBright, 0.0, 1.0);
  float tone = toneOf(col);
  float opacity = mix(uOpacity, 1.0, streaming);
  vFade = alpha * (1.0 - 0.3 * streaming) * opacity * (1.0 + pulse * 0.3);
  vTone = tone;

  // Ink: the cell's colour at full value (the shape carries the brightness), or the chosen ink
  vec3 hue = cb / max(max(cb.r, cb.g), max(cb.b, 1e-3));
  vInk = uColorMode < 0.5 ? hue : uInk;
  vBg = uColorMode > 1.5 ? uPaper : vec3(0.0);

  int st = int(uStyle + 0.5);
  if (st == 2) {
    // MOSAIC: flat colour, optionally limited to a few levels per channel
    float lv = uSP.x;
    bool smooth_ = lv >= 31.5;
    vec3 q = smooth_ ? cb : floor(cb * (lv - 1.0) + 0.5) / (lv - 1.0);
    if (uInvert > 0.5) q = 1.0 - q;
    float qt = smooth_ ? tone : floor(tone * (lv - 1.0) + 0.5) / (lv - 1.0);
    vInk = uColorMode < 0.5 ? q : (uColorMode < 1.5 ? uInk * qt : mix(uPaper, uInk, qt));
    if (uSP.w > 0.0) {
      vec2 dx = R * vec2(cw.x, 0.0);
      vec2 dy = R * vec2(0.0, cw.y);
      vec2 ux = vec2(dx.x / aspect, -dx.y);
      vec2 uy = vec2(dy.x / aspect, -dy.y);
      vEdge = step(0.12, abs(vec4(toneAt(uv - ux, lod), toneAt(uv + ux, lod), toneAt(uv - uy, lod), toneAt(uv + uy, lod)) - tone));
    }
  } else if (st == 6) {
    vec2 dx = R * vec2(cw.x, 0.0);
    vec2 ux = vec2(dx.x / aspect, -dx.y);
    vTn = vec2(toneAt(uv - ux, lod), toneAt(uv + ux, lod));
  }

  // Corners of the cell, a little oversize so neighbours overlap; the fragment keeps only its own cell
  int v = gl_VertexID;
  vec2 corner = vec2(float(v & 1), float(v >> 1));
  vec2 q = (corner - 0.5) * 1.06;
  vUv = q + 0.5;
  gl_Position = toClip(w + R * (q * cw), z);
}
`;

const CELL_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in vec3 vInk;
in vec3 vBg;
in float vTone;
in float vFade;
in vec4 vEdge;
in vec2 vTn;
flat in ivec2 vCell;
uniform float uStyle;
uniform float uColorMode;
uniform vec4 uSP;
uniform vec4 uSP2;
uniform sampler2D uAtlas;   // ASCII glyphs: 16 columns, one row per ramp, each glyph 16 x 32 px
out vec4 o;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Ordered dither threshold built from bits, no texture. Rows y, columns x, M2 = [[0,2],[3,1]]/4.
float bayer(ivec2 cell, int n) {        // n = 2 gives 4x4, n = 3 gives 8x8
  ivec2 p = cell & ((1 << n) - 1);
  int a = p.x ^ p.y;
  int v = 0;
  for (int k = 0; k < 3; k++) {
    if (k < n) v += (((a >> k) & 1) << (2 * (n - 1 - k) + 1)) + (((p.y >> k) & 1) << (2 * (n - 1 - k)));
  }
  return (float(v) + 0.5) / float(1 << (2 * n));
}

void main() {
  // The oversize quad overlaps its neighbours; each pixel belongs to exactly one cell
  if (vUv.x < 0.0 || vUv.x >= 1.0 || vUv.y < 0.0 || vUv.y >= 1.0) discard;
  vec2 fw = fwidth(vUv);
  float aa = max(0.5 * (fw.x + fw.y), 1e-3);
  float tone = vTone;
  vec3 col = vBg;
  int st = int(uStyle + 0.5);
  vec2 p = vUv - 0.5;

  if (st == 1) {                                   // HALFTONE
    float area = pow(tone, 1.0 / (1.0 + uSP.y));
    float sq = sqrt(area);
    float m;
    if (uSP.x < 0.5)      m = 1.0 - smoothstep(sq * 0.7072 - aa, sq * 0.7072 + aa, length(p));
    else if (uSP.x < 1.5) m = 1.0 - smoothstep(sq * 0.5 - aa, sq * 0.5 + aa, max(abs(p.x), abs(p.y)));
    else if (uSP.x < 2.5) m = 1.0 - smoothstep(sq * 0.7072 - aa, sq * 0.7072 + aa, abs(p.x) + abs(p.y));
    else if (uSP.x < 3.5) m = (1.0 - smoothstep(area * 0.5 - aa, area * 0.5 + aa, min(abs(p.x), abs(p.y)))) * step(max(abs(p.x), abs(p.y)), 0.5);
    else                  m = 1.0 - smoothstep(area * 0.5 - aa, area * 0.5 + aa, abs(p.y));
    m *= step(0.003, area);
    col = mix(col, vInk, m);
  } else if (st == 2) {                            // MOSAIC
    float half_ = 0.5 - uSP.y * 0.5;
    float r = uSP.z * half_;
    float d = length(max(abs(p) - (half_ - r), 0.0)) - r;
    float m = 1.0 - smoothstep(0.0, aa, d);
    float edge = max(max(vEdge.x * smoothstep(0.14, 0.0, vUv.x), vEdge.y * smoothstep(0.14, 0.0, 1.0 - vUv.x)),
                     max(vEdge.z * smoothstep(0.14, 0.0, vUv.y), vEdge.w * smoothstep(0.14, 0.0, 1.0 - vUv.y)));
    col = mix(col, vInk * (1.0 - uSP.w * 0.85 * edge), m);
  } else if (st == 3) {                            // DITHER
    float b = uSP.x < 0.5 ? bayer(vCell, 2) : (uSP.x < 1.5 ? bayer(vCell, 3) : ign(vec2(vCell)));
    float L = uSP.y;
    float tt = clamp(pow(tone, 0.75) + uSP.z, 0.0, 1.0); // a lift, so dark pictures keep their shape
    float v = clamp(floor(tt * (L - 1.0) + b) / (L - 1.0), 0.0, 1.0);
    col = mix(col, vInk, v);
  } else if (st == 4) {                            // ASCII
    float N = uSP2.x;
    float idx = floor(clamp(pow(tone, 0.8), 0.0, 0.999) * N);
    vec2 g = vec2((idx + mix(0.0625, 0.9375, vUv.x)) / 16.0, (uSP.x + mix(0.03125, 0.96875, 1.0 - vUv.y)) / 3.0);
    float m = smoothstep(0.2, 0.65, texture(uAtlas, g).r);
    vec3 bg = uColorMode > 1.5 ? vBg : vInk * uSP.y * tone;
    col = mix(bg, vInk, m);
  } else if (st == 5) {                            // STIPPLE
    float rmax = uSP.x;
    float tl = pow(tone, 0.7);                       // a lift, so dark pictures keep their shape
    float r = mix(rmax * 0.35, rmax, sqrt(tl));
    float present = step(ign(vec2(vCell) * 1.7 + 3.1) * 0.9 + 0.05, tl * uSP.y);
    vec2 jit = (vec2(hash21(vec2(vCell)), hash21(vec2(vCell).yx + 7.3)) - 0.5) * uSP.z * max(1.0 - 2.0 * r, 0.0);
    float m = (1.0 - smoothstep(r - aa, r + aa, length(p - jit))) * present;
    col = mix(col, vInk, m);
  } else if (st == 6) {                            // LINES
    float wgt = uSP.y;
    float th = tone * wgt;
    if (uSP.x < 0.5) th = (vUv.x < 0.5 ? mix(vTn.x, tone, vUv.x + 0.5) : mix(tone, vTn.y, vUv.x - 0.5)) * wgt;
    th = clamp(th, 0.0, 1.0);
    float m = (1.0 - smoothstep(th * 0.5 - aa, th * 0.5 + aa, abs(p.y))) * smoothstep(0.02, 0.08, th);
    if (uSP.x > 1.5) {                              // CROSS-HATCH: columns come in with the darker parts
      float tc = clamp((tone - 0.4) / 0.6 * wgt, 0.0, 1.0);
      m = max(m, (1.0 - smoothstep(tc * 0.5 - aa, tc * 0.5 + aa, abs(p.x))) * smoothstep(0.02, 0.08, tc));
    }
    col = mix(col, vInk, m);
  }
  o = vec4(clamp(col * vFade, 0.0, 1.0), 1.0);
}
`;

export const CELL_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + CELLS;
export const CELL_FRAG_SRC = CELL_FRAG;

// The studio's scan bands come from LIFECYCLE_GLSL (which also declares uScanLevel).
export const POINT_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + POINTS;
export const TRAIL_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + TRAILS;
export const FRAG_SRC = FRAG;
