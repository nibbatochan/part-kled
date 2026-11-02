// src/main.ts
import { defaults, loadFromStorage, saveToStorage, withEffectsStart, withLightStart, type Params } from './core/params';
import { WebEngine, pointBudget } from './web/WebEngine';
import { sampleLite, type LiteSample } from './lite/sample';
import { DEPTH_MAX_SIDE, DepthEstimator } from './depth/DepthEstimator';
import { Dropzone } from './ui/Dropzone';
import { Frame } from './ui/Frame';
import { ExportPanel } from './ui/ExportPanel';
import { MusicPanel } from './ui/MusicPanel';
import { desktopApi, initDesktopMode } from './desktop';
import { Panel } from './ui/Panel';
import { MAX_IMAGES, Thumbs } from './ui/Thumbs';
import { LookPicker } from './ui/LookPicker';
import { processImageFile, type ProcessedImage } from './utils/image';
import { isModelFile, modelCloudFor, modelDepthFor, processModelFile } from './model/modelInput';
import { CloudView } from './model/CloudView';
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
  dw: number;
  dh: number;
  sampleData: LiteSample;
}

/** How long a picture without baked depth waits for the depth model before it loads flat. */
const DEPTH_WAIT_MS = 30000;
/** Side of the flat depth used when the model is not ready. */
const FLAT_DEPTH_SIDE = 64;

class App {
  private params: Params;
  public engine!: WebEngine;
  private frame!: Frame;
  private thumbs!: Thumbs;
  private looks?: LookPicker;
  // Picture history, as Photoshop's History panel: each step of a picture action knows how to undo itself
  private history: { label: string; undo: () => void }[] = [];
  private undoTimer = 0;
  private dropzone!: Dropzone;
  private panel!: Panel;
  private depthEstimator = new DepthEstimator();
  // 3D model pictures show their point cloud here, turnable, instead of the picture engine
  private cloudView: CloudView | null = null;

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
  private noticeTimer = 0;
  private paused = false; // the desktop app pauses the picture while locked, minimised, asleep or a full-screen app runs
  // The video page is the same app opened with ?view=video (set on <body> before any script runs)
  private videoView = document.body.dataset.mode === 'video';

  constructor() {
    this.params = withEffectsStart(); // every load starts at the normal settings with no effects; no light mode any more

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
    this.thumbs = new Thumbs('#thumbnail-strip', {
      onSelect: (idx) => this.switchImage(idx),
      onAdd: () => this.dropzone.openPicker(),
      onDelete: (idx) => this.deleteImage(idx),
      onMove: (from, to) => this.moveImage(from, to),
      onReplace: (idx, file) => this.replaceImage(idx, file),
    });

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
        this.looks?.refresh();
      },
      () => this.nextImage(),
      () => this.panel.toggleLight(),
      () => this.dropzone.openPicker()
    );

    // 5a. LOOK tiles: one small drawing of the picture per look
    this.looks = new LookPicker(() => this.engine.exportSnapshot(), () => this.params);
    this.looks.refresh(0);
    document.getElementById('undo-btn')?.addEventListener('click', () => this.undoStep());
    // Ctrl+Z steps back through the picture history (not while typing in a field)
    window.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        this.undoStep();
      }
    });

    // 5b. Export box: images and video at fixed sizes, drawn on a second off-screen engine
    new ExportPanel(() => this.engine.exportSnapshot());
    new MusicPanel(this.engine); // 5c. MUSIC: sound moves the particles
    const desk = desktopApi(); // 5d. Desktop app only: the WALLPAPER switch
    if (desk) {
      initDesktopMode(desk);
      // The wallpaper: picture 20% smaller, equalizer dots 20% smaller
      desk.onWallpaper((on) => (on ? this.engine.setPictureZoom(0.72 * 0.8, 0.8) : this.engine.setPictureZoom(0.72, 1)));
      desk.onPause((p) => {
        this.paused = p;
      });
    }

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

    if (this.videoView) {
      // No pictures here: the stage stays empty until a video is opened
      this.initVideoView();
      return;
    }

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
      if (r.width > 0 && r.height > 0) {
        this.engine.resize(r.width, r.height);
        this.cloudView?.resize(r.width, r.height);
      }
    }).observe(wrap);
  }

  /** A model picture shows its 3D cloud on its own canvas; a photo shows the picture engine. */
  private showCloudFor(img: ProcessedImage): void {
    const wrap = document.getElementById('stage-wrap');
    const cloud = modelCloudFor(img);
    if (!cloud) {
      this.cloudView?.hide();
      wrap?.classList.remove('is-cloud');
      return;
    }
    if (!this.cloudView) {
      const canvas = document.getElementById('cloud') as HTMLCanvasElement | null;
      if (!canvas) return;
      this.cloudView = new CloudView(canvas);
      const r = wrap?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) this.cloudView.resize(r.width, r.height);
    }
    this.cloudView.show(cloud);
    wrap?.classList.add('is-cloud');
  }

  private loop(currentTime: number): void {
    if (this.paused) {
      setTimeout(() => requestAnimationFrame((t) => this.loop(t)), 500); // keeps the loop alive, costs nothing
      return;
    }
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

    // Scrubbing pauses the clip; the picture follows the playhead to the keyframe under it
    document.getElementById('clip-scrub')?.addEventListener('input', (e) => {
      const c = this.clip;
      if (!c || this.preparing) return;
      c.pause();
      c.video.currentTime = Number((e.target as HTMLInputElement).value);
      this.updateTime();
    });
  }

  /**
   * The video page is the same app opened with ?view=video: its own console, no pictures loaded,
   * nothing on the stage until a video is opened.
   */
  private initVideoView(): void {
    this.frame.setReadout(0, 0, 'NO VIDEO');
    const overlay = document.getElementById('dropzone');
    overlay?.querySelector('.dropzone-title')?.replaceChildren('DROP A VIDEO');
    overlay?.querySelector('.dropzone-sub')?.replaceChildren('MP4, WEBM OR MOV · YOU PICK UP TO 10 SECONDS');
    document.getElementById('dropzone-picker-btn')?.replaceChildren('CHOOSE VIDEO');
    this.dropzone.showOverlay(true);
    this.clipMessage = 'OPEN A VIDEO TO START';
    this.updateClipReadout();
  }

  /** A message the user cannot miss: the loader bar, then gone after a few seconds. */
  private notice(text: string, ms = 5000): void {
    this.setProgress(true, text, 0);
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.setProgress(false), ms);
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
      this.clipMessage = 'BUILD DEPTH FIRST';
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
    window.clearTimeout(this.noticeTimer);
    this.setProgress(true, 'READING VIDEO...', 0.3);
    this.clipMessage = 'READING VIDEO...';
    this.updateClipReadout();
    try {
      const c = await ClipPlayer.open(file);
      this.clip = c;
      this.clipMessage = '';
      c.video.addEventListener('play', () => this.syncClipButtons());
      c.video.addEventListener('pause', () => this.syncClipButtons());
      const scrub = document.getElementById('clip-scrub') as HTMLInputElement | null;
      if (scrub) {
        scrub.max = String(c.duration);
        scrub.value = '0';
      }
      // At once, so the stage is not empty: the first frame as particles, flat until depth is built
      this.setProgress(true, 'DRAWING FIRST FRAME...', 0.7);
      this.engine.showSample(await c.previewSample(pointBudget()));
      this.frame.setReadout(0, 0, 'VIDEO · FLAT PREVIEW');
      this.setProgress(false);
    } catch (e) {
      console.warn('Clip open failed:', e);
      this.clipMessage = (e as Error).message.toUpperCase();
      this.notice(this.clipMessage, 8000);
      if (!this.clip) this.dropzone.showOverlay(true);
    }
    this.syncClipButtons();
    this.updateClipReadout();
    this.updateTime();
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
      this.clipMessage = 'CHOOSE THE PART FIRST: SET START AND END';
      this.updateClipReadout();
      return;
    }

    this.preparing = true;
    c.pause();
    this.setPrepareLabel('CANCEL');
    this.frame.setReadout(0, 0, 'VIDEO · BUILDING DEPTH');
    this.syncClipButtons();
    try {
      const ok = await c.prepare(this.depthEstimator, pointBudget(), (p, text) => {
        this.setProgress(true, text, p);
      });
      this.clipMessage = ok ? '' : 'CANCELLED';
      if (ok) {
        c.play();
        this.frame.setReadout(0, 0, 'VIDEO · PLAYING');
      } else {
        this.frame.setReadout(0, 0, 'VIDEO · FLAT PREVIEW');
      }
    } catch (e) {
      console.warn('Clip depth failed:', e);
      this.clipMessage = `DEPTH FAILED: ${(e as Error).message.toUpperCase()}`;
      this.notice(this.clipMessage, 8000);
    } finally {
      this.preparing = false;
      if (!this.clipMessage.startsWith('DEPTH FAILED')) this.setProgress(false);
      this.setPrepareLabel('BUILD DEPTH');
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
    this.updateTime();
  }

  /** Playhead time next to the slider, so the slider is not a mystery. */
  private updateTime(): void {
    const out = document.getElementById('clip-time');
    if (!out) return;
    const c = this.clip;
    out.textContent = c ? `${c.video.currentTime.toFixed(2)} / ${c.duration.toFixed(2)} S` : '0.00 / 0.00 S';
  }

  private updateClipReadout(): void {
    const c = this.clip;
    const readout = document.getElementById('clip-readout');
    const len = document.getElementById('clip-len');
    if (!c) {
      if (readout) readout.textContent = this.clipMessage || 'OPEN A VIDEO TO START';
      if (len) len.textContent = '0.0 S';
      this.updateTime();
      return;
    }
    const span = c.range.end - c.range.start;
    if (len) len.textContent = `${span.toFixed(1)} S`;
    let text = this.clipMessage;
    if (!text) {
      const range = `PART ${c.range.start.toFixed(2)} TO ${c.range.end.toFixed(2)} S`;
      text = !c.hasRange
        ? 'MOVE THE PLAYHEAD, THEN SET START AND END'
        : c.samples
          ? `${range} · DEPTH READY (${c.samples.length} STILLS) · PRESS PLAY`
          : `${range} · PRESS BUILD DEPTH`;
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
    // Keyed by the picture's content hash and the treatment: a duplicate reuses the depth work of its original
    const key = img.hash;
    if (this.sampleCache.has(key)) {
      return this.sampleCache.get(key)!;
    }

    // Check if pre-baked depth map exists for sample (instant, no loader)
    let depthArr: Float32Array | null = null;
    let dw = 0;
    let dh = 0;
    // A picture rendered from a 3D model already has its depth: no estimate, no baked lookup
    const modelDepth = modelDepthFor(img);
    if (modelDepth) {
      depthArr = modelDepth.depth;
      dw = modelDepth.dw;
      dh = modelDepth.dh;
    }
    const baseName = img.name.replace(/\.[^.]+$/, '');
    if (!depthArr && baseName.startsWith('sample-')) {
      try {
        const bakedRes = await fetch(`/samples/${baseName}-depth.png`);
        // A missing file can answer 200 with the app's HTML (dev server fallback): only an image counts as baked depth
        if (bakedRes.ok && (bakedRes.headers.get('content-type') ?? '').startsWith('image/')) {
          const blob = await bakedRes.blob();
          const imgEl = new Image();
          const url = URL.createObjectURL(blob);
          const loaded = await new Promise<boolean>((r) => {
            imgEl.onload = () => r(true);
            imgEl.onerror = () => r(false);
            imgEl.src = url;
          });
          URL.revokeObjectURL(url);
          if (!loaded) throw new Error(`baked depth for ${baseName} does not decode`);

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
      // A picture without baked depth waits for the model. If the model cannot be fetched or stalls, the picture
      // still loads, flat, so switching never hangs on it.
      const estimate = this.depthEstimator.estimateDepth(img.canvas, (p, text) => {
        this.setProgress(true, text, p);
      });
      const stall = new Promise<null>((resolve) => setTimeout(() => resolve(null), DEPTH_WAIT_MS));
      const depthResult = await Promise.race([estimate.catch((e) => { console.warn('Depth failed, picture loads flat:', e); return null; }), stall]);
      if (depthResult) {
        depthArr = depthResult.depth;
        dw = depthResult.width;
        dh = depthResult.height;
      } else {
        dw = FLAT_DEPTH_SIDE;
        dh = FLAT_DEPTH_SIDE;
        depthArr = new Float32Array(dw * dh).fill(0.5);
        console.warn('No depth for this picture yet: it loads flat.');
      }
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
      dw,
      dh,
      sampleData,
    };
    this.sampleCache.set(key, cached);
    return cached;
  }

  private async initDefaultSamples(): Promise<void> {
    try {
      const paths = ['/samples/sample-1.png', '/samples/sample-2.png', '/samples/sample-7.jpg', '/samples/sample-8.png', '/samples/sample-10.png'];
      const loaded: ProcessedImage[] = [];

      for (const p of paths) {
        const res = await fetch(p);
        if (!res.ok) continue;
        const blob = await res.blob();
        const f = new File([blob], p.split('/').pop() || 'sample.png', { type: blob.type || 'image/png' });
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
        this.looks?.refresh(); // the picture is on screen now: draw the LOOK tiles from it
        this.frame.setReadout(1, this.images.length, '');
        // The rest build in the background, so each picture already has its depth when it is first switched to
        for (const img of this.images.slice(2)) {
          this.getSampleDataForImage(img).catch((e) => console.warn('Background depth failed:', e));
        }
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
    // One set of settings for every picture: switching keeps what the panel shows
    this.activeIndex = index;

    const currentImg = this.images[prevIdx] || this.images[index];
    const nextImg = this.images[index];

    const currentCached = await this.getSampleDataForImage(currentImg);
    const nextCached = await this.getSampleDataForImage(nextImg);
    // A later switch may have started while these awaited: never load a picture that is no longer active
    if (this.activeIndex !== index) return;

    this.engine.loadSampleData(currentCached.sampleData, nextCached.sampleData);
    this.showCloudFor(nextImg);
    this.frame.setReadout(index + 1, this.images.length, '');
    this.thumbs.setActiveIndex(index);
    this.looks?.refresh();

    if (prevIdx !== index) {
      this.engine.startMorph();
    }
  }

  public nextImage(): void {
    if (this.images.length <= 1) return;
    const nextIdx = (this.activeIndex + 1) % this.images.length;
    this.switchImage(nextIdx);
  }

  /** The live settings of the picture at index: the active one is read from the panel, the others are stored. */
  private settingsOf(index: number): Params | undefined {
    if (index === this.activeIndex) return clone(this.params);
    return this.settingsByImage.get(this.images[index].id);
  }

  /** Keep the active picture active after the list changed: find it by id, store its settings first. */
  private rebuildAround(activeId: string | null, images: ProcessedImage[]): void {
    this.images = images;
    this.activeIndex = Math.max(0, activeId ? this.images.findIndex((i) => i.id === activeId) : 0);
  }

  /** Record a picture action so it can be undone, newest last. The toast names the latest step. */
  private pushHistory(label: string, undo: () => void): void {
    this.history.push({ label, undo });
    if (this.history.length > 20) this.history.shift();
    this.showUndo(label);
  }

  /** Step back one picture action (Ctrl+Z or the UNDO button). */
  public undoStep(): void {
    const step = this.history.pop();
    if (!step) {
      this.hideUndo();
      return;
    }
    step.undo();
    const last = this.history[this.history.length - 1];
    if (last) this.showUndo(last.label);
    else this.hideUndo();
  }

  public async deleteImage(index: number): Promise<void> {
    if (index < 0 || index >= this.images.length) return;
    const settings = this.settingsOf(index);
    const removed = this.images[index];
    const activeId = this.images[this.activeIndex]?.id ?? null;
    this.settingsByImage.delete(removed.id);
    this.images = this.images.filter((_, i) => i !== index);
    this.pushHistory(`PICTURE ${index + 1} DELETED`, () => this.putPictureBack(index, removed, settings));

    if (this.images.length === 0) {
      this.activeIndex = 0;
      this.thumbs.setImages([], 0);
      this.engine.setHasActiveImage(false);
      this.frame.setReadout(0, 0, 'NO PICTURES');
      this.dropzone.showOverlay(true);
      return;
    }

    // The active picture stays active; if it was the one removed, the next one takes over
    const nextIdx = index === this.activeIndex ? Math.min(index, this.images.length - 1) : this.images.findIndex((i) => i.id === activeId);
    this.activeIndex = nextIdx;
    this.thumbs.setImages(this.images, nextIdx);
    // The panel shows the settings of the picture that is now active; this also rebuilds the GPU pair
    this.panel.setParams(this.settingsByImage.get(this.images[nextIdx].id) ?? freshSettings());
    await this.switchImage(nextIdx);
  }

  /** Undo of a delete: the picture comes back at its old place, with its settings. */
  private putPictureBack(index: number, image: ProcessedImage, settings: Params | undefined): void {
    if (this.images.length >= MAX_IMAGES) {
      this.notice('NO ROOM TO RESTORE: FIVE PICTURES ALREADY', 4000);
      return;
    }
    const activeId = this.images[this.activeIndex]?.id ?? null;
    if (activeId) this.settingsByImage.set(activeId, clone(this.params));
    const at = Math.min(index, this.images.length);
    this.images.splice(at, 0, image);
    if (settings) this.settingsByImage.set(image.id, settings);
    this.thumbs.setImages(this.images, at);
    this.activeIndex = at;
    this.panel.setParams(this.settingsByImage.get(image.id) ?? freshSettings());
    void this.switchImage(at);
  }

  /** Move a picture in the strip; the active one stays active. */
  public moveImage(from: number, to: number): void {
    if (!this.shiftImage(from, to)) return;
    this.pushHistory('PICTURE MOVED', () => this.shiftImage(to, from));
  }

  private shiftImage(from: number, to: number): boolean {
    if (from === to || from < 0 || to < 0 || from >= this.images.length || to >= this.images.length) return false;
    const activeId = this.images[this.activeIndex]?.id ?? null;
    const list = this.images.slice();
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    this.rebuildAround(activeId, list);
    this.thumbs.setImages(this.images, this.activeIndex);
    return true;
  }

  /** A dropped file takes the place of one picture; that slot keeps its settings and place. */
  public async replaceImage(index: number, file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.notice('ONLY PICTURES CAN REPLACE A PICTURE', 4000);
      return;
    }
    const old = this.images[index];
    if (!old) return;
    const settings = this.settingsOf(index);
    const proc = await processImageFile(file);
    // The list may have changed while the file was read: find the slot again by the picture it held
    const at = this.images.findIndex((i) => i.id === old.id);
    if (at < 0) return;
    this.pushHistory('PICTURE REPLACED', () => this.swapPicture(this.images.findIndex((i) => i.id === proc.id), old, settings));
    this.swapPicture(at, proc, settings);
  }

  /** Put image into slot index with the given settings, and show it if it is the active one. */
  private swapPicture(index: number, image: ProcessedImage, settings: Params | undefined): void {
    if (index < 0) return;
    const current = this.images[index];
    if (current) this.settingsByImage.delete(current.id);
    if (settings) this.settingsByImage.set(image.id, settings);
    this.images = this.images.map((i, n) => (n === index ? image : i));
    this.thumbs.setImages(this.images, this.activeIndex);
    if (index === this.activeIndex) {
      this.panel.setParams(this.settingsByImage.get(image.id) ?? freshSettings());
      void this.switchImage(index);
    }
  }

  private showUndo(text: string): void {
    const bar = document.getElementById('undo-toast');
    const msg = document.getElementById('undo-msg');
    if (!bar || !msg) return;
    msg.textContent = `${text} · CTRL+Z`;
    bar.hidden = false;
    window.clearTimeout(this.undoTimer);
    this.undoTimer = window.setTimeout(() => this.hideUndo(), 6000);
  }

  private hideUndo(): void {
    window.clearTimeout(this.undoTimer);
    const bar = document.getElementById('undo-toast');
    if (bar) bar.hidden = true;
  }

  public async handleFiles(files: File[]): Promise<void> {
    const video = files.find((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name));
    // Pictures and video live on separate pages: a file for the other page gets a clear message
    if (video && !this.videoView) {
      this.notice('VIDEO HAS ITS OWN PAGE: PRESS "VIDEO" AT THE TOP RIGHT', 7000);
      return;
    }
    if (!video && this.videoView) {
      this.notice('THIS PAGE TAKES VIDEO ONLY: PRESS "LAB" FOR PICTURES', 7000);
      return;
    }
    if (video) {
      await this.openClip(video);
      return;
    }
    this.dropzone.showOverlay(false);
    for (const f of files) {
      if (this.images.length >= MAX_IMAGES) break;
      const proc = isModelFile(f) ? await processModelFile(f, pointBudget()) : await processImageFile(f);
      this.images.push(proc);
    }

    this.thumbs.setImages(this.images, this.images.length - 1);
    this.switchImage(this.images.length - 1);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
