// src/ui/Panel.ts
import { MOTION_PRESETS, defaults, lookTone, withEffectsStart, withLightStart, type Params } from '../core/params';
import { LineWidget, type LineWidgetValue } from './LineWidget';
import { AURA_FILTER, BLIGHT_FILTER, BLOOD_FILTER, CHROME_FILTER, CONVULSIONS_FILTER, ECSTASY_FILTER, REDMET_FILTER, HALFTONE_CELL, LINED_FILTER, PRISMATIC_FILTER, SHAKE_FILTER, SOFTWORD_FILTER, FUR_FILTER, ARANCIA_FILTER, ROCK_FILTER, CUMULUS_FILTER, BLEND_FILTER, CHROMA2_FILTER, VBRNT_FING_FILTER, GLASS_GREEN_FILTER, GLASS_GREEN_PRESETS, CANDY_FILTER, CANDY_PRESETS, CABR_FILTER, CABR_PRESETS, LOOK_CATEGORIES, LOOK_TONE_DEFAULTS, LOOK_TITLES, STYLE_NAMES, type LookTone } from '../core/styles';
import { XyPad } from './XyPad';
import { scrollRow } from './ScrollRow';

// Scanner cycle: the shader's mode ids. RADAR and LINES are removed from the cycle.
const SCAN_CYCLE = [
  { id: 0, name: 'SWEEP' },
  { id: 1, name: 'RING' },
  { id: 4, name: 'DEPTH' },
  { id: 5, name: 'BURST' },
  { id: 6, name: 'PULSE' },
];

// The params each collapsible section owns. Used for the changed dot and the section RESET.
const GROUP_KEYS: Record<string, string[]> = {
  reactions: ['track', 'trackStyle', 'scan', 'scanMode', 'scanLevel'],
  music: ['audioAmount', 'musicLook'],
  particles: ['randomness', 'pSat', 'trailSize', 'trailAngle', 'trail.length', 'trail.amount', 'trails'],
  tone: ['fx.opacity', 'fx.black', 'fx.white', 'fx.gamma', 'fx.contrast', 'fx.hue', 'fx.saturation'],
  emitters: ['emitOn', 'emit.r0', 'emit.r1', 'emit.r2', 'emit.r3', 'emit.r4', 'emit.r5', 'emit.r6', 'emit.r7', 'emit.r8',
    'emit.spots', 'emit.scatter', 'emit.lenRand', 'emit.turn'],
};

/** Reads "fx.black" or "trails" from a params object. */
function readKey(obj: object, key: string): unknown {
  const [a, b] = key.split('.');
  const root = obj as Record<string, unknown>;
  if (b === undefined) return root[a];
  return (root[a] as Record<string, unknown>)[b];
}

export class Panel {
  private params: Params;
  private lineWidget: LineWidget;
  private pads: XyPad[] = [];
  private lookCat = 0; // the look type the LOOK box shows
  private uiLayer: HTMLElement;
  private onParamsChangeCb: (params: Params) => void;
  private groups: { keys: string[]; dot: HTMLElement }[] = [];

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
      this.syncPresets();
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

    this.buildLookGrid();
    this.buildCollapsibles();
    this.bindDirectionInputs();
    document.querySelectorAll<HTMLElement>('.fx-box .look-dots.sub, .fx-box .seg-wrap').forEach(scrollRow);
    this.bindTopTabs();
    document.getElementById('effects-reset')?.addEventListener('click', () => this.resetEffects());
    this.bindGlowPat();
    this.bindBitmode();
    this.bindEffects();
    this.bindValueInputs();
    this.bindToggles();
    this.bindScanMode();
    this.bindScanLevel();
    this.bindPresets();
    this.bindModes();
    this.bindHelp();
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

  /** Write a value into the chosen look's own tone (colour, ink, paper, invert, auto levels, cell). */
  private setLook(patch: Partial<LookTone>): void {
    const key = String(this.params.style);
    this.params.looks = { ...this.params.looks, [key]: { ...(this.params.looks[key] ?? {}), ...patch } };
  }

  private setPath(path: string, value: number): void {
    if (path.startsWith('look.')) return this.setLook({ [path.slice(5)]: value } as Partial<LookTone>);
    const [a, b] = path.split('.');
    const root = this.params as unknown as Record<string, number | Record<string, number>>;
    if (b === undefined) root[a] = value;
    else (root[a] as Record<string, number>)[b] = value;
  }

  private getPath(path: string): number {
    if (path.startsWith('look.')) return lookTone(this.params)[path.slice(5) as 'cell'];
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
    // One listener for every look tile: the tiles are rebuilt when the type changes, so a per-tile listener would be lost
    document.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-style]');
      if (!btn) return;
      const look = Number(btn.dataset.style);
      if (look === CHROME_FILTER || look === PRISMATIC_FILTER || look === LINED_FILTER || look === BLOOD_FILTER || look === AURA_FILTER || look === ECSTASY_FILTER || look === BLIGHT_FILTER || look === REDMET_FILTER || look === CONVULSIONS_FILTER || look === SHAKE_FILTER || look === SOFTWORD_FILTER || look === FUR_FILTER || look === CUMULUS_FILTER || look === ARANCIA_FILTER || look === ROCK_FILTER || look === BLEND_FILTER || look === CHROMA2_FILTER || look === VBRNT_FING_FILTER || look === GLASS_GREEN_FILTER || look === CANDY_FILTER || look === CABR_FILTER) {
        // CHROME, PRISMATIC, LINED, BLOOD SHADOW, AURA, ECSTASY, BLIGHT, REDMET, CONVULSIONS and SHAKE-MASK are standalone filters on the dots base. Picking one turns the others off,
        // and picking the one that is on turns it off.
        const wasOn = look === CHROME_FILTER ? this.params.chromeOn : look === PRISMATIC_FILTER ? this.params.prismaticOn : look === LINED_FILTER ? this.params.linedOn : look === AURA_FILTER ? this.params.auraOn : look === ECSTASY_FILTER ? this.params.ecstasyOn : look === BLIGHT_FILTER ? this.params.blightOn : look === REDMET_FILTER ? this.params.redmetOn : look === CONVULSIONS_FILTER ? this.params.convulsionsOn : look === SHAKE_FILTER ? this.params.shakeOn : look === SOFTWORD_FILTER ? this.params.softwordOn : look === FUR_FILTER ? this.params.furOn : look === ARANCIA_FILTER ? this.params.aranciaOn : look === ROCK_FILTER ? this.params.rockOn : look === CUMULUS_FILTER ? this.params.cumulusOn : look === BLEND_FILTER ? this.params.blendOn : look === CHROMA2_FILTER ? this.params.chroma2On
        : look === VBRNT_FING_FILTER ? this.params.vbrntFingOn : look === GLASS_GREEN_FILTER ? this.params.glassGreenOn : look === CANDY_FILTER ? this.params.candyOn : look === CABR_FILTER ? this.params.cabrOn : this.params.bloodOn;
        this.params.style = 0;
        this.setFilter(wasOn ? null : look);
        this.syncStyleUi();
        this.syncEffects();
        this.onParamsChangeCb(this.params);
        return;
      }

      this.setFilter(null);
      this.params.style = Number(btn.dataset.style);
      // Every look starts with its colour on ORIGINAL when it is chosen; the dither types bring their own colours
      const own = [13, 17, 18, 21].includes(this.params.style) ? LOOK_TONE_DEFAULTS[this.params.style] : null;
      this.setLook(own ? { colour: own.colour, ink: own.ink, paper: own.paper } : { colour: 0 });
      this.syncStyleUi();
      this.onParamsChangeCb(this.params);
    });
    document.querySelectorAll<HTMLButtonElement>('#gg-presets button[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.preset as keyof typeof GLASS_GREEN_PRESETS;
        const vals = GLASS_GREEN_PRESETS[pKey];
        if (!vals) return;
        this.params.glassGreen = { ...vals };
        document.querySelectorAll<HTMLButtonElement>('#gg-presets button').forEach((b) => b.classList.toggle('active', b === btn));
        this.syncEffects();
        this.onParamsChangeCb(this.params);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('#candy-presets button[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.preset as keyof typeof CANDY_PRESETS;
        const vals = CANDY_PRESETS[pKey];
        if (!vals) return;
        this.params.candy = { ...vals };
        document.querySelectorAll<HTMLButtonElement>('#candy-presets button').forEach((b) => b.classList.toggle('active', b === btn));
        this.syncEffects();
        this.onParamsChangeCb(this.params);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('#cabr-presets button[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.preset as keyof typeof CABR_PRESETS;
        const vals = CABR_PRESETS[pKey];
        if (!vals) return;
        this.params.cabr = { ...vals };
        document.querySelectorAll<HTMLButtonElement>('#cabr-presets button').forEach((b) => b.classList.toggle('active', b === btn));
        this.syncEffects();
        this.onParamsChangeCb(this.params);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-scolor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setLook({ colour: Number(btn.dataset.scolor) });
        this.syncStyleUi();
        this.onParamsChangeCb(this.params);
      });
    });
    const color = (id: string, key: 'ink' | 'paper') => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        this.setLook({ [key]: (e.target as HTMLInputElement).value });
        this.onParamsChangeCb(this.params);
      });
    };
    color('in-ink', 'ink');
    color('in-paper', 'paper');
    // Per-look choices (data-ssk = settings key, data-ssv = value)
    document.querySelectorAll<HTMLButtonElement>('[data-ssk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.ss[btn.dataset.ssk ?? ''] = Number(btn.dataset.ssv);
        // Each HALFTONE pattern starts at the cell size that suits it
        if (btn.dataset.ssk === 'hShape') this.setLook({ cell: HALFTONE_CELL[Number(btn.dataset.ssv)] ?? 4 });
        this.syncStyleUi();
        this.onParamsChangeCb(this.params);
      });
    });
  }

  /** The LOOK picker: one dot per look type (DOTS, PIXEL, ...). Only the chosen type's looks are listed. */
  private buildLookGrid(): void {
    const dots = document.getElementById('look-dots');
    if (!dots) return;
    if (!LOOK_CATEGORIES.some((c) => c.looks.includes(this.params.style))) this.params.style = 0; // a saved look that is no longer offered
    this.lookCat = Math.max(0, LOOK_CATEGORIES.findIndex((c) => c.looks.includes(this.params.style)));
    LOOK_CATEGORIES.forEach((cat, i) => {
      const b = document.createElement('button');
      b.className = 'look-dot';
      b.type = 'button';
      b.dataset.cat = String(i);
      b.title = `Show the ${cat.name} looks`;
      b.textContent = cat.name;
      b.addEventListener('click', () => {
        this.lookCat = i;
        this.showLookCat();
        this.onParamsChangeCb(this.params); // the new tiles start blank: redraw them from the picture
      });
      dots.appendChild(b);
    });
    this.showLookCat();
  }

  /** Lists the looks of the chosen type. Showing a type does not pick a look: the top right keeps the one in use. */
  private showLookCat(): void {
    const grid = document.getElementById('style-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'look-cat-row';
    for (const look of LOOK_CATEGORIES[this.lookCat].looks) {
      const b = document.createElement('button');
      b.className = 'mode-btn';
      b.type = 'button';
      b.dataset.style = String(look);
      b.title = LOOK_TITLES[look] ?? '';
      b.textContent = STYLE_NAMES[look];
      row.appendChild(b);
    }
    grid.appendChild(row);
    document.querySelectorAll<HTMLButtonElement>('#look-dots [data-cat]').forEach((b) => {
      const on = Number(b.dataset.cat) === this.lookCat;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    this.syncStyleUi();
  }

  /** LIGHT: a pad for each glow (strength x spread, strength x size), and the halo colour. */
  /** EFFECTS RESET: every effect off. The look, its settings and the picture stay. */
  private resetEffects(): void {
    this.params = withEffectsStart();
    this.lookCat = 0;
    this.showLookCat();
    this.syncUiToParams();
    this.onParamsChangeCb(this.params);
  }

  /** STACK: a glow pattern over the picture, on top of whatever look and effects are on. */
  private bindGlowPat(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-glowpat]').forEach((b) => {
      b.addEventListener('click', () => {
        this.params.glow = { ...this.params.glow, glowPat: Number(b.dataset.glowpat) };
        this.syncGlowPat();
        this.onParamsChangeCb(this.params);
      });
    });
  }

  /** EFFECT or STACK, the two views of EFFECTS. A sub-tab (LOOK, MOTION, LIGHT, SURFACE) also goes back to EFFECT. */
  private bindTopTabs(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#effects-box [data-top]');
    buttons.forEach((b) => b.addEventListener('click', () => this.setTop(b.dataset.top ?? 'effect')));
    this.refreshEffectView();
  }

  private setTop(top: string): void {
    document.querySelectorAll<HTMLButtonElement>('#effects-box [data-top]').forEach((d) => {
      const on = d.dataset.top === top;
      d.classList.toggle('active', on);
      d.setAttribute('aria-pressed', String(on));
    });
    this.refreshEffectView();
  }

  /** Shows the stack options when STACK is the view, otherwise the effect panel of the chosen sub-tab. */
  private refreshEffectView(): void {
    const top = document.querySelector<HTMLButtonElement>('#effects-box [data-top].active')?.dataset.top ?? 'effect';
    // STACK shows only the glow group: the effect sub-tabs are for EFFECT
    const cats = document.getElementById('fx-cats');
    if (cats) cats.hidden = top === 'stack';
    const current = document.querySelector<HTMLButtonElement>('#fx-cats .look-dot.active')?.dataset.ecat ?? '0';
    document.querySelectorAll<HTMLElement>('.ecat-panel').forEach((p) => {
      p.hidden = top === 'stack' ? p.dataset.ecat !== 'stack' : p.dataset.ecat !== current;
    });
  }

  private syncGlowPat(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-glowpat]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.glowpat) === this.params.glow.glowPat);
    });
  }

  /** BITMAP layer: the mode buttons. The layer sits over the finished picture, after every other effect. */
  private bindBitmode(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-bitmode]').forEach((b) => {
      b.addEventListener('click', () => {
        this.params.glow = { ...this.params.glow, bitMode: Number(b.dataset.bitmode) };
        this.syncBitmode();
        this.onParamsChangeCb(this.params);
      });
    });
  }

  private syncBitmode(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-bitmode]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.bitmode) === this.params.glow.bitMode);
    });
  }

  private syncSurface(): void {
    const v = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = val;
    };
    v('in-stack-col', this.params.graphic.stackColour);
    v('in-cloud-tint', this.params.surface.cloudTint);
    document.querySelectorAll<HTMLButtonElement>('[data-mesh]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.mesh) === this.params.surface.meshPalette);
    });
  }

  private syncMotionFx(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-mfx]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.mfx) === this.params.motionFx);
    });
  }

  /** The standalone filters are one choice: this turns exactly the given one on, or none when null. */
  private setFilter(look: number | null): void {
    this.params.chromeOn = look === CHROME_FILTER;
    this.params.prismaticOn = look === PRISMATIC_FILTER;
    this.params.linedOn = look === LINED_FILTER;
    this.params.auraOn = look === AURA_FILTER;
    this.params.bloodOn = look === BLOOD_FILTER;
    this.params.ecstasyOn = look === ECSTASY_FILTER;
    this.params.blightOn = look === BLIGHT_FILTER;
    this.params.redmetOn = look === REDMET_FILTER;
    this.params.convulsionsOn = look === CONVULSIONS_FILTER;
    this.params.softwordOn = look === SOFTWORD_FILTER;
    this.params.shakeOn = look === SHAKE_FILTER;
    this.params.furOn = look === FUR_FILTER;
    this.params.aranciaOn = look === ARANCIA_FILTER;
    this.params.rockOn = look === ROCK_FILTER;
    this.params.cumulusOn = look === CUMULUS_FILTER;
    this.params.blendOn = look === BLEND_FILTER;
    this.params.chroma2On = look === CHROMA2_FILTER;
    this.params.vbrntFingOn = look === VBRNT_FING_FILTER;
    this.params.glassGreenOn = look === GLASS_GREEN_FILTER;
    this.params.candyOn = look === CANDY_FILTER;
    this.params.cabrOn = look === CABR_FILTER;
  }

  private syncStyleUi(): void {
    const st = this.params.style;
    const chromeBox = document.getElementById('chrome-settings');
    if (chromeBox) chromeBox.hidden = !this.params.chromeOn;
    const prismBox = document.getElementById('prismatic-settings');
    if (prismBox) prismBox.hidden = !this.params.prismaticOn;
    const linedBox = document.getElementById('lined-settings');
    if (linedBox) linedBox.hidden = !this.params.linedOn;
    const auraBox = document.getElementById('aura-settings');
    if (auraBox) auraBox.hidden = !this.params.auraOn;
    const rockBox = document.getElementById('rock-settings');
    if (rockBox) rockBox.hidden = !this.params.rockOn;
    const aranciaBox = document.getElementById('arancia-settings');
    if (aranciaBox) aranciaBox.hidden = !this.params.aranciaOn;
    const furBox = document.getElementById('fur-settings');
    if (furBox) furBox.hidden = !this.params.furOn;
    const cumulusBox = document.getElementById('cumulus-settings');
    if (cumulusBox) cumulusBox.hidden = !this.params.cumulusOn;
    const blendBox = document.getElementById('blend-settings');
    if (blendBox) blendBox.hidden = !this.params.blendOn;
    const chroma2Box = document.getElementById('chroma2-settings');
    if (chroma2Box) chroma2Box.hidden = !this.params.chroma2On;
    const vbrntFingBox = document.getElementById('vbrnt-fing-settings');
    if (vbrntFingBox) vbrntFingBox.hidden = !this.params.vbrntFingOn;
    const ggBox = document.getElementById('glass-green-settings');
    if (ggBox) ggBox.hidden = !this.params.glassGreenOn;
    const cdBox = document.getElementById('candy-settings');
    if (cdBox) cdBox.hidden = !this.params.candyOn;
    const cabrBox = document.getElementById('cabr-settings');
    if (cabrBox) cabrBox.hidden = !this.params.cabrOn;
    const shakeBox = document.getElementById('shake-settings');
    if (shakeBox) shakeBox.hidden = !this.params.shakeOn;
    const bloodBox = document.getElementById('blood-settings');
    if (bloodBox) bloodBox.hidden = !this.params.bloodOn;
    const ecstasyBox = document.getElementById('ecstasy-settings');
    if (ecstasyBox) ecstasyBox.hidden = !this.params.ecstasyOn;
    const blightBox = document.getElementById('blight-settings');
    if (blightBox) blightBox.hidden = !this.params.blightOn;
    const redmetBox = document.getElementById('redmet-settings');
    if (redmetBox) redmetBox.hidden = !this.params.redmetOn;
    const convBox = document.getElementById('convulsions-settings');
    if (convBox) convBox.hidden = !this.params.convulsionsOn;
    const softBox = document.getElementById('softword-settings');
    if (softBox) softBox.hidden = !this.params.softwordOn;
    const filtersOn = this.params.chromeOn || this.params.prismaticOn || this.params.linedOn || this.params.bloodOn || this.params.auraOn || this.params.ecstasyOn || this.params.blightOn || this.params.redmetOn || this.params.convulsionsOn || this.params.shakeOn || this.params.softwordOn || this.params.furOn || this.params.cumulusOn || this.params.aranciaOn || this.params.rockOn || this.params.blendOn || this.params.chroma2On || this.params.vbrntFingOn || this.params.glassGreenOn || this.params.candyOn || this.params.cabrOn;
    document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => {
      const look = Number(b.dataset.style);
      const on = look === CHROME_FILTER ? this.params.chromeOn
        : look === PRISMATIC_FILTER ? this.params.prismaticOn
        : look === LINED_FILTER ? this.params.linedOn
        : look === AURA_FILTER ? this.params.auraOn
        : look === BLOOD_FILTER ? this.params.bloodOn
        : look === ECSTASY_FILTER ? this.params.ecstasyOn
        : look === BLIGHT_FILTER ? this.params.blightOn
        : look === REDMET_FILTER ? this.params.redmetOn
        : look === CONVULSIONS_FILTER ? this.params.convulsionsOn
        : look === SOFTWORD_FILTER ? this.params.softwordOn
        : look === SHAKE_FILTER ? this.params.shakeOn
        : look === FUR_FILTER ? this.params.furOn
        : look === ARANCIA_FILTER ? this.params.aranciaOn
        : look === ROCK_FILTER ? this.params.rockOn
        : look === CUMULUS_FILTER ? this.params.cumulusOn
        : look === BLEND_FILTER ? this.params.blendOn
        : look === CHROMA2_FILTER ? this.params.chroma2On
        : look === GLASS_GREEN_FILTER ? this.params.glassGreenOn
        : look === CANDY_FILTER ? this.params.candyOn
        : look === CABR_FILTER ? this.params.cabrOn
        : look === st && !filtersOn;
      b.classList.toggle('active', on);
    });
    // Shared controls only for the cell looks; ink and paper only when the colour mode uses them
    const show = (el: HTMLElement | null, on: boolean) => {
      if (el) el.style.display = on ? '' : 'none';
    };
    // Only the DOTS looks keep their settings; every other look shows its cell size and gap and nothing else
    const fullSettings = st > 0 && LOOK_CATEGORIES[0].looks.includes(st);
    show(document.getElementById('look-presets'), fullSettings);
    show(document.getElementById('style-more'), fullSettings);
    show(document.getElementById('style-more-btn'), fullSettings);
    const tone = lookTone(this.params);
    document.querySelectorAll<HTMLButtonElement>('[data-scolor]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.scolor) === tone.colour);
    });
    const ink = document.getElementById('in-ink') as HTMLInputElement | null;
    const paper = document.getElementById('in-paper') as HTMLInputElement | null;
    if (ink) ink.value = tone.ink;
    if (paper) paper.value = tone.paper;
    document.querySelectorAll<HTMLElement>('[data-style-set]').forEach((w) => {
      w.style.display = Number(w.dataset.styleSet) === st && fullSettings ? '' : 'none';
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
        const key = btn.dataset.toggle ?? '';
        if (key === 'styleInvert' || key === 'autoLevels') {
          const look: Partial<LookTone> = key === 'styleInvert' ? { invert: !lookTone(this.params).invert } : { autoLevels: !lookTone(this.params).autoLevels };
          this.setLook(look);
          btn.classList.toggle('active', Object.values(look)[0] as boolean);
          this.onParamsChangeCb(this.params);
          return;
        }
        const field = key as keyof Params;
        if (key && typeof this.params[field] === 'boolean') {
          const newVal = !this.params[field];
          (this.params[field] as boolean) = newVal;
          btn.classList.toggle('active', newVal);
          this.syncEmitUi();
          this.onParamsChangeCb(this.params);
        }
      });
    });
  }

  // ---- collapsible sections: closed ones show a one-line summary of their state ----

  private sections = new Map<string, { sec: HTMLElement; summary: HTMLElement }>();
  private static readonly OPEN_KEY = 'pds_sections_open_v2';

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

      const keys = GROUP_KEYS[key];
      if (keys) {
        const dot = document.createElement('span');
        dot.className = 'chg-dot';
        dot.title = 'Changed from the start look';
        dot.setAttribute('aria-label', 'changed from the start look');
        h2.append(dot);
        // The tone section keeps its own RESET (it already resets colour and tone only)
        if (key !== 'tone') {
          const reset = document.createElement('button');
          reset.type = 'button';
          reset.className = 'mini';
          reset.textContent = 'RESET';
          reset.title = 'Put this section back to the start look';
          reset.addEventListener('click', () => this.resetGroup(keys));
          h2.append(reset);
        }
        this.groups.push({ keys, dot });
      }

      const set = (open: boolean) => {
        sec.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        body.hidden = !open;
      };
      // Sections marked data-open start open; the rest start closed (a saved choice wins)
      set(saved[key] ?? sec.dataset.open === 'true');
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
    set('surface', p.meshOn ? 'MESH' : 'OFF');
    const fxNames = ['OFF', 'STARDUST', 'BREAKDOWN', 'DISAPPEAR', 'COSMIC'];
    set('motion', [p.motionFx ? fxNames[p.motionFx] : '', p.cloudOn ? 'CLOUD' : '', p.vhsOn ? 'VHS' : '', p.glitchOn ? (p.glitchBeat ? 'GLITCH ON BEAT' : 'GLITCH') : '', p.stackOn ? 'GRAPHIC' : '']
      .filter(Boolean).join(' + ') || 'OFF');
    set('particle', `MOVE ${Math.round(p.drift * 100)}% · DEPTH ${Math.round(p.depth * 100)}%`);
    set('light', p.bloomOn || p.haloOn || p.holoOn ? [p.bloomOn ? 'BLOOM' : '', p.haloOn ? 'HALO' : '', p.holoOn ? 'HOLO' : ''].filter(Boolean).join(' + ') : 'OFF');
    set('particles', `SIZE ${p.trailSize.toFixed(2)} · TRAILS ${Math.round(p.trail.amount * 100)}%`);
    const fx = p.fx as unknown as Record<string, number>;
    const base = defaults.fx as unknown as Record<string, number>;
    set('tone', Object.keys(base).some((k) => fx[k] !== base[k]) ? 'ADJUSTED' : 'ORIGINAL');
    const even = [0, 1, 2, 3, 4, 5, 6, 7, 8].every((i) => p.emit[`r${i}`] === 1) && p.emit.spots === 0;
    set('emitters', !p.emitOn ? 'OFF' : even ? 'EVEN' : 'CUSTOM MAP');
    this.updateChangedDots();
  }

  /** The start look: what a section goes back to. */
  private startLook(): Record<string, unknown> {
    return withLightStart(defaults) as unknown as Record<string, unknown>;
  }

  private isChanged(keys: string[]): boolean {
    const base = this.startLook();
    return keys.some((k) => {
      const cur = readKey(this.params, k);
      const start = readKey(base, k);
      return typeof cur === 'number' ? Math.abs(cur - (start as number)) > 1e-6 : cur !== start;
    });
  }

  private updateChangedDots(): void {
    for (const g of this.groups) g.dot.classList.toggle('on', this.isChanged(g.keys));
  }

  /** Puts one section's params back to the start look and redraws. */
  private resetGroup(keys: string[]): void {
    const base = this.startLook();
    const root = this.params as unknown as Record<string, unknown>;
    for (const k of keys) {
      const [a, b] = k.split('.');
      if (b === undefined) root[a] = base[a];
      else root[a] = { ...(root[a] as object), [b]: (base[a] as Record<string, unknown>)[b] };
    }
    this.syncUiToParams();
    this.onParamsChangeCb(this.params);
  }

  /** EMITTERS off greys out its sliders. */
  private syncEmitUi(): void {
    document.querySelectorAll<HTMLInputElement>('#emit-panel input[type="range"]').forEach((i) => {
      i.disabled = !this.params.emitOn;
    });
  }

  // Refresh button next to SCAN: cycles through the scan styles and turns scanning on
  /** SWEEP STYLE: one chip per style, always visible. Picking one also turns the sweep on. */
  private bindScanMode(): void {
    const host = document.getElementById('scan-modes');
    if (!host) return;
    for (const c of SCAN_CYCLE) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.textContent = c.name;
      b.dataset.scanId = String(c.id);
      b.addEventListener('click', () => {
        this.params.scanMode = c.id;
        this.params.scan = true;
        this.syncUiToParams();
        this.onParamsChangeCb(this.params);
      });
      host.appendChild(b);
    }
  }

  /** SWEEP POWER: five chips, 1 to 5 (3 is the studio's strength). */
  private bindScanLevel(): void {
    const host = document.getElementById('scan-levels');
    if (!host) return;
    for (let n = 1; n <= 5; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.textContent = String(n);
      b.dataset.slevel = String(n);
      b.addEventListener('click', () => {
        this.params.scanLevel = n;
        this.params.scan = true;
        this.syncUiToParams();
        this.onParamsChangeCb(this.params);
      });
      host.appendChild(b);
    }
  }

  /** MOTION presets set a few values at once. No chip is lit when the values match none of them (custom). */
  private bindPresets(): void {
    const host = document.getElementById('motion-presets');
    if (!host) return;
    for (const pr of MOTION_PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.textContent = pr.label;
      b.title = pr.title;
      b.dataset.preset = pr.id;
      b.addEventListener('click', () => {
        this.params.drift = pr.drift;
        this.params.depth = pr.depth;
        this.params.randomness = pr.randomness;
        this.params.trail = { ...this.params.trail, amount: pr.trailAmount };
        this.syncUiToParams();
        this.onParamsChangeCb(this.params);
      });
      host.appendChild(b);
    }
  }

  private syncPresets(): void {
    const p = this.params;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
    document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
      const pr = MOTION_PRESETS.find((x) => x.id === b.dataset.preset);
      b.classList.toggle('active', !!pr && near(p.drift, pr.drift) && near(p.depth, pr.depth) &&
        near(p.randomness, pr.randomness) && near(p.trail.amount, pr.trailAmount));
    });
  }

  private bindModes(): void {
    this.bindSegment('trackstyle', 'trackStyle');
    // EQUALIZER beside the picture: 0 off, then the three styles
    document.querySelectorAll<HTMLButtonElement>('[data-eq]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.eqStyle = Number(btn.dataset.eq);
        this.syncUiToParams();
        this.onParamsChangeCb(this.params);
      });
    });
    // MUSIC LOOK: the sound moves the particles (0 = off)
    document.querySelectorAll<HTMLButtonElement>('[data-mlook]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.musicLook = Number(btn.dataset.mlook);
        this.syncUiToParams();
        this.onParamsChangeCb(this.params);
      });
    });
    // PICTURE: COLOUR / GREY (the picture's colour, or grey)
    const colourBtns = document.querySelectorAll<HTMLButtonElement>('[data-cmode]');
    colourBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.colorMode = btn.dataset.cmode === 'bw' ? 'bw' : 'true';
        this.syncUiToParams();
        this.onParamsChangeCb(this.params);
      });
    });
  }

  /** Help popover: the keyboard shortcuts. Closes on a second click or a click outside it. */
  private bindHelp(): void {
    const btn = document.getElementById('help-btn');
    const pop = document.getElementById('help-pop');
    if (!btn || !pop) return;
    const set = (open: boolean) => {
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      set(pop.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !pop.contains(e.target as Node)) set(false);
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
    const toggleKeys: (keyof Params)[] = ['track', 'scan', 'panMode', 'floatOn', 'emitOn', 'trails', 'bloomOn', 'haloOn', 'vhsOn', 'glitchOn', 'glitchBeat', 'holoOn', 'cloudOn', 'meshOn', 'stackOn', 'stackWords'];
    toggleKeys.forEach((key) => {
      const btn = document.querySelector<HTMLButtonElement>(`[data-toggle="${key}"]`);
      if (btn) btn.classList.toggle('active', Boolean(this.params[key]));
    });
    // Per-look flags: they read the look that is chosen
    const tone = lookTone(this.params);
    document.querySelector<HTMLButtonElement>('[data-toggle="styleInvert"]')?.classList.toggle('active', tone.invert);
    document.querySelector<HTMLButtonElement>('[data-toggle="autoLevels"]')?.classList.toggle('active', tone.autoLevels);

    this.syncEffects();
    this.syncBitmode();
    this.syncStyleUi();
    this.syncEmitUi();
    this.updateSummaries();
    this.pads.forEach((p) => p.sync());
    this.syncMotionFx();
    this.syncGlowPat();
    this.syncSurface();
    const tint = document.getElementById('in-halo-tint') as HTMLInputElement | null;
    if (tint) tint.value = this.params.glow.haloTint;

    document.querySelectorAll<HTMLButtonElement>('[data-slevel]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.slevel) === this.params.scanLevel);
    });
    this.syncPresets();

    document.querySelectorAll<HTMLButtonElement>('[data-trackstyle]').forEach((b) => b.classList.toggle('active', b.dataset.trackstyle === this.params.trackStyle));
    const threed = document.getElementById('threed-btn');
    threed?.classList.toggle('on', this.params.threeD);
    threed?.setAttribute('aria-pressed', String(this.params.threeD));
    // PAN icon shows when the cursor turn is on
    document.getElementById('pan-icon')?.classList.toggle('on', this.params.panMode && this.params.panAmount > 0);
    // HOVER off disables HARSH and SOFT
    document.querySelectorAll<HTMLButtonElement>('[data-trackstyle]').forEach((b) => (b.disabled = !this.params.track));

    // Scan style label
    // A saved RADAR or LINES style falls back to SWEEP
    if (!SCAN_CYCLE.some((c) => c.id === this.params.scanMode)) this.params.scanMode = 0;
    document.querySelectorAll<HTMLButtonElement>('[data-scan-id]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.scanId) === this.params.scanMode);
    });

    document.querySelectorAll<HTMLButtonElement>('[data-mlook]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.mlook) === this.params.musicLook);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-eq]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.eq) === this.params.eqStyle);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-cmode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.cmode === this.params.colorMode);
    });

    // Line widget
    this.lineWidget.setValue(this.params.line);
    this.syncDirectionInputs();
  }
}
