// src/shaders/streak.frag.glsl
uniform float uNegative;
uniform float uOnWhite;
uniform float uTrailStrength;

varying vec4 vColor;
varying float vAlpha;

void main() {
  if (vAlpha < 0.004) discard;

  vec3 rgb = vColor.rgb;
  if (uNegative > 0.5) rgb = 1.0 - rgb;
  if (uOnWhite > 0.5) rgb = 1.0 - rgb;

  // Soft glowing streaks blending with underlying particles
  gl_FragColor = vec4(rgb, vAlpha * vColor.a * 0.12 * uTrailStrength);
}
