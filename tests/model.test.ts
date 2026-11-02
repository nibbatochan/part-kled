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
