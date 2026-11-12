// Estudio → Cuadernos: un cuaderno por materia, con hojas rayadas (tus apuntes y lo que guardas de la IA, cada hoja con su fecha)
// y fichas de repaso. Se ve como un cuaderno de verdad: portada con espiral, hojas con margen rojo y letra de mano.
import { useMemo, useState, type ComponentType } from 'react';
import { api, type Course } from './api';
import { Empty, Segmented, Skeleton, haptic, useLoad } from './components';
import { Icon } from './icons';
import { ArmarCuadernos, PreguntaCuadernos } from './EstudioIA';

export type NoteT = { id: number; course: string | null; title: string; body: string; pinned: number; created_at: number; updated_at: number };
type CardT = { id: number; course: string | null; front: string; back: string };
export type EditorProps = { note: Partial<NoteT>; names: string[]; onClose: () => void; onSaved: () => void };

const PALETA = ['#2f7bff', '#7c5cff', '#12a594', '#f08c2e', '#e0508a', '#3a9d5d', '#0ea5c6', '#c9a227'];
const colorOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };
const fecha = (sec: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(sec * 1000)).replace('.', '');

/** Texto de la hoja: **negritas**, «## títulos» y viñetas, alineado con las rayas del papel. */
function Hoja({ text }: { text: string }) {
  const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  return (
    <div className="nb-text">
      {text.split('\n').map((l, i) => {
        const t = l.trim();
        if (!t) return <p key={i} className="gap" />;
        if (/^#{1,3}\s/.test(t)) return <h4 key={i}>{bold(t.replace(/^#{1,3}\s+/, ''))}</h4>;
        if (/^[-•*]\s+/.test(t)) return <p key={i} className="li">{bold(t.replace(/^[-•*]\s+/, ''))}</p>;
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}

function Portada({ name, color, hojas, fichas, onOpen }: { name: string; color: string; hojas: number; fichas: number; onOpen: () => void }) {
  return (
    <button className="nb-cover" style={{ ['--c' as string]: color }} onClick={() => { haptic(8); onOpen(); }} aria-label={`Abrir cuaderno de ${name}`}>
      <span className="nb-rings" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
      <svg className="nb-doodle" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M14 96 q14 -22 28 0 t28 0 t28 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M86 22 l4 10 11 1 -8 7 3 11 -10 -6 -10 6 3 -11 -8 -7 11 -1z" fill="currentColor" opacity=".9" />
        <circle cx="26" cy="30" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M20 58 l12 0 M26 52 l0 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="nb-band" aria-hidden="true" />
      <span className="nb-label"><b>{name}</b><small>Cuaderno</small></span>
      <span className="nb-meta"><i>{hojas} hoja{hojas === 1 ? '' : 's'}</i><i>{fichas} ficha{fichas === 1 ? '' : 's'}</i></span>
    </button>
  );
}

export function Cuadernos({ names, Editor, List, onReview }: { names: string[]; Editor: ComponentType<EditorProps>; List: ComponentType<{ names: string[] }>; onReview: () => void }) {
  const notes = useLoad(() => api<NoteT[]>('/notes'));
  const cards = useLoad(() => api<{ cards: CardT[] }>('/cards'));
  const courses = useLoad(() => api<Course[]>('/courses'));
  const [view, setView] = useState<'estanteria' | 'lista'>('estanteria');
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<'hojas' | 'fichas'>('hojas');
  const [edit, setEdit] = useState<Partial<NoteT> | null>(null);

  const books = useMemo(() => {
    const map = new Map<string, { name: string; color: string; hojas: number; fichas: number; last: number }>();
    for (const c of courses.data || []) map.set(c.name, { name: c.name, color: c.color || colorOf(c.name), hojas: 0, fichas: 0, last: 0 });
    for (const n of notes.data || []) { const k = n.course || 'General'; const b = map.get(k) || { name: k, color: colorOf(k), hojas: 0, fichas: 0, last: 0 }; b.hojas++; b.last = Math.max(b.last, n.updated_at); map.set(k, b); }
    for (const c of cards.data?.cards || []) { const k = c.course || 'General'; const b = map.get(k) || { name: k, color: colorOf(k), hojas: 0, fichas: 0, last: 0 }; b.fichas++; map.set(k, b); }
    return [...map.values()].sort((a, b) => b.last - a.last || a.name.localeCompare(b.name, 'es'));
  }, [notes.data, cards.data, courses.data]);

  if (!notes.data || !cards.data || !courses.data) return <Skeleton rows={2} hero={false} />;
  const reload = () => { notes.reload(); cards.reload(); };

  // ---------- Cuaderno abierto ----------
  if (open) {
    const book = books.find((b) => b.name === open) || { name: open, color: colorOf(open), hojas: 0, fichas: 0, last: 0 };
    const hojas = notes.data.filter((n) => (n.course || 'General') === open).sort((a, b) => b.pinned - a.pinned || b.created_at - a.created_at);
    const fichas = cards.data.cards.filter((c) => (c.course || 'General') === open);
    return (
      <div className="nb-open" style={{ ['--c' as string]: book.color }}>
        <header className="nb-head">
          <button className="link-btn" onClick={() => { setOpen(null); setTab('hojas'); }}>← Cuadernos</button>
          <div className="nb-head-title"><span className="nb-mini" aria-hidden="true" /><h2>{book.name}</h2></div>
          <div className="nb-head-actions">
            <button className="btn primary" onClick={() => { haptic(8); setEdit({ course: open === 'General' ? '' : open }); }}><Icon name="plus" size={18} />Nueva hoja</button>
            {fichas.length > 0 && <button className="btn line" onClick={onReview}>Repasar fichas</button>}
          </div>
        </header>
        <Segmented label="Contenido del cuaderno" value={tab} onChange={setTab} options={[{ id: 'hojas', label: `Hojas · ${hojas.length}` }, { id: 'fichas', label: `Fichas · ${fichas.length}` }]} />

        {tab === 'hojas' && (hojas.length === 0
          ? <div className="card"><Empty icon="book" title="Este cuaderno está en blanco" text="Escribe tu primera hoja, o guarda una explicación de la IA o de una clase en vivo y aparece aquí con su fecha." /></div>
          : <div className="nb-sheets">{hojas.map((n, i) => (
            <article key={n.id} className="nb-sheet" style={{ ['--rot' as string]: `${i % 2 ? 0.5 : -0.4}deg` }} onClick={() => setEdit(n)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEdit(n)}>
              <span className="nb-tape" aria-hidden="true" />
              <header><h3>{n.title || 'Sin título'}</h3><time>{fecha(n.created_at)}</time></header>
              <Hoja text={n.body || ''} />
            </article>))}</div>)}

        {tab === 'fichas' && (fichas.length === 0
          ? <div className="card"><Empty icon="spark" title="Aún no hay fichas" text="Pídele a la IA que te explique algo y guarda las tarjetas, o créalas desde una hoja." /></div>
          : <div className="nb-cards">{fichas.map((c) => (
            <article key={c.id} className="nb-card"><span className="nb-pin" aria-hidden="true" /><small>Pregunta</small><b>{c.front}</b><small>Respuesta</small><p>{c.back}</p></article>))}</div>)}

        {edit && <Editor note={edit} names={names} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      </div>
    );
  }

  // ---------- Estantería ----------
  return (
    <div className="nb-shelf-wrap">
      <div className="nb-top">
        <div><h2>Mis cuadernos</h2><p className="muted small">Uno por materia. Lo que apuntas y lo que guardas de la IA queda en su cuaderno, con fecha.</p></div>
        <Segmented label="Vista" value={view} onChange={setView} options={[{ id: 'estanteria', label: 'Cuadernos' }, { id: 'lista', label: 'Lista' }]} />
      </div>
      {view === 'estanteria' && <PreguntaCuadernos />}
      {view === 'estanteria' && <ArmarCuadernos onProgress={reload} />}
      {view === 'lista' ? <List names={names} /> : (
        <div className="nb-shelf">
          {books.map((b) => <Portada key={b.name} name={b.name} color={b.color} hojas={b.hojas} fichas={b.fichas} onOpen={() => setOpen(b.name)} />)}
          <button className="nb-cover nb-new" onClick={() => { haptic(8); setEdit({}); }}><span><Icon name="plus" size={26} /></span><b>Nueva hoja</b></button>
        </div>
      )}
      {edit && <Editor note={edit} names={names} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}
