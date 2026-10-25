import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Starting Vite server...');
  const server = await createServer({
    server: { port: 5173 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  console.log(`Vite server running at http://localhost:${port}/`);

  const browser = await chromium.launch();
  // Reference images are wide 1024x465 or standard 1920x870 aspect
  const context = await browser.newContext({
    viewport: { width: 1440, height: 720 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to app...');
  await page.goto(`http://localhost:${port}/`);
  await page.waitForLoadState('networkidle');

  // Wait for thumbnails to be loaded from default samples
  await page.waitForSelector('.thumb-slot.active');
  const readoutText = await page.textContent('#frame-readout');
  console.log('Frame readout text:', readoutText);

  // Take screenshot of Phase 0 & 1 UI state
  const screenshotPath = 'docs/screenshots/phase-0-1.png';
  await page.screenshot({ path: screenshotPath });
  console.log('Saved screenshot to:', screenshotPath);

  // Test switching between images via click
  const slots = await page.$$('.thumb-slot');
  console.log('Number of thumbnail slots:', slots.length);
  if (slots.length > 1) {
    await slots[1].click();
    await page.waitForTimeout(300);
    const readout2 = await page.textContent('#frame-readout');
    console.log('Frame readout after clicking slot 2:', readout2);
  }

  // Test adding sample-3.png via file upload
  const sample3Buffer = fs.readFileSync('public/samples/sample-3.png');
  const fileInput = await page.$('#file-input');
  await fileInput.setInputFiles({
    name: 'sample-3.png',
    mimeType: 'image/png',
    buffer: sample3Buffer,
  });

  await page.waitForTimeout(400);
  const slotsAfterUpload = await page.$$('.thumb-slot');
  console.log('Number of slots after upload:', slotsAfterUpload.length);
  const readout3 = await page.textContent('#frame-readout');
  console.log('Frame readout after upload:', readout3);

  const screenshotUploadPath = 'docs/screenshots/phase-1-upload.png';
  await page.screenshot({ path: screenshotUploadPath });
  console.log('Saved upload screenshot to:', screenshotUploadPath);

  await browser.close();
  await server.close();
  console.log('Phase 0 & 1 verification complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
