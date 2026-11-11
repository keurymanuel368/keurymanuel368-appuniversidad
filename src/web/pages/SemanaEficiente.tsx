import { useState } from 'react';
import { api, type Course, type Task } from '../api';
import { Empty, Skeleton, TaskSheet, haptic, toast, toggleTask, useLoad } from '../components';
import { Icon } from '../icons';
import { WorkChip } from '../TrabajoIA';

const TZ = 'America/Santo_Domingo';
const key = (sec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(sec * 1000));
const dayName = (k: string, long = false) => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: long ? 'long' : 'short', ...(long ? { day: 'numeric', month: 'long' } : {}) }).format(new Date(k + 'T12:00:00Z'));
const hora = (sec: number) => new Intl.DateTimeFormat('es-DO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(sec * 1000));

type Prio = { level: 'alta' | 'media' | 'baja'; label: string; score: number };
/** Prioridad: lo vencido y lo que cierra en menos de 48 h es alta; foros, cuestionarios y exámenes pesan más. */
function prioridad(t: Task, now: number): Prio {
  const left = (t.due_at ?? now + 30 * 86400) - now;
  let score = left < 0 ? 100 : left < 86400 ? 90 : left < 2 * 86400 ? 75 : left < 4 * 86400 ? 50 : 25;
  if (/examen|parcial|final|quiz|cuestionario|prueba/i.test(t.title)) score += 12;
  if (/proyecto|ensayo|informe|trabajo final/i.test(t.title)) score += 6;
  if (t.forum_needed && (t.forum_replies ?? 0) < t.forum_needed) score += 4;
  return score >= 75 ? { level: 'alta', label: left < 0 ? 'Atrasada' : 'Alta', score } : score >= 45 ? { level: 'media', label: 'Media', score } : { level: 'baja', label: 'Baja', score };
}

export function SemanaEficiente() {
  const tasks = useLoad(() => api<Task[]>('/tasks'));
  const courses = useLoad(() => api<Course[]>('/courses'));
  const [open, setOpen] = useState<Task | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const now = Date.now() / 1000;
  const today = key(now);
  const all = (tasks.data || []).filter((t) => t.due_at);

  const days = Array.from({ length: 7 }, (_, i) => key(now + i * 86400));
  const weekEnd = now + 7 * 86400;
  const pending = all.filter((t) => t.status === 'pending');
  const late = pending.filter((t) => t.due_at! < now).sort((a, b) => a.due_at! - b.due_at!);
  const doneWeek = all.filter((t) => t.status === 'done' && t.due_at! >= now - 3 * 86400 && t.due_at! < weekEnd).length;
  const pendWeek = pending.filter((t) => t.due_at! >= now && t.due_at! < weekEnd);
  const total = doneWeek + pendWeek.length + late.length;
  const pct = total ? Math.round((doneWeek / total) * 100) : 100;
  const byDay = (k: string) => pendWeek.filter((t) => key(t.due_at!) === k)
    .sort((a, b) => prioridad(b, now).score - prioridad(a, now).score || a.due_at! - b.due_at!);
  const maxLoad = Math.max(1, ...days.map((k) => byDay(k).length));
  const toggle = (t: Task) => { haptic(8); toggleTask(t, tasks.reload).catch((e) => toast((e as Error).message, 'err')); };

  if (!tasks.data) return <Skeleton rows={4} />;
  const shownDays = sel ? days.filter((k) => k === sel) : days;
  const R = 34, C = 2 * Math.PI * R;

  const row = (t: Task) => {
    const p = prioridad(t, now);
    return (
      <div key={t.id} className={`se-row ${p.level}`} role="button" tabIndex={0} onClick={() => setOpen(t)} onKeyDown={(e) => e.key === 'Enter' && setOpen(t)}>
        <button className="se-check" aria-label="Marcar como hecha" onClick={(e) => { e.stopPropagation(); toggle(t); }}><Icon name="check" size={14} /></button>
        <div className="se-main">
          <b>{t.title}</b>
          <span className="se-sub"><i style={{ background: t.course_color || 'var(--blue)' }} />{t.course_short || t.course_name || 'Personal'} · {t.due_at! < now ? 'venció ' + dayName(key(t.due_at!), true) : hora(t.due_at!)}</span>
        </div>
        <WorkChip taskId={t.id} title={t.title} />
        <span className={`se-prio ${p.level}`}>{p.label}</span>
      </div>
    );
  };

  return (
    <div className="se">
      <section className="se-hero">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="8" />
          <circle cx="42" cy="42" r={R} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 42 42)" style={{ transition: 'stroke-dashoffset .8s ease' }} />
          <text x="42" y="48" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="800">{pct}%</text>
        </svg>
        <div>
          <span className="se-eyebrow">Semana eficiente</span>
          <h2>{pendWeek.length + late.length === 0 ? 'Semana libre ✨' : `${pendWeek.length + late.length} por hacer`}</h2>
          <p>{late.length ? `${late.length} atrasada${late.length > 1 ? 's' : ''}: hazlas primero.` : pendWeek.length ? 'Todo al día. Sigue el orden de abajo.' : 'No tienes nada pendiente.'}{doneWeek ? ` ${doneWeek} ya hecha${doneWeek > 1 ? 's' : ''}.` : ''}</p>
        </div>
      </section>

      <div className="se-days" role="tablist" aria-label="Días de la semana">
        {days.map((k) => {
          const n = byDay(k).length;
          return (
            <button key={k} role="tab" aria-selected={sel === k} className={`se-day ${k === today ? 'today' : ''} ${sel === k ? 'on' : ''}`} onClick={() => { haptic(4); setSel(sel === k ? null : k); }}>
              <span>{dayName(k).replace('.', '')}</span><b className="num">{Number(k.slice(8))}</b>
              <i style={{ height: `${8 + (n / maxLoad) * 22}px`, opacity: n ? 1 : 0.25 }} />
            </button>
          );
        })}
      </div>

      {!sel && late.length > 0 && (
        <section className="se-sec">
          <h3 className="late">Atrasadas <span className="pill red num">{late.length}</span></h3>
          <div className="se-card">{late.map(row)}</div>
        </section>
      )}

      {shownDays.map((k) => {
        const list = byDay(k);
        if (!list.length && !sel) return null;
        return (
          <section className="se-sec" key={k}>
            <h3>{k === today ? 'Hoy' : dayName(k, true)} {list.length > 0 && <span className="pill blue num">{list.length}</span>}</h3>
            {list.length ? <div className="se-card">{list.map(row)}</div>
              : <div className="se-card"><Empty icon="check" title="Día libre" text="No vence nada este día." /></div>}
          </section>
        );
      })}
      {!sel && late.length + pendWeek.length === 0 && <div className="se-card"><Empty icon="check" title="Semana libre" text="No tienes entregas en los próximos 7 días." /></div>}

      {open && <TaskSheet task={open} courses={courses.data || []} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); tasks.reload(); }} />}
    </div>
  );
}
