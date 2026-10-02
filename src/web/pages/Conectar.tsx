// Conexiones: todo lo que se conecta con Rumbo, paso a paso y con un solo botón cada cosa.
// Pensado para que un compañero nuevo lo deje listo en 2 minutos sin ayuda.
import { useEffect, useState, type FormEvent } from 'react';
import { api, dateLabel, type CareersRes } from '../api';
import { enablePush, pushState, type PushState } from '../push';
import { Modal, PageHead, Ring, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';
import { CalendarCard, MailCard, TelegramCard, WidgetCard, type SettingsRes } from './Ajustes';

type Step = { id: string; done: boolean };

export function Conectar() {
  const q = useLoad(() => api<SettingsRes>('/settings'));
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { pushState().then(setPush).catch(() => setPush('unsupported')); }, []);
  if (q.error) return <div className="error">{q.error}</div>;
  if (!q.data) return <Skeleton hero={false} rows={4} />;
  const st = q.data.status;
  const steps: Step[] = [
    { id: 'eva', done: st.eva.configured && !st.eva.error },
    { id: 'push', done: push === 'on' },
    { id: 'wa', done: st.callmebot.configured },
    { id: 'carrera', done: !!st.career },
  ];
  const done = steps.filter((s) => s.done).length;
  const n = (id: string) => steps.findIndex((s) => s.id === id) + 1;

  return (
    <>
      <PageHead eyebrow="Paso a paso" title="Conexiones" />
      <div className="conn-hero card">
        <Ring value={Math.round((done / steps.length) * 100)} size={74} stroke={8} light={false} display={<b className="num">{done}/{steps.length}</b>} />
        <div>
          <b>{done === steps.length ? '¡Todo listo! 🎉' : `Te ${steps.length - done === 1 ? 'falta 1 paso' : `faltan ${steps.length - done} pasos`}`}</b>
          <span>{done === steps.length ? 'Rumbo ya trae tus tareas, notas y avisos solo.' : 'Cada paso es un botón. Lo más importante es el EVA.'}</span>
        </div>
      </div>

      <ol className="conn-list" aria-label="Pasos para conectar Rumbo">
        <EvaStep n={n('eva')} st={st.eva} onChanged={q.reload} />
        <PushStep n={n('push')} state={push} onChanged={async () => setPush(await pushState())} />
        <WaStep n={n('wa')} cmb={st.callmebot} onChanged={q.reload} />
        <CareerStep n={n('carrera')} current={st.career} onChanged={q.reload} />
      </ol>

      <div className="section">
        <div className="section-head"><h3>Extras (opcionales)</h3></div>
        <div className="card">
          <CalendarCard connected={st.calendar.connected} onChanged={q.reload} />
          {st.telegram.configured && <TelegramCard st={st.telegram} onChanged={q.reload} />}
          <WidgetCard />
          <MailCard connected={st.mail.connected} lastAt={st.mail.lastAt} onChanged={q.reload} />
        </div>
      </div>
    </>
  );
}

function StepCard({ n, done, icon, tone, title, text, children }: { n: number; done: boolean; icon: string; tone: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <li className={`conn card ${done ? 'done' : ''}`}>
      <div className="conn-top">
        <span className={`conn-n ${done ? 'ok' : ''}`} aria-hidden="true">{done ? <Icon name="check" size={16} style={{ strokeWidth: 3 }} /> : n}</span>
        <span className={`set-ic ${tone}`} aria-hidden="true"><Icon name={icon} size={18} /></span>
        <div className="t"><b>{title}<span className="sr-only">{done ? ' (listo)' : ' (pendiente)'}</span></b><span>{text}</span></div>
      </div>
      {children}
    </li>
  );
}

// ---------- 1. EVA ----------
function EvaStep({ n, st, onChanged }: { n: number; st: SettingsRes['status']['eva']; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const ok = st.configured && !st.error;
  async function sync() {
    setSyncing(true); haptic(8);
    try { await api('/sync', { method: 'POST' }); toast('Listo: tus tareas y notas ya están en Rumbo ✅'); window.dispatchEvent(new Event('rumbo:badges')); }
    catch (e) { toast((e as Error).message, 'err'); }
    setSyncing(false); onChanged();
  }
  const text = ok ? `Conectado${st.user ? ' como ' + st.user : ''}${st.lastSync ? ' · última vez ' + dateLabel(st.lastSync) : ''}.`
    : st.configured ? `La conexión falló: ${st.error}` : 'Trae solo tus asignaturas, entregas, notas y avisos. Es lo único imprescindible.';
  return (
    <StepCard n={n} done={ok} icon="book" tone="violet" title="Tu EVA de la UAPA" text={text}>
      {ok ? (
        <div className="conn-actions">
          <button className={`btn soft ${syncing ? 'spinning' : ''}`} onClick={sync} disabled={syncing}><Icon name="sync" size={18} />{syncing ? 'Trayendo…' : 'Sincronizar ahora'}</button>
          <button className="btn line" onClick={() => setOpen(true)}>Reconectar</button>
        </div>
      ) : (
        <button className="btn primary lg block" onClick={() => { haptic(8); setOpen(true); }}><Icon name="link" size={18} />Conectar mi EVA</button>
      )}
      {open && <EvaModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); void sync(); }} />}
    </StepCard>
  );
}

function EvaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'clave' | 'enlace'>('clave');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = mode === 'clave'
        ? await api<{ user: string }>('/eva/connect', { method: 'POST', body: { username: user, password: pass } })
        : await api<{ user: string }>('/eva/token', { method: 'POST', body: { value: link } });
      setPass(''); haptic(12); toast(`¡Conectado, ${r.user.split(' ')[0]}! Trayendo tus tareas…`); onDone();
    } catch (e2) { setErr((e2 as Error).message); if (/enlace del EVA/.test((e2 as Error).message)) setMode('enlace'); }
    setBusy(false);
  }
  // Enlace oficial del EVA para apps (el mismo que usa la app de Moodle).
  const passport = Math.random().toString(36).slice(2, 10);
  const launch = `https://eva.uapa.edu.do/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;
  return (
    <Modal title="Conectar tu EVA" onClose={onClose}>
      <div className="seg2" role="tablist" aria-label="Forma de conectar">
        <button role="tab" type="button" aria-selected={mode === 'clave'} className={mode === 'clave' ? 'on' : ''} onClick={() => { setMode('clave'); setErr(''); }}>Con mi matrícula</button>
        <button role="tab" type="button" aria-selected={mode === 'enlace'} className={mode === 'enlace' ? 'on' : ''} onClick={() => { setMode('enlace'); setErr(''); }}>Con el enlace del EVA</button>
      </div>
      <form onSubmit={submit} className="form-stack">
        {mode === 'clave' ? (
          <>
            <div className="field"><label htmlFor="eva-u">Matrícula</label>
              <input id="eva-u" className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" inputMode="numeric" placeholder="100123456" required /></div>
            <div className="field"><label htmlFor="eva-p">Contraseña del EVA</label>
              <div className="input-with-btn">
                <input id="eva-p" className="input" type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
                <button type="button" className="link-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>{show ? 'Ocultar' : 'Ver'}</button>
              </div></div>
            <p className="hint"><Icon name="alert" size={16} />Tu contraseña va directo al EVA una sola vez para crear la conexión. Rumbo <b>no la guarda</b>.</p>
          </>
        ) : (
          <>
            <ol className="steps">
              <li>Toca <a href={launch} target="_blank" rel="noopener"><b>Abrir el EVA</b></a> y entra como siempre.</li>
              <li>Al terminar, el navegador intenta abrir una dirección que empieza por <b>moodlemobile://token=</b>. Mantén presionada la barra de direcciones y cópiala.</li>
              <li>Pégala aquí abajo.</li>
            </ol>
            <div className="field"><label htmlFor="eva-l">Enlace del EVA</label>
              <input id="eva-l" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="moodlemobile://token=…" autoComplete="off" required /></div>
          </>
        )}
        {err && <div className="auth-error" role="alert"><Icon name="alert" size={16} />{err}</div>}
        <button className="btn primary lg block" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Conectar'}</button>
      </form>
    </Modal>
  );
}

// ---------- 2. Notificaciones ----------
function PushStep({ n, state, onChanged }: { n: number; state: PushState | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const on = state === 'on';
  async function enable() {
    setBusy(true); haptic(8);
    try {
      await enablePush();
      const r = await api<{ ok: boolean; error?: string }>('/push/test', { method: 'POST' });
      toast(r.ok ? '¡Listo! Te llegó una notificación de prueba' : `Activadas, pero la prueba falló: ${r.error}`, r.ok ? 'ok' : 'err');
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false); onChanged();
  }
  const text = on ? 'Activas en este teléfono: entregas, notas nuevas, pagos y avisos.'
    : state === 'ios-install' ? 'En iPhone: toca Compartir → «Agregar a inicio», abre Rumbo desde ahí y vuelve a este paso.'
    : state === 'denied' ? 'Las bloqueaste. Toca el candado junto a la dirección → Notificaciones → Permitir.'
    : state === 'unsupported' ? 'Este navegador no permite notificaciones. Prueba con Chrome.'
    : 'Te aviso antes de cada entrega, cuando te califican y cuando abre la ventana de pago.';
  return (
    <StepCard n={n} done={on} icon="bell" tone="blue" title="Notificaciones" text={text}>
      {!on && state !== 'ios-install' && state !== 'denied' && state !== 'unsupported' && (
        <button className="btn primary lg block" onClick={enable} disabled={busy || state === null}><Icon name="bell" size={18} />{busy ? 'Activando…' : 'Activar notificaciones'}</button>
      )}
    </StepCard>
  );
}

// ---------- 3. Avisos por WhatsApp (CallMeBot) ----------
function WaStep({ n, cmb, onChanged }: { n: number; cmb: SettingsRes['status']['callmebot']; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true); haptic(8);
    try { const r = await api<{ ok: boolean; error?: string }>('/notify/test', { method: 'POST' }); toast(r.ok ? 'Te mandé tu resumen por WhatsApp ✅' : `No se pudo: ${r.error}`, r.ok ? 'ok' : 'err'); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function remove() {
    try { await api('/callmebot/remove', { method: 'POST' }); toast('Avisos por WhatsApp apagados'); onChanged(); } catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <StepCard n={n} done={cmb.configured} icon="chat" tone="green" title="Avisos por WhatsApp"
      text={cmb.configured ? `Te llegan a +${cmb.number}: resumen del día, entregas, notas, pagos y avisos.` : 'Recibe en tu WhatsApp el resumen del día y todos los avisos de Rumbo. Gratis, con CallMeBot.'}>
      {cmb.configured ? (
        <div className="conn-actions">
          <button className="btn soft" onClick={test} disabled={busy}><Icon name="send" size={18} />{busy ? 'Enviando…' : 'Enviar prueba'}</button>
          <button className="btn line" onClick={() => setOpen(true)}>Cambiar</button>
          <button className="btn line" onClick={remove}>Apagar</button>
        </div>
      ) : (
        <button className="btn primary lg block" onClick={() => { haptic(8); setOpen(true); }}><Icon name="chat" size={18} />Activar avisos por WhatsApp</button>
      )}
      {open && <CallMeBotModal cmb={cmb} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </StepCard>
  );
}

function CallMeBotModal({ cmb, onClose, onDone }: { cmb: SettingsRes['status']['callmebot']; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState(cmb.number ? `+${cmb.number}` : '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bot = `+${cmb.bot.slice(0, 2)} ${cmb.bot.slice(2, 5)} ${cmb.bot.slice(5, 8)} ${cmb.bot.slice(8)}`;
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/callmebot/setup', { method: 'POST', body: { phone, apikey: key } }); haptic(12); toast('¡Listo! Revisa tu WhatsApp: te llegó un mensaje de prueba ✅'); onDone(); }
    catch (e2) { setErr((e2 as Error).message); }
    setBusy(false);
  }
  return (
    <Modal title="Avisos por WhatsApp" onClose={onClose}>
      <ol className="steps">
        <li><b>Activa CallMeBot</b> (solo una vez): toca el botón y envía el mensaje que ya va escrito.
          <a className="btn primary block" href={`https://wa.me/${cmb.bot}?text=${encodeURIComponent(cmb.activate)}`} target="_blank" rel="noopener"><Icon name="chat" size={18} />Abrir WhatsApp</a>
          <span className="small muted">Si no abre, agrega el número <b className="num">{bot}</b> y mándale: «{cmb.activate}».</span></li>
        <li>En uno o dos minutos CallMeBot te responde con tu <b>clave (apikey)</b>, unos números. Cópiala.</li>
        <li>Escribe tu número y esa clave aquí abajo. Te mando un mensaje de prueba para confirmar.</li>
      </ol>
      <form className="form-stack" onSubmit={submit}>
        <div className="field"><label htmlFor="cmb-p">Tu número de WhatsApp</label>
          <input id="cmb-p" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="809 555 1234" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
        <div className="field"><label htmlFor="cmb-k">Clave de CallMeBot (apikey)</label>
          <input id="cmb-k" className="input num" inputMode="numeric" autoComplete="off" placeholder="1234567" value={key} onChange={(e) => setKey(e.target.value)} required /></div>
        {err && <div className="auth-error" role="alert"><Icon name="alert" size={16} />{err}</div>}
        <button className="btn primary lg block" type="submit" disabled={busy}>{busy ? 'Probando…' : 'Probar y guardar'}</button>
      </form>
      <p className="small muted">CallMeBot es un servicio gratis para uso personal. A veces tarda unos minutos en entregar; las notificaciones del teléfono siguen llegando igual.</p>
    </Modal>
  );
}

// ---------- 4. Carrera ----------
function CareerStep({ n, current, onChanged }: { n: number; current: string; onChanged: () => void }) {
  const [list, setList] = useState<CareersRes['careers'] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!current) api<CareersRes>('/careers').then((r) => setList(r.careers)).catch(() => setList([])); }, [current]);
  async function save() {
    if (!pick) return;
    setBusy(true);
    try { const r = await api<{ count: number; enCurso: number }>('/pensum/career', { method: 'POST', body: { career: pick } }); toast(`Pensum cargado: ${r.count} asignaturas`); onChanged(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  const ready = (list || []).filter((c) => c.available);
  return (
    <StepCard n={n} done={!!current} icon="cap" tone="orange" title="Tu carrera" text={current ? `${current}: tu pensum se marca solo con lo que cursas y apruebas.` : 'Elige tu carrera para ver tu pensum y cuánto te falta.'}>
      {!current && (
        <div className="conn-inline">
          <label htmlFor="car" className="sr-only">Carrera</label>
          <select id="car" className="input" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!list}>
            <option value="">{list ? 'Elige tu carrera…' : 'Cargando…'}</option>
            {ready.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn primary" onClick={save} disabled={!pick || busy}>{busy ? '…' : 'Listo'}</button>
        </div>
      )}
      {!current && list && ready.length < list.length && <p className="small muted">¿No ves tu carrera? Todavía no está cargada en Rumbo; puedes armar tu pensum a mano en la pantalla Pensum.</p>}
    </StepCard>
  );
}
