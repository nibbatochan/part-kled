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

// Fraction of particles that peel off, weighted to the downwind side of the subject.
// The windward side stays solid and detailed, the leeward side dissolves into the stream.
float streamProb(vec2 home, vec2 lineDir, float drift, float gather) {
  vec2 perp = vec2(-lineDir.y, lineDir.x);
  float u = dot(home, lineDir);
  float ripple = 0.07 * sin(dot(home, perp) * 11.0 + 1.3) + 0.05 * sin(u * 17.0 + 3.1);
  float lee = smoothstep(-0.18, 0.55, u + ripple);
  lee *= lee;
  float body = mix(0.04, 0.55, drift) * (1.0 - 0.60 * gather * gather);
  return clamp(lee * body + 0.02 * drift, 0.0, 1.0);
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
  vec3 home = mix(texture2D(tHome, uv).xyz, texture2D(tHomeNext, uv).xyz, smoothstep(0.0, 1.0, morphPhase));
  home.z *= uDepth * 0.55;

  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  bool streamer = seed < streamProb(home.xy, lineDir, uDrift, uGather);

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
