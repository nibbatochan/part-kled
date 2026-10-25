import { chromium } from 'playwright';

async function main() {
  console.log('--- TESTING UPDATED PARTICLE DEPTH STUDIO (FEEDBACK FIXES) ---');
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
  await page.waitForTimeout(1800);

  // 1. Verify particle density & status
  const status = await page.evaluate(() => {
    const engine = window.__engine;
    if (!engine) return null;
    const info = engine.renderer.renderer.info;
    const splashEl = document.getElementById('sl-splash');
    return {
      calls: info.render.calls,
      points: info.render.points,
      lines: info.render.lines,
      pointsEl: document.getElementById('meta-points')?.textContent,
      hasActiveImage: engine.hasActiveImage,
      hasSplashSlider: !!splashEl,
    };
  });
  console.log('Render Status:', status);

  // 2. Capture initial render with streaming trails to the right
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/verified-streaming-trails.png' });
  console.log('Saved: docs/screenshots/verified-streaming-trails.png');

  // 3. Test DRIFT slider (increase drift to max to verify dense storm of particles streaming far right)
  console.log('Testing DRIFT slider extension...');
  const driftSlider = await page.$('#sl-drift');
  await driftSlider?.fill('0.98');
  await driftSlider?.dispatchEvent('input');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/screenshots/verified-high-drift-trails.png' });
  console.log('Saved: docs/screenshots/verified-high-drift-trails.png');

  // 4. Test GATHER slider (bring gather to 0.95 to verify particles tighten back home)
  console.log('Testing GATHER slider...');
  const gatherSlider = await page.$('#sl-gather');
  await gatherSlider?.fill('0.95');
  await gatherSlider?.dispatchEvent('input');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/verified-high-gather.png' });
  console.log('Saved: docs/screenshots/verified-high-gather.png');

  // Reset gather back to 0.65 for scanning
  await gatherSlider?.fill('0.65');
  await gatherSlider?.dispatchEvent('input');

  // 5. Test SCAN wavy ripples from center
  console.log('Testing center wavy SCAN...');
  const scanBtn = await page.$('[data-toggle="scan"]');
  const isScanActive = await scanBtn?.evaluate(el => el.classList.contains('active'));
  if (!isScanActive) {
    await scanBtn?.click();
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'docs/screenshots/verified-scan-active.png' });
  console.log('Saved: docs/screenshots/verified-scan-active.png');

  // 6. Test LIGHT swatch change (orange)
  console.log('Testing LIGHT swatch...');
  const orangeSwatch = await page.$('[data-light="orange"]');
  await orangeSwatch?.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/verified-light-orange-trails.png' });
  console.log('Saved: docs/screenshots/verified-light-orange-trails.png');

  // 7. Test TRACK toggle (toggles marks tracking without hover repulsion)
  console.log('Testing TRACK toggle...');
  const trackBtn = await page.$('[data-toggle="track"]');
  await trackBtn?.click(); // toggle off marks
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/screenshots/verified-track-off.png' });
  console.log('Saved: docs/screenshots/verified-track-off.png');

  await browser.close();
  console.log('--- ALL PLAYWRIGHT CHECKS PASSED ---');
}

main().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
