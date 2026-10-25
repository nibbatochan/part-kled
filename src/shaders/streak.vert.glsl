// src/shaders/streak.vert.glsl
// (LIFECYCLE_GLSL is prepended in ParticleRenderer.ts)
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tColor;
uniform float uStreakLength;
uniform vec2  uLine;
uniform float uDrift;
uniform float uGather;
uniform vec3  uLightColor;
uniform float uLightOn;
uniform float uScan;
uniform float uScanActive;

attribute vec2 ref;
attribute float isTail; // 0.0 for head, 1.0 for tail

varying vec4 vColor;
varying float vAlpha;

void kill() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAlpha = 0.0;
  vColor = vec4(0.0);
}

void main() {
  vec4 posData = texture2D(tPos, ref);
  vec3 pos = posData.xyz;
  float age = posData.w;

  vec4 velData = texture2D(tVel, ref);
  vec3 vel = velData.xyz;
  float seed = velData.w;
  float speed = length(vel);

  // Only particles that are actually streaming leave a trail. The body stays crisp.
  float phase = streamPhase(age, seed, uDrift, uGather);
  if (age < 0.0 || phase < 0.002 || speed < 0.04) {
    kill();
    return;
  }

  float fade = streamFade(phase);
  if (fade < 0.01) {
    kill();
    return;
  }

  vec4 col = texture2D(tColor, ref);
  if (col.a < 0.02) {
    kill();
    return;
  }

  // Saturated, brightened colour on streaks
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(vec3(lum), col.rgb, 1.35);
  col.rgb = pow(max(col.rgb, vec3(0.0)), vec3(0.9)) * 1.25;

  // Extrude backwards along the real velocity: silky velocity streaks
  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  vec3 dir = normalize(vec3(vel.xy, 0.0) + vec3(lineDir * 1e-3, 0.0));
  float len = uStreakLength * (0.35 + 0.9 * fract(seed * 29.3)) * smoothstep(0.04, 0.35, speed);
  len *= (0.45 + 0.55 * lum) * (1.0 - 0.5 * phase);

  vec3 finalPos = pos;
  if (isTail > 0.5) {
    finalPos = pos - dir * len;
    vAlpha = 0.0;
  } else {
    vAlpha = 0.9 * fade;
  }

  // SCAN lights the streaks inside the band
  if (uScanActive > 0.5) {
    vec2 sd = normalize(uLine + vec2(1e-4, 0.0));
    float u = dot(pos.xy, sd);
    float c = mix(-0.85, 0.85, uScan);
    float bd = (u - c) / 0.05;
    float g = exp(-bd * bd);
    vec3 tint = (uLightOn > 0.5 ? uLightColor : vec3(1.0, 0.95, 0.88));
    col.rgb += tint * g * (0.3 + 0.9 * lum);
    vAlpha = min(1.0, vAlpha * (1.0 + 0.5 * g));
  }

  if (uLightOn > 0.5) {
    col.rgb = mix(col.rgb, uLightColor, clamp(lum * 0.4, 0.0, 0.55));
  }

  vColor = col;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}
