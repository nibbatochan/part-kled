// src/core/ParticleRenderer.ts
import * as THREE from 'three';
import particleVert from '../shaders/particle.vert.glsl';
import particleFrag from '../shaders/particle.frag.glsl';
import streakVert from '../shaders/streak.vert.glsl';
import streakFrag from '../shaders/streak.frag.glsl';
import type { Params } from './params';

export interface TrackerPoint {
  id: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  screenX: number;
  screenY: number;
}

const LIGHT_COLORS: Record<string, THREE.Vector3> = {
  cream: new THREE.Vector3(0.95, 0.90, 0.79),
  ice: new THREE.Vector3(0.75, 0.88, 1.0),
  orange: new THREE.Vector3(1.0, 0.60, 0.24),
  red: new THREE.Vector3(1.0, 0.29, 0.24),
  green: new THREE.Vector3(0.25, 0.88, 0.69),
  violet: new THREE.Vector3(0.56, 0.42, 1.0),
  off: new THREE.Vector3(0.0, 0.0, 0.0),
};

export class ParticleRenderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;

  private pointsMesh!: THREE.Points;
  private pointsMaterial!: THREE.ShaderMaterial;

  private streakMesh!: THREE.LineSegments;
  private streakMaterial!: THREE.ShaderMaterial;

  private width: number;
  private height: number;
  private texWidth: number;
  private texHeight: number;
  private particleCount: number;

  private trackerWorldPositions: THREE.Vector3[] = [];
  private hasActiveImage: boolean = false;

  constructor(
    canvas: HTMLCanvasElement,
    particleCount: number = 65536,
    texWidth: number = 256,
    texHeight: number = 256
  ) {
    this.particleCount = particleCount;
    this.texWidth = texWidth;
    this.texHeight = texHeight;

    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(2.0, window.devicePixelRatio || 1.0));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.initPoints();
    this.initStreaks();
  }

  private initPoints(): void {
    const geometry = new THREE.BufferGeometry();
    const refs = new Float32Array(this.particleCount * 2);

    for (let i = 0; i < this.particleCount; i++) {
      const u = (i % this.texWidth + 0.5) / this.texWidth;
      const v = (Math.floor(i / this.texWidth) + 0.5) / this.texHeight;
      refs[i * 2 + 0] = u;
      refs[i * 2 + 1] = v;
    }

    // Three.js WebGLBufferRenderer requires a position attribute for draw count
    const dummyPositions = new Float32Array(this.particleCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));
    geometry.setAttribute('ref', new THREE.BufferAttribute(refs, 2));

    this.pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        tColor: { value: null },
        tColorNext: { value: null },
        uSize: { value: 1.4 },
        uDpr: { value: Math.min(2.0, window.devicePixelRatio || 1.0) },
        uMorph: { value: 0.0 },
        uLightColor: { value: new THREE.Vector3(0.95, 0.90, 0.79) },
        uLightOn: { value: 1.0 },
        uScan: { value: 0.0 },
        uScanActive: { value: 0.0 },
        uLine: { value: new THREE.Vector2(0.4, 0.3) },
        uNegative: { value: 0.0 },
        uOnWhite: { value: 0.0 },
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });

    this.pointsMesh = new THREE.Points(geometry, this.pointsMaterial);
    // Crucial: disable frustum culling since particle positions are computed dynamically in vertex shader
    this.pointsMesh.frustumCulled = false;
    this.scene.add(this.pointsMesh);
  }

  private initStreaks(): void {
    const streakCount = Math.floor(this.particleCount / 2);
    const vertCount = streakCount * 2;

    const geometry = new THREE.BufferGeometry();
    const refs = new Float32Array(vertCount * 2);
    const isTail = new Float32Array(vertCount);
    const dummyPositions = new Float32Array(vertCount * 3);

    for (let i = 0; i < streakCount; i++) {
      const pIdx = i * 2;
      const u = (pIdx % this.texWidth + 0.5) / this.texWidth;
      const v = (Math.floor(pIdx / this.texWidth) + 0.5) / this.texHeight;

      // Head
      refs[i * 4 + 0] = u;
      refs[i * 4 + 1] = v;
      isTail[i * 2 + 0] = 0.0;

      // Tail
      refs[i * 4 + 2] = u;
      refs[i * 4 + 3] = v;
      isTail[i * 2 + 1] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));
    geometry.setAttribute('ref', new THREE.BufferAttribute(refs, 2));
    geometry.setAttribute('isTail', new THREE.BufferAttribute(isTail, 1));

    this.streakMaterial = new THREE.ShaderMaterial({
      vertexShader: streakVert,
      fragmentShader: streakFrag,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        tColor: { value: null },
        uStreakLength: { value: 1.0 },
        uLine: { value: new THREE.Vector2(0.85, 0.05) },
        uDrift: { value: 0.8 },
        uLightColor: { value: new THREE.Vector3(0.95, 0.90, 0.79) },
        uLightOn: { value: 1.0 },
        uScan: { value: 0.0 },
        uScanActive: { value: 0.0 },
        uNegative: { value: 0.0 },
        uOnWhite: { value: 0.0 },
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });

    this.streakMesh = new THREE.LineSegments(geometry, this.streakMaterial);
    this.streakMesh.frustumCulled = false;
    this.scene.add(this.streakMesh);
  }

  public rebuildPointsAndStreaks(particleCount: number, texWidth: number, texHeight: number): void {
    this.particleCount = particleCount;
    this.texWidth = texWidth;
    this.texHeight = texHeight;

    if (this.pointsMesh) {
      this.pointsMesh.geometry.dispose();
      this.scene.remove(this.pointsMesh);
    }
    if (this.streakMesh) {
      this.streakMesh.geometry.dispose();
      this.scene.remove(this.streakMesh);
    }

    this.initPoints();
    this.initStreaks();
  }

  public setHasActiveImage(hasImage: boolean): void {
    this.hasActiveImage = hasImage;
    this.pointsMesh.visible = hasImage;
    this.streakMesh.visible = hasImage;
  }

  public setTrackerFeaturePoints(homeData: Float32Array, pointCount: number): void {
    this.trackerWorldPositions = [];
    if (!this.hasActiveImage) return;

    // Pick 40 non-empty feature points spread out across the subject
    const step = Math.max(1, Math.floor(pointCount / 60));
    for (let i = 0; i < pointCount && this.trackerWorldPositions.length < 40; i += step) {
      const idx = i * 4;
      const x = homeData[idx];
      const y = homeData[idx + 1];
      const z = homeData[idx + 2];
      // Check that it's not empty space
      if (Math.abs(x) > 0.001 || Math.abs(y) > 0.001 || Math.abs(z) > 0.001) {
        this.trackerWorldPositions.push(new THREE.Vector3(x, y, z));
      }
    }
  }

  public render(
    camera: THREE.PerspectiveCamera,
    posTexture: THREE.Texture,
    velTexture: THREE.Texture,
    colorTexture: THREE.Texture,
    colorNextTexture: THREE.Texture,
    params: Params,
    morphProgress: number,
    scanProgress: number
  ): void {
    if (!this.hasActiveImage) {
      this.renderer.clear();
      return;
    }

    const lightVec = (params.lightOn && params.light !== 'off')
      ? (LIGHT_COLORS[params.light] || LIGHT_COLORS.cream)
      : LIGHT_COLORS.off;

    const isOnWhite = params.background === 'white';
    const isNegative = params.colorMode === 'negative';

    if (isOnWhite) {
      this.renderer.setClearColor(0xf8f8f7, 1);
      this.pointsMaterial.blending = THREE.NormalBlending;
      this.streakMaterial.blending = THREE.NormalBlending;
    } else {
      this.renderer.setClearColor(0x050506, 1);
      this.pointsMaterial.blending = THREE.AdditiveBlending;
      this.streakMaterial.blending = THREE.AdditiveBlending;
    }

    // Update Points uniforms
    const pu = this.pointsMaterial.uniforms;
    pu['tPos'].value = posTexture;
    pu['tVel'].value = velTexture;
    pu['tColor'].value = colorTexture;
    pu['tColorNext'].value = colorNextTexture || colorTexture;
    pu['uMorph'].value = morphProgress;
    pu['uLightColor'].value.copy(lightVec);
    pu['uLightOn'].value = params.lightOn ? 1.0 : 0.0;
    pu['uScan'].value = scanProgress;
    pu['uScanActive'].value = params.scan ? 1.0 : 0.0;
    pu['uNegative'].value = isNegative ? 1.0 : 0.0;
    pu['uOnWhite'].value = isOnWhite ? 1.0 : 0.0;

    const lineX = Math.cos(params.line.angle) * params.line.length;
    const lineY = Math.sin(params.line.angle) * params.line.length;
    pu['uLine'].value.set(lineX, lineY);

    // Update Streaks uniforms
    this.streakMesh.visible = params.trails && this.hasActiveImage;
    if (this.streakMesh.visible) {
      const su = this.streakMaterial.uniforms;
      su['tPos'].value = posTexture;
      su['tVel'].value = velTexture;
      su['tColor'].value = colorTexture;
      su['uLine'].value.set(lineX, lineY);
      su['uDrift'].value = params.drift;
      // Drift controls the trail's lengths toward the set direction
      su['uStreakLength'].value = (0.2 + params.drift * 2.2) * params.line.length;
      su['uScan'].value = scanProgress;
      su['uScanActive'].value = params.scan ? 1.0 : 0.0;
      su['uLightColor'].value.copy(lightVec);
      su['uLightOn'].value = params.lightOn ? 1.0 : 0.0;
      su['uNegative'].value = isNegative ? 1.0 : 0.0;
      su['uOnWhite'].value = isOnWhite ? 1.0 : 0.0;
    }

    this.renderer.render(this.scene, camera);
  }

  public getTrackerPoints(
    camera: THREE.PerspectiveCamera,
    count: number
  ): TrackerPoint[] {
    if (!this.hasActiveImage || this.trackerWorldPositions.length === 0) {
      return [];
    }

    const result: TrackerPoint[] = [];
    const n = Math.min(count, this.trackerWorldPositions.length);

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const tempVec = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const wPos = this.trackerWorldPositions[i];
      tempVec.copy(wPos);
      tempVec.project(camera);

      const sx = tempVec.x * halfW + halfW;
      const sy = -tempVec.y * halfH + halfH;

      result.push({
        id: i + 1,
        worldX: wPos.x,
        worldY: wPos.y,
        worldZ: wPos.z,
        screenX: sx,
        screenY: sy,
      });
    }

    return result;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.pointsMaterial.uniforms['uDpr'].value = Math.min(2.0, window.devicePixelRatio || 1.0);
  }

  public dispose(): void {
    this.pointsMesh.geometry.dispose();
    this.pointsMaterial.dispose();
    this.streakMesh.geometry.dispose();
    this.streakMaterial.dispose();
    this.renderer.dispose();
  }
}
