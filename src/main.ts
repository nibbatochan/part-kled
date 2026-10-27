// src/main.ts
import { defaults, loadFromStorage, saveToStorage, withLightStart, type Params } from './core/params';
import { WebEngine, pointBudget } from './web/WebEngine';
import { sampleLite, type LiteSample } from './lite/sample';
import { DEPTH_MAX_SIDE, DepthEstimator } from './depth/DepthEstimator';
import { Dropzone } from './ui/Dropzone';
import { Frame } from './ui/Frame';
import { ExportPanel } from './ui/ExportPanel';
import { Panel } from './ui/Panel';
import { MAX_IMAGES, Thumbs } from './ui/Thumbs';
import { processImageFile, type ProcessedImage } from './utils/image';
import { setupKeyboardShortcuts } from './utils/keys';
import { ClipPlayer } from './video/ClipPlayer';

/** Defaults for a picture that has no settings yet: the light start values, dark background. */
function freshSettings(): Params {
  return withLightStart({ ...clone(defaults), background: 'dark' });
}

function clone(p: Params): Params {
  return JSON.parse(JSON.stringify(p)) as Params;
}

interface CachedSample {
  image: ProcessedImage;
  depth: Float32Array;
  sampleData: LiteSample;
}

class App {
  private params: Params;
  public engine!: WebEngine;
  private frame!: Frame;
  private thumbs!: Thumbs;
  private dropzone!: Dropzone;
  private panel!: Panel;
  private depthEstimator = new DepthEstimator();

  public images: ProcessedImage[] = [];
  private sampleCache: Map<string, CachedSample> = new Map();
  // Each picture keeps its own settings. A picture with none yet gets the fresh defaults.
  private settingsByImage: Map<string, Params> = new Map();
  public activeIndex: number = 0;
  private lastTime: number = performance.now();
  // Video clip mode: null while the studio shows pictures
  private clip: ClipPlayer | null = null;
  private preparing = false;
  private lastIdleDraw = 0;
  private clipMessage = '';

  constructor() {
    this.params = withLightStart({ ...loadFromStorage(), background: 'dark' }); // no light mode any more

    const stageCanvas = document.getElementById('stage') as HTMLCanvasElement;
    if (!stageCanvas) throw new Error('Stage canvas missing');

    // 1. Initialize Engine
    this.engine = new WebEngine(stageCanvas);
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

    // 5b. Export box: images and video at fixed sizes, drawn on a second off-screen engine
    new ExportPanel(() => this.engine.exportSnapshot());

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
    this.bindClip();

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));

    // Load initial sample images
    // The samples ship with baked depth, so the model is not needed yet. Fetch it in the background
    // once they are up, so the first upload does not wait for the download.
    this.initDefaultSamples().then(() => {
      const warm = () => this.depthEstimator.warmup();
      if ('requestIdleCallback' in window) (window as any).requestIdleCallback(warm, { timeout: 4000 });
      else setTimeout(warm, 1500);
    });
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

    const clip = this.clip;
    if (clip) {
      const next = clip.nextSample();
      if (next) this.engine.morphTo(next);
      if (clip.playing) {
        this.syncScrub();
      } else {
        // Paused clip: the picture is still, so draw at 10 Hz instead of every frame
        if (currentTime - this.lastIdleDraw < 100) {
          requestAnimationFrame((t) => this.loop(t));
          return;
        }
        this.lastIdleDraw = currentTime;
      }
    }

    // Update 3D simulation and render
    this.engine.update(dt, currentTime / 1000);

    requestAnimationFrame((t) => this.loop(t));
  }

  private bindClip(): void {
    const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', fn);
    on('clip-in-btn', () => this.clipEdit((c) => c.setInHere()));
    on('clip-out-btn', () => this.clipEdit((c) => c.setOutHere()));
    on('clip-play-btn', () => this.togglePlay());
    on('clip-prepare-btn', () => this.prepareClip());
    on('clip-open-btn', () => this.dropzone.openPicker());

    // LAB (pictures) and VIDEO (clips) are separate workspaces in the same console
    document.querySelectorAll<HTMLElement>('#mode-switch [data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode === 'video' ? 'video' : 'lab'));
    });

    // Scrubbing pauses the clip; the picture follows the playhead to the keyframe under it
    document.getElementById('clip-scrub')?.addEventListener('input', (e) => {
      const c = this.clip;
      if (!c || this.preparing) return;
      c.pause();
      c.video.currentTime = Number((e.target as HTMLInputElement).value);
    });
  }

  /**
   * Switch workspace. Leaving VIDEO closes the clip and puts the active picture back on the stage.
   * `restore` is false when the caller is already switching to a picture.
   */
  private setMode(mode: 'lab' | 'video', restore = true): void {
    const current = document.body.dataset.mode === 'video' ? 'video' : 'lab';
    document.body.dataset.mode = mode;
    document.querySelectorAll<HTMLElement>('#mode-switch [data-mode]').forEach((btn) => {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    if (mode === 'lab' && current === 'video') {
      this.stopClip();
      if (restore && this.images.length > 0) void this.switchImage(this.activeIndex);
    }
    if (mode === 'video') {
      this.clipMessage = this.clip ? '' : 'OPEN A VIDEO TO START';
      this.updateClipReadout();
    }
  }

  private clipEdit(edit: (c: ClipPlayer) => void): void {
    if (!this.clip || this.preparing) return;
    edit(this.clip);
    this.clipMessage = '';
    this.updateClipReadout();
  }

  private togglePlay(): void {
    const c = this.clip;
    if (!c || this.preparing) return;
    if (!c.samples) {
      this.clipMessage = 'PREPARE FIRST';
    } else if (c.playing) {
      c.pause();
    } else {
      c.play();
    }
    this.syncClipButtons();
    this.updateClipReadout();
  }

  private async openClip(file: File): Promise<void> {
    this.stopClip();
    this.dropzone.showOverlay(false);
    this.setMode('video');
    this.clipMessage = 'OPENING VIDEO...';
    this.updateClipReadout();
    try {
      const c = await ClipPlayer.open(file);
      // The user may have gone back to the lab while the file was opening
      if (document.body.dataset.mode !== 'video') {
        c.dispose();
        return;
      }
      this.clip = c;
      this.clipMessage = '';
      c.video.addEventListener('play', () => this.syncClipButtons());
      c.video.addEventListener('pause', () => this.syncClipButtons());
      const scrub = document.getElementById('clip-scrub') as HTMLInputElement | null;
      if (scrub) {
        scrub.max = String(c.duration);
        scrub.value = '0';
      }
    } catch (e) {
      console.warn('Clip open failed:', e);
      this.clipMessage = (e as Error).message.toUpperCase();
    }
    this.syncClipButtons();
    this.updateClipReadout();
  }

  private stopClip(): void {
    if (!this.clip) return;
    this.clip.cancelPrepare();
    this.clip.dispose();
    this.clip = null;
    this.clipMessage = '';
    this.preparing = false;
  }

  private async prepareClip(): Promise<void> {
    const c = this.clip;
    if (!c) return;
    if (this.preparing) {
      c.cancelPrepare();
      return;
    }
    if (!c.hasRange) {
      this.clipMessage = 'SET IN AND OUT FIRST';
      this.updateClipReadout();
      return;
    }

    this.preparing = true;
    c.pause();
    this.setPrepareLabel('CANCEL');
    this.syncClipButtons();
    try {
      const ok = await c.prepare(this.depthEstimator, pointBudget(), (p, text) => {
        this.setProgress(true, text, p);
      });
      this.clipMessage = ok ? '' : 'PREPARE CANCELLED';
      if (ok) c.play();
    } catch (e) {
      console.warn('Clip prepare failed:', e);
      this.clipMessage = `PREPARE FAILED: ${(e as Error).message.toUpperCase()}`;
    } finally {
      this.preparing = false;
      this.setProgress(false);
      this.setPrepareLabel('PREPARE');
      this.syncClipButtons();
      this.updateClipReadout();
    }
  }

  private setPrepareLabel(text: string): void {
    const btn = document.getElementById('clip-prepare-btn');
    if (btn) btn.textContent = text;
  }

  private syncClipButtons(): void {
    const btn = document.getElementById('clip-play-btn');
    const playing = !!this.clip?.playing;
    if (btn) {
      btn.textContent = playing ? 'PAUSE' : 'PLAY';
      btn.classList.toggle('active', playing);
    }
  }

  private syncScrub(): void {
    const scrub = document.getElementById('clip-scrub') as HTMLInputElement | null;
    if (scrub && this.clip) scrub.value = String(this.clip.video.currentTime);
  }

  private updateClipReadout(): void {
    const c = this.clip;
    const readout = document.getElementById('clip-readout');
    const len = document.getElementById('clip-len');
    if (!c) {
      if (readout) readout.textContent = this.clipMessage || 'OPEN A VIDEO TO START';
      if (len) len.textContent = '0.0 S';
      return;
    }
    const span = c.range.end - c.range.start;
    if (len) len.textContent = `${span.toFixed(1)} S`;
    let text = this.clipMessage;
    if (!text) {
      const range = `IN ${c.range.start.toFixed(2)} OUT ${c.range.end.toFixed(2)}`;
      text = !c.hasRange
        ? 'SET IN AND OUT, THEN PREPARE'
        : c.samples
          ? `${range} · ${c.samples.length} KEYFRAMES`
          : `${range} · PREPARE TO PLAY`;
    }
    if (readout) readout.textContent = text;
  }

  private setProgress(show: boolean, text: string = '', pct: number = 0): void {
    const ind = document.getElementById('loading-indicator');
    const txt = document.getElementById('loading-text');
    const bar = document.getElementById('progress-fill');
    if (!ind || !txt || !bar) return;

    ind.classList.toggle('hidden', !show);
    txt.textContent = text;
    bar.style.width = `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`; // never past 100%
  }

  public async getSampleDataForImage(img: ProcessedImage): Promise<CachedSample> {
    if (this.sampleCache.has(img.id)) {
      return this.sampleCache.get(img.id)!;
    }

    // Check if pre-baked depth map exists for sample (instant, no loader)
    let depthArr: Float32Array | null = null;
    let dw = 0;
    let dh = 0;
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

          // Same working size the estimator uses: the sampler never reads depth at full picture size
          const k = Math.min(1, DEPTH_MAX_SIDE / Math.max(img.width, img.height));
          dw = Math.max(2, Math.round(img.width * k));
          dh = Math.max(2, Math.round(img.height * k));
          const c = document.createElement('canvas');
          c.width = dw;
          c.height = dh;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(imgEl, 0, 0, dw, dh);
          const dData = ctx.getImageData(0, 0, dw, dh).data;
          depthArr = new Float32Array(dw * dh);
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
      dw = depthResult.width;
      dh = depthResult.height;
    }

    // Sampling blocks the main thread for a moment: show the loader only for that real work,
    // and let the browser paint it before the work starts.
    this.setProgress(true, 'BUILDING PARTICLES...', 0.95);
    // (timeout fallback: requestAnimationFrame never fires in a background tab)
    await new Promise<void>((r) => {
      requestAnimationFrame(() => setTimeout(r, 0));
      setTimeout(r, 80);
    });
    let sampleData: LiteSample;
    try {
      sampleData = sampleLite(img.canvas, depthArr, dw, dh, pointBudget());
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
    this.stopClip();
    // A picture is being shown, so the lab is the workspace (the caller restores the stage itself)
    if (document.body.dataset.mode === 'video') this.setMode('lab', false);
    const prevIdx = this.activeIndex;
    if (prevIdx !== index && this.images[prevIdx]) {
      this.settingsByImage.set(this.images[prevIdx].id, clone(this.params));
    }
    this.activeIndex = index;
    if (prevIdx !== index) {
      this.panel.setParams(this.settingsByImage.get(this.images[index].id) ?? freshSettings());
    }

    const currentImg = this.images[prevIdx] || this.images[index];
    const nextImg = this.images[index];

    const currentCached = await this.getSampleDataForImage(currentImg);
    const nextCached = await this.getSampleDataForImage(nextImg);
    // A later switch may have started while these awaited: never load a picture that is no longer active
    if (this.activeIndex !== index) return;

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
    const video = files.find((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name));
    if (video) {
      await this.openClip(video);
      return;
    }
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
