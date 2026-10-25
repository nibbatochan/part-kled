// src/shaders/trail_decay.frag.glsl
uniform sampler2D tPrior;
uniform float uDecay;
uniform float uClear;

varying vec2 vUv;

void main() {
  if (uClear > 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 prior = texture2D(tPrior, vUv);
  // PRD 8.5: Multiplied by 0.94 each frame
  gl_FragColor = prior * uDecay;
}
