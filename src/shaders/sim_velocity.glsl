// src/shaders/sim_velocity.glsl
// (LIFECYCLE_GLSL is prepended in Simulation.ts)
#include <common>

uniform sampler2D tHome;
uniform sampler2D tHomeNext;
uniform sampler2D tFlow;

uniform float uTime;
uniform float uDt;
uniform float uDrift;
uniform float uGather;
uniform float uDepth;
uniform float uMorph;
uniform float uMelt;
uniform float uScan;
uniform float uScanActive;
uniform float uSplash;

uniform vec3  uPointer;     // world-space cursor position (z = 0 plane)
uniform vec3  uPointerVel;  // world units / second
uniform float uPointerOn;   // 1 when TRACK is on and the cursor is over the stage
uniform vec4  uBurst;       // x, y, seconds since click, amplitude
uniform vec2  uLine;

// Simplex 3D noise and curl noise implementation
vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Divergence-free 2D flow from a scalar noise field (cheap: 3 noise taps)
vec2 curl2(vec2 p, float t) {
  const float e = 0.02;
  float n  = snoise(vec3(p, t));
  float nx = snoise(vec3(p + vec2(e, 0.0), t));
  float ny = snoise(vec3(p + vec2(0.0, e), t));
  // snoise gradients reach ~10 at the frequencies used here, so scale down to roughly +-1
  return vec2(ny - n, -(nx - n)) / e * 0.1;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(tPos, uv);
  vec3 p = posData.xyz;
  float age = posData.w;
  vec4 vs = texture2D(tVel, uv);
  vec3 v = vs.xyz;
  float seed = vs.w;
  float h1 = fract(seed * 23.7);
  float h2 = fract(seed * 57.3);

  // Home position: morph between images, then depth relief
  float morphPhase = clamp(uMorph + (seed - 0.5) * 0.4, 0.0, 1.0);
  float morphFactor = smoothstep(0.0, 1.0, morphPhase);
  vec3 home = mix(texture2D(tHome, uv).xyz, texture2D(tHomeNext, uv).xyz, morphFactor);
  home.z *= uDepth * 0.55;

  // LINE: direction of travel. Length scales how hard the wind blows.
  float lineLen = length(uLine);
  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  vec2 perp = vec2(-lineDir.y, lineDir.x);

  bool streamer = age >= 0.0;
  float rest = restTime(seed);
  bool streaming = streamer && age > rest;
  if (streamer && age == 0.0) v = vec3(0.0); // freshly respawned: drop stale velocity

  // CURSOR field
  vec2 toP = p.xy - uPointer.xy;
  float cr = length(toP);
  float radius = 0.17 + 0.16 * uSplash;
  float fall = uPointerOn * exp(-(cr * cr) / (radius * radius));
  vec2 cDir = toP / max(cr, 1e-3);

  vec3 F = vec3(0.0);

  // GATHER: spring to home. High = crisp picture, low = loose cloud.
  float k = mix(5.0, 42.0, uGather) * (1.0 - 0.55 * fall);
  float damp = mix(3.2, 9.5, uGather);

  if (!streaming) {
    // Core body, or a streamer still resting at home
    F += (home - p) * k;
    // Loosened by low GATHER: the picture shimmers and frays instead of sitting dead still
    vec2 shimmer = curl2(p.xy * 3.2, uTime * 0.12 + h1 * 6.0);
    float loose = 1.0 - uGather;
    F.xy += shimmer * (0.05 + 0.9 * loose * loose) * (0.35 + uDrift);
    F.z  += snoise(vec3(p.xy * 4.0, uTime * 0.2 + h2 * 9.0)) * 0.25 * loose * loose;
  } else {
    // DRIFT: laminar stream along LINE
    float a = age - rest;
    float phase = clamp(a / lifeTime(seed, uDrift, uGather), 0.0, 1.0);

    // Wind eases in from the body, so particles lift off instead of popping
    float ease = smoothstep(0.0, 0.55, a);
    float windSpeed = (0.10 + 0.32 * uDrift) * mix(0.5, 1.0, lineLen) * (0.5 + 0.95 * h1);
    windSpeed *= 1.0 + 0.9 * fall;                         // cursor stirs the stream up
    vec2 target = lineDir * windSpeed * mix(0.35, 1.0, ease);

    // Fan out slightly with distance, shear stays small so streamlines stay silky
    target += perp * (h2 - 0.5) * 0.22 * uDrift * phase;

    // Melt: sag downward instead of sweeping sideways
    if (uMelt > 0.5) {
      target = target * 0.35 + vec2(0.0, -0.30 * (0.4 + phase));
    }

    float follow = 3.0;
    F.xy += (target - v.xy) * follow;

    // Gentle weak pull so the stream stays loosely tied to the subject while gather is high
    F.xy += (home.xy - p.xy) * (k * 0.012) * (1.0 - phase);

    // Slow curl flutter across the wind, plus a small depth wobble
    vec2 curl = curl2(p.xy * 2.1 + lineDir * (uTime * -0.25), uTime * 0.15 + h1 * 4.0);
    F.xy += curl * (0.10 + 0.55 * uDrift) * ease;
    F.z  += (home.z - p.z) * 2.0 + snoise(vec3(p.xy * 3.0, uTime * 0.2 + h2 * 5.0)) * 0.15;
  }

  // DRAW strokes steer everything
  vec2 flowSample = texture2D(tFlow, clamp(p.xy * 0.5 + 0.5, 0.0, 1.0)).xy;
  F.xy += flowSample * 2.2;

  // SPLASH: cursor pushes particles apart and drags them along its motion
  if (uPointerOn > 0.5) {
    float spl = 3.0 + 16.0 * uSplash;
    F.xy += cDir * fall * spl;
    F.z  += fall * (1.5 + 5.0 * uSplash);                  // lifts toward the camera: bright cloud
    F.xy += uPointerVel.xy * fall * (0.35 + 1.8 * uSplash);
    F.xy += vec2(-cDir.y, cDir.x) * fall * (0.6 + 2.2 * uSplash); // swirl
  }

  // Click shockwave
  if (uBurst.w > 0.001) {
    vec2 toB = p.xy - uBurst.xy;
    float br = length(toB);
    float rd = (br - uBurst.z * 1.3) / 0.16;
    float ring = exp(-rd * rd);
    F.xy += (toB / max(br, 1e-3)) * ring * uBurst.w * (1.5 + 6.0 * uSplash);
    F.z  += ring * uBurst.w * 2.0;
  }

  // SCAN: a narrow band sweeps across the picture along LINE. Only the band moves.
  if (uScanActive > 0.5) {
    float u = dot(p.xy, lineDir);
    float c = mix(-0.85, 0.85, uScan);
    float bd = (u - c) / 0.05;
    float g = exp(-bd * bd);
    g *= 1.0 + 1.6 * fall;                                  // stronger under the cursor
    float wave = sin(dot(p.xy, perp) * 30.0 - uTime * 7.0 + h1 * 2.0);
    F.xy += perp * wave * g * 2.4;
    F.xy += lineDir * g * 1.1;
    F.z  += g * (1.8 + 1.4 * wave);
  }

  // MELT also drips the loosely held body a little
  if (uMelt > 0.5 && !streaming) {
    F.y -= 0.35 * (1.0 - uGather) ;
  }

  // Damping + integration
  v = v * exp(-damp * uDt * (streaming ? 0.0 : 1.0)) + F * uDt;
  if (streaming) v *= exp(-0.35 * uDt);

  gl_FragColor = vec4(v, seed);
}
