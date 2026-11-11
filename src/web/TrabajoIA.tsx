// «Hacer con IA»: botón en cada tarea (y en Semana eficiente) + vista del trabajo con descarga en Word.
import { useCallback, useEffect, useRef, useState } from 'react';
import { agoLabel, api } from './api';
import { Empty, Skeleton, haptic, toast, useLoad } from './components';
import { DocViewer } from './DocViewer';
import { Icon } from './icons';
import type { Profile, Work } from './trabajo';

export type Largo = 'corto' | 'medio' | 'largo' | 'muy_largo';
const LARGOS: { id: Largo; label: string; hint: string }[] = [
  { id: 'corto', label: 'Corto', hint: '≈ 1 página' }, { id: 'medio', label: 'Medio', hint: '≈ 3 páginas' },
  { id: 'largo', label: 'Largo', hint: '≈ 5 páginas' }, { id: 'muy_largo', label: 'Muy largo', hint: '≈ 8 páginas' },
];
function savedLargo(): Largo {
  try { const v = localStorage.getItem('rumbo-work-len') as Largo | null; if (v && LARGOS.some((l) => l.id === v)) return v; } catch { /* sin almacenamiento */ }
  return 'medio';
}
function saveLargo(v: Largo) { try { localStorage.setItem('rumbo-work-len', v); } catch { /* sin almacenamiento */ } }

type Info = { status: 'none' | 'pending' | 'ready' | 'error'; work?: Work; profile?: Profile; error?: string };

/** Estado del trabajo de una tarea; mientras se está haciendo, pregunta cada 4 s. */
export function useWork(taskId: number) {
  const [info, setInfo] = useState<Info>({ status: 'none' });
  const timer = useRef<number>(0);
  const load = useCallback(async () => {
    try { const r = await api<Info>(`/tasks/${taskId}/work?_=${Date.now()}`); setInfo(r); return r; } catch { return null; }
  }, [taskId]);
  useEffect(() => { void load(); return () => window.clearTimeout(timer.current); }, [load]);
  useEffect(() => {
    if (info.status !== 'pending') return;
    timer.current = window.setTimeout(async () => {
      const r = await load();
      if (r?.status === 'ready') toast('📝 ¡Tu trabajo está listo!');
      if (r?.status === 'error') toast(r.error || 'No se pudo hacer el trabajo', 'err');
    }, 4000);
    return () => window.clearTimeout(timer.current);
  }, [info, load]);
  const start = useCallback(async (length?: Largo) => {
    haptic(10);
    try {
      await api(`/tasks/${taskId}/work`, { method: 'POST', body: { length: length || savedLargo() } });
      setInfo({ status: 'pending' });
      toast('Listo, la IA está en eso. Te aviso cuando termine ✨');
    } catch (e) { toast((e as Error).message, 'err'); }
  }, [taskId]);
  return { info, start, reload: load };
}

/** Descarga el Word de un trabajo ya hecho. */
async function downloadWordFor(work: Work, profile: Profile) {
  const m = await import('./trabajo');
  await m.downloadWord(work, profile, `${work.titulo}_${profile.nombre.split(' ').slice(0, 2).join('_')}`);
}

/** Botón grande para la ficha de la tarea. Cuando el trabajo está listo, salen «Ver» y «Descargar Word» a la vista. */
export function WorkButton({ taskId, title }: { taskId: number; title: string }) {
  const { info, start } = useWork(taskId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [largo, setLargo] = useState<Largo>(savedLargo);
  const pending = info.status === 'pending';
  const ready = info.status === 'ready' && !!info.work && !!info.profile;
  async function word() {
    if (!info.work || !info.profile) return;
    setBusy(true); haptic(10);
    try { await downloadWordFor(info.work, info.profile); toast('Word descargado ✅'); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  return (
    <>
      {ready ? (
        <div className="work-ready">
          <button className="btn work-btn" onClick={() => setOpen(true)}><Icon name="book" size={19} /><span className="tb-txt"><b>Ver mi trabajo</b><small>revisar antes de entregar</small></span></button>
          <button className="btn primary work-dl" onClick={word} disabled={busy}><Icon name="download" size={19} /><span className="tb-txt"><b>{busy ? 'Preparando…' : 'Descargar Word'}</b><small>portada + tus datos</small></span></button>
        </div>
      ) : (
        <div className="work-start">
          {!pending && (
            <div className="work-len" role="radiogroup" aria-label="Extensión del trabajo">
              {LARGOS.map((l) => (
                <button key={l.id} role="radio" aria-checked={largo === l.id} className={largo === l.id ? 'on' : ''} onClick={() => { haptic(4); setLargo(l.id); saveLargo(l.id); }}>
                  <b>{l.label}</b><small>{l.hint}</small>
                </button>
              ))}
            </div>
          )}
        <button className="btn work-btn" disabled={pending} onClick={() => void start(largo)}>
          <Icon name={pending ? 'sync' : 'spark'} size={19} className={pending ? 'spin' : undefined} />
          <span className="tb-txt">
            <b>{pending ? 'Haciendo tu trabajo…' : info.status === 'error' ? 'Reintentar con IA' : 'Hacer con IA'}</b>
            <small>{pending ? 'te aviso al terminar' : info.status === 'error' ? (info.error || 'algo falló').slice(0, 48) : 'con tu estilo y tus datos'}</small>
          </span>
        </button>
        </div>
      )}
      {open && info.work && info.profile && <WorkSheet work={info.work} profile={info.profile} title={title} onClose={() => setOpen(false)} onRedo={() => { setOpen(false); void start(largo); }} />}
    </>
  );
}

/** Botón pequeño para las filas de Semana eficiente. */
export function WorkChip({ taskId, title }: { taskId: number; title: string }) {
  const { info, start } = useWork(taskId);
  const [open, setOpen] = useState(false);
  const pending = info.status === 'pending';
  return (
    <>
      <button className={`se-ai ${info.status}`} aria-label={pending ? 'La IA está haciendo el trabajo' : info.status === 'ready' ? 'Ver trabajo hecho con IA' : 'Hacer con IA'}
        onClick={(e) => { e.stopPropagation(); if (info.status === 'ready') setOpen(true); else if (!pending) void start(); }}>
        <Icon name={info.status === 'ready' ? 'check' : 'spark'} size={13} className={pending ? 'spin' : undefined} />
        <span>{pending ? 'Haciendo…' : info.status === 'ready' ? 'Ver' : 'IA'}</span>
      </button>
      {open && info.work && info.profile && <WorkSheet work={info.work} profile={info.profile} title={title} onClose={() => setOpen(false)} onRedo={() => { setOpen(false); void start(); }} />}
    </>
  );
}

function WorkSheet(props: { work: Work; profile: Profile; title: string; onClose: () => void; onRedo: () => void }) {
  return <DocViewer {...props} />;
}

type WorkItem = { task_id: number; status: string; updated_at: number; task_title: string; task_status: string; course_name: string | null; course_color: string | null; titulo: string; etiqueta: string; palabras: number };

/** Pestaña «Trabajos» de Estudio: todos los trabajos hechos con IA, juntos. */
export function TrabajosHechos() {
  const list = useLoad(() => api<WorkItem[]>(`/works?_=${Date.now()}`));
  const [viewing, setViewing] = useState<{ work: Work; profile: Profile; title: string; id: number } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  async function fetchWork(id: number): Promise<{ work: Work; profile: Profile } | null> {
    const r = await api<Info>(`/tasks/${id}/work?_=${Date.now()}`);
    return r.work && r.profile ? { work: r.work, profile: r.profile } : null;
  }
  async function view(it: WorkItem) {
    setBusy(it.task_id); haptic(6);
    try { const r = await fetchWork(it.task_id); if (r) setViewing({ ...r, title: it.task_title, id: it.task_id }); else toast('Ese trabajo no está listo', 'err'); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(null);
  }
  async function word(it: WorkItem) {
    setBusy(it.task_id); haptic(10);
    try { const r = await fetchWork(it.task_id); if (r) { await downloadWordFor(r.work, r.profile); toast('Word descargado ✅'); } }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(null);
  }
  if (!list.data) return <Skeleton rows={3} />;
  if (!list.data.length) return <div className="card"><Empty icon="book" title="Aún no hay trabajos" text="Abre una tarea y pulsa «Hacer con IA». Aquí quedarán todos juntos." /></div>;
  return (
    <div className="works">
      {list.data.map((it) => (
        <div key={it.task_id} className="work-item" style={{ ['--c' as string]: it.course_color || 'var(--blue)' }}>
          <div className="wi-top">
            <span className="wi-course"><i />{it.course_name || 'Personal'}</span>
            <span className={`wi-state ${it.status}`}>{it.status === 'ready' ? 'Listo' : it.status === 'pending' ? 'Haciéndose…' : 'Falló'}</span>
          </div>
          <b className="wi-title">{it.titulo || it.task_title}</b>
          <span className="wi-sub">{it.titulo ? `Tarea: ${it.task_title} · ` : ''}{agoLabel(it.updated_at)}{it.palabras ? ` · ≈ ${it.palabras} palabras` : ''}</span>
          {it.status === 'ready' && (
            <div className="wi-actions">
              <button className="btn line" disabled={busy === it.task_id} onClick={() => void view(it)}>Ver</button>
              <button className="btn primary" disabled={busy === it.task_id} onClick={() => void word(it)}><Icon name="download" size={17} />{busy === it.task_id ? 'Preparando…' : 'Descargar Word'}</button>
            </div>
          )}
          {it.status === 'error' && <span className="wi-sub">Abre la tarea para reintentar.</span>}
        </div>
      ))}
      {viewing && <WorkSheet work={viewing.work} profile={viewing.profile} title={viewing.title} onClose={() => setViewing(null)} onRedo={() => { const id = viewing.id; setViewing(null); void api(`/tasks/${id}/work`, { method: 'POST', body: { length: savedLargo() } }).then(() => { toast('La IA está rehaciendo el trabajo ✨'); list.reload(); }).catch((e) => toast((e as Error).message, 'err')); }} />}
    </div>
  );
}
