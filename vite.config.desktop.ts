// The desktop app's web part: the same studio, built with relative paths into desktop/web.
// Electron serves that folder over a local HTTP address, so module workers load (file:// blocks them).
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: './',
  plugins: [glsl()],
  build: {
    target: 'esnext',
    outDir: 'desktop/web',
    emptyOutDir: true,
  },
  worker: {
    format: 'es',
  },
});
