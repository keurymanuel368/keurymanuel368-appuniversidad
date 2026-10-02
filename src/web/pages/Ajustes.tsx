import { useEffect, useState } from 'react';
import { api, channelsLabel, dateLabel, type SendResult } from '../api';
import { disablePush, enablePush, pushState, type PushState } from '../push';
import { applyTheme } from '../theme';
import { Modal, PageHead, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';
import { Mascot } from '../Mascot';
import { me } from '../me';

export type SettingsRes = {
  settings: Record<string, string>;
  status: {
    eva: { configured: boolean; lastSync: number | null; error: string; user: string };
    whatsapp: { server: boolean; number: string; configured: boolean; windowOpen: boolean; lastInbound: number | null; lastError: string };
    callmebot: { configured: boolean };
    mail: { connected: boolean; lastAt: number | null };
    telegram: { configured: boolean; connected: boolean; username: string };
    calendar: { connected: boolean };
    ai: { engines: string[] };
    push: { devices: number };
    voice: { ready: boolean };
    waLink?: string;
    career: string;
    role?: 'admin' | 'user';
  };
};

const appsScript = (url: string, token: string) => `// Rumbo · lee tu correo de la UAPA y le pasa a Rumbo los mensajes nuevos.
// Corre dentro de TU cuenta de Google; nadie más puede ver tu correo.
const RUMBO_URL = '${url}';
const CLAVE = '${token}';
// Solo lee correos de la UAPA (los que te reenvía tu cuenta @p.uapa.edu.do o los que vienen de uapa.edu.do).
const BUSQUEDA = 'newer_than:3d -in:chats -in:spam -from:script.google.com {from:p.uapa.edu.do from:uapa.edu.do to:p.uapa.edu.do deliveredto:p.uapa.edu.do}';

function sincronizarCorreo() {
  const desde = Date.now() - 3 * 24 * 3600 * 1000; // últimos 3 días
  const hilos = GmailApp.search(BUSQUEDA, 0, 40);
  const mensajes = [];
  hilos.forEach(function (h) {
    h.getMessages().forEach(function (m) {
      if (m.getDate().getTime() < desde) return;
      mensajes.push({
        id: m.getId(),
        from: m.getFrom(),
        subject: m.getSubject(),
        date: Math.floor(m.getDate().getTime() / 1000),
        body: m.getPlainBody().slice(0, 4000),
        url: 'https://mail.google.com/mail/u/0/#all/' + h.getId(),
      });
    });
  });
  const r = UrlFetchApp.fetch(RUMBO_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Rumbo-Token': CLAVE }, payload: JSON.stringify({ messages: mensajes }),
  });
  Logger.log('Rumbo respondió: ' + r.getContentText());
}

// Ejecuta ESTA función una sola vez: programa la revisión cada 15 minutos.
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizarCorreo').timeBased().everyMinutes(15).create();
  sincronizarCorreo();
}
`;

export function MailCard({ connected, lastAt, onChanged }: { connected: boolean; lastAt: number | null; onChanged: () => void }) {
  const [setup, setSetup] = useState<{ token: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try { setSetup(await api<{ token: string; url: string }>('/mail/setup', { method: 'POST' })); onChanged(); } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function copy() {
    if (!setup) return;
    try { await navigator.clipboard.writeText(appsScript(setup.url, setup.token)); haptic(10); toast('Script copiado. Pégalo en script.google.com'); }
    catch { toast('No se pudo copiar: selecciónalo y cópialo a mano', 'err'); }
  }
  const ok = connected && !!lastAt;
  return (
    <>
      <div className="toggle">
        <span className="set-ic red"><Icon name="send" size={18} /></span>
        <div className="t"><b>Correo UAPA (@p.uapa.edu.do)</b><span>{ok ? `Última revisión: ${dateLabel(lastAt!)}. Pagos y eventos te llegan como aviso.` : connected ? 'Script generado: falta pegarlo y ejecutar «instalar» en Google.' : 'Lee tus correos de la universidad: pagos, eventos y novedades.'}</span></div>
        <button className="btn soft sm" onClick={open} disabled={busy}>{ok ? 'Ver' : 'Conectar'}</button>
      </div>
      {setup && (
        <Modal title="Conectar tu correo de la UAPA" onClose={() => setSetup(null)}>
          <p className="hint"><Icon name="alert" size={16} />La UAPA bloquea en las cuentas de estudiante Apps Script, el reenvío automático y las contraseñas de aplicación. Por eso el script corre en tu <b>Gmail personal</b> y lee solo los correos de la UAPA que te reenvíes.</p>
          <ol className="steps">
            <li>Entra a <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener"><b>script.google.com</b></a> con tu <b>Gmail personal</b> y crea un proyecto nuevo.</li>
            <li>Borra lo que haya, pulsa <b>Copiar script</b> aquí abajo y pégalo. Guarda con el disquete.</li>
            <li>Arriba elige la función <b>instalar</b> y pulsa <b>Ejecutar</b>.</li>
            <li>Google pedirá permiso: <b>Revisar permisos</b> → tu cuenta → si dice «Google no verificó esta app», toca <b>Configuración avanzada</b> → <b>Ir a (proyecto)</b> → <b>Permitir</b>. Es normal: la app eres tú.</li>
            <li>Cuando te llegue un correo importante a tu cuenta <b>@p.uapa.edu.do</b> (pagos, eventos), dale <b>Reenviar</b> a tu Gmail personal. En menos de 15 minutos aparece en <b>Avisos</b>, ya clasificado.</li>
          </ol>
          <pre className="code-area script-box">{appsScript(setup.url, setup.token)}</pre>
          <p className="hint"><Icon name="alert" size={16} />El script trae una clave privada solo tuya. No lo compartas. Si algún día se filtra, pulsa «Cambiar clave» y vuelve a pegarlo.</p>
          <div className="modal-actions">
            <button className="btn line grow-m" onClick={async () => { await api('/mail/reset', { method: 'POST' }); toast('Clave anulada'); setSetup(null); onChanged(); }}>Cambiar clave</button>
            <button className="btn primary grow-m" onClick={copy}><Icon name="upload" size={18} />Copiar script</button>
          </div>
        </Modal>
      )}
    </>
  );
}

const TYPES: { key: string; icon: string; tone: string; label: string; hint: string }[] = [
  { key: 'tareas', icon: 'tasks', tone: 'blue', label: 'Entregas y recordatorios', hint: '72 h, 24 h y 3 h antes de cada entrega' },
  { key: 'notas', icon: 'trend', tone: 'green', label: 'Notas nuevas', hint: 'Cuando el facilitador califica algo' },
  { key: 'pagos', icon: 'wallet', tone: 'orange', label: 'Pagos', hint: 'Ventana de pago y correos de cobro' },
  { key: 'avisos', icon: 'bell', tone: 'violet', label: 'Avisos y eventos', hint: 'Foro de avisos, correos y eventos' },
  { key: 'resumen', icon: 'calendar', tone: 'blue', label: 'Resumen diario', hint: 'Tu día a la hora que elijas' },
  { key: 'novedades', icon: 'spark', tone: 'violet', label: 'Novedades de Rumbo', hint: 'Cuando la app trae algo nuevo' },
];

/** Elige qué tipos de aviso recibir + guía para ponerles un sonido propio. */
function NotifyTypes({ s, onSave }: { s: Record<string, string>; onSave: (k: string, v: string) => void }) {
  const [guide, setGuide] = useState(false);
  return (
    <div className="card">
      <span className="label">Qué quieres que te avise</span>
      {TYPES.map((t) => {
        const on = s[`notify_${t.key}`] !== '0';
        return (
          <div key={t.key} className="toggle">
            <span className={`set-ic ${t.tone}`}><Icon name={t.icon} size={18} /></span>
            <div className="t"><b>{t.label}</b><span>{t.hint}</span></div>
            <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={t.label} onClick={() => { haptic(8); onSave(`notify_${t.key}`, on ? '0' : '1'); }} />
          </div>
        );
      })}
      <button className="btn soft" onClick={() => setGuide(true)}><Icon name="bell" size={18} />Ponerle un sonido propio a Rumbo</button>
      {guide && (
        <Modal title="Sonido propio para Rumbo" onClose={() => setGuide(false)}>
          <p className="hint"><Icon name="alert" size={16} />Una app web no puede elegir su sonido: lo decide el teléfono. Pero puedes darle a Rumbo un tono distinto al de las demás apps en un minuto.</p>
          <span className="label">Android</span>
          <ol className="steps">
            <li>Abre los <b>Ajustes</b> del teléfono → <b>Aplicaciones</b> → <b>Rumbo</b> (si la instalaste) o <b>Chrome</b>.</li>
            <li>Toca <b>Notificaciones</b>. Si entraste por Chrome, busca <b>Sitios</b> → <b>rumbo.gestori.workers.dev</b>.</li>
            <li>Toca <b>Sonido</b> y elige el tono que quieras (o uno descargado). Activa también <b>vibración</b> y <b>pantalla de bloqueo</b>.</li>
          </ol>
          <span className="label">iPhone</span>
          <ol className="steps">
            <li>iOS no deja cambiar el sonido de las apps web: usan el tono de notificación del sistema.</li>
            <li>En <b>Ajustes → Notificaciones → Rumbo</b> puedes activar <b>Sonidos</b>, <b>Globos</b> y el estilo del aviso.</li>
          </ol>
          <button className="btn primary block" onClick={async () => { const r = await api<{ ok: boolean; error?: string }>('/push/test', { method: 'POST' }); toast(r.ok ? 'Te mandé una notificación para probar el sonido' : `No se pudo: ${r.error}`, r.ok ? 'ok' : 'err'); }}><Icon name="bell" size={18} />Probar el sonido ahora</button>
        </Modal>
      )}
    </div>
  );
}

/** Tema: automático (según el teléfono), claro u oscuro. */
function ThemeCard() {
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem('rumbo-theme') || 'auto'; } catch { return 'auto'; } });
  function pick(t: string) {
    haptic(6); setTheme(t);
    try { localStorage.setItem('rumbo-theme', t); } catch { /* sin almacenamiento */ }
    applyTheme(t);
  }
  const [mascot, setMascot] = useState(() => { try { return localStorage.getItem('rumbo-mascota') !== '0'; } catch { return true; } });
  function toggleMascot() {
    const v = !mascot; haptic(8); setMascot(v);
    try { localStorage.setItem('rumbo-mascota', v ? '1' : '0'); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event('rumbo:mascota'));
  }
  return (
    <div className="card">
      <span className="label">Tema de la app</span>
      <div className="theme-pick">
        {[{ id: 'auto', label: 'Automático' }, { id: 'light', label: 'Claro' }, { id: 'dark', label: 'Oscuro' }].map((t) => (
          <button key={t.id} className={`theme-opt ${t.id} ${theme === t.id ? 'on' : ''}`} onClick={() => pick(t.id)} aria-pressed={theme === t.id}>
            <span className="theme-swatch" /><b>{t.label}</b>
          </button>
        ))}
      </div>
      <div className="toggle mascot-toggle">
        <Mascot mood={mascot ? 'feliz' : 'sleep'} size={40} />
        <div className="t"><b>Mascota en todas las pantallas</b><span>{mascot ? 'Cae al cambiar de pantalla. Tócala, o mantenla presionada para hablar.' : 'Está durmiendo. Actívala cuando quieras.'}</span></div>
        <button className={`switch ${mascot ? 'on' : ''}`} role="switch" aria-checked={mascot} aria-label="Mascota" onClick={toggleMascot} />
      </div>
      <button className="btn line block tour-btn" onClick={() => { haptic(6); window.dispatchEvent(new Event('rumbo:tour')); }}><Icon name="compass" size={18} />Ver el recorrido de bienvenida</button>
    </div>
  );
}

/** Telegram: conversa con Rumbo y recibe todo sin límite de 24 h. */
export function TelegramCard({ st, onChanged }: { st: { configured: boolean; connected: boolean; username: string }; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  async function connect() {
    if (!st.configured) { setHelp(true); return; }
    setBusy(true);
    try { const r = await api<{ link: string; username: string }>('/telegram/setup', { method: 'POST' }); setLink(r.link); onChanged(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  return (
    <>
      <div className="toggle">
        <span className="set-ic blue"><Icon name="send" size={18} /></span>
        <div className="t"><b>Telegram {st.username ? `(@${st.username})` : ''}</b><span>{st.connected ? 'Conectado: chatea, manda notas de voz y recibe tus avisos.' : st.configured ? 'Bot listo: falta vincular tu chat.' : 'Chat con Rumbo por Telegram, gratis y sin límite de 24 h.'}</span></div>
        {st.connected ? <span className="pill green"><i className="led on" />Activo</span> : <button className="btn soft sm" onClick={connect} disabled={busy}>{busy ? '…' : 'Conectar'}</button>}
      </div>
      {link && (
        <Modal title="Vincular Telegram" onClose={() => setLink(null)}>
          <p className="hint"><Icon name="alert" size={16} />Abre el enlace en el teléfono donde tienes Telegram y pulsa <b>Iniciar</b>. El bot quedará vinculado solo a tu chat.</p>
          <a className="btn primary lg block" href={link} target="_blank" rel="noopener"><Icon name="send" size={18} />Abrir Telegram</a>
          <button className="btn line block" onClick={() => { setLink(null); onChanged(); }}>Ya lo vinculé</button>
        </Modal>
      )}
      {help && (
        <Modal title="Crear tu bot de Telegram" onClose={() => setHelp(false)}>
          <ol className="steps">
            <li>En Telegram, busca <b>@BotFather</b> y escríbele <b>/newbot</b>.</li>
            <li>Ponle un nombre (por ejemplo <b>Rumbo</b>) y un usuario que termine en <b>bot</b> (por ejemplo <b>rumbo_manuel_bot</b>).</li>
            <li>BotFather te da un <b>token</b>. No lo pegues en ningún chat.</li>
            <li>En la computadora, dentro de la carpeta <b>rumbo</b>, ejecuta <b>npx wrangler secret put TELEGRAM_BOT_TOKEN</b> y pega el token cuando lo pida.</li>
            <li>Vuelve aquí y pulsa <b>Conectar</b>.</li>
          </ol>
        </Modal>
      )}
    </>
  );
}

/** Calendario: tus entregas en Google Calendar o en el calendario del iPhone. */
export function CalendarCard({ connected, onChanged }: { connected: boolean; onChanged: () => void }) {
  const [links, setLinks] = useState<{ url: string; webcal: string; google: string } | null>(null);
  async function open() {
    try { setLinks(await api<{ url: string; webcal: string; google: string }>('/calendar/setup', { method: 'POST' })); onChanged(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function copy() { if (!links) return; try { await navigator.clipboard.writeText(links.url); haptic(8); toast('Enlace copiado'); } catch { toast('No se pudo copiar', 'err'); } }
  return (
    <>
      <div className="toggle">
        <span className="set-ic green"><Icon name="calendar" size={18} /></span>
        <div className="t"><b>Calendario del teléfono</b><span>{connected ? 'Tus entregas aparecen en tu calendario y se actualizan solas.' : 'Tus entregas y la ventana de pago en Google Calendar o iPhone, con alarmas.'}</span></div>
        <button className="btn soft sm" onClick={open}>{connected ? 'Ver' : 'Agregar'}</button>
      </div>
      {links && (
        <Modal title="Agregar a tu calendario" onClose={() => setLinks(null)}>
          <p className="hint"><Icon name="alert" size={16} />Es un enlace privado y solo tuyo: tu calendario lo revisa cada pocas horas y muestra cada entrega con alarmas 1 día y 3 horas antes.</p>
          <a className="btn primary lg block" href={links.google} target="_blank" rel="noopener"><Icon name="calendar" size={18} />Agregar a Google Calendar</a>
          <a className="btn line block" href={links.webcal}><Icon name="calendar" size={18} />Agregar al calendario del iPhone o Mac</a>
          <button className="btn line block" onClick={copy}><Icon name="link" size={18} />Copiar el enlace</button>
          <p className="small muted">Si Google Calendar no lo muestra en el teléfono, entra desde la computadora a calendar.google.com → Otros calendarios → Desde URL, y pega el enlace.</p>
          <button className="btn danger block" onClick={async () => { await api('/calendar/reset', { method: 'POST' }); toast('Enlace anulado. Genera uno nuevo cuando quieras.'); setLinks(null); onChanged(); }}><Icon name="trash" size={18} />Anular el enlace</button>
        </Modal>
      )}
    </>
  );
}

type WidgetInfo = { link: string; apk: string; preview: { mood: string; headline: string; sub: string; streak: number; pending: number; tasks: { title: string; when: string; urgent: boolean }[]; updated: string } };
/** Widget para la pantalla de inicio del teléfono (estilo Duolingo). */
export function WidgetCard() {
  const [info, setInfo] = useState<WidgetInfo | null>(null);
  async function open() {
    haptic(8);
    try { setInfo(await api<WidgetInfo>('/widget/setup', { method: 'POST' })); } catch (e) { toast((e as Error).message, 'err'); }
  }
  const w = info?.preview;
  return (
    <>
      <div className="toggle">
        <span className="set-ic orange"><Icon name="spark" size={18} /></span>
        <div className="t"><b>Widget en tu pantalla de inicio</b><span>Como Duolingo: la mascota de Rumbo te muestra tu racha y lo próximo que vence.</span></div>
        <button className="btn soft sm" onClick={open}>Poner</button>
      </div>
      {info && w && (
        <Modal title="Widget de Rumbo" onClose={() => setInfo(null)}>
          <div className={`wpreview mood-${w.mood}`}>
            <div className="wp-top">
              <Mascot mood={w.mood} size={62} />
              <div className="wp-txt"><b>{w.headline}</b><span>{w.sub}</span>
                <div className="wp-chips"><i className="fire">🔥 {w.streak} {w.streak === 1 ? 'día' : 'días'}</i><i>📚 {w.pending} {w.pending === 1 ? 'pendiente' : 'pendientes'}</i></div>
              </div>
            </div>
            {w.tasks.map((t, i) => <div key={i} className="wp-row"><b>{t.title}</b><em className={t.urgent ? 'urgent' : ''}>{t.when}</em></div>)}
          </div>
          <p className="small muted center">Así se verá en tu teléfono. La cara cambia según cómo vas.</p>
          <ol className="steps">
            <li><b>Instala la app del widget</b> (pesa muy poco). Android te pedirá permitir «instalar apps de esta fuente»: acéptalo solo para Chrome.
              <a className="btn primary block" href={info.apk} download><Icon name="download" size={18} />Descargar Rumbo Widget</a></li>
            <li><b>Conéctalo</b> con un toque (abre la app y se enlaza sola):
              <a className="btn line block" href={info.link}><Icon name="link" size={18} />Conectar widget</a></li>
            <li>En la app toca <b>«Poner widget en inicio»</b>. Se actualiza solo cada 30 minutos y al tocar ↻.</li>
          </ol>
          <button className="btn danger block" onClick={async () => { await api('/widget/reset', { method: 'POST' }); toast('Widget desconectado. Conéctalo de nuevo cuando quieras.'); setInfo(null); }}><Icon name="trash" size={18} />Desconectar el widget</button>
        </Modal>
      )}
    </>
  );
}

type BackupInfo = { key: string; at: number; bytes: number; rows: number };
/** Copias de seguridad de tus datos: automáticas cada semana, a mano cuando quieras, y descargables. */
function BackupCard() {
  const [data, setData] = useState<{ enabled: boolean; list: BackupInfo[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const load = () => api<{ enabled: boolean; list: BackupInfo[] }>('/backups').then(setData).catch(() => setData({ enabled: false, list: [] }));
  useEffect(() => { void load(); }, []);
  async function now() {
    setBusy(true); haptic(8);
    try { await api('/backups', { method: 'POST' }); toast('Copia de seguridad lista ✅'); await load(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  const last = data?.list[0];
  const when = (ms: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(ms);
  return (
    <>
      <div className="toggle">
        <span className="set-ic green"><Icon name="check" size={18} /></span>
        <div className="t"><b>Copias de seguridad</b><span>{!data ? 'Revisando…' : !data.enabled ? 'Se hace sola cada semana · descarga tus datos cuando quieras' : last ? `Última: ${when(last.at)} · se hace sola cada semana` : 'Todavía no hay copias: se hará sola esta semana'}</span></div>
        <button className="btn soft sm" onClick={() => { haptic(6); setOpen(true); }}>Ver</button>
      </div>
      {open && (
        <Modal title="Copias de seguridad" onClose={() => setOpen(false)}>
          <p className="hint"><Icon name="alert" size={16} />Rumbo guarda una copia de todos tus datos (tareas, notas, pagos, avisos y lo que la IA recuerda) cada semana. Se conservan las últimas 8.</p>
          {data?.enabled && <button className="btn primary lg block" onClick={now} disabled={busy}><Icon name="sync" size={18} />{busy ? 'Haciendo la copia…' : 'Hacer una copia ahora'}</button>}
          <a className="btn line block" href="/api/backups/download" download><Icon name="download" size={18} />Descargar mis datos de hoy</a>
          {data && data.list.length > 0 && (
            <div className="backup-list" role="list" aria-label="Copias guardadas">
              {data.list.map((b) => (
                <a key={b.key} role="listitem" className="backup-row" href={`/api/backups/download?key=${encodeURIComponent(b.key)}`} download>
                  <span className="set-ic blue"><Icon name="book" size={16} /></span>
                  <span className="br-txt"><b>{when(b.at)}</b><small>{b.rows.toLocaleString('es-DO')} registros · {Math.max(1, Math.round(b.bytes / 1024))} KB</small></span>
                  <Icon name="download" size={18} />
                </a>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** Motores de IA gratis en cadena: si uno se agota, sigue el siguiente. */
function AiEnginesCard({ engines }: { engines: string[] }) {
  const [help, setHelp] = useState(false);
  const [test, setTest] = useState<{ engine: string; ok: boolean; ms: number; detail: string }[] | null>(null);
  const [testing, setTesting] = useState(false);
  const extra = engines.filter((e) => e !== 'Workers AI');
  async function runTest() {
    setTesting(true); haptic(8);
    try { const r = await api<{ results: { engine: string; ok: boolean; ms: number; detail: string }[] }>('/ai/test', { method: 'POST' }); setTest(r.results); toast(r.results.every((x) => x.ok) ? '¡Todos los motores responden! 🎉' : 'Algún motor no respondió: mira el detalle', r.results.every((x) => x.ok) ? 'ok' : 'err'); }
    catch (e) { toast((e as Error).message, 'err'); }
    setTesting(false);
  }
  return (
    <>
      <div className="toggle">
        <span className="set-ic violet"><Icon name="spark" size={18} /></span>
        <div className="t"><b>Motores de IA</b><span>{engines.length ? engines.join(' → ') : 'Ninguno'}{extra.length < 2 ? ' · agrega otro para que nunca se acabe' : ' · nunca se te acaba'}</span></div>
        <button className="btn soft sm" onClick={() => setHelp(true)}>{extra.length ? 'Ver' : 'Agregar'}</button>
      </div>
      {extra.length > 0 && <button className={`btn line block ${testing ? 'spinning' : ''}`} onClick={runTest} disabled={testing}><Icon name="sync" size={18} />{testing ? 'Probando…' : 'Probar motores'}</button>}
      {test && (
        <div className="engine-test">
          {test.map((t) => (
            <div key={t.engine} className="et-row">
              <span className={`et-dot ${t.ok ? 'ok' : 'bad'}`}>{t.ok ? '✓' : '✕'}</span>
              <span className="et-copy"><b>{t.engine}</b><small>{t.detail}</small></span>
              <span className="num et-ms">{(t.ms / 1000).toFixed(1)} s</span>
            </div>
          ))}
        </div>
      )}
      {help && (
        <Modal title="Motores de IA gratis" onClose={() => setHelp(false)}>
          <p className="hint"><Icon name="alert" size={16} />Rumbo usa los motores en orden. Si uno se agota o falla, pasa al siguiente solo. Todos son gratis y sin tarjeta. Las claves NUNCA se pegan en el chat: van con un comando en la computadora.</p>
          {[
            { k: 'GROQ_API_KEY', n: 'Groq (recomendado: el más rápido)', url: 'https://console.groq.com/keys', d: '~1.000 respuestas al día y transcribe tus notas de voz.' },
            { k: 'CEREBRAS_API_KEY', n: 'Cerebras (muy rápido)', url: 'https://cloud.cerebras.ai', d: 'Gratis: entra con Google, ve a «API Keys» y crea una.' },
            { k: 'NVIDIA_API_KEY', n: 'NVIDIA NIM', url: 'https://build.nvidia.com', d: '~40 respuestas por minuto. Entra, abre un modelo Llama y toca «Get API Key».' },
            { k: 'GEMINI_API_KEY', n: 'Google Gemini', url: 'https://aistudio.google.com/apikey', d: '~1.500 respuestas al día con tu cuenta de Google.' },
            { k: 'OPENROUTER_API_KEY', n: 'OpenRouter (modelos gratis)', url: 'https://openrouter.ai/settings/keys', d: 'Usa solo sus modelos «:free». Crea la clave sin poner tarjeta.' },
          ].map((m) => (
            <div key={m.k} className="engine">
              <div className="engine-head"><b>{m.n}</b>{engines.some((e) => m.n.startsWith(e)) ? <span className="pill green">Activo</span> : <span className="pill gray">Sin configurar</span>}</div>
              <span className="small muted">{m.d}</span>
              <ol className="steps">
                <li>Crea tu clave en <a href={m.url} target="_blank" rel="noopener"><b>{m.url.replace('https://', '')}</b></a>.</li>
                <li>En la computadora, dentro de la carpeta <b>rumbo</b>: <code>npx wrangler secret put {m.k}</code> y pega la clave cuando la pida.</li>
              </ol>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}

function PushCard({ devices, alsoWa, onSave, onChanged }: { devices: number; alsoWa: boolean; onSave: (k: string, v: string) => void; onChanged: () => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);

  async function toggle() {
    setBusy(true); haptic(8);
    try {
      if (state === 'on') { await disablePush(); toast('Notificaciones desactivadas en este dispositivo'); }
      else {
        await enablePush();
        const r = await api<{ ok: boolean; error?: string }>('/push/test', { method: 'POST' });
        toast(r.ok ? '¡Listo! Te envié una notificación de prueba' : `Activadas, pero la prueba falló: ${r.error}`, r.ok ? 'ok' : 'err');
      }
      setState(await pushState()); onChanged();
    } catch (e) { toast((e as Error).message, 'err'); setState(await pushState()); }
    setBusy(false);
  }
  async function test() {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; error?: string }>('/push/test', { method: 'POST' });
      toast(r.ok ? 'Notificación de prueba enviada' : `No se pudo: ${r.error}`, r.ok ? 'ok' : 'err');
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }

  const on = state === 'on';
  const hint = state === 'ios-install' ? 'En iPhone: Compartir → Agregar a pantalla de inicio, y actívalas desde la app instalada (iOS 16.4 o superior).'
    : state === 'denied' ? 'Las bloqueaste en el navegador. Actívalas en los ajustes del sitio → Notificaciones.'
    : state === 'unsupported' ? 'Este navegador no permite notificaciones.'
    : on ? `Activas en este dispositivo${devices > 1 ? ` y ${devices - 1} más` : ''}.` : 'Resumen diario, entregas, pagos y notas nuevas, aunque WhatsApp esté cerrado.';

  return (
    <div className="card">
      <div className="toggle">
        <span className="set-ic blue"><Icon name="bell" size={18} /></span>
        <div className="t"><b>Notificaciones en este dispositivo</b><span>{hint}</span></div>
        <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label="Notificaciones" disabled={busy || state === null || state === 'unsupported' || state === 'denied' || state === 'ios-install'} onClick={toggle} />
      </div>
      <div className="toggle">
        <span className="set-ic green"><Icon name="chat" size={18} /></span>
        <div className="t"><b>Notificar también si llegó por WhatsApp</b><span>Si lo apagas, solo te notifica cuando WhatsApp no pudo entregarlo.</span></div>
        <button className={`switch ${alsoWa ? 'on' : ''}`} role="switch" aria-checked={alsoWa} aria-label="Notificar también por WhatsApp" onClick={() => { haptic(8); onSave('push_also_wa', alsoWa ? '0' : '1'); }} />
      </div>
      {on && <button className="btn soft" onClick={test} disabled={busy}><Icon name="bell" size={18} />Enviar notificación de prueba</button>}
    </div>
  );
}

/** Mi cuenta: quién soy y cambiar la contraseña de Rumbo. */
function AccountCard() {
  const u = me();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api('/me/password', { method: 'POST', body: { current: cur, password: pw } }); toast('Contraseña cambiada ✅'); setOpen(false); setCur(''); setPw(''); }
    catch (e2) { toast((e2 as Error).message, 'err'); }
    setBusy(false);
  }
  return (
    <div className="card">
      <div className="toggle">
        <span className="set-ic blue" aria-hidden="true"><Icon name="users" size={18} /></span>
        <div className="t"><b>{u?.name || 'Tu cuenta'}</b><span>Entras con: {u?.login || '—'}</span></div>
        <button className="btn soft sm" onClick={() => setOpen(true)}>Cambiar contraseña</button>
      </div>
      {open && (
        <Modal title="Cambiar contraseña" onClose={() => setOpen(false)}>
          <form className="form-stack" onSubmit={save}>
            <div className="field"><label htmlFor="pw-c">Contraseña actual</label><input id="pw-c" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
            <div className="field"><label htmlFor="pw-n">Contraseña nueva (8 o más)</label><input id="pw-n" className="input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
            <button className="btn primary lg block" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Ajustes({ onLogout }: { onLogout: () => void }) {
  const q = useLoad(() => api<SettingsRes>('/settings'));
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<string[] | null>(null);
  if (q.error) return <div className="error">{q.error}</div>;
  if (!q.data) return <Skeleton hero={false} rows={4} />;
  const s = q.data.settings, st = q.data.status;

  async function save(k: string, v: string) {
    if ((s[k] || '') === v) return;
    await api('/settings', { method: 'PUT', body: { [k]: v } });
    toast('Guardado');
    q.reload();
  }
  async function action(name: string, path: string) {
    setBusy(name);
    try {
      const r = await api<Record<string, unknown>>(path, { method: 'POST' });
      if (name === 'test') { const sr = r as unknown as SendResult; if (sr.ok) toast(`Resumen enviado por ${channelsLabel(sr)}`); else toast(`No se pudo enviar: ${sr.error}`, 'err'); }
      else if (name === 'sync') toast('EVA sincronizado');
      else toast(`Avisos ejecutados: ${((r.log as string[]) || []).join(' · ') || 'nada pendiente'}`);
    } catch (e) { toast('Error: ' + (e as Error).message, 'err'); }
    setBusy(''); q.reload();
  }
  async function repair() {
    setBusy('repair');
    try {
      const r = await api<{ ok: boolean; steps: string[] }>('/whatsapp/repair', { method: 'POST' });
      setReport(r.steps);
      toast(r.ok ? 'WhatsApp conectado. Escríbele "hola" al asistente.' : 'Hay un problema con WhatsApp: mira el detalle abajo.', r.ok ? 'ok' : 'err');
    } catch (e) { toast('Error: ' + (e as Error).message, 'err'); }
    setBusy('');
  }
  const Status = ({ ok, text }: { ok: boolean; text: string }) => <span className={`pill ${ok ? 'green' : 'gray'}`}><i className={`led ${ok ? 'on' : ''}`} />{text}</span>;
  const summaryOn = s.summary_enabled !== '0';
  const admin = st.role === 'admin';

  return (
    <>
      <PageHead eyebrow="Cuenta, conexiones y avisos" title="Ajustes">
        <button className="btn line hide-mobile" onClick={onLogout}><Icon name="logout" size={18} />Cerrar sesión</button>
      </PageHead>
      <section className="grid2 stagger">
        <div className="col">
          <div className="section">
            <div className="section-head"><h3>Mi cuenta</h3></div>
            <AccountCard />
          </div>
          <div className="section">
            <div className="section-head"><h3>Notificaciones</h3></div>
            <PushCard devices={st.push.devices} alsoWa={s.push_also_wa !== '0'} onSave={save} onChanged={q.reload} />
            <NotifyTypes s={s} onSave={save} />
          </div>
          <div className="section">
            <div className="section-head"><h3>Apariencia</h3></div>
            <ThemeCard />
          </div>
          <div className="section">
            <div className="section-head"><h3>Resumen y recordatorios</h3></div>
            <div className="card">
              <div className="toggle">
                <span className="set-ic blue"><Icon name="bell" size={18} /></span>
                <div className="t"><b>Resumen diario</b><span>Tareas del día, pagos y promedio</span></div>
                <button className={`switch ${summaryOn ? 'on' : ''}`} role="switch" aria-checked={summaryOn} aria-label="Resumen diario" onClick={() => { haptic(8); save('summary_enabled', summaryOn ? '0' : '1'); }} />
              </div>
              <div className="toggle">
                <span className="set-ic violet"><Icon name="book" size={18} /></span>
                <div className="t"><b>Hora de estudio</b><span>Cada día a tu hora te aviso qué te toca estudiar (lo que vence pronto)</span></div>
                <button className={`switch ${s.study_enabled !== '0' ? 'on' : ''}`} role="switch" aria-checked={s.study_enabled !== '0'} aria-label="Hora de estudio" onClick={() => { haptic(8); save('study_enabled', s.study_enabled === '0' ? '1' : '0'); }} />
              </div>
              <div className="form-grid">
                <div className="field"><label htmlFor="sh">Hora del resumen</label>
                  <select id="sh" className="input" value={s.summary_hour} onChange={(e) => save('summary_hour', e.target.value)}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? '12' : h > 12 ? h - 12 : h}:00 {h < 12 ? 'a. m.' : 'p. m.'}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="tr">Recordar entregas (horas antes)</label><input id="tr" className="input num" defaultValue={s.task_reminders} onBlur={(e) => save('task_reminders', e.target.value.replace(/[^\d,]/g, ''))} /></div>
                <div className="field"><label htmlFor="es">Sincronizar el EVA cada (horas)</label><input id="es" className="input num" inputMode="numeric" defaultValue={s.eva_sync_hours} onBlur={(e) => save('eva_sync_hours', e.target.value.replace(/\D/g, '') || '2')} /></div>
                <div className="field"><label htmlFor="sth">Hora de estudio (te aviso qué toca)</label>
                  <select id="sth" className="input" value={s.study_hour || '19'} onChange={(e) => save('study_hour', e.target.value)}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? '12' : h > 12 ? h - 12 : h}:00 {h < 12 ? 'a. m.' : 'p. m.'}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="nm">Cómo te saludo</label><input id="nm" className="input" defaultValue={s.student_name} onBlur={(e) => save('student_name', e.target.value)} /></div>
              </div>
            </div>
          </div>
          <div className="section">
            <div className="section-head"><h3>Trimestre</h3></div>
            <div className="card">
              <div className="form-grid">
                <div className="field"><label htmlFor="ts">Inicio</label><input id="ts" type="date" className="input" defaultValue={s.term_start} onBlur={(e) => save('term_start', e.target.value)} /></div>
                <div className="field"><label htmlFor="te">Fin</label><input id="te" type="date" className="input" defaultValue={s.term_end} onBlur={(e) => save('term_end', e.target.value)} /></div>
              </div>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="section">
            <div className="section-head"><h3>Conexiones</h3><a className="link-btn" href="#conectar">Paso a paso</a></div>
            <div className="card">
              <div className="toggle">
                <span className="set-ic violet"><Icon name="book" size={18} /></span>
                <div className="t"><b>EVA UAPA (Moodle)</b><span>{st.eva.configured ? (st.eva.lastSync ? `Última sincronización: ${dateLabel(st.eva.lastSync)}${st.eva.user ? ' · ' + st.eva.user : ''}` : 'Configurado, sin sincronizar aún') : 'Sin conectar: toca «Paso a paso» arriba.'}</span>{st.eva.error && <span className="t-err">{st.eva.error}</span>}</div>
                <Status ok={st.eva.configured && !st.eva.error} text={st.eva.configured ? (st.eva.error ? 'Con error' : 'Conectado') : 'Sin configurar'} />
              </div>
              <div className="toggle">
                <span className="set-ic green"><Icon name="chat" size={18} /></span>
                <div className="t"><b>WhatsApp</b><span>{st.whatsapp.configured ? (st.whatsapp.windowOpen ? 'Ventana de 24 h abierta: tus resúmenes llegan por aquí' : 'Ventana cerrada: escríbele "hoy" al asistente para reabrirla') : st.whatsapp.server ? 'Falta tu número: ponlo en «Paso a paso».' : 'No disponible por ahora'}</span>{admin && st.whatsapp.lastError && <span className="t-err">Último error: {st.whatsapp.lastError}</span>}</div>
                <Status ok={st.whatsapp.configured} text={st.whatsapp.configured ? (st.whatsapp.windowOpen ? 'Activo' : 'En espera') : 'Sin configurar'} />
              </div>
              <div className="toggle">
                <span className="set-ic orange"><Icon name="spark" size={18} /></span>
                <div className="t"><b>Notas de voz</b><span>Háblale al asistente o haz una llamada de voz: entiende el español dominicano y te responde.</span></div>
                <Status ok text="Listo" />
              </div>
              <WidgetCard />
              <BackupCard />
              <MailCard connected={st.mail.connected} lastAt={st.mail.lastAt} onChanged={q.reload} />
              {admin && <AiEnginesCard engines={st.ai.engines} />}
              <TelegramCard st={st.telegram} onChanged={q.reload} />
              <CalendarCard connected={st.calendar.connected} onChanged={q.reload} />
              {st.callmebot.configured && (
                <div className="toggle">
                  <span className="set-ic gray"><Icon name="send" size={18} /></span>
                  <div className="t"><b>CallMeBot</b><span>Respaldo opcional cuando la ventana de WhatsApp está cerrada</span></div>
                  <Status ok text="Listo" />
                </div>
              )}
              {st.waLink && <a className="btn soft" href={st.waLink} target="_blank" rel="noopener"><Icon name="chat" size={18} />Abrir el chat con Rumbo</a>}
            </div>
          </div>
          <div className="section">
            <div className="section-head"><h3>Acciones</h3></div>
            <div className="card actions-list">
              <button className="action-row" disabled={!!busy} onClick={() => action('test', '/notify/test')}><span className="set-ic blue"><Icon name="send" size={18} /></span><b>{busy === 'test' ? 'Enviando…' : 'Enviar mensaje de prueba'}</b><Icon name="chevron" size={18} /></button>
              <button className={`action-row ${busy === 'sync' ? 'spinning' : ''}`} disabled={!!busy} onClick={() => action('sync', '/sync')}><span className="set-ic violet"><Icon name="sync" size={18} /></span><b>{busy === 'sync' ? 'Sincronizando…' : 'Sincronizar EVA ahora'}</b><Icon name="chevron" size={18} /></button>
              {admin && st.whatsapp.configured && <button className={`action-row ${busy === 'repair' ? 'spinning' : ''}`} disabled={!!busy} onClick={repair}><span className="set-ic green"><Icon name="sync" size={18} /></span><b>{busy === 'repair' ? 'Revisando WhatsApp…' : 'Revisar y reparar WhatsApp'}</b><Icon name="chevron" size={18} /></button>}
              {admin && <button className="action-row" disabled={!!busy} onClick={() => action('cron', '/cron/run')}><span className="set-ic orange"><Icon name="clock" size={18} /></span><b>{busy === 'cron' ? 'Ejecutando…' : 'Ejecutar avisos ahora'}</b><Icon name="chevron" size={18} /></button>}
              <button className="action-row danger hide-desktop" onClick={onLogout}><span className="set-ic red"><Icon name="logout" size={18} /></span><b>Cerrar sesión</b></button>
              <button className="action-row danger" onClick={async () => { haptic(10); await api('/logout-all', { method: 'POST' }).catch(() => {}); navigator.serviceWorker?.controller?.postMessage('clear-api'); toast('Cerré la sesión en todos tus dispositivos'); setTimeout(() => location.reload(), 900); }}><span className="set-ic red"><Icon name="alert" size={18} /></span><b>Cerrar sesión en todos los dispositivos</b><Icon name="chevron" size={18} /></button>
            </div>
            {report && (
              <div className="card">
                <div className="card-head"><h3>Estado de WhatsApp</h3><button className="link-btn spacer" onClick={() => setReport(null)}>Cerrar</button></div>
                <ul className="report">{report.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
