// src/shaders/sim_position.glsl
uniform sampler2D tHome;
uniform float uDt;
uniform float uDrift;
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

  // Thanos snap dissolution:
  // When drifting ash particles reach maximum lifetime or drift distance,
  // they dissolve completely into nothingness and regenerate at home
  float maxLife = (0.7 + uDrift * 1.8) * (0.6 + 0.8 * fract(seed * 43.19));
  float distFromHome = length(newP.xy - home.xy);
  float maxDist = (0.3 + uDrift * 1.4) * (0.5 + 0.8 * fract(seed * 17.3));

  float peelThreshold = 0.08 + uDrift * 0.38;
  if (seed < peelThreshold) {
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
