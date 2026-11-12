import { useEffect, useState } from 'react';
import { api, dateLabel, type Course, type PensumRow, type Task } from '../api';
import { CountUp, Empty, Modal, PageHead, Ring, Segmented, Skeleton, TaskRow, TaskSheet, fmtGrade, haptic, runSync, setActivityIgnored, syncToast, toast, toggleTask, useLoad } from '../components';
import { Icon } from '../icons';
import { RbRing, RbTask } from '../rb';
import { AverageChart, FeedbackNotes, RecordModal } from '../NotasExtras';
import { gradeWeights, neededFor } from '../../shared/promedio';

/** ignored: 1 = no cuenta para el promedio (quitada) · auto: 1 = la quitó Rumbo porque no se corrige. */
type Grade = { id: number; item_name: string; grade: number | null; grade_max: number; weight?: number | null; source?: string | null; task_id: number | null; due_at: number | null; status: string | null; ignored?: number; auto?: number };

export function Asignaturas() {
  const courses = useLoad(() => api<Course[]>('/courses'));
  // Desde Inicio, «#asignaturas/12» abre directo esa asignatura.
  const [sel, setSel] = useState<number | null>(() => Number(location.hash.match(/^#asignaturas\/(\d+)/)?.[1]) || null);
  useEffect(() => {
    if (!sel || !courses.data) return;
    history.replaceState(null, '', '#asignaturas');
    if (window.innerWidth < 900) setTimeout(() => document.querySelector('.detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!courses.data]);
  const [adding, setAdding] = useState(false);
  const [record, setRecord] = useState(false);
  const list = courses.data || [];
  const current = list.find((c) => c.id === sel) || list[0] || null;

  return (
    <div className="rbx">
      <header className="top">
        <div><div className="eb">Este trimestre</div><h1 tabIndex={-1}>Notas</h1></div>
        <div className="sp" />
        <button className="btn b-line" style={{ background: 'var(--card)' }} onClick={() => { haptic(6); setRecord(true); }} aria-label="Récord de notas"><Icon name="download" size={18} /><span className="lbl">Récord de notas</span></button>
        <button className="btn b-pri" onClick={() => setAdding(true)} aria-label="Agregar asignatura"><Icon name="plus" size={18} /><span className="lbl">Agregar a mano</span></button>
      </header>
      {courses.error && <div className="error">{courses.error}</div>}
      {!courses.data ? <Skeleton hero={false} rows={4} /> : list.length === 0 ? (
        <div className="card"><Empty icon="book" title="Aún no hay asignaturas de este trimestre" text="El EVA las publica cuando empieza la docencia. Tus notas del trimestre anterior están abajo, en «Trimestres anteriores».">
          <button className="btn b-pri" onClick={() => runSync().then((r) => { syncToast(r); courses.reload(); }).catch((e) => toast((e as Error).message, 'err'))}><Icon name="sync" size={17} />Revisar el EVA ahora</button>
        </Empty></div>
      ) : (
        <div className="grid2">
          <div className="col">
            <TermSummary courses={list} onPick={(id) => { haptic(5); setSel(id); }} />
            <FinalGrades courses={list} onPick={(id) => { haptic(5); setSel(id); if (window.innerWidth < 900) setTimeout(() => document.querySelector('.detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }} />
            <AverageChart />
          </div>
          <div className="col">
            {current && <Detail key={current.id} course={current} courses={list} onChanged={courses.reload} />}
          </div>
        </div>
      )}
      <FeedbackNotes />
      <History />
      {record && <RecordModal onClose={() => setRecord(false)} />}
      {adding && <AddCourse onClose={() => setAdding(false)} onSaved={() => { setAdding(false); courses.reload(); }} />}
    </div>
  );
}

type PastCourse = { id: number; code: string | null; name: string; color: string; average: number | null; graded: number; total?: number; delivered: number };

/** Índice del trimestre (ponderado por créditos del pensum) y asignaturas en riesgo. */
function TermSummary({ courses, onPick }: { courses: Course[]; onPick: (id: number) => void }) {
  const pensum = useLoad(() => api<PensumRow[]>('/pensum'));
  const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const creditsOf = (c: Course) => {
    if (c.credits) return c.credits;
    const p = (pensum.data || []).find((r) => (c.code && r.code === c.code) || (fold(r.name).length > 6 && (fold(r.name).includes(fold(c.name)) || fold(c.name).includes(fold(r.name)))));
    return p?.credits || 3;
  };
  const withAvg = courses.filter((c) => c.average !== null);
  if (!withAvg.length) return null;
  const totalCr = withAvg.reduce((a, c) => a + creditsOf(c), 0);
  const index = withAvg.reduce((a, c) => a + c.average! * creditsOf(c), 0) / totalCr;
  const risky = withAvg.filter((c) => c.average! < 75).sort((a, b) => a.average! - b.average!);
  // Proyección: «si saco X en todo lo que falta, ¿con cuánto termino el trimestre?»
  const left = courses.reduce((n, c) => n + Math.max(0, c.total - c.graded), 0);
  const projected = (x: number) => {
    const rows = courses.filter((c) => c.total > 0);
    const cr = rows.reduce((a, c) => a + creditsOf(c), 0);
    return rows.reduce((a, c) => a + ((c.average ?? x) * c.graded + x * Math.max(0, c.total - c.graded)) / Math.max(1, c.total) * creditsOf(c), 0) / Math.max(1, cr);
  };
  return (
    <>
      <section className="hero" style={{ padding: 32 }}>
        <div className="tick" />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#BCD0FF' }}>Índice del trimestre</div>
            <div className="num" style={{ fontSize: 'clamp(64px,9vw,110px)', lineHeight: 1, fontWeight: 800, letterSpacing: '-.05em', margin: '6px 0 8px' }}><CountUp value={index} decimals={1} /></div>
            <p style={{ fontSize: 16, color: '#DDE6FF' }}>{index >= 90 ? 'Excelente: vas con honores. ' : index >= 80 ? 'Muy bien, sigue así. ' : index >= 70 ? 'Aprobando, pero con poco margen. ' : 'Por debajo de 70: hay que subirlo. '}Ponderado por los créditos de tu pensum, mínimo 70.</p>
          </div>
          <div style={{ width: 260, maxWidth: '100%' }}>
            <div style={{ position: 'relative', height: 12, borderRadius: 99, background: 'rgba(255,255,255,.2)' }}>
              <i style={{ display: 'block', height: '100%', width: `${Math.min(100, index)}%`, borderRadius: 'inherit', background: 'var(--orange)' }} />
              <i style={{ position: 'absolute', left: '70%', top: -6, width: 3, height: 24, background: '#fff', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#BCD0FF', marginTop: 8 }}><span>0</span><span>mínimo 70</span><span>100</span></div>
          </div>
        </div>
        {left > 0 && <Projection left={left} projected={projected} />}
      </section>
      {risky.length > 0 && (
        <section className="card">
          <div className="head"><h3>Asignaturas a vigilar</h3><span className="chip c-rose num">{risky.length}</span></div>
          <ul>
            {risky.map((c) => (
              <li key={c.id} className="row"><span className="dot" style={{ background: c.color }} /><button className="t" onClick={() => onPick(c.id)}><b>{c.name}</b><small>{c.average! < 70 ? 'En riesgo' : 'Cerca de 70'}</small></button><span className={`chip ${c.average! < 70 ? 'c-rose' : 'c-orange'} num`}>{c.average}</span></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** «¿Y si…?»: con cuánto terminarías el trimestre según lo que saques en las actividades que faltan. */
function Projection({ left, projected }: { left: number; projected: (x: number) => number }) {
  const [x, setX] = useState(85);
  const end = projected(x);
  return (
    <div style={{ position: 'relative', marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.2)' }}>
      <label htmlFor="proj" style={{ fontSize: 14.5, color: '#DDE6FF' }}>Si saco <b className="num">{x}</b> en {left === 1 ? 'la actividad que falta' : `las ${left} actividades que faltan`}…</label>
      <input id="proj" type="range" min={50} max={100} step={1} value={x} onChange={(e) => { setX(Number(e.target.value)); haptic(3); }} className="range" style={{ width: '100%', accentColor: '#FF7A1A', margin: '10px 0 6px' }} aria-valuetext={`${x}: terminarías con ${end.toFixed(1)}`} />
      <span style={{ fontSize: 15, color: '#fff' }}>Terminarías el trimestre con <b className="num" style={{ fontSize: 22 }}>{end.toFixed(1)}</b> {end >= 90 ? '🏅' : end >= 70 ? '✅' : '⚠️'}</span>
    </div>
  );
}

/** Historial: tus asignaturas de trimestres anteriores con el promedio final. */
function History() {
  const h = useLoad(() => api<PastCourse[]>('/courses/history'));
  if (!h.data?.length) return null;
  return (
    <section className="card rbx">
      <div className="head"><h3>Trimestres anteriores</h3><span className="chip c-gray num">{h.data.length}</span></div>
      <ul>
        {h.data.map((c) => (
          <li key={c.id} className="row">
            <span className="dot" style={{ background: c.color }} />
            <div className="t"><b>{c.name}</b><small>{c.code ? c.code + ' · ' : ''}{c.delivered} entregas · {c.total ? `${c.graded} de ${c.total}` : c.graded} calificadas</small></div>
            {c.average !== null ? <span className={`chip ${c.average >= 70 ? 'c-mint' : 'c-rose'} num`} style={{ fontSize: 15 }}>{c.average}</span> : <span className="chip c-gray">Sin nota</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detail({ course, courses, onChanged }: { course: Course; courses: Course[]; onChanged: () => void }) {
  const grades = useLoad(() => api<Grade[]>(`/courses/${course.id}/grades`), [course.id]);
  const [order, setOrder] = useState<'fecha' | 'sin' | 'nota'>('fecha');
  // Al poner o quitar una nota a mano desde la ficha, la lista se actualiza.
  useEffect(() => { const l = () => { grades.reload(); onChanged(); }; window.addEventListener('rumbo:grades', l); return () => window.removeEventListener('rumbo:grades', l); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const upcoming = useLoad(() => api<Task[]>('/tasks?status=pending').then((l) => l.filter((t) => t.course_id === course.id)), [course.id]);
  const [goal, setGoal] = useState(90);
  const [fac, setFac] = useState(course.facilitator || '');
  const [open, setOpen] = useState<Task | null>(null);
  async function openTask(id: number) { haptic(5); try { setOpen(await api<Task>(`/tasks/${id}`)); } catch (e) { toast((e as Error).message, 'err'); } }
  const [sheet, setSheet] = useState<Grade | null>(null);
  const [showOff, setShowOff] = useState(false);
  const all = grades.data || [];
  // Lo quitado (no se corrige) va aparte y no entra en ningún cálculo.
  const off = all.filter((x) => x.ignored);
  const g = all.filter((x) => !x.ignored);
  // Mismo cálculo que el servidor (src/shared/promedio.ts): pesos del EVA si los publica; una actividad con peso 0 no cuenta.
  const { weighted, weightOf } = gradeWeights(g);
  const counts = (x: Grade) => weightOf(x) > 0;
  const graded = g.filter((x) => x.grade !== null && counts(x));
  const pending = g.filter((x) => x.grade === null && counts(x)).length;
  const countable = g.filter(counts).length;
  const need = neededFor(g, goal);
  const shownGrades = order === 'sin' ? g.filter((x) => x.grade === null)
    : order === 'nota' ? [...g].sort((a, b) => (b.grade === null ? -1 : (b.grade / b.grade_max)) - (a.grade === null ? -1 : (a.grade / a.grade_max))) : g;
  const pct = countable ? Math.round((graded.length / countable) * 100) : 0;
  const reloadAll = () => { grades.reload(); onChanged(); };

  async function saveFac() {
    if (fac === (course.facilitator || '')) return;
    await api(`/courses/${course.id}`, { method: 'PATCH', body: { facilitator: fac } });
    toast('Facilitador guardado');
    onChanged();
  }

  const verdict = g.length === 0 ? 'Sincroniza el EVA para calcularlo.'
    : pending === 0 ? `Ya tienes todas las notas. Promedio final: ${course.average}.`
    : need! > 100 ? `Con ${pending === 1 ? "la actividad que falta" : `las ${pending} actividades que faltan`} ya no es posible llegar a ${goal}.`
    : need! <= 0 ? `¡Ya lo tienes asegurado! Aunque saques 0, llegas a ${goal}.`
    : null;

  return (
    <>
      <section className="card detail" style={{ ['--c' as string]: course.color }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <RbRing pct={course.average ?? pct} size={96} dark>{course.average !== null ? fmtGrade(course.average) : `${pct}%`}</RbRing>
          <div style={{ flex: 1 }}>
            <span className="chip c-blue num">{course.code || course.short_name}</span>
            <h3 style={{ fontSize: 21, marginTop: 6 }}>{course.name}</h3>
            <p className="sm" style={{ color: 'var(--muted)' }}>{graded.length} de {countable} actividades calificadas{off.length ? ` · ${off.length} no cuenta${off.length === 1 ? '' : 'n'}` : ''}</p>
            {course.progress != null && <p className="sm" style={{ color: 'var(--muted)' }}>Avance del curso en el EVA · <b className="num">{course.progress}%</b></p>}
          </div>
        </div>
        {course.eva_total != null && course.eva_total_max ? (() => {
          const evaPct = (course.eva_total / course.eva_total_max) * 100;
          const offc = course.average !== null && Math.abs(evaPct - course.average) > 2;
          return <p className="sm" style={{ color: offc ? 'var(--rose)' : 'var(--muted)', marginBottom: 12 }}>Total oficial en el EVA: <b className="num">{fmtGrade(Math.round(course.eva_total * 100) / 100)}/{fmtGrade(course.eva_total_max)}</b>{offc ? ' · no coincide con el promedio de Rumbo: el EVA calcula con su propia fórmula (pesos y actividades que cuenta)' : ''}</p>;
        })() : null}
        {course.facilitator_eva && !course.facilitator ? (
          <p className="sm" style={{ color: 'var(--muted)', marginBottom: 12 }}>Facilitador/a · según el EVA: <b style={{ color: 'var(--ink)' }}>{course.facilitator_eva}</b></p>
        ) : (
          <div className="field" style={{ marginBottom: 12 }}><label htmlFor="fac" className="sm" style={{ color: 'var(--muted)' }}>Facilitador/a</label><input id="fac" className="input" value={fac} onChange={(e) => setFac(e.target.value)} onBlur={saveFac} placeholder={course.facilitator_eva || 'El EVA no lo publica: escríbelo aquí'} /></div>
        )}
        {grades.error && <div className="error">{grades.error}</div>}
        {!grades.data ? <div className="sk" style={{ height: 120 }} /> : g.length === 0 ? (
          <Empty icon="trend" title="Todavía no hay notas" text="Aparecen cuando el facilitador califica en el EVA. Rumbo revisa solo cada rato; si te acaban de calificar, revísalo ahora.">
            <button className="btn b-line" onClick={() => runSync().then((r) => { syncToast(r); grades.reload(); onChanged(); }).catch((e) => toast((e as Error).message, 'err'))}><Icon name="sync" size={17} />Revisar el EVA</button>
          </Empty>
        ) : (<>
          <div className="seg" role="tablist" aria-label="Ordenar notas" style={{ marginBottom: 8 }}>
            {([['fecha', 'Por fecha'], ['sin', `Sin nota${pending ? ` · ${pending}` : ''}`], ['nota', 'Por nota']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={order === id} className={order === id ? 'on' : ''} onClick={() => { haptic(4); setOrder(id); }}>{label}</button>)}
          </div>
          <ul>
            {shownGrades.length === 0 && <p className="sm" style={{ color: 'var(--muted)', padding: '10px 0' }}>Todo lo de esta asignatura ya tiene nota. 🎉</p>}
            {shownGrades.map((x) => {
              const v = x.grade === null ? null : (x.grade / x.grade_max) * 100;
              const cls = v === null ? 'c-gray' : v >= 90 ? 'c-mint' : v >= 70 ? 'c-blue' : 'c-rose';
              return (
                <li key={x.id} className="row">
                  <button className="t" onClick={() => { haptic(5); setSheet(x); }}>
                    <b>{x.item_name}</b>
                    <small>{x.due_at ? dateLabel(x.due_at) : ''}{x.status === 'done' && x.grade === null ? ' · entregada, sin nota' : ''}{x.source === 'foro' ? ' · nota del foro' : x.source === 'manual' ? ' · nota puesta por ti' : ''}{weighted ? (counts(x) ? ` · vale ${fmtGrade(Math.round(weightOf(x) * 1000) / 10)} %` : ' · vale 0 % en el EVA') : ''}</small>
                  </button>
                  <span className={`chip ${cls} num`}>{x.grade === null ? (counts(x) ? 'Pendiente' : 'No cuenta') : `${fmtGrade(x.grade)}/${fmtGrade(x.grade_max)}`}</span>
                </li>
              );
            })}
          </ul>
          {off.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button className="link" onClick={() => { haptic(4); setShowOff((v) => !v); }} aria-expanded={showOff}>No cuentan para el promedio · {off.length} {showOff ? '▾' : '▸'}</button>
              {showOff && off.map((x) => (
                <div key={x.id} className="row">
                  <div className="t"><b>{x.item_name}</b><small>{x.auto ? 'No se corrige: Rumbo la quitó sola' : 'La quitaste tú'}</small></div>
                  <button className="btn b-line" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => setActivityIgnored({ gradeId: x.id }, false, reloadAll).catch((e) => toast((e as Error).message, 'err'))}>Volver a contar</button>
                </div>
              ))}
            </div>
          )}
        </>)}
      </section>

      {upcoming.data && upcoming.data.length > 0 && (
        <section className="card">
          <div className="head"><h3>Próximas entregas</h3><span className="chip c-blue num">{upcoming.data.length}</span></div>
          <ul>{upcoming.data.map((t) => <RbTask key={t.id} t={t} onToggle={(x) => toggleTask(x, () => { upcoming.reload(); grades.reload(); }).catch((e) => toast((e as Error).message, 'err'))} onOpen={setOpen} />)}</ul>
        </section>
      )}
      <section className="card" style={{ background: 'var(--night)', color: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8FB0FF' }}>Simulador de nota</div>
        <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '6px 0 16px' }}>¿Cuánto necesito en lo que falta?</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><label htmlFor="goal" style={{ color: '#B8C3EE' }}>Quiero terminar con</label><b className="num" style={{ fontSize: 44, fontWeight: 800 }}>{goal}</b></div>
        <input id="goal" type="range" min={60} max={100} step={1} value={goal} onChange={(e) => { setGoal(Number(e.target.value)); haptic(3); }} style={{ width: '100%', accentColor: '#FF7A1A', margin: '10px 0 6px' }} />
        <div className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8FB0FF' }}><span>60</span><span>70</span><span>80</span><span>90</span><span>100</span></div>
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,.1)', borderRadius: 16, padding: '12px 14px', fontSize: 14 }}>
          {verdict ?? <>Necesitas un promedio de <b className="num" style={{ fontSize: 20 }}>{Math.max(0, Math.ceil(need ?? 0))}</b> {pending === 1 ? 'en la actividad que falta.' : `en las ${pending} actividades que faltan.`}</>}
        </div>
        <p style={{ fontSize: 12, color: '#8FB0FF', marginTop: 10 }}>{weighted ? 'Usa el peso que cada actividad tiene en el EVA.' : 'Cálculo aproximado: el EVA no publica los pesos, así que supone que todas las actividades valen lo mismo.'}</p>
      </section>
      {open && <TaskSheet task={open} courses={courses} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reloadAll(); }} />}
      {sheet && <GradeSheet grade={sheet} course={course} weightText={weighted ? (counts(sheet) ? `Vale ${fmtGrade(Math.round(weightOf(sheet) * 1000) / 10)} % de la nota` : 'En el EVA vale 0 %: no suma a tu promedio') : 'Todas las actividades valen lo mismo'}
        onClose={() => setSheet(null)} onOpenTask={(id) => { setSheet(null); void openTask(id); }} onChanged={() => { setSheet(null); reloadAll(); }} />}
    </>
  );
}

/**
 * Una actividad de Notas: poner tu nota (si el EVA todavía no la publica), quitarla porque no se corrige
 * (rúbrica de actitudes y valores, espacio fuera de fecha…) o abrir la tarea.
 */
function GradeSheet({ grade, course, weightText, onClose, onOpenTask, onChanged }: { grade: Grade; course: Course; weightText: string; onClose: () => void; onOpenTask: (id: number) => void; onChanged: () => void }) {
  const fromEva = grade.grade !== null && grade.source !== 'manual';
  const manual = grade.source === 'manual';
  const [value, setValue] = useState(manual && grade.grade !== null ? String(grade.grade) : '');
  const [max, setMax] = useState(String(grade.grade_max || 100));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/grades/${grade.id}/grade`, { method: 'POST', body: { grade: Number(value.replace(',', '.')), max: Number(max.replace(',', '.')) } });
      haptic(12); toast('Nota guardada: ya cuenta en tu promedio. Si el EVA la publica, se usa la del EVA.');
      window.dispatchEvent(new Event('rumbo:grades'));
      onChanged();
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function removeMine() {
    setBusy(true);
    try { await api(`/grades/${grade.id}/grade`, { method: 'DELETE' }); toast('Quitaste tu nota'); window.dispatchEvent(new Event('rumbo:grades')); onChanged(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  const pct = grade.grade !== null ? Math.round((grade.grade / grade.grade_max) * 100) : null;
  return (
    <Modal title={grade.item_name} onClose={onClose}>
      <div className="col">
        <div className="gs-head">
          <span className="ts-course"><span className="dot" style={{ background: course.color }} />{course.name}</span>
          <b className="gs-val num">{grade.grade === null ? 'Sin nota' : `${fmtGrade(grade.grade)} / ${fmtGrade(grade.grade_max)}`}{pct !== null && <small> · {pct}%</small>}</b>
          <span className="small muted">{fromEva ? 'Nota publicada en el EVA' : manual ? 'Nota puesta por ti' : 'El EVA todavía no tiene nota'} · {weightText}</span>
        </div>
        {!fromEva && (
          <form className="manual-grade open" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label htmlFor="gs-grade">{manual ? 'Cambiar mi nota' : 'Poner mi nota'}</label>
            <div className="mg-row">
              <input id="gs-grade" className="input num lg" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="95" />
              <span>de</span>
              <input id="gs-max" className="input num" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Nota máxima" />
            </div>
            <div className="mg-row">
              {manual && <button type="button" className="btn line grow" onClick={removeMine} disabled={busy}>Quitar mi nota</button>}
              <button type="submit" className="btn primary grow" disabled={busy || !value.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
        <div className="ts-links">
          {grade.task_id && <button className="link-btn" onClick={() => onOpenTask(grade.task_id!)}><Icon name="tasks" size={16} />Abrir la tarea</button>}
          <button className="link-btn" onClick={() => setActivityIgnored({ gradeId: grade.id }, true, onChanged).catch((e) => toast((e as Error).message, 'err'))}><Icon name="trash" size={16} />No se corrige: quitar del promedio</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Promedio final por asignatura: lo que llevas en cada una (final cuando ya tiene todas las notas),
 * el total oficial del EVA si lo publica y el índice del trimestre ponderado por créditos. Se puede copiar.
 */
function FinalGrades({ courses, onPick }: { courses: Course[]; onPick: (id: number) => void }) {
  const rows = courses.filter((c) => c.total > 0 || c.average !== null);
  if (!rows.length) return null;
  const withAvg = rows.filter((c) => c.average !== null);
  const cr = withAvg.reduce((a, c) => a + (c.credits || 3), 0);
  const index = cr ? withAvg.reduce((a, c) => a + c.average! * (c.credits || 3), 0) / cr : null;
  const allDone = rows.every((c) => c.complete);
  const evaOf = (c: Course) => (c.eva_total != null && c.eva_total_max ? Math.round((c.eva_total / c.eva_total_max) * 1000) / 10 : null);
  async function copy() {
    const lines = rows.map((c) => `${c.name}: ${c.average ?? '—'}${c.complete ? '' : ` (parcial, faltan ${c.total - c.graded})`} · ${c.credits || 3} cr`);
    const text = [`Promedio final por asignatura${allDone ? '' : ' (parcial)'}`, ...lines, index !== null ? `Índice del trimestre: ${index.toFixed(1)}` : ''].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(text); haptic(10); toast('Promedios copiados'); }
    catch { toast('No pude copiar', 'err'); }
  }
  return (
    <section className="card">
      <div className="head">
        <h3>Promedio final por asignatura</h3>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`chip ${allDone ? 'c-mint' : 'c-gray'}`}>{allDone ? 'Trimestre completo' : 'Parcial'}</span>
          <button className="link" onClick={copy}>Copiar</button>
        </span>
      </div>
      <ul>
        {rows.map((c) => {
          const eva = evaOf(c);
          return (
            <li key={c.id} className="row">
              <span className="dot" style={{ background: c.color }} />
              <button className="t" onClick={() => onPick(c.id)}>
                <b>{c.name}</b>
                <small>{c.credits || 3} créditos · {c.complete ? 'todas las notas' : `${c.graded} de ${c.total} calificadas`}{eva !== null && c.average !== null && Math.abs(eva - c.average) > 2 ? ` · EVA: ${fmtGrade(eva)}` : ''}</small>
              </button>
              {c.average !== null ? <span className={`chip ${c.average >= 90 ? 'c-mint' : c.average >= 70 ? 'c-blue' : 'c-rose'} num`} style={{ fontSize: 15 }}>{fmtGrade(c.average)}</span> : <span className="chip c-gray">Sin nota</span>}
            </li>
          );
        })}
        {index !== null && (
          <li className="row" style={{ background: 'var(--cobaltsoft)', borderRadius: 16, marginTop: 6 }}>
            <div className="t"><b>Índice del trimestre</b><small>Ponderado por créditos · lo que no se corrige no cuenta</small></div>
            <span className={`chip ${index >= 70 ? 'c-mint' : 'c-rose'} num`} style={{ fontSize: 16 }}>{index.toFixed(1)}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

const COLORS = ['#1F5FE0', '#0EA5E9', '#7C3AED', '#DB2777', '#F08A1C', '#0F9D6E', '#E11D48', '#475569'];

function AddCourse({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState('');
  async function save() {
    try { await api('/courses', { method: 'POST', body: { name, code, color } }); toast('Asignatura agregada'); onSaved(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title="Agregar asignatura" onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <div className="field"><label htmlFor="c-name">Nombre</label><input id="c-name" className="input lg" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div className="field"><label htmlFor="c-code">Clave</label><input id="c-code" className="input num" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CBC-105" /></div>
      <div className="field">
        <span className="label">Color</span>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)}>{color === c && <Icon name="check" size={16} style={{ strokeWidth: 3 }} />}</button>)}
        </div>
      </div>
      <div className="modal-actions"><button className="btn line grow-m" onClick={onClose}>Cancelar</button><button className="btn primary grow-m" onClick={save} disabled={!name.trim()}>Agregar</button></div>
    </Modal>
  );
}
