// Build every wallpaper pack of the Android app in one go: node scripts/build-packs.mjs
// One pack = one look from the web studio's dots base, on a sample picture that has a depth map. Pictures are shrunk to
// 768 px on the long side (the phone samples no more than that), so a pack is a few hundred KB.
// To add an effect: add a row here, run this script, run `./gradlew testDebugUnitTest` in android/. No Kotlin changes.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { existsSync } from 'node:fs';
const sample = (n) => ({
  image: ['png', 'jpg'].map((e) => `public/samples/sample-${n}.${e}`).find((f) => existsSync(join(root, f))),
  depth: `public/samples/sample-${n}-depth.png`,
});

// Settings every look pack starts from: some movement, moderate depth, gentle hover turn
const BASE = ['drift=0.3', 'depth=0.4', 'panAmount=0.35'];

const PACKS = [
  { id: 'spike', name: 'Plain dots', pic: 1, set: ['depth=0.3', 'panAmount=0.35', 'drift=0.4'], lite: ['brightness=1.15', 'light=[0.95,0.9,0.79]'] },
  { id: 'glass-green', name: 'Glass Green', pic: 1, set: ['glassGreenOn=true'] },
  { id: 'candy', name: 'Candy', pic: 1, set: ['candyOn=true'] },
  { id: 'shake-mask', name: 'Shake Mask', pic: 1, set: ['shakeOn=true'] },
  { id: 'ecstasy', name: 'Ecstasy', pic: 8, set: ['ecstasyOn=true'] },
  { id: 'chroma-2', name: 'Chroma 2', pic: 8, set: ['chroma2On=true'] },
  { id: 'c-abr', name: 'C-ABR', pic: 8, set: ['cabrOn=true'] },
  { id: 'blood', name: 'Blood', pic: 8, set: ['bloodOn=true'] },
  { id: 'prismatic', name: 'Prismatic', pic: 9, set: ['prismaticOn=true'] },
  { id: 'blight', name: 'Blight', pic: 9, set: ['blightOn=true'] },
  { id: 'convulsions', name: 'Convulsions', pic: 9, set: ['convulsionsOn=true'] },
  { id: 'blend', name: 'Blend', pic: 9, set: ['blendOn=true'] },
  { id: 'aura', name: 'Aura', pic: 9, set: ['auraOn=true', 'aura.glow=1', 'aura.reach=0.9', 'aura.core=0.8', 'aura.tint=0.7'] },
  { id: 'redmet', name: 'Redmet', pic: 10, set: ['redmetOn=true'] },
  { id: 'lined', name: 'Lined', pic: 10, set: ['linedOn=true'] },
  { id: 'softword', name: 'Softword', pic: 10, set: ['softwordOn=true'] },
  { id: 'rock', name: 'Rock', pic: 10, set: ['rockOn=true'] },
  { id: 'arancia', name: 'Arancia', pic: 7, set: ['aranciaOn=true'] },
  { id: 'cumulus', name: 'Cumulus', pic: 7, set: ['cumulusOn=true'] },
];

let failed = 0;
for (const p of PACKS) {
  const s = sample(p.pic);
  const args = [
    join(root, 'scripts', 'export-pack.mjs'),
    '--id', p.id, '--name', p.name, '--image', s.image, '--depth', s.depth, '--max-side', '768',
  ];
  for (const kv of [...(p.set.some((x) => x.startsWith('drift=')) ? [] : BASE.filter((b) => !p.set.some((x) => x.split('=')[0] === b.split('=')[0]))), ...p.set]) args.push('--set', kv);
  for (const kv of p.lite ?? []) args.push('--lite', kv);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  const line = (r.stdout || '').split('\n').find((l) => l.includes('settings,')) ?? '';
  if (r.status !== 0) { failed++; console.error(`FAILED ${p.id}: ${(r.stderr || r.stdout).trim().split('\n').pop()}`); }
  else console.log(`${p.id.padEnd(12)} ${line.trim()}`);
}
console.log(failed ? `${failed} failed` : `${PACKS.length} packs built`);
process.exit(failed ? 1 : 0);
