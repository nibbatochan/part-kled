// src/ui/XyPad.ts
// A two-value pad: drag (or arrow keys) to set two numbers at once. It is a front for two range inputs that
// already exist in the panel: it writes their values and fires their 'input' event, so the panel's own
// bindings and number boxes keep working unchanged.

export class XyPad {
  private el: HTMLElement;
  private dot: HTMLElement;
  private readout: HTMLElement;

  constructor(
    private x: HTMLInputElement,
    private y: HTMLInputElement,
    private labels: [string, string],
    title: string,
    host: HTMLElement,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'xy-pad';
    this.el.tabIndex = 0;
    this.el.title = title;
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-label', `${labels[0]} and ${labels[1]}`);
    this.dot = document.createElement('i');
    this.dot.className = 'xy-dot';
    this.readout = document.createElement('output');
    this.readout.className = 'xy-read';
    this.el.append(this.dot);
    const row = document.createElement('div');
    row.className = 'xy-foot';
    row.append(this.readout);
    this.el.addEventListener('pointerdown', (e) => {
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* no capture (a synthetic pointer): the drag still works while it is over the pad */
      }
      this.setFromPointer(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.buttons === 1) this.setFromPointer(e);
    });
    this.el.addEventListener('keydown', (e) => {
      const step = (inp: HTMLInputElement, d: number) => {
        const next = Math.min(Number(inp.max), Math.max(Number(inp.min), Number(inp.value) + d * Number(inp.step || 0.01)));
        this.write(inp, next);
      };
      if (e.key === 'ArrowRight') step(this.x, 1);
      else if (e.key === 'ArrowLeft') step(this.x, -1);
      else if (e.key === 'ArrowUp') step(this.y, 1);
      else if (e.key === 'ArrowDown') step(this.y, -1);
      else return;
      e.preventDefault();
    });
    this.el.append(row);
    host.append(this.el);
    this.sync();
  }

  /** Put the dot where the two inputs are (after the panel has changed them). */
  sync(): void {
    const fx = (Number(this.x.value) - Number(this.x.min)) / (Number(this.x.max) - Number(this.x.min) || 1);
    const fy = (Number(this.y.value) - Number(this.y.min)) / (Number(this.y.max) - Number(this.y.min) || 1);
    this.dot.style.left = `${Math.min(1, Math.max(0, fx)) * 100}%`;
    this.dot.style.top = `${(1 - Math.min(1, Math.max(0, fy))) * 100}%`;
    this.readout.textContent = `${this.labels[0]} ${this.format(this.x)} · ${this.labels[1]} ${this.format(this.y)}`;
  }

  private format(inp: HTMLInputElement): string {
    if (inp.dataset.format === 'pct') return String(Math.round(Number(inp.value) * 100));
    const decimals = inp.step.includes('.') ? (inp.step.split('.')[1]?.length ?? 2) : 0;
    return Number(inp.value).toFixed(decimals);
  }

  private setFromPointer(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    const val = (inp: HTMLInputElement, f: number) => {
      const min = Number(inp.min);
      const max = Number(inp.max);
      const step = Number(inp.step) || 0.01;
      const raw = min + f * (max - min);
      return Math.min(max, Math.max(min, Math.round(raw / step) * step));
    };
    this.write(this.x, val(this.x, fx));
    this.write(this.y, val(this.y, fy));
  }

  private write(inp: HTMLInputElement, v: number): void {
    if (Number(inp.value) === v) return;
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    this.sync();
  }
}
