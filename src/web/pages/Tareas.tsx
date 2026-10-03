import { useCallback, useEffect, useState } from 'react';
import { api, type Course, type Task } from '../api';
import { CountUp, Empty, PageHead, PullIndicator, Segmented, Skeleton, TaskModal, TaskRow, TaskSheet, WeekStrip, fmtGrade, haptic, toast, usePullToRefresh, useLoad } from '../components';
import { Icon } from '../icons';

type Filter = 'pendientes' | 'plan' | 'hechas' | 'todas';
const dayKey = (sec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date(sec * 1000));
const dayTitle = (k: string) => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(k + 'T12:00:00Z'));

/** Plan de estudio: reparte tus pendientes en los próximos 7 días (cada entrega, el día antes; máximo 3 por día). */
function studyPlan(list: Task[]) {
  const today = dayKey(Date.now() / 1000);
  const days = Array.from({ length: 7 }, (_, i) => { const sec = Date.now() / 1000 + i * 86400; const key = dayKey(sec); return { key, title: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dayTitle(key), today: i === 0, items: [] as Task[] }; });
  const idx = (k: string) => days.findIndex((d) => d.key === k);
  const pending = list.filter((t) => t.due_at).sort((a, b) => a.due_at! - b.due_at!);
  for (const t of pending) {
    const due = dayKey(t.due_at!);
    if (due > days[6].key) continue; // más allá de la semana: después
    let i = due <= today ? 0 : Math.max(0, idx(dayKey(t.due_at! - 86400)));
    while (i > 0 && days[i].items.length >= 3) i--; // si el día está lleno, se adelanta
    days[i].items.push(t);
  }
  return days;
}

export function Tareas() {
  const [filter, setFilter] = useState<Filter>('pendientes');
  const tasks = useLoad(() => api<Task[]>(`/tasks${filter === 'todas' ? '' : filter === 'hechas' ? '?status=done' : '?status=pending'}`), [filter]);
  const courses = useLoad(() => api<Course[]>('/courses'));
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Task | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  async function toggle(t: Task) {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'pending' : 'done' } });
    if (t.status !== 'done') toast('¡Bien hecho! Tarea completada');
    tasks.reload();
    window.dispatchEvent(new Event('rumbo:badges'));
  }
  const sync = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api<{ result: { tasksNew: number; courses: number; pastCourses: number; delivered: number; warnings: string[] } }>('/sync', { method: 'POST' });
      const x = r.result;
      toast(`EVA al día · ${x.delivered} entregas en tu historial${x.tasksNew ? ` · ${x.tasksNew} nuevas` : ''}`);
      if (x.warnings?.length) toast('Algunas partes del EVA no respondieron: ' + x.warnings.join(' · '), 'err');
      tasks.reload(); courses.reload();
    } catch (e) { toast('Error: ' + (e as Error).message, 'err'); }
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { pull, refreshing } = usePullToRefresh(sync);

  // Enlace directo desde una notificación: #tareas/123 abre la ficha de esa tarea.
  useEffect(() => {
    const m = location.hash.match(/^#tareas\/(\d+)/);
    if (!m) return;
    api<Task>(`/tasks/${m[1]}`).then(setOpen).catch(() => {});
    history.replaceState(null, '', '#tareas');
  }, []);

  const list = tasks.data || [];
  const now = Date.now() / 1000;
  const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matches = (t: Task) => !q.trim() || fold(`${t.title} ${t.course_name || ''} ${t.course_short || ''}`).includes(fold(q.trim()));
  const shown = (day ? list.filter((t) => t.due_at && dayKey(t.due_at) === day) : list).filter(matches);

  // Entregadas: agrupadas por asignatura, con el promedio de lo calificado.
  const graded = list.filter((t) => t.grade !== null && t.grade !== undefined && t.grade_max);
  const avg = graded.length ? graded.reduce((a, t) => a + (t.grade! / t.grade_max!) * 100, 0) / graded.length : null;
  type Group = { key: string; title: string; tone?: string; color?: string; extra?: string; items: Task[] };
  let groups: Group[];
  if (day || q.trim()) groups = [{ key: 'day', title: day ? dayTitle(day) : `Resultados (${shown.length})`, items: shown }];
  else if (filter === 'plan') groups = studyPlan(list).map((d) => ({ key: d.key, title: d.title, tone: d.today ? 'blue' : 'gray', extra: d.items.length ? undefined : 'Día libre ✨', items: d.items }));
  else if (filter === 'pendientes') groups = [
    { key: 'v', title: 'Vencidas', tone: 'red', items: list.filter((t) => t.due_at && t.due_at < now) },
    { key: 'p', title: 'Próximos 7 días', tone: 'blue', items: list.filter((t) => t.due_at && t.due_at >= now && t.due_at < now + 7 * 86400) },
    { key: 'm', title: 'Más adelante', tone: 'gray', items: list.filter((t) => t.due_at && t.due_at >= now + 7 * 86400) },
    { key: 's', title: 'Sin fecha', tone: 'gray', items: list.filter((t) => !t.due_at) },
  ];
  else if (filter === 'hechas') {
    const names = [...new Set(list.map((t) => t.course_name || 'Personal'))];
    groups = names.map((n) => {
      const items = list.filter((t) => (t.course_name || 'Personal') === n);
      const g = items.filter((t) => t.grade !== null && t.grade !== undefined && t.grade_max);
      const a = g.length ? g.reduce((s, t) => s + (t.grade! / t.grade_max!) * 100, 0) / g.length : null;
      return { key: n, title: n, color: items[0].course_color || '#B8C6E0', extra: a !== null ? `Promedio ${fmtGrade(Math.round(a * 10) / 10)}` : undefined, items };
    });
  } else groups = [{ key: 'all', title: '', items: list }];

  return (
    <>
      <PullIndicator pull={pull} refreshing={refreshing} />
      <PageHead eyebrow="Entregas y pendientes" title="Tareas">
        <button className={`btn line ${busy ? 'spinning' : ''}`} onClick={sync} disabled={busy} aria-label="Sincronizar EVA"><Icon name="sync" size={18} /><span className="lbl">{busy ? 'Sincronizando…' : 'Sincronizar EVA'}</span></button>
        <button className="btn primary" onClick={() => setCreating(true)} aria-label="Nueva tarea"><Icon name="plus" size={18} /><span className="lbl">Nueva</span></button>
      </PageHead>
      <Segmented label="Filtrar tareas" value={filter} onChange={(f) => { setFilter(f); setDay(null); }} options={[{ id: 'pendientes', label: 'Pendientes' }, { id: 'plan', label: 'Plan' }, { id: 'hechas', label: 'Entregadas' }, { id: 'todas', label: 'Todas' }]} />

      {filter === 'pendientes' && tasks.data && <WeekStrip tasks={list} selected={day} onSelect={setDay} />}
      {tasks.data && list.length > 5 && (
        <label className="search"><Icon name="tasks" size={18} /><span className="sr-only">Buscar tareas</span>
          <input className="input" type="search" aria-label="Buscar tarea o asignatura" placeholder="Buscar tarea o asignatura…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}

      {filter === 'hechas' && tasks.data && list.length > 0 && (
        <div className="summary-strip stagger">
          <div><b className="num"><CountUp value={list.length} /></b><span>entregas</span></div>
          <div><b className="num"><CountUp value={graded.length} /></b><span>calificadas</span></div>
          <div><b className={`num ${avg !== null && avg < 70 ? 'bad' : 'good'}`}>{avg === null ? '—' : <CountUp value={avg} decimals={1} />}</b><span>promedio</span></div>
        </div>
      )}

      {tasks.error && <div className="error">{tasks.error}</div>}
      {!tasks.data ? <Skeleton hero={false} rows={5} /> : shown.length === 0 ? (
        <div className="card"><Empty icon={filter === 'hechas' ? 'tasks' : 'check'}
          title={q.trim() ? 'Sin resultados' : day ? 'Nada vence ese día' : filter === 'hechas' ? 'Aún no hay entregas' : 'Todo al día'}
          text={day ? 'Toca el día otra vez para ver todo.' : filter === 'hechas' ? 'Jala hacia abajo o pulsa sincronizar para traer del EVA lo que ya entregaste.' : 'No hay tareas aquí. Toca + para agregar una.'} /></div>
      ) : (
        <div className="stagger col">
          {(filter === 'plan' && !q.trim() ? groups : groups.filter((g) => g.items.length)).map((g) => (
            <div className="section" key={g.key}>
              {g.title && (
                <div className="section-head">
                  {g.color && <span className="dot" style={{ background: g.color }} />}
                  <h3>{g.title}</h3>
                  {g.items.length > 0 && <span className={`pill ${g.tone || 'gray'} num`}>{g.items.length}</span>}
                  {g.extra && <span className={`section-extra ${g.extra.startsWith('Promedio') ? 'num' : ''}`}>{g.extra}</span>}
                  {g.key === 'v' && g.items.length > 1 && <MarkAll items={g.items} onDone={() => { tasks.reload(); window.dispatchEvent(new Event('rumbo:badges')); }} />}
                </div>
              )}
              {g.items.length > 0 && <div className="card list">{g.items.map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} onOpen={setOpen} />)}</div>}
            </div>
          ))}
        </div>
      )}
      <p className="swipe-hint hide-desktop">Desliza una tarea a la derecha para marcarla · jala hacia abajo para sincronizar</p>
      {open && <TaskSheet task={open} courses={courses.data || []} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); tasks.reload(); }} />}
      {creating && <TaskModal task={{}} courses={courses.data || []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); tasks.reload(); }} />}
    </>
  );
}

/** «Marcar todas»: para cuando ya entregaste lo vencido. Pide un segundo toque en vez de una ventana de confirmación. */
function MarkAll({ items, onDone }: { items: Task[]; onDone: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  async function go() {
    if (!armed) { setArmed(true); haptic(6); return; }
    setBusy(true); haptic(12);
    try { await Promise.all(items.map((t) => api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: 'done' } }))); toast(`Listo: ${items.length} tareas marcadas como hechas`); onDone(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false); setArmed(false);
  }
  return <button className={`link-btn spacer ${armed ? 'armed' : ''}`} onClick={go} disabled={busy} aria-live="polite">{busy ? 'Marcando…' : armed ? `¿Marcar las ${items.length}? Toca otra vez` : 'Marcar todas'}</button>;
}
