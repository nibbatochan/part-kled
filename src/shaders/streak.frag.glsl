// src/shaders/streak.frag.glsl
uniform float uNegative;
uniform float uOnWhite;

varying vec4 vColor;
varying float vAlpha;
varying float vSpeed;

void main() {
  // Skip slow particles
  if (vSpeed < 0.05) discard;

  vec3 rgb = vColor.rgb;
  if (uNegative > 0.5) rgb = 1.0 - rgb;
  if (uOnWhite > 0.5) rgb = 1.0 - rgb;

  float a = vAlpha * clamp(vSpeed * 1.5, 0.0, 0.7);
  gl_FragColor = vec4(rgb, a);
}
