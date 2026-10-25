// src/shaders/sim_position.glsl
uniform sampler2D tHome;
uniform float uDt;
uniform float uDrift;
uniform float uGather;
uniform vec2  uLine;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(tPos, uv);
  vec3 p = posData.xyz;
  float age = posData.w;

  vec4 vs = texture2D(tVel, uv);
  vec3 v = vs.xyz;
  float seed = vs.w;

  vec3 home = texture2D(tHome, uv).xyz;

  vec3 newP = p + v * uDt;
  float newAge = age + uDt;

  // Spatially-guided peeling probability:
  // Drift controls how many particles peel off (high drift = massive stream of particles)
  // Gather firmly restrains and anchors particles back to home
  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  float windProj = dot(home.xy, lineDir);
  float peelProb = smoothstep(-0.05 + 0.15 * (1.0 - uDrift), 0.35, windProj) * (uDrift * 0.82) * (1.2 - uGather * 0.75);

  if (seed < peelProb) {
    // Thanos snap dissolution:
    // Floating particles drift far in the set direction, shrink, and fade out into nothingness
    float maxLife = (1.0 + uDrift * 2.2) * (1.3 - uGather * 0.6) * (0.6 + 0.8 * fract(seed * 43.19));
    float distFromHome = length(newP.xy - home.xy);
    float maxDist = (0.6 + uDrift * 2.2) * (1.4 - uGather * 0.7) * (0.6 + 0.8 * fract(seed * 17.3));

    if (newAge > maxLife || distFromHome > maxDist) {
      newP = home;
      newAge = 0.0;
    }
  } else {
    // Core body particles stay at home
    newAge = 0.0;
  }

  gl_FragColor = vec4(newP, newAge);
}
