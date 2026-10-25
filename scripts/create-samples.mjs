import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Extract Goku from ref-1.png (center subject, removing the background and streaks)
  const refB64 = fs.readFileSync('docs/reference/ref-1.png').toString('base64');

  await page.setContent(`<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>`);

  const samples = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });

    const c = document.getElementById('c');
    const ctx = c.getContext('2d');

    // Sample 1: Crop and enhance Goku from center of ref-1.png
    // The main Goku figure without the trailing streaks on right is x: 330 to 650, y: 110 to 330 (320x220)
    const gokuW = 600;
    const gokuH = 500;
    c.width = gokuW;
    c.height = gokuH;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, gokuW, gokuH);

    // Draw the source Goku centered in our canvas
    // Source: sx: 330, sy: 110, sw: 330, sh: 225
    ctx.drawImage(img, 330, 110, 330, 225, 60, 40, 480, 420);

    // Clean up pixels: make dark background pitch black
    const imgData = ctx.getImageData(0, 0, gokuW, gokuH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const maxVal = Math.max(r, g, b);
      if (maxVal < 18) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; // Transparent cutout
      } else {
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const s1 = c.toDataURL('image/png');

    // Sample 2: Cybernetic Sacred Geometry / Torus Sculpture
    c.width = 600;
    c.height = 600;
    ctx.clearRect(0, 0, 600, 600);

    const cx = 300, cy = 300;
    // Draw glowing intricate geometric toroid
    for (let i = 0; i < 36; i++) {
      const angle = (i * Math.PI) / 18;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.strokeStyle = `hsl(${180 + i * 4}, 90%, 65%)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(90, 0, 90, 170, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Inner core
    const radGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 90);
    radGrad.addColorStop(0, '#ffffff');
    radGrad.addColorStop(0.4, '#ff9a3c');
    radGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.fill();
    const s2 = c.toDataURL('image/png');

    // Sample 3: Futuristic Neon Mask / Portrait Silhouette
    c.width = 600;
    c.height = 600;
    ctx.clearRect(0, 0, 600, 600);

    ctx.strokeStyle = '#ff4a3d';
    ctx.lineWidth = 2;
    // Draw stylized head/mask contours
    ctx.beginPath();
    // Head shape
    ctx.ellipse(300, 280, 140, 200, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Jaw / cheek lines
    for (let f = -1; f <= 1; f += 2) {
      ctx.beginPath();
      ctx.moveTo(300, 160);
      ctx.bezierCurveTo(300 + f * 180, 200, 300 + f * 160, 380, 300 + f * 50, 450);
      ctx.stroke();

      // Eye rings
      ctx.strokeStyle = '#3fe0b0';
      ctx.beginPath();
      ctx.arc(300 + f * 55, 260, 28, 0, Math.PI * 2);
      ctx.stroke();

      // Cheeks
      ctx.strokeStyle = '#bfe0ff';
      ctx.beginPath();
      ctx.arc(300 + f * 85, 330, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    const s3 = c.toDataURL('image/png');

    return { s1, s2, s3 };
  }, refB64);

  const saveB64 = (dataUrl, filePath) => {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    console.log('Saved:', filePath);
  };

  saveB64(samples.s1, 'public/samples/sample-1.png');
  saveB64(samples.s2, 'public/samples/sample-2.png');
  saveB64(samples.s3, 'public/samples/sample-3.png');

  await browser.close();
}

main().catch(console.error);
