// src/shaders/trail_fade.frag.glsl
uniform sampler2D tDiffuse;
uniform float uFade;

varying vec2 vUv;

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  gl_FragColor = color * uFade;
}
