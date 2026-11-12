// Browser check of the R2 finish passes (docs/superpowers/plans/2026-11-12-r2-post-passes.md).
//   node scripts/verify-finish.mjs
// Each pass must change the canvas when switched on, restore it when switched off, and raise no page or GL error.
// Writes screenshots to docs/effect-library/finish/. Frame times are for this machine only.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/effect-library/finish');
fs.mkdirSync(outDir, { recursive: true });
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.error('FAIL', msg); } else console.log('ok  ', msg); };

const PASSES = ['caOn', 'paperOn', 'softOn', 'streakOn'];   // vignetteOn is checked over the paper field: on a black field it has nothing to darken
const MOVE = 0.05;   // mean abs pixel change (0..255) that counts as "the pass did something"
const SAME = 0.02;   // and as "the frame is back"

const server = await createServer({ server: { port: 5203, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'] });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error ${e}`));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && /gl|shader|texture|framebuffer/i.test(m.text())) problems.push(`${m.type()}: ${m.text()}`); });
  await page.goto('http://localhost:5203/');
  await page.waitForFunction(() => window.__app && window.__app.images.length >= 5 && window.__app.engine.lite.sample, null, { timeout: 90000 });
  await page.click('.thumb-slot[data-index="4"] .slot-box');
  await page.waitForFunction(() => window.__app.activeIndex === 4);
  // Panel clicks replace the app's params with the panel's own copy, so a setting made on app.params is lost on the next click: set it on the panel's copy
  const setParam = (path, v) => page.evaluate(([pt, val]) => {
    const a = window.__app, p = a.panel.params, k = pt.split('.');
    const o = k.slice(0, -1).reduce((x, n) => x[n], p);
    o[k.at(-1)] = val;
    a.params = p;
    a.engine.setParams(p);
  }, [path, v]);
  const still = async () => {
    for (const [k, v] of [['panMode', false], ['panAmount', 0], ['drift', 0], ['trails', false]]) await setParam(k, v);
  };
  await still();
  await page.waitForTimeout(3000); // let the picture settle before the first shot
  await page.click('[data-top="stack"]');

  // freeze the app loop and draw at a fixed time, so equal settings give equal pixels
  await page.evaluate(() => { window.__app.paused = true; });
  const snap = async (name) => {
    await page.waitForTimeout(650);   // a paused app applies panel changes on a 500 ms tick
    await page.evaluate(() => window.__app.engine.lite.renderAt(1.5));
    await page.waitForTimeout(150);
    const buf = await page.locator('canvas').first().screenshot();
    if (name) fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
    return buf.toString('base64');
  };
  const diff = (a, b) => page.evaluate(async ([x, y]) => {
    const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${b64}`; });
    const px = async (b64) => { const i = await load(b64); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const [p, q] = [await px(x), await px(y)];
    if (p.length !== q.length) return 255;
    let s = 0;
    for (let k = 0; k < p.length; k += 4) s += Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]);
    return s / (p.length / 4 * 3);
  }, [a, b]);
  const click = (sel) => page.click(sel);
  // the app loop is frozen, so a texture that loads on first use needs one frame to start loading and time to arrive
  const warm = async () => { await page.evaluate(() => window.__app.engine.lite.renderAt(1.5)); await page.waitForTimeout(800); };
  const flag = (k) => page.evaluate((key) => window.__app.params[key], k);

  const base = await snap('00-all-off');
  const noise = await diff(base, await snap()); console.log('noise', noise.toFixed(3)); check(noise < SAME, 'frame is steady with every pass off (no hidden motion)');

  // each pass on, then off
  for (const k of PASSES) {
    await click(`[data-toggle="${k}"]`);
    check(await flag(k) === true, `${k}: toggle sets the flag`);
    const on = await snap(`on-${k}`);
    check((await diff(base, on)) > MOVE, `${k}: changes the canvas`);
    await click(`[data-toggle="${k}"]`);
    check((await diff(base, await snap())) < SAME, `${k}: off again restores the frame`);
  }

  // vignette needs something light at the edges: check it over the paper field
  await click('[data-toggle="paperOn"]');
  const paper = await snap('paper');
  await click('[data-toggle="vignetteOn"]');
  check((await diff(paper, await snap('on-vignetteOn'))) > MOVE, 'vignetteOn: darkens the corners of a light field');
  await click('[data-toggle="vignetteOn"]');
  check((await diff(paper, await snap())) < SAME, 'vignetteOn: off again restores the frame');
  await click('[data-toggle="paperOn"]');

  // mix mode and smooth bloom need the bloom on
  await setParam('bloomOn', true);
  const bloom = await snap('bloom');
  check((await diff(base, bloom)) > MOVE, 'bloom on changes the canvas');
  await click('[data-toggle="tentOn"]');
  const tent = await snap('on-tentOn');
  check((await diff(bloom, tent)) > MOVE, 'tentOn: changes the bloom');
  await click('[data-toggle="tentOn"]');
  check((await diff(bloom, await snap())) < SAME, 'tentOn: off again restores the bloom');
  for (const m of [1, 2]) {
    await click(`[data-mixmode="${m}"]`);
    check((await diff(bloom, await snap(`mix-${m}`))) > MOVE, `mix mode ${m}: changes the glow`);
  }
  await click('[data-mixmode="0"]');
  check((await diff(bloom, await snap())) < SAME, 'mix mode SCREEN restores the glow');
  await setParam('bloomOn', false);

  // R3: 16-bit scene, LUT grades, blue-noise grain
  await setParam('bloomOn', true);   // 16-bit matters most for the glow chain
  const bloomAgain = await snap('bloom-again');
  await click('[data-toggle="hdrOn"]');
  const hdr = await snap('on-hdrOn');
  const active = await page.evaluate(() => window.__app.engine.lite.post?.hdrActive);
  console.log(`16-bit active: ${active}; mean change vs 8-bit with bloom on: ${(await diff(bloomAgain, hdr)).toFixed(4)}`);
  check(active === true, '16-bit: the scene is really 16-bit here');
  check((await diff(bloomAgain, hdr)) > 0.0005, '16-bit: differs from 8-bit');
  await click('[data-toggle="hdrOn"]');
  const back = await diff(bloomAgain, await snap('hdr-off-again')); check(back < SAME, '16-bit: off again restores the frame');
  await setParam('bloomOn', false);
  await click('[data-toggle="lutOn"]');
  await warm();                      // the atlas loads on the first frame that wants it
  for (let id = 1; id <= 7; id++) {
    await click(`[data-lut="${id}"]`);
    check((await diff(base, await snap(`lut-${id}`))) > MOVE, `grade ${id}: changes the frame`);
  }
  await click('[data-lut="0"]');
  const neutral = await diff(base, await snap('lut-0'));
  check(neutral < 0.3, `grade NEUTRAL leaves the frame alone (change ${neutral.toFixed(3)})`);
  await click('[data-lut="4"]');
  await setParam('finish.lutAmount', 0);
  check((await diff(base, await snap())) < 0.3, 'grade at amount 0 leaves the frame alone');
  await setParam('finish.lutAmount', 0.8);
  await click('[data-toggle="lutOn"]');
  check((await diff(base, await snap())) < SAME, 'grade: off again restores the frame');
  await setParam('grainOn', true);
  const grain = await snap('grain');
  check((await diff(base, grain)) > MOVE, 'grain on changes the frame');
  await click('[data-toggle="blueGrainOn"]');
  await warm();
  const blueGrain = await snap('grain-blue');
  check((await diff(grain, blueGrain)) > MOVE, 'blue grain differs from hash grain');
  await click('[data-toggle="blueGrainOn"]');
  check((await diff(grain, await snap())) < SAME, 'blue grain: off again restores the hash grain');
  await setParam('grainOn', false);

  // all on, resize, all off
  for (const k of [...PASSES, 'vignetteOn', 'tentOn', 'hdrOn', 'lutOn']) await click(`[data-toggle="${k}"]`);
  await setParam('bloomOn', true);
  await snap('all-on');
  await page.setViewportSize({ width: 1000, height: 700 });
  await snap('all-on-resized');
  await page.setViewportSize({ width: 1440, height: 900 });
  await setParam('bloomOn', false);
  for (const k of [...PASSES, 'vignetteOn', 'tentOn', 'hdrOn', 'lutOn']) await click(`[data-toggle="${k}"]`);
  await still();
  check((await diff(base, await snap())) < SAME, 'all on, resized, all off: frame is back');

  // EFFECTS RESET turns every pass off
  for (const k of [...PASSES, 'vignetteOn']) await click(`[data-toggle="${k}"]`);
  await page.evaluate(() => document.getElementById('effects-reset').click());
  const left = await page.evaluate((ks) => ks.filter((k) => window.__app.params[k]), [...PASSES, 'vignetteOn', 'tentOn', 'hdrOn', 'lutOn']);
  check(left.length === 0, `EFFECTS RESET turns every finish pass off${left.length ? ' (still on: ' + left.join(', ') + ')' : ''}`);
  await page.evaluate(() => { window.__app.paused = true; });

  // frame time, every pass on versus off (software GL in a test browser: compare the two, do not trust the absolute number)
  const frameMs = () => page.evaluate(() => new Promise((res) => {
    let n = 0, t0 = 0;
    const tick = (t) => { if (!t0) t0 = t; if (++n >= 90) res((t - t0) / (n - 1)); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  const off = await frameMs();
  for (const k of [...PASSES, 'vignetteOn', 'tentOn', 'hdrOn', 'lutOn']) await click(`[data-toggle="${k}"]`);
  await setParam('bloomOn', true);
  const allOn = await frameMs();
  console.log(`frame time: all off ${off.toFixed(1)} ms, all on ${allOn.toFixed(1)} ms (this machine, test browser)`);

  check(problems.length === 0, `no page or GL errors${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);

  // phone width: the new block fits
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto('http://localhost:5203/');
  await phone.waitForFunction(() => window.__app && window.__app.engine.lite.sample, null, { timeout: 90000 });
  await phone.click('[data-top="stack"]');
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, 'phone 390 px: no horizontal scroll with the finish block open');
  await phone.locator('[data-toggle="streakOn"]').scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(outDir, 'phone-finish.png') });
} finally {
  await browser.close();
  await server.close();
}
if (fails.length) { console.error(`\n${fails.length} failed`); process.exit(1); }
console.log('\nfinish ok');
