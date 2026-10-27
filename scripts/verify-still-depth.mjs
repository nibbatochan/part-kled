// Regression check: a picture without baked depth goes through the depth worker (src/depth/depth.worker.ts).
// Uploads public/samples/sample-1.png renamed to photo.png, waits for the particles, checks no page errors.
// Run: node scripts/verify-still-depth.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = 5197;
const PROFILE = path.join(os.tmpdir(), 'particled-verify-clip-profile');
const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();
const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1440, height: 800 } });
const errors = [];
try {
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#file-input', { state: 'attached' });
  await page.setInputFiles('#file-input', {
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: fs.readFileSync('public/samples/sample-1.png'),
  });
  await page.waitForFunction(() => document.querySelectorAll('.thumb-slot').length >= 3, null, { timeout: 900000, polling: 500 });
  await page.waitForFunction(() => document.getElementById('loading-indicator')?.classList.contains('hidden'), null, { timeout: 900000, polling: 500 });
  await page.waitForFunction(() => {
    const app = window.__app;
    return app.images.length > 0 && app.sampleCache.has(app.images[app.images.length - 1].id);
  }, null, { timeout: 900000, polling: 500 });
  // The uploaded picture has no baked depth, so its sample came from the worker
  const sampled = await page.evaluate(() => {
    const app = window.__app;
    const img = app.images[app.images.length - 1];
    return { name: img.name, sampled: app.sampleCache.has(img.id) };
  });
  console.log('uploaded picture:', sampled, '| errors:', errors.length ? errors : 'none');
} finally {
  await context.close();
  await server.close();
}
