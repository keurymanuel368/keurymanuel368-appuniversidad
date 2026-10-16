// Páginas sueltas que sirve el Worker (sin la app de React): guía del bot de Telegram, llaves y configuración, y descarga de la app.
// Son HTML con su propio JS; las APIs que usan están en index.ts.

export const TELEGRAM_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Telegram \xB7 Rumbo</title><meta name="theme-color" content="#0B1020">
<style>
:root{--bg:#F5F6F8;--card:#fff;--ink:#0B1020;--ink2:#3A4152;--muted:#6E7385;--line:#E6E8EE;--blue:#229ED9;--blue2:#1B7FB0;--soft:#E8F5FC;--ok:#138A5A;--oksoft:#E5F6EE;--bad:#D0342C;--badsoft:#FDECEB;--warnsoft:#FFF3DD;--r:18px}
@media (prefers-color-scheme:dark){:root{--bg:#0B0F1A;--card:#141A28;--ink:#F2F4F8;--ink2:#C9CEDA;--muted:#8E95A5;--line:#252C3D;--soft:#12283A;--oksoft:#10291F;--badsoft:#2E1514;--warnsoft:#2B2312}}
*{box-sizing:border-box}html,body{margin:0}body{font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:22px 16px 60px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top a{color:var(--muted);text-decoration:none;font-size:14px}.top a:hover{color:var(--ink)}
.hero{display:flex;gap:16px;align-items:center;margin-bottom:22px}.logo{width:58px;height:58px;border-radius:16px;background:linear-gradient(135deg,#37AEE2,#1E96C8);display:grid;place-items:center;flex:none;box-shadow:0 10px 30px rgba(34,158,217,.35)}
.logo svg{width:32px;height:32px}h1{font-size:28px;line-height:1.15;letter-spacing:-.02em;margin:0}.sub{color:var(--muted);margin:4px 0 0}
.steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 18px;padding:0;list-style:none}@media (max-width:520px){.steps li{padding:8px;font-size:11px}.steps li b{font-size:12px}}.steps li{flex:1;min-width:0;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.steps li b{display:block;color:var(--ink);font-size:13.5px}.steps li.on{border-color:var(--blue);background:var(--soft)}.steps li.done{border-color:transparent;background:var(--oksoft)}.steps li.done b::after{content:" \u2713";color:var(--ok)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-bottom:14px}
.card h2{font-size:18px;margin:0 0 4px;letter-spacing:-.01em}.card>p{margin:0 0 12px;color:var(--ink2)}
ol.how{margin:6px 0 0;padding:0;list-style:none;counter-reset:s}ol.how>li{counter-increment:s;position:relative;padding:0 0 16px 44px}ol.how>li::before{content:counter(s);position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:var(--soft);color:var(--blue2);font-weight:700;display:grid;place-items:center;font-size:14px}
@media (prefers-color-scheme:dark){ol.how>li::before{color:#7CC8F0}}
ol.how>li:not(:last-child)::after{content:"";position:absolute;left:14px;top:34px;bottom:4px;width:2px;background:var(--line)}
ol.how b{display:block;margin-bottom:2px}ol.how span{color:var(--ink2)}
code,.kbd{font:600 13px ui-monospace,"SF Mono",Menlo,monospace;background:var(--bg);border:1px solid var(--line);padding:2px 7px;border-radius:7px;white-space:nowrap}
.chat{margin:10px 0 2px;display:flex;flex-direction:column;gap:6px;max-width:420px}.msg{padding:8px 12px;border-radius:14px;font-size:14px;max-width:85%}.msg.me{align-self:flex-end;background:#DCF3C8;color:#0B1020;border-bottom-right-radius:4px}.msg.bot{background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:4px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 20px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 15px inherit;font-family:inherit;cursor:pointer;text-decoration:none;transition:transform .15s,opacity .2s}
.btn:active{transform:scale(.98)}.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 8px 24px rgba(34,158,217,.3)}.btn.danger{color:var(--bad)}.btn[disabled]{opacity:.55;pointer-events:none}.btn.block{width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input.tok{width:100%;height:48px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 14px;font:500 14px ui-monospace,"SF Mono",Menlo,monospace;margin:10px 0}
input.tok:focus{outline:2px solid var(--blue);outline-offset:1px}
.note{padding:12px 14px;border-radius:12px;background:var(--warnsoft);font-size:13.5px;color:var(--ink2);margin-top:12px}
.err{padding:10px 14px;border-radius:12px;background:var(--badsoft);color:var(--bad);font-size:14px;margin-top:10px;display:none}
.status{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;font-weight:600;margin-bottom:14px}.status i{width:10px;height:10px;border-radius:50%;flex:none}
.status.ok{background:var(--oksoft);color:var(--ok)}.status.ok i{background:var(--ok)}.status.wait{background:var(--soft);color:var(--blue2)}.status.wait i{background:var(--blue);animation:p 1.2s infinite}.status.off{background:var(--bg);color:var(--muted);border:1px solid var(--line)}.status.off i{background:var(--muted)}
@keyframes p{50%{opacity:.3}}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:8px}.cmd{padding:12px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}.cmd code{background:var(--card)}.cmd p{margin:6px 0 0;font-size:13.5px;color:var(--ink2)}
details{border-top:1px solid var(--line);padding:12px 0}details:last-child{padding-bottom:0}summary{cursor:pointer;font-weight:600}details p{color:var(--ink2);margin:8px 0 0}
.hide{display:none!important}.muted{color:var(--muted)}.small{font-size:13px}
</style></head>
<body><div class="wrap">
<div class="top"><a href="/">\u2190 Volver a Rumbo</a></div>
<div class="hero"><span class="logo"><svg viewBox="0 0 24 24" fill="#fff"><path d="M21.9 4.6 18.7 19.8c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 13.4 1.5 11.9c-1-.3-1.1-1 .2-1.5L20.6 3.1c.9-.3 1.6.2 1.3 1.5z"/></svg></span>
<div><h1>Rumbo en Telegram</h1><p class="sub">Tus tareas, notas y pagos por chat. Le escribes o le mandas una nota de voz.</p></div></div>

<ul class="steps" id="steps">
  <li data-s="1"><b>1. Crear el bot</b>Una vez, en BotFather</li>
  <li data-s="2"><b>2. Pegar el token</b>Aqu\xED abajo</li>
  <li data-s="3"><b>3. Vincular</b>Tu Telegram con tu cuenta</li>
  <li data-s="4"><b>4. Usarlo</b>Escribe o habla</li>
</ul>

<div id="loading" class="card"><p class="muted">Cargando\u2026</p></div>

<div id="login" class="card hide"><h2>Primero entra a Rumbo</h2><p>Esta p\xE1gina usa tu sesi\xF3n. Entra con tu cuenta y vuelve aqu\xED.</p><a class="btn primary" href="/">Entrar a Rumbo</a></div>

<div id="noadmin" class="card hide"><div class="status off"><i></i>El bot todav\xEDa no est\xE1 conectado</div><p>El administrador de Rumbo tiene que crear el bot y pegar su token una sola vez. Cuando lo haga, aqu\xED te aparece el bot\xF3n para vincular tu Telegram.</p></div>

<!-- Paso 1 y 2: solo el administrador -->
<div id="setup" class="card hide">
  <h2>Crea tu bot (2 minutos, una sola vez)</h2>
  <p>Telegram da los bots gratis. No necesitas computadora: se hace desde el celular.</p>
  <ol class="how">
    <li><b>Abre a @BotFather</b><span>En Telegram, busca <code>@BotFather</code> (tiene palomita azul de verificado) y toca <b style="display:inline">Iniciar</b>.</span>
      <div class="row" style="margin-top:8px"><a class="btn" href="https://t.me/BotFather" target="_blank" rel="noopener">Abrir @BotFather</a></div></li>
    <li><b>Escribe /newbot</b><span>BotFather te pregunta dos cosas:</span>
      <div class="chat"><div class="msg me">/newbot</div><div class="msg bot">Alright, a new bot. How are we going to call it?</div><div class="msg me">Rumbo</div><div class="msg bot">Good. Now let's choose a username for your bot. It must end in \`bot\`.</div><div class="msg me">RumboKeuryBot</div></div>
      <span class="small muted">El nombre puede ser cualquiera. El usuario debe ser \xFAnico y terminar en <code>bot</code>; si est\xE1 ocupado, prueba otro.</span></li>
    <li><b>Copia el token</b><span>BotFather responde con un mensaje que dice <i>\u201CUse this token to access the HTTP API\u201D</i> y debajo un c\xF3digo as\xED:</span>
      <div class="chat"><div class="msg bot"><code>7712345678:AAH3kX9\u2026qZ4</code></div></div>
      <span class="small muted">Toca el c\xF3digo para copiarlo. Es como una contrase\xF1a: no lo compartas con nadie.</span></li>
    <li><b>P\xE9galo aqu\xED y toca Guardar y conectar</b>
      <input class="tok" id="tok" placeholder="Pega aqu\xED el token del bot" autocomplete="off" spellcheck="false" inputmode="text">
      <button class="btn primary block" id="saveTok" type="button">Guardar y conectar el bot</button>
      <div class="err" id="tokErr"></div>
      <span class="small muted" style="display:block;margin-top:8px">Rumbo revisa que el token sea v\xE1lido, conecta el bot y le pone los comandos (/hoy, /tareas, /notas, /pagos, /ayuda).</span></li>
  </ol>
</div>

<!-- Paso 3: vincular -->
<div id="link" class="card hide">
  <div class="status off" id="linkStatus"><i></i><span>Tu Telegram no est\xE1 vinculado</span></div>
  <h2>Vincula tu Telegram</h2>
  <p>As\xED el bot sabe que eres t\xFA y solo te responde a ti.</p>
  <ol class="how">
    <li><b>Toca \u201CAbrir mi bot\u201D</b><span>Se abre Telegram en el chat de <b style="display:inline" class="botname">tu bot</b>.</span></li>
    <li><b>Toca \u201CIniciar\u201D (o \u201CStart\u201D)</b><span>El bot te responde <i>\u201C\xA1Listo! Rumbo qued\xF3 conectado \u{1F389}\u201D</i>.</span></li>
    <li><b>Vuelve aqu\xED</b><span>Esta p\xE1gina se actualiza sola cuando quedes conectado.</span></li>
  </ol>
  <button class="btn primary block" id="openBot" type="button">Abrir mi bot en Telegram</button>
  <div class="err" id="linkErr"></div>
  <p class="small muted" style="margin-top:10px">El enlace es personal: no lo compartas. Si otra persona lo usa, el bot le responder\xEDa con tus datos.</p>
</div>

<!-- Paso 4: usarlo -->
<div id="use" class="card hide">
  <div class="status ok"><i></i><span>Conectado con <span class="botname">tu bot</span></span></div>
  <h2>C\xF3mo usarlo</h2>
  <p>Escr\xEDbele al bot como a una persona, o usa los comandos.</p>
  <div class="grid">
    <div class="cmd"><code>/hoy</code><p>Tu resumen del d\xEDa: entregas, clases y avisos.</p></div>
    <div class="cmd"><code>/tareas</code><p>Lo que tienes pendiente, con fecha y n\xFAmero.</p></div>
    <div class="cmd"><code>/notas</code><p>Tu promedio por asignatura.</p></div>
    <div class="cmd"><code>/pagos</code><p>C\xF3mo va la cuota del per\xEDodo.</p></div>
    <div class="cmd"><code>listo 12</code><p>Marca la tarea #12 como entregada.</p></div>
    <div class="cmd"><code>ya pagu\xE9</code><p>Registra el pago y deja de avisarte este mes.</p></div>
    <div class="cmd"><code>nota de C\xE1lculo</code><p>Busca tu nota en una asignatura.</p></div>
    <div class="cmd"><code>\u{1F3A4} nota de voz</code><p>Preg\xFAntale hablando; te contesta por escrito.</p></div>
  </div>
  <div class="note"><b>Tambi\xE9n te escribe solo:</b> recordatorios de entregas, notas nuevas, avisos de pago y el resumen de la ma\xF1ana, seg\xFAn lo que tengas activado en Ajustes \u2192 Notificaciones.</div>
  <div class="row" style="margin-top:14px"><a class="btn primary" id="goBot" href="#" target="_blank" rel="noopener">Abrir el chat</a><button class="btn danger" id="unlink" type="button">Desvincular mi Telegram</button></div>
</div>

<!-- Administraci\xF3n -->
<div id="admin" class="card hide">
  <h2>Administraci\xF3n del bot</h2>
  <p id="adminInfo" class="muted"></p>
  <details><summary>Cambiar el token</summary><p>Si creaste un bot nuevo o regeneraste el token en BotFather (<code>/revoke</code>), pega el nuevo. Todos tendr\xE1n que vincularse otra vez.</p>
    <input class="tok" id="tok2" placeholder="Nuevo token" autocomplete="off" spellcheck="false"><button class="btn primary" id="saveTok2" type="button">Guardar nuevo token</button><div class="err" id="tokErr2"></div></details>
  <details><summary>Quitar el bot</summary><p>Rumbo deja de usar el token guardado aqu\xED y el bot deja de responder.</p><button class="btn danger" id="delTok" type="button">Quitar el token</button></details>
</div>

<div class="card"><h2>Preguntas</h2>
  <details><summary>\xBFCuesta algo?</summary><p>No. Los bots y los mensajes de Telegram son gratis, sin l\xEDmite pr\xE1ctico para este uso.</p></details>
  <details><summary>El bot no me responde</summary><p>Revisa que est\xE9s escribiendo al bot correcto (<span class="botname">tu bot</span>) y que esta p\xE1gina diga \u201CConectado\u201D. Si cambiaste de dominio, el administrador debe tocar \u201CCambiar el token\u201D y pegar el mismo token para volver a conectarlo.</p></details>
  <details><summary>\xBFCada compa\xF1ero necesita su propio bot?</summary><p>No. Se crea un solo bot y cada persona lo vincula con su cuenta desde esta p\xE1gina. El bot responde a cada uno con sus propios datos.</p></details>
  <details><summary>Perd\xED el token</summary><p>En @BotFather escribe <code>/mybots</code>, elige tu bot y toca <b style="display:inline">API Token</b>.</p></details>
</div>
</div>
<script>
const $ = s => document.querySelector(s);
const show = (id, on = true) => $('#' + id).classList.toggle('hide', !on);
let st = null, poll = null;
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error('login'), { login: true });
  if (!r.ok) throw new Error(j.error || 'Algo sali\xF3 mal (' + r.status + ')');
  return j;
}
function steps(n) { document.querySelectorAll('#steps li').forEach(li => { const s = +li.dataset.s; li.className = s < n ? 'done' : s === n ? 'on' : ''; }); }
function render() {
  ['loading', 'login', 'noadmin', 'setup', 'link', 'use', 'admin'].forEach(id => show(id, false));
  document.querySelectorAll('.botname').forEach(e => { e.textContent = st.username ? '@' + st.username : 'tu bot'; });
  if (!st.configured) { steps(st.admin ? 1 : 1); show(st.admin ? 'setup' : 'noadmin'); return; }
  if (!st.connected) { steps(3); show('link'); } else { steps(5); show('use'); $('#goBot').href = 'https://t.me/' + st.username; stopPoll(); }
  if (st.admin) { show('admin'); $('#adminInfo').textContent = st.source === 'secreto' ? 'El token viene del secreto TELEGRAM_BOT_TOKEN de Cloudflare. Si pegas uno aqu\xED, el de la app tiene prioridad.' : 'El token est\xE1 guardado en la app. Bot: @' + st.username; }
}
async function load() {
  try { st = await api('/api/telegram/status'); render(); }
  catch (e) { show('loading', false); if (e.login) show('login'); else { $('#loading').innerHTML = '<p>' + e.message + '</p>'; show('loading'); } }
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
async function saveToken(inp, errEl, btn) {
  const t = $(inp).value.trim(); const err = $(errEl); err.style.display = 'none';
  if (!t) { err.textContent = 'Pega el token que te dio BotFather.'; err.style.display = 'block'; return; }
  const b = $(btn); b.disabled = true; const txt = b.textContent; b.textContent = 'Conectando\u2026';
  try { await api('/api/admin/telegram/token', { token: t }); $(inp).value = ''; await load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  b.disabled = false; b.textContent = txt;
}
$('#saveTok').onclick = () => saveToken('#tok', '#tokErr', '#saveTok');
$('#saveTok2').onclick = () => saveToken('#tok2', '#tokErr2', '#saveTok2');
$('#openBot').onclick = async () => {
  const b = $('#openBot'), err = $('#linkErr'); err.style.display = 'none';
  const w = window.open('', '_blank'); b.disabled = true;
  try {
    const r = await api('/api/telegram/setup', {});
    if (w) w.location = r.link; else location.href = r.link;
    const s = $('#linkStatus'); s.className = 'status wait'; s.querySelector('span').textContent = 'Esperando que toques \u201CIniciar\u201D en Telegram\u2026';
    stopPoll(); poll = setInterval(async () => { try { const n = await api('/api/telegram/status'); if (n.connected) { st = n; render(); } } catch (e) {} }, 3000);
  } catch (e) { if (w) w.close(); err.textContent = e.message; err.style.display = 'block'; }
  b.disabled = false;
};
$('#unlink').onclick = async () => { if (!confirm('\xBFDesvincular tu Telegram? El bot dejar\xE1 de responderte hasta que lo vincules otra vez.')) return; await api('/api/telegram/unlink', {}); load(); };
$('#delTok').onclick = async () => { if (!confirm('\xBFQuitar el token? El bot dejar\xE1 de funcionar para todos.')) return; try { await api('/api/admin/telegram/token/delete', {}); load(); } catch (e) { alert(e.message); } };
load();
<\/script>
</body></html>
`;
export const EXPORT_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Descargar la app \xB7 Rumbo</title>
<style>
:root{--bg:#F5F6F8;--card:#fff;--ink:#0B1020;--muted:#6E7385;--line:#E6E8EE;--blue:#3454D1;--ok:#138A5A;--bad:#D0342C}
@media (prefers-color-scheme:dark){:root{--bg:#0B0F1A;--card:#141A28;--ink:#F2F4F8;--muted:#8E95A5;--line:#252C3D}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink)}
.wrap{max-width:640px;margin:0 auto;padding:28px 16px 60px}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:14px}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}p{margin:0 0 12px;color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:48px;padding:0 22px;border-radius:99px;border:0;background:var(--blue);color:#fff;font:600 15px inherit;font-family:inherit;cursor:pointer;width:100%}.btn[disabled]{opacity:.6}
.bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:14px 0 6px}.bar i{display:block;height:100%;width:0;background:var(--blue);transition:width .2s}
#log{font:12.5px ui-monospace,Menlo,monospace;max-height:280px;overflow:auto;white-space:pre-wrap;color:var(--muted);margin-top:10px}
.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}
</style></head><body><div class="wrap">
<div class="card"><h1>Descargar la app de Rumbo</h1>
<p>Esto junta todos los archivos de la app que ve el usuario (p\xE1ginas, estilos, \xEDconos, el APK del widget) en un .zip. Ese contenido va en la carpeta <b>public</b> del repositorio.</p>
<button class="btn" id="go" type="button">Descargar rumbo-public.zip</button>
<div class="bar"><i id="bar"></i></div><div id="msg" class="muted"></div><div id="log"></div></div>
</div>
<script>
const ORIGIN = location.origin;
const EXT = /\\.(?:m?js|css|html?|png|jpe?g|gif|svg|webp|avif|ico|json|webmanifest|woff2?|ttf|otf|apk|mp3|wav|ogg|mp4|txt|xml|map)$/i;
const TEXT = /\\.(?:m?js|css|html?|json|webmanifest|svg|txt|xml)$/i;
const SEED = ['/', '/manifest.webmanifest', '/manifest.json', '/site.webmanifest', '/sw.js', '/service-worker.js', '/favicon.ico', '/favicon.svg', '/robots.txt', '/rumbo-widget.apk', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/offline.html'];
const log = t => { const l = document.getElementById('log'); l.textContent += t + '\\n'; l.scrollTop = l.scrollHeight; };
function refs(text, base) {
  const out = new Set();
  const add = s => {
    if (!s || /^(data:|blob:|mailto:|tel:|javascript:|#)/i.test(s)) return;
    try { const u = new URL(s, base); if (u.origin !== ORIGIN) return; const p = u.pathname; if (p.startsWith('/api/') || p === '/telegram' || p === '/exportar') return; if (EXT.test(p) || p === '/') out.add(p); } catch (e) {}
  };
  for (const m of text.matchAll(/(?:src|href|content)\\s*=\\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/url\\(\\s*["']?([^"')]+)["']?\\s*\\)/gi)) add(m[1]);
  for (const m of text.matchAll(/["'\`]((?:\\.{0,2}\\/)?[\\w@\\-./]+\\.(?:m?js|css|png|jpe?g|gif|svg|webp|avif|ico|json|webmanifest|woff2?|ttf|otf|apk|mp3|wav|ogg|mp4|html))(?:\\?[^"'\`]*)?["'\`]/gi)) add(m[1]);
  for (const m of text.matchAll(/import\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*\\)/g)) add(m[1]);
  return out;
}
const DOSD = ((new Date().getFullYear() - 1980) << 9) | ((new Date().getMonth() + 1) << 5) | new Date().getDate();
let crcT; function crc32(b) { if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(12, DOSD, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, DOSD, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  }
  const cs = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
document.getElementById('go').onclick = async () => {
  const btn = document.getElementById('go'); btn.disabled = true; btn.textContent = 'Buscando archivos\u2026';
  const queue = [...SEED], seen = new Set(), files = []; let indexHtml = '';
  while (queue.length) {
    const p = queue.shift(); if (seen.has(p)) continue; seen.add(p);
    document.getElementById('bar').style.width = Math.min(95, seen.size / (seen.size + queue.length) * 100) + '%';
    let r; try { r = await fetch(p, { cache: 'no-store', credentials: 'omit' }); } catch (e) { continue; }
    if (!r.ok) { if (!SEED.includes(p)) log('\u2717 ' + p + ' (' + r.status + ')'); continue; }
    const ct = r.headers.get('content-type') || '';
    const buf = new Uint8Array(await r.arrayBuffer());
    const txt = TEXT.test(p) || p === '/' || /text|javascript|json|svg|xml/.test(ct) ? new TextDecoder().decode(buf) : '';
    if (p === '/') indexHtml = txt;
    else if (/text\\/html/.test(ct) && !/\\.html?$/i.test(p) && txt === indexHtml) continue; // la app devolvi\xF3 su p\xE1gina principal: ese archivo no existe
    files.push({ name: p === '/' ? 'index.html' : p.replace(/^\\//, ''), data: buf });
    log('\u2713 ' + (p === '/' ? '/index.html' : p) + '  ' + (buf.length / 1024).toFixed(1) + ' KB');
    if (txt) for (const x of refs(txt, new URL(p, ORIGIN))) if (!seen.has(x)) queue.push(x);
  }
  const uniq = []; const names = new Set(); for (const f of files) if (!names.has(f.name)) { names.add(f.name); uniq.push(f); }
  const blob = zip(uniq); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rumbo-public.zip'; document.body.appendChild(a); a.click();
  document.getElementById('bar').style.width = '100%';
  document.getElementById('msg').innerHTML = '<span class="ok">Listo: ' + uniq.length + ' archivos (' + (blob.size / 1048576).toFixed(1) + ' MB).</span> Revisa tus descargas.';
  btn.disabled = false; btn.textContent = 'Descargar otra vez';
};
<\/script></body></html>
`;
export const KEYS_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Llaves y configuraci\xF3n \xB7 Rumbo</title><meta name="theme-color" content="#0B1220">
<style>
:root{--bg:#F3F7FE;--card:#fff;--ink:#0B1220;--ink2:#3A4152;--muted:#6E7385;--line:#E3E8F2;--blue:#2F6BFF;--soft:#EAF1FF;--ok:#138A5A;--oksoft:#E5F6EE;--bad:#D0342C;--badsoft:#FDECEB;--warn:#A15F00;--warnsoft:#FFF3DD;--r:18px}
@media (prefers-color-scheme:dark){:root{--bg:#0B1220;--card:#121A2B;--ink:#F2F4F8;--ink2:#C9CEDA;--muted:#8E95A5;--line:#232C40;--soft:#16264A;--oksoft:#10291F;--badsoft:#2E1514;--warnsoft:#2B2312}}
*{box-sizing:border-box}html,body{margin:0}body{font:15px/1.5 Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:22px 16px 70px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px}.top a{color:var(--muted);text-decoration:none;font-size:14px}.top a:hover{color:var(--ink)}
h1{font:700 28px/1.15 Sora,-apple-system,system-ui,sans-serif;letter-spacing:-.02em;margin:0 0 6px}.sub{color:var(--muted);margin:0 0 16px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);margin-bottom:14px;overflow:hidden}
.card h2{font:600 15px Sora,system-ui,sans-serif;margin:0;padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.row{padding:14px 18px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center}.row:last-child{border-bottom:0}
.row b{font-weight:600}.name{font:600 11.5px "JetBrains Mono",ui-monospace,Menlo,monospace;color:var(--muted)}
.val{grid-column:1/-1;font:500 13.5px "JetBrains Mono",ui-monospace,Menlo,monospace;color:var(--ink2);word-break:break-all;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-height:38px;display:flex;align-items:center}
.val.empty{color:var(--muted);font-family:inherit;font-style:italic}
.help{grid-column:1/-1;font-size:12.5px;color:var(--muted)}
.pill{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:99px;white-space:nowrap}.pill.app{background:var(--soft);color:var(--blue)}.pill.cf{background:var(--oksoft);color:var(--ok)}.pill.none{background:var(--bg);color:var(--muted);border:1px solid var(--line)}
.acts{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 13.5px inherit;font-family:inherit;cursor:pointer;text-decoration:none}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}.btn.danger{color:var(--bad)}.btn.lg{height:44px;padding:0 20px;font-size:14.5px}.btn[disabled]{opacity:.55;pointer-events:none}
input.in{grid-column:1/-1;width:100%;height:42px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 12px;font:500 13.5px "JetBrains Mono",ui-monospace,Menlo,monospace}
input.in:focus{outline:2px solid var(--blue);outline-offset:1px}
.note{padding:12px 14px;border-radius:12px;background:var(--warnsoft);color:var(--ink2);font-size:13.5px;margin-bottom:14px}
.err{grid-column:1/-1;color:var(--bad);font-size:13px}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#0B1220;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none}.toast.on{opacity:1}
.modal{position:fixed;inset:0;background:rgba(6,10,28,.45);display:none;align-items:center;justify-content:center;padding:16px}.modal.on{display:flex}
.modal .box{background:var(--card);border-radius:18px;padding:20px;max-width:380px;width:100%}.modal h3{margin:0 0 6px;font:600 18px Sora,system-ui,sans-serif}.modal p{margin:0 0 10px;color:var(--muted);font-size:14px}
.hide{display:none!important}.danger-txt{color:var(--warn);font-size:12.5px;grid-column:1/-1}
</style></head><body><div class="wrap">
<div class="top"><a href="/">\u2190 Volver a Rumbo</a><a href="/telegram">Telegram \u2192</a></div>
<h1>Llaves y configuraci\xF3n</h1>
<p class="sub">Aqu\xED ves y cambias las claves de Rumbo sin terminal. Lo que guardes aqu\xED manda sobre lo que hay en Cloudflare.</p>
<div id="msg" class="card hide" style="padding:18px"></div>
<div id="main" class="hide">
  <div class="bar"><button class="btn lg" id="reveal" type="button">\u{1F441} Mostrar las claves</button><span class="name" id="revealHint">Las claves secretas se ven ocultas hasta que pongas tu contrase\xF1a.</span></div>
  <div class="note"><b>Fuente:</b> <span class="pill app">App</span> guardada aqu\xED \xB7 <span class="pill cf">Cloudflare</span> viene de Variables y secretos de Cloudflare \xB7 <span class="pill none">Vac\xEDa</span> no est\xE1 puesta. Los cambios se aplican en menos de un minuto.</div>
  <div id="groups"></div>
</div>
</div>
<div class="modal" id="pw"><form class="box" id="pwForm"><h3>Confirma que eres t\xFA</h3><p>Escribe tu contrase\xF1a de Rumbo para ver las claves completas.</p><input class="in" type="password" id="pwIn" autocomplete="current-password" placeholder="Contrase\xF1a" style="margin-bottom:10px"><div class="err" id="pwErr"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="btn" type="button" id="pwCancel">Cancelar</button><button class="btn primary" type="submit">Mostrar</button></div></form></div>
<div class="toast" id="toast"></div>
<script>
const $ = s => document.querySelector(s);
let keys = [], revealed = false, editing = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2200); }
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error('login'), { code: 401 });
  if (r.status === 403) throw Object.assign(new Error(j.error || 'Solo el administrador.'), { code: 403 });
  if (!r.ok) throw new Error(j.error || 'Algo sali\xF3 mal (' + r.status + ')');
  return j;
}
function src(k) { return k.source === 'app' ? '<span class="pill app">App</span>' : k.source === 'cloudflare' ? '<span class="pill cf">Cloudflare</span>' : '<span class="pill none">Vac\xEDa</span>'; }
function render() {
  const groups = {};
  keys.forEach(k => { (groups[k.g] = groups[k.g] || []).push(k); });
  $('#groups').innerHTML = Object.entries(groups).map(([g, list]) => \`<div class="card"><h2>\${esc(g)}<span class="name">\${list.filter(k => k.set).length}/\${list.length}</span></h2>\${list.map(row).join('')}</div>\`).join('');
}
function row(k) {
  const isEd = editing === k.k;
  const v = k.set ? \`<div class="val">\${esc(k.value)}</div>\` : \`<div class="val empty">Sin valor</div>\`;
  let acts = '';
  if (k.tg) acts = \`<a class="btn" href="/telegram">Configurar en Telegram</a>\`;
  else if (isEd) acts = \`<button class="btn primary" data-save="\${k.k}" type="button">Guardar</button><button class="btn" data-cancel type="button">Cancelar</button>\`;
  else acts = \`<button class="btn" data-edit="\${k.k}" type="button">\${k.set ? 'Cambiar' : 'Poner valor'}</button>\${k.source === 'app' ? \`<button class="btn danger" data-reset="\${k.k}" type="button">\${k.cloudflare ? 'Volver al de Cloudflare' : 'Borrar'}</button>\` : ''}\${k.set && (!k.secret || revealed) ? \`<button class="btn" data-copy="\${k.k}" type="button">Copiar</button>\` : ''}\`;
  return \`<div class="row"><div><b>\${esc(k.l)}</b><div class="name">\${esc(k.k)}</div></div>\${src(k)}
    \${isEd ? \`<input class="in" id="in-\${k.k}" \${k.secret ? 'type="password"' : ''} value="\${esc(revealed || !k.secret ? k.value : '')}" placeholder="\${k.secret ? 'Pega la nueva clave' : 'Nuevo valor'}" autocomplete="off" spellcheck="false">\${k.secret ? '<label class="name" style="grid-column:1/-1"><input type="checkbox" data-show="' + k.k + '"> ver lo que escribo</label>' : ''}<div class="err" id="err-\${k.k}"></div>\` : v}
    \${k.help ? \`<div class="help">\${esc(k.help)}</div>\` : ''}\${k.danger ? '<div class="danger-txt">\u26A0 Al cambiarla se cierran todas las sesiones.</div>' : ''}
    <div class="acts">\${acts}</div></div>\`;
}
async function load() {
  try { const r = await api('/api/admin/config'); keys = r.keys; $('#main').classList.remove('hide'); $('#msg').classList.add('hide'); render(); }
  catch (e) {
    const m = $('#msg'); m.classList.remove('hide');
    m.innerHTML = e.code === 401 ? '<b>Primero entra a Rumbo.</b><p class="sub" style="margin:6px 0 12px">Esta p\xE1gina usa tu sesi\xF3n de administrador.</p><a class="btn primary lg" href="/">Entrar a Rumbo</a>' : e.code === 403 ? '<b>Solo el administrador puede ver esta p\xE1gina.</b>' : esc(e.message);
  }
}
document.addEventListener('click', async e => {
  const t = e.target.closest('button,[data-show]'); if (!t) return;
  if (t.dataset.edit) { editing = t.dataset.edit; render(); const i = $('#in-' + editing); i && i.focus(); }
  if (t.dataset.cancel !== undefined) { editing = null; render(); }
  if (t.dataset.show) { const i = $('#in-' + t.dataset.show); i.type = t.checked ? 'text' : 'password'; }
  if (t.dataset.copy) { const k = keys.find(x => x.k === t.dataset.copy); try { await navigator.clipboard.writeText(k.value); toast('Copiado'); } catch (_) { toast('No se pudo copiar'); } }
  if (t.dataset.save) {
    const k = t.dataset.save, v = $('#in-' + k).value.trim(), err = $('#err-' + k); err.textContent = '';
    if (k === 'SESSION_SECRET' && !confirm('Al cambiar esta clave se cierran todas las sesiones, incluida la tuya. \xBFSeguir?')) return;
    t.disabled = true;
    try { const r = await api('/api/admin/config', { name: k, value: v }); editing = null; toast('Guardado'); if (r.relogin) { setTimeout(() => { location.href = '/'; }, 1200); return; } await refresh(); }
    catch (x) { err.textContent = x.message; t.disabled = false; }
  }
  if (t.dataset.reset) {
    const k = keys.find(x => x.k === t.dataset.reset);
    if (!confirm(k.cloudflare ? '\xBFDejar de usar el valor de la app y volver al de Cloudflare?' : '\xBFBorrar este valor?')) return;
    try { await api('/api/admin/config', { name: k.k, reset: true }); toast('Listo'); await refresh(); } catch (x) { alert(x.message); }
  }
});
let lastPw = '';
async function refresh() {
  // Los cambios tardan unos segundos en verse (cach\xE9 de 1 minuto en el servidor); mostramos lo guardado ya.
  await new Promise(r => setTimeout(r, 400));
  if (revealed && lastPw) { try { keys = (await api('/api/admin/config/reveal', { password: lastPw })).keys; render(); return; } catch (_) {} }
  await load();
}
$('#reveal').onclick = () => { if (revealed) { revealed = false; lastPw = ''; $('#reveal').textContent = '\u{1F441} Mostrar las claves'; load(); return; } $('#pw').classList.add('on'); $('#pwIn').value = ''; $('#pwErr').textContent = ''; setTimeout(() => $('#pwIn').focus(), 50); };
$('#pwCancel').onclick = () => $('#pw').classList.remove('on');
$('#pwForm').onsubmit = async e => {
  e.preventDefault();
  try { const pw = $('#pwIn').value; const r = await api('/api/admin/config/reveal', { password: pw }); lastPw = pw; keys = r.keys; revealed = true; $('#pw').classList.remove('on'); $('#reveal').textContent = '\u{1F648} Ocultar las claves'; render(); }
  catch (x) { $('#pwErr').textContent = x.message; }
};
load();
<\/script></body></html>
`;
