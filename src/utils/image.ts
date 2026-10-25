// src/utils/image.ts
export interface ProcessedImage {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  hash: string;
  thumbUrl: string;
  originalBlob: Blob;
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  const blob = file;
  const hash = await computeImageHash(blob);

  // Load image
  const img = new Image();
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  // Resize max 2048 on long edge
  const maxDim = 2048;
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(img, 0, 0, width, height);

  // Thumbnail generation (40x40 square crop)
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 80;
  thumbCanvas.height = 80;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    const s = Math.min(width, height);
    const sx = (width - s) / 2;
    const sy = (height - s) / 2;
    thumbCtx.drawImage(canvas, sx, sy, s, s, 0, 0, 80, 80);
  }
  const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);

  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: file.name,
    canvas,
    width,
    height,
    hash,
    thumbUrl,
    originalBlob: blob,
  };
}

import { computeImageHash } from './hash';
