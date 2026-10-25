import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setContent(`<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>`);

  for (const name of ['sample-1', 'sample-2', 'sample-3']) {
    const imgPath = `public/samples/${name}.png`;
    const b64 = fs.readFileSync(imgPath).toString('base64');

    const depthB64 = await page.evaluate(async (dataUrl) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + dataUrl; });
      const c = document.getElementById('c');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const d = imgData.data;
      const n = img.width * img.height;
      const depthData = ctx.createImageData(img.width, img.height);
      const dd = depthData.data;

      const cx = img.width / 2;
      const cy = img.height / 2;
      const maxR = Math.hypot(cx, cy);

      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const idx = (y * img.width + x) * 4;
          const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];

          if (a < 10) {
            dd[idx] = 0; dd[idx + 1] = 0; dd[idx + 2] = 0; dd[idx + 3] = 255;
            continue;
          }

          // Luminance + radial center dome depth
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
          const distToCenter = 1.0 - Math.min(1.0, Math.hypot(x - cx, y - cy) / (maxR * 0.7));
          const depthVal = Math.floor(Math.min(255, (0.45 * lum + 0.55 * distToCenter) * 255));

          dd[idx] = depthVal;
          dd[idx + 1] = depthVal;
          dd[idx + 2] = depthVal;
          dd[idx + 3] = 255;
        }
      }

      ctx.putImageData(depthData, 0, 0);
      return c.toDataURL('image/png');
    }, b64);

    const outPath = `public/samples/${name}-depth.png`;
    const cleanB64 = depthB64.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outPath, Buffer.from(cleanB64, 'base64'));
    console.log('Saved baked depth map:', outPath);
  }

  await browser.close();
}

main().catch(console.error);
