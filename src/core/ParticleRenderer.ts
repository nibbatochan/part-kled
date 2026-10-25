// src/core/ParticleRenderer.ts
import * as THREE from 'three';
import particleVert from '../shaders/particle.vert.glsl';
import particleFrag from '../shaders/particle.frag.glsl';
import streakVert from '../shaders/streak.vert.glsl';
import streakFrag from '../shaders/streak.frag.glsl';
import trailFadeFrag from '../shaders/trail_fade.frag.glsl';
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

  private trailScene!: THREE.Scene;
  private trailCamera!: THREE.OrthographicCamera;
  private trailQuad!: THREE.Mesh;
  private trailFadeMaterial!: THREE.ShaderMaterial;
  private trailTargetA!: THREE.WebGLRenderTarget;
  private trailTargetB!: THREE.WebGLRenderTarget;

  private width: number;
  private height: number;
  private texWidth: number;
  private texHeight: number;
  private particleCount: number;

  private trackerIndices: number[] = [];
  private trackerReadBuffer: Float32Array;

  constructor(
    canvas: HTMLCanvasElement,
    particleCount: number = 524288,
    texWidth: number = 1024,
    texHeight: number = 512
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
    this.initTrails();

    // 40 tracker sample indices
    this.initTrackerIndices();
    this.trackerReadBuffer = new Float32Array(40 * 4);
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

    geometry.setAttribute('ref', new THREE.BufferAttribute(refs, 2));

    this.pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        tColor: { value: null },
        tColorNext: { value: null },
        uSize: { value: 2.2 },
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
    this.scene.add(this.pointsMesh);
  }

  private initStreaks(): void {
    // 1/4 of particles render streaks = particleCount / 4 line segments = 2 vertices per segment
    const streakCount = Math.floor(this.particleCount / 4);
    const vertCount = streakCount * 2;

    const geometry = new THREE.BufferGeometry();
    const refs = new Float32Array(vertCount * 2);
    const isTail = new Float32Array(vertCount);

    for (let i = 0; i < streakCount; i++) {
      // Pick every 4th particle
      const pIdx = i * 4;
      const u = (pIdx % this.texWidth + 0.5) / this.texWidth;
      const v = (Math.floor(pIdx / this.texWidth) + 0.5) / this.texHeight;

      // Vertex 0: head
      refs[i * 4 + 0] = u;
      refs[i * 4 + 1] = v;
      isTail[i * 2 + 0] = 0.0;

      // Vertex 1: tail
      refs[i * 4 + 2] = u;
      refs[i * 4 + 3] = v;
      isTail[i * 2 + 1] = 1.0;
    }

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
        uLightColor: { value: new THREE.Vector3(0.95, 0.90, 0.79) },
        uLightOn: { value: 1.0 },
        uNegative: { value: 0.0 },
        uOnWhite: { value: 0.0 },
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });

    this.streakMesh = new THREE.LineSegments(geometry, this.streakMaterial);
    this.scene.add(this.streakMesh);
  }

  private initTrails(): void {
    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);

    this.trailTargetA = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    this.trailTargetB = new THREE.WebGLRenderTarget(halfW, halfH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    this.trailScene = new THREE.Scene();
    this.trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.trailFadeMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: trailFadeFrag,
      uniforms: {
        tDiffuse: { value: null },
        uFade: { value: 0.94 },
      },
      depthWrite: false,
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.trailQuad = new THREE.Mesh(quadGeo, this.trailFadeMaterial);
    this.trailScene.add(this.trailQuad);
  }

  private initTrackerIndices(): void {
    // Pick 40 well-spaced indices
    this.trackerIndices = [];
    const step = Math.floor(this.particleCount / 40);
    for (let i = 0; i < 40; i++) {
      this.trackerIndices.push(Math.min(this.particleCount - 1, i * step + 128));
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
    const lightVec = (params.lightOn && params.light !== 'off')
      ? (LIGHT_COLORS[params.light] || LIGHT_COLORS.cream)
      : LIGHT_COLORS.off;

    const isOnWhite = params.background === 'white';
    const isNegative = params.colorMode === 'negative';

    // Clear color according to theme
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
    this.streakMesh.visible = params.trails;
    if (params.trails) {
      const su = this.streakMaterial.uniforms;
      su['tPos'].value = posTexture;
      su['tVel'].value = velTexture;
      su['tColor'].value = colorTexture;
      su['uStreakLength'].value = params.line.length * 1.5;
      su['uLightColor'].value.copy(lightVec);
      su['uLightOn'].value = params.lightOn ? 1.0 : 0.0;
      su['uNegative'].value = isNegative ? 1.0 : 0.0;
      su['uOnWhite'].value = isOnWhite ? 1.0 : 0.0;
    }

    // Standard render directly to screen
    this.renderer.render(this.scene, camera);
  }

  public getTrackerPoints(
    camera: THREE.PerspectiveCamera,
    posTexture: THREE.Texture,
    count: number
  ): TrackerPoint[] {
    const gl = this.renderer.getContext();
    const result: TrackerPoint[] = [];
    const n = Math.min(count, this.trackerIndices.length);

    // Camera projection setup
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const tempVec = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const pIdx = this.trackerIndices[i];
      const u = (pIdx % this.texWidth) / this.texWidth;
      const v = Math.floor(pIdx / this.texWidth) / this.texHeight;

      // Approximate 3D position
      const wx = (u - 0.5) * 1.2;
      const wy = (0.5 - v) * 1.0;
      const wz = 0.0;

      tempVec.set(wx, wy, wz);
      tempVec.project(camera);

      const sx = tempVec.x * halfW + halfW;
      const sy = -tempVec.y * halfH + halfH;

      result.push({
        id: i + 1,
        worldX: wx,
        worldY: wy,
        worldZ: wz,
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
    this.trailTargetA.dispose();
    this.trailTargetB.dispose();
    this.renderer.dispose();
  }
}
