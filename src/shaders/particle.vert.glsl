// src/shaders/particle.vert.glsl
// (LIFECYCLE_GLSL is prepended in ParticleRenderer.ts)
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tColor;
uniform sampler2D tColorNext;

uniform float uSize;
uniform float uDpr;
uniform float uMorph;
uniform float uDrift;
uniform float uGather;
uniform vec3  uLightColor;
uniform float uLightOn;
uniform float uScan;
uniform float uScanActive;
uniform vec2  uLine;
uniform vec3  uPointer;
uniform float uPointerOn;
uniform float uSplash;
uniform float uTime;

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

  // Streaming particles fade and shrink toward the end of their life, then respawn at home
  float phase = streamPhase(age, seed, uDrift, uGather);
  float launched = step(0.0001, phase);
  float fade = mix(1.0, streamFade(phase), launched);
  float sizeMod = 1.0 - 0.4 * phase;
  vFade = fade;

  // Color blending across morph
  vec4 colA = texture2D(tColor, ref);
  vec4 colB = texture2D(tColorNext, ref);
  vec4 baseCol = mix(colA, colB, clamp(uMorph, 0.0, 1.0));

  vec3 tint = (uLightOn > 0.5) ? uLightColor : vec3(1.0, 0.96, 0.90);

  // Moving particles pick up the light colour (pale, hot vapour off the subject)
  if (uLightOn > 0.5) {
    baseCol.rgb += uLightColor * clamp(speed * 0.8, 0.0, 0.9) * 0.55;
  }

  // Depth shading: nearer relief reads brighter, farther relief sinks into the dark
  baseCol.rgb *= 1.0 + clamp(pos.z, -0.4, 0.5) * 0.9;

  // Cursor: particles under the pointer flare into a bright cloud
  vec2 dc = pos.xy - uPointer.xy;
  float cr2 = dot(dc, dc);
  float radius = 0.17 + 0.16 * uSplash;
  float cursorGlow = uPointerOn * exp(-cr2 / (radius * radius));
  baseCol.rgb += tint * cursorGlow * 0.45;

  // SCAN: a thin band sweeping along LINE. Only particles inside the band light up.
  vScanGlow = 0.0;
  if (uScanActive > 0.5) {
    vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
    float u = dot(pos.xy, lineDir);
    float c = mix(-0.85, 0.85, uScan);
    float bd = (u - c) / 0.05;
    float g = exp(-bd * bd);
    g *= 1.0 + 1.2 * cursorGlow;
    vScanGlow = g;
    float lum = dot(baseCol.rgb, vec3(0.299, 0.587, 0.114));
    baseCol.rgb += tint * g * (0.25 + 0.8 * lum);
  }

  vColor = baseCol;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float sizeBoost = 1.0 + vScanGlow * 0.5 + cursorGlow * 0.35;
  gl_PointSize = max(1.0, uSize * uDpr * (1.0 + pos.z * 0.6) * sizeMod * sizeBoost);
}
