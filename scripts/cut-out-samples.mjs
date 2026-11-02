// Cuts the plain background out of the two jpg samples: writes <name>.png with alpha, and a matching depth map.
// Background = the picture's border colour, flood-filled inward from the edges through similar pixels.
// The sampler gives no particles to alpha-0 pixels, so the cut-out background stays empty.
import { chromium } from 'playwright';
import fs from 'fs';

// Colour distance from the border colour that still counts as background; sample-9 has a grey floor shade
const SAMPLES = [['sample-8', 30], ['sample-9', 48]];
// Opaque islands smaller than this many pixels are stray specks of background, not subject
const MIN_ISLAND = 4000;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>');

  for (const [name, tolerance] of SAMPLES) {
    const b64 = fs.readFileSync(`public/samples/${name}.jpg`).toString('base64');
    const out = await page.evaluate(async ({ dataUrl, tol, minIsland }) => {
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = 'data:image/jpeg;base64,' + dataUrl; });
      const w = img.width;
      const h = img.height;
      const c = document.getElementById('c');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const src = ctx.getImageData(0, 0, w, h).data;

      // Background colour: median of the border pixels
      const border = [];
      for (let x = 0; x < w; x++) { border.push(x, 0, x, h - 1); }
      for (let y = 0; y < h; y++) { border.push(0, y, w - 1, y); }
      const med = [0, 1, 2].map((ch) => {
        const vals = [];
        for (let i = 0; i < border.length; i += 2) vals.push(src[(border[i + 1] * w + border[i]) * 4 + ch]);
        vals.sort((a, b) => a - b);
        return vals[vals.length >> 1];
      });
      const near = (p) => {
        const dr = src[p * 4] - med[0], dg = src[p * 4 + 1] - med[1], db = src[p * 4 + 2] - med[2];
        return Math.hypot(dr, dg, db) <= tol;
      };

      // Flood fill the background from every border pixel that matches it
      const isBg = new Uint8Array(w * h);
      const stack = [];
      const seed = (p) => { if (!isBg[p] && near(p)) { isBg[p] = 1; stack.push(p); } };
      for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
      while (stack.length) {
        const p = stack.pop();
        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) seed(p - 1);
        if (x < w - 1) seed(p + 1);
        if (y > 0) seed(p - w);
        if (y < h - 1) seed(p + w);
      }

      // Drop small opaque islands: they are background the fill did not reach
      const seen = new Uint8Array(w * h);
      for (let start = 0; start < w * h; start++) {
        if (isBg[start] || seen[start]) continue;
        const comp = [start];
        seen[start] = 1;
        for (let i = 0; i < comp.length; i++) {
          const p = comp[i];
          const x = p % w, y = (p - x) / w;
          for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
            if (q >= 0 && !isBg[q] && !seen[q]) { seen[q] = 1; comp.push(q); }
          }
        }
        if (comp.length < minIsland) for (const p of comp) isBg[p] = 1;
      }

      // Alpha: subject opaque, background clear, with a 2 px soft edge (box blur of the hard mask)
      const hard = new Float32Array(w * h);
      for (let p = 0; p < w * h; p++) hard[p] = isBg[p] ? 0 : 1;
      const R = 2;
      const soft = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0, n = 0;
          for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              s += hard[yy * w + xx]; n++;
            }
          }
          soft[y * w + x] = s / n;
        }
      }

      // Depth: the same luminance + centre-dome guess as bake-sample-depths, zero outside the subject
      const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
      const rgba = new Uint8ClampedArray(w * h * 4);
      const depth = new Uint8ClampedArray(w * h * 4);
      for (let p = 0; p < w * h; p++) {
        const a = Math.round(soft[p] * 255);
        rgba[p * 4] = src[p * 4];
        rgba[p * 4 + 1] = src[p * 4 + 1];
        rgba[p * 4 + 2] = src[p * 4 + 2];
        rgba[p * 4 + 3] = a;
        const x = p % w, y = (p - x) / w;
        const lum = (0.299 * src[p * 4] + 0.587 * src[p * 4 + 1] + 0.114 * src[p * 4 + 2]) / 255;
        const dome = 1 - Math.min(1, Math.hypot(x - cx, y - cy) / (maxR * 0.7));
        const d = Math.floor(Math.min(255, (0.45 * lum + 0.55 * dome) * 255)) * soft[p];
        depth[p * 4] = depth[p * 4 + 1] = depth[p * 4 + 2] = d;
        depth[p * 4 + 3] = 255;
      }

      const toPng = (data) => {
        c.width = w;
        c.height = h;
        ctx.putImageData(new ImageData(data, w, h), 0, 0);
        return c.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      };
      const cut = toPng(rgba);
      const dep = toPng(depth);
      const bgShare = 1 - hard.reduce((s, v) => s + v, 0) / (w * h);
      return { cut, dep, bgShare, med };
    }, { dataUrl: b64, tol: tolerance, minIsland: MIN_ISLAND });

    fs.writeFileSync(`public/samples/${name}.png`, Buffer.from(out.cut, 'base64'));
    fs.writeFileSync(`public/samples/${name}-depth.png`, Buffer.from(out.dep, 'base64'));
    console.log(`${name}: background ${(out.bgShare * 100).toFixed(1)}% of picture, border colour ${out.med.join(',')}`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
