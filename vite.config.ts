import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Versión de la app = la más reciente del changelog. La app la compara con /api/version para actualizarse sola.
const APP_VERSION = Number(/version:\s*(\d+)/.exec(readFileSync('src/worker/changelog.ts', 'utf8'))?.[1] || 0);

// theme.css (en public/) va encima de los estilos de la app: se mueve al final del <head>, después del CSS que inyecta Vite.
const themeLast = {
  name: 'rumbo-theme-last',
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string) {
      const tags = ['<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />', '<link rel="stylesheet" href="/theme.css">'];
      for (const t of tags) html = html.replace(`    ${t}\n`, '');
      return html.replace('</head>', `${tags.map((t) => `    ${t}\n`).join('')}  </head>`);
    },
  },
};

export default defineConfig({
  plugins: [react(), themeLast],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
