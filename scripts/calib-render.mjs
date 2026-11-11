// Renders the calibration canvases: the stock source picture drawn with each look, motion off.
//   node scripts/calib-render.mjs   ->  docs/effect-library/calibration/canvas-<look>.png
// Then: python tools/analyze/calib.py sheet
import { stills } from './lib/still.mjs';

const LOOKS = [0, 25, 26, 28, 46, 47, 48, 49]; // plain dots, chrome, prismatic, ecstasy, neon, stipple ink, refract glass, crystal
await stills(LOOKS.map((look) => ({ out: `docs/effect-library/calibration/canvas-${look}.png`, look })));
