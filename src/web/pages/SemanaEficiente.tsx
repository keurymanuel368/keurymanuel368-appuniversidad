import { useState } from 'react';
import { api, type Course, type Task } from '../api';
import { Skeleton, TaskSheet, haptic, toast, toggleTask, useLoad } from '../components';
import { RbRing } from '../rb';
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
  const toggle = (t: Task) => { haptic(8); toggleTask(t, tasks.reload).catch((e) => toast((e as Error).message, 'err')); };

  if (!tasks.data) return <Skeleton rows={4} />;

  const card = (t: Task) => {
    const p = prioridad(t, now);
    return (
      <div key={t.id} className="tk" style={{ ['--c' as string]: t.due_at! < now ? 'var(--rose)' : t.course_color || 'var(--cobalt)' }} role="button" tabIndex={0} onClick={() => setOpen(t)} onKeyDown={(e) => e.key === 'Enter' && setOpen(t)}>
        <b>{t.title}</b>
        <span className="sm" style={{ color: 'var(--muted)' }}>{t.course_short || t.course_name || 'Personal'} · {t.due_at! < now ? 'venció ' + dayName(key(t.due_at!), true) : hora(t.due_at!)}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`chip ${p.level === 'alta' ? (t.due_at! < now ? 'c-rose' : 'c-orange') : p.level === 'media' ? 'c-blue' : 'c-gray'}`}>{p.label}</span>
          <WorkChip taskId={t.id} title={t.title} />
          <button className="chip c-mint" onClick={(e) => { e.stopPropagation(); toggle(t); }} aria-label="Marcar como hecha">Hecha</button>
        </div>
      </div>
    );
  };
  const nAlta = [...late, ...pendWeek].filter((t) => prioridad(t, now).level === 'alta').length;
  const nMedia = [...late, ...pendWeek].filter((t) => prioridad(t, now).level === 'media').length;
  const nBaja = [...late, ...pendWeek].filter((t) => prioridad(t, now).level === 'baja').length;

  return (
    <>
      <section className="hero" style={{ padding: '26px 30px' }}>
        <div className="tick" />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
          <RbRing pct={pct} size={112} />
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#BCD0FF' }}>Semana eficiente</div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: '-.025em', margin: '2px 0' }}>{pendWeek.length + late.length === 0 ? 'Semana libre ✨' : `${pendWeek.length + late.length} por hacer${late.length ? `, ${late.length} atrasada${late.length > 1 ? 's' : ''} primero` : ''}`}</h2>
            <p style={{ color: '#D8E2FF', fontSize: 15 }}>{late.length ? 'Hazlas primero y la semana queda limpia.' : pendWeek.length ? 'Todo al día. Sigue el orden de abajo.' : 'No tienes nada pendiente.'}{doneWeek ? ` ${doneWeek} ya hecha${doneWeek > 1 ? 's' : ''}.` : ''}</p>
          </div>
          <div className="hero-chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className="chip">Alta · {nAlta}</span><span className="chip">Media · {nMedia}</span><span className="chip">Baja · {nBaja}</span></div>
        </div>
      </section>

      <div className="dcols">
        {late.length > 0 && (
          <div className="dcol">
            <div className="dh" style={{ background: 'var(--rosesoft)' }}><b style={{ color: 'var(--rose)', fontFamily: 'var(--display)' }}>Atrasadas</b><span className="chip c-rose num">{late.length}</span></div>
            {late.map(card)}
          </div>
        )}
        {days.map((k) => {
          const list = byDay(k);
          const isToday = k === today;
          return (
            <div className="dcol" key={k}>
              <div className="dh" style={isToday ? { background: 'var(--cobaltsoft)' } : undefined}><b style={{ fontFamily: 'var(--display)', color: isToday ? '#1A3FD1' : undefined, textTransform: 'capitalize' }}>{isToday ? 'Hoy' : dayName(k, false).replace('.', '')}</b><span className="sm" style={{ color: 'var(--muted)' }}>{isToday ? dayName(k).replace('.', '') + ' ' : ''}{Number(k.slice(8))}</span></div>
              {list.length ? list.map(card) : <div style={{ border: '2px dashed #C9D3EE', borderRadius: 20, padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, fontWeight: 600 }}>Día libre</div>}
            </div>
          );
        })}
      </div>

      {open && <TaskSheet task={open} courses={courses.data || []} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); tasks.reload(); }} />}
    </>
  );
}
