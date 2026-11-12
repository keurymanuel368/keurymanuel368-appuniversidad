import type { ReactNode } from 'react';
import { Icon } from './icons';
import { haptic } from './components';
import { overdueLabel, whenLabel, type Task } from './api';

/** Encabezado de pantalla del rediseño: pregunta/etiqueta, título, buscador y campana de avisos. */
export function RbTop({ eyebrow, title, go, unread = 0, children }: { eyebrow: string; title: string; go: (p: string) => void; unread?: number; children?: ReactNode }) {
  return (
    <header className="top">
      <div><div className="eb">{eyebrow}</div><h1 tabIndex={-1}>{title}</h1></div>
      <div className="sp" />
      {children}
      <button className="search" onClick={() => { haptic(5); window.dispatchEvent(new Event('rumbo:search')); }} aria-label="Buscar o preguntar a Rumbo"><Icon name="search" size={18} />Buscar o preguntar a Rumbo</button>
      <button className="pill-btn" onClick={() => go('avisos')} aria-label="Avisos"><Icon name="bell" size={22} />{unread > 0 && <b className="num">{unread}</b>}</button>
    </header>
  );
}

/** Fila de tarea del rediseño: casilla, título, materia, etiqueta de fecha y «Hacer con IA». */
export function RbTask({ t, onToggle, onOpen }: { t: Task; onToggle: (t: Task) => void; onOpen: (t: Task) => void }) {
  const now = Date.now() / 1000;
  const done = t.status === 'done';
  const late = !done && !!t.due_at && t.due_at < now;
  const soon = !done && !late && !!t.due_at && t.due_at - now < 2 * 86400;
  return (
    <li className={`row ${done ? 'done' : ''}`}>
      <button className={`chk ${done ? 'on' : ''}`} onClick={() => { haptic(done ? 6 : 12); onToggle(t); }} aria-label={done ? 'Reabrir tarea' : 'Marcar como hecha'} />
      <button className="t" onClick={() => onOpen(t)}>
        <b>{t.title}</b>
        <small>{t.course_name || t.course_short || 'Personal'}{t.due_at ? ` · ${late ? 'venció ' : ''}${late ? overdueLabel(t.due_at).replace(/^venció /i, '') : whenLabel(t.due_at)}` : ''}</small>
      </button>
      {late && <span className="chip c-rose">Atrasada</span>}
      {soon && <span className="chip c-orange">{whenLabel(t.due_at)}</span>}
      {!done && <button className="chip c-blue ia-chip" onClick={() => onOpen(t)}><span className="ia-long">Hacer con </span>IA</button>}
    </li>
  );
}

/** Anillo de avance con el bisel de brújula. */
export function RbRing({ pct, size = 150, children, dark = false }: { pct: number; size?: number; children?: ReactNode; dark?: boolean }) {
  const r = size * 0.4, c = 2 * Math.PI * r, sw = size * 0.1;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div className="ringsvg" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(11,18,48,.1)' : 'rgba(255,255,255,.2)'} strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FF7A1A" strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)' }} />
      </svg>
      <div className="mid" style={{ fontSize: size * 0.24, color: dark ? 'var(--ink)' : '#fff' }}>{children ?? `${Math.round(pct)}%`}</div>
    </div>
  );
}
