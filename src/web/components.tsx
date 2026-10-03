import { Suspense, lazy, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
// El modo estudio se descarga solo cuando lo abres.
const StudyModal = lazy(() => import('./Study').then((m) => ({ default: m.StudyModal })));
import { createPortal } from 'react-dom';
import { api, cap, type Course, type Task, unixToLocalInput, localInputToUnix, overdueLabel, urgency, whenLabel } from './api';
import { Icon } from './icons';

/** Vibración corta en móviles (si el navegador la soporta). */
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* sin vibración */ } };

// ----- Avisos flotantes (toasts) -----
type ToastT = { id: number; text: string; kind: 'ok' | 'err' };
const toastListeners = new Set<(t: ToastT) => void>();
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  const t = { id: Date.now() + Math.random(), text, kind };
  toastListeners.forEach((l) => l(t));
}
export function Toaster() {
  const [list, setList] = useState<ToastT[]>([]);
  useEffect(() => {
    const l = (t: ToastT) => {
      setList((x) => [...x.slice(-2), t]);
      setTimeout(() => setList((x) => x.filter((y) => y.id !== t.id)), 4000);
    };
    toastListeners.add(l);
    return () => { toastListeners.delete(l); };
  }, []);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {list.map((t) => <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}><span className="toast-ic"><Icon name={t.kind === 'ok' ? 'check' : 'alert'} size={16} style={{ strokeWidth: 2.6 }} /></span>{t.text}</div>)}
    </div>
  );
}

// ----- Modal: ventana centrada en escritorio, hoja inferior en móvil -----
const modalStack: RefObject<HTMLDivElement | null>[] = [];
export function Modal({ title, onClose, children, bare = false }: { title: string; onClose: () => void; children: ReactNode; bare?: boolean }) {
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  useEffect(() => {
    // Accesibilidad: el foco entra a la ventana, no se escapa con Tab, Escape cierra solo la de arriba
    // y al cerrar vuelve al botón que la abrió.
    const opener = document.activeElement as HTMLElement | null;
    modalStack.push(sheet);
    const focusables = () => [...(sheet.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])].filter((el) => el.offsetParent !== null);
    requestAnimationFrame(() => {
      if (sheet.current && !sheet.current.contains(document.activeElement)) {
        const auto = sheet.current.querySelector<HTMLElement>('[autofocus]');
        (auto || sheet.current).focus({ preventScroll: true });
      }
    });
    const k = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== sheet) return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k); document.body.style.overflow = prev;
      modalStack.splice(modalStack.indexOf(sheet), 1);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  // En móvil la hoja se cierra arrastrándola hacia abajo desde la parte superior.
  const onStart = (e: React.TouchEvent) => {
    if ((sheet.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onMove = (e: React.TouchEvent) => {
    if (!drag.current || !sheet.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    sheet.current.style.transition = 'none';
    sheet.current.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (!drag.current || !sheet.current) return;
    const { dy } = drag.current;
    drag.current = null;
    sheet.current.style.transition = '';
    if (dy > 110) { haptic(6); onClose(); } else sheet.current.style.transform = '';
  };

  // Se dibuja directo en <body> (portal): así ninguna animación de la página puede esconderla.
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} tabIndex={-1} className={`modal ${bare ? 'bare' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drag-zone" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
          <div className="grabber" aria-hidden="true" />
          {bare
            ? <button className="icon-btn soft modal-x" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
            : <div className="modal-head"><h2>{title}</h2><button className="icon-btn soft" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button></div>}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ----- Texto del asistente con formato (sin asteriscos) -----
function inlineRich(s: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // nota "92.5/100" | *negrita* | _cursiva_ | promedio "88 de promedio" / "promedio de 88"
  const re = /(\d+(?:\.\d+)?)\s*\/\s*(100|20|10)\b|\*([^*\n]+)\*|_([^_\n]+)_|(\d+(?:\.\d+)?)(?= de promedio)|(?<=promedio (?:de |es de |es )?)(\d+(?:\.\d+)?)/g;
  let last = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1] !== undefined) {
      const ok = Number(m[1]) / Number(m[2]) >= 0.7;
      out.push(<span key={k} className={`rt-grade ${ok ? 'good' : 'bad'}`}><b>{m[1]}</b>/{m[2]}</span>);
    } else if (m[3] !== undefined) {
      const n = Number(m[3].replace(',', '.'));
      // número suelto en negrita (un promedio): verde si pasa de 70, rojo si no
      if (/^\d+(\.\d+)?$/.test(m[3].trim()) && n <= 100) out.push(<strong key={k} className={n >= 70 ? 'good' : 'bad'}>{m[3]}</strong>);
      else out.push(<strong key={k}>{inlineRich(m[3], k)}</strong>);
    } else if (m[4] !== undefined) {
      out.push(<em key={k}>{m[4]}</em>);
    } else {
      const v = m[5] ?? m[6];
      out.push(<span key={k} className={`rt-avg num ${Number(v) >= 70 ? 'good' : 'bad'}`}>{v}</span>);
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Muestra una respuesta del asistente con títulos, listas y notas en color, sin asteriscos. */
export function RichText({ text }: { text: string }) {
  // "*95* de 100" → "95/100" para mostrarlo como nota
  const clean = text.replace(/\*(\d+(?:\.\d+)?)\*\s*(?:de|\/)\s*(100|20|10)\b/g, '$1/$2');
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul className="rt-list" key={`ul${blocks.length}`}>{list}</ul>); list = []; } };
  clean.split('\n').forEach((raw, i) => {
    const l = raw.trim();
    const bullet = l.match(/^(?:[•·✓-]|\d+[.)])\s+(.*)$/);
    if (bullet) { list.push(<li key={i}>{inlineRich(bullet[1].replace(/^#\d+\s*\|\s*/, '').replace(/\s*\|\s*/g, ' · '), `li${i}`)}</li>); return; }
    flush();
    if (!l) return;
    // Acciones que hizo el asistente, advertencias y consejos: con su propio estilo.
    if (/^✅/.test(l)) { blocks.push(<p className="rt-done" key={i}><span className="rt-done-ic">✓</span>{inlineRich(l.replace(/^✅\s*/, ''), `d${i}`)}</p>); return; }
    if (/^⚠️/.test(l)) { blocks.push(<p className="rt-warn" key={i}>{inlineRich(l.replace(/^⚠️\s*/, ''), `w${i}`)}</p>); return; }
    if (/^💡/.test(l)) { blocks.push(<p className="rt-tip" key={i}><span>💡</span><span>{inlineRich(l.replace(/^💡\s*/, ''), `t${i}`)}</span></p>); return; }
    // Títulos: "*📌 Título*" (o "* 📌 Título" sin cerrar, que a veces escribe la IA)
    const head = l.match(/^\*([^*]+)\*:?$/) || (l.length < 48 && /^\*\s*\S/.test(l) && !l.slice(1).includes('*') ? [l, l.slice(1)] : null);
    if (head) blocks.push(<p className="rt-head" key={i}>{head[1].trim().replace(/:$/, '')}</p>);
    else blocks.push(<p key={i}>{inlineRich(l, `p${i}`)}</p>);
  });
  flush();
  return <div className="rt">{blocks}</div>;
}

/** Número que sube animado hasta su valor (como en las apps de finanzas). */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toFixed(decimals)}</>;
}

export function Ring({ value, label, size = 140, stroke = 11, light = true, display }: { value: number; label?: string; size?: number; stroke?: number; light?: boolean; display?: ReactNode }) {
  const r = 60 - stroke / 2 - 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(id); }, [value]);
  return (
    <div className={`ring ${light ? 'light' : 'dark'}`} style={{ width: size, height: size }} role="img" aria-label={`${typeof display === 'string' || typeof display === 'number' ? display : `${Math.round(value)}%`}${label ? ' ' + label : ''}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" className="ring-track" strokeWidth={stroke} />
        <circle cx="60" cy="60" r={r} fill="none" className="ring-fill" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, shown)) / 100)} />
      </svg>
      <div className="center" aria-hidden="true"><b className="num">{display ?? `${value}%`}</b>{label && <span>{label}</span>}</div>
    </div>
  );
}

export function TaskRow({ t, onToggle, onOpen }: { t: Task; onToggle: (t: Task) => void; onOpen?: (t: Task) => void }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [t.status]);
  const done = optimistic ?? t.status === 'done';
  const u = urgency(t.due_at);
  const due = u === 'red' && t.due_at ? overdueLabel(t.due_at) : whenLabel(t.due_at);

  function toggle() {
    setOptimistic(!done);
    haptic(done ? 6 : 12);
    setTimeout(() => onToggle(t), 380);
  }

  // Deslizar a la derecha para completar (o reabrir) la tarea.
  const row = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; dx: number; locked: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const onStart = (e: React.TouchEvent) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, locked: null }; };
  const onMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y;
    if (s.locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.locked = Math.abs(mx) > Math.abs(my) * 1.3 && mx > 0;
    if (!s.locked) return;
    s.dx = Math.min(140, Math.max(0, mx));
    if (s.dx > 90 && dx <= 90) haptic(6);
    setDx(s.dx);
  };
  const onEnd = () => { if (swipe.current && swipe.current.dx > 90) toggle(); swipe.current = null; setDx(0); };

  const graded = t.grade !== null && t.grade !== undefined && t.grade_max;
  const pct = graded ? (t.grade! / t.grade_max!) * 100 : null;

  return (
    <div className="task-wrap" ref={row} style={{ ['--cc' as string]: t.course_color || '#B8C6E0' }}>
      <div className={`swipe-bg ${dx > 90 ? 'armed' : ''}`} style={{ opacity: dx ? 1 : 0 }} aria-hidden="true">
        <Icon name={done ? 'sync' : 'check'} size={20} style={{ strokeWidth: 2.6 }} />{done ? 'Reabrir' : 'Hecha'}
      </div>
      <div className={`task ${done ? 'done' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : undefined }}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <button className={`check ${done ? 'on' : ''}`} onClick={toggle} aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}>
          <Icon name="check" size={15} style={{ strokeWidth: 3.2 }} />
        </button>
        <button className="body" onClick={() => onOpen?.(t)} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
          <span className="title">{t.title}</span>
          <span className="sub">
            <span className="dot" style={{ background: t.course_color || '#B8C6E0' }} />
            <span className="sub-txt">{t.course_short || t.course_name || 'Personal'}</span>
            {done && t.notes && /en el EVA$/.test(t.notes) && !graded && <span className={`done-tag ${t.notes.startsWith('Plazo') ? 'closed' : ''}`}>{t.notes.startsWith('Plazo') ? 'Plazo cerrado' : 'Entregada'}</span>}
            {!done && <span className={`due ${u} hide-desktop`}><Icon name="clock" size={12} style={{ strokeWidth: 2.4 }} />{due}</span>}
          </span>
        </button>
        {graded
          ? <span className={`grade-badge ${pct! >= 70 ? 'good' : 'bad'}`}><b className="num">{fmtGrade(t.grade!)}</b><small className="num">/{fmtGrade(t.grade_max!)}</small></span>
          : !done && <span className={`pill ${u} hide-mobile`}>{due}</span>}
        {onOpen && <Icon name="chevron" size={18} className="row-chevron" />}
      </div>
    </div>
  );
}

export const fmtGrade = (n: number) => String(Math.round(n * 100) / 100);

/** Ficha de una tarea: nota, estado, fechas y facilitador. Editar es una acción secundaria. */
export function TaskSheet({ task: initial, courses, onClose, onChanged }: { task: Task; courses: Course[]; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const [studying, setStudying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [task, setTask] = useState<Task>(initial);
  // Las instrucciones y el tiempo de estudio se cargan al abrir la ficha.
  useEffect(() => { api<Task>(`/tasks/${initial.id}`).then(setTask).catch(() => {}); }, [initial.id]);
  if (editing) return <TaskModal task={task} courses={courses} onClose={() => setEditing(false)} onSaved={onChanged} />;
  if (focus) return <FocusMode task={task} onClose={(mins) => { setFocus(false); if (mins) setTask((t) => ({ ...t, focus_minutes: (t.focus_minutes || 0) + mins })); }} />;

  const done = task.status === 'done';
  const u = urgency(task.due_at);
  const graded = task.grade !== null && task.grade !== undefined && !!task.grade_max;
  const pct = graded ? Math.round((task.grade! / task.grade_max!) * 100) : null;
  const closed = done && task.notes === 'Plazo cerrado en el EVA';
  const state = done ? (closed ? 'Plazo cerrado' : task.source === 'eva' ? 'Entregada' : 'Hecha') : u === 'red' && task.due_at ? overdueLabel(task.due_at) : 'Pendiente';
  const tone = done ? (closed ? 'gray' : 'green') : u === 'red' ? 'red' : u === 'orange' ? 'orange' : 'blue';
  const userNotes = task.notes && !/en el EVA$/.test(task.notes) ? task.notes : '';
  const dateTime = (s: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(s * 1000));

  async function toggle() {
    setBusy(true); haptic(12);
    await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: done ? 'pending' : 'done' } });
    toast(done ? 'Tarea reabierta' : '¡Bien hecho! Tarea completada');
    onChanged();
  }

  return (
    <Modal title={task.title} onClose={onClose} bare>
      <div className="ts-hero" style={{ ['--c' as string]: task.course_color || '#1F5FE0' }}>
        <div className="ts-copy">
          <span className="ts-course"><span className="dot" />{task.course_name || 'Personal'}</span>
          <h2>{task.title}</h2>
          <div className="ts-chips">
            <span className={`pill ${tone}`}>{state}</span>
            {task.source === 'eva' && <span className="pill blue">EVA</span>}
          </div>
        </div>
        {graded
          ? <Ring value={pct!} size={96} stroke={9} light={false} display={fmtGrade(task.grade!)} label={`de ${fmtGrade(task.grade_max!)}`} />
          : <div className="ts-nograde"><Icon name={done ? 'clock' : 'tasks'} size={22} /><span>{done ? 'Sin calificar' : 'Por entregar'}</span></div>}
      </div>

      {graded && task.grade_feedback && (
        <div className="feedback-card">
          <span className="fb-head"><Icon name="chat" size={16} />Comentario del facilitador</span>
          <p>{task.grade_feedback}</p>
        </div>
      )}

      <div className="facts">
        {/* La calificación solo cuando tiene sentido: ya hay nota o ya se entregó. */}
        {(graded || done) && <div className="fact"><Icon name="trend" size={18} /><span>Calificación</span><b className={graded ? (pct! >= 70 ? 'good' : 'bad') : ''}>{graded ? `${fmtGrade(task.grade!)} / ${fmtGrade(task.grade_max!)} · ${pct}%` : 'Todavía sin nota'}</b></div>}
        <div className="fact"><Icon name="calendar" size={18} /><span>Fecha de entrega</span><b>{task.due_at ? cap(dateTime(task.due_at)) : 'Sin fecha'}</b></div>
        {task.submitted_at && !closed && <div className="fact"><Icon name="check" size={18} /><span>Registrada como entregada</span><b>{cap(dateTime(task.submitted_at))}</b></div>}
        {task.facilitator && <div className="fact"><Icon name="cap" size={18} /><span>Facilitador/a</span><b>{task.facilitator}</b></div>}
        {userNotes && <div className="fact"><Icon name="book" size={18} /><span>Notas</span><b>{userNotes}</b></div>}
      </div>

      {task.description && (
        <div className="instructions">
          <span className="label"><Icon name="book" size={15} />Instrucciones del facilitador</span>
          <div className={`instr-text ${showAll ? 'open' : ''}`}>{task.description}</div>
          {task.description.length > 420 && <button className="link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ver menos' : 'Ver todo'}<Icon name="chevron" size={15} /></button>}
        </div>
      )}

      {/* Primero lo que más se hace con una tarea (entregarla y marcarla); después, las ayudas para hacerla. */}
      <div className="ts-actions">
        <div className="ts-row">
          {!done && <button className="btn primary lg grow" onClick={toggle} disabled={busy}><Icon name="check" size={19} />Ya la entregué</button>}
          {task.url && <a className={`btn ${done ? 'primary' : 'line'} lg grow`} href={task.url} target="_blank" rel="noopener"><Icon name="link" size={18} />Abrir en el EVA</a>}
        </div>
        {!done && (
          <div className="ts-help">
            <button className="btn study-btn" onClick={() => { haptic(10); setStudying(true); }}><Icon name="spark" size={19} /><span className="tb-txt"><b>Estudiar con IA</b><small>plan · práctica · explicación</small></span></button>
            <button className="btn focus-btn" onClick={() => { haptic(10); setFocus(true); }}><Icon name="clock" size={19} /><span className="tb-txt"><b>Modo enfoque</b><small>{task.focus_minutes ? `llevas ${task.focus_minutes} min` : 'temporizador para concentrarte'}</small></span></button>
          </div>
        )}
        {studying && <Suspense fallback={null}><StudyModal task={task} onClose={() => setStudying(false)} /></Suspense>}
        <div className="ts-links">
          {done && <button className="link-btn" onClick={toggle} disabled={busy}><Icon name="sync" size={16} />Reabrir</button>}
          <button className="link-btn" onClick={() => setEditing(true)}><Icon name="gear" size={16} />Editar tarea</button>
        </div>
      </div>
    </Modal>
  );
}

/** Modo enfoque (Pomodoro): temporizador a pantalla completa que suma tus minutos de estudio a la tarea. */
export function FocusMode({ task, onClose }: { task: Task; onClose: (minutes: number) => void }) {
  const PRESETS = [25, 50, 15];
  const [length, setLength] = useState(25);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [doneMin, setDoneMin] = useState(0);
  const total = length * 60_000;
  const left = endAt ? Math.max(0, endAt - now) : pausedLeft ?? total;
  const running = endAt !== null;

  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [running]);
  // Mantiene la pantalla encendida mientras corre (si el teléfono lo permite).
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [running]);
  useEffect(() => {
    if (!running || left > 0) return;
    setEndAt(null); setPausedLeft(null);
    setDoneMin((m) => m + length);
    haptic(400);
    api(`/tasks/${task.id}/focus`, { method: 'POST', body: { minutes: length } }).catch(() => {});
    navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification('⏰ ¡Bloque terminado!', { body: `${length} min en «${task.title}». Toma un descanso corto.`, icon: '/icon-192.png', badge: '/badge-96.png', tag: 'focus' })).catch(() => {});
    toast(`¡Bien! ${length} minutos de enfoque en esta tarea`);
  }, [left, running, length, task.id, task.title]);

  function start() { haptic(10); setEndAt(Date.now() + (pausedLeft ?? total)); setPausedLeft(null); setNow(Date.now()); }
  function pause() { haptic(6); setPausedLeft(left); setEndAt(null); }
  async function stop() {
    const mins = Math.floor((total - left) / 60_000);
    if (running && mins > 0) { await api(`/tasks/${task.id}/focus`, { method: 'POST', body: { minutes: mins } }).catch(() => {}); }
    onClose(doneMin + (running ? mins : 0));
  }
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const pct = 100 - (left / total) * 100;

  return createPortal(
    <div className="focus" role="dialog" aria-label="Modo enfoque">
      <div className="focus-glow" aria-hidden="true" />
      <header className="focus-head">
        <span className="focus-course"><i style={{ background: task.course_color || '#7FB4FF' }} />{task.course_short || task.course_name || 'Personal'}</span>
        <h2>{task.title}</h2>
      </header>
      <div className="focus-ring">
        <Ring value={Math.round(pct)} size={260} stroke={8} display={`${mm}:${ss}`} label={running ? 'enfocado' : pausedLeft !== null ? 'en pausa' : 'listo para empezar'} />
      </div>
      {!running && pausedLeft === null && (
        <div className="focus-presets">{PRESETS.map((p) => <button key={p} className={length === p ? 'on' : ''} onClick={() => { haptic(5); setLength(p); }}>{p} min</button>)}</div>
      )}
      <div className="focus-actions">
        {running ? <button className="focus-main" onClick={pause}>Pausar</button> : <button className="focus-main" onClick={start}>{pausedLeft !== null ? 'Seguir' : 'Empezar'}</button>}
        <button className="focus-stop" onClick={stop}>{running || pausedLeft !== null ? 'Terminar' : 'Salir'}</button>
      </div>
      <p className="focus-note">{doneMin ? `Hoy sumaste ${doneMin} min aquí. ` : ''}Deja el teléfono a un lado: Rumbo te avisa al terminar.</p>
    </div>,
    document.body,
  );
}

/** Tira de días con puntos de entregas; tocar un día lo selecciona (otra vez, lo quita). */
export function WeekStrip({ tasks, selected, onSelect }: { tasks: Task[]; selected: string | null; onSelect: (day: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = (sec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date(sec * 1000));
  const now = Math.floor(Date.now() / 1000);
  const days = Array.from({ length: 21 }, (_, i) => now + (i - 3) * 86400);
  const today = key(now);
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) if (t.due_at) { const k = key(t.due_at); byDay.set(k, [...(byDay.get(k) || []), t]); }
  useEffect(() => { const el = ref.current?.querySelector<HTMLElement>('.day-pill.today'); if (el && ref.current) ref.current.scrollLeft = el.offsetLeft - 16 - el.offsetWidth * 2; }, []);
  const fmt = (o: Intl.DateTimeFormatOptions, s: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', ...o }).format(new Date(s * 1000));
  return (
    <div className="week" ref={ref} role="listbox" aria-label="Días">
      {days.map((s) => {
        const k = key(s);
        const list = byDay.get(k) || [];
        return (
          <button key={k} role="option" aria-selected={selected === k} className={`day-pill ${k === today ? 'today' : ''} ${selected === k ? 'on' : ''} ${s < now - 86400 ? 'past' : ''}`}
            onClick={() => { haptic(5); onSelect(selected === k ? null : k); }}>
            <span className="dw">{fmt({ weekday: 'short' }, s).replace('.', '').slice(0, 3)}</span>
            <b className="num">{fmt({ day: 'numeric' }, s)}</b>
            <span className="dots">{list.slice(0, 3).map((t) => <i key={t.id} style={{ background: t.course_color || 'var(--blue)' }} />)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Jalar hacia abajo desde arriba de la página para actualizar (como en las apps nativas). */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let y0: number | null = null, d = 0;
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 && !document.querySelector('.backdrop') ? e.touches[0].clientY : null; d = 0; };
    const move = (e: TouchEvent) => {
      if (y0 === null) return;
      d = Math.max(0, e.touches[0].clientY - y0);
      if (d > 0 && window.scrollY <= 0) { const v = Math.min(110, d * 0.5); if (v >= 70 && pullRef < 70) haptic(8); pullRef = v; setPull(v); }
    };
    let pullRef = 0;
    const end = async () => {
      if (y0 === null) return;
      y0 = null;
      if (pullRef >= 70) { setRefreshing(true); setPull(56); try { await onRefresh(); } finally { setRefreshing(false); } }
      pullRef = 0; setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  }, [onRefresh]);
  return { pull, refreshing };
}

export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  if (!pull && !refreshing) return null;
  return (
    <div className={`ptr ${refreshing ? 'spinning' : ''} ${pull >= 70 ? 'armed' : ''}`} style={{ height: pull }} aria-live="polite">
      <span className="ptr-ic" style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}><Icon name="sync" size={18} /></span>
      <span>{refreshing ? 'Sincronizando con el EVA…' : pull >= 70 ? 'Suelta para sincronizar' : 'Jala para sincronizar'}</span>
    </div>
  );
}

export function TaskModal({ task, courses, onClose, onSaved }: { task: Partial<Task> | null; courses: Course[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task?.title || '');
  const [due, setDue] = useState(unixToLocalInput(task?.due_at ?? null));
  const [course, setCourse] = useState(task?.course_id ? String(task.course_id) : '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !task?.id;

  async function save() {
    setErr(''); setBusy(true);
    try {
      const body = { title, due_at: localInputToUnix(due), course_id: course ? Number(course) : null, notes };
      if (isNew) await api('/tasks', { method: 'POST', body });
      else await api(`/tasks/${task!.id}`, { method: 'PATCH', body });
      haptic(12);
      toast(isNew ? 'Tarea agregada' : 'Cambios guardados');
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function remove() {
    if (!task?.id) return;
    await api(`/tasks/${task.id}`, { method: 'DELETE' });
    toast('Tarea eliminada');
    onSaved();
  }

  return (
    <Modal title={isNew ? 'Nueva tarea' : 'Editar tarea'} onClose={onClose}>
      {err && <div className="error">{err}</div>}
      <div className="field"><label htmlFor="t-title">Qué tienes que hacer</label><input id="t-title" className="input lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Análisis del cuento" autoFocus={isNew} /></div>
      <div className="field">
        <span className="label">Asignatura</span>
        <div className="chips" role="radiogroup" aria-label="Asignatura">
          <button type="button" role="radio" aria-checked={course === ''} className={`chip ${course === '' ? 'on' : ''}`} onClick={() => setCourse('')}><span className="dot" style={{ background: '#B8C6E0' }} />Personal</button>
          {courses.map((c) => (
            <button type="button" role="radio" aria-checked={course === String(c.id)} key={c.id} className={`chip ${course === String(c.id) ? 'on' : ''}`} onClick={() => setCourse(String(c.id))}>
              <span className="dot" style={{ background: c.color }} />{c.short_name || c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label htmlFor="t-due">Fecha y hora de entrega</label><input id="t-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      <div className="field"><label htmlFor="t-notes">Notas</label><textarea id="t-notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></div>
      {task?.source === 'eva' && <p className="hint"><Icon name="alert" size={16} />Esta tarea viene del EVA. Si cambias la fecha, la próxima sincronización la volverá a poner como en el EVA.</p>}
      {task?.url && <a className="btn soft" href={task.url} target="_blank" rel="noopener"><Icon name="link" size={18} />Abrir en el EVA</a>}
      <div className="modal-actions">
        {!isNew && <button className="btn danger" onClick={remove}><Icon name="trash" size={18} /><span className="lbl">Eliminar</span></button>}
        <button className="btn line grow-m" onClick={onClose}>Cancelar</button>
        <button className="btn primary grow-m" onClick={save} disabled={busy || !title.trim()}>{busy ? 'Guardando…' : isNew ? 'Agregar' : 'Guardar'}</button>
      </div>
    </Modal>
  );
}

/** true cuando la página se desplazó más de `y` píxeles. */
export function useScrolled(y = 48) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const on = () => setS(window.scrollY > y);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [y]);
  return s;
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  const scrolled = useScrolled(56);
  return (
    <>
      <div className={`mini-bar ${scrolled ? 'show' : ''}`} aria-hidden={!scrolled}><span>{title}</span></div>
      <header className="topbar">
        <div className="topbar-copy">
          <span className="eyebrow">{cap(eyebrow)}</span>
          <h1 tabIndex={-1}>{title}</h1>
        </div>
        {children && <div className="topbar-actions">{children}</div>}
      </header>
    </>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="seg" role="tablist" aria-label={label} style={{ ['--n' as string]: options.length, ['--i' as string]: i }}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => { haptic(5); onChange(o.id); }}>
          {o.label}{o.count !== undefined && <span className="seg-count num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ rows = 3, hero = true }: { rows?: number; hero?: boolean }) {
  return (
    <div className="sk-wrap" aria-busy="true" aria-label="Cargando">
      <div className="sk" style={{ height: 22, width: '40%' }} />
      <div className="sk" style={{ height: 34, width: '70%', marginBottom: 6 }} />
      {hero && <div className="sk" style={{ height: 170, borderRadius: 28 }} />}
      <div className="sk-grid">{[0, 1, 2, 3].slice(0, hero ? 4 : 2).map((i) => <div key={i} className="sk" style={{ height: 96 }} />)}</div>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk" style={{ height: 64 }} />)}
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      {text && <span>{text}</span>}
      {children}
    </div>
  );
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then((d) => { if (alive) { setData(d); setError(''); } }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}
