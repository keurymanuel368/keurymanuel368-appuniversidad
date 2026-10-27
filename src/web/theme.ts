// Tema de la app: automático (según el teléfono), claro u oscuro. Se guarda en este dispositivo.
// El CSS solo mira `data-mode` ("light" | "dark") en <html>.
const stored = () => { try { return localStorage.getItem('rumbo-theme') || 'auto'; } catch { return 'auto'; } };

export function applyTheme(t: string) {
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  // Hay una barra por esquema (claro/oscuro); si eliges el tema a mano, las dos siguen tu elección.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B1220' : '#F3F7FE'));
}

/** Tamaño de letra de toda la app (normal, grande, muy grande). */
export const TEXT_SIZES = [{ id: '1', label: 'Normal' }, { id: '1.1', label: 'Grande' }, { id: '1.22', label: 'Muy grande' }];
export function applyTextSize(z: string) {
  const v = TEXT_SIZES.some((x) => x.id === z) ? z : '1';
  (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = v === '1' ? '' : v;
  document.documentElement.style.setProperty('--zoom', v); // para que las alturas basadas en la pantalla (dvh) cuenten el zoom
}
export const storedTextSize = () => { try { return localStorage.getItem('rumbo-texto') || '1'; } catch { return '1'; } };

export function initTheme() {
  applyTheme(stored());
  applyTextSize(storedTextSize());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (stored() === 'auto') applyTheme('auto'); });
}
