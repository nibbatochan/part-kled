// src/shaders/sim_position.glsl
// (LIFECYCLE_GLSL is prepended in Simulation.ts)
uniform sampler2D tHome;
uniform sampler2D tHomeNext;
uniform float uDt;
uniform float uDrift;
uniform float uGather;
uniform float uDepth;
uniform float uMorph;
uniform vec2  uLine;
uniform vec2  uExtent; // subject half-size (world units)
uniform float uTrails;

// Fraction of particles that peel off, weighted to the downwind side of the subject.
// The windward side stays solid and detailed, the leeward side dissolves into the stream.
// `light` is the source pixel luminance (0..1), stored in home.w by the sampler.
// Streamers come mostly from the downwind side and from the bright parts of the picture.
// A small floor keeps a few grain particles moving along LINE everywhere.
float streamProb(vec2 home, vec2 lineDir, float drift, float gather, float light) {
  vec2 perp = vec2(-lineDir.y, lineDir.x);
  // Position along the drift direction, as a fraction of how far the subject reaches that way:
  // -1 at the upwind edge, +1 at the downwind edge. Works for any image shape.
  float reach = max(abs(lineDir.x) * uExtent.x + abs(lineDir.y) * uExtent.y, 1e-3);
  float u = dot(home, lineDir) / reach;
  float ripple = 0.10 * sin(dot(home, perp) * 11.0 + 1.3) + 0.07 * sin(u * 9.0 + 3.1);
  float lee = smoothstep(-0.35, 0.95, u + ripple);
  lee *= lee;
  float lightW = 0.2 + 1.6 * light * light;
  float body = (mix(0.03, 0.62, drift) + 0.10 * smoothstep(0.8, 1.0, drift)) * (1.0 - 0.60 * gather * gather);
  // With TRAILS off a thin extra share of grain still streams along LINE, the same motion as trails
  float floorP = 0.012 + 0.010 * drift + (1.0 - uTrails) * 0.07 * drift;
  return clamp(lee * body * lightW + floorP, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(tPos, uv);
  vec3 p = posData.xyz;
  float age = posData.w;

  vec4 vs = texture2D(tVel, uv);
  vec3 v = vs.xyz;
  float seed = vs.w;

  // Home position, matching the velocity pass (morph + depth relief)
  float morphPhase = clamp(uMorph + (seed - 0.5) * 0.4, 0.0, 1.0);
  vec4 hA = texture2D(tHome, uv);
  vec4 hB = texture2D(tHomeNext, uv);
  float mph = smoothstep(0.0, 1.0, morphPhase);
  vec3 home = mix(hA.xyz, hB.xyz, mph);
  float light = mix(hA.w, hB.w, mph);
  home.z *= uDepth * 0.55;

  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  bool streamer = seed < streamProb(home.xy, lineDir, uDrift, uGather, light);

  vec3 newP = p + v * uDt;
  float newAge = age;

  if (!streamer) {
    newAge = -1.0;
  } else {
    newAge = (age < 0.0) ? 0.0 : age + uDt;
    float cycle = restTime(seed) + lifeTime(seed, uDrift, uGather);
    if (newAge > cycle || abs(newP.x) > 2.6 || abs(newP.y) > 2.0) {
      // Respawn at home and rest again with a fresh timer
      newP = home;
      newAge = 0.0;
    }
  }

  gl_FragColor = vec4(newP, newAge);
}
