// src/ui/Frame.ts
export class Frame {
  private readoutEl: HTMLElement;

  constructor(_svgSelector: string, readoutSelector: string) {
    const readout = document.querySelector<HTMLElement>(readoutSelector);
    if (!readout) throw new Error('Frame readout element not found');
    this.readoutEl = readout;
  }

  public setReadout(current: number, total: number, hash: string): void {
    const pad = (n: number) => n.toString().padStart(2, '0');
    this.readoutEl.textContent = `${pad(current)} / ${pad(total)}  ${hash}`;
  }
}
