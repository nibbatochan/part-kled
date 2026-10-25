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
    showLinks: boolean,
    pointer: { x: number; y: number } | null = null
  ): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (!showMarks && !showLinks) return;

    const ctx = this.ctx;
    const visible = trackers.filter(
      (t) => t.screenX > -20 && t.screenX < this.width + 20 && t.screenY > -20 && t.screenY < this.height + 20
    );

    // 1. LINKS: every tracker joins its nearest neighbours, so the network always reads as a web
    //    across the subject. Lines brighten near the cursor, and the cursor is tied to its closest trackers.
    if (showLinks && visible.length > 1) {
      const maxLink = Math.min(this.width, this.height) * 0.42;
      const drawn = new Set<string>();
      ctx.lineWidth = 1;

      for (let i = 0; i < visible.length; i++) {
        const a = visible[i];
        const nearest = visible
          .map((b, j) => ({ j, d: Math.hypot(a.screenX - b.screenX, a.screenY - b.screenY) }))
          .filter((o) => o.j !== i && o.d < maxLink)
          .sort((p, q) => p.d - q.d)
          .slice(0, 2);

        for (const { j, d } of nearest) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          const b = visible[j];
          const boost = Math.max(a.near, b.near);
          const alpha = (0.55 * (1 - d / maxLink) + 0.08) * (1 + boost * 1.4);
          ctx.strokeStyle = `rgba(244, 244, 242, ${Math.min(0.85, alpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.screenX, a.screenY);
          ctx.lineTo(b.screenX, b.screenY);
          ctx.stroke();
        }
      }

      if (pointer) {
        const closest = visible
          .map((t) => ({ t, d: Math.hypot(t.screenX - pointer.x, t.screenY - pointer.y) }))
          .sort((p, q) => p.d - q.d)
          .slice(0, 3);
        for (const { t, d } of closest) {
          if (d > maxLink) continue;
          ctx.strokeStyle = `rgba(244, 244, 242, ${(0.7 * (1 - d / maxLink) + 0.1).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(t.screenX, t.screenY);
          ctx.stroke();
        }
      }

      // Node dots so the web is visible even when MARKS is off
      ctx.fillStyle = 'rgba(244, 244, 242, 0.9)';
      for (const t of visible) {
        ctx.beginPath();
        ctx.arc(t.screenX, t.screenY, 1.6 + t.near * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. MARKS: corner brackets + "NN +x +y +z" label. The tracker under the cursor locks on.
    if (showMarks) {
      const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
      const pad2 = (n: number) => n.toString().padStart(2, '0');

      ctx.font = '8px "JetBrains Mono", monospace';

      visible.forEach((t) => {
        const x = t.screenX;
        const y = t.screenY;
        const s = 7 + t.near * 4;
        const arm = 4 + t.near * 2;
        const a = 0.82 + t.near * 0.18;

        ctx.strokeStyle = `rgba(244, 244, 242, ${a.toFixed(2)})`;
        ctx.fillStyle = `rgba(244, 244, 242, ${a.toFixed(2)})`;
        ctx.lineWidth = 1 + t.near * 0.6;

        ctx.beginPath();
        ctx.moveTo(x - s, y - s + arm); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + arm, y - s);
        ctx.moveTo(x + s - arm, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + arm);
        ctx.moveTo(x - s, y + s - arm); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s + arm, y + s);
        ctx.moveTo(x + s - arm, y + s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s, y + s - arm);
        ctx.stroke();

        const label = `${pad2(t.id)} ${fmt(t.worldX)} ${fmt(t.worldY)} ${fmt(t.worldZ)}`;
        // Dark plate behind the text so labels stay readable over bright streaks
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(5, 5, 6, 0.4)';
        ctx.fillRect(x + s + 2, y - 4, textW + 6, 10);
        ctx.fillStyle = `rgba(244, 244, 242, ${a.toFixed(2)})`;
        ctx.fillText(label, x + s + 5, y + 4);
      });
    }
  }
}
