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
uniform float uLightMode; // 0 = left, 1 = top, 2 = bottom, 3 = highlights
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

  // Compute photometric normal from position and depth displacement
  vec3 norm = normalize(vec3(pos.x * 0.8, pos.y * 0.8, max(0.2, pos.z + 0.5)));

  // Directional lighting & highlight interaction
  if (uLightOn > 0.5) {
    vec3 lightDir = vec3(0.0, 1.0, 0.5);
    float lightAmt = 0.0;

    if (uLightMode < 0.5) {
      // LEFT
      lightDir = normalize(vec3(-1.0, 0.1, 0.5));
      lightAmt = max(0.0, dot(norm, lightDir)) * 0.85 + max(0.0, -pos.x) * 0.4;
    } else if (uLightMode < 1.5) {
      // TOP
      lightDir = normalize(vec3(0.0, 1.0, 0.5));
      lightAmt = max(0.0, dot(norm, lightDir)) * 0.85 + max(0.0, pos.y) * 0.4;
    } else if (uLightMode < 2.5) {
      // BOTTOM
      lightDir = normalize(vec3(0.0, -1.0, 0.5));
      lightAmt = max(0.0, dot(norm, lightDir)) * 0.85 + max(0.0, -pos.y) * 0.4;
    } else {
      // HIGHLIGHTS: illuminates brightest specular peaks
      float lum = dot(baseCol.rgb, vec3(0.299, 0.587, 0.114));
      lightAmt = smoothstep(0.4, 0.95, lum) * 1.5;
    }

    // Apply directional light tint
    baseCol.rgb += uLightColor * (lightAmt * 0.9 + speed * 0.4);
  }

  // Scan luminous beam
  vScanGlow = 0.0;
  if (uScanActive > 0.5) {
    vec2 scanDir = normalize(uLine + vec2(1e-4, 0.0));
    float proj = dot(pos.xy, scanDir) * 0.6 + 0.5;
    float dist = abs(proj - uScan);
    if (dist < 0.055) {
      vScanGlow = (1.0 - dist / 0.055);
      vec3 beamCol = (uLightOn > 0.5 ? uLightColor : vec3(1.0, 0.95, 0.9));
      baseCol.rgb += beamCol * (vScanGlow * 2.0);
    }
  }

  vColor = baseCol;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Sharp, solid stipple dots for high fidelity photographic reproduction
  gl_PointSize = max(1.2, uSize * uDpr * (1.1 + pos.z * 0.45));
}
