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
uniform float uDim;       // 0..1 procedural dimming along the drift paths
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
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 partSat(vec3 c) { return clamp(mix(vec3(luma(c)), c, uPSat), 0.0, 1.0); }

// World position and opacity of one particle; sOff pulls it back along its own path (trail tails).
vec2 place(uint id, vec3 home, float light, float sOff, float shareMul, out float alpha, out float streaming) {
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
  float share = clamp((0.02 + 0.55 * uDrift) * lw * 0.5 * shareMul * origin, 0.0, 0.95);
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

    // PATH RANDOMNESS: each streamer turns a little off the drift direction and goes its own distance
    float ang = (r4 - 0.5) * uRandom * 1.2;
    float ca = cos(ang), sa = sin(ang);
    vec2 dir = vec2(uDir.x * ca - uDir.y * sa, uDir.x * sa + uDir.y * ca);
    // FLOW: reach raised again (about 2.5x the first version at full flow)
    float reach = (0.8 + 2.4 * uDrift) * mix(1.0, 0.45 + 1.1 * r3, uRandom);
    vec2 perp = vec2(-dir.y, dir.x);
    pos += dir * reach * ease;
    // Streamlines: the bend depends on where the particle starts, so neighbours curve together
    float flow = dot(home.xy, vec2(5.3, 3.7)) + uTime * 0.25;
    pos += perp * (sin(s * 4.0 + flow) * 0.05 + sin(s * 9.0 + flow * 1.7) * 0.015) * uDrift * s * (0.6 + r3);

    alpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.35, 1.0, s));
    // Streaks fade out before they leave the picture's neighbourhood
    // Streaks fade only far out, so drifting particles can travel past the canvas edges
    alpha *= 1.0 - smoothstep(1.6, 2.6, length(dir * reach * ease));
    // DIM: the drift paths are dimmed procedurally, in soft bands, so the dots read better
    alpha *= mix(1.0, 0.4, uDim * (0.5 + 0.5 * sin(s * 7.0 + r4 * 6.2831853)));
    streaming = smoothstep(0.0, 0.12, s); // 0 on the picture, 1 once drifting (smooth, so colour blends)
  }

  // Tiny shimmer so the held picture is alive
  pos += 0.0015 * (0.3 + uDrift) * vec2(sin(uTime * 0.9 + r1 * 40.0), cos(uTime * 0.7 + r2 * 40.0));

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
  vec2 w = place(id, home, luma(mc), 0.0, 1.0, alpha, streaming);
  gl_Position = toClip(w, home.z);

  // IMAGE dots get the Effects tab. DRIFTING dots get particle saturation instead.
  // streaming is 0 on the picture and 1 on the drifting particles, so the two blend smoothly.
  vec3 c = tint(mix(effects(mc), partSat(mc), streaming));
  float lum = luma(c);

  // PULSE scan: a wave of light travels through the depth, front to back, and lights the dots it passes
  float pulse = 0.0;
  if (uScanOn > 0.5 && uScanMode > 5.5) {
    float dz = home.z + 0.5;
    pulse = pow(0.5 + 0.5 * sin(uTime * 2.4 - dz * 6.0), 4.0) * (uScanLevel / 3.0);
    c = clamp(c + (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * pulse * (0.25 + 0.5 * lum), 0.0, 1.0);
  } else if (uScanOn > 0.5) {
    vec2 ld = normalize(uDir + vec2(1e-4, 0.0));
    float g = scanBand(w, ld, uScan, uScanMode, uScanCenter, home.z, uZScale, lum);
    c += (uLightOn > 0.5 ? uLightCol : vec3(1.0)) * g * (0.12 + 0.4 * lum);
  }
  // TRAIL SIZE: drifting dots are sized by it. The pulse makes the lit dots bigger.
  gl_PointSize = mix(uPointPx, max(1.0, uPointPx * uTrailSize), streaming) + pulse * 1.5;

  // Screen blending k overlapping dots gives 1-(1-o)^k; pick o so the stack lands on the source colour
  vec3 cb = clamp(c * uBright, 0.0, 1.0);
  vec3 o = 1.0 - pow(1.0 - cb, vec3(aMeta.a * 5.0 / max(uCover, 0.25)));
  float opacity = mix(uOpacity, 1.0, streaming); // OPACITY is for the image only
  vCol = o * alpha * (1.0 - 0.3 * streaming) * opacity * (1.0 + pulse * 0.8);
}
`;

const TRAILS = `
void main() {
  // Instanced 2-vertex lines: vertex 0 is the head, vertex 1 is the tail further back along the path
  bool tail = gl_VertexID == 1;
  uint id = uint(gl_InstanceID) * 2u;
  if (rnd(id, 6u) > uTrailAmount) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  float lenVar = 0.4 + rnd(id, 5u); // no two streaks the same length
  float luminance = luma(aMeta.rgb);

  // Both ends decide from the HEAD, so a line is never half-culled (a lone end would stretch it
  // to the cull point and draw a long ray across the picture)
  float alpha, streaming, a2, st2;
  vec2 head = place(id, aHome, luminance, 0.0, 1.0, alpha, streaming);
  if (streaming < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0);
    return;
  }
  vec2 w = head;
  if (tail) {
    // TRAIL DIRECTION: turn the tail away from the drift path by uTrailAngle
    vec2 off = place(id, aHome, luminance, -uTrailLen * lenVar, 1.0, a2, st2) - head;
    float ca = cos(uTrailAngle), sa = sin(uTrailAngle);
    w = head + vec2(off.x * ca - off.y * sa, off.x * sa + off.y * ca);
  }
  gl_Position = toClip(w, aHome.z);
  // Trails carry no Effects: only particle saturation and the light tint. Head bright, tail tapers with detail.
  float tailK = mix(0.22, 0.04, uTrailDetail);
  vCol = tint(partSat(aMeta.rgb)) * alpha * (tail ? tailK : 0.3) * uTrailGain;
}
`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

// The studio's scan bands come from LIFECYCLE_GLSL (which also declares uScanLevel).
export const POINT_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + POINTS;
export const TRAIL_VERT = VERSION + LIFECYCLE_GLSL + DECLS + FX + TRAILS;
export const FRAG_SRC = FRAG;
