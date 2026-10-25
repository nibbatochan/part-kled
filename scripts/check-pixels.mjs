import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = fs.readFileSync('C:/Users/suman/.gemini/antigravity/brain/e878563e-e2dc-427c-b910-c1453239d1ce/.system_generated/steps/464/media_0.png').toString('base64');
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
    for (let y = 150; y < img.height - 150; y++) {
      for (let x = 300; x < img.width - 300; x++) {
        const i = (y * img.width + x) * 4;
        if (d[i] > 20 || d[i+1] > 20 || d[i+2] > 20) {
          coloredPixels++;
        }
      }
    }
    return { w: img.width, h: img.height, coloredPixels };
  }, b64);
  console.log('Live browser page 4 check:', res);
  await browser.close();
}

main().catch(console.error);
