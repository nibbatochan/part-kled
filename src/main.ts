// src/main.ts
import { defaults, loadFromStorage, saveToStorage, type Params } from './core/params';
import { Dropzone } from './ui/Dropzone';
import { Frame } from './ui/Frame';
import { Panel } from './ui/Panel';
import { Thumbs } from './ui/Thumbs';
import { computeImageHash } from './utils/hash';
import { processImageFile, type ProcessedImage } from './utils/image';
import { setupKeyboardShortcuts } from './utils/keys';

class App {
  private params: Params;
  private frame: Frame;
  private thumbs: Thumbs;
  private dropzone: Dropzone;
  private panel: Panel;
  private images: ProcessedImage[] = [];
  private activeIndex: number = 0;

  constructor() {
    this.params = loadFromStorage();

    // 1. Frame overlay (crosshairs, ticks, hash readout)
    this.frame = new Frame('#frame-svg', '#frame-readout');

    // 2. Thumbnail strip
    this.thumbs = new Thumbs(
      '#thumbnail-strip',
      (index) => this.setActiveImage(index),
      () => this.dropzone.openPicker()
    );

    // 3. Dropzone
    this.dropzone = new Dropzone(
      '#dropzone',
      '#file-input',
      (files) => this.handleFiles(files)
    );

    // 4. Panel UI
    this.panel = new Panel(
      this.params,
      (newParams) => {
        this.params = newParams;
        saveToStorage(this.params);
      },
      () => this.nextImage(),
      () => this.panel.toggleLight(),
      () => this.dropzone.openPicker()
    );

    // 5. Keyboard shortcuts
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
      onSelectSlot: (idx) => this.setActiveImage(idx),
    });

    this.initDefaultSamples();
  }

  private async initDefaultSamples(): Promise<void> {
    try {
      // Load sample-1.png and sample-2.png
      const sampleFiles = ['/samples/sample-1.png', '/samples/sample-2.png'];
      const loaded: ProcessedImage[] = [];

      for (const path of sampleFiles) {
        const res = await fetch(path);
        if (!res.ok) continue;
        const blob = await res.blob();
        const file = new File([blob], path.split('/').pop() || 'sample.png', { type: blob.type || 'image/png' });
        const processed = await processImageFile(file);
        loaded.push(processed);
      }

      if (loaded.length > 0) {
        this.images = loaded;
        this.thumbs.setImages(this.images, 0);
        this.setActiveImage(0);
      } else {
        this.dropzone.showOverlay(true);
      }
    } catch (err) {
      console.warn('Failed to load default samples:', err);
      this.dropzone.showOverlay(true);
    }
  }

  private async handleFiles(files: File[]): Promise<void> {
    this.dropzone.showOverlay(false);
    for (const file of files) {
      if (this.images.length >= 4) break;
      const processed = await processImageFile(file);
      this.images.push(processed);
    }

    this.thumbs.setImages(this.images, this.images.length - 1);
    this.setActiveImage(this.images.length - 1);
  }

  private setActiveImage(index: number): void {
    if (index < 0 || index >= this.images.length) return;
    this.activeIndex = index;
    const current = this.images[index];
    this.frame.setReadout(index + 1, this.images.length, current.hash);
    this.thumbs.setActiveIndex(index);
  }

  private nextImage(): void {
    if (this.images.length <= 1) return;
    const nextIdx = (this.activeIndex + 1) % this.images.length;
    this.setActiveImage(nextIdx);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
