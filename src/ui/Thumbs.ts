// src/ui/Thumbs.ts
import type { ProcessedImage } from '../utils/image';

export const MAX_IMAGES = 5;

/** How the five slots are made: the pictures, then the add button, then empty slots, always five in all. */
export function slotPlan(count: number): { filled: number; addButton: number; placeholders: number } {
  const filled = Math.min(Math.max(count, 0), MAX_IMAGES);
  const addButton = filled < MAX_IMAGES ? 1 : 0;
  return { filled, addButton, placeholders: MAX_IMAGES - filled - addButton };
}
/** Pointer travel before a press on a picture counts as a drag, not a click (px). */
const DRAG_START = 6;
/** Settle spring for a picture let go without moving it: critically damped, about 0.3 s to rest (no overshoot). */
const SETTLE_OMEGA = (2 * Math.PI) / 0.3;

export interface ThumbCallbacks {
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onReplace: (index: number, file: File) => void;
}

export class Thumbs {
  private container: HTMLElement;
  private addSlotBtn: HTMLElement;
  private images: ProcessedImage[] = [];
  private activeIndex: number = 0;
  private cb: ThumbCallbacks;
  // Set when a drag just ended, so the click that follows the release does not also select
  private suppressClick = false;
  // One hidden file input serves every slot's replace button: it opens the file manager
  private replaceInput: HTMLInputElement;

  constructor(containerSelector: string, callbacks: ThumbCallbacks) {
    const el = document.querySelector<HTMLElement>(containerSelector);
    if (!el) throw new Error('Thumbs container not found');
    this.container = el;
    this.cb = callbacks;

    const addBtn = document.getElementById('add-slot-btn');
    if (!addBtn) throw new Error('Add slot button not found');
    this.addSlotBtn = addBtn;
    this.addSlotBtn.addEventListener('click', () => this.cb.onAdd());

    this.replaceInput = document.createElement('input');
    this.replaceInput.type = 'file';
    this.replaceInput.accept = 'image/png,image/jpeg,image/webp';
    this.replaceInput.hidden = true;
    this.replaceInput.addEventListener('change', () => {
      const file = this.replaceInput.files?.[0];
      const idx = Number(this.replaceInput.dataset.index);
      this.replaceInput.value = '';
      if (file) this.cb.onReplace(idx, file);
    });
    document.body.appendChild(this.replaceInput);

    // Keyboard path for reordering: Alt + Left/Right moves the active picture
    window.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const to = this.activeIndex + (e.key === 'ArrowLeft' ? -1 : 1);
      if (to < 0 || to >= this.images.length) return;
      e.preventDefault();
      this.animateNext = true;
      this.cb.onMove(this.activeIndex, to);
    });

    this.render();
  }

  /** A drop or a keyboard move: the pictures that changed place glide to their new slots. */
  private animateNext = false;

  public setImages(images: ProcessedImage[], activeIndex: number = 0): void {
    const glide = this.animateNext;
    this.animateNext = false;
    const was = new Map<string, number>();
    if (glide) {
      this.container.querySelectorAll<HTMLElement>('.thumb-slot[data-id]').forEach((s) => was.set(s.dataset.id ?? '', s.getBoundingClientRect().left));
    }
    this.images = images.slice(0, MAX_IMAGES);
    this.activeIndex = Math.max(0, Math.min(activeIndex, this.images.length - 1));
    this.render();
    if (!glide) return;
    // FLIP: start each moved slot where it was on screen, then let the spring carry it to its new slot
    this.container.querySelectorAll<HTMLElement>('.thumb-slot[data-id]').forEach((s) => {
      const before = was.get(s.dataset.id ?? '');
      if (before === undefined) return;
      const d = before - s.getBoundingClientRect().left;
      if (Math.abs(d) < 0.5) return;
      s.classList.add('dragging');
      s.style.transform = `translateX(${d}px)`;
      this.settle(s, d, 0);
    });
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
      this.cb.onSelect(index);
    }
  }

  /** A press on a picture, then a drag: the picture follows the pointer and drops into the slot nearest to it. */
  /** Every slot moving on its spring: slot -> offset (px) and velocity (px/s). One frame loop for all of them. */
  private springs = new Map<HTMLElement, { x: number; v: number }>();
  private springRaf = 0;

  /**
   * Move a slot from offset x (px) back to rest with velocity v (px/s): a critically damped spring, about 0.3 s.
   * Under reduced motion the slot simply lands.
   */
  private settle(slot: HTMLElement, x: number, v: number): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      slot.classList.remove('dragging');
      slot.style.transform = '';
      return;
    }
    this.springs.set(slot, { x, v });
    if (!this.springRaf) this.springRaf = requestAnimationFrame(this.springTick);
  }

  private springTick = (now: number): void => {
    this.springRaf = 0;
    const last = this.springLast ?? now;
    this.springLast = now;
    // Integrate in small steps so a slow frame still settles in real time
    let left = Math.min(0.25, (now - last) / 1000);
    for (const [slot, sp] of this.springs) {
      let x = sp.x;
      let v = sp.v;
      let t = left;
      while (t > 0) {
        const h = Math.min(1 / 240, t);
        t -= h;
        // x'' = -w^2 x - 2 w x'  (critical damping)
        v += (-SETTLE_OMEGA * SETTLE_OMEGA * x - 2 * SETTLE_OMEGA * v) * h;
        x += v * h;
      }
      if (Math.abs(x) < 0.3 && Math.abs(v) < 2) {
        this.springs.delete(slot);
        slot.classList.remove('dragging');
        slot.style.transform = '';
      } else {
        sp.x = x;
        sp.v = v;
        slot.style.transform = `translateX(${x}px)`;
      }
    }
    if (this.springs.size) this.springRaf = requestAnimationFrame(this.springTick);
    else this.springLast = undefined;
  };
  private springLast?: number;

  /** A new press stops every spring in progress where it is. */
  private stopSprings(): void {
    cancelAnimationFrame(this.springRaf);
    this.springRaf = 0;
    this.springs.clear();
    this.springLast = undefined;
  }

  private startDrag(e: PointerEvent, slot: HTMLElement, from: number): void {
    const startX = e.clientX;
    let dragging = false;
    let target = from;
    let lastX = startX;
    let lastT = performance.now();
    let vel = 0; // px/s, from the last few pointer samples
    this.stopSprings();

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      lastDx = dx;
      const now = performance.now();
      const dtS = Math.max(0.001, (now - lastT) / 1000);
      vel = 0.6 * vel + 0.4 * ((ev.clientX - lastX) / dtS);
      lastX = ev.clientX;
      lastT = now;
      if (!dragging && Math.abs(dx) < DRAG_START) return;
      if (!dragging) {
        dragging = true;
        slot.classList.add('dragging');
      }
      slot.style.transform = `translateX(${dx}px)`;
      // The slot whose centre is nearest the dragged picture's centre is where it will land
      const mid = slot.getBoundingClientRect().left + slot.getBoundingClientRect().width / 2;
      let best = Infinity;
      this.container.querySelectorAll<HTMLElement>('.thumb-slot[data-index]').forEach((s) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < best) {
          best = d;
          target = Number(s.dataset.index);
        }
      });
    };

    let lastDx = 0;
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!dragging) return;
      this.suppressClick = true;
      window.setTimeout(() => (this.suppressClick = false), 0);
      if (target !== from) {
        // The moved picture glides from where the pointer let go into its new slot
        this.animateNext = true;
        this.cb.onMove(from, target);
      } else {
        // Let go in its own slot: spring back from where the pointer left it
        this.settle(slot, lastDx, vel);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  private render(): void {
    // Clear existing slots except the file input and add button
    const fileInput = document.getElementById('file-input');
    this.container.innerHTML = '';

    this.images.forEach((img, idx) => {
      const slot = document.createElement('div');
      slot.className = `thumb-slot ${idx === this.activeIndex ? 'active' : ''}`;
      slot.dataset.index = idx.toString();
      slot.dataset.id = img.id;

      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = (idx + 1).toString();

      const box = document.createElement('div');
      box.className = 'slot-box';
      box.style.backgroundImage = `url(${img.thumbUrl})`;
      box.addEventListener('pointerdown', (e) => {
        if (e.button === 0) this.startDrag(e, slot, idx);
      });

      const del = document.createElement('button');
      del.className = 'slot-delete';
      del.title = 'Delete picture';
      del.setAttribute('aria-label', `Delete picture ${idx + 1}`);
      del.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 2l8 8M10 2l-8 8"/></svg>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onDelete(idx);
      });

      const rep = document.createElement('button');
      rep.className = 'slot-replace';
      rep.type = 'button';
      rep.title = 'Replace this picture (opens the file manager)';
      rep.setAttribute('aria-label', `Replace picture ${idx + 1}`);
      rep.textContent = '↺';
      rep.addEventListener('click', (e) => {
        e.stopPropagation();
        this.replaceInput.dataset.index = String(idx);
        this.replaceInput.click();
      });
      slot.appendChild(rep);

      // Drop a picture file on a slot to replace that picture (its settings are kept)
      slot.addEventListener('dragover', (e) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation(); // the window's drop-to-add must not also run
        slot.classList.add('drop-target');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-target'));
      slot.addEventListener('drop', (e) => {
        slot.classList.remove('drop-target');
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        this.cb.onReplace(idx, file);
      });

      slot.appendChild(num);
      slot.appendChild(box);
      slot.appendChild(del);

      slot.addEventListener('click', () => {
        if (this.suppressClick) return;
        this.setActiveIndex(idx);
      });

      this.container.appendChild(slot);
    });

    const plan = slotPlan(this.images.length);
    if (plan.addButton) this.container.appendChild(this.addSlotBtn);
    for (let i = 0; i < plan.placeholders; i++) {
      const empty = document.createElement('div');
      empty.className = 'thumb-slot empty-slot';
      empty.setAttribute('aria-hidden', 'true');
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = (plan.filled + plan.addButton + i + 1).toString();
      empty.appendChild(num);
      this.container.appendChild(empty);
    }

    if (fileInput) {
      this.container.appendChild(fileInput);
    }
  }
}
