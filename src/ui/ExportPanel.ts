// src/ui/ExportPanel.ts
// The EXPORT box: type (image, video, loop), size, format, fps and length, then one button.
import {
  EXPORT_SIZES, download, exportImage, exportVideo,
  type ExportKind, type ImageFormat, type VideoFormat,
} from '../web/Exporter';
import type { ExportSnapshot } from '../web/WebEngine';

const STYLE_NAMES = ['dots', 'halftone', 'mosaic', 'dither', 'ascii', 'stipple', 'lines'];
const IMAGE_FORMATS: ImageFormat[] = ['png', 'jpg', 'webp'];
const VIDEO_FORMATS: VideoFormat[] = ['mp4', 'webm'];

export class ExportPanel {
  private kind: ExportKind = 'image';
  private size = 1080;
  private imageFormat: ImageFormat = 'png';
  private videoFormat: VideoFormat = 'mp4';
  private fps = 30;
  private seconds = 8;
  private abort: AbortController | null = null;

  private go = document.getElementById('ex-go') as HTMLButtonElement;
  private status = document.getElementById('ex-status') as HTMLElement;
  private bar = document.getElementById('ex-bar') as HTMLElement;
  private fill = document.getElementById('ex-fill') as HTMLElement;
  private formatBox = document.getElementById('ex-format') as HTMLElement;
  private len = document.getElementById('ex-len') as HTMLInputElement;

  constructor(private getSnapshot: () => ExportSnapshot | null) {
    this.bindSeg('ex-kind', 'kind', (v) => {
      this.kind = v as ExportKind;
      this.refresh();
    });
    this.bindSeg('ex-size', 'size', (v) => (this.size = Number(v)));
    this.bindSeg('ex-fps', 'fps', (v) => (this.fps = Number(v)));
    this.len.addEventListener('input', () => {
      this.seconds = Number(this.len.value);
      this.showLength();
    });
    this.go.addEventListener('click', () => (this.abort ? this.abort.abort() : void this.run()));
    this.refresh();
  }

  private bindSeg(id: string, attr: string, set: (v: string) => void): void {
    const btns = document.querySelectorAll<HTMLButtonElement>(`#${id} [data-${attr}]`);
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        set(btn.dataset[attr] ?? '');
        btns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }

  /** Rows that do not apply to the chosen type are hidden; FORMAT lists what that type can write. */
  private refresh(): void {
    const still = this.kind === 'image';
    (document.getElementById('ex-fps-row') as HTMLElement).style.display = still ? 'none' : '';
    (document.getElementById('ex-len-row') as HTMLElement).style.display = still ? 'none' : '';
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
    const size = EXPORT_SIZES[this.size];
    this.abort = new AbortController();
    this.setBusy(true);
    this.status.textContent = this.kind === 'image' ? 'Rendering…' : 'Rendering frames…';
    try {
      const result =
        this.kind === 'image'
          ? await exportImage(snap, size, this.imageFormat)
          : await exportVideo(
              snap,
              size,
              { fps: this.fps, seconds: this.seconds, loop: this.kind === 'loop', format: this.videoFormat },
              (done) => {
                this.fill.style.width = `${Math.round(done * 100)}%`;
                this.status.textContent = `Rendering frames… ${Math.round(done * 100)}%`;
              },
              this.abort.signal,
            );
      const tag = this.kind === 'loop' ? 'loop-' : '';
      const name = `particles-${tag}${STYLE_NAMES[snap.params.style] ?? 'dots'}-${size.h}p.${result.ext}`;
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
