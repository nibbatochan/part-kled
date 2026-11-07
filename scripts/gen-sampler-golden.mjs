// Golden data for the Android sampler port (android/.../Sampler.kt).
// Runs the web build's own weights code (src/core/Sampler.ts) on three small synthetic pictures and records the
// particle buffer the web sampler loop (src/lite/sample.ts, lines 106-154) would produce. The loop is copied here
// because sampleLite needs a browser canvas; keep it identical to sample.ts. The Kotlin test must reproduce it.
// Run: node scripts/gen-sampler-golden.mjs   Output: android/app/src/test/resources/sampler-golden.json
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(tmpdir(), `pds-sampler-${process.pid}.mjs`);
await build({ entryPoints: [join(root, 'src', 'core', 'Sampler.ts')], bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error' });
const { computeImportanceWeights, buildCDF, hash01, lowerBound } = await import(pathToFileURL(tmp).href);
rmSync(tmp, { force: true });

const W = 48, H = 36, COUNT = 500;

function image(kind) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  const depth = new Float32Array(W * H);
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.35;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const inside = Math.hypot(x - cx, y - cy) < rad;
      let r, g, b, a = 255;
      if (kind === 'flat') { // solid backdrop, a patterned disc: exercises removeFlatBackground
        if (inside) { r = (x * 5 + y * 3) & 255; g = (x * 2 + y * 9) & 255; b = (x * y) & 255; } else { r = 200; g = 180; b = 150; }
      } else if (kind === 'alpha') { // cut-out: exercises the explicit alpha path
        r = (x * 7) & 255; g = (y * 11) & 255; b = ((x + y) * 3) & 255; a = inside ? 255 : (x % 5 === 0 ? 30 : 0);
      } else { // busy: border is not flat, so no background cut
        r = (x * 37 + y * 17 + x * y) & 255; g = (x * 13 + y * 29) & 255; b = (x * 3 + y * 5 + x * x) & 255;
      }
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
      depth[i] = Math.fround(((x * 13 + y * 29) % 100) / 100);
    }
  }
  return { rgba, depth };
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

// Copy of the particle loop in src/lite/sample.ts (after the picture and depth are at working size)
function particles(rgba, depth, w, h, count) {
  const { weights, activeCount } = computeImportanceWeights(rgba, depth, w, h);
  const cdf = buildCDF(weights);
  const total = cdf[cdf.length - 1];
  const meanWeight = total / Math.max(1, activeCount);
  const aspect = w / h;
  let mul = Math.floor(count * 0.6180339887) | 1;
  while (gcd(mul, count) !== 1) mul += 2;
  const buffer = new ArrayBuffer(count * 16);
  const f32 = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);
  for (let i = 0; i < count; i++) {
    const j = (i * mul) % count;
    const u = (j + hash01(i, 1)) / count;
    const px = lowerBound(cdf, u * total);
    const x = Math.max(0, Math.min(w - 1.001, (px % w) + hash01(i, 2)));
    const y = Math.max(0, Math.min(h - 1.001, Math.floor(px / w) + hash01(i, 3)));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const at = (xx, yy, c) => rgba[(yy * w + xx) * 4 + c];
    const mix = (c) => (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy;
    const dz = (xx, yy) => depth[yy * w + xx];
    const z = (dz(x0, y0) * (1 - fx) + dz(x0 + 1, y0) * fx) * (1 - fy) + (dz(x0, y0 + 1) * (1 - fx) + dz(x0 + 1, y0 + 1) * fx) * fy;
    f32[i * 4] = (x / w - 0.5) * aspect;
    f32[i * 4 + 1] = 0.5 - y / h;
    f32[i * 4 + 2] = z - 0.5;
    const o = i * 16 + 12;
    u8[o] = mix(0); u8[o + 1] = mix(1); u8[o + 2] = mix(2);
    const gain = Math.min(5, Math.max(0.2, meanWeight / Math.max(1e-4, weights[px])));
    u8[o + 3] = Math.round((gain / 5) * 255);
  }
  return { buffer, activeCount, total, weightsSum: weights.reduce((s, v) => s + v, 0) };
}

const out = { w: W, h: H, count: COUNT, cases: {} };
for (const kind of ['flat', 'alpha', 'busy']) {
  const { rgba, depth } = image(kind);
  const r = particles(rgba, depth, W, H, COUNT);
  out.cases[kind] = {
    rgba: Buffer.from(rgba.buffer).toString('base64'),
    depth: Buffer.from(depth.buffer).toString('base64'),
    activeCount: r.activeCount,
    total: r.total,
    weightsSum: r.weightsSum,
    particles: Buffer.from(r.buffer).toString('base64'),
  };
  console.log(`${kind}: active ${r.activeCount} of ${W * H}, total weight ${r.total.toFixed(3)}`);
}
const dir = join(root, 'android', 'app', 'src', 'test', 'resources');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'sampler-golden.json'), JSON.stringify(out));
console.log('wrote', join(dir, 'sampler-golden.json'));
