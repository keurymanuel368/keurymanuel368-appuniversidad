// Buscador de toda la app: tareas, avisos y asignaturas. Se abre con la lupa de arriba o con la tecla «/».
import { useEffect, useRef, useState } from 'react';
import { api, cleanTitle, whenLabel } from './api';
import { Modal, haptic } from './components';
import { Icon } from './icons';

type Res = {
  tasks: { id: number; title: string; due_at: number | null; status: string; course_name: string | null; course_color: string | null }[];
  news: { id: number; title: string; kind: string; created_at: number; course_name: string | null }[];
  courses: { id: number; name: string; code: string | null; color: string }[];
};

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return; }
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      api<Res>(`/search?q=${encodeURIComponent(term)}`).then((r) => { if (n === seq.current) setRes(r); }).catch(() => {}).finally(() => { if (n === seq.current) setBusy(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  function go(hash: string) {
    haptic(5);
    onClose();
    location.hash = hash;
  }
  const empty = res && !res.tasks.length && !res.news.length && !res.courses.length;

  return (
    <Modal title="Buscar" onClose={onClose}>
      <label className="search big"><Icon name="search" size={20} /><span className="sr-only">Buscar</span>
        <input className="input lg" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tarea, aviso, asignatura o facilitador…" aria-label="Buscar en Rumbo" />
      </label>
      <div className="search-results" aria-live="polite" aria-busy={busy}>
        {!res && <p className="small muted center">{q.trim().length === 1 ? 'Escribe una letra más…' : 'Busca sin preocuparte por las tildes: «etica», «foro», «razonamiento».'}</p>}
        {empty && <p className="small muted center">No encontré nada con «{q.trim()}».</p>}
        {res && res.courses.length > 0 && (
          <div className="sr-group"><span className="label">Asignaturas</span>
            {res.courses.map((c) => <button key={c.id} className="sr-row" onClick={() => go(`asignaturas/${c.id}`)}><i className="dot" style={{ background: c.color }} /><span><b>{c.name}</b><small>{c.code || 'Ver notas'}</small></span><Icon name="chevron" size={16} className="row-chevron" /></button>)}
          </div>
        )}
        {res && res.tasks.length > 0 && (
          <div className="sr-group"><span className="label">Tareas</span>
            {res.tasks.map((t) => <button key={t.id} className="sr-row" onClick={() => go(`tareas/${t.id}`)}><i className="dot" style={{ background: t.course_color || 'var(--blue)' }} /><span><b>{t.title}</b><small>{t.course_name || 'Personal'} · {t.status === 'done' ? 'Entregada' : whenLabel(t.due_at)}</small></span><Icon name="chevron" size={16} className="row-chevron" /></button>)}
          </div>
        )}
        {res && res.news.length > 0 && (
          <div className="sr-group"><span className="label">Avisos</span>
            {res.news.map((n) => <button key={n.id} className="sr-row" onClick={() => go(`avisos/${n.id}`)}><Icon name="bell" size={17} /><span><b>{cleanTitle(n.title)}</b><small>{n.course_name || 'UAPA'}</small></span><Icon name="chevron" size={16} className="row-chevron" /></button>)}
          </div>
        )}
      </div>
    </Modal>
  );
}
