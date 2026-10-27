// Phase 0 benchmark for the video research (docs/RESEARCH_VIDEO_TIMELINE_EXPORT.md section 7.2).
// Times DepthEstimator.estimateDepth() at the sizes the clip plan uses, in the real Vite dev build.
// Measures: first call (model load + shader compile), then warm runs (median, p95).
// Not measured here: the Dedicated Worker path, home upload, sim step cost, export throughput.
// Run: node scripts/bench-depth.mjs   (needs node_modules, network for the model on first run)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';

const SIZES = [512, 768];
const WARM_RUNS = 6;
const SAMPLE = 'public/samples/sample-1.png';
const PORT = 5199;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const p95 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
};

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
});
const warnings = [];
try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && /Depth pipeline on/.test(msg.text())) warnings.push(msg.text());
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForLoadState('networkidle');

  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(SAMPLE).toString('base64');
  const result = await page.evaluate(
    async ({ dataUrl, sizes, runs }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const { DepthEstimator } = await import('/src/depth/DepthEstimator.ts');
      const est = new DepthEstimator();
      const out = { hasWebGPU: !!navigator.gpu, sample: [img.width, img.height], sizes: {} };
      const canvasAt = (side) => {
        const k = side / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(2, Math.round(img.width * k));
        c.height = Math.max(2, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c;
      };
      // First call loads the model and compiles shaders: report it apart from warm runs
      const t0 = performance.now();
      await est.estimateDepth(canvasAt(sizes[0]));
      out.firstCallMs = performance.now() - t0;
      for (const side of sizes) {
        const c = canvasAt(side);
        const times = [];
        for (let i = 0; i < runs; i++) {
          const a = performance.now();
          await est.estimateDepth(c);
          times.push(performance.now() - a);
        }
        out.sizes[side] = times;
      }
      return out;
    },
    { dataUrl, sizes: SIZES, runs: WARM_RUNS }
  );

  const report = {
    hasWebGPU: result.hasWebGPU,
    sample: result.sample,
    firstCallMs: Math.round(result.firstCallMs),
    fallbackWarnings: warnings,
    bySize: Object.fromEntries(
      Object.entries(result.sizes).map(([side, t]) => [
        side,
        { medianMs: Math.round(median(t)), p95Ms: Math.round(p95(t)), runs: t.map(Math.round) },
      ])
    ),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
