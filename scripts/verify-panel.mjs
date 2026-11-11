// Browser check of the panel tabs (docs/superpowers/specs/2026-11-11-panel-flow-design.md).
//   node scripts/verify-panel.mjs
// Fails (exit 1) on any broken rule and writes screenshots to docs/effect-library/panel/.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/effect-library/panel');
fs.mkdirSync(outDir, { recursive: true });
const TABS = ['effect', 'image', 'emitter', 'video'];
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.error('FAIL', msg); } };

const server = await createServer({ server: { port: 5202, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'] });

const visibleBodies = (page) => page.$$eval('[data-tab-body]', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.tabBody));
const ready = async (page) => {
  await page.goto('http://localhost:5202/');
  await page.waitForFunction(() => window.__app && window.__app.images.length >= 1 && window.__app.engine.lite.sample, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
};

try {
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', (e) => check(false, `${name}: page error ${e}`));
    await ready(page);

    // first load
    check(JSON.stringify(await visibleBodies(page)) === '["effect"]', `${name}: first load shows only the effect body`);
    check((await page.$$('.panel-tab')).length === 4, `${name}: four tab buttons`);
    check((await page.$$('#thumbnail-strip .thumb-slot')).length === 5, `${name}: five picture slots in all`);
    check(await page.evaluate(() => window.__app.params.emitOn === false), `${name}: emitters off on first load`);
    check(await page.$$eval('#emit-panel input[type=range]', (els) => els.length > 0 && els.every((e) => e.disabled)), `${name}: emitter sliders disabled on first load`);
    await page.screenshot({ path: path.join(outDir, `${name}-first-load.png`) });

    // each tab: one body, with a visible control, no horizontal page scroll
    check(!(await page.locator('[data-panel-tab="video"]').isVisible()), `${name}: video tab hidden in the lab`);
    for (const t of TABS.filter((x) => x !== 'video')) {
      await page.click(`[data-panel-tab="${t}"]`);
      check(JSON.stringify(await visibleBodies(page)) === JSON.stringify([t]), `${name}: ${t} tab shows only its body`);
      const n = await page.$$eval(`[data-tab-body="${t}"] input, [data-tab-body="${t}"] button`, (els) => els.filter((e) => e.offsetParent !== null).length);
      check(n > 0, `${name}: ${t} body has visible controls (${n})`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${name}: ${t} no horizontal page scroll`);
      await page.screenshot({ path: path.join(outDir, `${name}-${t}.png`) });
    }

    // a picture slot click does not change the tab
    await page.click('[data-panel-tab="emitter"]');
    await page.click('#thumbnail-strip .thumb-slot[data-index="0"] .slot-box');
    check(JSON.stringify(await visibleBodies(page)) === '["emitter"]', `${name}: slot click keeps the emitter tab`);

    // EFFECTS RESET keeps the emitter switch where the user put it
    if (!(await page.locator('[data-toggle="emitOn"]').isVisible())) await page.click('#emit-panel .sec-head-btn'); // the section opens on click
    await page.click('[data-toggle="emitOn"]');
    check(await page.evaluate(() => window.__app.params.emitOn === true), `${name}: emitter ON button turns emitters on`);
    await page.click('[data-panel-tab="effect"]');
    await page.click('#effects-reset');
    check(await page.evaluate(() => window.__app.params.emitOn === true), `${name}: effects RESET leaves emitters on`);

    // the tab is not remembered: after choosing image and reloading, the page opens on effect again
    await page.click('[data-panel-tab="image"]');
    await page.reload(); await ready(page);
    check(JSON.stringify(await visibleBodies(page)) === '["effect"]', `${name}: reload opens on effect`);
    await page.close();
  }

  // the video view: video tab shown and opened first, picture strip hidden, its controls visible
  const vpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vpage.on('pageerror', (e) => check(false, `video view: page error ${e}`));
  await vpage.goto('http://localhost:5202/?view=video');
  await vpage.waitForFunction(() => window.__app && window.__app.engine.lite, null, { timeout: 90000 });
  await vpage.waitForTimeout(1200);
  check(JSON.stringify(await visibleBodies(vpage)) === '["video"]', 'video view: opens on the video tab');
  check(await vpage.locator('[data-panel-tab="video"]').isVisible(), 'video view: video tab shown');
  check(!(await vpage.locator('#thumbnail-strip').isVisible()), 'video view: picture strip hidden');
  check(await vpage.locator('#clip-open-btn').isVisible(), 'video view: OPEN VIDEO button visible');
  await vpage.screenshot({ path: path.join(outDir, 'video-view.png') });
  await vpage.close();
} finally {
  await browser.close();
  await server.close();
}
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log('panel ok');
