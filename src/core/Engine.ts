// src/core/Engine.ts
import * as THREE from 'three';
import { CameraController } from './Camera';
import { FlowField } from './FlowField';
import { ParticleRenderer, type RenderContext } from './ParticleRenderer';
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
  private pointerInside = false;

  // Click shockwave: world-space origin, seconds since the click, amplitude
  private burst = new THREE.Vector4(0, 0, 0, 0);
  private burstActive = false;

  // Morph state
  private isMorphing = false;
  private morphStartTime = 0;
  private morphDuration = 1.6; // seconds
  private morphProgress = 0.0;

  // Scan state
  private scanProgress = 0.0;
  private scanSpeed = 0.155; // one scan every ~6.5s

  constructor(canvas: HTMLCanvasElement, pointCount: number = 65536) {
    this.canvas = canvas;
    this.pointCount = pointCount;
    this.texWidth = 1024;
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
    this.sim.setExtent(currentData.halfW, currentData.halfH);
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

  /** Cursor position on the z = 0 plane under the given client coordinates, or null if it misses. */
  private clientToWorld(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameraCtrl.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  public setPointerInside(inside: boolean): void {
    this.pointerInside = inside;
    if (!inside) this.lastPointerWorld.set(999, 999, 0);
  }

  public setPointer(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.cameraCtrl.setPointer(ndcX, ndcY);
    this.pointerInside = Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;

    const hit = this.clientToWorld(clientX, clientY);

    if (hit) {
      const now = performance.now() / 1000;
      const dt = Math.max(0.004, now - this.lastPointerTime);
      this.lastPointerTime = now;

      if (this.lastPointerWorld.x < 900) {
        const inst = new THREE.Vector3().subVectors(hit, this.lastPointerWorld).divideScalar(dt);
        // Smooth and clamp so a single jumpy event cannot catapult the particles
        this.pointerVelWorld.lerp(inst, 0.5);
        const mag = this.pointerVelWorld.length();
        if (mag > 3) this.pointerVelWorld.multiplyScalar(3 / mag);
      }
      this.lastPointerWorld.copy(hit);
      this.pointerWorld.copy(hit);

      if (this.params.draw) {
        const normX = (hit.x * 0.5 + 0.5);
        const normY = (hit.y * 0.5 + 0.5);
        const dirX = Math.min(2.0, Math.max(-2.0, this.pointerVelWorld.x * 0.1));
        const dirY = Math.min(2.0, Math.max(-2.0, this.pointerVelWorld.y * 0.1));
        this.flowField.addStroke(normX, normY, dirX, dirY, 0.07, 1.2);
      }
    }
  }

  /** Click burst: an expanding shockwave from the cursor (or from the centre when called bare). */
  public triggerSplash(clientX?: number, clientY?: number): void {
    let origin: THREE.Vector3 | null = null;
    if (clientX !== undefined && clientY !== undefined) {
      origin = this.clientToWorld(clientX, clientY);
    }
    const o = origin ?? (this.pointerWorld.x < 900 ? this.pointerWorld : new THREE.Vector3(0, 0, 0));
    this.burst.set(o.x, o.y, 0, 1);
    this.burstActive = true;
  }

  public update(dt: number, time: number): void {
    this.cameraCtrl.update(this.params.depth, time);

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

    // Cursor reaches the sim while TRACK is on. Clicks always splash.
    const pointerOn = this.params.track && this.pointerInside && this.pointerWorld.x < 900;
    const effectivePointer = pointerOn ? this.pointerWorld : new THREE.Vector3(999, 999, 0);

    if (this.burstActive) {
      this.burst.z += dt;
      this.burst.w = Math.max(0, 1 - this.burst.z / 1.1);
      if (this.burst.w <= 0) this.burstActive = false;
    } else {
      this.burst.w = 0;
    }

    // Until an image is loaded the home textures are empty: running the sim would collapse every
    // particle onto the origin and the first frames would be an explosion. Hold it still instead.
    if (this.hasActiveImage) {
      this.sim.update(
        dt,
        time,
        this.params,
        effectivePointer,
        this.pointerVelWorld,
        this.morphProgress,
        this.scanProgress,
        pointerOn,
        this.burst
      );
    }

    // The cursor stops sending events when it rests: bleed its velocity away
    this.pointerVelWorld.multiplyScalar(Math.exp(-6 * dt));

    const ctx: RenderContext = { pointer: effectivePointer, pointerOn, time };
    this.renderer.render(
      this.cameraCtrl.camera,
      this.sim.getPosTexture(),
      this.sim.getVelTexture(),
      this.tColorCurrent,
      this.tColorNext,
      this.params,
      this.morphProgress,
      this.scanProgress,
      ctx
    );
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
