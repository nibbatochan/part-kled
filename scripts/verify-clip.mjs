// Phase 1 check for video clip input (docs/RESEARCH_VIDEO_TIMELINE_EXPORT.md section 7.2).
// Makes a 12 s webm in the page, loads it as a clip, prepares keyframes, plays, scrubs, and checks the
// picture changes. Records prepare time and JS heap before and after. Uses a persistent profile so the
// depth model is downloaded once.
// Run: node scripts/verify-clip.mjs   (needs node_modules; first run downloads the model)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = 5198;
const PROFILE = path.join(os.tmpdir(), 'particled-verify-clip-profile');
const SHOT_DIR = 'docs/screenshots';

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
  viewport: { width: 1440, height: 800 },
});
const errors = [];
const logs = [];
try {
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    if (/Clip|keyframe/i.test(m.text())) logs.push(m.text());
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#file-input', { state: 'attached' });
  await page.waitForLoadState('networkidle');

  // 1. Make a 12 s test clip: sample-1 slowly panning, recorded from a canvas
  const webmB64 = await page.evaluate(async () => {
    const img = new Image();
    img.src = '/samples/sample-1.png';
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 360;
    const ctx = cv.getContext('2d');
    const stream = cv.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        const zoom = 1 + 0.15 * Math.sin(t);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cv.width, cv.height);
        const w = cv.width * zoom;
        const h = cv.height * zoom;
        ctx.drawImage(img, (cv.width - w) / 2 + 30 * Math.sin(t), (cv.height - h) / 2, w, h);
        if (t < 12) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const clipPath = path.join(os.tmpdir(), 'particled-verify-clip.webm');
  fs.writeFileSync(clipPath, Buffer.from(webmB64, 'base64'));
  console.log('test clip bytes:', fs.statSync(clipPath).size);

  // Lab is the default workspace: the clip panel is not shown, the source strip is
  const vis = (sel) => page.$eval(sel, (el) => getComputedStyle(el).display !== 'none');
  console.log('lab mode: clip panel visible', await vis('#clip-panel'), '| source box visible', await vis('#source-box'));
  await page.click('#mode-switch [data-mode="video"]');
  console.log('video mode: clip panel visible', await vis('#clip-panel'), '| source box visible', await vis('#source-box'), '| readout:', await page.textContent('#clip-readout'));

  // 2. Load it through the file input (same path as a drop)
  await page.setInputFiles('#file-input', clipPath);
  await page.waitForFunction(() => {
    const el = document.getElementById('clip-readout');
    return el && /PREPARE TO PLAY/.test(el.textContent || '');
  }, null, { timeout: 30000 });
  console.log('readout after load:', await page.textContent('#clip-readout'));

  // 3. Prepare keyframes
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  // Long tasks (>50 ms) on the main thread during prepare: answers the Phase 0 open question
  await page.evaluate(() => {
    window.__longtasks = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__longtasks.push(e.duration))).observe({
      entryTypes: ['longtask'],
    });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  // The click can hold while the main thread is busy; do not wait for navigation
  await page.click('#clip-prepare-btn', { noWaitAfter: true });
  await page.waitForFunction(() => /KEYFRAMES/.test(document.getElementById('clip-readout')?.textContent || ''), null, {
    timeout: 900000,
    polling: 500,
  });
  const prepSec = (Date.now() - t0) / 1000;
  const { profile } = await cdp.send('Profiler.stop');
  {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const f = n.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`;
      self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
    });
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log('main-thread self time during prepare (ms):');
    for (const [k, v] of top) console.log(`  ${Math.round(v)}  ${k}`);
  }
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  console.log('readout after prepare:', await page.textContent('#clip-readout'));
  console.log(`prepare seconds: ${prepSec.toFixed(1)}`);
  const longtasks = await page.evaluate(() => window.__longtasks);
  console.log(`long tasks during prepare: ${longtasks.length}, longest ${Math.round(Math.max(0, ...longtasks))} ms`);
  console.log(`JS heap MB before ${heapBefore && (heapBefore / 1e6).toFixed(0)}, after ${heapAfter && (heapAfter / 1e6).toFixed(0)}`);

  // 4. Playing: picture should step through keyframes
  await page.waitForTimeout(1500);
  // Long tasks while only playing (no depth work): separates render cost from depth cost
  await page.evaluate(() => { window.__longtasks = []; });
  await page.waitForTimeout(5000);
  const playLong = await page.evaluate(() => window.__longtasks);
  console.log(`long tasks in 5 s of playback: ${playLong.length}, longest ${Math.round(Math.max(0, ...playLong))} ms`);
  const playLabel = await page.textContent('#clip-play-btn');
  await page.screenshot({ path: path.join(SHOT_DIR, 'clip-phase1-play.png') });
  console.log('play button label while playing:', playLabel);

  // 5. Pause and scrub to 6 s, check the picture changed
  await page.click('#clip-play-btn');
  await page.evaluate(() => {
    const s = document.getElementById('clip-scrub');
    s.max = '12';
    s.value = '6';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOT_DIR, 'clip-phase1-scrub6.png') });
  console.log('play button label after pause:', await page.textContent('#clip-play-btn'));

  // 6. Back to the lab: the clip closes, the picture returns, the source strip is back
  await page.click('#mode-switch [data-mode="lab"]');
  await page.waitForTimeout(800);
  console.log('back in lab: clip panel visible', await vis('#clip-panel'), '| source box visible', await vis('#source-box'));
  console.log('frame readout:', await page.textContent('#frame-readout'));
  await page.screenshot({ path: path.join(SHOT_DIR, 'clip-phase1-lab-restored.png') });

  console.log('clip logs:', logs.slice(0, 20));
  console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
} finally {
  await context.close();
  await server.close();
}
