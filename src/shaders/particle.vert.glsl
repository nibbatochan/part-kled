// src/shaders/particle.vert.glsl
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tColor;
uniform sampler2D tColorNext;

uniform float uSize;
uniform float uDpr;
uniform float uMorph;
uniform float uDrift;
uniform vec3  uLightColor;
uniform float uLightOn;
uniform float uScan;
uniform float uScanActive;
uniform vec2  uLine;

attribute vec2 ref;

varying vec4 vColor;
varying float vSpeed;
varying float vScanGlow;
varying float vFade;

void main() {
  vec4 posData = texture2D(tPos, ref);
  vec3 pos = posData.xyz;
  float age = posData.w;

  vec4 velData = texture2D(tVel, ref);
  vec3 vel = velData.xyz;
  float seed = velData.w;
  float speed = length(vel);
  vSpeed = speed;

  // Thanos snap dissolution:
  // Disintegrating particles shrink and fade out as they drift
  float maxLife = (0.7 + uDrift * 1.8) * (0.6 + 0.8 * fract(seed * 43.19));
  float lifeRatio = clamp(age / maxLife, 0.0, 1.0);

  float fade = 1.0;
  float sizeMod = 1.0;
  if (age > 0.001) {
    fade = 1.0 - smoothstep(0.12, 0.95, lifeRatio);
    sizeMod = 1.0 - 0.5 * lifeRatio;
  }
  vFade = fade;

  // Color blending across morph
  vec4 colA = texture2D(tColor, ref);
  vec4 colB = texture2D(tColorNext, ref);
  vec4 baseCol = mix(colA, colB, clamp(uMorph, 0.0, 1.0));

  // Speed highlight: fast particles glow in light color
  if (uLightOn > 0.5) {
    baseCol.rgb += uLightColor * clamp(speed * 0.9, 0.0, 1.8);
  }

  // Scan glow: wave along line direction illuminating based on image light
  vScanGlow = 0.0;
  if (uScanActive > 0.5) {
    vec2 scanDir = normalize(uLine + vec2(1e-4, 0.0));
    float proj = dot(pos.xy, scanDir) * 0.6 + 0.5;
    float dist = abs(proj - uScan);
    if (dist < 0.05) {
      vScanGlow = (1.0 - dist / 0.05);
      float lum = dot(baseCol.rgb, vec3(0.299, 0.587, 0.114));
      vec3 lightTint = (uLightOn > 0.5 ? uLightColor : vec3(1.0, 0.96, 0.9));
      baseCol.rgb += lightTint * (vScanGlow * (0.5 + 1.8 * lum));
    }
  }

  vColor = baseCol;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Ultra-fine, crisp stipple dot size (shrinks as ash dissolves)
  gl_PointSize = max(0.5, uSize * uDpr * (1.0 + pos.z * 0.3) * sizeMod);
}
