// src/ui/Hud.ts
import type { TrackerPoint } from '../core/ParticleRenderer';

export class Hud {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(canvasId: string) {
    const el = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!el) throw new Error('Hud canvas not found');
    this.canvas = el;
    const ctx = el.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context for hud');
    this.ctx = ctx;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.resize(this.width, this.height);
  }

  public resize(w: number, h: number): void {
    const dpr = Math.min(2.0, window.devicePixelRatio || 1.0);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public render(
    trackers: TrackerPoint[],
    showLinks: boolean,
    showScan: boolean = false,
    scanProgress: number = 0,
    lineAngle: number = 0,
    lightColorHex: string = '#f2e6c9'
  ): void {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const ctx = this.ctx;

    // 1. Draw SCAN sweep beam across canvas if active
    if (showScan) {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const maxDim = Math.hypot(this.width, this.height);

      // Normal to sweep direction (scan travels along lineAngle)
      const scanDirX = Math.cos(lineAngle);
      const scanDirY = -Math.sin(lineAngle);

      // Position along sweep axis: from -maxDim/2 to +maxDim/2
      const offset = (scanProgress - 0.5) * maxDim * 0.9;
      const beamCenterX = cx + scanDirX * offset;
      const beamCenterY = cy + scanDirY * offset;

      // Line perpendicular to sweep direction
      const perpX = -scanDirY;
      const perpY = scanDirX;

      const p1x = beamCenterX - perpX * maxDim;
      const p1y = beamCenterY - perpY * maxDim;
      const p2x = beamCenterX + perpX * maxDim;
      const p2y = beamCenterY + perpY * maxDim;

      // Luminous glow band
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.strokeStyle = lightColorHex;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Soft outer glow
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineWidth = 5.0;
      ctx.globalAlpha = 0.18;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw LINKS connecting nearby feature nodes
    if (showLinks && trackers.length >= 2) {
      const inkFaint = 'rgba(244, 244, 242, 0.26)';
      ctx.strokeStyle = inkFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const maxDist = 95; // clean connection distance
      for (let i = 0; i < trackers.length; i++) {
        for (let j = i + 1; j < trackers.length; j++) {
          const dx = trackers[i].screenX - trackers[j].screenX;
          const dy = trackers[i].screenY - trackers[j].screenY;
          const dist = Math.hypot(dx, dy);
          if (dist < maxDist) {
            ctx.moveTo(trackers[i].screenX, trackers[i].screenY);
            ctx.lineTo(trackers[j].screenX, trackers[j].screenY);
          }
        }
      }
      ctx.stroke();
    }
  }
}
