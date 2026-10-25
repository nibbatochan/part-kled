// src/ui/Thumbs.ts
import type { ProcessedImage } from '../utils/image';

export const MAX_IMAGES = 5;

export class Thumbs {
  private container: HTMLElement;
  private addSlotBtn: HTMLElement;
  private images: ProcessedImage[] = [];
  private activeIndex: number = 0;
  private onSelectCb: (index: number) => void;
  private onAddClickCb: () => void;
  private onDeleteCb: (index: number) => void;

  constructor(
    containerSelector: string,
    onSelect: (index: number) => void,
    onAddClick: () => void,
    onDelete: (index: number) => void
  ) {
    const el = document.querySelector<HTMLElement>(containerSelector);
    if (!el) throw new Error('Thumbs container not found');
    this.container = el;
    this.onSelectCb = onSelect;
    this.onAddClickCb = onAddClick;
    this.onDeleteCb = onDelete;

    const addBtn = document.getElementById('add-slot-btn');
    if (!addBtn) throw new Error('Add slot button not found');
    this.addSlotBtn = addBtn;
    this.addSlotBtn.addEventListener('click', () => this.onAddClickCb());

    this.render();
  }

  public setImages(images: ProcessedImage[], activeIndex: number = 0): void {
    this.images = images.slice(0, MAX_IMAGES);
    this.activeIndex = Math.max(0, Math.min(activeIndex, this.images.length - 1));
    this.render();
  }

  public addImage(image: ProcessedImage): number {
    if (this.images.length >= MAX_IMAGES) return this.activeIndex;
    this.images.push(image);
    this.activeIndex = this.images.length - 1;
    this.render();
    return this.activeIndex;
  }

  public getImages(): ProcessedImage[] {
    return this.images;
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  public setActiveIndex(index: number): void {
    if (index >= 0 && index < this.images.length && index !== this.activeIndex) {
      this.activeIndex = index;
      this.render();
      this.onSelectCb(index);
    }
  }

  private render(): void {
    // Clear existing slots except the file input and add button
    const fileInput = document.getElementById('file-input');
    this.container.innerHTML = '';

    this.images.forEach((img, idx) => {
      const slot = document.createElement('div');
      slot.className = `thumb-slot ${idx === this.activeIndex ? 'active' : ''}`;
      slot.dataset.index = idx.toString();

      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = (idx + 1).toString();

      const box = document.createElement('div');
      box.className = 'slot-box';
      box.style.backgroundImage = `url(${img.thumbUrl})`;

      const del = document.createElement('button');
      del.className = 'slot-delete';
      del.title = 'Delete picture';
      del.setAttribute('aria-label', `Delete picture ${idx + 1}`);
      del.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 2l8 8M10 2l-8 8"/></svg>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDeleteCb(idx);
      });

      slot.appendChild(num);
      slot.appendChild(box);
      slot.appendChild(del);

      slot.addEventListener('click', () => {
        this.setActiveIndex(idx);
      });

      this.container.appendChild(slot);
    });

    if (this.images.length < MAX_IMAGES) {
      this.container.appendChild(this.addSlotBtn);
    }

    if (fileInput) {
      this.container.appendChild(fileInput);
    }
  }
}
