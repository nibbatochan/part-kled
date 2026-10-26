// src/ui/Panel.ts
import { defaults, type Params } from '../core/params';
import { LineWidget, type LineWidgetValue } from './LineWidget';

// Scanner cycle: the shader's mode ids. RADAR and LINES are removed from the cycle.
const SCAN_CYCLE = [
  { id: 0, name: 'SWEEP' },
  { id: 1, name: 'RING' },
  { id: 4, name: 'DEPTH' },
  { id: 5, name: 'BURST' },
  { id: 6, name: 'PULSE' },
];

export class Panel {
  private params: Params;
  private lineWidget: LineWidget;
  private uiLayer: HTMLElement;
  private onParamsChangeCb: (params: Params) => void;

  constructor(
    initialParams: Params,
    onParamsChange: (params: Params) => void,
    onNext: () => void,
    onToggleLight: () => void,
    onOpenAdd: () => void
  ) {
    this.params = { ...initialParams, background: 'dark' }; // light/dark toggle removed: always dark
    this.onParamsChangeCb = onParamsChange;

    const layer = document.getElementById('ui-layer');
    if (!layer) throw new Error('UI layer element not found');
    this.uiLayer = layer;

    // Line Widget
    this.lineWidget = new LineWidget('line-widget', (val: LineWidgetValue) => {
      this.params.line = { ...val };
      this.syncDirectionInputs();
      this.onParamsChangeCb(this.params);
    });
    this.lineWidget.setValue(this.params.line);

    this.bindDirectionInputs();
    this.bindEffects();
    this.bindValueInputs();
    this.bindToggles();
    this.bindScanMode();
    this.bindScanLevel();
    this.bindModes();
    this.bindSwatches();
    this.bindActions(onNext, onToggleLight, onOpenAdd);
    this.bindFullscreen();
    this.bindPanIcon();
    this.bindThreeD();

    this.syncUiToParams();
  }

  public getParams(): Params {
    return this.params;
  }

  public setParams(newParams: Partial<Params>): void {
    this.params = { ...this.params, ...newParams };
    this.syncUiToParams();
    this.onParamsChangeCb(this.params);
  }

  public toggleUiVisibility(): void {
    this.uiLayer.classList.toggle('hide-ui');
  }

  public toggleLight(): void {
    this.params.lightOn = !this.params.lightOn;
    const btn = document.getElementById('btn-light');
    btn?.classList.toggle('active', this.params.lightOn);
    this.onParamsChangeCb(this.params);
  }

  /** Typed angle (degrees) and strength (%) beside the dial; the dial and the numbers stay in step. */
  private bindDirectionInputs(): void {
    const angle = document.getElementById('in-angle') as HTMLInputElement | null;
    const strength = document.getElementById('in-strength') as HTMLInputElement | null;
    if (!angle || !strength) return;
    const apply = () => {
      const deg = parseFloat(angle.value);
      const pct = parseFloat(strength.value);
      if (!Number.isFinite(deg) || !Number.isFinite(pct)) return; // half-typed: wait
      const length = Math.min(1, Math.max(0.25, pct / 100));
      this.params.line = { angle: (deg * Math.PI) / 180, length };
      this.lineWidget.setValue(this.params.line);
      this.onParamsChangeCb(this.params);
    };
    angle.addEventListener('input', apply);
    strength.addEventListener('input', apply);
    // Leaving a field snaps it to the value that is really in use (clamped, rounded)
    angle.addEventListener('change', () => this.syncDirectionInputs());
    strength.addEventListener('change', () => this.syncDirectionInputs());
  }

  private syncDirectionInputs(): void {
    const angle = document.getElementById('in-angle') as HTMLInputElement | null;
    const strength = document.getElementById('in-strength') as HTMLInputElement | null;
    if (!angle || !strength) return;
    let deg = Math.round((this.params.line.angle * 180) / Math.PI);
    deg = ((((deg + 180) % 360) + 360) % 360) - 180; // -180..179
    if (document.activeElement !== angle) angle.value = String(deg);
    if (document.activeElement !== strength) strength.value = String(Math.round(this.params.line.length * 100));
  }

  private updatePercent(input: HTMLInputElement): void {
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = `${Math.round(parseFloat(input.value) * 100)}%`;
  }

  /** Effects section: every [data-path] slider writes to a nested Params field, e.g. "fx.black". */
  private bindEffects(): void {
    document.getElementById('fx-reset')?.addEventListener('click', () => {
      this.params.fx = { ...defaults.fx };
      this.params.trail = { ...defaults.trail };
      this.syncUiToParams();
      this.onParamsChangeCb(this.params);
    });

    this.pathSliders().forEach((input) => {
      input.addEventListener('input', () => {
        this.setPath(input.dataset.path ?? '', parseFloat(input.value));
        this.updateSliderOutput(input);
        this.onParamsChangeCb(this.params);
      });
    });
  }

  /** Every range slider with a data-path writes one Params field: "fx.black", "trail.length" or a top-level key. */
  private pathSliders(): HTMLInputElement[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="range"][data-path]'));
  }

  private setPath(path: string, value: number): void {
    const [a, b] = path.split('.');
    if (b === undefined) (this.params as unknown as Record<string, number>)[a] = value;
    else (this.params[a as 'fx' | 'trail'] as unknown as Record<string, number>)[b] = value;
  }

  private getPath(path: string): number {
    const [a, b] = path.split('.');
    if (b === undefined) return (this.params as unknown as Record<string, number>)[a];
    return (this.params[a as 'fx' | 'trail'] as unknown as Record<string, number>)[b];
  }

  /** Shows the value beside the slider: percent when data-format="pct", else the step's decimals. */
  private updateSliderOutput(input: HTMLInputElement): void {
    const out = input.parentElement?.querySelector<HTMLElement | HTMLInputElement>('output, input.slider-val');
    if (!out) return;
    let text: string;
    if (input.dataset.format === 'pct') {
      text = String(Math.round(parseFloat(input.value) * 100));
    } else {
      const decimals = input.step.includes('.') ? (input.step.split('.')[1]?.length ?? 2) : 0;
      text = Number(input.value).toFixed(decimals);
    }
    if (out instanceof HTMLInputElement) out.value = text;
    else out.textContent = text;
  }

  /** Every slider gets a number box beside it: type a value, then Enter or leave the box to apply it. */
  private bindValueInputs(): void {
    this.pathSliders().forEach((slider) => {
      const out = slider.parentElement?.querySelector('output');
      if (!out) return;
      const pct = slider.dataset.format === 'pct';
      const box = document.createElement('input');
      box.type = 'number';
      box.className = 'slider-val';
      box.min = String(pct ? parseFloat(slider.min) * 100 : parseFloat(slider.min));
      box.max = String(pct ? parseFloat(slider.max) * 100 : parseFloat(slider.max));
      box.step = pct ? '1' : slider.step;
      box.setAttribute('aria-label', slider.previousElementSibling?.textContent ?? 'value');
      out.replaceWith(box);
      box.addEventListener('change', () => {
        const raw = parseFloat(box.value);
        if (Number.isFinite(raw)) {
          const lo = parseFloat(slider.min);
          const hi = parseFloat(slider.max);
          const v = Math.min(hi, Math.max(lo, pct ? raw / 100 : raw));
          slider.value = String(v);
          this.setPath(slider.dataset.path ?? '', v);
          this.onParamsChangeCb(this.params);
        }
        this.syncEffects();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') box.blur();
      });
    });
  }

  /** A row of buttons that set one string field: data-<attr>="value". */
  private bindSegment(attr: 'trackstyle', key: 'trackStyle'): void {
    const btns = document.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`);
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        (this.params as unknown as Record<string, string>)[key] = btn.dataset[attr] ?? '';
        btns.forEach((b) => b.classList.toggle('active', b === btn));
        this.onParamsChangeCb(this.params);
      });
    });
  }

  private syncEffects(): void {
    this.pathSliders().forEach((input) => {
      input.value = String(this.getPath(input.dataset.path ?? ''));
      this.updateSliderOutput(input);
    });
  }

  private bindToggles(): void {
    const toggles = document.querySelectorAll<HTMLButtonElement>('.toggle-btn');
    toggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle as keyof Params;
        if (key && typeof this.params[key] === 'boolean') {
          const newVal = !this.params[key];
          (this.params[key] as boolean) = newVal;
          btn.classList.toggle('active', newVal);
          this.onParamsChangeCb(this.params);
        }
      });
    });
  }

  // Refresh button next to SCAN: cycles through the scan styles and turns scanning on
  private bindScanMode(): void {
    const btn = document.getElementById('scan-mode-btn');
    btn?.addEventListener('click', () => {
      const at = SCAN_CYCLE.findIndex((c) => c.id === this.params.scanMode);
      this.params.scanMode = SCAN_CYCLE[(at + 1) % SCAN_CYCLE.length].id;
      this.params.scan = true;
      this.syncUiToParams();
      this.onParamsChangeCb(this.params);
    });
  }

  // Impact counter beside the scan style: 1 (faint) to 5 (strong)
  private bindScanLevel(): void {
    const step = (d: number) => {
      this.params.scanLevel = Math.max(1, Math.min(5, this.params.scanLevel + d));
      this.params.scan = true;
      this.syncUiToParams();
      this.onParamsChangeCb(this.params);
    };
    document.getElementById('scan-level-dec')?.addEventListener('click', () => step(-1));
    document.getElementById('scan-level-inc')?.addEventListener('click', () => step(1));
  }

  private bindModes(): void {
    this.bindSegment('trackstyle', 'trackStyle');
    // Travel: SWARM / MELT
    const travelBtns = document.querySelectorAll<HTMLButtonElement>('[data-travel]');
    travelBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.travel as 'swarm' | 'melt';
        if (val) {
          this.params.travel = val;
          travelBtns.forEach((b) => b.classList.toggle('active', b === btn));
          this.onParamsChangeCb(this.params);
        }
      });
    });

    // On white: NEGATIVE / TRUE
    const colorModeBtns = document.querySelectorAll<HTMLButtonElement>('[data-colormode]');
    colorModeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.colormode as 'true' | 'bw';
        if (val) {
          this.params.colorMode = val;
          colorModeBtns.forEach((b) => b.classList.toggle('active', b === btn));
          this.onParamsChangeCb(this.params);
        }
      });
    });

  }

  private bindSwatches(): void {
    const swatches = document.querySelectorAll<HTMLButtonElement>('.swatch-btn');
    swatches.forEach((btn) => {
      btn.addEventListener('click', () => {
        const light = btn.dataset.light as Params['light'];
        if (light) {
          this.params.light = light;
          swatches.forEach((b) => b.classList.toggle('active', b === btn));
          this.onParamsChangeCb(this.params);
        }
      });
    });
  }

  private bindActions(onNext: () => void, onToggleLight: () => void, onOpenAdd: () => void): void {
    const btnNext = document.getElementById('btn-next');
    btnNext?.addEventListener('click', onNext);

    const btnLight = document.getElementById('btn-light');
    btnLight?.addEventListener('click', onToggleLight);

    const btnAdd = document.getElementById('btn-add-pictures');
    btnAdd?.addEventListener('click', onOpenAdd);
  }

  /** The 3D button on the canvas: drag turns the picture in any direction, wheel moves through it. */
  private bindThreeD(): void {
    document.getElementById('threed-btn')?.addEventListener('click', () => {
      this.params.threeD = !this.params.threeD;
      this.syncUiToParams();
      this.onParamsChangeCb(this.params);
    });
  }

  /** The PAN icon on the canvas opens and closes the pan controls. */
  private bindPanIcon(): void {
    const icon = document.getElementById('pan-icon');
    const panel = document.getElementById('pan-panel');
    icon?.addEventListener('click', () => {
      const open = panel?.classList.toggle('hidden') === false;
      icon.setAttribute('aria-expanded', String(open));
    });
  }

  private bindFullscreen(): void {
    const fsBtn = document.getElementById('fullscreen-btn');
    fsBtn?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  private syncUiToParams(): void {
    // Toggles
    const toggleKeys: (keyof Params)[] = ['track', 'scan', 'panMode', 'floatOn'];
    toggleKeys.forEach((key) => {
      const btn = document.querySelector<HTMLButtonElement>(`[data-toggle="${key}"]`);
      if (btn) btn.classList.toggle('active', Boolean(this.params[key]));
    });

    this.syncEffects();

    const levelEl = document.getElementById('scan-level');
    if (levelEl) levelEl.textContent = String(this.params.scanLevel);

    document.querySelectorAll<HTMLButtonElement>('[data-trackstyle]').forEach((b) => b.classList.toggle('active', b.dataset.trackstyle === this.params.trackStyle));
    const threed = document.getElementById('threed-btn');
    threed?.classList.toggle('on', this.params.threeD);
    threed?.setAttribute('aria-pressed', String(this.params.threeD));
    // PAN icon shows when the cursor turn is on
    document.getElementById('pan-icon')?.classList.toggle('on', this.params.panMode && this.params.panAmount > 0);
    // HOVER off disables HARSH and SOFT
    document.querySelectorAll<HTMLButtonElement>('[data-trackstyle]').forEach((b) => (b.disabled = !this.params.track));

    // Scan style label
    const scanLabel = document.getElementById('scan-mode-label');
    // A saved RADAR or LINES style falls back to SWEEP
    if (!SCAN_CYCLE.some((c) => c.id === this.params.scanMode)) this.params.scanMode = 0;
    if (scanLabel) scanLabel.textContent = SCAN_CYCLE.find((c) => c.id === this.params.scanMode)?.name ?? 'SWEEP';

    // Light toggle button

    // Travel
    const travelBtns = document.querySelectorAll<HTMLButtonElement>('[data-travel]');
    travelBtns.forEach((b) => b.classList.toggle('active', b.dataset.travel === this.params.travel));

    // Color mode
    const colorModeBtns = document.querySelectorAll<HTMLButtonElement>('[data-colormode]');
    colorModeBtns.forEach((b) => b.classList.toggle('active', b.dataset.colormode === this.params.colorMode));

    // Swatches
    const swatches = document.querySelectorAll<HTMLButtonElement>('.swatch-btn');
    swatches.forEach((b) => b.classList.toggle('active', b.dataset.light === this.params.light));

    // Line widget
    this.lineWidget.setValue(this.params.line);
    this.syncDirectionInputs();
  }
}
