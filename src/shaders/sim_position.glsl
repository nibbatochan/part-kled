// src/shaders/sim_position.glsl
uniform float uDt;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(tPos, uv);
  vec3 p = posData.xyz;
  float age = posData.w;

  vec3 v = texture2D(tVel, uv).xyz;

  gl_FragColor = vec4(p + v * uDt, age + uDt);
}
