import { useRef, useState, type ReactNode } from 'react';
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

/** Fila de tarea del rediseño: casilla, título, materia, etiqueta de fecha y «Hacer con IA».
 *  Gestos: deslizar → marca hecha; ← pospone a mañana; mantener presionado abre el menú rápido. */
export function RbTask({ t, onToggle, onOpen }: { t: Task; onToggle: (t: Task) => void; onOpen: (t: Task) => void }) {
  const now = Date.now() / 1000;
  const done = t.status === 'done';
  const late = !done && !!t.due_at && t.due_at < now;
  const soon = !done && !late && !!t.due_at && t.due_at - now < 2 * 86400;
  const w = window as unknown as { __rwLpAt?: number; __rwLp?: number };
  const sw = useRef<{ x: number; y: number; dx: number; locked: boolean | null; lp?: ReturnType<typeof setTimeout>; fired?: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const start = (e: React.TouchEvent) => {
    const s: NonNullable<typeof sw.current> = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, locked: null };
    s.lp = setTimeout(() => { if (s.locked) return; s.fired = true; w.__rwLpAt = Date.now(); haptic(10); window.dispatchEvent(new CustomEvent('rumbo:taskmenu', { detail: t })); }, 480);
    sw.current = s;
  };
  const move = (e: React.TouchEvent) => {
    const s = sw.current; if (!s) return;
    const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimeout(s.lp);
    if (s.locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.locked = Math.abs(mx) > Math.abs(my) * 1.3 && (mx > 0 || !done);
    if (!s.locked) return;
    s.dx = Math.min(130, Math.max(done ? 0 : -130, mx));
    if ((s.dx > 90 && dx <= 90) || (s.dx < -90 && dx >= -90)) haptic(6);
    setDx(s.dx);
  };
  const end = () => {
    const s = sw.current;
    if (s) {
      clearTimeout(s.lp);
      if (s.fired) w.__rwLp = Date.now();
      if (s.dx > 90) { haptic(12); onToggle(t); } else if (s.dx < -90) window.dispatchEvent(new CustomEvent('rumbo:postpone', { detail: t }));
    }
    sw.current = null; setDx(0);
  };
  const cancel = () => { if (sw.current) clearTimeout(sw.current.lp); sw.current = null; setDx(0); };
  const armed = Math.abs(dx) > 90;
  return (
    <li className={`row ${done ? 'done' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .35s var(--spring)' }}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); if (Date.now() - (w.__rwLpAt || 0) > 1500) window.dispatchEvent(new CustomEvent('rumbo:taskmenu', { detail: t })); }}>
      {dx !== 0 && <i className={`swbg ${dx < 0 ? 'l' : 'r'} ${armed ? 'on' : ''}`} style={{ width: Math.abs(dx) }}>{dx < 0 ? 'Mañana' : done ? 'Reabrir' : 'Hecha'}</i>}
      <button className={`chk ${done ? 'on' : ''}`} onClick={() => { haptic(done ? 6 : 12); onToggle(t); }} aria-label={done ? 'Reabrir tarea' : 'Marcar como hecha'} />
      <button className="t" onClick={() => { if (Date.now() - (w.__rwLp || 0) >= 800) onOpen(t); }}>
        <b>{t.title}</b>
        <small>{t.course_name || t.course_short || 'Personal'}{t.due_at ? ` · ${late ? 'venció ' : ''}${late ? overdueLabel(t.due_at).replace(/^venció /i, '') : whenLabel(t.due_at)}` : ''}</small>
      </button>
      {late && <span className="chip c-rose">Atrasada</span>}
      {soon && <span className="chip c-orange">{whenLabel(t.due_at)}</span>}
      {!done && <button className="chip c-blue ia-chip" onClick={() => onOpen(t)}><span className="ia-long">Hacer con </span>IA</button>}
    </li>
  );
}

/** Pista de gestos: aparece una vez en el teléfono y se puede cerrar. */
export function GestureHint() {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem('rumbo-gesto'); } catch { return false; } });
  if (!show) return null;
  return (
    <div className="card hide-desktop gesto" role="note">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="chip c-blue" style={{ fontSize: 15, padding: '6px 10px' }}>↔</span>
        <p style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4 }}><b>Desliza una tarea</b> a la derecha para marcarla, a la izquierda para pasarla a mañana, o <b>mantenla presionada</b> para más opciones.</p>
      </div>
      <button className="link" style={{ marginTop: 8 }} onClick={() => { try { localStorage.setItem('rumbo-gesto', '1'); } catch { /* sin almacenamiento */ } setShow(false); }}>Entendido</button>
    </div>
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
