// src/shaders/composite.frag.glsl
uniform sampler2D tScene;
uniform sampler2D tTrail;
uniform float uTrailsEnabled;
uniform float uOnWhite;

varying vec2 vUv;

// 4x4 Bayer dither matrix (PRD 8.5: Add 1/255 ordered dither to final composite to stop banding)
const float bayerMatrix[16] = float[16](
   0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
  12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
   3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
  15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
);

void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec3 rgb = scene.rgb;
  float a = scene.a;

  if (uTrailsEnabled > 0.5) {
    vec4 trail = texture2D(tTrail, vUv);
    if (uOnWhite > 0.5) {
      rgb = mix(rgb, trail.rgb, trail.a * 0.4);
    } else {
      // Additive velvety persistence glow
      rgb += trail.rgb * 0.30;
    }
    a = max(a, trail.a);
  }

  // Soft shoulder: dense, hot areas roll off toward white instead of clipping, and colour keeps
  // its hue. Skipped on paper, where blending is not additive.
  if (uOnWhite < 0.5) {
    rgb = 1.0 - exp(-rgb * 1.9);
  }

  // 1/255 ordered dither to prevent banding in dark gradients
  int x = int(mod(gl_FragCoord.x, 4.0));
  int y = int(mod(gl_FragCoord.y, 4.0));
  float dither = (bayerMatrix[y * 4 + x] - 0.5) * (1.0 / 255.0);
  rgb += dither;

  gl_FragColor = vec4(rgb, a);
}
