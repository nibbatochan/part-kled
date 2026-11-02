// scripts/scaffold-effect.mjs
// Automates the 9-file wiring checklist for new surface/material effects in Particle Depth Studio.
// Based on docs/EFFECT_MAKER_RUNBOOK.md and docs/RESEARCH_EFFECT_INPUTS_AND_FIDELITY.md.
//
// Usage:
//   node scripts/scaffold-effect.mjs --name "OBSIDIAN" --category "SURFACE" --controls "gloss,cracks,rim"
// Optional flag:
//   --dry-run (prints planned edits without writing to disk)

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) options.name = args[++i];
    else if (args[i] === '--category' && args[i + 1]) options.category = args[++i];
    else if (args[i] === '--controls' && args[i + 1]) options.controls = args[++i].split(',').map(s => s.trim().toLowerCase());
    else if (args[i] === '--dry-run') options.dryRun = true;
  }
  if (!options.name || !options.category) {
    console.error('Usage: node scripts/scaffold-effect.mjs --name <NAME> --category <CATEGORY> [--controls "<c1>,<c2>,<c3>"] [--dry-run]');
    process.exit(1);
  }
  if (!options.controls || options.controls.length === 0) {
    options.controls = ['gloss', 'rim', 'tone'];
  }
  return options;
}

const opts = parseArgs();
const upperName = opts.name.toUpperCase();
const constName = upperName.replace(/[\s-]+/g, '_');
const camelBase = opts.name.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
const kebabName = opts.name.toLowerCase().replace(/[\s_]+/g, '-');
const filterConst = `${constName}_FILTER`;
const onProp = `${camelBase}On`;
const uniformPrefix = `u${camelBase.charAt(0).toUpperCase() + camelBase.slice(1)}`;

console.log(`\nScaffolding effect: "${upperName}"`);
console.log(`- Filter Const: ${filterConst}`);
console.log(`- Param: ${onProp}`);
console.log(`- Uniform Prefix: ${uniformPrefix}`);
console.log(`- Category: ${opts.category}`);
console.log(`- Controls: ${opts.controls.join(', ')}`);
console.log(`- Mode: ${opts.dryRun ? 'DRY RUN (no disk writes)' : 'APPLYING TO DISK'}\n`);

// 1. Modify src/core/styles.ts
const stylesPath = path.resolve('src/core/styles.ts');
let stylesSrc = fs.readFileSync(stylesPath, 'utf8');

const styleNamesMatch = stylesSrc.match(/export const STYLE_NAMES = \[([^\]]+)\]/);
if (!styleNamesMatch) throw new Error('Cannot find STYLE_NAMES in styles.ts');
const rawNames = styleNamesMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
const slot = rawNames.length;
console.log(`Next free slot: ${slot}`);

if (rawNames.includes(upperName)) {
  console.log(`Effect "${upperName}" already exists in STYLE_NAMES at slot ${rawNames.indexOf(upperName)}. Aborting.`);
  process.exit(0);
}

stylesSrc = stylesSrc.replace(
  /export const STYLE_NAMES = \[([^\]]+)\] as const;/,
  (match, p1) => `export const STYLE_NAMES = [${p1.trim()}, '${upperName}'] as const;`
);

const catRegex = new RegExp(`({ name: '${opts.category}', looks: \\[)([^\\]]+)(\\] })`);
stylesSrc = stylesSrc.replace(catRegex, (m, p1, p2, p3) => `${p1}${p2}, ${slot}${p3}`);

const constDef = `\n/** The ${upperName} tile is a filter on the dots, in ${opts.category}. */\nexport const ${filterConst} = ${slot};\n`;
const titleDef = `  ${slot}: '${upperName.charAt(0) + upperName.slice(1).toLowerCase()} filter: procedural material on the dots base',\n`;

const lastConstMatch = stylesSrc.match(/export const [A-Z0-9_]+_FILTER = \d+;/g);
if (lastConstMatch) {
  const lastConst = lastConstMatch[lastConstMatch.length - 1];
  stylesSrc = stylesSrc.replace(lastConst, lastConst + constDef);
}

stylesSrc = stylesSrc.replace(/(export const LOOK_TITLES: Record<number, string> = {\n)/, `$1${titleDef}`);

if (!opts.dryRun) fs.writeFileSync(stylesPath, stylesSrc, 'utf8');
console.log(`[1/9] Updated ${stylesPath}`);

// 2. Modify src/core/params.ts
const paramsPath = path.resolve('src/core/params.ts');
let paramsSrc = fs.readFileSync(paramsPath, 'utf8');

const ctrlTypeFields = opts.controls.map(c => `${c}: number;`).join(' ');
const ctrlDefaultFields = opts.controls.map(c => `${c}: 0.5,`).join(' ');

// Add to Params interface
paramsSrc = paramsSrc.replace(
  /(export interface Params {[\s\S]*?)(\n  \/\*)/,
  `$1\n  ${onProp}: boolean;\n  ${camelBase}: { ${ctrlTypeFields} };$2`
);

// Add to defaultParams
paramsSrc = paramsSrc.replace(
  /(export const defaultParams: Params = {[\s\S]*?)(\n  \/\*)/,
  `$1\n  ${onProp}: false,\n  ${camelBase}: { ${ctrlDefaultFields} },$2`
);

// Add to reset block
paramsSrc = paramsSrc.replace(
  /(\n    chroma2On: false,)/,
  `$1\n    ${onProp}: false,`
);

if (!opts.dryRun) fs.writeFileSync(paramsPath, paramsSrc, 'utf8');
console.log(`[2/9] Updated ${paramsPath}`);

// 3. Modify src/lite/LiteEngine.ts
const litePath = path.resolve('src/lite/LiteEngine.ts');
let liteSrc = fs.readFileSync(litePath, 'utf8');

const liteCtrlTypes = opts.controls.map(c => `${camelBase}${c.charAt(0).toUpperCase() + c.slice(1)}: number;`).join(' ');
const liteCtrlDefaults = opts.controls.map(c => `${camelBase}${c.charAt(0).toUpperCase() + c.slice(1)}: 0.5,`).join(' ');

liteSrc = liteSrc.replace(
  /(export interface LiteParams {[\s\S]*?)(\n  \/\*)/,
  `$1\n  ${onProp}: boolean;\n  ${liteCtrlTypes}$2`
);

liteSrc = liteSrc.replace(
  /(export const defaultLiteParams: LiteParams = {[\s\S]*?)(\n  \/\*)/,
  `$1\n  ${onProp}: false,\n  ${liteCtrlDefaults}$2`
);

const uniformNames = [`'${uniformPrefix}On'`, ...opts.controls.map(c => `'${uniformPrefix}${c.charAt(0).toUpperCase() + c.slice(1)}'`)];
liteSrc = liteSrc.replace(
  /('uC2On', 'uC2Rim', 'uC2Spec', 'uC2Bevel',)/,
  `$1 ${uniformNames.join(', ')},`
);

const uniformSetters = [
  `      gl.uniform1f(U.${uniformPrefix}On, p.${onProp} && p.style === 0 ? 1 : 0);`,
  ...opts.controls.map(c => `      gl.uniform1f(U.${uniformPrefix}${c.charAt(0).toUpperCase() + c.slice(1)}, p.${camelBase}${c.charAt(0).toUpperCase() + c.slice(1)});`)
].join('\n');

liteSrc = liteSrc.replace(
  /(gl\.uniform1f\(U\.uC2Bevel, p\.chroma2Bevel\);)/,
  `$1\n${uniformSetters}`
);

if (!opts.dryRun) fs.writeFileSync(litePath, liteSrc, 'utf8');
console.log(`[3/9] Updated ${litePath}`);

// 4. Modify src/web/WebEngine.ts
const webPath = path.resolve('src/web/WebEngine.ts');
let webSrc = fs.readFileSync(webPath, 'utf8');

const webMappings = [
  `    ${onProp}: p.${onProp},`,
  ...opts.controls.map(c => {
    const prop = `${camelBase}${c.charAt(0).toUpperCase() + c.slice(1)}`;
    return `    ${prop}: p.${camelBase}.${c},`;
  })
].join('\n');

webSrc = webSrc.replace(
  /(chroma2On: p\.chroma2On,)/,
  `$1\n${webMappings}`
);

if (!opts.dryRun) fs.writeFileSync(webPath, webSrc, 'utf8');
console.log(`[4/9] Updated ${webPath}`);

// 5. Modify src/lite/shaders.ts
const shadersPath = path.resolve('src/lite/shaders.ts');
let shadersSrc = fs.readFileSync(shadersPath, 'utf8');

const uniformDecls = [
  `uniform float ${uniformPrefix}On;`,
  ...opts.controls.map(c => `uniform float ${uniformPrefix}${c.charAt(0).toUpperCase() + c.slice(1)};`)
].join('\n');

shadersSrc = shadersSrc.replace(
  /(uniform float uC2Bevel;[^\n]*\n)/,
  `$1${uniformDecls}\n`
);

const finishFn = `
// ${upperName}: procedural surface filter on the dots base.
vec3 ${camelBase}Finish(vec2 h, vec3 c) {
  if (uHasImg < 0.5) return c;
  vec2 uv = vec2(h.x / (uHalfW * 2.0) + 0.5, 0.5 - h.y);
  vec2 e = 4.0 / uTexSize;
  vec2 f = 10.0 / uTexSize;
  float dx = luma(textureLod(uImg, uv + vec2(e.x, 0.0), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(e.x, 0.0), 2.0).rgb);
  float dy = luma(textureLod(uImg, uv + vec2(0.0, e.y), 2.0).rgb) - luma(textureLod(uImg, uv - vec2(0.0, e.y), 2.0).rgb);
  float zx = textureLod(uImg, uv + vec2(f.x, 0.0), 2.0).a - textureLod(uImg, uv - vec2(f.x, 0.0), 2.0).a;
  float zy = textureLod(uImg, uv + vec2(0.0, f.y), 2.0).a - textureLod(uImg, uv - vec2(0.0, f.y), 2.0).a;
  float lum = luma(c);
  float present = smoothstep(0.012, 0.07, max(c.r, max(c.g, c.b)));
  vec3 n = normalize(vec3(-(dx + zx * 2.5) * 8.0, (dy + zy * 2.5) * 8.0, 1.0));
  vec3 L1 = normalize(vec3(-0.55, 0.55, 0.65));
  float lit = clamp((dot(n, L1) - 0.4) * 3.0, 0.0, 1.0);
  vec3 body = c * (0.3 + 0.7 * lit);
  return clamp(body * present, 0.0, 1.0);
}
`;

shadersSrc = shadersSrc.replace(
  /(vec3 rockFinish\(vec2 h, vec3 c\) {[\s\S]*?return clamp\(stone, 0.0, 1.0\) \* present;\n})/,
  `$1\n${finishFn}`
);

shadersSrc = shadersSrc.replace(
  /(if \(uC2On > 0\.5\) c = mix\(c, chroma2Finish\(home\.xy, c\), 1\.0 - streaming\);)/,
  `$1\n  if (${uniformPrefix}On > 0.5) c = mix(c, ${camelBase}Finish(home.xy, c), 1.0 - streaming);`
);

if (!opts.dryRun) fs.writeFileSync(shadersPath, shadersSrc, 'utf8');
console.log(`[5/9] Updated ${shadersPath}`);

// 6. Modify src/ui/Panel.ts
const panelPath = path.resolve('src/ui/Panel.ts');
let panelSrc = fs.readFileSync(panelPath, 'utf8');

panelSrc = panelSrc.replace(
  /(import {[^}]*?CHROMA2_FILTER)([^}]*?} from '\.\.\/core\/styles';)/,
  `$1, ${filterConst}$2`
);

panelSrc = panelSrc.replace(
  /(\|\| look === CHROMA2_FILTER)/,
  `$1 || look === ${filterConst}`
);

panelSrc = panelSrc.replace(
  /(: look === CHROMA2_FILTER \? this\.params\.chroma2On)/,
  `$1 : look === ${filterConst} ? this.params.${onProp}`
);

panelSrc = panelSrc.replace(
  /(this\.params\.chroma2On = look === CHROMA2_FILTER;)/,
  `$1\n    this.params.${onProp} = look === ${filterConst};`
);

const panelSyncBox = `    const ${camelBase}Box = document.getElementById('${kebabName}-settings');\n    if (${camelBase}Box) ${camelBase}Box.hidden = !this.params.${onProp};`;
panelSrc = panelSrc.replace(
  /(const chroma2Box = document\.getElementById\('chroma2-settings'\);[\s\S]*?if \(chroma2Box\) chroma2Box\.hidden = !this\.params\.chroma2On;)/,
  `$1\n${panelSyncBox}`
);

panelSrc = panelSrc.replace(
  /(\|\| this\.params\.chroma2On)/,
  `$1 || this.params.${onProp}`
);

panelSrc = panelSrc.replace(
  /(: look === CHROMA2_FILTER \? this\.params\.chroma2On)/,
  `$1\n        : look === ${filterConst} ? this.params.${onProp}`
);

if (!opts.dryRun) fs.writeFileSync(panelPath, panelSrc, 'utf8');
console.log(`[6/9] Updated ${panelPath}`);

// 7. Modify src/ui/LookPicker.ts
const pickerPath = path.resolve('src/ui/LookPicker.ts');
let pickerSrc = fs.readFileSync(pickerPath, 'utf8');

pickerSrc = pickerSrc.replace(
  /(import {[^}]*?CHROMA2_FILTER)([^}]*?} from '\.\.\/core\/styles';)/,
  `$1, ${filterConst}$2`
);

pickerSrc = pickerSrc.replace(
  /(&& look !== CHROMA2_FILTER)/,
  `$1 && look !== ${filterConst}`
);

pickerSrc = pickerSrc.replace(
  /(chroma2On: false,)/,
  `$1 ${onProp}: false,`
);

const pickerTile = `      const ${camelBase}Btn = document.querySelector<HTMLButtonElement>('#style-grid [data-style="${filterConst}"]');\n      if (${camelBase}Btn) tile(${camelBase}Btn, { ...params, style: 0, ...off, ${onProp}: true });`;
pickerSrc = pickerSrc.replace(
  /(if \(chroma2Btn\) tile\(chroma2Btn, { \.\.\.params, style: 0, \.\.\.off, chroma2On: true }\);)/,
  `$1\n${pickerTile}`
);

if (!opts.dryRun) fs.writeFileSync(pickerPath, pickerSrc, 'utf8');
console.log(`[7/9] Updated ${pickerPath}`);

// 8. Modify index.html
const indexPath = path.resolve('index.html');
let indexSrc = fs.readFileSync(indexPath, 'utf8');

const sliderPairs = [];
for (let i = 0; i < opts.controls.length; i += 2) {
  const c1 = opts.controls[i];
  const c2 = opts.controls[i + 1];
  const g1 = `
              <div class="slider-group">
                <label for="sl-${kebabName}-${c1}">${c1.toUpperCase()}</label>
                <input type="range" id="sl-${kebabName}-${c1}" data-path="${camelBase}.${c1}" min="0" max="1" step="0.01" />
                <output></output>
              </div>`;
  const g2 = c2 ? `
              <div class="slider-group">
                <label for="sl-${kebabName}-${c2}">${c2.toUpperCase()}</label>
                <input type="range" id="sl-${kebabName}-${c2}" data-path="${camelBase}.${c2}" min="0" max="1" step="0.01" />
                <output></output>
              </div>` : '';
  sliderPairs.push(`            <div class="pair">${g1}${g2}\n            </div>`);
}

const htmlBlock = `
          <div id="${kebabName}-settings" hidden>
${sliderPairs.join('\n')}
          </div>`;

indexSrc = indexSrc.replace(
  /(<div id="rock-settings" hidden>[\s\S]*?<\/div>\s*<\/div>)/,
  `$1\n${htmlBlock}`
);

if (!opts.dryRun) fs.writeFileSync(indexPath, indexSrc, 'utf8');
console.log(`[8/9] Updated ${indexPath}`);

// 9. Modify src/ui/ExportPanel.ts
const exportPath = path.resolve('src/ui/ExportPanel.ts');
let exportSrc = fs.readFileSync(exportPath, 'utf8');
exportSrc = exportSrc.replace(
  /(export const STYLE_NAMES = \[[\s\S]*?)(\];)/,
  (m, p1, p2) => `${p1.trim().replace(/,$/, '')}, '${upperName.toLowerCase()}'${p2}`
);
if (!opts.dryRun) fs.writeFileSync(exportPath, exportSrc, 'utf8');
console.log(`[9/9] Updated ${exportPath}`);

console.log(`\nAll 9 files wired successfully!`);
console.log(`Next step: Open src/lite/shaders.ts and paste extracted palette constants into ${camelBase}Finish().\n`);
