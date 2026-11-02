// src/model/modelInput.ts
// Studio entry for 3D model files (.glb, .obj). A model becomes an ordinary ProcessedImage, so the picture
// path (thumbs, cache, sampleLite, looks) runs unchanged. Its depth is rendered, not estimated, and is
// kept beside the picture for getSampleDataForImage to read.
import type * as THREE from 'three';
import { processImageFile, type ProcessedImage } from '../utils/image';
import { renderModelPicture } from './renderModel';
import { sampleModelCloud, type ModelCloud } from './cloud';

export const MODEL_FILE_RE = /\.(glb|obj)$/i;

export function isModelFile(file: File): boolean {
  return MODEL_FILE_RE.test(file.name);
}

interface ModelDepth {
  depth: Float32Array;
  dw: number;
  dh: number;
}

const modelDepths = new WeakMap<ProcessedImage, ModelDepth>();
const modelClouds = new WeakMap<ProcessedImage, ModelCloud>();

/** The rendered depth for a picture that came from a model, or null for a photo. */
export function modelDepthFor(img: ProcessedImage): ModelDepth | null {
  return modelDepths.get(img) ?? null;
}

/** The 3D point cloud for a picture that came from a model, or null for a photo. */
export function modelCloudFor(img: ProcessedImage): ModelCloud | null {
  return modelClouds.get(img) ?? null;
}

async function loadModel(file: File): Promise<THREE.Object3D> {
  if (/\.glb$/i.test(file.name)) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '');
    return gltf.scene;
  }
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  return new OBJLoader().parse(await file.text());
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Model render did not encode'))), 'image/png');
  });
}

/** Render a model file into a picture with its depth, and sample its 3D cloud. Throws if the file does not parse. */
export async function processModelFile(file: File, cloudCount: number): Promise<ProcessedImage> {
  const model = await loadModel(file);
  const picture = renderModelPicture(model);
  const cloud = sampleModelCloud(model, cloudCount);
  const png = await canvasToPng(picture.color);
  const base = file.name.replace(/\.[^.]+$/, '');
  const proc = await processImageFile(new File([png], `${base}.png`, { type: 'image/png' }));
  modelDepths.set(proc, { depth: picture.depth, dw: picture.width, dh: picture.height });
  modelClouds.set(proc, cloud);
  return proc;
}
