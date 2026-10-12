import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the static build works on any host path (e.g. GitHub Pages).
  base: './',
  // Havok ships a .wasm next to its JS; pre-bundling breaks the wasm URL lookup.
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
  build: {
    // Babylon core is large by nature; the game ships as one main chunk for now.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
