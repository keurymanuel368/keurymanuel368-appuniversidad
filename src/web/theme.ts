// Tema de la app: automático (según el teléfono), claro u oscuro. Se guarda en este dispositivo.
// El CSS solo mira `data-mode` ("light" | "dark") en <html>.
const stored = () => { try { return localStorage.getItem('rumbo-theme') || 'auto'; } catch { return 'auto'; } };

export function applyTheme(t: string) {
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1220' : '#F3F7FE');
}

export function initTheme() {
  applyTheme(stored());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (stored() === 'auto') applyTheme('auto'); });
}
