// Service worker: guarda la app en caché (la API siempre va a la red) y muestra las notificaciones.
const CACHE = 'rumbo-v34';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png']))); self.skipWaiting(); });
// Datos de la API guardados (tareas, notas, avisos…) para verlos sin internet.
const API_CACHE = 'rumbo-api-v1';
// Lo que nunca se guarda: cosas en vivo, descargas, voz, IA y sesión.
const NO_CACHE = /^\/api\/(version|backups|tts|widget|calendar|assistant|ai|login|logout|release|me$|health)/;
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
// Al cerrar sesión la app pide borrar los datos guardados.
self.addEventListener('message', (e) => { if (e.data === 'clear-api') e.waitUntil(caches.delete(API_CACHE)); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (NO_CACHE.test(url.pathname)) return;
    // Primero la red; si no hay internet, lo último que se guardó (marcado para que la app lo sepa).
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(API_CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.open(API_CACHE).then((c) => c.match(e.request)).then((r) => {
      if (!r) return new Response(JSON.stringify({ error: 'Sin conexión' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      const h = new Headers(r.headers); h.set('X-Rumbo-Offline', '1');
      return r.blob().then((b) => new Response(b, { status: 200, headers: h }));
    })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

// ----- Notificaciones -----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const actions = [{ action: 'open', title: 'Abrir Rumbo' }];
  if (d.wa) actions.push({ action: 'wa', title: 'Pedir por WhatsApp' });
  // Número en el icono de la app (si el sistema lo soporta).
  if (typeof d.count === 'number' && self.navigator && self.navigator.setAppBadge) {
    (d.count ? self.navigator.setAppBadge(d.count) : self.navigator.clearAppBadge()).catch(function () {});
  }
  e.waitUntil(self.registration.showNotification(d.title || 'Rumbo', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [80, 40, 80],
    data: { url: d.url || '/', wa: d.wa || null },
    actions,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  if (e.action === 'wa' && data.wa) { e.waitUntil(self.clients.openWindow(data.wa)); return; }
  const target = new URL(data.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ('navigate' in w) await w.navigate(target).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
