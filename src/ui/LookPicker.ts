// src/ui/LookPicker.ts
// The LOOK and MOTION tiles: each look or motion effect drawn once from the picture on screen, into a small image on its button.
// A still per look, not a live preview: a tile is redrawn after a change, debounced, so sliders stay smooth.
import { makeEngine, type ExportFrame } from '../web/Exporter';
import { toLiteParams, type ExportSnapshot } from '../web/WebEngine';
import type { Params } from '../core/params';

const TILE_W = 144; // drawn at 2x the 72 x 54 css size so it stays sharp on screen
const TILE_H = 108;
const FRAME: ExportFrame = { aspect: TILE_W / TILE_H, short: TILE_H, zoom: 1, panX: 0, panY: 0 };

export class LookPicker {
  private timer = 0;

  /** The picture on screen and the settings of every look: each tile is drawn with its own look's cell and colour. */
  constructor(private snapshot: () => ExportSnapshot | null, private settings: () => Params) {}

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
      looks.forEach((btn) => tile(btn, { ...params, style: Number(btn.dataset.style) }));
      moves.forEach((btn) => tile(btn, { ...params, motionFx: Number(btn.dataset.mfx) }));
      glows.forEach((btn) => tile(btn, { ...params, glow: { ...params.glow, glowPat: Number(btn.dataset.glowpat), glowPatAmt: 1 } }));
    } catch {
      // The device cannot make the tile canvas: the buttons keep their text only
    } finally {
      engine?.dispose();
    }
  }
}
