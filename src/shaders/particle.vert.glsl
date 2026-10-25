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
uniform float uScanMode;
uniform float uZScale;
uniform vec2  uScanCenter;

attribute vec2 ref;

varying vec4 vColor;
varying float vSpeed;
varying float vScanGlow;
varying float vFade;
varying float vGrain;

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
  // Streamers keep a brightness floor so they stay readable with TRAILS off
  // Streaming grain is fine dust: dimmer and 1px, so dense streams read as threads, not a white wash
  float fade = mix(1.0, max(streamFade(phase), 0.25) * 0.55, launched);
  float sizeMod = 1.0 - 0.3 * phase;
  vFade = fade;

  // Per-particle grain: a fixed brightness wobble that reads as film grain
  vGrain = 1.0;

  // Color blending across morph
  vec4 colA = texture2D(tColor, ref);
  vec4 colB = texture2D(tColorNext, ref);
  vec4 baseCol = mix(colA, colB, clamp(uMorph, 0.0, 1.0));

  vec3 tint = (uLightOn > 0.5) ? uLightColor : vec3(1.0, 0.96, 0.90);

  // Moving particles pick up the light colour (pale, hot vapour off the subject)
  if (uLightOn > 0.5) {
    baseCol.rgb += uLightColor * clamp(speed * 0.8, 0.0, 0.9) * 0.55;
  }


  // Cursor: particles under the pointer flare into a bright cloud
  vec2 dc = pos.xy - uPointer.xy;
  float cr2 = dot(dc, dc);
  float radius = 0.17 + 0.16 * uSplash;
  float cursorGlow = uPointerOn * exp(-cr2 / (radius * radius));
  baseCol.rgb += tint * cursorGlow * 0.18;

  // SCAN: a thin band sweeping along LINE. Only particles inside the band light up.
  vScanGlow = 0.0;
  if (uScanActive > 0.5) {
    vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
    float lum = dot(baseCol.rgb, vec3(0.299, 0.587, 0.114));
    float g = scanBand(pos.xy, lineDir, uScan, uScanMode, uScanCenter, pos.z, uZScale, lum);
    g *= 1.0 + 0.4 * cursorGlow;
    vScanGlow = g;
    baseCol.rgb += tint * g * (0.1 + 0.35 * lum);
  }

  vColor = baseCol;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float sizeBoost = 1.0 + vScanGlow * 0.3 + cursorGlow * 0.1;
  // Tiny dots: about one device pixel each, so the picture reads as fine grain, not blobs
  gl_PointSize = max(mix(2.0, 1.0, launched), uSize * uDpr * (1.0 + pos.z * 0.3) * sizeMod * sizeBoost);
}
