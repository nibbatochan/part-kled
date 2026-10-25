// src/core/ParticleRenderer.ts
import * as THREE from 'three';
import particleVert from '../shaders/particle.vert.glsl';
import particleFrag from '../shaders/particle.frag.glsl';
import streakVert from '../shaders/streak.vert.glsl';
import streakFrag from '../shaders/streak.frag.glsl';
import fullscreenVert from '../shaders/fullscreen.vert.glsl';
import trailDecayFrag from '../shaders/trail_decay.frag.glsl';
import compositeFrag from '../shaders/composite.frag.glsl';
import { LIFECYCLE_GLSL } from '../shaders/lifecycle';
import type { Params } from './params';

/** Cursor / clock state shared with the point and streak shaders. */
export interface RenderContext {
  pointer: THREE.Vector3;
  pointerOn: boolean;
  time: number;
}

/** Depth relief scale: must match `home.z *= uDepth * 0.55` in the sim shaders. */
export const DEPTH_RELIEF = 0.55;

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

  // PRD 8.5 Trail Persistence & Composite Render Targets
  private rtScene!: THREE.WebGLRenderTarget;
  private rtTrailA!: THREE.WebGLRenderTarget;
  private rtTrailB!: THREE.WebGLRenderTarget;
  private quadCamera!: THREE.OrthographicCamera;
  private quadScene!: THREE.Scene;
  private quadMesh!: THREE.Mesh;
  private decayMaterial!: THREE.ShaderMaterial;
  private compositeMaterial!: THREE.ShaderMaterial;

  private width: number;
  private height: number;
  private texWidth: number;
  private texHeight: number;
  private particleCount: number;

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
    this.initRenderTargetsAndQuad();
  }

  private initRenderTargetsAndQuad(): void {
    const dpr = Math.min(2.0, window.devicePixelRatio || 1.0);
    const fullW = Math.max(1, Math.floor(this.width * dpr));
    const fullH = Math.max(1, Math.floor(this.height * dpr));
    const halfW = Math.max(1, Math.floor(fullW / 2));
    const halfH = Math.max(1, Math.floor(fullH / 2));

    const rtOptions: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.rtScene = new THREE.WebGLRenderTarget(fullW, fullH, { ...rtOptions, depthBuffer: true });
    this.rtTrailA = new THREE.WebGLRenderTarget(halfW, halfH, rtOptions);
    this.rtTrailB = new THREE.WebGLRenderTarget(halfW, halfH, rtOptions);

    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    const quadGeom = new THREE.PlaneGeometry(2, 2);

    this.decayMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: trailDecayFrag,
      uniforms: {
        tCurrent: { value: null },
        tPrior: { value: null },
        uDecay: { value: 0.94 },
        uClear: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: compositeFrag,
      uniforms: {
        tScene: { value: null },
        tTrail: { value: null },
        uTrailsEnabled: { value: 1.0 },
        uBlack: { value: 0.0 },
        uWhite: { value: 1.0 },
        uGamma: { value: 1.0 },
        uContrast: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uHue: { value: 0.0 },
        uSaturation: { value: 1.0 },
        uBW: { value: 0.0 },
        uTrailGain: { value: 1.0 },
        uOnWhite: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quadMesh = new THREE.Mesh(quadGeom, this.compositeMaterial);
    this.quadScene.add(this.quadMesh);
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
      vertexShader: LIFECYCLE_GLSL + particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        tColor: { value: null },
        tColorNext: { value: null },
        uSize: { value: 1.0 },
        uDpr: { value: Math.min(2.0, window.devicePixelRatio || 1.0) },
        uMorph: { value: 0.0 },
        uDrift: { value: 0.8 },
        uGather: { value: 0.5 },
        uLightColor: { value: new THREE.Vector3(0.95, 0.90, 0.79) },
        uLightOn: { value: 1.0 },
        uScan: { value: 0.0 },
        uScanActive: { value: 0.0 },
        uScanMode: { value: 0.0 },
        uScanLevel: { value: 3.0 },
        uZScale: { value: 0.14 },
        uScanCenter: { value: new THREE.Vector2(0, 0) },
        uLine: { value: new THREE.Vector2(1.0, 0.0) },
        uPointer: { value: new THREE.Vector3(999, 999, 0) },
        uPointerOn: { value: 0.0 },
        uSplash: { value: 0.5 },
        uTime: { value: 0.0 },
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
    // Up to one streak per 2 particles. The shader keeps half of them at low DRIFT and all of
    // them at maximum DRIFT, so trails grow with the slider without washing out the picture.
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
      vertexShader: LIFECYCLE_GLSL + streakVert,
      fragmentShader: streakFrag,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        tColor: { value: null },
        uStreakLength: { value: 0.2 },
        uLine: { value: new THREE.Vector2(1.0, 0.0) },
        uDrift: { value: 0.8 },
        uGather: { value: 0.5 },
        uLightColor: { value: new THREE.Vector3(0.95, 0.90, 0.79) },
        uLightOn: { value: 1.0 },
        uScan: { value: 0.0 },
        uScanActive: { value: 0.0 },
        uScanMode: { value: 0.0 },
        uScanLevel: { value: 3.0 },
        uTrailAmount: { value: 1.0 },
        uTrailDetail: { value: 0.5 },
        uTrailStrength: { value: 1.0 },
        uZScale: { value: 0.14 },
        uScanCenter: { value: new THREE.Vector2(0, 0) },
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

  public render(
    camera: THREE.PerspectiveCamera,
    posTexture: THREE.Texture,
    velTexture: THREE.Texture,
    colorTexture: THREE.Texture,
    colorNextTexture: THREE.Texture,
    params: Params,
    morphProgress: number,
    scanProgress: number,
    ctx: RenderContext = { pointer: new THREE.Vector3(999, 999, 0), pointerOn: false, time: 0 }
  ): void {
    if (!this.hasActiveImage) {
      this.renderer.clear();
      return;
    }

    const lightVec = (params.lightOn && params.light !== 'off')
      ? (LIGHT_COLORS[params.light] || LIGHT_COLORS.cream)
      : LIGHT_COLORS.off;

    const isOnWhite = params.background === 'white';
    const isNegative = false; // colour mode is TRUE or B&W now; B&W is applied in the composite

    if (isOnWhite) {
      this.pointsMaterial.blending = THREE.NormalBlending;
      this.streakMaterial.blending = THREE.NormalBlending;
    } else {
      // Points write premultiplied (colour * weight, weight): plain ONE/ONE accumulation
      this.pointsMaterial.blending = THREE.CustomBlending;
      this.pointsMaterial.blendEquation = THREE.AddEquation;
      this.pointsMaterial.blendSrc = THREE.OneFactor;
      this.pointsMaterial.blendDst = THREE.OneFactor;
      this.streakMaterial.blending = THREE.AdditiveBlending;
    }

    const clearColor = isOnWhite ? 0xf8f8f7 : 0x050506;

    // Update Points uniforms
    const pu = this.pointsMaterial.uniforms;
    pu['tPos'].value = posTexture;
    pu['tVel'].value = velTexture;
    pu['tColor'].value = colorTexture;
    pu['tColorNext'].value = colorNextTexture || colorTexture;
    pu['uMorph'].value = morphProgress;
    pu['uLightColor'].value.copy(lightVec);
    pu['uLightOn'].value = params.lightOn ? 1.0 : 0.0;
    pu['uDrift'].value = params.drift;
    pu['uGather'].value = params.gather;
    pu['uSplash'].value = params.splash;
    pu['uPointer'].value.copy(ctx.pointer);
    pu['uPointerOn'].value = ctx.pointerOn ? 1.0 : 0.0;
    pu['uTime'].value = ctx.time;
    pu['uScan'].value = scanProgress;
    pu['uScanActive'].value = params.scan ? 1.0 : 0.0;
    pu['uScanMode'].value = params.scanMode;
    pu['uScanLevel'].value = params.scanLevel;
    pu['uZScale'].value = params.depth * 0.55 * 0.5;
    pu['uScanCenter'].value.set(ctx.pointerOn ? ctx.pointer.x : 0, ctx.pointerOn ? ctx.pointer.y : 0);
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
      su['uGather'].value = params.gather;
      // Drift sets how long the velocity streaks are (world units)
      su['uStreakLength'].value = params.trail.length * (0.035 + params.drift * 0.13) * (0.5 + 0.5 * params.line.length) *
        (1.0 + 0.2 * Math.min(1, Math.max(0, (params.drift - 0.8) / 0.2)));
      su['uScan'].value = scanProgress;
      su['uScanActive'].value = params.scan ? 1.0 : 0.0;
      su['uScanMode'].value = params.scanMode;
      su['uScanLevel'].value = params.scanLevel;
      su['uTrailAmount'].value = params.trail.amount;
      su['uTrailDetail'].value = params.trail.detail;
      su['uTrailStrength'].value = params.trail.strength;
      su['uZScale'].value = params.depth * 0.55 * 0.5;
      su['uScanCenter'].value.set(ctx.pointerOn ? ctx.pointer.x : 0, ctx.pointerOn ? ctx.pointer.y : 0);
      su['uLightColor'].value.copy(lightVec);
      su['uLightOn'].value = params.lightOn ? 1.0 : 0.0;
      su['uNegative'].value = isNegative ? 1.0 : 0.0;
      su['uOnWhite'].value = isOnWhite ? 1.0 : 0.0;
    }

    // 1. Trail feedback persistence pass (PRD Section 8.5)
    // Only moving streaks accumulate and decay by 0.94, leaving static particles 100% crisp!
    if (params.trails) {
      // Step A: Decay prior trail frame by 0.94 into rtTrailB
      this.renderer.setRenderTarget(this.rtTrailB);
      this.renderer.clear();
      this.quadMesh.material = this.decayMaterial;
      this.decayMaterial.uniforms['tPrior'].value = this.rtTrailA.texture;
      this.decayMaterial.uniforms['uDecay'].value = 0.94;
      this.decayMaterial.uniforms['uClear'].value = 0.0;
      this.renderer.render(this.quadScene, this.quadCamera);

      // Step B: Render active streaks additively on top of decayed trail buffer
      this.pointsMesh.visible = false;
      this.streakMesh.visible = true;
      this.renderer.autoClear = false;
      this.renderer.render(this.scene, camera);
      this.renderer.autoClear = true;
      this.pointsMesh.visible = true;

      // Step C: Swap ping-pong handles
      const tmp = this.rtTrailA;
      this.rtTrailA = this.rtTrailB;
      this.rtTrailB = tmp;
    } else {
      // TRAILS off clears target
      this.decayMaterial.uniforms['uClear'].value = 1.0;
      this.renderer.setRenderTarget(this.rtTrailA);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.setRenderTarget(this.rtTrailB);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
    }

    // 2. Render live foreground scene (points + streaks) into full-res rtScene
    this.streakMesh.visible = params.trails && this.hasActiveImage;
    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.setClearColor(clearColor, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, camera);

    // 3. Final composite pass to screen canvas with Bayer ordered dither
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(clearColor, 1);
    this.renderer.clear();

    this.quadMesh.material = this.compositeMaterial;
    const cu = this.compositeMaterial.uniforms;
    cu['tScene'].value = this.rtScene.texture;
    cu['tTrail'].value = this.rtTrailA.texture;
    cu['uTrailsEnabled'].value = params.trails ? 1.0 : 0.0;
    cu['uOnWhite'].value = isOnWhite ? 1.0 : 0.0;
    cu['uBlack'].value = params.fx.black;
    cu['uWhite'].value = params.fx.white;
    cu['uGamma'].value = params.fx.gamma;
    cu['uContrast'].value = params.fx.contrast;
    cu['uOpacity'].value = params.fx.opacity;
    cu['uHue'].value = params.fx.hue;
    cu['uSaturation'].value = params.fx.saturation;
    cu['uBW'].value = params.colorMode === 'bw' ? 1.0 : 0.0;
    cu['uTrailGain'].value = params.trail.strength;

    this.renderer.render(this.quadScene, this.quadCamera);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    const dpr = Math.min(2.0, window.devicePixelRatio || 1.0);
    this.pointsMaterial.uniforms['uDpr'].value = dpr;

    const fullW = Math.max(1, Math.floor(width * dpr));
    const fullH = Math.max(1, Math.floor(height * dpr));
    const halfW = Math.max(1, Math.floor(fullW / 2));
    const halfH = Math.max(1, Math.floor(fullH / 2));

    this.rtScene.setSize(fullW, fullH);
    this.rtTrailA.setSize(halfW, halfH);
    this.rtTrailB.setSize(halfW, halfH);
  }

  public dispose(): void {
    this.pointsMesh.geometry.dispose();
    this.pointsMaterial.dispose();
    this.streakMesh.geometry.dispose();
    this.streakMaterial.dispose();
    this.rtScene.dispose();
    this.rtTrailA.dispose();
    this.rtTrailB.dispose();
    this.quadMesh.geometry.dispose();
    this.decayMaterial.dispose();
    this.compositeMaterial.dispose();
    this.renderer.dispose();
  }
}
