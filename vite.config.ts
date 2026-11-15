import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';

// Solo desarrollo: si existe .env.dev.local (no se sube a git) entra solo en la API de pruebas y reutiliza la sesión.
let devCookie = '';
const devEnv: Record<string, string> = {};
if (existsSync('.env.dev.local')) for (const l of readFileSync('.env.dev.local', 'utf8').split(/\r?\n/)) { const m = /^(\w+)=(.*)$/.exec(l); if (m) devEnv[m[1]] = m[2]; }
const devLogin = {
  name: 'rumbo-dev-login',
  async configureServer() {
    const t = process.env.API_TARGET;
    if (!t || !devEnv.DEV_PASSWORD) return;
    try {
      const r = await fetch(`${t}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: devEnv.DEV_LOGIN, password: devEnv.DEV_PASSWORD }) });
      const c = r.headers.get('set-cookie');
      if (c) devCookie = c.split(';')[0];
    } catch {}
  },
};

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
  plugins: [react(), themeLast, devLogin],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:8787', changeOrigin: true, secure: true, configure: (proxy: any) => proxy.on('proxyReq', (req: any) => { if (devCookie) req.setHeader('cookie', devCookie); }) } } },
});
