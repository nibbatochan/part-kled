import { MAX_IMAGES } from './Thumbs';

// src/ui/Dropzone.ts
export class Dropzone {
  private fileInput: HTMLInputElement;
  private overlay: HTMLElement;
  private onFilesCb: (files: File[]) => void;

  constructor(
    overlaySelector: string,
    fileInputSelector: string,
    onFiles: (files: File[]) => void
  ) {
    const overlay = document.querySelector<HTMLElement>(overlaySelector);
    const input = document.querySelector<HTMLInputElement>(fileInputSelector);
    if (!overlay || !input) throw new Error('Dropzone elements missing');
    this.overlay = overlay;
    this.fileInput = input;
    this.onFilesCb = onFiles;

    this.bindEvents();
  }

  public openPicker(): void {
    this.fileInput.click();
  }

  public showOverlay(show: boolean): void {
    this.overlay.classList.toggle('hidden', !show);
  }

  private bindEvents(): void {
    // File input change
    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        const files = Array.from(this.fileInput.files);
        this.fileInput.value = '';
        this.handleFiles(files);
      }
    });

    // Choose pictures button inside overlay
    const chooseBtn = document.getElementById('dropzone-picker-btn');
    chooseBtn?.addEventListener('click', () => this.openPicker());

    // Window drag & drop
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.body.classList.add('dragging');
    });

    window.addEventListener('dragleave', (e) => {
      if (e.target === document.documentElement || !e.relatedTarget) {
        document.body.classList.remove('dragging');
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('dragging');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        this.handleFiles(files);
      }
    });
  }

  private handleFiles(files: File[]): void {
    const valid = files.filter(f => /^image\/(png|jpeg|webp)$/i.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
    if (valid.length > 0) {
      this.onFilesCb(valid.slice(0, MAX_IMAGES));
    }
  }
}
