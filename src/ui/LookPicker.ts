// src/ui/LookPicker.ts
// The LOOK and MOTION tiles: each look or motion effect drawn once from the picture on screen, into a small image on its button.
// A still per look, not a live preview: a tile is redrawn after a change, debounced, so sliders stay smooth.
import { makeEngine, type ExportFrame } from '../web/Exporter';
import { toLiteParams, type ExportSnapshot } from '../web/WebEngine';
import type { Params } from '../core/params';
import type { LiteSample } from '../lite/sample';
import { AURA_FILTER, BLIGHT_FILTER, BLOOD_FILTER, CHROME_FILTER, ECSTASY_FILTER, HALO_FILTER, LINED_FILTER, PRISMATIC_FILTER, REDMET_FILTER, CONVULSIONS_FILTER } from '../core/styles';

const TILE_W = 144; // drawn at 2x the 72 x 54 css size so it stays sharp on screen
const TILE_H = 108;
const FRAME: ExportFrame = { aspect: TILE_W / TILE_H, short: TILE_H, zoom: 1, panX: 0, panY: 0 };

export class LookPicker {
  private timer = 0;

  /** The picture on screen and the settings of every look: each tile is drawn with its own look's cell and colour. */
  constructor(
    private snapshot: () => ExportSnapshot | null,
    private settings: () => Params,
    /** The picture with HALO applied, as particles: the HALO tile is a filter, so it needs its own treated picture. */
    private haloSample?: () => LiteSample | null,
  ) {}

  /** Redraw all tiles soon (debounced). Call after a change of picture, look or look setting. */
  refresh(delayMs = 350): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), delayMs);
  }

  private render(): void {
    const snap = this.snapshot();
    if (!snap) return;
    const looks = document.querySelectorAll<HTMLButtonElement>('#style-grid [data-style]');
    const moves = document.querySelectorAll<HTMLButtonElement>('#motion-grid [data-mfx]');
    const glows = document.querySelectorAll<HTMLButtonElement>('#glow-grid [data-glowpat]');
    let engine: ReturnType<typeof makeEngine>['engine'] | null = null;
    try {
      // One second engine for all tiles: only the look number changes between them
      const made = makeEngine(snap, FRAME, { w: TILE_W, h: TILE_H });
      engine = made.engine;
      const params = this.settings();
      const tile = (btn: HTMLButtonElement, p: Params) => {
        engine!.setParams({ ...snap.params, ...toLiteParams(p) });
        engine!.renderAt(snap.time);
        let img = btn.querySelector<HTMLImageElement>('img.look-thumb');
        if (!img) {
          img = document.createElement('img');
          img.className = 'look-thumb';
          img.alt = '';
          btn.prepend(img);
        }
        img.src = made.canvas.toDataURL('image/png');
      };
      looks.forEach((btn) => {
        const look = Number(btn.dataset.style);
        if (look !== HALO_FILTER && look !== CHROME_FILTER && look !== PRISMATIC_FILTER && look !== LINED_FILTER && look !== BLOOD_FILTER && look !== AURA_FILTER && look !== ECSTASY_FILTER && look !== BLIGHT_FILTER && look !== REDMET_FILTER && look !== CONVULSIONS_FILTER) tile(btn, { ...params, style: look });
      });
      // The filter tiles last: each is drawn on the DOTS base with only its own filter on
      const off = { chromeOn: false, prismaticOn: false, linedOn: false, bloodOn: false, auraOn: false, ecstasyOn: false, blightOn: false, redmetOn: false, convulsionsOn: false };
      const chromeBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${CHROME_FILTER}"]`);
      if (chromeBtn) tile(chromeBtn, { ...params, style: 0, ...off, chromeOn: true });
      const prismBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${PRISMATIC_FILTER}"]`);
      if (prismBtn) tile(prismBtn, { ...params, style: 0, ...off, prismaticOn: true });
      const linedBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${LINED_FILTER}"]`);
      if (linedBtn) tile(linedBtn, { ...params, style: 0, ...off, linedOn: true });
      const bloodBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${BLOOD_FILTER}"]`);
      if (bloodBtn) tile(bloodBtn, { ...params, style: 0, ...off, bloodOn: true });
      const auraBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${AURA_FILTER}"]`);
      if (auraBtn) tile(auraBtn, { ...params, style: 0, ...off, auraOn: true });
      const ecstasyBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${ECSTASY_FILTER}"]`);
      if (ecstasyBtn) tile(ecstasyBtn, { ...params, style: 0, ...off, ecstasyOn: true });
      const blightBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${BLIGHT_FILTER}"]`);
      if (blightBtn) tile(blightBtn, { ...params, style: 0, ...off, blightOn: true });
      const redmetBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${REDMET_FILTER}"]`);
      if (redmetBtn) tile(redmetBtn, { ...params, style: 0, ...off, redmetOn: true });
      const convBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${CONVULSIONS_FILTER}"]`);
      if (convBtn) tile(convBtn, { ...params, style: 0, ...off, convulsionsOn: true });
      moves.forEach((btn) => tile(btn, { ...params, motionFx: Number(btn.dataset.mfx) }));
      glows.forEach((btn) => tile(btn, { ...params, glow: { ...params.glow, glowPat: Number(btn.dataset.glowpat), glowPatAmt: 1 } }));
      // The HALO tile last: it swaps in the treated picture, and the dots stay the plain DOTS look
      const treated = this.haloSample?.();
      const haloBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${HALO_FILTER}"]`);
      if (treated && haloBtn) {
        engine.setSample(treated);
        tile(haloBtn, { ...params, style: 0 });
      }
    } catch {
      // The device cannot make the tile canvas: the buttons keep their text only
    } finally {
      engine?.dispose();
    }
  }
}
