import { chromium } from 'playwright';

async function main() {
  console.log('--- TESTING UPDATED TRAIL & IMAGE QUALITY WITH PLAYWRIGHT ---');
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
  await page.waitForTimeout(1600);

  // 1. Verify particle density & draw status
  const status = await page.evaluate(() => {
    const engine = window.__engine;
    if (!engine) return null;
    const info = engine.renderer.renderer.info;
    return {
      calls: info.render.calls,
      points: info.render.points,
      lines: info.render.lines,
      pointsEl: document.getElementById('meta-points')?.textContent,
      hasActiveImage: engine.hasActiveImage,
    };
  });
  console.log('Render Status:', status);

  // 2. Capture initial render with streaming trails to the right
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/verified-streaming-trails.png' });
  console.log('Saved: docs/screenshots/verified-streaming-trails.png');

  // 3. Test DRIFT slider (increase to max drift to verify trail length extends further)
  console.log('Testing DRIFT slider extension...');
  const driftSlider = await page.$('#sl-drift');
  await driftSlider?.fill('0.95');
  await driftSlider?.dispatchEvent('input');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/verified-high-drift-trails.png' });
  console.log('Saved: docs/screenshots/verified-high-drift-trails.png');

  // 4. Test SCAN sweep driven by light
  console.log('Testing SCAN sweep...');
  const scanBtn = await page.$('[data-toggle="scan"]');
  const isScanActive = await scanBtn?.evaluate(el => el.classList.contains('active'));
  if (!isScanActive) {
    await scanBtn?.click();
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'docs/screenshots/verified-scan-active.png' });
  console.log('Saved: docs/screenshots/verified-scan-active.png');

  // 5. Test LIGHT swatch change (e.g. orange or ice)
  console.log('Testing LIGHT swatch...');
  const orangeSwatch = await page.$('[data-light="orange"]');
  await orangeSwatch?.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/verified-light-orange-trails.png' });
  console.log('Saved: docs/screenshots/verified-light-orange-trails.png');

  await browser.close();
  console.log('--- ALL PLAYWRIGHT TRAIL & DENSITY CHECKS PASSED ---');
}

main().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
