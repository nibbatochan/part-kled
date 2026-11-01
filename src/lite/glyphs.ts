// src/lite/glyphs.ts
// Glyph atlas for the ASCII look. The ramp is built by measuring: every candidate character is drawn,
// its ink coverage counted, and the characters picked at even steps of coverage, so each step of tone
// is the same step of ink. 16 columns by 4 rows (CLASSIC 10, DENSE 16, BINARY 3, the SHAKE-MASK word), each glyph 16 x 32 px.

export const GLYPH_W = 16;
export const GLYPH_H = 32;

const CANDIDATES = " .'`,:;-_~=+*^!i1lrcvunxzjftLCJUYXZO0Q#MW&8%B@$|/\\()[]{}<>?";
const FONT = `bold ${Math.round(GLYPH_H * 0.8)}px monospace`;

function drawGlyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number): void {
  ctx.fillText(ch, x + GLYPH_W / 2, y + GLYPH_H / 2 + 1);
}

/** The characters of one ramp, thin to dense. */
export function measureRamps(): string[][] {
  const c = document.createElement('canvas');
  c.width = GLYPH_W;
  c.height = GLYPH_H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [[...' .:-=+*#%@'], [...' .:-=+*#%@'], [' ', '1', '0']];
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ink = new Map<string, number>();
  for (const ch of CANDIDATES) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, GLYPH_W, GLYPH_H);
    ctx.fillStyle = '#fff';
    drawGlyph(ctx, ch, 0, 0);
    const d = ctx.getImageData(0, 0, GLYPH_W, GLYPH_H).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i];
    ink.set(ch, sum / (GLYPH_W * GLYPH_H * 255));
  }
  const sorted = [...ink.entries()].sort((a, b) => a[1] - b[1]);
  const lo = sorted[0][1];
  const hi = sorted[sorted.length - 1][1];
  const pick = (n: number): string[] => {
    const used = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const target = lo + ((hi - lo) * i) / Math.max(1, n - 1);
      let best = sorted[0][0];
      let bestD = Infinity;
      for (const [ch, v] of sorted) {
        if (used.has(ch)) continue;
        const d = Math.abs(v - target);
        if (d < bestD) {
          bestD = d;
          best = ch;
        }
      }
      used.add(best);
      out.push(best);
    }
    return out;
  };
  const binary = [' ', '1', '0'].sort((a, b) => (ink.get(a) ?? 0) - (ink.get(b) ?? 0));
  return [pick(10), pick(16), binary];
}

/** The word SHAKE-MASK repeats along each row of letters, so the strings read as one word. */
export const SHAKE_WORD = 'shakemask';

export function buildGlyphAtlas(): HTMLCanvasElement {
  const ramps = [...measureRamps(), [...SHAKE_WORD]]; // row 3 holds the letters of the word
  const c = document.createElement('canvas');
  c.width = GLYPH_W * 16;
  c.height = GLYPH_H * 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ramps.forEach((ramp, row) => ramp.forEach((ch, i) => drawGlyph(ctx, ch, i * GLYPH_W, row * GLYPH_H)));
  return c;
}
