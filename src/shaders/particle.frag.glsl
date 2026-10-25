// src/shaders/particle.frag.glsl
uniform float uNegative;
uniform float uOnWhite;

varying vec4 vColor;
varying float vSpeed;
varying float vScanGlow;
varying float vFade;

// 4x4 Bayer dither matrix
const float bayerMatrix[16] = float[16](
   0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
  12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
   3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
  15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
);

void main() {
  // Filmic Gaussian soft particle sprite (avoids polygon/jagged edge cutoffs)
  vec2 coord = gl_PointCoord - vec2(0.5);
  float r2 = dot(coord, coord) * 4.0; // r2 in [0, 1]
  if (r2 > 1.0) discard;

  float alpha = exp(-3.5 * r2) * vFade;
  if (alpha < 0.015) discard;

  vec3 rgb = vColor.rgb;

  if (uNegative > 0.5) {
    rgb = 1.0 - rgb;
  }

  if (uOnWhite > 0.5) {
    rgb = 1.0 - rgb;
    alpha *= 0.85;
  }

  // Ordered dither to prevent dark gradient quantization
  int x = int(mod(gl_FragCoord.x, 4.0));
  int y = int(mod(gl_FragCoord.y, 4.0));
  float dither = (bayerMatrix[y * 4 + x] - 0.5) * (1.0 / 255.0);
  rgb += dither;

  if (vColor.a < 0.05) discard;

  gl_FragColor = vec4(rgb, alpha * vColor.a);
}
