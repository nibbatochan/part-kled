// src/ui/LookPicker.ts
// The LOOK and MOTION tiles: each look or motion effect drawn once from the picture on screen, into a small image on its button.
// A still per look, not a live preview: a tile is redrawn after a change, debounced, so sliders stay smooth.
import { makeEngine, type ExportFrame } from '../web/Exporter';
import { toLiteParams, type ExportSnapshot } from '../web/WebEngine';
import type { Params } from '../core/params';
import type { LiteSample } from '../lite/sample';
import { AURA_FILTER, BLIGHT_FILTER, BLOOD_FILTER, CHROME_FILTER, ECSTASY_FILTER, LINED_FILTER, PRISMATIC_FILTER, REDMET_FILTER, CONVULSIONS_FILTER, SHAKE_FILTER, SOFTWORD_FILTER, FUR_FILTER, CUMULUS_FILTER, ARANCIA_FILTER, ROCK_FILTER, BLEND_FILTER, CHROMA2_FILTER } from '../core/styles';

const TILE_W = 144; // drawn at 2x the 72 x 54 css size so it stays sharp on screen
const TILE_H = 108;
const FRAME: ExportFrame = { aspect: TILE_W / TILE_H, short: TILE_H, zoom: 1, panX: 0, panY: 0 };

export class LookPicker {
  private timer = 0;

  /** The picture on screen and the settings of every look: each tile is drawn with its own look's cell and colour. */
  constructor(
    private snapshot: () => ExportSnapshot | null,
    private settings: () => Params,
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
        if (look !== CHROME_FILTER && look !== PRISMATIC_FILTER && look !== LINED_FILTER && look !== BLOOD_FILTER && look !== AURA_FILTER && look !== ECSTASY_FILTER && look !== BLIGHT_FILTER && look !== REDMET_FILTER && look !== CONVULSIONS_FILTER && look !== SHAKE_FILTER && look !== SOFTWORD_FILTER && look !== FUR_FILTER && look !== CUMULUS_FILTER && look !== ARANCIA_FILTER && look !== ROCK_FILTER && look !== BLEND_FILTER && look !== CHROMA2_FILTER) tile(btn, { ...params, style: look });
      });
      // The filter tiles last: each is drawn on the DOTS base with only its own filter on
      const off = { chromeOn: false, prismaticOn: false, linedOn: false, bloodOn: false, auraOn: false, ecstasyOn: false, blightOn: false, redmetOn: false, convulsionsOn: false, shakeOn: false, softwordOn: false, furOn: false, cumulusOn: false, aranciaOn: false, rockOn: false, blendOn: false, chroma2On: false };
      const chromeBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${CHROME_FILTER}"]`);
      if (chromeBtn) tile(chromeBtn, { ...params, style: 0, ...off, chromeOn: true });
      const prismBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${PRISMATIC_FILTER}"]`);
      if (prismBtn) tile(prismBtn, { ...params, style: 0, ...off, prismaticOn: true });
      const linedBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${LINED_FILTER}"]`);
      if (linedBtn) tile(linedBtn, { ...params, style: 0, ...off, linedOn: true });
      const furBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${FUR_FILTER}"]`);
      if (furBtn) tile(furBtn, { ...params, style: 0, ...off, furOn: true });
      const rockBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${ROCK_FILTER}"]`);
      if (rockBtn) tile(rockBtn, { ...params, style: 0, ...off, rockOn: true });
      const aranciaBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${ARANCIA_FILTER}"]`);
      if (aranciaBtn) tile(aranciaBtn, { ...params, style: 0, ...off, aranciaOn: true });
      const cumulusBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${CUMULUS_FILTER}"]`);
      if (cumulusBtn) tile(cumulusBtn, { ...params, style: 0, ...off, cumulusOn: true });
      const blendBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${BLEND_FILTER}"]`);
      if (blendBtn) tile(blendBtn, { ...params, style: 0, ...off, blendOn: true });
      const chroma2Btn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${CHROMA2_FILTER}"]`);
      if (chroma2Btn) tile(chroma2Btn, { ...params, style: 0, ...off, chroma2On: true });
      const shakeBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${SHAKE_FILTER}"]`);
      if (shakeBtn) tile(shakeBtn, { ...params, style: 0, ...off, shakeOn: true });
      const softBtn = document.querySelector<HTMLButtonElement>(`#style-grid [data-style="${SOFTWORD_FILTER}"]`);
      if (softBtn) tile(softBtn, { ...params, style: 0, ...off, softwordOn: true });
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
    } catch {
      // The device cannot make the tile canvas: the buttons keep their text only
    } finally {
      engine?.dispose();
    }
  }
}
