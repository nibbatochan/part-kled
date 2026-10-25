// src/shaders/sim_velocity.glsl
#include <common>

uniform sampler2D tHome;
uniform sampler2D tHomeNext;
uniform sampler2D tFlow;

uniform float uTime;
uniform float uDt;
uniform float uDrift;
uniform float uSplash;
uniform float uGather;
uniform float uDepth;
uniform float uMorph;
uniform float uMelt;
uniform float uScan;
uniform float uScanActive;

uniform vec3 uPointer;
uniform vec3 uPointerVel;
uniform float uRadius;
uniform vec2 uLine;

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

vec3 curlNoise(vec3 p) {
  const float e = 0.01;
  const float e2 = 0.02;

  float dx = snoise(p + vec3(e, 0.0, 0.0)) - snoise(p - vec3(e, 0.0, 0.0));
  float dy = snoise(p + vec3(0.0, e, 0.0)) - snoise(p - vec3(0.0, e, 0.0));
  float dz = snoise(p + vec3(0.0, 0.0, e)) - snoise(p - vec3(0.0, 0.0, e));

  vec3 p1 = p + vec3(12.34, 45.67, 89.01);
  float dx1 = snoise(p1 + vec3(e, 0.0, 0.0)) - snoise(p1 - vec3(e, 0.0, 0.0));
  float dy1 = snoise(p1 + vec3(0.0, e, 0.0)) - snoise(p1 - vec3(0.0, e, 0.0));
  float dz1 = snoise(p1 + vec3(0.0, 0.0, e)) - snoise(p1 - vec3(0.0, 0.0, e));

  vec3 d0 = vec3(dx, dy, dz) / e2;
  vec3 d1 = vec3(dx1, dy1, dz1) / e2;

  return vec3(d0.y - d1.z, d0.z - d1.x, d0.x - d1.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 p = texture2D(tPos, uv).xyz;
  vec4 vs = texture2D(tVel, uv);
  vec3 v = vs.xyz;
  float seed = vs.w;

  // Morph interpolation
  float morphPhase = clamp(uMorph + (seed - 0.5) * 0.4, 0.0, 1.0);
  float morphFactor = smoothstep(0.0, 1.0, morphPhase);
  vec3 homeA = texture2D(tHome, uv).xyz;
  vec3 homeB = texture2D(tHomeNext, uv).xyz;
  vec3 home = mix(homeA, homeB, morphFactor);
  home.z *= (uDepth * 2.2);

  // Force accumulation
  // GATHER: spring force returning particles to their home position (dimmed by 50%)
  vec3 F = (home - p) * (0.5 * mix(0.5, 9.0, uGather * uGather));

  // DRIFT: fluid curl noise
  vec3 noiseF = curlNoise(p * 1.5 + vec3(0.0, 0.0, uTime * 0.12));
  F += noiseF * (uDrift * 1.4);

  // LINE direction & DRAW strokes
  vec2 flowSample = texture2D(tFlow, clamp(p.xy * 0.5 + 0.5, 0.0, 1.0)).xy;
  vec2 streakDir = (flowSample + uLine) * (0.35 + uDrift * 0.8);
  F.xy += streakDir;

  // TRACK & SPLASH: pointer repulsion and kinetic burst
  vec3 d = p - uPointer;
  float r = length(d.xy);
  float k = smoothstep(uRadius, 0.0, r);
  float pointerSpeed = length(uPointerVel);
  F += normalize(d + vec3(1e-4, 1e-4, 0.05)) * k * (2.0 + uSplash * 14.0 * pointerSpeed);

  // TRAVEL: MELT sags downward
  F.y -= uMelt * 1.5 * (1.0 - uGather * 0.85);

  // SCAN: sweep impulse along line direction
  if (uScanActive > 0.5) {
    vec2 scanDir = normalize(uLine + vec2(1e-4, 0.0));
    float proj = dot(p.xy, scanDir) * 0.5 + 0.5;
    float distToScan = abs(proj - uScan);
    if (distToScan < 0.04) {
      float scanStrength = (1.0 - distToScan / 0.04);
      F += vec3(scanDir * 1.5, 2.5) * scanStrength;
    }
  }

  // Damping and integration
  float damp = exp(-mix(1.8, 3.5, uGather) * uDt);
  v = v * damp + F * uDt;

  gl_FragColor = vec4(v, seed);
}
