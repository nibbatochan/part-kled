// src/shaders/streak.vert.glsl
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tColor;
uniform float uStreakLength;
uniform vec3  uLightColor;
uniform float uLightOn;

attribute vec2 ref;
attribute float isTail; // 0.0 for head, 1.0 for tail

varying vec4 vColor;
varying float vAlpha;
varying float vSpeed;

void main() {
  vec3 pos = texture2D(tPos, ref).xyz;
  vec3 vel = texture2D(tVel, ref).xyz;
  vec4 col = texture2D(tColor, ref);

  float speed = length(vel);
  vSpeed = speed;

  // Vertex 0 at position, Vertex 1 trailing along negative velocity
  vec3 finalPos = pos;
  if (isTail > 0.5) {
    finalPos = pos - vel * (uStreakLength * 0.12);
    vAlpha = 0.0;
  } else {
    vAlpha = 1.0;
  }

  if (uLightOn > 0.5) {
    col.rgb = mix(col.rgb, uLightColor, clamp(speed * 0.8, 0.0, 1.0));
  }
  vColor = col;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}
