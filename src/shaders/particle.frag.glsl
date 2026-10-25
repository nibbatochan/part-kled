// src/shaders/particle.frag.glsl
uniform float uNegative;
uniform float uOnWhite;

varying vec4 vColor;
varying float vSpeed;
varying float vScanGlow;
varying float vFade;
varying float vGrain;

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

  // Hard-edged grain dot with a 1px soft rim, not a blurred sprite
  float alpha = (1.0 - smoothstep(0.55, 1.0, r2)) * vFade;
  if (alpha < 0.02) discard;

  vec3 rgb = vColor.rgb;

  // Colour is the sampled source colour. No saturation, gamma or brightness change here.
  // On dark paper the dots are accumulated as (colour * weight, weight) and the composite pass
  // divides by the total weight, so brightness equals the source however many dots overlap.

  if (uNegative > 0.5) {
    rgb = 1.0 - rgb;
  }

  if (uOnWhite > 0.5) {
    rgb = 1.0 - rgb;
    alpha *= 0.85;
  }

  if (vColor.a < 0.05) discard;

  float a = alpha * vColor.a;
  if (uOnWhite > 0.5) {
    gl_FragColor = vec4(rgb, a);
  } else {
    gl_FragColor = vec4(rgb * a, a);
  }
}
