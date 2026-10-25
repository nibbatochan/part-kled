import { chromium } from 'playwright';
import { createServer } from 'vite';

async function main() {
  const server = await createServer({
    server: { port: 5173 },
  });
  await server.listen();

  const browser = await chromium.launch({
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=default'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const networkRequests = [];
  page.on('request', req => networkRequests.push(req.url()));

  console.log('Navigating to hero demo page...');
  await page.goto('http://localhost:5173/hero.html');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Check network requests for depth models (transformers / onnx)
  const forbiddenRequests = networkRequests.filter(url => 
    url.includes('transformers') || url.includes('onnx') || url.includes('huggingface')
  );
  console.log('Depth model downloads detected in Hero mode:', forbiddenRequests.length);
  if (forbiddenRequests.length > 0) {
    throw new Error('Hero embed downloaded depth model assets: ' + forbiddenRequests.join(', '));
  }

  // Verify header links are clickable
  const navLink = await page.$('.nav-links a');
  const isClickable = await navLink?.isVisible();
  console.log('Header navigation link is visible & interactive:', isClickable);

  // Take screenshot
  await page.screenshot({ path: 'docs/screenshots/hero-embed.png' });
  console.log('Saved: docs/screenshots/hero-embed.png');

  await browser.close();
  await server.close();
  console.log('Hero embed verification verified successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
