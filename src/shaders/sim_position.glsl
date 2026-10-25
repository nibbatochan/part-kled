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

  // Spatially-guided peeling probability:
  vec2 lineDir = normalize(uLine + vec2(1e-4, 0.0));
  float windProj = dot(home.xy, lineDir);
  float peelProb = smoothstep(0.02, 0.30, windProj) * (0.05 + uDrift * 0.45);

  if (seed < peelProb) {
    // Thanos snap dissolution:
    // Floating particles drift, shrink, and fade out into nothingness before regenerating
    float maxLife = (0.6 + uDrift * 1.2) * (0.6 + 0.8 * fract(seed * 43.19));
    float distFromHome = length(newP.xy - home.xy);
    float maxDist = (0.35 + uDrift * 1.2) * (0.6 + 0.8 * fract(seed * 17.3));

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
