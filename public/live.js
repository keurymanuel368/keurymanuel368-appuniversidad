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
    try { navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage('api-dirty'); } catch (e) {}
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

  // ---------- Pantallas instantáneas ----------
  // 1) Si el service worker trae datos nuevos por detrás, la app se actualiza sola.
  if (navigator.serviceWorker) {
    var updT = null;
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (!e.data || e.data.t !== 'api-updated') return;
      clearTimeout(updT);
      updT = setTimeout(function () { ['rumbo:live', 'rumbo:badges'].forEach(function (n) { window.dispatchEvent(new Event(n)); }); }, 120);
    });
  }
  // 2) Precarga el código de todas las pantallas cuando el teléfono está libre.
  var CHUNKS = ["Ajustes-CkfhSC_A.js", "Asignaturas-DJwgm6xK.js", "Asistente-R2Ozyq9J.js", "Avisos-C9GAlMzK.js", "Ayuda-DY-_y41K.js", "Companeros-BKZsZ3bE.js", "Conectar-CXL3096b.js", "EvaActions-DfZ8lUiQ.js", "Inicio-4x-XlkPP.js", "Pagos-BTTjjIjh.js", "Pensum-DAagws1W.js", "Study-CKDdE0VR.js", "Tareas-xzbs8Pym.js", "VoiceCall-BYapZnlh.js"];
  function preload() {
    CHUNKS.forEach(function (f) {
      if (document.querySelector('link[href="/assets/' + f + '"]')) return;
      var l = document.createElement('link'); l.rel = 'modulepreload'; l.href = '/assets/' + f; document.head.appendChild(l);
    });
  }
  window.addEventListener('load', function () { (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(preload); });

  // ---------- Números que cuentan al aparecer (como en las apps de Apple) ----------
  (function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var SEL = '.stat .value, .ts-index b, .fg-score b, .course .grade, .amount, .gf-score b';
    function run(el) {
      if (el.__rc) return; el.__rc = 1;
      var tn = null;
      for (var i = 0; i < el.childNodes.length; i++) { var n = el.childNodes[i]; if (n.nodeType === 3 && /\d/.test(n.nodeValue)) { tn = n; break; } }
      if (!tn) return;
      var txt = tn.nodeValue, m = txt.match(/^(\s*)(\d+(?:\.\d+)?)(\s*)$/);
      if (!m) return;
      var target = parseFloat(m[2]), dec = (m[2].split('.')[1] || '').length;
      if (!isFinite(target) || target === 0) return;
      var last = null, t0 = 0, D = 450;
      function f(t) {
        if (!t0) t0 = t;
        if (last !== null && tn.nodeValue !== last) return;           // la app cambió el número: se deja
        var p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 4);
        last = m[1] + (target * e).toFixed(dec) + m[3];
        tn.nodeValue = last;
        if (p < 1) requestAnimationFrame(f); else tn.nodeValue = txt;
      }
      requestAnimationFrame(f);
    }
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } });
    }, { threshold: .4 }) : null;
    function scan(root) {
      if (!root.querySelectorAll) return;
      var list = root.matches && root.matches(SEL) ? [root] : [];
      list = list.concat([].slice.call(root.querySelectorAll(SEL)));
      list.forEach(function (el) { if (!el.__rcSeen) { el.__rcSeen = 1; io ? io.observe(el) : run(el); } });
    }
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(scan); }); })
      .observe(document.documentElement, { childList: true, subtree: true });
  })();
})();
