import '../apuntes.css';
import { useEffect, useMemo, useState } from 'react';
import { api, type Course } from '../api';
import { Empty, Modal, PageHead, Segmented, Skeleton, confetti, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';

type Note = { id: number; course: string | null; title: string; body: string; pinned: number; updated_at: number };
type Card = { id: number; course: string | null; front: string; back: string; interval_days: number; reps: number; due_at: number };
type CardsRes = { cards: Card[]; due: number };
const PALETA = [218, 262, 172, 28, 332, 148, 196, 48];
const hue = (s: string | null) => { let h = 0; for (const c of s || 'General') h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };
const ago = (sec: number) => { const m = Math.round((Date.now() / 1000 - sec) / 60); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };

function CourseChips({ names, value, onChange }: { names: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ap-chips">
      {['Todas', ...names].map((n) => <button key={n} className={value === n ? 'on' : ''} onClick={() => { haptic(5); onChange(n); }}>{n}</button>)}
    </div>
  );
}

function NoteEditor({ note, names, onClose, onSaved }: { note: Partial<Note>; names: string[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody] = useState(note.body || '');
  const [course, setCourse] = useState(note.course || '');
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<{ front: string; back: string; keep: boolean }[] | null>(null);
  async function save() {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    setBusy(true);
    try {
      if (note.id) await api(`/notes/${note.id}`, { method: 'PATCH', body: { title, body, course } });
      else await api('/notes', { method: 'POST', body: { title, body, course } });
      haptic(10); onSaved();
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function remove() { if (!note.id) return; await api(`/notes/${note.id}`, { method: 'DELETE' }); toast('Apunte borrado'); onSaved(); }
  async function makeCards() {
    setBusy(true);
    try { const r = await api<{ cards: { front: string; back: string }[] }>('/cards/generate', { method: 'POST', body: { text: `${title}\n${body}`, course } }); setGen(r.cards.map((c) => ({ ...c, keep: true }))); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function saveCards() {
    const keep = (gen || []).filter((g) => g.keep);
    if (!keep.length) { setGen(null); return; }
    await api('/cards', { method: 'POST', body: { course, cards: keep } });
    toast(`${keep.length} tarjetas guardadas`); haptic(12); setGen(null);
  }
  return (
    <Modal title={note.id ? 'Editar apunte' : 'Nuevo apunte'} onClose={save}>
      {gen ? (
        <div className="ap-gen">
          <p className="hint"><Icon name="spark" size={16} />Revisa las tarjetas. Quita las que no sirvan.</p>
          {gen.map((g, i) => (
            <label key={i} className={`ap-gen-row ${g.keep ? '' : 'off'}`}>
              <input type="checkbox" checked={g.keep} onChange={(e) => setGen(gen.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
              <span><b>{g.front}</b><small>{g.back}</small></span>
            </label>
          ))}
          <div className="modal-actions"><button className="btn line" onClick={() => setGen(null)}>Volver</button><button className="btn primary grow-m" onClick={saveCards}>Guardar tarjetas</button></div>
        </div>
      ) : (
        <div className="ap-edit">
          <input className="input ap-title" placeholder="Título (ej.: Leyes de Newton)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título" />
          <select className="input" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Materia">
            <option value="">General</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <textarea className="input ap-body" rows={9} placeholder="Escribe tu apunte…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Apunte" />
          <div className="modal-actions">
            {note.id && <button className="btn danger" onClick={remove} aria-label="Borrar apunte"><Icon name="trash" size={18} /></button>}
            <button className="btn line" onClick={makeCards} disabled={busy}><Icon name="spark" size={17} />Tarjetas con IA</button>
            <button className="btn primary grow-m" onClick={save} disabled={busy}>Guardar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Notes({ names }: { names: string[] }) {
  const notes = useLoad(() => api<Note[]>('/notes'));
  const [course, setCourse] = useState('Todas');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Note> | null>(null);
  const list = useMemo(() => (notes.data || []).filter((n) => (course === 'Todas' || (n.course || 'General') === course) && (!q || (n.title + n.body).toLowerCase().includes(q.toLowerCase()))), [notes.data, course, q]);
  if (!notes.data) return <Skeleton rows={2} hero={false} />;
  const used = Array.from(new Set([...names, ...notes.data.map((n) => n.course || 'General')]));
  return (
    <>
      <div className="ap-bar">
        <div className="ap-search"><Icon name="search" size={17} /><input placeholder="Buscar en tus apuntes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" /></div>
        <button className="btn primary ap-new" onClick={() => { haptic(8); setEdit({}); }}><Icon name="plus" size={18} />Nuevo</button>
      </div>
      <CourseChips names={used} value={course} onChange={setCourse} />
      {list.length === 0 ? <Empty icon="book" title="Aún no hay apuntes" text="Escribe tu primer apunte de una materia. Después Rumbo te arma tarjetas de repaso con IA." /> : (
        <ul className="ap-notes">
          {list.map((n) => (
            <li key={n.id}>
              <button className="ap-note" style={{ ['--h' as string]: hue(n.course) }} onClick={() => setEdit(n)}>
                <span className="ap-tag">{n.course || 'General'}</span>
                <b>{n.title || 'Sin título'}</b>
                <span className="ap-snip">{n.body.slice(0, 140) || 'Sin texto'}</span>
                <small>{ago(n.updated_at)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && <NoteEditor note={edit} names={names} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); notes.reload(); }} />}
    </>
  );
}

function Review({ cards, onDone }: { cards: Card[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [done, setDone] = useState(0);
  const c = cards[i];
  useEffect(() => { setFlip(false); }, [i]);
  async function grade(g: 0 | 1 | 2 | 3) {
    haptic(g === 0 ? 8 : 12);
    await api(`/cards/${c.id}/review`, { method: 'POST', body: { grade: g } }).catch(() => {});
    setDone((d) => d + 1);
    if (i + 1 >= cards.length) { confetti(); onDone(); toast(`Repasaste ${done + 1} tarjetas 🎉`); } else setI(i + 1);
  }
  if (!c) return null;
  return (
    <Modal title={`Repaso · ${i + 1} de ${cards.length}`} onClose={onDone}>
      <div className="ap-review" style={{ ['--h' as string]: hue(c.course) }}>
        <div className="ap-prog"><i style={{ width: `${(i / cards.length) * 100}%` }} /></div>
        <button className={`ap-card ${flip ? 'flip' : ''}`} onClick={() => { haptic(5); setFlip(!flip); }} aria-label="Voltear tarjeta">
          <span className="ap-tag">{c.course || 'General'}</span>
          <b>{flip ? c.back : c.front}</b>
          <small>{flip ? 'Respuesta' : 'Toca para ver la respuesta'}</small>
        </button>
        {flip ? (
          <div className="ap-grades">
            <button className="g0" onClick={() => grade(0)}>Otra vez</button>
            <button className="g1" onClick={() => grade(1)}>Difícil</button>
            <button className="g2" onClick={() => grade(2)}>Bien</button>
            <button className="g3" onClick={() => grade(3)}>Fácil</button>
          </div>
        ) : <p className="ap-hint">Piensa la respuesta antes de voltear.</p>}
      </div>
    </Modal>
  );
}

function Cards({ names }: { names: string[] }) {
  const data = useLoad(() => api<CardsRes>('/cards'));
  const [course, setCourse] = useState('Todas');
  const [reviewing, setReviewing] = useState<Card[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ front: '', back: '', course: '' });
  if (!data.data) return <Skeleton rows={2} hero={false} />;
  const all = data.data.cards;
  const now = Date.now() / 1000;
  const due = all.filter((c) => c.due_at <= now && (course === 'Todas' || (c.course || 'General') === course));
  const shown = all.filter((c) => course === 'Todas' || (c.course || 'General') === course);
  const used = Array.from(new Set([...names, ...all.map((c) => c.course || 'General')]));
  async function add() {
    try { await api('/cards', { method: 'POST', body: f }); setF({ front: '', back: '', course: f.course }); toast('Tarjeta creada'); haptic(10); data.reload(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <>
      <section className="ap-hero">
        <div><small>Para repasar hoy</small><b className="num">{due.length}</b><em>{all.length} tarjetas en total</em></div>
        <button className="btn white" disabled={!due.length} onClick={() => { haptic(10); setReviewing(due); }}><Icon name="play" size={16} />Empezar</button>
      </section>
      <CourseChips names={used} value={course} onChange={setCourse} />
      <button className="ap-add-toggle" onClick={() => setAdding(!adding)}><Icon name="plus" size={16} />{adding ? 'Cerrar' : 'Nueva tarjeta'}</button>
      {adding && (
        <div className="ap-add">
          <input className="input" placeholder="Pregunta / frente" value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} aria-label="Frente" />
          <textarea className="input" rows={3} placeholder="Respuesta / reverso" value={f.back} onChange={(e) => setF({ ...f, back: e.target.value })} aria-label="Reverso" />
          <select className="input" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} aria-label="Materia"><option value="">General</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <button className="btn primary" onClick={add} disabled={!f.front.trim() || !f.back.trim()}>Guardar tarjeta</button>
        </div>
      )}
      {shown.length === 0 ? <Empty icon="spark" title="Sin tarjetas" text="Crea una a mano, o abre un apunte y toca «Tarjetas con IA»." /> : (
        <ul className="ap-cards">
          {shown.map((c) => (
            <li key={c.id} style={{ ['--h' as string]: hue(c.course) }}>
              <span className="ap-dot" />
              <div><b>{c.front}</b><small>{c.course || 'General'} · {c.due_at <= now ? 'toca repasar' : `en ${Math.max(1, Math.round((c.due_at - now) / 86400))} d`}</small></div>
              <button aria-label="Borrar tarjeta" onClick={async () => { await api(`/cards/${c.id}`, { method: 'DELETE' }); data.reload(); }}><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {reviewing && <Review cards={reviewing} onDone={() => { setReviewing(null); data.reload(); }} />}
    </>
  );
}

export function Apuntes() {
  const [tab, setTab] = useState<'apuntes' | 'tarjetas'>('apuntes');
  const courses = useLoad(() => api<Course[]>('/courses'));
  const names = (courses.data || []).map((c) => c.name);
  return (
    <>
      <PageHead eyebrow="Tus materias" title="Estudio" />
      <Segmented label="Estudio" value={tab} onChange={setTab} options={[{ id: 'apuntes', label: 'Apuntes' }, { id: 'tarjetas', label: 'Tarjetas' }]} />
      {tab === 'apuntes' ? <Notes names={names} /> : <Cards names={names} />}
    </>
  );
}
