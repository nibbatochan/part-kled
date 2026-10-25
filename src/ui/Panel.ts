// src/ui/Panel.ts
import { defaults, type Params } from '../core/params';
import { LineWidget, type LineWidgetValue } from './LineWidget';

const SCAN_MODES = ['SWEEP', 'RING', 'RADAR', 'LINES', 'DEPTH'];

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
      this.onParamsChangeCb(this.params);
    });
    this.lineWidget.setValue(this.params.line);

    this.bindSliders();
    this.bindEffects();
    this.bindToggles();
    this.bindScanMode();
    this.bindScanLevel();
    this.bindModes();
    this.bindSwatches();
    this.bindActions(onNext, onToggleLight, onOpenAdd);
    this.bindFullscreen();

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

  private bindSliders(): void {
    const sliderDefs: { id: string; key: keyof Params }[] = [
      { id: 'sl-drift', key: 'drift' },
      { id: 'sl-splash', key: 'splash' },
      { id: 'sl-gather', key: 'gather' },
      { id: 'sl-depth', key: 'depth' },
    ];

    sliderDefs.forEach(({ id, key }) => {
      const input = document.getElementById(id) as HTMLInputElement;
      if (!input) return;
      input.value = this.params[key].toString();
      this.updatePercent(input);
      input.addEventListener('input', () => {
        (this.params[key] as number) = parseFloat(input.value);
        this.updatePercent(input);
        this.onParamsChangeCb(this.params);
      });
    });
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

    document.querySelectorAll<HTMLInputElement>('#fx-panel input[type="range"][data-path]').forEach((input) => {
      input.addEventListener('input', () => {
        const [group, key] = (input.dataset.path ?? '').split('.') as ['fx' | 'trail', string];
        const bag = this.params[group] as unknown as Record<string, number>;
        bag[key] = parseFloat(input.value);
        this.updateFxOutput(input);
        this.onParamsChangeCb(this.params);
      });
    });
  }

  private updateFxOutput(input: HTMLInputElement): void {
    const out = input.parentElement?.querySelector('output');
    const decimals = input.step.includes('.') ? (input.step.split('.')[1]?.length ?? 2) : 0;
    if (out) out.textContent = Number(input.value).toFixed(decimals);
  }

  private syncEffects(): void {
    document.querySelectorAll<HTMLInputElement>('#fx-panel input[type="range"][data-path]').forEach((input) => {
      const [group, key] = (input.dataset.path ?? '').split('.') as ['fx' | 'trail', string];
      const bag = this.params[group] as unknown as Record<string, number>;
      input.value = String(bag[key]);
      this.updateFxOutput(input);
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
      this.params.scanMode = (this.params.scanMode + 1) % SCAN_MODES.length;
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
    // Sliders
    (['drift', 'splash', 'gather', 'depth'] as const).forEach((key) => {
      const el = document.getElementById(`sl-${key}`) as HTMLInputElement | null;
      if (!el) return;
      el.value = this.params[key].toString();
      this.updatePercent(el);
    });

    // Toggles
    const toggleKeys: (keyof Params)[] = ['draw', 'track', 'scan', 'trails'];
    toggleKeys.forEach((key) => {
      const btn = document.querySelector<HTMLButtonElement>(`[data-toggle="${key}"]`);
      if (btn) btn.classList.toggle('active', Boolean(this.params[key]));
    });

    this.syncEffects();

    const levelEl = document.getElementById('scan-level');
    if (levelEl) levelEl.textContent = String(this.params.scanLevel);

    // Scan style label
    const scanLabel = document.getElementById('scan-mode-label');
    if (scanLabel) scanLabel.textContent = SCAN_MODES[this.params.scanMode] ?? SCAN_MODES[0];

    // Light toggle button
    const btnLight = document.getElementById('btn-light');
    if (btnLight) btnLight.classList.toggle('active', this.params.lightOn);

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
  }
}
