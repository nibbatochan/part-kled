// src/shaders/streak.vert.glsl
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tColor;
uniform float uStreakLength;
uniform vec2  uLine;
uniform float uDrift;
uniform vec3  uLightColor;
uniform float uLightOn;
uniform float uScan;
uniform float uScanActive;

attribute vec2 ref;
attribute float isTail; // 0.0 for head, 1.0 for tail

varying vec4 vColor;
varying float vAlpha;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float seed = hash(ref);

  // CRITICAL: Not all particles do the tailing!
  // ~78% of particles stay firmly on the image without tailing.
  // Only the ~22% streaming particles that move from left to right do the tailing.
  if (seed >= 0.22) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec4 posData = texture2D(tPos, ref);
  vec3 pos = posData.xyz;
  float age = posData.w;

  vec4 velData = texture2D(tVel, ref);
  vec3 vel = velData.xyz;
  float speed = length(vel);

  // If particle is resting at home, slow, or has dissolved, skip trail
  if (age < 0.005 || speed < 0.1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float maxLife = (0.6 + uDrift * 1.2) * (0.6 + 0.8 * fract(seed * 43.19));
  float lifeRatio = clamp(age / maxLife, 0.0, 1.0);
  float fade = smoothstep(1.0, 0.05, lifeRatio);

  if (fade < 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec4 col = texture2D(tColor, ref);
  if (col.a < 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));

  // Dynamic extrusion along negative velocity vector
  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  vec3 dir = (speed > 0.15) ? normalize(vel) : vec3(lineDir, 0.0);
  float trailLen = uStreakLength * (0.35 + 0.65 * lum) * (0.5 + 0.8 * fract(seed * 29.3)) * (1.0 - 0.5 * lifeRatio);

  vec3 finalPos = pos;
  if (isTail > 0.5) {
    // Tail trails behind the moving particle
    finalPos = pos - dir * trailLen;
    vAlpha = 0.0;
  } else {
    // Head anchored at the moving particle
    vAlpha = 0.85 * fade;
  }

  // Scan illumination: wave travels along line direction, lighting up based on image light
  if (uScanActive > 0.5) {
    float proj = dot(pos.xy, lineDir) * 0.6 + 0.5;
    float distToScan = abs(proj - uScan);
    if (distToScan < 0.055) {
      float scanGlow = (1.0 - distToScan / 0.055);
      vec3 lightTint = (uLightOn > 0.5 ? uLightColor : vec3(1.0, 0.95, 0.88));
      col.rgb += lightTint * (scanGlow * (0.4 + 1.8 * lum));
    }
  }

  if (uLightOn > 0.5) {
    col.rgb = mix(col.rgb, uLightColor, clamp(lum * 0.35, 0.0, 0.5));
  }

  vColor = col;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}
