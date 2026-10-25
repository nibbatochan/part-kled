// src/ui/LineWidget.ts
// Drift direction dial. A round dial with an arrow: the arrow points where the particles drift,
// its length is the drift strength. While it is being changed, a large arrow is also drawn over
// the stage so the direction can be seen against the picture itself.
export interface LineWidgetValue {
  angle: number; // radians, counter-clockwise from +x (right), same as world space
  length: number; // 0.25..1
}

const SIZE = 88;
const C = SIZE / 2;
const MAX_R = 40;
const MIN_LEN = 0.25;

export class LineWidget {
  private box: HTMLElement;
  private vectorEl: SVGLineElement;
  private arrowEl: SVGPolygonElement;
  private handleEl: SVGCircleElement;
  private readoutEl: HTMLElement | null;
  private guide: HTMLElement;
  private guideArrow: HTMLElement;
  private guideTimer: number | null = null;
  private isDragging = false;
  private value: LineWidgetValue = { angle: 0, length: 0.9 };
  private onChangeCb?: (val: LineWidgetValue) => void;

  constructor(boxId: string, onChange?: (val: LineWidgetValue) => void) {
    const box = document.getElementById(boxId);
    const vector = document.getElementById('line-vector');
    const arrow = document.getElementById('line-arrow');
    const handle = document.getElementById('line-handle-end');
    if (!box || !vector || !arrow || !handle) throw new Error('Drift dial elements missing');

    this.box = box;
    this.vectorEl = vector as unknown as SVGLineElement;
    this.arrowEl = arrow as unknown as SVGPolygonElement;
    this.handleEl = handle as unknown as SVGCircleElement;
    this.readoutEl = document.getElementById('line-readout');
    this.onChangeCb = onChange;

    // Big on-stage arrow, shown while the dial is being used
    this.guide = document.createElement('div');
    this.guide.className = 'drift-guide';
    this.guide.innerHTML =
      '<div class="drift-guide-arrow">' +
      '<svg width="400" height="44" viewBox="0 0 400 44">' +
      '<line class="guide-line" x1="0" y1="22" x2="372" y2="22" />' +
      '<polygon class="guide-head" points="372,8 398,22 372,36" />' +
      '</svg></div>';
    document.getElementById('app')?.appendChild(this.guide);
    this.guideArrow = this.guide.querySelector<HTMLElement>('.drift-guide-arrow')!;

    this.bindEvents();
    this.updateView();
  }

  public setValue(val: LineWidgetValue): void {
    this.value = { angle: val.angle, length: Math.max(MIN_LEN, Math.min(1, val.length)) };
    this.updateView();
  }

  public getValue(): LineWidgetValue {
    return { ...this.value };
  }

  private commit(angle: number, length: number): void {
    this.value = { angle, length: Math.max(MIN_LEN, Math.min(1, length)) };
    this.updateView();
    this.showGuide();
    this.onChangeCb?.(this.value);
  }

  private fromPointer(clientX: number, clientY: number, snap: boolean): void {
    const rect = this.box.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    let angle = Math.atan2(-dy, dx);
    if (snap) {
      const step = Math.PI / 12; // 15 degrees
      angle = Math.round(angle / step) * step;
    }
    const length = Math.hypot(dx, dy) / ((rect.width / 2) * (MAX_R / C));
    this.commit(angle, length);
  }

  private bindEvents(): void {
    this.box.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.box.setPointerCapture(e.pointerId);
      this.fromPointer(e.clientX, e.clientY, e.shiftKey);
    });

    this.box.addEventListener('pointermove', (e) => {
      if (this.isDragging) this.fromPointer(e.clientX, e.clientY, e.shiftKey);
    });

    const stop = () => {
      this.isDragging = false;
      this.hideGuideSoon();
    };
    this.box.addEventListener('pointerup', stop);
    this.box.addEventListener('pointercancel', stop);

    // Double-click resets to the default: to the right, a little up
    this.box.addEventListener('dblclick', () => {
      this.commit(0.2, 0.9);
      this.hideGuideSoon();
    });

    // Keyboard: left/right turn the drift by 5 degrees, up/down change strength
    this.box.addEventListener('keydown', (e) => {
      const turn = (Math.PI / 180) * 5;
      if (e.key === 'ArrowLeft') this.commit(this.value.angle + turn, this.value.length);
      else if (e.key === 'ArrowRight') this.commit(this.value.angle - turn, this.value.length);
      else if (e.key === 'ArrowUp') this.commit(this.value.angle, this.value.length + 0.05);
      else if (e.key === 'ArrowDown') this.commit(this.value.angle, this.value.length - 0.05);
      else return;
      e.preventDefault();
      this.hideGuideSoon();
    });
  }

  private showGuide(): void {
    if (this.guideTimer !== null) window.clearTimeout(this.guideTimer);
    this.guideTimer = null;
    this.guide.classList.add('show');
  }

  private hideGuideSoon(): void {
    if (this.guideTimer !== null) window.clearTimeout(this.guideTimer);
    this.guideTimer = window.setTimeout(() => this.guide.classList.remove('show'), 900);
  }

  private updateView(): void {
    const { angle, length } = this.value;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const r = MAX_R * length;

    const tx = C + r * cos;
    const ty = C - r * sin;

    this.vectorEl.setAttribute('x2', tx.toFixed(1));
    this.vectorEl.setAttribute('y2', ty.toFixed(1));
    this.handleEl.setAttribute('cx', tx.toFixed(1));
    this.handleEl.setAttribute('cy', ty.toFixed(1));

    // Arrow head just beyond the handle, pointing outward
    const tipX = C + (r + 7) * cos;
    const tipY = C - (r + 7) * sin;
    const px = -sin * 4.5;
    const py = -cos * 4.5;
    this.arrowEl.setAttribute(
      'points',
      `${tipX.toFixed(1)},${tipY.toFixed(1)} ${(tx + px).toFixed(1)},${(ty + py).toFixed(1)} ${(tx - px).toFixed(1)},${(ty - py).toFixed(1)}`
    );

    if (this.readoutEl) {
      const deg = Math.round(((angle * 180) / Math.PI + 360) % 360);
      this.readoutEl.textContent = `${deg}° · ${Math.round(length * 100)}%`;
    }

    // On-stage arrow: rotate by the same angle (CSS rotates clockwise, so negate), scale by strength
    this.guideArrow.style.transform = `rotate(${-angle}rad) scaleX(${0.35 + 0.65 * length})`;
  }
}
