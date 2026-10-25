import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = fs.readFileSync('docs/screenshots/verified-particles.png').toString('base64');
  await page.setContent('<canvas id="c"></canvas>');
  const res = await page.evaluate(async (data) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + data; });
    const c = document.getElementById('c');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let coloredPixels = 0;
    // Check center region where Goku is located
    for (let y = 200; y < img.height - 200; y++) {
      for (let x = 400; x < img.width - 400; x++) {
        const i = (y * img.width + x) * 4;
        if (d[i] > 20 || d[i+1] > 20 || d[i+2] > 20) {
          coloredPixels++;
        }
      }
    }
    return { w: img.width, h: img.height, coloredPixels };
  }, b64);
  console.log('Verified particles pixel density in center:', res);
  await browser.close();
}

main().catch(console.error);
