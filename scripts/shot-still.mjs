// Motion-off canvas screenshot of the studio, for tools/analyze/score.py.
//   node scripts/shot-still.mjs out.png [picture.png] [--look=<id>]
// The look is clicked on its real tile. Pan, drift and trails are off so the shot is repeatable.
import { stills } from './lib/still.mjs';

const args = process.argv.slice(2);
const look = args.find((a) => a.startsWith('--look='))?.slice(7);
const [out, pic] = args.filter((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node scripts/shot-still.mjs out.png [picture.png] [--look=<id>]'); process.exit(1); }
await stills([{ out, pic, look }]);
