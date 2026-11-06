// Serve a treated PNG in place of sample-10.png (depth stays valid), load in studio, screenshot DOTS.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const effects = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome','holo','neon','stipple','glass','crystal','original'];
const outDir = path.resolve('docs/effect-library/studio');
fs.mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5200, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'] });
for (const fx of effects) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR', String(e)));
  if (fx !== 'original') {
    const file = path.resolve(`docs/effect-library/samples/sample-10__${fx}.png`);
    await page.route('**/samples/sample-10.png', (r) => r.fulfill({ body: fs.readFileSync(file), contentType: 'image/png' }));
  }
  await page.goto('http://localhost:5200/');
  await page.waitForFunction(() => window.__app && window.__app.images.length >= 5 && window.__app.engine.lite.sample, null, { timeout: 90000 });
  await page.click('.thumb-slot[data-index="4"] .slot-box');
  await page.waitForFunction(() => window.__app.activeIndex === 4);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, `${fx}.png`) });
  console.log('shot', fx);
  await page.close();
}
await browser.close();
await server.close();
