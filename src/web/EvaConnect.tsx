// Conectar el EVA: matrícula y contraseña (lo normal) y, como último recurso, el enlace del EVA.
// Está aparte para usarlo desde «Paso a paso» (Conectar) y desde Ajustes sin importarse en círculo.
import { useState, type FormEvent } from 'react';
import { api } from './api';
import { Modal, haptic, toast } from './components';
import { Icon } from './icons';

const FORGOT = 'https://eva.uapa.edu.do/login/forgot_password.php';

export function EvaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [user, setUser] = useState(() => { try { return localStorage.getItem('rumbo-eva-user') || ''; } catch { return ''; } });
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [link, setLink] = useState('');
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [errAdv, setErrAdv] = useState('');

  const finish = (r: { user: string }) => { setPass(''); haptic(12); toast(`¡Conectado, ${r.user.split(' ')[0]}! Trayendo tus tareas…`); onDone(); };

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api<{ user: string }>('/eva/connect', { method: 'POST', body: { username: user, password: pass } });
      try { localStorage.setItem('rumbo-eva-user', user.trim()); } catch { /* sin almacenamiento */ }
      finish(r);
    } catch (e2) {
      const m = (e2 as Error).message;
      setErr(m);
      if (/opción avanzada/i.test(m)) setAdv(true); // el EVA no dejó entrar por contraseña: se muestra la otra vía
    }
    setBusy(false);
  }
  async function submitLink(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErrAdv('');
    try { finish(await api<{ user: string }>('/eva/token', { method: 'POST', body: { value: link } })); }
    catch (e2) { setErrAdv((e2 as Error).message); }
    setBusy(false);
  }

  // Enlace oficial del EVA para apps (el mismo que usa la app de Moodle).
  const [passport] = useState(() => Math.random().toString(36).slice(2, 10));
  const launch = `https://eva.uapa.edu.do/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;

  // Login oficial: el EVA devuelve el token a Rumbo (/eva-token) en vez de a la app de Moodle.
  const official = `https://eva.uapa.edu.do/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=${encodeURIComponent(`${location.origin}/eva-token#`)}`;

  return (
    <Modal title="Conectar tu EVA" onClose={onClose}>
      <div className="form-stack">
        <a className="btn primary lg block" href={official}><Icon name="link" size={18} />Entrar con el login oficial de la UAPA</a>
        <p className="small muted center">Entras en la página oficial del EVA y al terminar vuelves a Rumbo ya conectado. Rumbo nunca ve tu contraseña.</p>
      </div>
      <form onSubmit={submit} className="form-stack">
        <p className="small muted">O escribe la misma matrícula y contraseña con las que entras al EVA. Toma 10 segundos.</p>
        <div className="field"><label htmlFor="eva-u">Matrícula</label>
          <input id="eva-u" className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" inputMode="numeric" placeholder="100123456" required /></div>
        <div className="field"><label htmlFor="eva-p">Contraseña del EVA</label>
          <div className="input-with-btn">
            <input id="eva-p" className="input" type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
            <button type="button" className="link-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>{show ? 'Ocultar' : 'Ver'}</button>
          </div></div>
        <p className="hint"><Icon name="alert" size={16} />Tu contraseña va directo al EVA una sola vez para crear la conexión. Rumbo <b>no la guarda</b>.</p>
        {err && <div className="auth-error" role="alert"><Icon name="alert" size={16} />{err}</div>}
        <button className="btn primary lg block" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Conectar'}</button>
        <a className="link-btn center" href={FORGOT} target="_blank" rel="noopener">¿Olvidaste tu contraseña del EVA?</a>
      </form>

      <details className="adv-connect" open={adv} onToggle={(e) => setAdv((e.target as HTMLDetailsElement).open)}>
        <summary>No me deja entrar · opción avanzada</summary>
        <form onSubmit={submitLink} className="form-stack">
          <p className="small muted">Solo si lo de arriba no funciona. Hazlo en una computadora con Chrome o Edge:</p>
          <ol className="steps">
            <li>Entra al <a href="https://eva.uapa.edu.do/my/" target="_blank" rel="noopener"><b>EVA</b></a> y deja esa pestaña abierta.</li>
            <li>Pulsa <b>F12</b> y abre la pestaña <b>Network</b> (o <b>Red</b>).</li>
            <li>Copia este enlace, pégalo en la barra de direcciones de esa pestaña y pulsa Enter. Si no pasa nada, es normal.
              <button type="button" className="btn line block" onClick={async () => { try { await navigator.clipboard.writeText(launch); toast('Enlace copiado'); } catch { toast('No se pudo copiar: mantén presionado el enlace', 'err'); } }}><Icon name="link" size={18} />Copiar enlace</button></li>
            <li>En Network escribe <b>launch</b> en el filtro y abre <b>launch.php</b> → <b>Headers</b> → <b>Location</b>. Copia ese valor: empieza con <b>moodlemobile://token=</b>.</li>
            <li>Pégalo aquí. No lo compartas: es como la llave de tu EVA.</li>
          </ol>
          <div className="field"><label htmlFor="eva-l">Enlace del EVA</label>
            <input id="eva-l" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="moodlemobile://token=…" autoComplete="off" required /></div>
          {errAdv && <div className="auth-error" role="alert"><Icon name="alert" size={16} />{errAdv}</div>}
          <button className="btn line lg block" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Conectar con el enlace'}</button>
        </form>
      </details>
    </Modal>
  );
}
