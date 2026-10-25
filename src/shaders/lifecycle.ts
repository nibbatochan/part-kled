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
  float range = (1.0 + 1.6 * drift) * (1.2 - 0.5 * gather);
  return range * (0.55 + 0.9 * fract(seed * 43.19));
}

// 0 at launch, 1 at the end of the streaming life
float streamPhase(float age, float seed, float drift, float gather) {
  if (age < 0.0) return 0.0;
  return clamp((age - restTime(seed)) / lifeTime(seed, drift, gather), 0.0, 1.0);
}

// Opacity multiplier for a streaming particle
float streamFade(float phase) {
  float f = 1.0 - smoothstep(0.30, 1.0, phase);
  return f * f * (3.0 - 2.0 * f);
}
`;
