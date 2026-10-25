import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const name of ['verified-trail-swarm.png', 'verified-trail-melt.png', 'verified-scan-beam.png', 'verified-camera-orbit.png', 'verified-image-delete.png']) {
    const b64 = fs.readFileSync('docs/screenshots/' + name).toString('base64');
    await page.setContent('<canvas id="c"></canvas>');
    const res = await page.evaluate(async (data) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + data; });
      const c = document.getElementById('c');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let nonBlack = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 20 || d[i+1] > 20 || d[i+2] > 20) nonBlack++;
      }
      return { totalPixels: d.length / 4, nonBlack };
    }, b64);
    console.log(name, 'non-black pixels:', res.nonBlack, 'of', res.totalPixels);
  }
  await browser.close();
}

main().catch(console.error);
