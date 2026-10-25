import { useEffect, useMemo, useState } from 'react';
import { api, type Dashboard } from './api';
import { Icon } from './icons';
import { Mascot } from './Mascot';
import { useLoad } from './components';

type Cls = { id: number; code: string | null; title: string; day: number; start_min: number; end_min: number; room: string | null; building: string | null; start_date: string | null; end_date: string | null };
type Exam = { id: number; title: string; opens_at: number | null; closes_at: number | null };
type Hz = { classes: Cls[]; exams: Exam[] };
type Item = { key: string; t: number; end?: number; kind: 'class' | 'task' | 'exam'; title: string; meta: string; hue: number; go: string };

const PALETA = [218, 262, 172, 28, 332, 148, 196, 48];
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };
const h12 = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayIdx = (d: Date) => (d.getDay() + 6) % 7;
const onDay = (k: Cls, d: Date) => k.day === dayIdx(d) && (!k.start_date || iso(d) >= k.start_date) && (!k.end_date || iso(d) <= k.end_date);

/** Los eventos de un día: clases, entregas con hora y exámenes del DEA, ordenados. */
function itemsOf(day: Date, hz: Hz | null, d: Dashboard): Item[] {
  const out: Item[] = [];
  const key = iso(day);
  for (const k of hz?.classes || []) if (onDay(k, day)) out.push({ key: `c${k.id}`, t: k.start_min, end: k.end_min, kind: 'class', title: k.title, meta: [k.building, k.room].filter(Boolean).join(' · ') || 'Virtual', hue: hue(k.title), go: 'horario' });
  for (const t of d.tasks) {
    if (!t.due_at) continue;
    const at = new Date(t.due_at * 1000);
    if (iso(at) !== key) continue;
    out.push({ key: `t${t.id}`, t: at.getHours() * 60 + at.getMinutes(), kind: 'task', title: t.title, meta: t.course_short || t.course_name || 'Entrega', hue: hue(t.course_name || t.title), go: `tareas/${t.id}` });
  }
  for (const e of hz?.exams || []) {
    if (!e.opens_at) continue;
    const at = new Date(e.opens_at * 1000);
    if (iso(at) === key && e.opens_at * 1000 > Date.now() - 86400000) out.push({ key: `e${e.id}`, t: at.getHours() * 60 + at.getMinutes(), kind: 'exam', title: e.title.replace(/^PRUEBA DE EVALUACIÓN FINAL:\s*/i, 'Examen: '), meta: 'DEA', hue: 28, go: 'horario' });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** «Hoy»: una línea de tiempo viva con tus clases, entregas y exámenes, y una marca de «ahora» que se mueve sola. */
export function TodayTimeline({ d, go }: { d: Dashboard; go: (p: string) => void }) {
  const hz = useLoad(() => api<Hz>('/horario'));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = useMemo(() => itemsOf(now, hz.data, d), [now.getDate(), hz.data, d]);
  // Lo que viene después: el siguiente día con algo (hasta 10 días)
  const later = useMemo(() => {
    for (let i = 1; i <= 10; i++) { const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i); const it = itemsOf(day, hz.data, d); if (it.length) return { day, items: it.slice(0, 2), i }; }
    return null;
  }, [now.getDate(), hz.data, d]);
  if (!hz.data && !d.tasks.length) return null;

  // Dónde cae la marca de «ahora»: antes del primer elemento que aún no empieza
  const nowAt = today.findIndex((x) => (x.end ?? x.t + 1) > nowMin);
  const pending = today.filter((x) => (x.end ?? x.t + 1) > nowMin).length;
  const label = `${DIAS[dayIdx(now)][0].toUpperCase()}${DIAS[dayIdx(now)].slice(1)} ${now.getDate()}`;
  const rows: ({ nowMark: true } | Item)[] = [];
  today.forEach((x, i) => { if (i === nowAt) rows.push({ nowMark: true }); rows.push(x); });
  if (nowAt === -1 && today.length) rows.push({ nowMark: true });
  if (!today.length) rows.push({ nowMark: true });

  return (
    <section className="td" aria-label="Hoy">
      <header>
        <div><small>Hoy</small><h3>{label}</h3></div>
        <span className="td-count num">{today.length ? (pending ? `${pending} por delante` : 'Terminaste por hoy 🎉') : 'Día libre'}</span>
      </header>
      <ol className="td-rail">
        {rows.map((r, i) => 'nowMark' in r ? (
          <li key={`now${i}`} className="td-now"><i /><span>Ahora · {h12(nowMin)}</span></li>
        ) : (
          <li key={r.key} className={`td-item ${r.kind} ${(r.end ?? r.t + 1) <= nowMin ? 'past' : r.t <= nowMin ? 'live' : ''}`} style={{ ['--h' as string]: r.hue }}>
            <span className="td-time num">{h12(r.t).replace(' ', ' ')}</span>
            <button onClick={() => go(r.go)}>
              <span className="td-ic"><Icon name={r.kind === 'class' ? 'cap' : r.kind === 'exam' ? 'tasks' : 'check'} size={15} /></span>
              <span className="td-copy"><b>{r.title}</b><small>{r.end ? `${h12(r.t)} – ${h12(r.end)} · ` : ''}{r.meta}</small></span>
              {r.t <= nowMin && (r.end ?? 0) > nowMin && <em className="td-live"><i />Ahora</em>}
            </button>
          </li>
        ))}
      </ol>
      {!today.length && (
        <div className="td-empty"><Mascot mood="tranqui" size={54} /><span>No tienes clases ni entregas con hora hoy. Buen día para adelantar o descansar.</span></div>
      )}
      {later && (
        <button className="td-later" onClick={() => go(later.items[0].go)}>
          <small>{later.i === 1 ? 'Mañana' : `${DIAS[dayIdx(later.day)][0].toUpperCase()}${DIAS[dayIdx(later.day)].slice(1)} ${later.day.getDate()}`}</small>
          <b>{later.items[0].title}</b>
          <em className="num">{h12(later.items[0].t)}</em>
          <Icon name="chevron" size={16} />
        </button>
      )}
    </section>
  );
}
