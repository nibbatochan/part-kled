// scripts/extract-style-inputs.mjs
// Extracts exact GLSL-ready palette stops, lighting vectors, and form thresholds from an image pair
// (Image 1 = source, Image 2 = styled reference).
//
// Usage:
//   node scripts/extract-style-inputs.mjs <source-image> <reference-image>
// Example:
//   node scripts/extract-style-inputs.mjs public/samples/sample-10.png reference.png

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node scripts/extract-style-inputs.mjs <source-image> <reference-image>');
    console.log('Example: node scripts/extract-style-inputs.mjs public/samples/sample-10.png reference.png');
    process.exit(1);
  }

  const srcPath = path.resolve(args[0]);
  const refPath = path.resolve(args[1]);

  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(refPath)) {
    console.error(`Reference file not found: ${refPath}`);
    process.exit(1);
  }

  const srcB64 = fs.readFileSync(srcPath).toString('base64');
  const refB64 = fs.readFileSync(refPath).toString('base64');
  const srcExt = path.extname(srcPath).replace('.', '') || 'png';
  const refExt = path.extname(refPath).replace('.', '') || 'png';

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!DOCTYPE html><html><body><canvas id="c1"></canvas><canvas id="c2"></canvas></body></html>');

  const result = await page.evaluate(async ({ srcB64, refB64, srcExt, refExt }) => {
    const loadImg = (b64, ext) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/${ext};base64,${b64}`;
    });

    const [img1, img2] = await Promise.all([loadImg(srcB64, srcExt), loadImg(refB64, refExt)]);

    // Helper: find non-empty bounding box of an image (non-transparent and non-black)
    const getBBox = (img) => {
      const canvas = document.createElement('canvas');
      const cw = img.width;
      const ch = img.height;
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cw, ch).data;

      let minX = cw, maxX = 0, minY = ch, maxY = 0;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const idx = (y * cw + x) * 4;
          const a = data[idx + 3];
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (a > 25 && lum > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (minX > maxX || minY > maxY) return { x: 0, y: 0, w: cw, h: ch };
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    };

    const bbox1 = getBBox(img1);
    const bbox2 = getBBox(img2);

    const w = 512;
    const h = 512;

    const c1 = document.getElementById('c1');
    c1.width = w; c1.height = h;
    const ctx1 = c1.getContext('2d', { willReadFrequently: true });
    ctx1.drawImage(img1, bbox1.x, bbox1.y, bbox1.w, bbox1.h, 0, 0, w, h);
    const d1 = ctx1.getImageData(0, 0, w, h).data;

    const c2 = document.getElementById('c2');
    c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.drawImage(img2, bbox2.x, bbox2.y, bbox2.w, bbox2.h, 0, 0, w, h);
    const d2 = ctx2.getImageData(0, 0, w, h).data;

    const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

    const tiers = {
      deepShadow: [],
      shadow: [],
      mid: [],
      crest: [],
      glint: [],
    };

    let totalWeight = 0;
    let lightCenterX = 0;
    let lightCenterY = 0;

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const a1 = d1[idx + 3];
      const a2 = d2[idx + 3];
      const r1 = d1[idx], g1 = d1[idx + 1], b1 = d1[idx + 2];
      const lum1 = luma(r1, g1, b1);
      const r2 = d2[idx], g2 = d2[idx + 1], b2 = d2[idx + 2];
      const lum2 = luma(r2, g2, b2);

      // Must be subject pixel in both
      if (a1 < 30 || a2 < 30 || lum1 < 10 || lum2 < 8) continue;

      // Track key light centroid from bright highlights in reference
      if (lum2 > 160) {
        const px = (i % w) / w - 0.5;
        const py = 0.5 - Math.floor(i / w) / h;
        const weight = (lum2 - 160) / 95;
        lightCenterX += px * weight;
        lightCenterY += py * weight;
        totalWeight += weight;
      }

      if (lum1 < 50) tiers.deepShadow.push([r2, g2, b2]);
      else if (lum1 < 105) tiers.shadow.push([r2, g2, b2]);
      else if (lum1 < 175) tiers.mid.push([r2, g2, b2]);
      else if (lum1 < 225) tiers.crest.push([r2, g2, b2]);
      else tiers.glint.push([r2, g2, b2]);
    }

    const medianRgb = (arr, fallback) => {
      if (!arr || arr.length === 0) return fallback;
      const step = Math.max(1, Math.floor(arr.length / 500));
      const sampled = [];
      for (let i = 0; i < arr.length; i += step) sampled.push(arr[i]);
      const med = [0, 1, 2].map((ch) => {
        const sorted = sampled.map((p) => p[ch]).sort((a, b) => a - b);
        return sorted[sorted.length >> 1];
      });
      return med.map((v) => Number((v / 255).toFixed(3)));
    };

    const deepShadow = medianRgb(tiers.deepShadow, [0.02, 0.02, 0.03]);
    const shadowCol  = medianRgb(tiers.shadow, [0.15, 0.15, 0.18]);
    const midCol     = medianRgb(tiers.mid, [0.50, 0.50, 0.52]);
    const crestCol   = medianRgb(tiers.crest, [0.80, 0.80, 0.82]);
    const glintCol   = medianRgb(tiers.glint, [0.95, 0.95, 0.98]);

    let lx = -0.55, ly = 0.55, lz = 0.65;
    if (totalWeight > 0) {
      lx = lightCenterX / totalWeight;
      ly = lightCenterY / totalWeight;
      const len2d = Math.hypot(lx, ly);
      lz = Math.max(0.3, Math.sqrt(Math.max(0, 1.0 - len2d * len2d)));
      const norm = Math.hypot(lx, ly, lz);
      lx = Number((lx / norm).toFixed(3));
      ly = Number((ly / norm).toFixed(3));
      lz = Number((lz / norm).toFixed(3));
    }

    return {
      bbox1,
      bbox2,
      deepShadow,
      shadowCol,
      midCol,
      crestCol,
      glintCol,
      light: [lx, ly, lz]
    };
  }, { srcB64, refB64, srcExt, refExt });

  await browser.close();

  const toVec3 = (arr) => `vec3(${arr[0].toFixed(3)}, ${arr[1].toFixed(3)}, ${arr[2].toFixed(3)})`;

  console.log('\n=== EXTRACTED GLSL CONSTANTS ===\n');
  console.log(`// Source Bounding Box: [${result.bbox1.w}x${result.bbox1.h}], Reference BBox: [${result.bbox2.w}x${result.bbox2.h}]`);
  console.log(`// 5-Tier Chromatic Palette extracted from reference:`);
  console.log(`vec3 deepShadow = ${toVec3(result.deepShadow)};`);
  console.log(`vec3 shadowCol  = ${toVec3(result.shadowCol)};`);
  console.log(`vec3 midCol     = ${toVec3(result.midCol)};`);
  console.log(`vec3 crestCol   = ${toVec3(result.crestCol)};`);
  console.log(`vec3 glintCol   = ${toVec3(result.glintCol)};\n`);

  console.log(`// Calibrated Key Light Direction:`);
  console.log(`vec3 L1 = normalize(${toVec3(result.light)});\n`);

  console.log('=== READY FOR PASTE INTO SHADER ===\n');
}

main().catch(console.error);
