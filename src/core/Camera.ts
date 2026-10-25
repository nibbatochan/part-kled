// src/core/Camera.ts
import * as THREE from 'three';

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;

  private targetRotationX = 0;
  private targetRotationY = 0;
  private currentRotationX = 0;
  private currentRotationY = 0;

  private targetZoom = 1.6;
  private currentZoom = 1.6;

  public isDragging = false;
  public lastCameraMoveTime = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  public pointerParallaxX = 0;
  public pointerParallaxY = 0;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;
    this.camera = new THREE.PerspectiveCamera(
      45,
      domElement.clientWidth / domElement.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, this.currentZoom);
    this.bindEvents();
  }

  public update(depthParam: number): void {
    // Smooth dampening towards target rotation and zoom
    const lerpFactor = 0.08;
    this.currentRotationX += (this.targetRotationX - this.currentRotationX) * lerpFactor;
    this.currentRotationY += (this.targetRotationY - this.currentRotationY) * lerpFactor;
    this.currentZoom += (this.targetZoom - this.currentZoom) * lerpFactor;

    // Additional parallax from pointer movement scaled by DEPTH slider
    const parallaxAmt = 0.18 * depthParam;
    const finalRotX = this.currentRotationX + this.pointerParallaxY * parallaxAmt;
    const finalRotY = this.currentRotationY + this.pointerParallaxX * parallaxAmt;

    const dist = this.currentZoom;
    this.camera.position.x = dist * Math.sin(finalRotY) * Math.cos(finalRotX);
    this.camera.position.y = dist * Math.sin(finalRotX);
    this.camera.position.z = dist * Math.cos(finalRotY) * Math.cos(finalRotX);
    this.camera.lookAt(0, 0, 0);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public setPointer(ndcX: number, ndcY: number): void {
    this.pointerParallaxX = ndcX;
    this.pointerParallaxY = -ndcY;
  }

  private bindEvents(): void {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.targetZoom = Math.max(0.6, Math.min(3.5, this.targetZoom + e.deltaY * 0.0015));
      this.lastCameraMoveTime = performance.now();
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only drag if not clicking buttons or if button is 0/1
      if (e.button === 0 || e.button === 1) {
        this.isDragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.lastCameraMoveTime = performance.now();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;

        this.targetRotationY += dx * 0.005;
        this.targetRotationX = Math.max(
          -Math.PI / 3,
          Math.min(Math.PI / 3, this.targetRotationX + dy * 0.005)
        );
        this.lastCameraMoveTime = performance.now();
      }
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    this.domElement.addEventListener('wheel', onWheel, { passive: false });
    this.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }
}
