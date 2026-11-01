// src/lite/bitmapGlsl.ts
// BITMAP overlay: one full-frame pass over the finished picture (after the looks, the glow and the surface effects).
// Off is the neutral setting, so the pass costs nothing to leave in the chain. It works at device pixels, so the
// detail is the screen's, not a cell's. Shared GLSL: functions only; the composite shader declares its uniforms.

export const BITMAP_GLSL = `
const vec3 BIT_INK = vec3(0.914, 0.929, 0.933);   // #e9ecee, the ink of the one-ink modes

float bitHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bitIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// Triangular remap of a uniform value to [0,1], centred on 0.5: removes the banding of a plain threshold (Wronski)
float bitTri(float u) { return u < 0.5 ? sqrt(u * 0.5) : 1.0 - sqrt((1.0 - u) * 0.5); }

// Ordered dither threshold from bits, no texture. n = 2 gives 4x4, n = 3 gives 8x8.
float bitBayer(ivec2 cell, int n) {
  ivec2 p = cell & ((1 << n) - 1);
  int a = p.x ^ p.y;
  int v = 0;
  for (int k = 0; k < 3; k++) {
    if (k < n) v += (((a >> k) & 1) << (2 * (n - 1 - k) + 1)) + (((p.y >> k) & 1) << (2 * (n - 1 - k)));
  }
  return (float(v) + 0.5) / float(1 << (2 * n));
}

// Oklab (Ottosson): lightness that tracks the eye, so ramps and nearest-colour tests stay even
vec3 bitSrgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 bitLinToSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 bitToOklab(vec3 c) {
  vec3 v = bitSrgbToLin(c);
  vec3 lms = pow(vec3(dot(v, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
                      dot(v, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
                      dot(v, vec3(0.0883024619, 0.2817188376, 0.6299787005))), vec3(1.0 / 3.0));
  return vec3(dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
              dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}
vec3 bitFromOklab(vec3 o) {
  vec3 lms = vec3(o.x + 0.3963377774 * o.y + 0.2158037573 * o.z,
                  o.x - 0.1055613458 * o.y - 0.0638541728 * o.z,
                  o.x - 0.0894841775 * o.y - 1.2914855480 * o.z);
  lms = lms * lms * lms;
  return bitLinToSrgb(vec3(dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
                           dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
                           dot(lms, vec3(-0.0041960863, -0.7034186147, 1.7076147010))));
}

// DISSOLVE ramp: five sRGB stops, deep blue to teal to pink to hot white, as in the night-train reference
vec3 bitRampCol(int i) {
  if (i <= 0) return vec3(0.039, 0.071, 0.133);
  if (i == 1) return vec3(0.122, 0.353, 0.431);
  if (i == 2) return vec3(0.498, 0.722, 0.769);
  if (i == 3) return vec3(0.910, 0.471, 0.561);
  return vec3(1.0, 0.941, 0.902);
}

// DISSOLVE: each cell takes the ramp colour of its brightness; the two nearest stops are dithered by a 4x4
// cell pattern, and a hash breaks the boundary up so the gradient falls apart into dots, not bands.
// The brightest cells bleed a glow of the scene's hot parts over their neighbours.
vec3 bitDissolve(vec2 px, vec2 res, sampler2D src, float cellPx, float glowAmt) {
  vec2 id = floor(px / cellPx);
  vec2 c = (id + 0.5) * cellPx;
  float t = clamp(dot(texture(src, c / res).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float f = t * 4.0;
  float fl = floor(f);
  float thr = bitBayer(ivec2(id), 2) + (bitHash(id) - 0.5) * 0.12;
  vec3 col = bitRampCol(int(fl) + int(step(thr, f - fl)));
  vec3 g = vec3(0.0);
  float R = 3.0 * cellPx;
  for (int k = 0; k < 12; k++) {
    float a = float(k) * 2.39996;                    // golden angle: twelve taps spread evenly over the disc
    float r = R * sqrt((float(k) + 0.5) / 12.0);
    vec3 s = texture(src, (c + r * vec2(cos(a), sin(a))) / res).rgb;
    g += s * max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 0.6, 0.0);
  }
  col += (g / 12.0) * glowAmt * 2.0 * bitRampCol(4);
  return clamp(col, 0.0, 1.0);
}

// CGA 16-colour palette 1, mode 4: black, cyan, magenta, light grey, and the bright cyan, magenta, white [Wikipedia, CGA]
vec3 bitCga(int i) {
  if (i == 0) return vec3(0.0);
  if (i == 1) return vec3(0.0, 0.667, 0.667);
  if (i == 2) return vec3(0.667, 0.0, 0.667);
  if (i == 3) return vec3(0.667);
  if (i == 4) return vec3(0.333, 1.0, 1.0);
  if (i == 5) return vec3(1.0, 0.333, 1.0);
  return vec3(1.0);
}
// Nearest CGA colour in Oklab; the second nearest when the Bayer threshold b falls under the mix
vec3 bitCgaPick(vec3 src, float b, float amt) {
  vec3 so = bitToOklab(src);
  float d1 = 1e9; float d2 = 1e9; int i1 = 0; int i2 = 0;
  for (int i = 0; i < 7; i++) {
    vec3 e = so - bitToOklab(bitCga(i));
    float d = dot(e, e);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  float frac = clamp(2.0 * amt * d1 / (d1 + d2 + 1e-6), 0.0, 1.0);
  return bitCga(frac > b ? i2 : i1);
}

// Stipple at screen scale: one dot per cell of cellPx, placed by hash, radius and keep-chance from the scene's tone at the cell centre
float bitStipple(vec2 px, vec2 res, float cellPx, float density, float gamma, float size, sampler2D src) {
  vec2 id = floor(px / cellPx);
  vec2 centre = (id + 0.5) * cellPx;
  float tone = dot(texture(src, centre / res).rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 h = vec2(bitHash(id), bitHash(id + 17.3));
  float r = size * 0.5 * cellPx * sqrt(clamp(tone, 0.0, 1.0));
  float keep = step(h.x, density * pow(clamp(tone, 0.0, 1.0), gamma));
  float aa = 0.7;
  float m = keep * (1.0 - smoothstep(r - aa, r + aa, length(px - (centre + (h - 0.5) * (cellPx - 2.0 * r)))));
  return m;
}

// The overlay. uBit = (mode, amount, cell px, level); uBit2 = (ramp, midpoint, dither, size).
// mode: 0 off, 1 INK, 2 DISSOLVE, 3 CGA, 4 STIPPLE.
vec3 bitmapStage(vec3 c, vec2 px, vec2 res, sampler2D src, vec4 bit, vec4 bit2) {
  int mode = int(bit.x + 0.5);
  if (mode == 0 || mode == 5) return c;            // HALO is applied to the picture before it becomes particles (haloImage.ts)
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 o = c;
  if (mode == 1) {                                  // INK: one ink on black, triangular noise threshold per pixel
    float t = bit.w + (bitTri(bitIgn(px)) - 0.5) * bit2.w;
    o = mix(c, BIT_INK, step(t, l));              // empty places keep the picture as it is: no added background
  } else if (mode == 2) {                           // DISSOLVE: pixel cells, dithered ramp, glow from the hot parts
    o = bitDissolve(px, res, src, bit.z, bit.w);
    if (l < 0.02) o = c;                            // no picture here: add nothing
  } else if (mode == 3) {                           // CGA: nearest CGA colour per pixel, dithered between the two nearest
    o = bitCgaPick(c, bitBayer(ivec2(px), 3), bit2.z);
  } else {                                          // STIPPLE
    o = mix(c, BIT_INK, bitStipple(px, res, bit.z, bit.w, 1.2, bit2.w, src));
  }
  return mix(c, o, bit.y);
}
`;
