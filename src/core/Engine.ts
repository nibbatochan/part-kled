// src/core/Engine.ts
import * as THREE from 'three';
import { CameraController } from './Camera';
import { FlowField } from './FlowField';
import { ParticleRenderer, type TrackerPoint } from './ParticleRenderer';
import { type SamplePointData } from './Sampler';
import { Simulation } from './Simulation';
import { defaults, type Params } from './params';

export class Engine {
  public canvas: HTMLCanvasElement;
  public renderer: ParticleRenderer;
  public cameraCtrl: CameraController;
  public sim: Simulation;
  public flowField: FlowField;

  private params: Params = { ...defaults };
  private pointCount: number = 65536;
  private texWidth: number = 256;
  private texHeight: number = 256;
  private hasActiveImage: boolean = false;

  // GPU Data Textures
  private tHomeCurrent!: THREE.DataTexture;
  private tHomeNext!: THREE.DataTexture;
  private tColorCurrent!: THREE.DataTexture;
  private tColorNext!: THREE.DataTexture;

  // Pointer state & velocity tracking
  private pointerWorld = new THREE.Vector3(999, 999, 0);
  private pointerVelWorld = new THREE.Vector3(0, 0, 0);
  private lastPointerWorld = new THREE.Vector3(999, 999, 0);
  private lastPointerTime = 0;

  // Morph state
  private isMorphing = false;
  private morphStartTime = 0;
  private morphDuration = 1.6; // seconds
  private morphProgress = 0.0;

  // Scan state
  private scanProgress = 0.0;
  private scanSpeed = 0.35; // sweeps in ~2.8s

  constructor(canvas: HTMLCanvasElement, pointCount: number = 65536) {
    this.canvas = canvas;
    this.pointCount = pointCount;
    this.texWidth = 256;
    this.texHeight = Math.ceil(pointCount / this.texWidth);

    this.renderer = new ParticleRenderer(canvas, this.pointCount, this.texWidth, this.texHeight);
    this.cameraCtrl = new CameraController(canvas);
    this.sim = new Simulation(this.renderer.renderer, this.texWidth, this.texHeight);
    this.flowField = new FlowField();
    this.sim.setFlowTexture(this.flowField.texture);
  }

  public setHasActiveImage(has: boolean): void {
    this.hasActiveImage = has;
    this.renderer.setHasActiveImage(has);
  }

  public loadSampleData(
    currentData: SamplePointData,
    nextData?: SamplePointData
  ): void {
    // Dynamically rebuild simulation & geometry if image resolution/particle count changes
    if (currentData.texWidth !== this.texWidth || currentData.texHeight !== this.texHeight) {
      this.texWidth = currentData.texWidth;
      this.texHeight = currentData.texHeight;
      this.pointCount = currentData.count;

      this.sim.dispose();
      this.sim = new Simulation(this.renderer.renderer, this.texWidth, this.texHeight);
      this.sim.setFlowTexture(this.flowField.texture);
      this.renderer.rebuildPointsAndStreaks(this.pointCount, this.texWidth, this.texHeight);

      const pointsEl = document.getElementById('meta-points');
      if (pointsEl) {
        pointsEl.textContent = `${this.pointCount.toLocaleString()} POINTS`;
      }
    }

    this.hasActiveImage = true;
    this.renderer.setHasActiveImage(true);
    this.renderer.setTrackerFeaturePoints(currentData.home, currentData.count);

    // 1. Current Home & Color
    this.tHomeCurrent = new THREE.DataTexture(
      currentData.home,
      this.texWidth,
      this.texHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.tHomeCurrent.needsUpdate = true;

    this.tColorCurrent = new THREE.DataTexture(
      currentData.color,
      this.texWidth,
      this.texHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.tColorCurrent.needsUpdate = true;

    // 2. Next Home & Color (for morph)
    const next = nextData || currentData;
    this.tHomeNext = new THREE.DataTexture(
      next.home,
      this.texWidth,
      this.texHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.tHomeNext.needsUpdate = true;

    this.tColorNext = new THREE.DataTexture(
      next.color,
      this.texWidth,
      this.texHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.tColorNext.needsUpdate = true;

    this.sim.setHomeTextures(this.tHomeCurrent, this.tHomeNext);
  }

  public startMorph(onComplete?: () => void): void {
    this.isMorphing = true;
    this.morphProgress = 0.0;
    this.morphStartTime = performance.now();

    const checkMorph = () => {
      if (!this.isMorphing) {
        onComplete?.();
      } else {
        requestAnimationFrame(checkMorph);
      }
    };
    checkMorph();
  }

  public setParams(params: Params): void {
    this.params = { ...params };
  }

  public setPointer(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.cameraCtrl.setPointer(ndcX, ndcY);

    // If user is actively dragging/orbiting the camera or just finished zooming/rotating, do not fling particles!
    if (this.cameraCtrl.isDragging || (performance.now() - this.cameraCtrl.lastCameraMoveTime < 150)) {
      this.pointerVelWorld.set(0, 0, 0);
      return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameraCtrl.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, hit);

    if (hit) {
      const now = performance.now() / 1000;
      const dt = Math.max(0.001, Math.min(0.1, now - this.lastPointerTime));
      this.lastPointerTime = now;

      if (this.lastPointerWorld.x < 900) {
        const delta = new THREE.Vector3().subVectors(hit, this.lastPointerWorld).divideScalar(dt);
        // Clamp to prevent wild acceleration bursts
        delta.clampLength(0, 2.5);
        this.pointerVelWorld.copy(delta);
      }
      this.lastPointerWorld.copy(hit);
      this.pointerWorld.copy(hit);

      if (this.params.draw) {
        const normX = (hit.x * 0.5 + 0.5);
        const normY = (hit.y * 0.5 + 0.5);
        const dirX = Math.min(1.5, Math.max(-1.5, this.pointerVelWorld.x * 0.1));
        const dirY = Math.min(1.5, Math.max(-1.5, this.pointerVelWorld.y * 0.1));
        this.flowField.addStroke(normX, normY, dirX, dirY, 0.07, 1.2);
      }
    }
  }

  public triggerSplash(): void {
    const s = Math.max(0.2, this.params.splash);
    this.pointerVelWorld.set(
      (Math.random() - 0.5) * 2.2 * s,
      (Math.random() - 0.5) * 2.2 * s,
      1.5 * s
    );
  }

  public update(dt: number, time: number): void {
    this.cameraCtrl.update(this.params.depth);

    if (this.isMorphing) {
      const elapsed = (performance.now() - this.morphStartTime) / 1000;
      this.morphProgress = Math.min(1.0, elapsed / this.morphDuration);
      if (this.morphProgress >= 1.0) {
        this.isMorphing = false;
        this.tHomeCurrent = this.tHomeNext;
        this.tColorCurrent = this.tColorNext;
        this.sim.setHomeTextures(this.tHomeCurrent, this.tHomeNext);
        this.morphProgress = 0.0;
      }
    }

    if (this.params.scan) {
      this.scanProgress = (this.scanProgress + this.scanSpeed * dt) % 1.0;
    } else {
      this.scanProgress = 0.0;
    }

    this.flowField.update(dt);

    const effectivePointer = this.params.track ? this.pointerWorld : new THREE.Vector3(999, 999, 0);
    this.sim.update(
      dt,
      time,
      this.params,
      effectivePointer,
      this.pointerVelWorld,
      this.morphProgress,
      this.scanProgress
    );

    this.pointerVelWorld.multiplyScalar(0.85);

    this.renderer.render(
      this.cameraCtrl.camera,
      this.sim.getPosTexture(),
      this.sim.getVelTexture(),
      this.tColorCurrent,
      this.tColorNext,
      this.params,
      this.morphProgress,
      this.scanProgress
    );
  }

  public getScanProgress(): number {
    return this.scanProgress;
  }

  public getTrackerPoints(): TrackerPoint[] {
    return this.renderer.getTrackerPoints(this.cameraCtrl.camera, 28);
  }

  public resize(width: number, height: number): void {
    this.cameraCtrl.resize(width, height);
    this.renderer.resize(width, height);
  }

  public dispose(): void {
    this.sim.dispose();
    this.renderer.dispose();
    this.flowField.dispose();
    this.tHomeCurrent?.dispose();
    this.tHomeNext?.dispose();
    this.tColorCurrent?.dispose();
    this.tColorNext?.dispose();
  }
}
