// Actualización automática de la app web.
// Cada vez que vuelves a abrir Rumbo (y cada 10 min) pregunta si hay una versión nueva publicada.
// Si la hay, recarga sola en un momento tranquilo (sin ventanas abiertas, sin escribir, sin llamada de voz)
// y al volver te avisa con «Rumbo se actualizó ✨».
import { toast } from './components';

declare const __APP_VERSION__: number;
export const APP_VERSION = __APP_VERSION__;

let pending = false;

function quiet(): boolean {
  const a = document.activeElement;
  const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && !!(a as HTMLInputElement).value;
  return !typing && !document.querySelector('.modal, .call, .backdrop');
}

async function check() {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    const v = (await r.json()) as { app: number };
    if (v.app > APP_VERSION) pending = true;
  } catch { /* sin red: se intenta luego */ }
  if (pending) apply();
}

function apply() {
  if (!quiet()) { setTimeout(apply, 15000); return; }
  try { sessionStorage.setItem('rumbo-updated', String(APP_VERSION)); } catch { /* sin almacenamiento */ }
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {}).finally(() => location.reload());
}

export function startUpdater() {
  try {
    if (sessionStorage.getItem('rumbo-updated')) {
      sessionStorage.removeItem('rumbo-updated');
      setTimeout(() => toast('Rumbo se actualizó ✨ Mira las novedades en Avisos'), 1200);
    }
  } catch { /* sin almacenamiento */ }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
  setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 10 * 60 * 1000);
  setTimeout(check, 5000);
}
