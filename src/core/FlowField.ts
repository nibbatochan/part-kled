// src/core/FlowField.ts
import * as THREE from 'three';

export class FlowField {
  public texture: THREE.DataTexture;
  private width = 256;
  private height = 256;
  private data: Float32Array;

  constructor() {
    this.data = new Float32Array(this.width * this.height * 4);
    this.texture = new THREE.DataTexture(
      this.data,
      this.width,
      this.height,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  public addStroke(
    normX: number, // 0..1
    normY: number, // 0..1
    dirX: number,
    dirY: number,
    radius: number = 0.08,
    strength: number = 1.0
  ): void {
    const cx = Math.floor(normX * this.width);
    const cy = Math.floor(normY * this.height);
    const rPx = Math.ceil(radius * this.width);

    const minX = Math.max(0, cx - rPx);
    const maxX = Math.min(this.width - 1, cx + rPx);
    const minY = Math.max(0, cy - rPx);
    const maxY = Math.min(this.height - 1, cy + rPx);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > rPx) continue;
        const falloff = (1.0 - dist / rPx) * strength;
        const idx = (y * this.width + x) * 4;

        this.data[idx] += dirX * falloff;
        this.data[idx + 1] += dirY * falloff;
      }
    }
    this.texture.needsUpdate = true;
  }

  public update(dt: number): void {
    // Decay strokes over time
    const decay = Math.exp(-2.5 * dt);
    const len = this.data.length;
    for (let i = 0; i < len; i += 4) {
      this.data[i] *= decay;
      this.data[i + 1] *= decay;
    }
    this.texture.needsUpdate = true;
  }

  public clear(): void {
    this.data.fill(0);
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
