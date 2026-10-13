// Acciones en el EVA desde la ficha de una tarea: ver el foro y participar, y entregar archivos.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Task } from './api';
import { Modal, haptic, toast } from './components';
import { Icon } from './icons';

type Post = { id: number; parent: number; author: string; mine: boolean; toMe: boolean; text: string; created: number; subject: string };
type Disc = { id: number; name: string; rootId: number | null; total: number; posts: Post[] };

const ago = (s: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(s * 1000));

/** El foro dentro de Rumbo: el tema, tu aporte, lo que te respondieron y los mensajes de tus compañeros. */
export function ForumSheet({ task, draft, onClose, onPosted }: { task: Task; draft?: string; onClose: () => void; onPosted: () => void }) {
  const [data, setData] = useState<{ discussions: Disc[]; can: boolean } | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState<{ to: Post; text: string } | null>(null);
  const [filter, setFilter] = useState<'todo' | 'mio'>('todo');
  const load = () => api<{ discussions: Disc[]; can: boolean }>(`/tasks/${task.id}/forum`).then(setData).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [task.id]);

  const d = data?.discussions[0];
  const root = d?.posts.find((p) => p.id === d.rootId);
  const hasAporte = !!d?.posts.some((p) => p.mine && (p.parent === d.rootId || p.id === d.rootId));
  const others = (d?.posts || []).filter((p) => p.id !== d?.rootId && (filter === 'todo' || p.mine || p.toMe)).reverse();

  if (reply) return <Composer task={task} to={reply.to} initial={reply.text} can={!!data?.can} onClose={() => setReply(null)} onPosted={() => { setReply(null); void load(); onPosted(); }} />;

  return (
    <Modal title={task.title} onClose={onClose}>
      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="sk" style={{ height: 220 }} />}
      {d && (
        <div className="forum">
          {root && (
            <div className="forum-root">
              <span className="label"><Icon name="book" size={15} />Tema del foro · {root.author}</span>
              <p>{root.text.length > 700 ? root.text.slice(0, 700) + '…' : root.text}</p>
            </div>
          )}
          <button className={`btn ${hasAporte ? 'line' : 'primary'} block`} onClick={() => { haptic(8); if (root) setReply({ to: root, text: draft || '' }); }} disabled={!root}>
            <Icon name="chat" size={18} />{hasAporte ? 'Publicar otro aporte' : 'Escribir mi aporte'}
          </button>
          <div className="forum-head">
            <b>{d.total - 1} mensaje{d.total - 1 === 1 ? '' : 's'}</b>
            <div className="chips">
              <button className={`chip-btn ${filter === 'todo' ? 'on' : ''}`} onClick={() => setFilter('todo')}>Todos</button>
              <button className={`chip-btn ${filter === 'mio' ? 'on' : ''}`} onClick={() => setFilter('mio')}>Míos y respuestas</button>
            </div>
          </div>
          <div className="forum-list">
            {others.length === 0 && <p className="small muted center">Nada por aquí todavía.</p>}
            {others.map((p) => (
              <article key={p.id} className={`post ${p.mine ? 'mine' : ''} ${p.toMe ? 'tome' : ''}`}>
                <header><b>{p.mine ? 'Tú' : p.author}</b><span>{ago(p.created)}{p.toMe ? ' · te respondió' : ''}</span></header>
                <p>{p.text.length > 600 ? p.text.slice(0, 600) + '…' : p.text}</p>
                {!p.mine && <button className="link-btn" onClick={() => { haptic(6); setReply({ to: p, text: '' }); }}><Icon name="send" size={15} />Responder</button>}
              </article>
            ))}
          </div>
          {d.total > d.posts.length && <p className="small muted center">Se muestran los {d.posts.length} mensajes más importantes de {d.total}.</p>}
        </div>
      )}
    </Modal>
  );
}

/** Escribir y publicar en el foro. La IA puede preparar la respuesta a un compañero. */
function Composer({ task, to, initial, can, onClose, onPosted }: { task: Task; to: Post; initial: string; can: boolean; onClose: () => void; onPosted: () => void }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState<'' | 'ia' | 'post'>('');
  const [armed, setArmed] = useState(false);
  const isRoot = !to.parent;
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 5000); return () => clearTimeout(t); }, [armed]);

  async function draft() {
    setBusy('ia');
    try {
      if (isRoot) {
        const r = await api<{ aporte?: string }>(`/study/${task.id}`, { method: 'POST', body: { mode: 'foro' } });
        if (r.aporte) setText(r.aporte);
      } else {
        const r = await api<{ text: string }>(`/tasks/${task.id}/forum/draft-reply`, { method: 'POST', body: { author: to.author, text: to.text } });
        setText(r.text);
      }
      haptic(8);
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy('');
  }
  async function publish() {
    if (!armed) { setArmed(true); haptic(6); return; }
    setBusy('post');
    try {
      await api(`/tasks/${task.id}/forum/post`, { method: 'POST', body: { parentId: to.id, message: text } });
      haptic(20); toast(isRoot ? '¡Aporte publicado en el foro!' : `Respuesta publicada para ${to.author}`);
      onPosted();
    } catch (e) { toast((e as Error).message, 'err'); setArmed(false); }
    setBusy('');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast('Copiado. Pégalo en el foro del EVA.'); } catch { toast('No pude copiar: selecciona el texto a mano', 'err'); }
  }

  return (
    <Modal title={isRoot ? 'Mi aporte' : `Responder a ${to.author}`} onClose={onClose}>
      {!isRoot && <blockquote className="quote">{to.text.length > 400 ? to.text.slice(0, 400) + '…' : to.text}</blockquote>}
      <label htmlFor="fp-text" className="sr-only">Tu mensaje</label>
      <textarea id="fp-text" className="input composer" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={isRoot ? 'Escribe tu aporte…' : 'Escribe tu respuesta…'} />
      <div className="composer-row">
        <button className="btn soft" onClick={draft} disabled={!!busy}><Icon name="spark" size={17} />{busy === 'ia' ? 'Escribiendo…' : text ? 'Otra versión con IA' : 'Borrador con IA'}</button>
        <span className="small muted num">{text.trim().split(/\s+/).filter(Boolean).length} palabras</span>
      </div>
      {can ? (
        <button className={`btn primary lg block ${armed ? 'armed' : ''}`} onClick={publish} disabled={!!busy || text.trim().length < 5}>
          <Icon name="send" size={18} />{busy === 'post' ? 'Publicando…' : armed ? 'Toca otra vez para publicar en el EVA' : 'Publicar en el foro'}
        </button>
      ) : (
        <>
          <button className="btn primary lg block" onClick={copy} disabled={text.trim().length < 5}><Icon name="upload" size={18} />Copiar para pegarlo en el EVA</button>
          <p className="small muted center">El EVA no deja publicar desde aplicaciones. Copia el texto y pégalo en el foro.</p>
        </>
      )}
      {task.url && <a className="link-btn center-self" href={task.url} target="_blank" rel="noopener"><Icon name="link" size={15} />Abrir el foro en el EVA</a>}
      <p className="small muted center">Revisa siempre lo que escribió la IA y ponle tu toque antes de publicar.</p>
    </Modal>
  );
}

type Sub = { status: string; files: { name: string; size: number }[]; canEdit: boolean; canSubmit: boolean; enabled: boolean; locked: boolean; can: { submit: boolean } };

/** Entregar archivos a la tarea del EVA desde el teléfono. */
export function SubmitPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const [st, setSt] = useState<Sub | null>(null);
  const [err, setErr] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<'' | 'up' | 'send'>('');
  const input = useRef<HTMLInputElement>(null);
  const load = () => api<Sub>(`/tasks/${task.id}/submission`).then(setSt).catch((e) => setErr(e instanceof ApiError ? e.message : 'No pude revisar tu entrega.'));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [task.id]);

  if (err) return null; // si el EVA no deja revisar la entrega, la ficha sigue igual (con «Abrir en el EVA»)
  if (!st) return <div className="sk" style={{ height: 64, marginBottom: 12 }} />;
  if (!st.can.submit || !st.enabled) return null;
  const submitted = st.status === 'submitted';

  async function upload() {
    setBusy('up');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f, f.name));
      const r = await fetch(`/api/tasks/${task.id}/submission`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      haptic(15); setFiles([]);
      toast(st!.canSubmit ? 'Archivos subidos. Falta «Enviar para calificar».' : '¡Archivos entregados en el EVA!');
      await load(); onDone();
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy('');
  }
  async function submit() {
    setBusy('send');
    try { await api(`/tasks/${task.id}/submission/submit`, { method: 'POST' }); haptic(20); toast('¡Enviada para calificar! 🎉'); await load(); onDone(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy('');
  }

  return (
    <div className="submit-panel">
      <span className="label"><Icon name="upload" size={15} />Entrega en el EVA · {submitted ? 'enviada para calificar ✓' : st.files.length ? 'borrador guardado' : 'sin archivos'}</span>
      {st.files.length > 0 && <ul className="sub-files">{st.files.map((f) => <li key={f.name}><Icon name="check" size={14} />{f.name}</li>)}</ul>}
      {st.canEdit && !st.locked && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => setFiles([...(e.target.files || [])])} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.zip,.txt" />
          {files.length > 0 && <ul className="sub-files new">{files.map((f) => <li key={f.name}><Icon name="book" size={14} />{f.name} <small>({Math.max(1, Math.round(f.size / 1024))} KB)</small></li>)}</ul>}
          <div className="ts-row">
            <button className="btn line grow" onClick={() => input.current?.click()} disabled={!!busy}><Icon name="plus" size={17} />{files.length ? 'Cambiar archivos' : st.files.length ? 'Reemplazar archivos' : 'Elegir archivos'}</button>
            {files.length > 0 && <button className="btn primary grow" onClick={upload} disabled={!!busy}><Icon name="upload" size={17} />{busy === 'up' ? 'Subiendo…' : 'Subir al EVA'}</button>}
          </div>
          {st.files.length > 0 && files.length > 0 && <p className="small muted">Ojo: los archivos nuevos reemplazan los que ya subiste.</p>}
        </>
      )}
      {st.canSubmit && st.files.length > 0 && !submitted && (
        <button className="btn primary block" onClick={submit} disabled={!!busy}><Icon name="send" size={17} />{busy === 'send' ? 'Enviando…' : 'Enviar para calificar'}</button>
      )}
    </div>
  );
}
