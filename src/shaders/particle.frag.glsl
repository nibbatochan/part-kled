// src/shaders/particle.frag.glsl
uniform float uNegative;
uniform float uOnWhite;

varying vec4 vColor;
varying float vSpeed;
varying float vScanGlow;

// 4x4 Bayer dither matrix
const float bayerMatrix[16] = float[16](
   0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
  12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
   3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
  15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
);

void main() {
  // Round soft particle sprite with crisp stipple core
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  float alpha = 1.0 - smoothstep(0.32, 0.5, dist);

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
