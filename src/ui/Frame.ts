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
    window.addEventListener('resize', () => this.buildSvg());
  }

  public setReadout(current: number, total: number, hash: string): void {
    const pad = (n: number) => n.toString().padStart(2, '0');
    this.readoutEl.textContent = `${pad(current)} / ${pad(total)}  ${hash}`;
  }

  private buildSvg(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 28;
    const stroke = 'rgba(244, 244, 242, 0.14)';
    const strokeFaint = 'rgba(244, 244, 242, 0.06)';

    let svgHtml = '';

    // Corner crosshairs (top-left, top-right, bottom-left, bottom-right)
    const arm = 14;
    const corners = [
      { x: margin, y: margin, dx: 1, dy: 1 },
      { x: w - margin, y: margin, dx: -1, dy: 1 },
      { x: margin, y: h - margin, dx: 1, dy: -1 },
      { x: w - margin, y: h - margin, dx: -1, dy: -1 },
    ];

    corners.forEach(c => {
      svgHtml += `<path d="M${c.x},${c.y - c.dy * 4} v${c.dy * (arm + 4)} M${c.x - c.dx * 4},${c.y} h${c.dx * (arm + 4)}" stroke="${stroke}" stroke-width="1" fill="none" />`;
    });

    // Top horizontal tick ruler
    const tickSpacing = 8;
    const topStartY = margin - 6;
    for (let x = margin + 40; x <= w - margin - 40; x += tickSpacing) {
      const isMajor = (x - margin - 40) % (tickSpacing * 5) === 0;
      const len = isMajor ? 5 : 2.5;
      svgHtml += `<line x1="${x}" y1="${topStartY}" x2="${x}" y2="${topStartY + len}" stroke="${strokeFaint}" stroke-width="1" />`;
    }

    // Left and right vertical tick rulers
    for (let y = margin + 40; y <= h - margin - 40; y += tickSpacing) {
      const isMajor = (y - margin - 40) % (tickSpacing * 5) === 0;
      const len = isMajor ? 5 : 2.5;
      // Left
      svgHtml += `<line x1="${margin - 6}" y1="${y}" x2="${margin - 6 + len}" y2="${y}" stroke="${strokeFaint}" stroke-width="1" />`;
      // Right
      svgHtml += `<line x1="${w - margin + 6}" y1="${y}" x2="${w - margin + 6 - len}" y2="${y}" stroke="${strokeFaint}" stroke-width="1" />`;
    }

    this.svgEl.innerHTML = svgHtml;
  }
}
