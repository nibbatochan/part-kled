// src/model/renderModel.ts
// 3D model -> picture + depth. A fixed orthographic front view is rendered twice: once lit for colour
// (alpha = coverage), once as depth (bright = near, black = empty). The output has the same shape as a
// photo and its estimated depth, so the existing sampleLite() path takes it unchanged.
import * as THREE from 'three';

export interface ModelPicture {
  /** Colour canvas. Alpha 0 outside the model. */
  color: HTMLCanvasElement;
  /** Depth at canvas size, 0..1, 1 = nearest to the viewer. Empty space reads 0. */
  depth: Float32Array;
  width: number;
  height: number;
}

/** Depth 0..1 from a world z inside [zMin, zMax]. The viewer sits on +z, so larger z is nearer and brighter. */
export function depthFromZ(z: number, zMin: number, zMax: number): number {
  const span = zMax - zMin;
  if (span <= 0) return 0.5;
  return Math.min(1, Math.max(0, (z - zMin) / span));
}

const DEPTH_VERT = /* glsl */ `
  varying float vZ;
  void main() {
    vZ = (modelMatrix * vec4(position, 1.0)).z;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const DEPTH_FRAG = /* glsl */ `
  uniform float uZMin;
  uniform float uZMax;
  varying float vZ;
  void main() {
    float t = clamp((vZ - uZMin) / (uZMax - uZMin), 0.0, 1.0);
    gl_FragColor = vec4(vec3(t), 1.0);
  }
`;

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** Fit the model's bounds into a canvas whose longest side is maxSide, and render it from the front. */
export function renderModelPicture(model: THREE.Object3D, maxSide = 1024): ModelPicture {
  // Centre the model on the origin so the camera and the depth range are simple
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  const scene = new THREE.Scene();
  scene.add(model);

  const modelW = Math.max(size.x, 1e-6);
  const modelH = Math.max(size.y, 1e-6);
  const aspect = modelW / modelH;
  const width = aspect >= 1 ? maxSide : Math.max(2, Math.round(maxSide * aspect));
  const height = aspect >= 1 ? Math.max(2, Math.round(maxSide / aspect)) : maxSide;
  const canvasAspect = width / height;

  // Half height that fits both the height and the width, with 8% margin around the model
  const halfH = Math.max(modelH / 2, modelW / 2 / canvasAspect) * 1.08;
  const halfW = halfH * canvasAspect;
  const far = size.length() * 2 + 2;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, far);
  camera.position.set(0, 0, size.length() + 1);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.4, 0.6, 1);
  scene.add(key);

  const glCanvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  try {
    // Colour pass: transparent background, so alpha marks the model's coverage
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const color = makeCanvas(width, height);
    color.getContext('2d', { willReadFrequently: true })!.drawImage(glCanvas, 0, 0, width, height);

    // Depth pass: every mesh drawn with the depth shader, empty space stays black
    const depthMaterial = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VERT,
      fragmentShader: DEPTH_FRAG,
      uniforms: { uZMin: { value: -size.z / 2 }, uZMax: { value: size.z / 2 } },
    });
    scene.overrideMaterial = depthMaterial;
    renderer.setClearColor(0x000000, 1);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;

    const depthCtx = makeCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
    depthCtx.drawImage(glCanvas, 0, 0, width, height);
    const px = depthCtx.getImageData(0, 0, width, height).data;
    const depth = new Float32Array(width * height);
    for (let i = 0; i < depth.length; i++) depth[i] = px[i * 4] / 255;
    depthMaterial.dispose();

    return { color, depth, width, height };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
