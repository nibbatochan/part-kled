// Motion-off canvas screenshot of the studio, for tools/analyze/score.py (Score B and B_max).
//   node scripts/shot-still.mjs out.png [picture.png] [--look=<id>]
// With a picture: it replaces slot 5's sample (as verify-treated.mjs does). Without: the stock sample.
// Pan, drift and trails are off so the shot is repeatable; the UI is excluded (canvas only).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const look = args.find((a) => a.startsWith('--look='))?.slice(7);
const [out, pic] = args.filter((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node scripts/shot-still.mjs out.png [picture.png] [--look=<id>]'); process.exit(1); }

const server = await createServer({ server: { port: 5201, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR', String(e)));
  if (pic) {
    const file = path.resolve(pic);
    await page.route('**/samples/sample-10.png', (r) => r.fulfill({ body: fs.readFileSync(file), contentType: 'image/png' }));
  }
  await page.goto('http://localhost:5201/');
  await page.waitForFunction(() => window.__app && window.__app.images.length >= 5 && window.__app.engine.lite.sample, null, { timeout: 90000 });
  await page.click('.thumb-slot[data-index="4"] .slot-box');
  await page.waitForFunction(() => window.__app.activeIndex === 4);
  await page.evaluate((lk) => {
    const a = window.__app;
    Object.assign(a.params, { panMode: false, panAmount: 0, drift: 0, trails: false });
    if (lk !== undefined) a.params.style = Number(lk); // verify the field name in src/core/params.ts before relying on --look
    a.engine.setParams(a.params);
  }, look);
  await page.waitForTimeout(2500);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.locator('canvas').first().screenshot({ path: out });
  console.log('shot', out);
} finally {
  await browser.close();
  await server.close();
}
