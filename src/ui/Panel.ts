// src/ui/Panel.ts
import { defaults, type Params } from '../core/params';
import { LineWidget, type LineWidgetValue } from './LineWidget';
import { STYLE_SETTINGS } from '../core/styles';

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
    this.onParamsChangeCb = (p) => {
      onParamsChange(p);
      this.updateSummaries();
    };

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

    this.buildCollapsibles();
    this.bindDirectionInputs();
    this.buildStyleSettings(); // before the sliders are bound, so they get the number boxes too
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
    this.bindStyle();

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
    const root = this.params as unknown as Record<string, number | Record<string, number>>;
    if (b === undefined) root[a] = value;
    else (root[a] as Record<string, number>)[b] = value;
  }

  private getPath(path: string): number {
    const [a, b] = path.split('.');
    const root = this.params as unknown as Record<string, number | Record<string, number>>;
    if (b === undefined) return root[a] as number;
    return (root[a] as Record<string, number>)[b];
  }

  /** Shows the value beside the slider: percent when data-format="pct", else the step's decimals. */
  private updateSliderOutput(input: HTMLInputElement): void {
    const parent = input.parentElement;
    const out = parent?.querySelector('output');
    if (!out) return;
    let text: string;
    if (input.dataset.format === 'pct') {
      text = String(Math.round(parseFloat(input.value) * 100));
    } else {
      const decimals = input.step.includes('.') ? (input.step.split('.')[1]?.length ?? 2) : 0;
      text = Number(input.value).toFixed(decimals);
    }
    out.textContent = text;
    const box = parent?.querySelector<HTMLInputElement>('input.slider-val');
    if (box) box.value = text;
  }

  /** Every slider's value is a number box that stays hidden until the number is clicked. Enter or leave the box to apply it. */
  private bindValueInputs(): void {
    this.pathSliders().forEach((slider) => {
      const out = slider.parentElement?.querySelector('output');
      if (!out) return;
      const pct = slider.dataset.format === 'pct';
      const box = document.createElement('input');
      box.type = 'number';
      box.className = 'slider-val';
      box.hidden = true;
      box.min = String(pct ? parseFloat(slider.min) * 100 : parseFloat(slider.min));
      box.max = String(pct ? parseFloat(slider.max) * 100 : parseFloat(slider.max));
      box.step = pct ? '1' : slider.step;
      box.setAttribute('aria-label', slider.previousElementSibling?.textContent ?? 'value');
      out.after(box);
      out.classList.add('slider-readout');
      out.tabIndex = 0;
      const open = () => {
        if (slider.disabled) return;
        out.hidden = true;
        box.hidden = false;
        box.focus();
        box.select();
      };
      out.addEventListener('click', open);
      out.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
      box.addEventListener('blur', () => {
        box.hidden = true;
        out.hidden = false;
      });
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

  /** STYLE: one button per look (data-style = the look's number), the shared controls, and the settings of each look. */
  private bindStyle(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.style = Number(btn.dataset.style);
        this.syncStyleUi();
        this.onParamsChangeCb(this.params);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-scolor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.styleColor = Number(btn.dataset.scolor);
        this.syncStyleUi();
        this.onParamsChangeCb(this.params);
      });
    });
    const color = (id: string, key: 'ink' | 'paper') => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        this.params[key] = (e.target as HTMLInputElement).value;
        this.onParamsChangeCb(this.params);
      });
    };
    color('in-ink', 'ink');
    color('in-paper', 'paper');
    // Per-look choices (data-ssk = settings key, data-ssv = value)
    document.querySelectorAll<HTMLButtonElement>('[data-ssk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.ss[btn.dataset.ssk ?? ''] = Number(btn.dataset.ssv);
        this.syncStyleUi();
        this.onParamsChangeCb(this.params);
      });
    });
  }

  /** The controls of every look, built from the one list in core/styles.ts. Only the chosen look's are shown. */
  private buildStyleSettings(): void {
    const host = document.getElementById('style-settings');
    if (!host) return;
    for (let style = 1; style <= 6; style++) {
      const items = STYLE_SETTINGS.filter((s) => s.styles.includes(style));
      if (!items.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'style-set';
      wrap.dataset.styleSet = String(style);
      for (const it of items) {
        if (it.kind !== 'seg') continue;
        const row = document.createElement('div');
        row.className = 'row';
        row.title = it.title;
        const label = document.createElement('span');
        label.className = 'row-label';
        label.textContent = it.label;
        const seg = document.createElement('div');
        seg.className = 'seg seg-wrap';
        it.options.forEach((name, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'mode-btn';
          b.textContent = name;
          b.dataset.ssk = it.key;
          b.dataset.ssv = String(i);
          seg.appendChild(b);
        });
        row.append(label, seg);
        wrap.appendChild(row);
      }
      const pair = document.createElement('div');
      pair.className = 'pair';
      for (const it of items) {
        if (it.kind !== 'range') continue;
        const g = document.createElement('div');
        g.className = 'slider-group';
        const id = 'ss-' + it.key;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.title = it.title;
        label.textContent = it.label;
        const input = document.createElement('input');
        input.type = 'range';
        input.id = id;
        input.dataset.path = 'ss.' + it.key;
        input.min = String(it.min);
        input.max = String(it.max);
        input.step = String(it.step);
        const out = document.createElement('output');
        g.append(label, input, out);
        pair.appendChild(g);
      }
      if (pair.children.length) wrap.appendChild(pair);
      host.appendChild(wrap);
    }
  }

  private syncStyleUi(): void {
    const st = this.params.style;
    document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.style) === st);
    });
    const cell = document.getElementById('sl-cell') as HTMLInputElement | null;
    if (cell) {
      cell.disabled = st === 0;
      const row = cell.closest<HTMLElement>('.pair');
      if (row) row.style.display = st === 0 ? 'none' : '';
    }
    // Shared controls only for the cell looks; ink and paper only when the colour mode uses them
    const show = (el: HTMLElement | null, on: boolean) => {
      if (el) el.style.display = on ? '' : 'none';
    };
    show(document.getElementById('style-more'), st > 0);
    show(document.getElementById('ink-row'), this.params.styleColor > 0);
    show(document.getElementById('paper-field'), this.params.styleColor === 2);
    document.querySelectorAll<HTMLButtonElement>('[data-scolor]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.scolor) === this.params.styleColor);
    });
    const ink = document.getElementById('in-ink') as HTMLInputElement | null;
    const paper = document.getElementById('in-paper') as HTMLInputElement | null;
    if (ink) ink.value = this.params.ink;
    if (paper) paper.value = this.params.paper;
    document.querySelectorAll<HTMLElement>('[data-style-set]').forEach((w) => {
      w.style.display = Number(w.dataset.styleSet) === st ? '' : 'none';
    });
    document.querySelectorAll<HTMLButtonElement>('[data-ssk]').forEach((b) => {
      b.classList.toggle('active', this.params.ss[b.dataset.ssk ?? ''] === Number(b.dataset.ssv));
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
          this.syncEmitUi();
          this.onParamsChangeCb(this.params);
        }
      });
    });
  }

  // ---- collapsible sections: closed ones show a one-line summary of their state ----

  private sections = new Map<string, { sec: HTMLElement; summary: HTMLElement }>();
  private static readonly OPEN_KEY = 'pds_sections_open_v1';

  private loadOpen(): Record<string, boolean> {
    try {
      return JSON.parse(localStorage.getItem(Panel.OPEN_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  private saveOpen(): void {
    const state: Record<string, boolean> = {};
    this.sections.forEach((v, k) => (state[k] = v.sec.classList.contains('is-open')));
    try {
      localStorage.setItem(Panel.OPEN_KEY, JSON.stringify(state));
    } catch {
      /* private window: the state just is not remembered */
    }
  }

  /** The heading becomes a button (aria-expanded), everything after it the panel it controls. */
  private buildCollapsibles(): void {
    const saved = this.loadOpen();
    document.querySelectorAll<HTMLElement>('section.box[data-collapse]').forEach((sec) => {
      const key = sec.dataset.collapse ?? '';
      const h2 = sec.querySelector('h2');
      if (!h2) return;
      const body = document.createElement('div');
      body.className = 'sec-body';
      body.id = `sec-body-${key}`;
      while (h2.nextSibling) body.appendChild(h2.nextSibling);
      sec.appendChild(body);

      const title: ChildNode[] = [];
      for (const n of Array.from(h2.childNodes)) {
        if (n instanceof HTMLButtonElement) break;
        title.push(n);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sec-head-btn';
      btn.setAttribute('aria-controls', body.id);
      const caret = document.createElement('span');
      caret.className = 'sec-caret';
      caret.setAttribute('aria-hidden', 'true');
      btn.append(caret, ...title);
      const summary = document.createElement('span');
      summary.className = 'sec-summary';
      h2.insertBefore(btn, h2.firstChild);
      btn.after(summary);

      const set = (open: boolean) => {
        sec.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        body.hidden = !open;
      };
      set(saved[key] ?? false);
      btn.addEventListener('click', () => {
        set(!sec.classList.contains('is-open'));
        this.saveOpen();
      });
      this.sections.set(key, { sec, summary });
    });
  }

  /** What a closed section holds, in a few words, so nothing is hidden without a hint. */
  private updateSummaries(): void {
    const p = this.params;
    const set = (key: string, text: string) => {
      const s = this.sections.get(key);
      if (s) s.summary.textContent = text;
    };
    const sweep = p.scan ? (SCAN_CYCLE.find((c) => c.id === p.scanMode)?.name ?? 'SWEEP') : 'OFF';
    const push = p.track ? (p.trackStyle === 'old' ? 'STRONG' : 'GENTLE') : 'OFF';
    set('reactions', `SWEEP ${sweep} · PUSH ${push}`);
    set('particles', `SIZE ${p.trailSize.toFixed(2)} · TRAILS ${Math.round(p.trail.amount * 100)}%`);
    const fx = p.fx as unknown as Record<string, number>;
    const base = defaults.fx as unknown as Record<string, number>;
    set('tone', Object.keys(base).some((k) => fx[k] !== base[k]) ? 'ADJUSTED' : 'ORIGINAL');
    const even = [0, 1, 2, 3, 4, 5, 6, 7, 8].every((i) => p.emit[`r${i}`] === 1) && p.emit.spots === 0;
    set('emitters', !p.emitOn ? 'OFF' : even ? 'EVEN' : 'CUSTOM MAP');
  }

  /** EMITTERS off greys out its sliders. */
  private syncEmitUi(): void {
    document.querySelectorAll<HTMLInputElement>('#emit-panel input[type="range"]').forEach((i) => {
      i.disabled = !this.params.emitOn;
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
    const toggleKeys: (keyof Params)[] = ['track', 'scan', 'panMode', 'floatOn', 'styleInvert', 'autoLevels', 'emitOn'];
    toggleKeys.forEach((key) => {
      const btn = document.querySelector<HTMLButtonElement>(`[data-toggle="${key}"]`);
      if (btn) btn.classList.toggle('active', Boolean(this.params[key]));
    });

    this.syncEffects();
    this.syncStyleUi();
    this.syncEmitUi();
    this.updateSummaries();

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
