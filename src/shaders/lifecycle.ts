// Shared GLSL for the streamer lifecycle. Prepended to the sim and render shaders so that the
// simulation, the point sprites and the streak lines all agree on when a particle rests at home,
// when it is streaming away, and how far through its life it is.
//
// tPos.w (age) convention:
//   age < 0         : core particle, held at home by the gather spring
//   0 <= age < rest : streamer waiting at home (still part of the picture)
//   age >= rest     : streamer travelling along LINE, fading out until age == rest + life
export const LIFECYCLE_GLSL = /* glsl */ `
float restTime(float seed) {
  return 0.35 + 2.4 * fract(seed * 91.713);
}

float lifeTime(float seed, float drift, float gather) {
  float range = (1.0 + 2.4 * drift) * (1.2 - 0.5 * gather);
  return range * (0.55 + 0.9 * fract(seed * 43.19));
}

// 0 at launch, 1 at the end of the streaming life
float streamPhase(float age, float seed, float drift, float gather) {
  if (age < 0.0) return 0.0;
  return clamp((age - restTime(seed)) / lifeTime(seed, drift, gather), 0.0, 1.0);
}

// SCAN field. mode 0 SWEEP (band along LINE), 1 RING (ring growing from the cursor or centre),
// 2 RADAR (beam turning around the cursor or centre), 3 LINES (fine bands travelling along LINE),
// 4 DEPTH (a band that moves from the far relief to the near relief, strongest on bright parts).
// z / zScale: particle depth and the largest depth the relief reaches. lum: particle brightness.
float scanBand(vec2 p, vec2 lineDir, float scan, float mode, vec2 c, float z, float zScale, float lum) {
  if (mode < 0.5) {
    float bd = (dot(p, lineDir) - mix(-0.85, 0.85, scan)) / 0.05;
    return exp(-bd * bd);
  }
  if (mode < 1.5) {
    float rd = (length(p - c) - scan * 1.1) / 0.04;
    return exp(-rd * rd);
  }
  if (mode < 2.5) {
    vec2 d = p - c;
    float diff = abs(mod(atan(d.y, d.x) - (scan * 6.2831853 - 3.1415927) + 3.1415927, 6.2831853) - 3.1415927);
    float wedge = exp(-(diff * diff) / 0.012);
    return wedge * mix(1.0, 0.35, smoothstep(0.35, 0.9, length(d)));
  }
  if (mode > 3.5) {
    // With no relief (DEPTH slider at 0) brightness stands in for depth
    float zn = (zScale > 0.01) ? clamp(z / zScale, -1.0, 1.0) * 0.5 + 0.5 : lum;
    float bd = (zn - scan) / 0.09;
    return exp(-bd * bd) * (0.3 + 0.7 * lum);
  }
  float f = abs(fract(dot(p, lineDir) * 7.0 - scan * 3.0) - 0.5) / 0.07;
  return exp(-f * f) * 0.8;
}

// Direction the scan pushes particles in
vec2 scanDir(vec2 p, vec2 lineDir, float mode, vec2 c) {
  if (mode < 0.5 || mode > 2.5) return lineDir;
  vec2 d = p - c;
  float l = max(length(d), 1e-3);
  if (mode < 1.5) return d / l;
  return vec2(-d.y, d.x) / l;
}

// Opacity multiplier for a streaming particle
float streamFade(float phase) {
  float f = 1.0 - smoothstep(0.30, 1.0, phase);
  return f * f * (3.0 - 2.0 * f);
}
`;
