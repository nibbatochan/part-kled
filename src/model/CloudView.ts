// src/model/CloudView.ts
// Shows a model's 3D point cloud on its own canvas. Drag turns it in any direction, wheel zooms, like a 3D
// viewer. Separate from the picture engine: the looks do not apply to a cloud.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ModelCloud } from './cloud';

const VERT = /* glsl */ `
  attribute vec3 color;
  uniform float uSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    // Round dots, not squares
    vec2 d = gl_PointCoord - vec2(0.5);
    if (dot(d, d) > 0.25) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export class CloudView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial;
  private raf = 0;
  private visible = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(0, 0, 3.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 12;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSize: { value: 4 } },
    });
  }

  /** Replace the shown cloud. Its geometry is built here, so a switch costs one upload. */
  show(cloud: ModelCloud): void {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(cloud.colors, 3));
    this.points = new THREE.Points(geometry, this.material);
    this.scene.add(this.points);
    this.controls.reset();
    if (!this.visible) {
      this.visible = true;
      this.loop();
    }
  }

  hide(): void {
    this.visible = false;
    cancelAnimationFrame(this.raf);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Point size in pixels scales with the stage height, so the cloud reads the same on any stage size
    this.material.uniforms.uSize.value = (height * this.renderer.getPixelRatio()) / 120;
  }

  dispose(): void {
    this.hide();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private loop = (): void => {
    if (!this.visible) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };
}
