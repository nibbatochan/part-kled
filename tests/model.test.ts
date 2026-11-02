import { describe, expect, it } from 'vitest';
import { depthFromZ } from '../src/model/renderModel';
import { isModelFile } from '../src/model/modelInput';

describe('depthFromZ', () => {
  it('reads nearest (largest z) as brightest, farthest as darkest', () => {
    expect(depthFromZ(1, -1, 1)).toBe(1);
    expect(depthFromZ(-1, -1, 1)).toBe(0);
    expect(depthFromZ(0, -1, 1)).toBe(0.5);
  });

  it('clamps values outside the range', () => {
    expect(depthFromZ(5, -1, 1)).toBe(1);
    expect(depthFromZ(-5, -1, 1)).toBe(0);
  });

  it('returns mid grey for a flat model', () => {
    expect(depthFromZ(0, 0, 0)).toBe(0.5);
  });
});

describe('isModelFile', () => {
  it('accepts glb and obj in any case', () => {
    expect(isModelFile(new File([''], 'chair.glb'))).toBe(true);
    expect(isModelFile(new File([''], 'Chair.OBJ'))).toBe(true);
  });

  it('rejects pictures, video and gltf (needs companion files)', () => {
    expect(isModelFile(new File([''], 'photo.png'))).toBe(false);
    expect(isModelFile(new File([''], 'clip.mp4'))).toBe(false);
    expect(isModelFile(new File([''], 'scene.gltf'))).toBe(false);
  });
});

describe('sampleModelCloud', () => {
  it('puts every point on the surface of a cube fitted to the unit sphere', async () => {
    const THREE = await import('three');
    const { sampleModelCloud } = await import('../src/model/cloud');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    const cloud = sampleModelCloud(mesh, 500);
    expect(cloud.positions.length).toBe(500 * 3);
    // Cube half-size 1 over radius sqrt(3): every point sits on a face at 1/sqrt(3)
    const face = 1 / Math.sqrt(3);
    for (let i = 0; i < 500; i++) {
      const m = Math.max(...[0, 1, 2].map((k) => Math.abs(cloud.positions[i * 3 + k])));
      expect(m).toBeCloseTo(face, 4);
    }
    // Material colour is red, converted to sRGB (red stays 1)
    expect(cloud.colors[0]).toBeCloseTo(1, 4);
    expect(cloud.colors[1]).toBeCloseTo(0, 4);
  });
});
