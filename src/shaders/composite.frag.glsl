// src/shaders/composite.frag.glsl
uniform sampler2D tScene;
uniform sampler2D tTrail;
uniform float uTrailsEnabled;
uniform float uOnWhite;
uniform float uBlack;
uniform float uWhite;
uniform float uGamma;
uniform float uContrast;
uniform float uHue;
uniform float uSaturation;
uniform float uBW;
uniform float uTrailGain;

varying vec2 vUv;

// 4x4 Bayer dither matrix (PRD 8.5: Add 1/255 ordered dither to final composite to stop banding)
const float bayerMatrix[16] = float[16](
   0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
  12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
   3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
  15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
);

// CSS-style hue rotation (degrees)
vec3 hueRotate(vec3 c, float deg) {
  float a = radians(deg);
  float cs = cos(a);
  float sn = sin(a);
  mat3 m = mat3(
    0.213 + cs * 0.787 - sn * 0.213, 0.213 - cs * 0.213 + sn * 0.143, 0.213 - cs * 0.213 - sn * 0.787,
    0.715 - cs * 0.715 - sn * 0.715, 0.715 + cs * 0.285 + sn * 0.140, 0.715 - cs * 0.715 + sn * 0.715,
    0.072 - cs * 0.072 + sn * 0.928, 0.072 - cs * 0.072 - sn * 0.283, 0.072 + cs * 0.928 + sn * 0.072);
  return m * c;
}

void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec3 rgb = scene.rgb;
  float a = scene.a;

  // Dark paper: scene holds (sum colour*weight, sum weight). Mean colour * coverage gives the
  // source brightness regardless of how many dots overlap a pixel.
  if (uOnWhite < 0.5) {
    float w = scene.a;
    // 0.9 gamma: a slight lift of the brightness curve
    rgb = pow(max(scene.rgb / max(w, 1e-4), vec3(0.0)), vec3(0.9)) * min(w, 1.0);
    a = min(w, 1.0);
  }

  if (uTrailsEnabled > 0.5) {
    vec4 trail = texture2D(tTrail, vUv);
    if (uOnWhite > 0.5) {
      rgb = mix(rgb, trail.rgb, trail.a * 0.4);
    } else {
      // Additive velvety persistence glow
      rgb += trail.rgb * 0.38 * uTrailGain;
    }
    a = max(a, trail.a);
  }

  // Dark paper only: the effects tab. Levels, gamma, curve, hue, saturation, then black & white.
  if (uOnWhite < 0.5) {
    rgb = clamp((rgb - uBlack) / max(uWhite - uBlack, 1e-3), 0.0, 1.0);
    rgb = pow(rgb, vec3(1.0 / uGamma));
    rgb = clamp(0.5 + (rgb - 0.5) * (1.0 + uContrast), 0.0, 1.0);
    rgb = hueRotate(rgb, uHue);
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = clamp(mix(vec3(lum), rgb, uSaturation), 0.0, 1.0);
    if (uBW > 0.5) rgb = vec3(lum);
  }

  // 1/255 ordered dither to prevent banding in dark gradients
  int x = int(mod(gl_FragCoord.x, 4.0));
  int y = int(mod(gl_FragCoord.y, 4.0));
  float dither = (bayerMatrix[y * 4 + x] - 0.5) * (1.0 / 255.0);
  rgb += dither;

  gl_FragColor = vec4(rgb, a);
}
