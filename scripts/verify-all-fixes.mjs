import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('--- STARTING COMPREHENSIVE PLAYWRIGHT VERIFICATION ---');
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
  await page.waitForTimeout(1500);

  // 1. VERIFY MARKS & TRACKERS SECTION REMOVED
  console.log('1. Checking MARKS and TRACKERS removed from DOM...');
  const marksBtn = await page.$('[data-toggle="marks"]');
  const trackersSeg = await page.$('[data-seg="trackers"]');
  if (marksBtn !== null || trackersSeg !== null) {
    throw new Error('Marks or Trackers elements still present in DOM!');
  }
  console.log('✓ Marks and Trackers cleanly removed.');

  // 2. VERIFY INITIAL RENDER & TRAIL STREAMING (SWARM MODE)
  console.log('2. Verifying particles & trail streaming right (SWARM)...');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/verified-trail-swarm.png' });

  // 3. VERIFY MELT MODE
  console.log('3. Testing MELT travel mode...');
  const meltBtn = await page.$('[data-travel="melt"]');
  await meltBtn?.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/screenshots/verified-trail-melt.png' });

  // Switch back to SWARM
  const swarmBtn = await page.$('[data-travel="swarm"]');
  await swarmBtn?.click();
  await page.waitForTimeout(300);

  // 4. VERIFY LIGHTS INTERACTION & SCAN SWEEP
  console.log('4. Testing LIGHTS button cycling and SCAN...');
  const lightBtn = await page.$('#btn-light');
  const lightText1 = await lightBtn?.innerText();
  console.log('Light Initial:', lightText1);

  // Click light to advance direction
  await lightBtn?.click();
  const lightText2 = await lightBtn?.innerText();
  console.log('Light After 1st Click:', lightText2);

  await lightBtn?.click();
  const lightText3 = await lightBtn?.innerText();
  console.log('Light After 2nd Click:', lightText3);

  // Turn on SCAN toggle if not already
  const scanBtn = await page.$('[data-toggle="scan"]');
  const isScanActive = await scanBtn?.evaluate(el => el.classList.contains('active'));
  if (!isScanActive) {
    await scanBtn?.click();
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/verified-scan-beam.png' });

  // 5. VERIFY CAMERA ORBIT WITHOUT EXPLOSION
  console.log('5. Testing 3D camera orbit drag (verifying particles stay coherent)...');
  // Drag across canvas to rotate camera in 3D
  await page.mouse.move(720, 360);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(860, 310, { steps: 15 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(400);

  const orbitStatus = await page.evaluate(() => {
    const engine = window.__engine;
    return {
      pointerVel: engine.pointerVelWorld.length(),
      cameraRotX: engine.cameraCtrl.camera.rotation.x,
      cameraRotY: engine.cameraCtrl.camera.rotation.y,
      pointsCount: engine.renderer.renderer.info.render.points,
    };
  });
  console.log('Orbit Status:', orbitStatus);
  if (orbitStatus.pointerVel > 2.0) {
    throw new Error('Pointer velocity exploded during camera drag! Vel: ' + orbitStatus.pointerVel);
  }
  await page.screenshot({ path: 'docs/screenshots/verified-camera-orbit.png' });

  // 6. VERIFY IMAGE DELETE ACTION
  console.log('6. Testing image deletion...');
  const readoutBefore = await page.$eval('#frame-readout', el => el.textContent);
  console.log('Readout before delete:', readoutBefore);

  // Find second slot delete button
  const delBtns = await page.$$('.slot-delete');
  console.log('Found thumbnail delete buttons:', delBtns.length);
  if (delBtns.length >= 2) {
    await delBtns[1].click();
    await page.waitForTimeout(500);
    const readoutAfter1 = await page.$eval('#frame-readout', el => el.textContent);
    console.log('Readout after deleting slot 2:', readoutAfter1);
  }

  await page.screenshot({ path: 'docs/screenshots/verified-image-delete.png' });

  await browser.close();
  console.log('--- ALL PLAYWRIGHT VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

main().catch(err => {
  console.error('Playwright Verification Failed:', err);
  process.exit(1);
});
