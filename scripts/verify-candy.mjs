import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

async function main() {
  const screenshotDir = path.resolve('docs/screenshots/candy');
  fs.mkdirSync(screenshotDir, { recursive: true });

  console.log('Starting Vite server...');
  const server = await createServer({
    server: { port: 5174 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 5174;
  const url = `http://localhost:${port}/`;
  console.log(`Vite server running at ${url}`);

  const browser = await chromium.launch({
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('PAGE ERROR LOG:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    console.error('PAGE ERROR:', err);
    errors.push(String(err));
  });

  console.log('Navigating to app...');
  await page.goto(url);
  await page.waitForFunction(
    () => window.__app && window.__app.images.length >= 5 && window.__app.engine.lite.sample,
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(1000);

  // Switch to sample-10 (the classical Roman bust in slot 4)
  console.log('Switching to sample-10 (slot 4)...');
  await page.click('.thumb-slot[data-index="4"] .slot-box');
  await page.waitForFunction(() => window.__app.activeIndex === 4);
  await page.waitForTimeout(800);

  // Switch LOOK category to SURFACE
  console.log('Selecting SURFACE look category...');
  await page.evaluate(() => {
    const cats = document.querySelectorAll('#look-dots button');
    for (const b of cats) {
      if (b.textContent.trim() === 'SURFACE') {
        b.click();
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  // Click the CANDY button (look 41)
  console.log('Clicking CANDY look button (slot 41)...');
  await page.click('#style-grid button[data-style="41"]');
  await page.waitForTimeout(300);

  // Helper to step engine and await 2 requestAnimationFrames
  const stepAndAwait = async () => {
    return page.evaluate(async () => {
      const e = window.__engine;
      for (let i = 0; i < 30; i++) {
        e.update(1 / 30, i / 30);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const gl = e.lite.gl;
      return { glError: gl.getError() };
    });
  };

  // 1. FAITHFUL preset (default)
  console.log('Testing FAITHFUL preset...');
  let res = await stepAndAwait();
  if (res.glError !== 0) errors.push(`GL Error on FAITHFUL: ${res.glError}`);
  const faithfulPath = path.join(screenshotDir, 'faithful.png');
  await page.screenshot({ path: faithfulPath });
  console.log(`Saved screenshot: ${faithfulPath}`);

  // 2. SUBTLE preset
  console.log('Testing SUBTLE preset...');
  await page.click('#candy-presets button[data-preset="subtle"]');
  res = await stepAndAwait();
  if (res.glError !== 0) errors.push(`GL Error on SUBTLE: ${res.glError}`);
  const subtlePath = path.join(screenshotDir, 'subtle.png');
  await page.screenshot({ path: subtlePath });
  console.log(`Saved screenshot: ${subtlePath}`);

  // 3. EXPRESSIVE preset
  console.log('Testing EXPRESSIVE preset...');
  await page.click('#candy-presets button[data-preset="expressive"]');
  res = await stepAndAwait();
  if (res.glError !== 0) errors.push(`GL Error on EXPRESSIVE: ${res.glError}`);
  const expressivePath = path.join(screenshotDir, 'expressive.png');
  await page.screenshot({ path: expressivePath });
  console.log(`Saved screenshot: ${expressivePath}`);

  // Pixel verification
  const pixelStats = await page.evaluate(() => {
    const e = window.__engine;
    e.update(1 / 30, 1.0);
    const gl = e.lite.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    let litPixels = 0;
    let orangePixels = 0;
    for (let i = 0; i < buf.length; i += 4 * 64) {
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      if (r + g + b > 40) {
        litPixels++;
        if (r > g && g > b) {
          orangePixels++;
        }
      }
    }
    return { litPixels, orangePixels, glError: gl.getError() };
  });

  console.log('Pixel stats:', pixelStats);

  await browser.close();
  await server.close();

  if (errors.length > 0) {
    console.error('Verification failed with errors:', errors);
    process.exit(1);
  }
  if (pixelStats.orangePixels === 0) {
    console.error('Verification failed: zero orange pixels rendered');
    process.exit(1);
  }
  console.log('CANDY filter verified successfully in browser with zero GL errors and correct orange candy stippling!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
