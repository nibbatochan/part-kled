// src/model/cloud.ts
// A 3D model -> a true 3D point cloud: points spread over every mesh surface, in model space, so they can be
// turned to show the back and sides. Points are area-weighted and centred, and the model fits a unit sphere.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

export interface ModelCloud {
  /** xyz per point, centred on the origin, radius about 1 */
  positions: Float32Array;
  /** rgb per point, 0..1 sRGB */
  colors: Float32Array;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Surface area of one mesh in world space: the sum of its triangle areas. */
function worldArea(mesh: THREE.Mesh): number {
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  let area = 0;
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    _a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
    _b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
    _c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
    _b.sub(_a);
    _c.sub(_a);
    area += _b.cross(_c).length() * 0.5;
  }
  return area;
}

/** Points on the surface of every mesh in the model. Colour is the vertex colour where the mesh has one, else its material colour. */
export function sampleModelCloud(model: THREE.Object3D, count: number): ModelCloud {
  model.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry?.getAttribute('position')) meshes.push(o as THREE.Mesh);
  });
  if (meshes.length === 0) throw new Error('Model has no mesh to sample');

  // Centre and scale from the world bounds, so every model fits the same unit sphere
  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(1e-6, box.getSize(new THREE.Vector3()).length() / 2);
  const scale = 1 / radius;

  const areas = meshes.map(worldArea);
  const total = areas.reduce((s, a) => s + a, 0);
  if (total <= 0) throw new Error('Model has no surface area');

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();
  let written = 0;

  meshes.forEach((mesh, mi) => {
    // Each mesh gets its share of the points by area; the last mesh takes the rounding remainder
    const share = mi === meshes.length - 1 ? count - written : Math.round((count * areas[mi]) / total);
    if (share <= 0) return;
    const sampler = new MeshSurfaceSampler(mesh).build();
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const matColour = (material as THREE.MeshStandardMaterial).color;
    for (let k = 0; k < share && written < count; k++) {
      sampler.sample(p, n, col);
      if (!mesh.geometry.getAttribute('color') && matColour) col.copy(matColour);
      p.applyMatrix4(mesh.matrixWorld).sub(centre).multiplyScalar(scale);
      positions.set([p.x, p.y, p.z], written * 3);
      // Vertex colours and material colours are in linear space: back to sRGB for the shader
      col.convertLinearToSRGB();
      colors.set([col.r, col.g, col.b], written * 3);
      written++;
    }
  });

  return { positions: positions.subarray(0, written * 3), colors: colors.subarray(0, written * 3) };
}
