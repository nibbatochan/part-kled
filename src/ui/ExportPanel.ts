// src/ui/ExportPanel.ts
// The export dialog, opened from the icon in the header. Options are grouped (FRAME, VIEW, OUTPUT) and a
// live preview on the left shows the exact frame: its shape, the picture's size and place in it.
import type { LiteEngine } from '../lite/LiteEngine';
import {
  applyFrame, download, exportImage, exportVideo, makeEngine,
  type ExportFrame, type ExportKind, type ImageFormat, type VideoFormat,
} from '../web/Exporter';
import { frameSize } from '../web/frameSize';
import type { ExportSnapshot } from '../web/WebEngine';

const STYLE_NAMES = ['dots', 'halftone', 'mosaic', 'dither', 'ascii', 'stipple', 'lines'];
const IMAGE_FORMATS: ImageFormat[] = ['png', 'jpg', 'webp'];
const VIDEO_FORMATS: VideoFormat[] = ['mp4', 'webm'];

/** Frame shapes. A phone lock screen is taller than 9:16; THIS SCREEN reads the real one. */
const RATIOS = [
  { w: 16, h: 9, label: '16:9', title: 'Widescreen, monitors and TVs' },
  { w: 9, h: 16, label: '9:16', title: 'Phone, full screen' },
  { w: 9, h: 19.5, label: '9:19.5', title: 'Modern phone lock screen' },
  { w: 1, h: 1, label: '1:1', title: 'Square' },
  { w: 4, h: 5, label: '4:5', title: 'Portrait post' },
  { w: 4, h: 3, label: '4:3', title: 'Tablet, landscape' },
  { w: 3, h: 4, label: '3:4', title: 'Tablet, portrait' },
  { w: 21, h: 9, label: '21:9', title: 'Ultrawide' },
];

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 6;

export class ExportPanel {
  private kind: ExportKind = 'image';
  private short = 1080;
  private imageFormat: ImageFormat = 'png';
  private videoFormat: VideoFormat = 'mp4';
  private fps = 30;
  private seconds = 8;
  private frame: ExportFrame = { aspect: 16 / 9, short: 1080, zoom: 1, panX: 0, panY: 0 };
  private abort: AbortController | null = null;

  // preview
  private snap: ExportSnapshot | null = null;
  private engine: LiteEngine | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private drag: { x: number; y: number } | null = null;
  private observer: ResizeObserver | null = null;

  private modal = document.getElementById('export-modal') as HTMLElement;
  private opener = document.getElementById('export-btn') as HTMLButtonElement;
  private stage = document.getElementById('ex-stage') as HTMLElement;
  private go = document.getElementById('ex-go') as HTMLButtonElement;
  private status = document.getElementById('ex-status') as HTMLElement;
  private bar = document.getElementById('ex-bar') as HTMLElement;
  private fill = document.getElementById('ex-fill-bar') as HTMLElement;
  private formatBox = document.getElementById('ex-format') as HTMLElement;
  private len = document.getElementById('ex-len') as HTMLInputElement;
  private zoom = document.getElementById('ex-zoom') as HTMLInputElement;
  private rw = document.getElementById('ex-rw') as HTMLInputElement;
  private rh = document.getElementById('ex-rh') as HTMLInputElement;
  private ratioBox = document.getElementById('ex-ratios') as HTMLElement;

  constructor(private getSnapshot: () => ExportSnapshot | null) {
    this.opener.addEventListener('click', () => this.open());
    document.getElementById('ex-close')?.addEventListener('click', () => this.close());
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close(); // click on the backdrop
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.close();
    });

    this.buildRatios();
    this.bindSeg('ex-kind', 'kind', (v) => {
      this.kind = v as ExportKind;
      this.refresh();
    });
    this.bindSeg('ex-size', 'size', (v) => {
      this.short = Number(v);
      this.frame.short = this.short;
      this.showDims();
    });
    this.bindSeg('ex-fps', 'fps', (v) => (this.fps = Number(v)));
    this.len.addEventListener('input', () => {
      this.seconds = Number(this.len.value);
      this.showLength();
    });
    this.zoom.addEventListener('input', () => this.setZoom(Number(this.zoom.value)));
    document.getElementById('ex-fit')?.addEventListener('click', () => this.fitPicture(false));
    document.getElementById('ex-fill')?.addEventListener('click', () => this.fitPicture(true));
    document.getElementById('ex-center')?.addEventListener('click', () => {
      this.frame.zoom = 1;
      this.frame.panX = 0;
      this.frame.panY = 0;
      this.syncView();
    });
    this.rw.addEventListener('input', () => this.customRatio());
    this.rh.addEventListener('input', () => this.customRatio());
    document.getElementById('ex-screen')?.addEventListener('click', () => {
      const w = window.screen.width;
      const h = window.screen.height;
      this.setRatio(w / h, `${w}`, `${h}`);
    });
    this.go.addEventListener('click', () => (this.abort ? this.abort.abort() : void this.run()));

    // Preview: drag moves the picture, the wheel zooms
    this.stage.addEventListener('pointerdown', (e) => {
      if (!this.canvas || !this.canvas.contains(e.target as Node)) return;
      this.drag = { x: e.clientX, y: e.clientY };
      this.stage.setPointerCapture(e.pointerId);
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!this.drag || !this.canvas) return;
      const ch = Math.max(1, this.canvas.clientHeight);
      this.frame.panX += (e.clientX - this.drag.x) / ch;
      this.frame.panY -= (e.clientY - this.drag.y) / ch;
      this.drag = { x: e.clientX, y: e.clientY };
      this.syncView();
    });
    const endDrag = () => (this.drag = null);
    this.stage.addEventListener('pointerup', endDrag);
    this.stage.addEventListener('pointercancel', endDrag);
    this.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.frame.zoom * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    this.refresh();
    this.setRatio(16 / 9, '16', '9', 0);
  }

  // ---------- dialog ----------

  private open(): void {
    const snap = this.getSnapshot();
    if (!snap) return;
    this.snap = snap;
    this.modal.hidden = false;
    document.body.classList.add('modal-open');
    this.status.textContent = '';
    this.startPreview();
    (document.getElementById('ex-close') as HTMLButtonElement | null)?.focus();
  }

  private close(): void {
    if (this.modal.hidden) return;
    this.abort?.abort();
    this.stopPreview();
    this.modal.hidden = true;
    document.body.classList.remove('modal-open');
    this.opener.focus();
  }

  // ---------- options ----------

  private bindSeg(id: string, attr: string, set: (v: string) => void): void {
    const btns = document.querySelectorAll<HTMLButtonElement>(`#${id} [data-${attr}]`);
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        set(btn.dataset[attr] ?? '');
        btns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }

  private buildRatios(): void {
    RATIOS.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.textContent = r.label;
      b.title = r.title;
      b.dataset.ratio = String(i);
      b.addEventListener('click', () => this.setRatio(r.w / r.h, String(r.w), String(r.h), i));
      this.ratioBox.appendChild(b);
    });
  }

  /** index: the preset to light, or none for a custom shape */
  private setRatio(aspect: number, w: string, h: string, index = -1): void {
    this.frame.aspect = aspect;
    this.rw.value = w;
    this.rh.value = h;
    this.ratioBox.querySelectorAll('button').forEach((b) => b.classList.toggle('active', Number(b.dataset.ratio) === index));
    this.fitPreview();
  }

  private customRatio(): void {
    const w = parseFloat(this.rw.value);
    const h = parseFloat(this.rh.value);
    if (!(w > 0) || !(h > 0)) return; // half typed: wait
    this.frame.aspect = w / h;
    this.ratioBox.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    this.fitPreview();
  }

  /** Rows that do not apply to the chosen type are hidden; FORMAT lists what that type can write. */
  private refresh(): void {
    const still = this.kind === 'image';
    (document.getElementById('ex-fps-row') as HTMLElement).style.display = still ? 'none' : '';
    (document.getElementById('ex-len-row') as HTMLElement).style.display = still ? 'none' : '';
    (document.getElementById('ex-loop-note') as HTMLElement).style.display = this.kind === 'loop' ? '' : 'none';
    // A loop of 2 s would make every drifting stream cycle 2.5 to 5 times faster than the live view
    this.len.min = this.kind === 'loop' ? '4' : '2';
    if (this.seconds < Number(this.len.min)) {
      this.seconds = Number(this.len.min);
      this.len.value = String(this.seconds);
    }
    const formats: string[] = still ? IMAGE_FORMATS : VIDEO_FORMATS;
    const current = still ? this.imageFormat : this.videoFormat;
    this.formatBox.textContent = '';
    for (const f of formats) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn' + (f === current ? ' active' : '');
      b.textContent = f.toUpperCase();
      b.addEventListener('click', () => {
        if (still) this.imageFormat = f as ImageFormat;
        else this.videoFormat = f as VideoFormat;
        this.formatBox.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      });
      this.formatBox.appendChild(b);
    }
    this.showLength();
  }

  private showLength(): void {
    const out = this.len.parentElement?.querySelector('output');
    if (out) out.textContent = `${this.seconds} s`;
  }

  // ---------- view: zoom and place of the picture in the frame ----------

  private setZoom(z: number): void {
    this.frame.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    this.syncView();
  }

  /** FIT: the whole picture touches the frame. FILL: the picture covers the whole frame. */
  private fitPicture(cover: boolean): void {
    const snap = this.snap;
    if (!snap) return;
    const a = snap.sample.aspect;
    const A = this.frame.aspect;
    const contain = Math.min(1, A / a);
    const target = cover ? Math.max(1, A / a) : contain;
    this.frame.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target / contain / snap.layout.zoom));
    this.frame.panX = 0;
    this.frame.panY = 0;
    this.syncView();
  }

  private syncView(): void {
    this.zoom.value = String(this.frame.zoom);
    const out = document.getElementById('ex-zoom-out');
    if (out) out.textContent = `${Math.round(this.frame.zoom * 100)}%`;
    this.applyToPreview();
  }

  private showDims(): void {
    const { w, h } = frameSize(this.frame.aspect, this.frame.short);
    const el = document.getElementById('ex-dims');
    if (el) el.textContent = `${w} × ${h} PX`;
  }

  // ---------- preview ----------

  private startPreview(): void {
    this.stopPreview();
    const snap = this.snap;
    if (!snap) return;
    const canvas = document.createElement('canvas'); // a fresh canvas: a lost GL context cannot be reused
    canvas.className = 'ex-canvas';
    this.stage.replaceChildren(canvas);
    try {
      this.engine = makeEngine(snap, this.frame, { canvas, w: 2, h: 2, preserve: false }).engine;
    } catch (err) {
      this.status.textContent = err instanceof Error ? err.message : String(err);
      return;
    }
    this.canvas = canvas;
    this.observer = new ResizeObserver(() => this.fitPreview());
    this.observer.observe(this.stage);
    this.fitPreview();
    this.syncView();
    let last = performance.now();
    const tick = (now: number) => {
      const engine = this.engine;
      if (!engine) return;
      const dt = (now - last) / 1000;
      last = now;
      // The scene keeps up with what the live view does (style, effects, tilt)
      const s = this.getSnapshot();
      if (s) {
        this.snap = s;
        engine.setParams(s.params);
        engine.setView(s.view);
      }
      // A loop is shown looping, so the seam can be judged
      if (this.kind === 'loop') engine.renderAt((now / 1000) % this.seconds, this.seconds);
      else engine.frame(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopPreview(): void {
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.observer = null;
    this.engine?.dispose();
    this.engine = null;
    this.canvas = null;
    this.stage.replaceChildren();
  }

  /** Fit the frame's shape into the preview area and size the drawing buffer to match. */
  private fitPreview(): void {
    this.showDims();
    const { engine, canvas, snap } = this;
    if (!engine || !canvas || !snap) return;
    const r = this.stage.getBoundingClientRect();
    const availW = Math.max(40, r.width - 2);
    const availH = Math.max(40, r.height - 2);
    const A = this.frame.aspect;
    const cw = Math.min(availW, availH * A);
    const ch = cw / A;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    applyFrame(engine, snap, this.frame);
    engine.setOutput(Math.max(2, Math.round(cw * dpr)), Math.max(2, Math.round(ch * dpr)), snap.liveScaleCss, snap.liveDpr);
  }

  private applyToPreview(): void {
    if (this.engine && this.snap) applyFrame(this.engine, this.snap, this.frame);
  }

  // ---------- export ----------

  private setBusy(on: boolean): void {
    this.go.textContent = on ? 'CANCEL' : 'EXPORT';
    this.bar.hidden = !on;
    if (!on) this.fill.style.width = '0%';
  }

  private async run(): Promise<void> {
    const snap = this.getSnapshot();
    if (!snap) {
      this.status.textContent = 'Nothing to export yet.';
      return;
    }
    const frame: ExportFrame = { ...this.frame, short: this.short };
    const size = frameSize(frame.aspect, frame.short);
    this.abort = new AbortController();
    this.setBusy(true);
    this.status.textContent = this.kind === 'image' ? 'Rendering…' : 'Rendering frames…';
    try {
      const result =
        this.kind === 'image'
          ? await exportImage(snap, frame, this.imageFormat)
          : await exportVideo(
              snap,
              frame,
              { fps: this.fps, seconds: this.seconds, loop: this.kind === 'loop', format: this.videoFormat },
              (done) => {
                this.fill.style.width = `${Math.round(done * 100)}%`;
                this.status.textContent = `Rendering frames… ${Math.round(done * 100)}%`;
              },
              this.abort.signal,
            );
      const tag = this.kind === 'loop' ? 'loop-' : '';
      const name = `particles-${tag}${STYLE_NAMES[snap.params.style] ?? 'dots'}-${size.w}x${size.h}.${result.ext}`;
      download(result.blob, name);
      const mb = (result.blob.size / 1e6).toFixed(1);
      this.status.textContent = `Saved ${name} (${mb} MB)${result.note ? '. ' + result.note : ''}`;
    } catch (err) {
      this.status.textContent = err instanceof DOMException && err.name === 'AbortError'
        ? 'Cancelled.'
        : `Export failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.abort = null;
      this.setBusy(false);
    }
  }
}
