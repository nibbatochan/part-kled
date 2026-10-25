import { defineConfig } from 'vite';
import path from 'path';

// Lite hero bundle: no three.js, no GLSL plugin (shaders are plain strings in src/lite/shaders.ts).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-hero-lite',
    lib: {
      entry: path.resolve(__dirname, 'src/hero-lite.ts'),
      name: 'ParticleHeroLite',
      fileName: () => 'hero-lite.js',
      formats: ['es'],
    },
    target: 'es2020',
    minify: 'esbuild',
  },
});
