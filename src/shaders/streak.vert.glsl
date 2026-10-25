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

  vec3 pos = texture2D(tPos, ref).xyz;
  vec4 col = texture2D(tColor, ref);

  if (col.a < 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));

  // Streaming direction set by LINE widget (e.g. towards the right)
  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));

  // Trail length controlled by DRIFT slider and LINE widget
  float trailLen = uStreakLength * (0.35 + 0.65 * lum) * (0.4 + 1.2 * fract(seed * 29.3));

  vec3 finalPos = pos;
  if (isTail > 0.5) {
    // Tail trails behind the moving particle (backwards along line direction)
    finalPos.xy = pos.xy - lineDir * trailLen;
    finalPos.z += (fract(seed * 71.1) - 0.5) * 0.02;
    vAlpha = 0.0;
  } else {
    // Head anchored at the moving particle
    vAlpha = 0.85;
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
