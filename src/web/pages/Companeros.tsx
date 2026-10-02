// Compañeros (solo el administrador): invitar con un enlace, ver quién usa Rumbo y ayudar si olvidan la contraseña.
import { useState, type FormEvent } from 'react';
import { api, dateLabel } from '../api';
import { Empty, Modal, PageHead, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';

type Person = { id: number; login: string; name: string; role: string; active: number; created_at: number; last_seen: number | null; eva_last_sync: string | null; tasks: number; whatsapp: number; ai_today: string | null };
type Feedback = { id: number; text: string; created_at: number; name: string | null };
type Invite = { code: string; note: string | null; created_at: number; expires_at: number };

const inviteText = (link: string, note?: string | null) =>
  `${note ? `¡Klk, ${note}! ` : '¡Klk! '}Te invito a Rumbo, la app que junta tus tareas, notas y avisos de la UAPA y te avisa antes de cada entrega 📚\n\nEntra aquí y crea tu cuenta (el enlace es solo para ti):\n${link}`;

export function Companeros() {
  const q = useLoad(() => api<{ users: Person[]; invites: Invite[]; feedback: Feedback[]; aiLimit: number }>('/admin/users'));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ link: string; note: string } | null>(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  if (q.error) return <div className="error">{q.error}</div>;
  if (!q.data) return <Skeleton hero={false} rows={3} />;
  const origin = location.origin;

  async function invite(e: FormEvent) {
    e.preventDefault(); setBusy(true); haptic(8);
    try { const r = await api<{ link: string }>('/admin/invites', { method: 'POST', body: { note } }); setMade({ link: r.link, note }); setNote(''); q.reload(); }
    catch (e2) { toast((e2 as Error).message, 'err'); }
    setBusy(false);
  }
  async function share(link: string, n?: string | null) {
    const text = inviteText(link, n);
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ text }); return; } catch { /* canceló: no pasa nada */ } }
    try { await navigator.clipboard.writeText(text); toast('Invitación copiada'); } catch { toast('No se pudo copiar', 'err'); }
  }
  async function toggle(p: Person) {
    if (p.active && !confirmPause(p)) return;
    try { await api(`/admin/users/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); toast(p.active ? `${p.name.split(' ')[0]} quedó en pausa` : `${p.name.split(' ')[0]} volvió a Rumbo`); q.reload(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function reset(p: Person) {
    try { const r = await api<{ password: string }>(`/admin/users/${p.id}/reset`, { method: 'POST' }); setTemp({ name: p.name, password: r.password }); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const ago = (s: number | null) => (s ? dateLabel(s) : 'nunca');

  return (
    <>
      <PageHead eyebrow="Solo tú ves esto" title="Compañeros" />
      <div className="section">
        <div className="section-head"><h3>Invitar a alguien</h3></div>
        <form className="card form-stack" onSubmit={invite}>
          <p className="small muted">Cada invitación sirve para <b>una</b> persona y vence en 14 días. Cada quien ve solo sus propios datos.</p>
          <div className="field"><label htmlFor="inv-n">¿Para quién? (opcional)</label>
            <input id="inv-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ana" maxLength={60} autoComplete="off" /></div>
          <button className="btn primary lg block" type="submit" disabled={busy}><Icon name="users" size={18} />{busy ? 'Creando…' : 'Crear invitación'}</button>
        </form>
      </div>

      {q.data.invites.length > 0 && (
        <div className="section">
          <div className="section-head"><h3>Invitaciones sin usar</h3></div>
          <div className="card">
            <ul className="people">
              {q.data.invites.map((i) => (
                <li key={i.code} className="person">
                  <span className="av" aria-hidden="true"><Icon name="send" size={18} /></span>
                  <span className="who"><b>{i.note || 'Sin nombre'}</b><small>Vence el {dateLabel(i.expires_at)}</small></span>
                  <button className="btn soft sm" onClick={() => share(`${origin}/#unirme/${i.code}`, i.note)}>Enviar</button>
                  <button className="icon-btn" aria-label={`Anular la invitación de ${i.note || 'sin nombre'}`} onClick={async () => { await api(`/admin/invites/${i.code}`, { method: 'DELETE' }); toast('Invitación anulada'); q.reload(); }}><Icon name="trash" size={18} /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h3>En Rumbo ({q.data.users.filter((u) => u.active).length})</h3></div>
        <div className="card">
          {q.data.users.length <= 1 ? <Empty icon="users" title="Todavía estás solo" text="Crea una invitación y mándasela por WhatsApp." /> : null}
          <ul className="people">
            {q.data.users.map((p) => (
              <li key={p.id} className={`person ${p.active ? '' : 'off'}`}>
                <span className="av" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
                <span className="who">
                  <b>{p.name}{p.role === 'admin' ? ' (tú)' : ''}</b>
                  <small>{p.login} · entró {ago(p.last_seen)}</small>
                  <span className="person-tags">
                    <i className={p.eva_last_sync ? 'ok' : ''}>EVA {p.eva_last_sync ? '✓' : '—'}</i>
                    <i className={p.whatsapp ? 'ok' : ''}>WhatsApp {p.whatsapp ? '✓' : '—'}</i>
                    {p.role !== 'admin' && <i>IA hoy {Number(p.ai_today || 0)}/{q.data!.aiLimit}</i>}
                    {!p.active && <i className="off">En pausa</i>}
                  </span>
                </span>
                {p.role !== 'admin' && (
                  <>
                    <button className="btn line sm" onClick={() => reset(p)} aria-label={`Contraseña temporal para ${p.name}`}>Clave</button>
                    <button className="btn soft sm" onClick={() => toggle(p)}>{p.active ? 'Pausar' : 'Activar'}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {q.data.feedback.length > 0 && (
        <div className="section">
          <div className="section-head"><h3>Comentarios recibidos</h3></div>
          <div className="card">
            <ul className="people">
              {q.data.feedback.map((f) => (
                <li key={f.id} className="person">
                  <span className="av" aria-hidden="true">{(f.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="who"><b>{f.name || 'Cuenta borrada'}</b><small className="fb-text">{f.text}</small><small>{dateLabel(f.created_at)}</small></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {made && (
        <Modal title="Invitación lista" onClose={() => setMade(null)}>
          <p className="hint"><Icon name="alert" size={16} />Mándale este enlace{made.note ? ` a ${made.note}` : ''}. Al abrirlo crea su cuenta con su matrícula y Rumbo le guía para conectar su EVA.</p>
          <div className="invite-link">{made.link}</div>
          <a className="btn primary lg block" href={`https://wa.me/?text=${encodeURIComponent(inviteText(made.link, made.note))}`} target="_blank" rel="noopener"><Icon name="chat" size={18} />Enviar por WhatsApp</a>
          <button className="btn line block" onClick={() => share(made.link, made.note)}><Icon name="link" size={18} />Compartir o copiar</button>
        </Modal>
      )}
      {temp && (
        <Modal title="Contraseña temporal" onClose={() => setTemp(null)}>
          <p className="hint"><Icon name="alert" size={16} />Dásela a {temp.name.split(' ')[0]} en persona o por mensaje privado. Que entre con ella y la cambie en Ajustes → Mi cuenta.</p>
          <div className="invite-link center">{temp.password}</div>
          <button className="btn primary block" onClick={() => setTemp(null)}>Listo</button>
        </Modal>
      )}
    </>
  );
}

function confirmPause(p: Person) {
  // Sin ventanas del navegador: la pausa se puede deshacer, así que basta con avisar.
  toast(`Pausando a ${p.name.split(' ')[0]}… (puedes reactivarlo cuando quieras)`);
  return true;
}
