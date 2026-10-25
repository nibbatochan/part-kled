// src/core/Simulation.ts
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import simPositionShader from '../shaders/sim_position.glsl';
import simVelocityShader from '../shaders/sim_velocity.glsl';
import { LIFECYCLE_GLSL } from '../shaders/lifecycle';
import type { Params } from './params';

export class Simulation {
  public gpuCompute: GPUComputationRenderer;
  private width: number;
  private height: number;
  private count: number;

  public posVariable: any;
  public velVariable: any;

  private tHomeUniform: THREE.IUniform;
  private tHomeNextUniform: THREE.IUniform;
  private tFlowUniform: THREE.IUniform;

  constructor(
    renderer: THREE.WebGLRenderer,
    width: number = 1024,
    height: number = 512
  ) {
    this.width = width;
    this.height = height;
    this.count = width * height;

    this.gpuCompute = new GPUComputationRenderer(width, height, renderer);

    // Fall back to HalfFloatType if FloatType rendering is unsupported
    if (!renderer.capabilities.isWebGL2) {
      this.gpuCompute.setDataType(THREE.HalfFloatType);
    } else {
      this.gpuCompute.setDataType(THREE.FloatType);
    }

    const dtPosition = this.gpuCompute.createTexture();
    const dtVelocity = this.gpuCompute.createTexture();

    this.initTextureValues(dtPosition, dtVelocity);

    this.posVariable = this.gpuCompute.addVariable('tPos', LIFECYCLE_GLSL + simPositionShader, dtPosition);
    this.velVariable = this.gpuCompute.addVariable('tVel', LIFECYCLE_GLSL + simVelocityShader, dtVelocity);

    this.gpuCompute.setVariableDependencies(this.posVariable, [this.posVariable, this.velVariable]);
    this.gpuCompute.setVariableDependencies(this.velVariable, [this.posVariable, this.velVariable]);

    // Position uniforms
    const pu = this.posVariable.material.uniforms;
    pu['uDt'] = { value: 0.016 };
    pu['uDrift'] = { value: 0.8 };
    pu['uGather'] = { value: 0.5 };
    pu['uDepth'] = { value: 0.5 };
    pu['uMorph'] = { value: 0.0 };
    pu['uLine'] = { value: new THREE.Vector2(1.0, 0.0) };

    // Velocity uniforms
    const vu = this.velVariable.material.uniforms;
    vu['uTime'] = { value: 0.0 };
    vu['uDt'] = { value: 0.016 };
    vu['uDrift'] = { value: 0.8 };
    vu['uGather'] = { value: 0.8 };
    vu['uDepth'] = { value: 0.8 };
    vu['uMorph'] = { value: 0.0 };
    vu['uMelt'] = { value: 0.0 };
    vu['uScan'] = { value: 0.0 };
    vu['uScanActive'] = { value: 0.0 };
    vu['uSplash'] = { value: 0.5 };

    vu['uPointer'] = { value: new THREE.Vector3(999, 999, 0) };
    vu['uPointerVel'] = { value: new THREE.Vector3(0, 0, 0) };
    vu['uPointerOn'] = { value: 0.0 };
    vu['uBurst'] = { value: new THREE.Vector4(0, 0, 0, 0) };
    vu['uLine'] = { value: new THREE.Vector2(1.0, 0.0) };

    // Placeholder textures
    const emptyTex = new THREE.DataTexture(new Float32Array(width * height * 4), width, height, THREE.RGBAFormat, THREE.FloatType);
    emptyTex.needsUpdate = true;

    this.tHomeUniform = { value: emptyTex };
    this.tHomeNextUniform = { value: emptyTex };
    this.tFlowUniform = { value: emptyTex };

    vu['tHome'] = this.tHomeUniform;
    vu['tHomeNext'] = this.tHomeNextUniform;
    vu['tFlow'] = this.tFlowUniform;
    this.posVariable.material.uniforms['tHome'] = this.tHomeUniform;
    this.posVariable.material.uniforms['tHomeNext'] = this.tHomeNextUniform;

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error('GPUComputationRenderer error:', error);
    }
  }

  private initTextureValues(dtPos: THREE.DataTexture, dtVel: THREE.DataTexture): void {
    const posArr = dtPos.image?.data;
    const velArr = dtVel.image?.data;
    if (!posArr || !velArr) return;
    const n = this.count;

    for (let i = 0; i < n; i++) {
      const idx = i * 4;
      // Spread initial positions randomly in bounds
      posArr[idx + 0] = (Math.random() - 0.5) * 1.5;
      posArr[idx + 1] = (Math.random() - 0.5) * 1.5;
      posArr[idx + 2] = (Math.random() - 0.5) * 0.5;
      posArr[idx + 3] = Math.random() * 3.0; // age, desynchronised so streamers do not launch in unison

      velArr[idx + 0] = 0.0;
      velArr[idx + 1] = 0.0;
      velArr[idx + 2] = 0.0;
      velArr[idx + 3] = Math.random(); // per-particle random seed in w
    }
  }

  public setHomeTextures(current: THREE.Texture, next: THREE.Texture): void {
    this.tHomeUniform.value = current;
    this.tHomeNextUniform.value = next;
  }

  public setFlowTexture(flow: THREE.Texture): void {
    this.tFlowUniform.value = flow;
  }

  public update(
    dt: number,
    time: number,
    params: Params,
    pointer: THREE.Vector3,
    pointerVel: THREE.Vector3,
    morphProgress: number,
    scanProgress: number,
    pointerOn: boolean = false,
    burst: THREE.Vector4 = new THREE.Vector4(0, 0, 0, 0)
  ): void {
    // Clamp dt to 1/30 to prevent simulation explosion
    const safeDt = Math.min(1.0 / 30.0, dt);

    // Convert line angle & length to vector
    const lineX = Math.cos(params.line.angle) * params.line.length;
    const lineY = Math.sin(params.line.angle) * params.line.length;

    this.posVariable.material.uniforms['uDt'].value = safeDt;
    this.posVariable.material.uniforms['uDrift'].value = params.drift;
    this.posVariable.material.uniforms['uGather'].value = params.gather;
    this.posVariable.material.uniforms['uLine'].value.set(lineX, lineY);
    this.posVariable.material.uniforms['uDepth'].value = params.depth;
    this.posVariable.material.uniforms['uMorph'].value = morphProgress;

    const vu = this.velVariable.material.uniforms;
    vu['uTime'].value = time;
    vu['uDt'].value = safeDt;
    vu['uDrift'].value = params.drift;
    vu['uGather'].value = params.gather;
    vu['uDepth'].value = params.depth;
    vu['uMorph'].value = morphProgress;
    vu['uMelt'].value = params.travel === 'melt' ? 1.0 : 0.0;
    vu['uScan'].value = scanProgress;
    vu['uScanActive'].value = params.scan ? 1.0 : 0.0;

    vu['uSplash'].value = params.splash;
    vu['uPointer'].value.copy(pointer);
    vu['uPointerVel'].value.copy(pointerVel);
    vu['uPointerOn'].value = pointerOn ? 1.0 : 0.0;
    vu['uBurst'].value.copy(burst);
    vu['uLine'].value.set(lineX, lineY);

    this.gpuCompute.compute();
  }

  public getPosTexture(): THREE.Texture {
    return this.gpuCompute.getCurrentRenderTarget(this.posVariable).texture;
  }

  public getVelTexture(): THREE.Texture {
    return this.gpuCompute.getCurrentRenderTarget(this.velVariable).texture;
  }

  public dispose(): void {
    this.gpuCompute.dispose();
  }
}
