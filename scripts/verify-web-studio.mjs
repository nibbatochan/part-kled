// Smoke check for the web studio (master-web): loads the studio, switches picture, turns the scan on,
// checks the console has no errors and the WebGL context has no GL errors. Needs `npm run dev` on 5173.
import { chromium } from 'playwright';

const URL = process.env.STUDIO_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL);
await page.waitForFunction(() => window.__app && window.__app.images.length >= 2 && window.__app.engine.lite.sample, null, { timeout: 60000 });
await page.waitForTimeout(500);

// Let the engine draw a few frames, then read a pixel count (non-black = picture is there)
const lit = () => page.evaluate(() => {
  const e = window.__app.engine;
  for (let i = 0; i < 20; i++) e.update(1 / 30, i / 30);
  const gl = e.lite.gl;
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let n = 0;
  for (let i = 0; i < buf.length; i += 4 * 97) if (buf[i] + buf[i + 1] + buf[i + 2] > 60) n++;
  return { lit: n, glError: gl.getError() };
});

const first = await lit();
await page.click('.thumb-slot[data-index="1"] .slot-box');
await page.waitForFunction(() => window.__app.activeIndex === 1);
const second = await lit();
await page.click('[data-toggle="scan"]');
await page.click('#scan-level-inc');
const scanned = await page.evaluate(() => {
  const p = window.__app.panel.getParams();
  return { scan: p.scan, level: p.scanLevel };
});
const withScan = await lit();

const report = { first, second, scanned, withScan, errors };
console.log(JSON.stringify(report, null, 2));

const ok =
  first.lit > 100 && second.lit > 100 && withScan.lit > 100 &&
  first.glError === 0 && second.glError === 0 && withScan.glError === 0 &&
  scanned.scan === true && scanned.level === 4 && errors.length === 0;

await browser.close();
if (!ok) {
  console.error('web studio check FAILED');
  process.exit(1);
}
console.log('web studio check passed');
