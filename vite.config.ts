import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Versión de la app = la más reciente del changelog. La app la compara con /api/version para actualizarse sola.
const APP_VERSION = Number(/version:\s*(\d+)/.exec(readFileSync('src/worker/changelog.ts', 'utf8'))?.[1] || 0);

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
