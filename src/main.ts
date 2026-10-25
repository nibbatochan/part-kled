// src/main.ts
import { defaults, loadFromStorage, saveToStorage, type Params } from './core/params';
import { Engine } from './core/Engine';
import { sampleImageParticles, type SamplePointData } from './core/Sampler';
import { DepthEstimator } from './depth/DepthEstimator';
import { Dropzone } from './ui/Dropzone';
import { Frame } from './ui/Frame';
import { Panel } from './ui/Panel';
import { MAX_IMAGES, Thumbs } from './ui/Thumbs';
import { processImageFile, type ProcessedImage } from './utils/image';
import { setupKeyboardShortcuts } from './utils/keys';

interface CachedSample {
  image: ProcessedImage;
  depth: Float32Array;
  sampleData: SamplePointData;
}

class App {
  private params: Params;
  public engine!: Engine;
  private frame!: Frame;
  private thumbs!: Thumbs;
  private dropzone!: Dropzone;
  private panel!: Panel;
  private depthEstimator = new DepthEstimator();

  public images: ProcessedImage[] = [];
  private sampleCache: Map<string, CachedSample> = new Map();
  public activeIndex: number = 0;
  private lastTime: number = performance.now();

  constructor() {
    this.params = { ...loadFromStorage(), background: 'dark' }; // no light mode any more

    const stageCanvas = document.getElementById('stage') as HTMLCanvasElement;
    if (!stageCanvas) throw new Error('Stage canvas missing');

    // 1. Initialize Engine
    this.engine = new Engine(stageCanvas, this.params.pointCount);
    this.engine.setParams(this.params);
    this.engine.setHasActiveImage(false);

    (window as any).__engine = this.engine;
    (window as any).__app = this;

    // 2. Initialize Frame overlay
    this.frame = new Frame('#frame-svg', '#frame-readout');
    this.frame.setReadout(0, 0, 'INITIALIZING');

    // 3. Initialize Thumbs
    this.thumbs = new Thumbs(
      '#thumbnail-strip',
      (idx) => this.switchImage(idx),
      () => this.dropzone.openPicker(),
      (idx) => this.deleteImage(idx)
    );

    // 4. Initialize Dropzone
    this.dropzone = new Dropzone(
      '#dropzone',
      '#file-input',
      (files) => this.handleFiles(files)
    );

    // 5. Initialize Panel UI
    this.panel = new Panel(
      this.params,
      (newParams) => {
        this.params = newParams;
        this.engine.setParams(this.params);
        saveToStorage(this.params);
      },
      () => this.nextImage(),
      () => this.panel.toggleLight(),
      () => this.dropzone.openPicker()
    );

    // 6. Keyboard shortcuts
    setupKeyboardShortcuts({
      onNext: () => this.nextImage(),
      onToggleLight: () => this.panel.toggleLight(),
      onFullscreen: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      },
      onToggleUi: () => this.panel.toggleUiVisibility(),
      onSelectSlot: (idx) => this.switchImage(idx),
    });

    this.bindPointer();
    this.bindResize();

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));

    // Load initial sample images
    this.initDefaultSamples();
  }

  private bindPointer(): void {
    const stage = document.getElementById('stage');
    if (!stage) return;

    window.addEventListener('pointermove', (e) => {
      this.engine.setPointer(e.clientX, e.clientY);
    });

    // Click on the stage: shockwave burst from the cursor (SPLASH sets its force)
    stage.addEventListener('pointerdown', (e) => {
      this.engine.triggerSplash(e.clientX, e.clientY);
    });

    document.documentElement.addEventListener('pointerleave', () => {
      this.engine.setPointerInside(false);
    });
  }

  private bindResize(): void {
    // The canvas fills the stage (left side), not the window, so follow the stage's own size
    const wrap = document.getElementById('stage-wrap');
    if (!wrap) return;
    new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.engine.resize(r.width, r.height);
    }).observe(wrap);
  }

  private loop(currentTime: number): void {
    const dt = Math.min(0.05, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    // Update 3D simulation and render
    this.engine.update(dt, currentTime / 1000);

    requestAnimationFrame((t) => this.loop(t));
  }

  private setProgress(show: boolean, text: string = '', pct: number = 0): void {
    const ind = document.getElementById('loading-indicator');
    const txt = document.getElementById('loading-text');
    const bar = document.getElementById('progress-fill');
    if (!ind || !txt || !bar) return;

    ind.classList.toggle('hidden', !show);
    txt.textContent = text;
    bar.style.width = `${Math.round(pct * 100)}%`;
  }

  public async getSampleDataForImage(img: ProcessedImage): Promise<CachedSample> {
    if (this.sampleCache.has(img.id)) {
      return this.sampleCache.get(img.id)!;
    }

    // Check if pre-baked depth map exists for sample (instant, no loader)
    let depthArr: Float32Array | null = null;
    const baseName = img.name.replace(/\.[^.]+$/, '');
    if (baseName.startsWith('sample-')) {
      try {
        const bakedRes = await fetch(`/samples/${baseName}-depth.png`);
        if (bakedRes.ok) {
          const blob = await bakedRes.blob();
          const imgEl = new Image();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((r) => { imgEl.onload = () => r(); imgEl.src = url; });
          URL.revokeObjectURL(url);

          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(imgEl, 0, 0, img.width, img.height);
          const dData = ctx.getImageData(0, 0, img.width, img.height).data;
          depthArr = new Float32Array(img.width * img.height);
          for (let i = 0; i < depthArr.length; i++) {
            depthArr[i] = dData[i * 4] / 255.0;
          }
        }
      } catch (e) {
        console.warn('Baked depth fetch error, running estimator:', e);
      }
    }

    if (!depthArr) {
      const depthResult = await this.depthEstimator.estimateDepth(img.canvas, (p, text) => {
        this.setProgress(true, text, p);
      });
      depthArr = depthResult.depth;
    }

    // Sampling blocks the main thread for a moment: show the loader only for that real work,
    // and let the browser paint it before the work starts.
    this.setProgress(true, 'BUILDING PARTICLES...', 0.95);
    // (timeout fallback: requestAnimationFrame never fires in a background tab)
    await new Promise<void>((r) => {
      requestAnimationFrame(() => setTimeout(r, 0));
      setTimeout(r, 80);
    });
    let sampleData: SamplePointData;
    try {
      sampleData = sampleImageParticles(img.canvas, depthArr);
    } finally {
      this.setProgress(false);
    }

    const cached: CachedSample = {
      image: img,
      depth: depthArr,
      sampleData,
    };
    this.sampleCache.set(img.id, cached);
    return cached;
  }

  private async initDefaultSamples(): Promise<void> {
    try {
      const paths = ['/samples/sample-1.png', '/samples/sample-2.png'];
      const loaded: ProcessedImage[] = [];

      for (const p of paths) {
        const res = await fetch(p);
        if (!res.ok) continue;
        const blob = await res.blob();
        const f = new File([blob], p.split('/').pop() || 'sample.png', { type: 'image/png' });
        const proc = await processImageFile(f);
        loaded.push(proc);
      }

      if (loaded.length > 0) {
        this.images = loaded;
        this.thumbs.setImages(this.images, 0);

        const currentCached = await this.getSampleDataForImage(this.images[0]);
        let nextCached = currentCached;
        if (this.images.length > 1) {
          nextCached = await this.getSampleDataForImage(this.images[1]);
        }
        this.engine.loadSampleData(currentCached.sampleData, nextCached.sampleData);
        this.frame.setReadout(1, this.images.length, this.images[0].hash);
      } else {
        this.frame.setReadout(0, 0, 'NO PICTURES');
        this.dropzone.showOverlay(true);
      }
    } catch (err) {
      console.warn('Init sample error:', err);
      this.frame.setReadout(0, 0, 'NO PICTURES');
      this.dropzone.showOverlay(true);
    }
  }

  public async switchImage(index: number): Promise<void> {
    if (index < 0 || index >= this.images.length) return;
    const prevIdx = this.activeIndex;
    this.activeIndex = index;

    const currentImg = this.images[prevIdx] || this.images[index];
    const nextImg = this.images[index];

    const currentCached = await this.getSampleDataForImage(currentImg);
    const nextCached = await this.getSampleDataForImage(nextImg);

    this.engine.loadSampleData(currentCached.sampleData, nextCached.sampleData);
    this.frame.setReadout(index + 1, this.images.length, nextImg.hash);
    this.thumbs.setActiveIndex(index);

    if (prevIdx !== index) {
      this.engine.startMorph();
    }
  }

  public nextImage(): void {
    if (this.images.length <= 1) return;
    const nextIdx = (this.activeIndex + 1) % this.images.length;
    this.switchImage(nextIdx);
  }

  public async deleteImage(index: number): Promise<void> {
    if (index < 0 || index >= this.images.length) return;
    const [removed] = this.images.splice(index, 1);
    this.sampleCache.delete(removed.id);

    if (this.images.length === 0) {
      this.activeIndex = 0;
      this.thumbs.setImages([], 0);
      this.engine.setHasActiveImage(false);
      this.frame.setReadout(0, 0, 'NO PICTURES');
      this.dropzone.showOverlay(true);
      return;
    }

    const nextIdx = Math.min(this.activeIndex, this.images.length - 1);
    this.activeIndex = nextIdx;
    this.thumbs.setImages(this.images, nextIdx);
    // Rebuild the GPU pair from whatever remains (the morph partner may have changed)
    await this.switchImage(nextIdx);
  }

  public async handleFiles(files: File[]): Promise<void> {
    this.dropzone.showOverlay(false);
    for (const f of files) {
      if (this.images.length >= MAX_IMAGES) break;
      const proc = await processImageFile(f);
      this.images.push(proc);
    }

    this.thumbs.setImages(this.images, this.images.length - 1);
    this.switchImage(this.images.length - 1);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
