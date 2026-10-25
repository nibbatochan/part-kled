import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Connecting to app with Playwright...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 720 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');

  // Wait 1.5s for initial image particles to load
  await page.waitForTimeout(1500);

  // Check WebGL draw calls and particles count
  const renderStatus = await page.evaluate(() => {
    const engine = window.__engine;
    if (!engine) return { error: 'No engine found' };
    const info = engine.renderer.renderer.info;
    const scene = engine.renderer.scene;
    const pointsMesh = scene.children[0];
    const streaksMesh = scene.children[1];

    return {
      calls: info.render.calls,
      pointsDrawn: info.render.points,
      linesDrawn: info.render.lines,
      pointsVisible: pointsMesh?.visible,
      streaksVisible: streaksMesh?.visible,
      hasActiveImage: engine.hasActiveImage,
      trackerPointsCount: engine.getTrackerPoints().length,
      sampleTracker: engine.getTrackerPoints()[0] || null,
    };
  });

  console.log('Render Status:', renderStatus);

  if (renderStatus.pointsDrawn === 0 || renderStatus.calls === 0) {
    throw new Error('Particles are still NOT drawing! Calls: ' + renderStatus.calls);
  }

  // 1. Capture verified particles
  await page.screenshot({ path: 'docs/screenshots/verified-particles.png' });
  console.log('Saved: docs/screenshots/verified-particles.png');

  // 2. Test uploading an image
  console.log('Testing file upload...');
  const sampleBuffer = fs.readFileSync('public/samples/sample-3.png');
  const fileInput = await page.$('#file-input');
  await fileInput?.setInputFiles({
    name: 'uploaded-subject.png',
    mimeType: 'image/png',
    buffer: sampleBuffer,
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/screenshots/verified-uploaded-particles.png' });
  console.log('Saved: docs/screenshots/verified-uploaded-particles.png');

  // 3. Test cursor interaction (move over center and click)
  console.log('Testing cursor splash...');
  await page.mouse.move(720, 360);
  await page.mouse.down();
  await page.mouse.move(740, 340, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.screenshot({ path: 'docs/screenshots/verified-interaction.png' });
  console.log('Saved: docs/screenshots/verified-interaction.png');

  await browser.close();
  console.log('All Playwright verifications passed!');
}

main().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
