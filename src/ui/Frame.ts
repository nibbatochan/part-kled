// src/ui/Frame.ts
export class Frame {
  private svgEl: SVGSVGElement;
  private readoutEl: HTMLElement;

  constructor(svgSelector: string, readoutSelector: string) {
    const svg = document.querySelector<SVGSVGElement>(svgSelector);
    const readout = document.querySelector<HTMLElement>(readoutSelector);
    if (!svg || !readout) throw new Error('Frame elements not found');
    this.svgEl = svg;
    this.readoutEl = readout;
    this.buildSvg();
    new ResizeObserver(() => this.buildSvg()).observe(svg.parentElement as HTMLElement);
  }

  public setReadout(current: number, total: number, hash: string): void {
    const pad = (n: number) => n.toString().padStart(2, '0');
    this.readoutEl.textContent = hash ? `${pad(current)} / ${pad(total)}  ${hash}` : `${pad(current)} / ${pad(total)}`;
  }

  private buildSvg(): void {
    const box = (this.svgEl.parentElement as HTMLElement | null)?.getBoundingClientRect();
    const w = box?.width ?? window.innerWidth;
    const h = box?.height ?? window.innerHeight;
    const m = 14; // inset of the frame marks from the stage edge
    const stroke = 'rgba(233, 236, 238, 0.45)';
    const strokeFaint = 'rgba(233, 236, 238, 0.14)';
    const accent = 'rgba(233, 236, 238, 0.9)';

    let svgHtml = '';

    // Corner brackets
    const arm = 18;
    const corners = [
      { x: m, y: m, dx: 1, dy: 1 },
      { x: w - m, y: m, dx: -1, dy: 1 },
      { x: m, y: h - m, dx: 1, dy: -1 },
      { x: w - m, y: h - m, dx: -1, dy: -1 },
    ];
    corners.forEach((c) => {
      svgHtml += `<path d="M${c.x},${c.y + c.dy * arm} V${c.y} H${c.x + c.dx * arm}" stroke="${stroke}" stroke-width="1" fill="none" />`;
    });
    // A single accent square at the top-left bracket
    svgHtml += `<rect x="${m - 2}" y="${m - 2}" width="5" height="5" fill="${accent}" />`;

    // Edge rulers: a tick every 8px, heavier every 40px
    const step = 8;
    for (let x = m + 40; x <= w - m - 40; x += step) {
      const major = (x - m - 40) % (step * 5) === 0;
      const len = major ? 6 : 3;
      svgHtml += `<line x1="${x}" y1="${m}" x2="${x}" y2="${m + len}" stroke="${strokeFaint}" stroke-width="1" />`;
      svgHtml += `<line x1="${x}" y1="${h - m}" x2="${x}" y2="${h - m - len}" stroke="${strokeFaint}" stroke-width="1" />`;
    }
    for (let y = m + 40; y <= h - m - 40; y += step) {
      const major = (y - m - 40) % (step * 5) === 0;
      const len = major ? 6 : 3;
      svgHtml += `<line x1="${m}" y1="${y}" x2="${m + len}" y2="${y}" stroke="${strokeFaint}" stroke-width="1" />`;
      svgHtml += `<line x1="${w - m}" y1="${y}" x2="${w - m - len}" y2="${y}" stroke="${strokeFaint}" stroke-width="1" />`;
    }

    // Centre cross
    svgHtml += `<path d="M${w / 2 - 6},${h / 2} h12 M${w / 2},${h / 2 - 6} v12" stroke="${strokeFaint}" stroke-width="1" fill="none" />`;

    this.svgEl.innerHTML = svgHtml;
  }
}
