// src/ui/LineWidget.ts
export interface LineWidgetValue {
  angle: number; // radians
  length: number; // 0..1
}

export class LineWidget {
  private box: HTMLElement;
  private lineEl: SVGLineElement;
  private handleStart: SVGCircleElement;
  private handleEnd: SVGCircleElement;
  private isDragging = false;
  private value: LineWidgetValue = { angle: 0.58, length: 0.8 };
  private onChangeCb?: (val: LineWidgetValue) => void;

  constructor(boxId: string, onChange?: (val: LineWidgetValue) => void) {
    const box = document.getElementById(boxId);
    if (!box) throw new Error('Line widget box not found');
    this.box = box;
    this.onChangeCb = onChange;

    const line = document.getElementById('line-vector') as unknown as SVGLineElement;
    const h1 = document.getElementById('line-handle-start') as unknown as SVGCircleElement;
    const h2 = document.getElementById('line-handle-end') as unknown as SVGCircleElement;
    if (!line || !h1 || !h2) throw new Error('Line widget SVG elements missing');

    this.lineEl = line;
    this.handleStart = h1;
    this.handleEnd = h2;

    this.bindEvents();
    this.updateSvg();
  }

  public setValue(val: LineWidgetValue): void {
    this.value = { ...val };
    this.updateSvg();
  }

  public getValue(): LineWidgetValue {
    return { ...this.value };
  }

  private bindEvents(): void {
    const onMove = (clientX: number, clientY: number) => {
      const rect = this.box.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;

      const angle = Math.atan2(-dy, dx); // standard Cartesian angle (up-right is positive)
      const maxR = rect.width / 2;
      const r = Math.min(1, Math.hypot(dx, dy) / maxR);

      this.value = {
        angle: angle,
        length: Math.max(0.1, r),
      };

      this.updateSvg();
      this.onChangeCb?.(this.value);
    };

    this.box.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.box.setPointerCapture(e.pointerId);
      onMove(e.clientX, e.clientY);
    });

    this.box.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        onMove(e.clientX, e.clientY);
      }
    });

    const stopDrag = () => {
      this.isDragging = false;
    };
    this.box.addEventListener('pointerup', stopDrag);
    this.box.addEventListener('pointercancel', stopDrag);
  }

  private updateSvg(): void {
    const size = 36;
    const cx = size / 2;
    const cy = size / 2;
    const r = (size / 2 - 4) * this.value.length;

    // Angle in screen space (invert Y because SVG Y is down)
    const cos = Math.cos(this.value.angle);
    const sin = Math.sin(this.value.angle);

    const x2 = cx + r * cos;
    const y2 = cy - r * sin;
    const x1 = cx - r * 0.4 * cos;
    const y1 = cy + r * 0.4 * sin;

    this.lineEl.setAttribute('x1', x1.toFixed(1));
    this.lineEl.setAttribute('y1', y1.toFixed(1));
    this.lineEl.setAttribute('x2', x2.toFixed(1));
    this.lineEl.setAttribute('y2', y2.toFixed(1));

    this.handleStart.setAttribute('cx', x1.toFixed(1));
    this.handleStart.setAttribute('cy', y1.toFixed(1));
    this.handleEnd.setAttribute('cx', x2.toFixed(1));
    this.handleEnd.setAttribute('cy', y2.toFixed(1));
  }
}
