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
  float maxLife = (1.0 + uDrift * 2.2) * (0.6 + 0.8 * fract(seed * 43.19));
  float lifeRatio = clamp(age / maxLife, 0.0, 1.0);

  float fade = 1.0;
  float sizeMod = 1.0;
  if (age > 0.001) {
    fade = smoothstep(1.0, 0.05, lifeRatio);
    sizeMod = 1.0 - 0.45 * lifeRatio;
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

  // Scan glow: concentric wavy ripples expanding from center
  vScanGlow = 0.0;
  if (uScanActive > 0.5) {
    float rCenter = length(pos.xy);
    float waveFront = uScan * 1.8;
    float distFromWave = abs(rCenter - waveFront);
    if (distFromWave < 0.18) {
      float wavePattern = sin(rCenter * 24.0 - uScan * 18.0);
      vScanGlow = (1.0 - distFromWave / 0.18) * (0.5 + 0.5 * wavePattern);
      float lum = dot(baseCol.rgb, vec3(0.299, 0.587, 0.114));
      vec3 lightTint = (uLightOn > 0.5 ? uLightColor : vec3(1.0, 0.96, 0.90));
      baseCol.rgb += lightTint * (vScanGlow * (0.6 + 2.5 * lum));
    }
  }

  vColor = baseCol;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Ultra-fine, crisp stipple dot size with noticeable 3D depth
  gl_PointSize = max(0.5, uSize * uDpr * (1.0 + pos.z * 0.7) * sizeMod);
}
