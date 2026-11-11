// The effect gate: draw a look in the studio, score the canvas against the reference, and against the ceiling.
//   node scripts/score-look.mjs <reference.png> --look=<id> [--source=<picture.png>] [--unpaired] [--out=<dir>]
// --source: the picture the look is applied to (default: the reference itself, so it is a paired test).
// Ceiling B_max = the reference drawn as plain dots. Output: Score B, B_max, ratio, verdict (all uncalibrated).
import { stills } from './lib/still.mjs';
import { spawnSync } from 'child_process';
import path from 'path';

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [reference] = args.filter((a) => !a.startsWith('--'));
const look = opt('look');
if (!reference || look === undefined) { console.error('usage: node scripts/score-look.mjs <reference.png> --look=<id> [--source=<picture.png>] [--unpaired] [--out=<dir>]'); process.exit(1); }
const dir = opt('out') ?? 'scratch/score-look';
const source = opt('source') ?? reference;
const canvas = path.join(dir, `look-${look}.png`);
const ceiling = path.join(dir, 'ceiling.png');

await stills([{ out: canvas, pic: source, look }, { out: ceiling, pic: reference, look: 0 }]);
const r = spawnSync('python', ['tools/analyze/gate.py', reference, canvas, ceiling, ...(args.includes('--unpaired') ? ['--unpaired'] : [])], { stdio: 'inherit' });
console.log(`canvas: ${canvas}\nceiling: ${ceiling}`);
process.exit(r.status ?? 1);
