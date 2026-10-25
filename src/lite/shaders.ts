// src/lite/shaders.ts
// Stateless particle motion. Nothing is simulated: every particle's position is a pure function of
// (home, light, hash(id), time), so there are no framebuffers, no ping-pong and no per-frame uploads.
// One source builds both passes; `#define TRAIL` turns it into the trail-line pass.

const HEAD = `#version 300 es
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

vec2 place(uint id, vec3 home, float light, float sOff, float shareMul, out float alpha, out float streaming) {
  float r0 = rnd(id, 1u);
  float r1 = rnd(id, 2u);
  float r2 = rnd(id, 3u);
  float r3 = rnd(id, 4u);

  // Bright parts of the picture shed more particles: light weighting
  float lc = min(light, 0.7); // the brightest specks (eyes) do not get to shed more
  float lw = 0.2 + 1.6 * lc * lc;
  float share = clamp((0.02 + 0.55 * uDrift) * lw * 0.5 * shareMul, 0.0, 0.95);
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

    float reach = (0.16 + 0.5 * uDrift) * (0.45 + 1.1 * r3);
    vec2 perp = vec2(-uDir.y, uDir.x);
    pos += uDir * reach * ease;
    // Streamlines: the bend depends on where the particle starts, so neighbours curve together
    float flow = dot(home.xy, vec2(5.3, 3.7)) + uTime * 0.25;
    pos += perp * (sin(s * 4.0 + flow) * 0.05 + sin(s * 9.0 + flow * 1.7) * 0.015) * uDrift * s * (0.6 + r3);

    alpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.35, 1.0, s));
    // Streaks fade out before they leave the picture's neighbourhood
    alpha *= 1.0 - smoothstep(0.2, 0.42, length(uDir * reach * ease));
    streaming = step(0.001, s);
  }

  // Tiny shimmer so the held picture is alive
  pos += 0.0015 * (0.3 + uDrift) * vec2(sin(uTime * 0.9 + r1 * 40.0), cos(uTime * 0.7 + r2 * 40.0));

  // Soft cursor push
  vec2 dq = pos - uPtr;
  float dl = length(dq);
  float f = uPtrOn * smoothstep(0.14, 0.0, dl);
  pos += dq / max(dl, 1e-4) * f * f * 0.03;

  return pos;
}

// Tilt the whole picture like a card in 3D: depth pushes near parts toward the viewer, so a turn
// of the head shows real parallax, and the picture foreshortens a little as it turns.
vec4 toClip(vec2 world, float z) {
  vec3 p = vec3(world, z * 0.45 * uDepth);
  float yaw = uLook.x * 0.14;
  float pitch = -uLook.y * 0.09;
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  vec3 q = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  q = vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
  float persp = 1.0 / (1.0 - q.z * 0.5);
  vec2 px = q.xy * persp * uScale + uOffset;
  return vec4(px / (uView * 0.5), 0.0, 1.0);
}
`;

const POINTS = `
void main() {
  float alpha, streaming;
  vec2 w = place(uint(gl_VertexID), aHome, luma(aMeta.rgb), 0.0, 1.0, alpha, streaming);
  gl_Position = toClip(w, aHome.z);
  gl_PointSize = streaming > 0.5 ? max(1.0, uPointPx) : uPointPx;

  // Screen blending k overlapping dots gives 1-(1-o)^k; pick o so the stack lands on the source colour
  vec3 c = clamp(aMeta.rgb * uBright, 0.0, 1.0);
  vec3 o = 1.0 - pow(1.0 - c, vec3(aMeta.a * 5.0 / max(uCover, 0.25)));
  vCol = o * alpha * (streaming > 0.5 ? 0.7 : 1.0);
}
`;

const TRAILS = `
void main() {
  // Instanced 2-vertex lines: vertex 0 is the head, vertex 1 is the tail further back along the path
  bool tail = gl_VertexID == 1;
  uint id = uint(gl_InstanceID) * 2u;
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
  vec2 w = tail ? place(id, aHome, luminance, -uTrailLen * lenVar, 1.0, a2, st2) : head;
  gl_Position = toClip(w, aHome.z);
  // Head bright, tail keeps a third of it: a soft taper, like the studio streaks
  vCol = aMeta.rgb * alpha * (tail ? 0.1 : 0.3) * uTrailGain;
}
`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }
`;

export const POINT_VERT = HEAD + POINTS;
export const TRAIL_VERT = HEAD + TRAILS;
export const FRAG_SRC = FRAG;
