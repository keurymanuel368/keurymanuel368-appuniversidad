/* Rumbo · sincronización en tiempo real y entrada desde Telegram (Mini App).
   Se carga antes que la app. Abre un WebSocket con el servidor; cuando algo cambia
   (desde el bot, otro dispositivo o el EVA), la app vuelve a pedir sus datos sola. */
(function () {
  'use strict';
  var DEV = Math.random().toString(36).slice(2, 10);
  // Marca las peticiones de esta pestaña para no avisarse a sí misma.
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/^\/api\/|\/\/[^/]+\/api\//.test(url) && !/\/api\/live/.test(url)) {
        init = init || {};
        var h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
        h.set('X-Rumbo-Device', DEV);
        init.headers = h;
      }
    } catch (e) {}
    return _fetch.call(this, input, init);
  };

  // ---------- Telegram Mini App ----------
  var hash = location.hash || '', tg = null, go = null;
  var i = hash.indexOf('tgWebAppData=');
  if (i >= 0) {
    var q = new URLSearchParams(hash.slice(i));
    tg = q.get('tgWebAppData');
    try { sessionStorage.setItem('rumbo-tg', tg); } catch (e) {}
    go = new URLSearchParams(location.search).get('go');
    var dest = go === 'llamada' ? '#asistente/llamada' : '#' + (go || hash.slice(1, i).replace(/[&?]$/, '') || 'inicio');
    history.replaceState(null, '', location.pathname + dest);
  } else {
    try { tg = sessionStorage.getItem('rumbo-tg'); } catch (e) {}
  }
  if (tg) {
    document.documentElement.classList.add('in-telegram');
    var s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = function () { try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch (e) {} };
    document.head.appendChild(s);
    _fetch('/api/me', { credentials: 'same-origin' }).then(function (r) {
      if (r.status !== 401) return;
      var tried = false;
      try { tried = sessionStorage.getItem('rumbo-tg-tried') === '1'; sessionStorage.setItem('rumbo-tg-tried', '1'); } catch (e) {}
      if (tried) return;
      return _fetch('/api/telegram/webapp-login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg }) })
        .then(function (r2) { if (r2.ok) location.reload(); else return r2.json().then(function (j) { toast('⚠️ ' + (j.error || 'No pude entrar con Telegram')); }); });
    }).catch(function () {});
  }

  // ---------- Aviso visual ----------
  function toast(text) {
    var el = document.getElementById('rumbo-live-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rumbo-live-toast';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translate(-50%,-140%);z-index:2147483000;background:rgba(11,18,32,.92);color:#fff;font:600 14px Figtree,system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:transform .35s cubic-bezier(.32,.72,0,1);pointer-events:none;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(function () { el.style.transform = 'translate(-50%,0)'; });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.transform = 'translate(-50%,-140%)'; }, 2600);
  }

  // ---------- Tiempo real ----------
  var ws = null, retry = 0, timer = null, pingT = null, last = 0;
  function refresh(src) {
    var now = Date.now();
    if (now - last < 700) return;
    last = now;
    ['rumbo:live', 'rumbo:badges', 'rumbo:grades'].forEach(function (n) { window.dispatchEvent(new Event(n)); });
    if (src === 'telegram') toast('✨ Actualizado desde Telegram');
    else if (src === 'eva') toast('🔄 Rumbo trajo lo nuevo del EVA');
    else if (src && src.indexOf('dev:') === 0) toast('🔄 Actualizado desde otro dispositivo');
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(connect, ms || Math.min(30000, 1000 * Math.pow(2, retry++))); }
  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    if (document.visibilityState === 'hidden') return;
    _fetch('/api/live', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (r.status === 401) return schedule(20000);   // aún sin sesión
      if (r.status === 501) return;                    // servidor sin tiempo real
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live'); } catch (e) { return schedule(); }
      ws.onopen = function () { retry = 0; clearInterval(pingT); pingT = setInterval(function () { try { ws.send('ping'); } catch (e) {} }, 25000); };
      ws.onmessage = function (e) {
        if (e.data === 'pong') return;
        var d; try { d = JSON.parse(e.data); } catch (x) { return; }
        if (d.t === 'change' && d.src !== 'dev:' + DEV) refresh(d.src);
      };
      ws.onclose = function () { clearInterval(pingT); ws = null; schedule(); };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }).catch(function () { schedule(); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { if (!ws || ws.readyState > 1) { retry = 0; connect(); refresh(); } }
  });
  window.addEventListener('online', function () { retry = 0; connect(); });
  if (document.readyState === 'complete') setTimeout(connect, 1200);
  else window.addEventListener('load', function () { setTimeout(connect, 1200); });
})();
