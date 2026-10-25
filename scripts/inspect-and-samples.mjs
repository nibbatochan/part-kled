import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const refPath = path.resolve('docs/reference/ref-1.png').replace(/\\/g, '/');
  const fileData = fs.readFileSync('docs/reference/ref-1.png').toString('base64');
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin:0; background:#000;">
        <canvas id="c"></canvas>
      </body>
    </html>
  `);

  const result = await page.evaluate(async (base64) => {
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = 'data:image/png;base64,' + base64;
    });

    const canvas = document.getElementById('c');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Let's inspect the bounding box of non-black pixels around center
    const imgData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imgData.data;

    let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
    // Look at center region excluding the UI headers and footers
    for (let y = 100; y < img.height - 100; y++) {
      for (let x = 120; x < img.width - 120; x++) {
        const idx = (y * img.width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r > 20 || g > 20 || b > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    return { w: img.width, h: img.height, bbox: { minX, maxX, minY, maxY } };
  }, fileData);

  console.log('Result:', result);
  await browser.close();
}

main().catch(console.error);
