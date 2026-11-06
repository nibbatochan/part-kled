// Emit the lite renderer's GLSL (src/lite/shaders.ts) as plain .glsl files for the Android app.
// One source of truth: the web studio's TypeScript. Run: node scripts/export-shaders.mjs
// Output: android/app/src/main/assets/shaders/*.glsl and manifest.json (hashes, so drift is visible in review).
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'android', 'app', 'src', 'main', 'assets', 'shaders');
const tmp = join(tmpdir(), `pds-shaders-${process.pid}.mjs`);

// Exported name -> asset file. Post.ts shaders are not exported yet; add them when phase 2 needs the post chain.
const FILES = {
  POINT_VERT: 'point.vert.glsl',
  TRAIL_VERT: 'trail.vert.glsl',
  FRAG_SRC: 'point.frag.glsl', // shared by the point and trail vertex shaders
  CELL_VERT: 'cell.vert.glsl',
  CELL_FRAG_SRC: 'cell.frag.glsl',
  EQ_VERT: 'eq.vert.glsl',
};

await build({
  entryPoints: [join(root, 'src', 'lite', 'shaders.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: tmp,
  logLevel: 'error',
});
const mod = await import(pathToFileURL(tmp).href);
rmSync(tmp, { force: true });

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = {};
for (const [name, file] of Object.entries(FILES)) {
  const src = mod[name];
  if (typeof src !== 'string' || !src.startsWith('#version 300 es')) {
    throw new Error(`${name} is missing or is not a GLSL ES 3.00 string`);
  }
  writeFileSync(join(outDir, file), src);
  manifest[file] = { export: name, bytes: Buffer.byteLength(src), sha256: createHash('sha256').update(src).digest('hex').slice(0, 16) };
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

for (const [file, m] of Object.entries(manifest)) console.log(`${file}  ${m.bytes} bytes  ${m.sha256}`);
console.log(`wrote ${Object.keys(manifest).length} shaders to ${outDir}`);
