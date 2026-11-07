// Build an Android wallpaper pack from the web studio's own settings.
// The mapping from studio settings to renderer settings is the web build's own toLiteParams(), run here unchanged,
// so the phone gets exactly the values the web renderer uses. Which keys a pack may carry is read from the Kotlin
// side (android/.../pack/ParamSpec.kt), so the two cannot drift apart silently.
//
// Usage:
//   node scripts/export-pack.mjs --id glass-green-1 --name "Glass Green" \
//        --image public/samples/sample-1.png --depth public/samples/sample-1-depth.png \
//        --set glassGreenOn=true --set depth=0.3 --lite brightness=1.15 [--out dir] [--author "Name"]
//   --set  path=json   a studio setting, dotted path into core/params.ts Params (glassGreen.gloss=0.5)
//   --lite key=json    a renderer setting written as is, after the studio mapping (light=[0.95,0.9,0.79])
//   --zip file.pdspack write the pack as one zip file for the phone's IMPORT button (3 files, stored, under 5 MB)
//   --max-side N       shrink both pictures so the long side is at most N px (the phone samples at most 768); also accepts JPEG input
// Output: <out>/<id>/pack.json, subject.png, depth.png (PNG only, the format the loader checks).
import { build } from 'esbuild';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- arguments ----
const args = process.argv.slice(2);
const opt = { set: [], lite: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
  const k = a.slice(2);
  const v = args[++i];
  if (v === undefined) throw new Error(`--${k} needs a value`);
  if (k === 'set' || k === 'lite') opt[k].push(v);
  else opt[k] = v;
}
for (const need of ['id', 'name', 'image', 'depth']) if (!opt[need]) throw new Error(`missing --${need}`);
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(opt.id)) throw new Error('--id must be lowercase letters, digits and dashes (max 64)');
const outRoot = resolve(opt.out ?? join(root, 'android', 'app', 'src', 'main', 'assets', 'packs'));

// ---- the keys the phone understands, from ParamSpec.kt ----
const spec = readFileSync(join(root, 'android', 'app', 'src', 'main', 'java', 'app', 'particledepth', 'wallpaper', 'pack', 'ParamSpec.kt'), 'utf8');
const section = (from, to) => spec.slice(spec.indexOf(from), spec.indexOf(to));
const keysIn = (text, ctor) => [...text.matchAll(new RegExp(`${ctor}\\("([A-Za-z0-9]+)"`, 'g'))].map((m) => m[1]);
const numberKeys = keysIn(section('val numbers', 'val flags'), 'Num');
const flagKeys = keysIn(section('val flags', 'Nested groups'), 'Flag');
const fxKeys = keysIn(section('val fx', 'val emit'), 'Num');
const emitKeys = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'spots', 'scatter', 'lenRand', 'turn'];
const unsupported = new Set([...spec.slice(spec.indexOf('val unsupported')).matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]));

// ---- run the web build's own mapping ----
const tmp = join(tmpdir(), `pds-pack-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `export { toLiteParams } from './src/web/WebEngine';
export { liteDefaults } from './src/lite/LiteEngine';
export { defaults } from './src/core/params';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error',
});
const { toLiteParams, liteDefaults, defaults } = await import(pathToFileURL(tmp).href);
rmSync(tmp, { force: true });

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] === undefined || typeof o[parts[i]] !== 'object') throw new Error(`--set ${path}: no such setting`);
    o = o[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (!(last in o)) throw new Error(`--set ${path}: no such setting`);
  o[last] = value;
}
const parseKV = (kv) => {
  const i = kv.indexOf('=');
  if (i < 1) throw new Error(`expected key=json, got ${kv}`);
  return [kv.slice(0, i), JSON.parse(kv.slice(i + 1))];
};

const studio = structuredClone(defaults);
for (const kv of opt.set) setPath(studio, ...parseKV(kv));
const lite = { ...liteDefaults, ...toLiteParams(studio) };
for (const kv of opt.lite) {
  const [k, v] = parseKV(kv);
  lite[k] = v;
}

// ---- keep only what the phone reads ----
const params = {};
for (const k of numberKeys) if (typeof lite[k] === 'number') params[k] = lite[k];
for (const k of flagKeys) if (typeof lite[k] === 'boolean') params[k] = lite[k];
params.fx = Object.fromEntries(fxKeys.map((k) => [k, lite.fx[k]]));
params.emit = Object.fromEntries(emitKeys.map((k) => [k, lite.emit[k]]));
params.light = lite.light ?? null;
const skipped = Object.keys(lite).filter((k) => !(k in params) && k !== 'fx' && k !== 'emit' && k !== 'light');
const notDrawn = skipped.filter((k) => unsupported.has(k));
const unknown = skipped.filter((k) => !unsupported.has(k));

// ---- assets ----
// Always re-encoded as PNG. With --max-side both pictures shrink by the same factor (the depth map must stay aligned).
async function loadPng(file, scaleTo) {
  let img = sharp(resolve(file));
  const meta = await img.metadata();
  const k = scaleTo ? Math.min(1, scaleTo / Math.max(meta.width, meta.height)) : 1;
  if (k < 1) img = img.resize(Math.round(meta.width * k), Math.round(meta.height * k), { kernel: 'lanczos3' });
  const { data, info } = await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  return { bytes: data, w: info.width, h: info.height };
}
const maxSide = opt['max-side'] ? Number(opt['max-side']) : 0;
const subject = await loadPng(opt.image, maxSide);
const depth = await loadPng(opt.depth, 0);
// the depth map follows the picture's size, whatever its own was
if (depth.w !== subject.w || depth.h !== subject.h) {
  const d = await sharp(depth.bytes).resize(subject.w, subject.h, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  depth.bytes = d.data; depth.w = d.info.width; depth.h = d.info.height;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');

const outDir = join(outRoot, opt.id);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'subject.png'), subject.bytes);
writeFileSync(join(outDir, 'depth.png'), depth.bytes);

const pack = {
  schema: 'pds.effect/1',
  id: opt.id,
  name: opt.name,
  author: opt.author ?? 'Sumanth Reddy',
  minEngine: 1,
  assets: {
    subject: { file: 'subject.png', sha256: sha(subject.bytes), w: subject.w, h: subject.h },
    depth: { file: 'depth.png', sha256: sha(depth.bytes), w: depth.w, h: depth.h },
  },
  params,
};
const json = JSON.stringify(pack, null, 2) + '\n';
if (Buffer.byteLength(json) > 64 * 1024) throw new Error('pack.json would be larger than 64 KB');
writeFileSync(join(outDir, 'pack.json'), json);

if (opt.zip) {
  // PNGs are already compressed, so store them (level 0). The phone reads exactly these three names.
  const files = {
    'pack.json': [new TextEncoder().encode(json), { level: 0 }],
    'subject.png': [new Uint8Array(subject.bytes), { level: 0 }],
    'depth.png': [new Uint8Array(depth.bytes), { level: 0 }],
  };
  const zipped = zipSync(files);
  if (zipped.length > 5 * 1024 * 1024) throw new Error(`the pack is ${(zipped.length / 1048576).toFixed(1)} MB; the phone accepts at most 5 MB. Try a smaller --max-side.`);
  writeFileSync(resolve(opt.zip), zipped);
  console.log(`wrote ${resolve(opt.zip)} (${(zipped.length / 1024).toFixed(0)} KB)`);
}
console.log(`wrote ${outDir}`);
console.log(`  ${Object.keys(params).length} settings, ${Buffer.byteLength(json)} bytes, subject ${subject.w}x${subject.h}`);
if (notDrawn.length) console.log(`  not drawn by the phone yet (left out): ${notDrawn.join(', ')}`);
if (unknown.length) console.log(`  WARNING keys the web renderer has that ParamSpec.kt does not list (left out): ${unknown.join(', ')}`);
