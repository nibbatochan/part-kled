import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import path from 'path';

export default defineConfig({
  plugins: [glsl()],
  build: {
    outDir: 'dist-hero',
    lib: {
      entry: path.resolve(__dirname, 'src/hero.ts'),
      name: 'ParticleHero',
      fileName: () => 'hero.js',
      formats: ['es'],
    },
    rollupOptions: {
      // Keep library standalone or self-contained
    },
  },
});
