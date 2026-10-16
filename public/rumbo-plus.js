/* Rumbo+ · funciones extra encima de la app
   - Mantener presionada una tarea: menú rápido.        - Deslizar a la izquierda: posponer.
   - Buscador con acciones ("nueva tarea", "sincronizar", "modo oscuro"…).
   - Tarjeta "Tu día" en Inicio con botón Empezar (modo enfoque).
   - Índice antes/después en la tarjeta de nota nueva.
   - Apariencia: color de acento, ícono de la app, mascota solo en Inicio.
   - Resumen de la semana tipo historia.                - Barra de carga por día en Plan.
   - Logo animado en la pantalla de entrada. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var toast = function (t) { try { window.__rumboToast ? window.__rumboToast(t) : console.log(t); } catch (e) {} };
  var refresh = function () { try { window.__rumboRefresh && window.__rumboRefresh(); } catch (e) {} };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch('/api' + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'No se pudo completar.'); return j; });
    });
  }
  function route() { return (location.hash.replace('#', '').split(/[/?&]/)[0]) || 'inicio'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function vib(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  var reduced = false; try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Íconos (Phosphor, licencia MIT)
  var IC = {
    check: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
    clock: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z',
    play: 'M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z',
    link: 'M137.54,186.36a8,8,0,0,1,0,11.31l-9.94,10A56,56,0,0,1,48.38,128.4L72.5,104.28A56,56,0,0,1,149.31,102a8,8,0,1,1-10.64,12,40,40,0,0,0-54.85,1.63L59.7,139.72a40,40,0,0,0,56.58,56.58l9.94-9.94A8,8,0,0,1,137.54,186.36Zm70.08-138a56.08,56.08,0,0,0-79.22,0l-9.94,9.95a8,8,0,0,0,11.32,11.31l9.94-9.94a40,40,0,0,1,56.58,56.58L172.18,140.4A40,40,0,0,1,117.33,142,8,8,0,1,0,106.69,154a56,56,0,0,0,76.81-2.26l24.12-24.12A56.08,56.08,0,0,0,207.62,48.38Z',
    sparkle: 'M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119A8,8,0,0,0,137,123.78L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z',
    info: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z',
    undo: 'M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z',
    x: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    cal: 'M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z',
    search: 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
    plus: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z',
    sync: 'M197.67,186.37a8,8,0,0,1,0,11.29C196.58,198.73,170.82,224,128,224c-37.39,0-64.53-22.4-80-39.85V208a8,8,0,0,1-16,0V160a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H55.44C67.76,183.35,93,208,128,208c36,0,58.14-21.46,58.36-21.68A8,8,0,0,1,197.67,186.37ZM216,40a8,8,0,0,0-8,8V71.85C192.53,54.4,165.39,32,128,32,85.18,32,59.42,57.27,58.34,58.34a8,8,0,0,0,11.3,11.34C69.86,69.46,92,48,128,48c35,0,60.24,24.65,72.56,40H168a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V48A8,8,0,0,0,216,40Z',
    moon: 'M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z',
    arrow: 'M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z',
    phone: 'M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06l0-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46ZM176,208A128.14,128.14,0,0,1,48,80,40.2,40.2,0,0,1,82.87,40a.61.61,0,0,0,0,.12l21,47L83.2,111.86a6.13,6.13,0,0,0-.57.77,16,16,0,0,0-1,15.7c9.06,18.53,27.73,37.06,46.46,46.11a16,16,0,0,0,15.75-1.14,8.44,8.44,0,0,0,.74-.56L168.89,152l47,21.05h0s.08,0,.11,0A40.21,40.21,0,0,1,176,208Z'
  ,
    f_calendar: 'M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,48H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24Z',
    f_tasks: 'M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm-34.34,77.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z',
    f_trend: 'M240,56v64a8,8,0,0,1-13.66,5.66L200,99.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31,29.66,189.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0L136,140.69,188.69,88,162.34,61.66A8,8,0,0,1,168,48h64A8,8,0,0,1,240,56Z',
    f_spark: 'M208,144a15.78,15.78,0,0,1-10.42,14.94L146,178l-19,51.62a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88L78,110l19-51.62a15.92,15.92,0,0,1,29.88,0L146,110l51.62,19A15.78,15.78,0,0,1,208,144ZM152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z',
    f_compass: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm51.58,57.79-32,64a4.08,4.08,0,0,1-1.79,1.79l-64,32a4,4,0,0,1-5.37-5.37l32-64a4.08,4.08,0,0,1,1.79-1.79l64-32A4,4,0,0,1,179.58,81.79Z',
    f_alert: 'M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z',
    f_clock: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm56,112H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z'
  };
  function big(name) { return '<div class="rw-st-icon">' + ic(name, 44) + '</div>'; }
  function ic(name, size) { return '<svg class="rw-i" viewBox="0 0 256 256" style="width:' + (size || 20) + 'px;height:' + (size || 20) + 'px" aria-hidden="true"><path fill="currentColor" d="' + IC[name] + '"/></svg>'; }

  // ---------- Hoja de acciones (estilo iPhone) ----------
  function actionSheet(opt) {
    closeSheet();
    var bd = h('<div class="rw-backdrop" role="presentation"></div>');
    var sh = h('<div class="rw-sheet" role="dialog" aria-modal="true"></div>');
    var head = '<div class="rw-sheet-head">' + (opt.color ? '<i style="background:' + esc(opt.color) + '"></i>' : '') + '<div><b>' + esc(opt.title) + '</b>' + (opt.sub ? '<small>' + esc(opt.sub) + '</small>' : '') + '</div></div>';
    var list = '<div class="rw-sheet-group">' + head + opt.actions.map(function (a, i) {
      return '<button type="button" class="rw-sheet-btn ' + (a.tone || '') + '" data-i="' + i + '"><span class="rw-sheet-ic ' + (a.tone || '') + '">' + ic(a.icon, 19) + '</span><span>' + esc(a.label) + (a.hint ? '<small>' + esc(a.hint) + '</small>' : '') + '</span></button>';
    }).join('') + '</div><button type="button" class="rw-sheet-cancel">Cancelar</button>';
    sh.innerHTML = list;
    document.body.appendChild(bd); document.body.appendChild(sh);
    requestAnimationFrame(function () { bd.classList.add('on'); sh.classList.add('on'); });
    // No acepta toques hasta que sueltes el dedo del toque largo (evita cerrarlo o elegir algo sin querer).
    var armed = false, arm = function () { setTimeout(function () { armed = true; }, 90); };
    document.addEventListener('touchend', arm, { once: true, capture: true });
    document.addEventListener('mouseup', arm, { once: true, capture: true });
    setTimeout(function () { armed = true; }, 1500);
    var guard = function (fn) { return function (e) { if (!armed) { e.preventDefault(); e.stopPropagation(); return; } fn(e); }; };
    var close = guard(function () { closeSheet(); });
    bd.addEventListener('click', close);
    $('.rw-sheet-cancel', sh).addEventListener('click', close);
    $$('.rw-sheet-btn', sh).forEach(function (b) {
      b.addEventListener('click', guard(function () { var a = opt.actions[Number(b.dataset.i)]; closeSheet(); setTimeout(function () { a.run(); }, 120); }));
    });
    var y0 = null;
    sh.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchmove', function (e) { if (y0 === null) return; var dy = e.touches[0].clientY - y0; if (dy > 0) { sh.style.transition = 'none'; sh.style.transform = 'translateY(' + dy + 'px)'; } }, { passive: true });
    sh.addEventListener('touchend', function (e) { if (y0 === null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null; sh.style.transition = ''; if (dy > 90) closeSheet(); else sh.style.transform = ''; });
    document.addEventListener('keydown', escClose, true);
  }
  function escClose(e) { if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); } }
  function closeSheet() {
    document.removeEventListener('keydown', escClose, true);
    $$('.rw-backdrop, .rw-sheet').forEach(function (el) { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 380); });
  }

  // ---------- Acciones sobre tareas ----------
  function markDone(t, done) {
    return api('/tasks/' + t.id, { method: 'PATCH', body: { status: done ? 'done' : 'pending' } }).then(function () {
      toast(done ? '¡Bien hecho! Tarea completada' : 'La tarea volvió a pendientes');
      window.dispatchEvent(new Event('rumbo:badges')); refresh();
    }).catch(function (e) { toast(e.message); });
  }
  function postpone(t) {
    return api('/tasks/' + t.id + '/postpone', { method: 'POST' }).then(function (j) {
      vib(10); toast(j.message || 'Pospuesta'); refresh();
    }).catch(function (e) { toast(e.message); });
  }
  function startFocus(t) {
    location.hash = '#tareas/' + t.id;
    var tries = 0;
    (function look() {
      var b = $$('.modal button').filter(function (x) { return /Modo enfoque/.test(x.textContent); })[0];
      if (b) { b.click(); return; }
      if (++tries < 40) setTimeout(look, 100);
    })();
  }
  function ask(text) {
    try { sessionStorage.setItem('rumbo-ask', text); } catch (e) {}
    location.hash = '#asistente';
  }
  function fillAsk() {
    var t; try { t = sessionStorage.getItem('rumbo-ask'); } catch (e) {}
    if (!t || route() !== 'asistente') return;
    var el = $('#msg'); if (!el) return;
    try { sessionStorage.removeItem('rumbo-ask'); } catch (e) {}
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, t); el.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(function () { el.focus(); }, 60);
  }
  function taskMenu(t) {
    var done = t.status === 'done';
    var course = t.course_short || t.course_name || 'Personal';
    var acts = [];
    if (!done) acts.push({ icon: 'check', label: 'Ya la entregué', tone: 'green', run: function () { markDone(t, true); } });
    else acts.push({ icon: 'undo', label: 'Marcar como pendiente', run: function () { markDone(t, false); } });
    if (!done) acts.push({ icon: 'clock', label: 'Posponer a mañana', hint: t.source === 'eva' ? 'Te la recuerdo mañana a las 8' : 'Cambia la fecha un día', tone: 'orange', run: function () { postpone(t); } });
    if (!done) acts.push({ icon: 'play', label: 'Empezar en modo enfoque', tone: 'blue', run: function () { startFocus(t); } });
    if (t.url) acts.push({ icon: 'link', label: 'Abrir en el EVA', run: function () { window.open(t.url, '_blank', 'noopener'); } });
    acts.push({ icon: 'sparkle', label: 'Preguntarle a Rumbo', tone: 'violet', run: function () { ask('Ayúdame con «' + t.title + '» de ' + course + '. ¿Qué me piden y por dónde empiezo?'); } });
    acts.push({ icon: 'info', label: 'Ver detalles', run: function () { location.hash = '#tareas/' + t.id; } });
    actionSheet({ title: t.title, sub: course + (t.due_at ? ' · ' + whenText(t.due_at) : ''), color: t.course_color, actions: acts });
  }
  window.addEventListener('rumbo:taskmenu', function (e) { if (e.detail) taskMenu(e.detail); });
  window.addEventListener('rumbo:postpone', function (e) { if (e.detail) postpone(e.detail); });

  function whenText(sec) {
    var d = new Date(sec * 1000), now = new Date();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((day - today) / 864e5);
    var hm = d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
    if (diff === 0) return 'hoy ' + hm;
    if (diff === 1) return 'mañana ' + hm;
    if (diff === -1) return 'ayer ' + hm;
    if (diff > 1 && diff < 7) return d.toLocaleDateString('es-DO', { weekday: 'long' }) + ' ' + hm;
    return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
  }

  // ---------- Datos compartidos (con caché corta) ----------
  var cache = {};
  function cached(path, ms) {
    var c = cache[path];
    if (c && Date.now() - c.at < ms) return c.p;
    var p = api(path).catch(function () { return null; });
    cache[path] = { at: Date.now(), p: p };
    return p;
  }
  window.addEventListener('rumbo:live', function () { cache = {}; setTimeout(schedule, 400); });

  // ---------- Buscador con acciones ----------
  function goto(r) { location.hash = '#' + r; }
  function setTheme(mode) {
    store.set('rumbo-theme', mode);
    if (mode === 'dark') document.documentElement.setAttribute('data-mode', 'dark'); else document.documentElement.removeAttribute('data-mode');
    toast(mode === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado');
  }
  function clickTopbar(re) {
    var tries = 0;
    (function look() {
      var b = $$('.topbar-actions button, .btn').filter(function (x) { return re.test(x.textContent) || re.test(x.getAttribute('aria-label') || ''); })[0];
      if (b) b.click(); else if (++tries < 30) setTimeout(look, 100);
    })();
  }
  var COMMANDS = [
    { k: 'nueva tarea agregar tarea crear tarea anadir', label: 'Nueva tarea', sub: 'Agrega algo que tengas que hacer', icon: 'plus', run: function () { goto('tareas'); setTimeout(function () { clickTopbar(/^\s*(Nueva|\+)?\s*$|Nueva tarea|Agregar tarea/); }, 250); } },
    { k: 'sincronizar eva actualizar traer', label: 'Sincronizar con el EVA', sub: 'Trae tareas, notas y avisos nuevos', icon: 'sync', run: function () { toast('Sincronizando con el EVA…'); api('/sync', { method: 'POST' }).then(function () { toast('EVA al día'); refresh(); }).catch(function (e) { toast(e.message); }); } },
    { k: 'resumen semana historia como me fue', label: 'Resumen de mi semana', sub: 'Tus entregas, notas y racha', icon: 'cal', run: function () { openStory(); } },
    { k: 'enfoque concentrar empezar estudiar pomodoro', label: 'Empezar modo enfoque', sub: 'Con tu tarea más urgente', icon: 'play', run: function () { cached('/tasks?status=pending', 20000).then(function (l) { var t = pickUrgent(l || []); if (t) startFocus(t); else toast('No tienes tareas pendientes'); }); } },
    { k: 'modo oscuro noche dark', label: 'Modo oscuro', sub: 'Colores oscuros', icon: 'moon', run: function () { setTheme('dark'); } },
    { k: 'modo claro dia light', label: 'Modo claro', sub: 'Colores claros', icon: 'moon', run: function () { setTheme('light'); } },
    { k: 'color acento apariencia icono personalizar tema', label: 'Cambiar color o ícono', sub: 'Ajustes → Apariencia', icon: 'sparkle', run: function () { goto('ajustes'); setTimeout(function () { var c = $('.rw-appear'); c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 700); } },
    { k: 'llamar llamada hablar voz', label: 'Llamar a Rumbo', sub: 'Habla con el asistente', icon: 'phone', run: function () { goto('asistente/llamada'); } },
    { k: 'preguntar asistente ia rumbo ayuda', label: 'Preguntarle a Rumbo', sub: 'Abre el asistente', icon: 'sparkle', run: function () { goto('asistente'); } },
    { k: 'inicio home principal', label: 'Ir a Inicio', icon: 'arrow', run: function () { goto('inicio'); } },
    { k: 'tareas pendientes entregas', label: 'Ir a Tareas', icon: 'arrow', run: function () { goto('tareas'); } },
    { k: 'notas calificaciones indice promedio', label: 'Ir a Notas', icon: 'arrow', run: function () { goto('asignaturas'); } },
    { k: 'pensum carrera creditos', label: 'Ir a Mi pensum', icon: 'arrow', run: function () { goto('pensum'); } },
    { k: 'pagos cuota pago', label: 'Ir a Pagos', icon: 'arrow', run: function () { goto('pagos'); } },
    { k: 'avisos novedades noticias', label: 'Ir a Avisos', icon: 'arrow', run: function () { goto('avisos'); } },
    { k: 'ajustes configuracion cuenta', label: 'Ir a Ajustes', icon: 'arrow', run: function () { goto('ajustes'); } },
    { k: 'whatsapp telegram conexiones conectar', label: 'Conexiones', sub: 'EVA, WhatsApp y Telegram', icon: 'link', run: function () { goto('conectar'); } }
  ];
  var nz = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); };
  function ensureSearch() {
    var inp = $('.modal .search.big input');
    if (!inp) return;
    var label = inp.closest('.search.big');
    var box = $('.rw-sr', label.parentNode);
    if (!box) { box = h('<div class="rw-sr"></div>'); label.parentNode.insertBefore(box, label.nextSibling); }
    if (!inp.__rw) {
      inp.__rw = 1;
      inp.addEventListener('input', function () { renderCmds(inp, box); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && box.firstChild) { var b = $('.sr-row', box); if (b && box.dataset.top === '1') { e.preventDefault(); b.click(); } }
      });
    }
    if (box.dataset.q !== inp.value) renderCmds(inp, box);
  }
  function renderCmds(inp, box) {
    var q = nz(inp.value); box.dataset.q = inp.value;
    var list;
    if (!q) list = [COMMANDS[0], COMMANDS[1], COMMANDS[2], COMMANDS[3]];
    else {
      var words = q.split(/\s+/);
      list = COMMANDS.filter(function (c) { var hay = nz(c.k + ' ' + c.label); return words.every(function (w) { return hay.indexOf(w) >= 0; }); }).slice(0, 4);
    }
    box.dataset.top = q && list.length && !$('.search-results .sr-row') ? '1' : '0';
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="sr-group"><span class="label">' + (q ? 'Acciones' : 'Atajos') + '</span>' + list.map(function (c, i) {
      return '<button type="button" class="sr-row rw-cmd" data-i="' + COMMANDS.indexOf(c) + '"><span class="rw-cmd-ic t-' + c.icon + '">' + ic(c.icon, 17) + '</span><span><b>' + esc(c.label) + '</b>' + (c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + '</span></button>';
    }).join('') + '</div>';
    $$('.rw-cmd', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var c = COMMANDS[Number(b.dataset.i)];
        var x = $$('.modal .modal-head button')[0]; if (x) x.click();
        setTimeout(function () { c.run(); }, 180);
      });
    });
  }

  // ---------- Inicio: tarjeta "Tu día" ----------
  function pickUrgent(list) {
    var now = Date.now() / 1000;
    var p = list.filter(function (t) { return t.status !== 'done' && t.due_at; }).sort(function (a, b) { return a.due_at - b.due_at; });
    var late = p.filter(function (t) { return t.due_at < now; });
    var next = p.filter(function (t) { return t.due_at >= now; });
    return late[late.length - 1] || next[0] || null;
  }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  var todayBusy = false;
  function ensureToday() {
    var on = route() === 'inicio';
    var page = $('#root .page'), top = page && $('.topbar', page);
    if (!on || !top || store.get('rumbo-hoy-x') === todayKey()) { document.documentElement.classList.remove('rw-has-today'); return; }
    if (todayBusy) return;
    todayBusy = true;
    cached('/tasks?status=pending', 20000).then(function (list) {
      todayBusy = false;
      if (!list || route() !== 'inicio') return;
      var now = Date.now() / 1000, end = new Date(); end.setHours(23, 59, 59, 999); end = end / 1000;
      var weekEnd = now + 7 * 86400;
      var due = list.filter(function (t) { return t.status !== 'done' && t.due_at && t.due_at <= end; }).sort(function (a, b) { return a.due_at - b.due_at; });
      var late = due.filter(function (t) { return t.due_at < now; }).length, today = due.length - late;
      var week = list.filter(function (t) { return t.status !== 'done' && t.due_at && t.due_at > end && t.due_at <= weekEnd; }).length;
      var page = $('#root .page'), top = page && $('.topbar', page);
      var old = page && $('.rw-today', page);
      if (!due.length || !top) { if (old) old.remove(); document.documentElement.classList.remove('rw-has-today'); return; }
      var sig = due.map(function (t) { return t.id + ':' + t.due_at; }).join(',');
      if (old && old.dataset.sig === sig) { document.documentElement.classList.add('rw-has-today'); return; }
      var first = pickUrgent(due);
      var summary = [today ? today + (today === 1 ? ' vence hoy' : ' vencen hoy') : '', late ? late + (late === 1 ? ' atrasada' : ' atrasadas') : '', week ? week + ' más esta semana' : ''].filter(Boolean).join(' · ');
      var card = h('<section class="rw-today' + (late ? ' late' : '') + '" data-sig="' + esc(sig) + '">' +
        '<div class="rw-today-head"><div><span class="rw-kicker">' + ic(late ? 'f_alert' : 'f_clock', 14) + 'Tu día</span><b>' + esc(summary) + '</b></div><button type="button" class="rw-x" aria-label="Ocultar por hoy">' + ic('x', 16) + '</button></div>' +
        '<div class="rw-today-list">' + due.slice(0, 3).map(function (t) {
          var isLate = t.due_at < now;
          return '<button type="button" class="rw-today-row" data-id="' + t.id + '"><i style="background:' + esc(t.course_color || '#8E8E93') + '"></i><span><b>' + esc(t.title) + '</b><small>' + esc(t.course_short || t.course_name || 'Personal') + '</small></span><em class="' + (isLate ? 'late' : '') + '">' + (isLate ? 'Atrasada' : esc(whenText(t.due_at).replace(/^hoy /, ''))) + '</em></button>';
        }).join('') + (due.length > 3 ? '<div class="rw-more">+' + (due.length - 3) + ' más</div>' : '') + '</div>' +
        '<div class="rw-today-actions"><button type="button" class="rw-btn primary rw-go">' + ic('play', 16) + ' Empezar</button>' +
        '<button type="button" class="rw-btn rw-done">' + ic('check', 16) + ' Ya la entregué</button>' +
        (first && first.url ? '<button type="button" class="rw-btn icon rw-eva" aria-label="Abrir en el EVA">' + ic('link', 17) + '</button>' : '') + '</div>' +
        '<p class="rw-today-tip">Empezar abre el modo enfoque con «' + esc(first ? first.title : '') + '»</p></section>');
      $('.rw-x', card).addEventListener('click', function () { store.set('rumbo-hoy-x', todayKey()); card.classList.add('bye'); setTimeout(function () { card.remove(); document.documentElement.classList.remove('rw-has-today'); }, 300); });
      $$('.rw-today-row', card).forEach(function (r) {
        r.addEventListener('click', function () { var t = due.filter(function (x) { return String(x.id) === r.dataset.id; })[0]; if (t) location.hash = '#tareas/' + t.id; });
        var lp = null;
        r.addEventListener('touchstart', function () { lp = setTimeout(function () { lp = 'x'; var t = due.filter(function (x) { return String(x.id) === r.dataset.id; })[0]; vib(10); taskMenu(t); }, 480); }, { passive: true });
        r.addEventListener('touchmove', function () { if (lp !== 'x') clearTimeout(lp); }, { passive: true });
        r.addEventListener('touchend', function (e) { if (lp === 'x') { e.preventDefault(); } else clearTimeout(lp); lp = null; });
        r.addEventListener('contextmenu', function (e) { e.preventDefault(); var t = due.filter(function (x) { return String(x.id) === r.dataset.id; })[0]; taskMenu(t); });
      });
      $('.rw-go', card).addEventListener('click', function () { if (first) startFocus(first); });
      $('.rw-done', card).addEventListener('click', function () { if (first) markDone(first, true); });
      var ev = $('.rw-eva', card); if (ev) ev.addEventListener('click', function () { window.open(first.url, '_blank', 'noopener'); });
      if (old) old.replaceWith(card); else top.parentNode.insertBefore(card, top.nextSibling);
      document.documentElement.classList.add('rw-has-today');
    });
  }

  // ---------- Nota nueva: índice antes y después ----------
  function ensureTrend() {
    var fg = $('#root .fresh-grade');
    if (!fg || $('.rw-trend', fg)) return;
    cached('/index-trend', 60000).then(function (tr) {
      if (!tr || tr.now == null || tr.prev == null || !document.body.contains(fg) || $('.rw-trend', fg)) return;
      var d = Math.round((tr.now - tr.prev) * 10) / 10;
      if (Math.abs(d) < 0.05 || (tr.changedAt && Date.now() / 1000 - tr.changedAt > 10 * 86400)) return;
      fg.appendChild(h('<div class="rw-trend ' + (d > 0 ? 'up' : 'down') + '"><span>Tu índice</span><b class="num">' + tr.prev + '</b>' + ic('arrow', 14) + '<b class="num">' + tr.now + '</b><em class="num">' + (d > 0 ? '▲ +' : '▼ ') + d + '</em></div>'));
    });
  }

  // ---------- Apariencia: color, ícono, mascota ----------
  var ACCENTS = [['azul', '#0A84FF', 'Azul'], ['morado', '#AF52DE', 'Morado'], ['verde', '#30D158', 'Verde'], ['naranja', '#FF9F0A', 'Naranja'], ['rosado', '#FF375F', 'Rosado']];
  var ICONS = [['', '/icon-192.png', 'Clásico'], ['noche', '/icons/noche-192.png', 'Noche'], ['atardecer', '/icons/atardecer-192.png', 'Atardecer'], ['menta', '/icons/menta-192.png', 'Menta'], ['morado', '/icons/morado-192.png', 'Morado']];
  function applyAccent(a) {
    if (!a || a === 'azul') document.documentElement.removeAttribute('data-accent'); else document.documentElement.setAttribute('data-accent', a);
  }
  function applyIcon(v) {
    var m = $('link[rel=manifest]'); if (m) m.href = v ? '/api/manifest?icon=' + v : '/manifest.webmanifest';
    var a = $('link[rel=apple-touch-icon]'); if (a) a.href = v ? '/icons/' + v + '-180.png' : '/apple-touch-icon.png';
    var f = $('link[rel=icon]'); if (f) f.href = v ? '/icons/' + v + '-192.png' : '/favicon-32.png';
  }
  function applyBuddy() {
    var home = store.get('rumbo-buddy-scope', 'all') === 'home';
    document.documentElement.classList.toggle('rw-buddy-hide', home && route() !== 'inicio');
  }
  function ensureAppearance() {
    if (route() !== 'ajustes') return;
    var page = $('#root .page'); if (!page || $('.rw-appear', page)) return;
    var anchor = $('.rumbo-wa', page) || $('.topbar', page);
    if (!anchor) return;
    var acc = store.get('rumbo-accent', 'azul'), icn = store.get('rumbo-icon', ''), scope = store.get('rumbo-buddy-scope', 'all');
    var card = h('<section class="rw-appear"><div class="rw-appear-title">Apariencia</div><div class="rw-card">' +
      '<div class="rw-row"><div><b>Color de la app</b><small>Botones, barra de abajo y detalles</small></div></div>' +
      '<div class="rw-swatches">' + ACCENTS.map(function (a) { return '<button type="button" class="rw-swatch' + (a[0] === acc ? ' on' : '') + '" data-v="' + a[0] + '" style="--sw:' + a[1] + '" aria-label="' + a[2] + '"><i></i><span>' + a[2] + '</span></button>'; }).join('') + '</div>' +
      '<div class="rw-sep"></div>' +
      '<div class="rw-row"><div><b>Ícono de la app</b><small>El de tu pantalla de inicio</small></div></div>' +
      '<div class="rw-icons">' + ICONS.map(function (x) { return '<button type="button" class="rw-icon' + (x[0] === icn ? ' on' : '') + '" data-v="' + x[0] + '"><img src="' + x[1] + '" alt="" loading="lazy"><span>' + x[2] + '</span></button>'; }).join('') + '</div>' +
      '<div class="rw-sep"></div>' +
      '<div class="rw-row"><div><b>Mascota</b><small>Dónde quieres verla</small></div><div class="rw-mini-seg"><button type="button" data-v="all"' + (scope === 'all' ? ' class="on"' : '') + '>En todas</button><button type="button" data-v="home"' + (scope === 'home' ? ' class="on"' : '') + '>Solo Inicio</button></div></div>' +
      '</div></section>');
    $$('.rw-swatch', card).forEach(function (b) {
      b.addEventListener('click', function () { $$('.rw-swatch', card).forEach(function (x) { x.classList.toggle('on', x === b); }); store.set('rumbo-accent', b.dataset.v); applyAccent(b.dataset.v); vib(6); });
    });
    $$('.rw-icon', card).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.rw-icon', card).forEach(function (x) { x.classList.toggle('on', x === b); });
        store.set('rumbo-icon', b.dataset.v || null); applyIcon(b.dataset.v); vib(6);
        toast(/iPhone|iPad/.test(navigator.userAgent) ? 'Listo. En iPhone: quita Rumbo de tu pantalla de inicio y vuelve a agregarlo para ver el ícono nuevo.' : 'Listo. Android cambia el ícono solo en un rato (a veces al día siguiente).');
      });
    });
    $$('.rw-mini-seg button', card).forEach(function (b) {
      b.addEventListener('click', function () { $$('.rw-mini-seg button', card).forEach(function (x) { x.classList.toggle('on', x === b); }); store.set('rumbo-buddy-scope', b.dataset.v); applyBuddy(); vib(6); });
    });
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
  }

  // ---------- Resumen de la semana (historia) ----------
  function weekId() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
  function openStory(auto) {
    if ($('.rw-story')) return;
    api('/week-story').then(function (s) {
      if (auto && !s.done && !s.gradesCount) return;
      store.set('rumbo-story-seen', weekId());
      var slides = [];
      slides.push({ bg: 'linear-gradient(160deg,#3D7BFF,#7A5CFF 60%,#C55CFF)', html: big('f_calendar') + '<h2>Tu semana' + (s.name ? ', ' + esc(s.name) : '') + '</h2><p>' + esc(s.range) + '</p><p class="rw-st-soft">Toca para seguir</p>' });
      slides.push({ bg: 'linear-gradient(160deg,#16B86B,#0E9A8A 60%,#0A7FA8)', html: big('f_tasks') + '<span class="rw-st-k">Entregaste</span><div class="rw-st-big">' + s.done + '</div><p>' + (s.done === 1 ? 'tarea' : 'tareas') + ' esta semana</p>' + (s.doneList.length ? '<ul>' + s.doneList.map(function (d) { return '<li>✓ ' + esc(d.title) + '<small>' + esc(d.course) + '</small></li>'; }).join('') + '</ul>' : '<p class="rw-st-soft">Semana tranquila. La próxima la rompes.</p>') });
      slides.push({ bg: 'linear-gradient(160deg,#FF9F0A,#FF5E3A 60%,#E0265F)', html: big('f_spark') + '<span class="rw-st-k">Notas nuevas</span><div class="rw-st-big">' + s.gradesCount + '</div><p>' + (s.avgWeek != null ? 'Promedio de la semana: <b>' + s.avgWeek + '</b>' : 'Sin notas nuevas esta semana') + '</p>' + (s.grades.length ? '<ul>' + s.grades.map(function (g) { return '<li><b>' + g.grade + '/' + g.max + '</b> ' + esc(g.item) + '<small>' + esc(g.course) + '</small></li>'; }).join('') + '</ul>' : '') });
      if (s.index != null) slides.push({ bg: 'linear-gradient(160deg,#1C1C1E,#2C2C3A 60%,#3A2F6B)', html: big('f_trend') + '<span class="rw-st-k">Tu índice del trimestre</span><div class="rw-st-big">' + s.index + '</div><p>' + esc(s.trend || 'Se mantiene estable') + '</p>' });
      slides.push({ bg: 'linear-gradient(160deg,#FF375F,#AF52DE 55%,#5E5CE6)', html: big('f_compass') + (s.streak > 1 ? '<h2>' + s.streak + ' días de racha</h2>' : '<h2>¡A por la próxima!</h2>') + '<p>La semana que viene tienes <b>' + s.nextWeek + '</b> ' + (s.nextWeek === 1 ? 'entrega' : 'entregas') + '.</p><button type="button" class="rw-st-cta">Ver mi plan</button>' });
      var el = h('<div class="rw-story" role="dialog" aria-label="Resumen de tu semana"><div class="rw-st-bars">' + slides.map(function () { return '<i><b></b></i>'; }).join('') + '</div><button type="button" class="rw-st-x" aria-label="Cerrar">' + ic('x', 22) + '</button><div class="rw-st-stage"></div></div>');
      document.body.appendChild(el);
      var stage = $('.rw-st-stage', el), bars = $$('.rw-st-bars i', el), i = -1, timer = null, DUR = 5200;
      function show(n) {
        if (n < 0) n = 0;
        if (n >= slides.length) return close();
        i = n; clearTimeout(timer);
        el.style.background = slides[i].bg;
        stage.innerHTML = '<div class="rw-st-slide">' + slides[i].html + '</div>';
        bars.forEach(function (b, k) { b.className = k < i ? 'done' : k === i ? 'run' : ''; });
        var cta = $('.rw-st-cta', stage); if (cta) cta.addEventListener('click', function (e) { e.stopPropagation(); close(); goto('tareas'); setTimeout(function () { var b = $$('.seg button').filter(function (x) { return /Plan/.test(x.textContent); })[0]; b && b.click(); }, 500); });
        timer = setTimeout(function () { show(i + 1); }, DUR);
      }
      function close() { clearTimeout(timer); el.classList.add('out'); setTimeout(function () { el.remove(); }, 350); }
      el.style.setProperty('--dur', DUR + 'ms');
      $('.rw-st-x', el).addEventListener('click', function (e) { e.stopPropagation(); close(); });
      el.addEventListener('click', function (e) { if (e.clientX < window.innerWidth * 0.3) show(i - 1); else show(i + 1); });
      var y0 = null;
      el.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchend', function (e) { if (y0 !== null && e.changedTouches[0].clientY - y0 > 110) close(); y0 = null; });
      requestAnimationFrame(function () { el.classList.add('on'); show(0); });
    }).catch(function (e) { if (!auto) toast(e.message); });
  }
  window.__rumboStory = openStory;
  function ensureStoryEntry() {
    if (route() !== 'inicio') return;
    var acts = $('#root .page .topbar-actions'); if (!acts || $('.rw-story-btn', acts)) return;
    var b = h('<button type="button" class="rw-story-btn" aria-label="Resumen de tu semana" title="Tu semana">' + ic('cal', 18) + '</button>');
    if (store.get('rumbo-story-seen', '') !== weekId()) b.classList.add('new');
    b.addEventListener('click', function () { b.classList.remove('new'); openStory(); });
    acts.insertBefore(b, acts.firstChild);
  }
  function autoStory() {
    if (route() !== 'inicio' || store.get('rumbo-story-seen', '') === weekId()) return;
    var d = new Date(), wd = d.getDay();
    if (/\/semana/.test(location.hash) || (wd === 0 && d.getHours() >= 18) || wd === 1) {
      store.set('rumbo-story-seen', weekId());
      setTimeout(function () { openStory(!/\/semana/.test(location.hash)); }, 900);
    }
  }

  // ---------- Plan: barra de carga por día ----------
  function ensurePlan() {
    if (route() !== 'tareas') return;
    var on = $$('#root .seg button.on')[0];
    if (!on || !/Plan/.test(on.textContent)) return;
    $$('#root .page .stagger.col > .section').forEach(function (sec) {
      var head = $('.section-head', sec); if (!head) return;
      var n = $$('.task-wrap', sec).filter(function (w) { return !$('.task.done', w); }).length;
      var lvl = n === 0 ? 'free' : n === 1 ? 'light' : n <= 3 ? 'mid' : 'heavy';
      var cur = $('.rw-load', head);
      if (cur && cur.dataset.n === String(n)) return;
      var label = { free: 'Libre', light: 'Ligero', mid: 'Movido', heavy: 'Pesado' }[lvl];
      var el = h('<span class="rw-load ' + lvl + '" data-n="' + n + '" title="' + n + (n === 1 ? ' entrega' : ' entregas') + '"><i style="--w:' + Math.min(100, n * 25) + '%"></i><em>' + label + '</em></span>');
      if (cur) cur.replaceWith(el); else head.appendChild(el);
    });
  }

  // ---------- Pantalla de entrada: logo animado ----------
  var LOGO = '<svg viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="rwlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5AA2FF"/><stop offset=".55" stop-color="#1F6FFF"/><stop offset="1" stop-color="#0A4FD0"/></linearGradient></defs><rect width="96" height="96" rx="26" fill="url(#rwlg)"/><circle cx="48" cy="48" r="27" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="5"/><circle class="bt-ring" cx="48" cy="48" r="27" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" pathLength="100" transform="rotate(-90 48 48)"/><g class="bt-needle"><path d="M61 35 53.6 53.6 35 61 42.4 42.4Z" fill="#fff"/><path d="M61 35 53.6 53.6 48 48Z" fill="rgba(10,79,208,.28)"/><circle cx="48" cy="48" r="3" fill="#1F6FFF"/></g></svg>';
  function ensureLogin() {
    var mark = $('#root .lg2-mark');
    if (!mark || mark.__rw) return;
    mark.__rw = 1; mark.classList.add('rw-anim'); mark.innerHTML = LOGO;
  }

  // ---------- Bucle: revisa la pantalla cuando cambia ----------
  var pend = false;
  function run() {
    pend = false;
    try { ensureSearch(); } catch (e) {}
    try { ensureToday(); } catch (e) {}
    try { ensureTrend(); } catch (e) {}
    try { ensureAppearance(); } catch (e) {}
    try { ensureStoryEntry(); } catch (e) {}
    try { ensurePlan(); } catch (e) {}
    try { ensureLogin(); } catch (e) {}
    try { fillAsk(); } catch (e) {}
    try { applyBuddy(); } catch (e) {}
  }
  function schedule() { if (!pend) { pend = true; requestAnimationFrame(run); } }
  function boot() {
    applyAccent(store.get('rumbo-accent', 'azul'));
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', function () { schedule(); setTimeout(autoStory, 600); });
    schedule();
    setTimeout(autoStory, 1500);
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
