// src/depth/bake.ts
import type { Params } from '../core/params';

export interface HeroPackage {
  subjectBlob: Blob;
  depthBlob: Blob;
  heroJson: string;
  posterBlob: Blob;
}

export async function bakeHeroAssets(
  imageCanvas: HTMLCanvasElement,
  depthCanvas: HTMLCanvasElement,
  stageCanvas: HTMLCanvasElement,
  params: Params,
  focalPoint: { x: number; y: number } = { x: 0.5, y: 0.5 }
): Promise<HeroPackage> {
  // 1. Subject image as WebP
  const subjectBlob = await new Promise<Blob>((resolve) => {
    imageCanvas.toBlob((blob) => resolve(blob || new Blob()), 'image/webp', 0.92);
  });

  // 2. Depth map as PNG
  const depthBlob = await new Promise<Blob>((resolve) => {
    depthCanvas.toBlob((blob) => resolve(blob || new Blob()), 'image/png');
  });

  // 3. Hero config JSON
  const heroConfig = {
    params: {
      drift: params.drift,
      splash: params.splash,
      gather: params.gather,
      depth: params.depth,
      trails: params.trails,
      light: params.light,
      lightOn: params.lightOn,
      line: params.line,
      travel: params.travel,
      background: params.background,
      colorMode: params.colorMode,
    },
    focalPoint,
    exportedAt: new Date().toISOString(),
  };
  const heroJson = JSON.stringify(heroConfig, null, 2);

  // 4. Rendered poster frame as WebP
  const posterBlob = await new Promise<Blob>((resolve) => {
    stageCanvas.toBlob((blob) => resolve(blob || new Blob()), 'image/webp', 0.9);
  });

  return {
    subjectBlob,
    depthBlob,
    heroJson,
    posterBlob,
  };
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
