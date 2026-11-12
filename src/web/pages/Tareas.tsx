import { useCallback, useEffect, useState } from 'react';
import { api, type Course, type Task } from '../api';
import { CountUp, Empty, PageHead, PullIndicator, Segmented, Skeleton, TaskModal, TaskRow, TaskSheet, WeekStrip, fmtGrade, haptic, runSync, setActivityIgnored, syncToast, toast, toggleTask, usePullToRefresh, useLoad } from '../components';
import { Icon } from '../icons';
import { RbRing, RbTask } from '../rb';

type Filter = 'pendientes' | 'plan' | 'mes' | 'hechas' | 'todas';
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
  const tasks = useLoad(() => api<Task[]>(`/tasks${filter === 'todas' || filter === 'mes' ? '' : filter === 'hechas' ? '?status=done' : '?status=pending'}`), [filter]);
  const courses = useLoad(() => api<Course[]>('/courses'));
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Task | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (t: Task) => toggleTask(t, tasks.reload).catch((e) => toast((e as Error).message, 'err'));
  const sync = useCallback(async () => {
    setBusy(true);
    try {
      syncToast(await runSync(), true);
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
  else if (filter === 'mes') groups = [];
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

  const FILTERS: { id: Filter; label: string }[] = [{ id: 'pendientes', label: 'Pendientes' }, { id: 'mes', label: 'Mes' }, { id: 'plan', label: 'Plan' }, { id: 'hechas', label: 'Entregadas' }];
  const strip = Array.from({ length: 8 }, (_, i) => { const sec = now + i * 86400; const k = dayKey(sec); const dt = new Date(sec * 1000); return { k, n: Number(k.slice(8)), dow: new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'short' }).format(dt).replace('.', ''), count: list.filter((t) => t.due_at && dayKey(t.due_at) === k).length, today: i === 0 }; });
  const tone = (k: string) => (k === 'red' ? 'c-rose' : k === 'blue' ? 'c-blue' : 'c-gray');

  return (
    <div className="rbx">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <header className="top">
        <div><div className="eb">Entregas y pendientes</div><h1 tabIndex={-1}>Tareas</h1></div>
        <div className="sp" />
        <button className="btn" style={{ background: 'var(--card)', boxShadow: 'inset 0 0 0 1.5px var(--line)' }} onClick={sync} disabled={busy} aria-label="Sincronizar EVA"><Icon name="sync" size={18} /><span className="lbl">{busy ? 'Sincronizando…' : 'Sincronizar EVA'}</span></button>
        <button className="btn b-pri" onClick={() => setCreating(true)} aria-label="Nueva tarea"><Icon name="plus" size={18} /><span className="lbl">Nueva tarea</span></button>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div className="seg" role="tablist" aria-label="Filtrar tareas">
          {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => { haptic(5); setFilter(f.id); setDay(null); }}>{f.label}</button>)}
        </div>
        {filter === 'pendientes' && tasks.data && (
          <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
            {strip.map((x) => (
              <button key={x.k} className={`chip ${day === x.k ? '' : x.count ? 'c-orange' : 'c-gray'}`} onClick={() => { haptic(4); setDay(day === x.k ? null : x.k); }} aria-pressed={day === x.k}
                style={{ padding: '10px 14px', flexDirection: 'column', gap: 0, background: day === x.k ? 'var(--cobalt)' : undefined, color: day === x.k ? '#fff' : undefined }}>
                <span className="sm" style={{ textTransform: 'capitalize' }}>{x.dow}</span><b className="num" style={{ fontSize: 17 }}>{x.n}</b>
              </button>
            ))}
          </div>
        )}
      </div>

      {filter === 'mes' && tasks.data && <MonthView tasks={list} onOpen={setOpen} onToggle={toggle} />}
      {filter !== 'mes' && tasks.data && list.length > 5 && (
        <label className="search" style={{ width: '100%', maxWidth: 420 }}><Icon name="search" size={18} /><span className="sr-only">Buscar tareas</span>
          <input type="search" aria-label="Buscar tarea o asignatura" placeholder="Buscar tarea o asignatura…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, background: 'none', font: 'inherit', flex: 1, outline: 0, color: 'var(--ink)' }} />
        </label>
      )}

      {filter === 'hechas' && tasks.data && list.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
          <div className="tile" style={{ background: 'var(--cobaltsoft)', color: '#1A3FD1' }}><b className="num"><CountUp value={list.length} /></b><span>Entregas</span></div>
          <div className="tile" style={{ background: 'var(--mintsoft)', color: 'var(--mint)' }}><b className="num"><CountUp value={graded.length} /></b><span>Calificadas</span></div>
          <div className="tile" style={{ background: avg !== null && avg < 70 ? 'var(--rosesoft)' : 'var(--orangesoft)', color: avg !== null && avg < 70 ? 'var(--rose)' : '#B04A00' }}><b className="num">{avg === null ? '—' : <CountUp value={avg} decimals={1} />}</b><span>Promedio</span></div>
        </section>
      )}

      {tasks.error && <div className="error">{tasks.error}</div>}
      {filter === 'mes' ? null : !tasks.data ? <Skeleton hero={false} rows={5} /> : (
        <div className="grid2">
          <div className="col">
            {shown.length === 0 ? (
              <div className="card"><Empty icon={filter === 'hechas' ? 'tasks' : 'check'}
                title={q.trim() ? 'Sin resultados' : day ? 'Nada vence ese día' : filter === 'hechas' ? 'Aún no hay entregas' : 'Todo al día'}
                text={day ? 'Toca el día otra vez para ver todo.' : filter === 'hechas' ? 'Pulsa sincronizar para traer del EVA lo que ya entregaste.' : 'No hay tareas aquí. Toca «Nueva tarea» para agregar una.'} /></div>
            ) : (filter === 'plan' && !q.trim() ? groups : groups.filter((g) => g.items.length)).map((g) => (
              <section className={`card ${g.key === 'v' ? 'vencidas' : ''}`} key={g.key} style={g.tone === 'red' ? { borderLeft: '8px solid var(--rose)' } : undefined}>
                <div className="head">
                  <h3 style={g.tone === 'red' ? { color: 'var(--rose)' } : undefined}>{g.color && <span className="dot" style={{ background: g.color, display: 'inline-block', marginRight: 8 }} />}{g.key === 'v' ? 'Vencidas · hazlas primero' : g.title}</h3>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {g.extra && <small style={{ color: 'var(--muted)', fontWeight: 700 }}>{g.extra}</small>}
                    {g.key === 'v' && g.items.length > 1 && <MarkAll items={g.items} onDone={() => { tasks.reload(); window.dispatchEvent(new Event('rumbo:badges')); }} />}
                    {g.items.length > 0 && <span className={`chip ${tone(g.tone || 'gray')} num`}>{g.items.length}</span>}
                  </span>
                </div>
                {g.items.length > 0 ? <ul>{g.items.map((t) => <RbTask key={t.id} t={t} onToggle={toggle} onOpen={setOpen} />)}</ul> : <p style={{ color: 'var(--muted)' }}>Día libre ✨</p>}
              </section>
            ))}
            {(filter === 'pendientes' || filter === 'hechas') && !day && !q.trim() && <IgnoredTasks onChanged={tasks.reload} />}
          </div>
          <div className="col">
            <section className="card" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <RbRing pct={list.length ? Math.min(100, (list.filter((t) => t.status === 'done').length / list.length) * 100) : 0} size={110} dark>{list.length}</RbRing>
              <div><h3>{filter === 'hechas' ? 'Entregadas' : 'Pendientes'}</h3><p className="sm" style={{ color: 'var(--muted)', margin: '6px 0 10px' }}>{filter === 'hechas' ? `${list.length} entregas en total.` : `${list.length} por hacer, ${list.filter((t) => t.due_at && t.due_at < now).length} atrasadas.`}</p></div>
            </section>
            <section className="card" style={{ background: 'linear-gradient(135deg,#101A3D,#1F3A73)', color: '#fff' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8FB0FF' }}>Con IA</div>
              <h3 className="hand" style={{ fontSize: 34, margin: '4px 0 6px' }}>Hacer con IA</h3>
              <p style={{ color: '#C9D3E8', fontSize: 14, marginBottom: 14 }}>Abre una tarea, elige la extensión y Rumbo arma el borrador con tu portada, tus datos y tu estilo.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[['Corto', '1 pág.'], ['Medio', '3 pág.'], ['Largo', '5 pág.'], ['Muy largo', '8 pág.']].map(([a, b], i) => (
                  <div key={a} style={{ border: `1.5px solid ${i === 1 ? '#fff' : 'rgba(255,255,255,.3)'}`, background: i === 1 ? 'rgba(255,255,255,.16)' : 'none', borderRadius: 14, padding: '8px 4px', textAlign: 'center', fontSize: 12.5, fontWeight: 700 }}>{a}<br /><small style={{ fontWeight: 500, color: '#C9D3E8' }}>{b}</small></div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
      {open && <TaskSheet task={open} courses={courses.data || []} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); tasks.reload(); }} />}
      {creating && <TaskModal task={{}} courses={courses.data || []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); tasks.reload(); }} />}
    </div>
  );
}

/** Lo que quitaste porque no se corrige (o que Rumbo quitó solo): plegado al final, con «Volver a contar». */
function IgnoredTasks({ onChanged }: { onChanged: () => void }) {
  const list = useLoad(() => api<Task[]>('/ignored-tasks'));
  const [open, setOpen] = useState(false);
  useEffect(() => { const l = () => list.reload(); window.addEventListener('rumbo:grades', l); return () => window.removeEventListener('rumbo:grades', l); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const items = list.data || [];
  if (!items.length) return null;
  return (
    <section className="card">
      <button className="link" onClick={() => { haptic(4); setOpen((v) => !v); }} aria-expanded={open}>
        <Icon name="chevron" size={15} style={{ transform: open ? 'rotate(90deg)' : undefined }} />Quitadas: no se corrigen · {items.length}
      </button>
      {open && (
        <div className="card list">
          {items.map((t) => (
            <div key={t.id} className="grade-off-row">
              <span className="grade-name">{t.title}<small>{t.course_name || 'Personal'}</small></span>
              <button className="btn soft sm" onClick={() => setActivityIgnored({ taskId: t.id }, false, () => { list.reload(); onChanged(); }).catch((e) => toast((e as Error).message, 'err'))}>Volver a contar</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Calendario del mes: un punto de color por entrega (color de la asignatura). Toca un día para ver qué vence. */
type Clase = { id: number; title: string; day: number; start_min: number; end_min: number; room: string | null; start_date: string | null; end_date: string | null };
const hhmm = (m: number) => { const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };

function MonthView({ tasks, onOpen, onToggle }: { tasks: Task[]; onOpen: (t: Task) => void; onToggle: (t: Task) => void }) {
  const horario = useLoad(() => api<{ classes: Clase[] }>('/horario').catch(() => ({ classes: [] as Clase[] })));
  const clases = horario.data?.classes || [];
  // Clases de un día (YYYY-MM-DD): mismas del Horario, según el día de la semana y las fechas del trimestre.
  const classesOn = (k: string) => {
    const dow = (new Date(k + 'T12:00:00Z').getUTCDay() + 6) % 7;
    return clases.filter((c) => c.day === dow && (!c.start_date || k >= c.start_date) && (!c.end_date || k <= c.end_date)).sort((a, b) => a.start_min - b.start_min);
  };
  const today = dayKey(Date.now() / 1000);
  const [ym, setYm] = useState(() => { const [y, m] = today.split('-').map(Number); return { y, m }; });
  const [sel, setSel] = useState<string>(today);
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) if (t.due_at) { const k = dayKey(t.due_at); byDay.set(k, [...(byDay.get(k) || []), t]); }
  const first = new Date(Date.UTC(ym.y, ym.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // lunes primero
  const days = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)];
  const move = (d: number) => { haptic(5); setYm(({ y, m }) => { const n = m + d; return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }; }); };
  const items = byDay.get(sel) || [];
  const now = Date.now() / 1000;
  return (
    <div className="grid2">
      <div className="col">
        <section className="card">
          <div className="head">
            <button className="pill-btn" style={{ width: 38, height: 38, boxShadow: 'none', background: 'var(--cobaltsoft)' }} onClick={() => move(-1)} aria-label="Mes anterior"><Icon name="chevron" size={18} style={{ transform: 'rotate(180deg)' }} /></button>
            <h3 style={{ textTransform: 'capitalize' }}>{MONTHS[ym.m - 1]} {ym.y}</h3>
            <button className="pill-btn" style={{ width: 38, height: 38, boxShadow: 'none', background: 'var(--cobaltsoft)' }} onClick={() => move(1)} aria-label="Mes siguiente"><Icon name="chevron" size={18} /></button>
          </div>
          <div role="grid" aria-label={`${MONTHS[ym.m - 1]} ${ym.y}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 6, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i} aria-hidden="true" style={{ color: 'var(--muted)' }}>{d}</span>)}
            {cells.map((k, i) => {
              if (!k) return <span key={i} />;
              const list = byDay.get(k) || [];
              const late = list.some((t) => t.status !== 'done' && t.due_at! < now);
              const nClases = classesOn(k).length;
              const isSel = k === sel, isToday = k === today;
              return (
                <button key={k} onClick={() => { haptic(4); setSel(k); }} aria-pressed={isSel}
                  aria-label={`${Number(k.slice(8))} de ${MONTHS[ym.m - 1]}: ${list.length ? list.length + ' entrega' + (list.length > 1 ? 's' : '') : 'sin entregas'}${nClases ? `, ${nClases} clase${nClases > 1 ? 's' : ''}` : ''}`}
                  style={{ padding: '9px 0', borderRadius: 12, border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, position: 'relative', background: isSel ? 'var(--cobalt)' : isToday ? 'var(--cobaltsoft)' : late ? 'var(--rosesoft)' : list.length ? 'var(--orangesoft)' : 'none', color: isSel ? '#fff' : late ? 'var(--rose)' : list.length ? '#B04A00' : 'var(--ink)' }}>
                  <span className="num">{Number(k.slice(8))}</span>
                  <span style={{ display: 'flex', gap: 2, justifyContent: 'center', height: 5, marginTop: 2 }}>{nClases > 0 && <i style={{ width: 5, height: 5, borderRadius: 3, background: isSel ? '#fff' : 'var(--cobalt)' }} />}{list.slice(0, 3).map((t) => <i key={t.id} style={{ width: 5, height: 5, borderRadius: 3, background: t.course_color || 'var(--orange)', opacity: t.status === 'done' ? 0.4 : 1 }} />)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <div className="col">
        <section className="card">
          <div className="head"><h3>{sel === today ? 'Hoy' : dayTitle(sel)}</h3>{items.length > 0 && <span className="chip c-blue num">{items.length} entrega{items.length > 1 ? 's' : ''}</span>}</div>
          {classesOn(sel).length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: items.length ? 14 : 0 }}>
              {classesOn(sel).map((c) => (
                <li key={c.id} className="agenda"><div className="tm num">{hhmm(c.start_min)}</div><div className="bl" style={{ background: 'var(--cobaltsoft)', borderLeft: '5px solid var(--cobalt)' }}><b>{c.title}</b><small>{hhmm(c.start_min)} – {hhmm(c.end_min)}{c.room ? ` · ${c.room}` : ' · Virtual'}</small></div></li>
              ))}
            </ul>
          )}
          {items.length ? <ul>{items.map((t) => <RbTask key={t.id} t={t} onToggle={onToggle} onOpen={onOpen} />)}</ul>
            : classesOn(sel).length ? null : <p style={{ color: 'var(--muted)' }}>Sin clases ni entregas ese día. Toca otro día del mes.</p>}
        </section>
      </div>
    </div>
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
