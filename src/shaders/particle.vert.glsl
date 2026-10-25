// src/shaders/particle.vert.glsl
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tColor;
uniform sampler2D tColorNext;

uniform float uSize;
uniform float uDpr;
uniform float uMorph;
uniform vec3  uLightColor;
uniform float uLightOn;
uniform float uScan;
uniform float uScanActive;
uniform vec2  uLine;

attribute vec2 ref;

varying vec4 vColor;
varying float vSpeed;
varying float vScanGlow;

void main() {
  vec4 posData = texture2D(tPos, ref);
  vec3 pos = posData.xyz;

  vec3 vel = texture2D(tVel, ref).xyz;
  float speed = length(vel);
  vSpeed = speed;

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

  // Ultra-fine, crisp stipple dot size
  gl_PointSize = max(1.0, uSize * uDpr * (1.0 + pos.z * 0.3));
}
