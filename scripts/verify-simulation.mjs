import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

async function main() {
  console.log('Starting Vite server...');
  const server = await createServer({
    server: { port: 5173 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5173/');

  // Launch browser with WebGL enabled
  const browser = await chromium.launch({
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 720 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Pipe console errors and logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('Navigating to app...');
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');

  // Allow WebGL simulation to stabilize for 1.5s
  await page.waitForTimeout(1500);

  // 1. Capture Base Simulation (matches ref-1)
  await page.screenshot({ path: 'docs/screenshots/sim-1-base.png' });
  console.log('Saved: docs/screenshots/sim-1-base.png');

  // 2. Enable Marks and Links (matches ref-2)
  // Check if MARKS button is active
  const marksBtn = await page.$('[data-toggle="marks"]');
  const marksClass = await marksBtn?.getAttribute('class');
  if (!marksClass?.includes('active')) {
    await marksBtn?.click();
  }
  const linksBtn = await page.$('[data-toggle="links"]');
  await linksBtn?.click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'docs/screenshots/sim-2-trackers.png' });
  console.log('Saved: docs/screenshots/sim-2-trackers.png');

  // 3. Move cursor to center of face (approx 720, 320) and click for splash burst (matches ref-3)
  await page.mouse.move(720, 320);
  await page.mouse.down();
  await page.mouse.move(735, 310, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.screenshot({ path: 'docs/screenshots/sim-3-cursor-splash.png' });
  console.log('Saved: docs/screenshots/sim-3-cursor-splash.png');

  // 4. Test NEXT button / image morph
  const nextBtn = await page.$('#btn-next');
  await nextBtn?.click();
  await page.waitForTimeout(1000); // mid-morph
  await page.screenshot({ path: 'docs/screenshots/sim-4-morph.png' });
  console.log('Saved: docs/screenshots/sim-4-morph.png');

  // Wait for morph to finish
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/screenshots/sim-5-image2.png' });
  console.log('Saved: docs/screenshots/sim-5-image2.png');

  await browser.close();
  await server.close();
  console.log('Simulation verification script completed successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
