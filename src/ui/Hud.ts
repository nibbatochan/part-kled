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
    showMarks: boolean,
    showLinks: boolean
  ): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (!showMarks && !showLinks) return;

    const ctx = this.ctx;
    const ink = 'rgba(244, 244, 242, 0.75)';
    const inkFaint = 'rgba(244, 244, 242, 0.18)';

    // 1. Draw LINKS between nearby trackers
    if (showLinks && trackers.length > 1) {
      ctx.strokeStyle = inkFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const maxDist = 120; // screen distance threshold
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

    // 2. Draw MARKS (corner brackets + label)
    if (showMarks) {
      const bracketSize = 7;
      const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
      const pad2 = (n: number) => n.toString().padStart(2, '0');

      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;

      trackers.forEach((t) => {
        const x = t.screenX;
        const y = t.screenY;

        // Skip if outside visible viewport
        if (x < -20 || x > this.width + 20 || y < -20 || y > this.height + 20) return;

        // Draw 4 corner brackets
        ctx.beginPath();
        // Top-left
        ctx.moveTo(x - bracketSize, y - bracketSize + 4);
        ctx.lineTo(x - bracketSize, y - bracketSize);
        ctx.lineTo(x - bracketSize + 4, y - bracketSize);
        // Top-right
        ctx.moveTo(x + bracketSize - 4, y - bracketSize);
        ctx.lineTo(x + bracketSize, y - bracketSize);
        ctx.lineTo(x + bracketSize, y - bracketSize + 4);
        // Bottom-left
        ctx.moveTo(x - bracketSize, y + bracketSize - 4);
        ctx.lineTo(x - bracketSize, y + bracketSize);
        ctx.lineTo(x - bracketSize + 4, y + bracketSize);
        // Bottom-right
        ctx.moveTo(x + bracketSize - 4, y + bracketSize);
        ctx.lineTo(x + bracketSize, y + bracketSize);
        ctx.lineTo(x + bracketSize, y + bracketSize - 4);
        ctx.stroke();

        // Label: NN +x.xx +y.xx +z.xx
        const label = `${pad2(t.id)} ${fmt(t.worldX)} ${fmt(t.worldY)} ${fmt(t.worldZ)}`;
        ctx.fillText(label, x + bracketSize + 4, y + 3);
      });
    }
  }
}
