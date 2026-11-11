// Motion-off studio canvas screenshots, shared by shot-still.mjs and score-look.mjs.
//   await stills([{ out: 'a.png', pic: 'picture.png', look: 46 }, ...])
// One dev server and one browser for all jobs. `pic` replaces slot 5's sample (as verify-treated.mjs does);
// `look` is clicked on its real tile (category opened first), so every flag the panel sets for that look is set too.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

export async function stills(jobs, { port = 5201 } = {}) {
  const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'] });
  try {
    for (const { out, pic, look } of jobs) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on('pageerror', (e) => console.error('PAGE ERROR', String(e)));
      if (pic) {
        const file = path.resolve(pic);
        await page.route('**/samples/sample-10.png', (r) => r.fulfill({ body: fs.readFileSync(file), contentType: 'image/png' }));
      }
      await page.goto(`http://localhost:${port}/`);
      await page.waitForFunction(() => window.__app && window.__app.images.length >= 5 && window.__app.engine.lite.sample, null, { timeout: 90000 });
      await page.click('.thumb-slot[data-index="4"] .slot-box');
      await page.waitForFunction(() => window.__app.activeIndex === 4);
      if (look !== undefined && Number(look) !== 0) {
        // tiles exist only for the open category: open each category in turn until the look's tile shows
        const found = await page.evaluate((id) => {
          for (const d of document.querySelectorAll('#look-dots [data-cat]')) {
            d.click();
            const b = document.querySelector(`#style-grid [data-style="${id}"]`);
            if (b) { b.click(); return true; }
          }
          return false;
        }, String(look));
        if (!found) throw new Error(`no look tile with data-style="${look}"`);
      }
      await page.evaluate(() => {
        const a = window.__app;
        Object.assign(a.params, { panMode: false, panAmount: 0, drift: 0, trails: false });
        a.engine.setParams(a.params);
      });
      await page.waitForTimeout(2500);
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      await page.locator('canvas').first().screenshot({ path: out });
      console.log('shot', out);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}
