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
    var pr = _fetch.call(this, input, init);
    try {
      // Al marcar una tarea como hecha: una pequeña lluvia de confeti donde tocaste.
      if (/\/api\/tasks\/[^/]+$/.test(url) && init && /PATCH/i.test(init.method || '') && /"status":"done"/.test(String(init.body || ''))) {
        pr.then(function (r) { if (r.ok && window.__rumboBurst) window.__rumboBurst(); });
      }
      if (/\/api\/me(\?|$)/.test(url)) pr.then(function (r) { if (r.ok) r.clone().json().then(function (j) {
        var n = j && j.user && (j.user.name || j.user.login) || '';
        if (n) localStorage.setItem('rumbo-name', n.split(' ')[0]);
      }).catch(function () {}); });
      if (/\/api\/logout/.test(url)) localStorage.removeItem('rumbo-name');
    } catch (e) {}
    return pr;
  };


  // ---------- Pantalla de carga: se va cuando la pantalla ya tiene contenido ----------
  (function () {
    var t0 = Date.now(), SHOW = 120, MIN = 900;
    function ready() {
      var pg = document.querySelector('#root .page');
      if (pg && pg.querySelector('.topbar, h1, .ai-screen') && !pg.querySelector('.sk')) return true;
      return !!document.querySelector('#root .auth-card, #root .login-box, #root .welcome-slide, #root .auth, #root form input[type=password]');
    }
    function hide() {
      var b = document.getElementById('boot'); if (!b) return;
      var shown = Date.now() - t0 - SHOW;
      // Si alcanzó a verse, la dejamos terminar su animación de entrada para que no corte feo.
      var wait = shown <= 0 ? 0 : Math.max(0, MIN - shown);
      setTimeout(function () {
        b.classList.add('done');
        setTimeout(function () { b.classList.add('out'); setTimeout(function () { b.remove(); }, 650); }, shown <= 0 ? 0 : 260);
      }, wait);
    }
    var iv = setInterval(function () { if (ready() || Date.now() - t0 > 12000) { clearInterval(iv); hide(); } }, 50);
  })();

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
      el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translate(-50%,-140%);z-index:2147483000;background:rgba(11,18,32,.92);color:#fff;font:600 14px Figtree,system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:transform .35s cubic-bezier(.32,.72,0,1);pointer-events:none;max-width:min(92vw,420px);text-align:center;line-height:1.35';
      document.body.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(function () { el.style.transform = 'translate(-50%,0)'; });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.transform = 'translate(-50%,-140%)'; }, 2600 + Math.min(2400, text.length * 25));
  }
  window.__rumboToast = toast;

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
  window.__rumboRefresh = function () { last = 0; refresh(); };
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


  // ---------- Interruptor de WhatsApp en Ajustes (un toque para apagar o prender) ----------
  (function () {
    var WA = 'M152.58,145.23l23,11.48A24,24,0,0,1,152,176a72.08,72.08,0,0,1-72-72A24,24,0,0,1,99.29,80.46l11.48,23L101,118a8,8,0,0,0-.73,7.51,56.47,56.47,0,0,0,30.15,30.15A8,8,0,0,0,138,155ZM232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-40,24a8,8,0,0,0-4.42-7.16l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88A40,40,0,0,0,192,152Z';
    function card(on, configured) {
      var d = document.createElement('div');
      d.className = 'card rumbo-wa';
      d.innerHTML = '<div class="rw-row"><span class="rw-ic"><svg viewBox="0 0 256 256"><path d="' + WA + '"/></svg></span>' +
        '<span class="rw-copy"><b>WhatsApp</b><small>' + (configured ? '' : 'Sin conectar todavía · ') + '<span class="rw-state"></span></small></span>' +
        '<button class="rw-switch" role="switch" type="button" aria-label="Avisos por WhatsApp"><i></i></button></div>';
      set(d, on);
      d.querySelector('.rw-switch').addEventListener('click', function () {
        var next = !d.classList.contains('on');
        set(d, next);
        try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
        fetch('/api/wa/toggle', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: next }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { set(d, !!j.on); toast(j.on ? '🟢 WhatsApp activado' : '⚪ WhatsApp en pausa'); })
          .catch(function () { set(d, !next); toast('⚠️ No se pudo cambiar. Revisa tu conexión.'); });
      });
      return d;
    }
    function set(d, on) {
      d.classList.toggle('on', on);
      d.querySelector('.rw-switch').setAttribute('aria-checked', on ? 'true' : 'false');
      d.querySelector('.rw-state').textContent = on ? 'Te aviso también por WhatsApp' : 'En pausa: solo Telegram y notificaciones';
    }
    var busy = false;
    function mount() {
      if (busy || !/^#ajustes/.test(location.hash)) return;
      var page = document.querySelector('.page');
      if (!page) return;
      var head = page.querySelector('.topbar');
      if (!head) return;
      var have = page.querySelector('.rumbo-wa');
      if (have) {
        // Si quedó antes del título, se mueve justo debajo
        if (head.compareDocumentPosition(have) & Node.DOCUMENT_POSITION_PRECEDING) {
          var a0 = head; while (a0.parentElement !== page) a0 = a0.parentElement;
          page.insertBefore(have, a0.nextSibling);
        }
        return;
      }
      busy = true;
      _fetch('/api/wa/status', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        busy = false;
        if (!j || page.querySelector('.rumbo-wa') || !document.contains(page)) return;
        var c = card(j.on, j.configured);
        var anchor = head;
        while (anchor && anchor.parentElement && anchor.parentElement !== page) anchor = anchor.parentElement;
        if (anchor && anchor.parentElement === page) page.insertBefore(c, anchor.nextSibling); else page.prepend(c);
      }).catch(function () { busy = false; });
    }
    new MutationObserver(function () { mount(); }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', function () { setTimeout(mount, 60); });
  })();

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

  // ---------- Vibración suave al tocar (Android) ----------
  (function () {
    if (!navigator.vibrate) return;
    var SEL = '.tabbar button, .seg button, .rw-switch, .toggle, .fab, .check, [class*="check"] button, .btn.primary, .buddy-btn';
    document.addEventListener('pointerdown', function (e) {
      try {
        if (e.pointerType !== 'touch') return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (e.target.closest && e.target.closest(SEL)) navigator.vibrate(7);
      } catch (err) {}
    }, { passive: true, capture: true });
  })();

  // ---------- La mascota se aparta mientras bajas, y vuelve al parar ----------
  (function () {
    var t = null, y = 0, root = document.documentElement;
    window.addEventListener('scroll', function () {
      var ny = window.scrollY;
      if (Math.abs(ny - y) > 4) root.classList.add('rw-scrolling');
      y = ny; clearTimeout(t);
      t = setTimeout(function () { root.classList.remove('rw-scrolling'); }, 700);
    }, { passive: true });
  })();

  // ---------- Tocar la pestaña en la que ya estás te sube arriba (como en iPhone) ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.tabbar button[aria-current="page"], .nav button.active');
    if (b && window.scrollY > 40) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, true);

  // ---------- Confeti al completar una tarea ----------
  (function () {
    var lx = window.innerWidth / 2, ly = window.innerHeight / 2;
    document.addEventListener('pointerdown', function (e) { lx = e.clientX; ly = e.clientY; }, { passive: true, capture: true });
    var COLORS = ['#34C759', '#0A84FF', '#FF9F0A', '#FF375F', '#AF52DE', '#FFD60A'];
    window.__rumboBurst = function () {
      try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
      var box = document.createElement('div'); box.className = 'rw-burst'; box.setAttribute('aria-hidden', 'true');
      box.style.left = lx + 'px'; box.style.top = ly + 'px';
      for (var i = 0; i < 22; i++) {
        var a = (Math.PI * 2 * i) / 22 + Math.random() * 0.4, r = 46 + Math.random() * 60;
        var b = document.createElement('i');
        b.style.setProperty('--tx', Math.cos(a) * r + 'px');
        b.style.setProperty('--ty', Math.sin(a) * r - 30 + 'px');
        b.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
        b.style.setProperty('--c', COLORS[i % COLORS.length]);
        b.style.animationDelay = (Math.random() * 60) + 'ms';
        if (i % 3 === 0) b.className = 'dot';
        box.appendChild(b);
      }
      var ring = document.createElement('u'); box.appendChild(ring);
      document.body.appendChild(box);
      try { navigator.vibrate && navigator.vibrate([8, 40, 12]); } catch (e) {}
      setTimeout(function () { box.remove(); }, 1100);
    };
  })();
})();
