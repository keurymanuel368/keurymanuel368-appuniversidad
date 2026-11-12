import { Suspense, lazy, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
// El modo estudio se descarga solo cuando lo abres.
const StudyModal = lazy(() => import('./Study').then((m) => ({ default: m.StudyModal })));
// Foro y entregas en el EVA (se descargan al abrir la ficha).
const ForumSheet = lazy(() => import('./EvaActions').then((m) => ({ default: m.ForumSheet })));
const SubmitPanel = lazy(() => import('./EvaActions').then((m) => ({ default: m.SubmitPanel })));
import { createPortal } from 'react-dom';
import { api, cap, type Course, type Task, unixToLocalInput, localInputToUnix, overdueLabel, urgency, whenLabel } from './api';
import { WorkButton } from './TrabajoIA';
import { Icon } from './icons';
import { Mascot } from './Mascot';

/** Vibración corta en móviles (si el navegador la soporta). */
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* sin vibración */ } };

// ----- Avisos flotantes (toasts) -----
type ToastAction = { label: string; run: () => void };
type ToastT = { id: number; text: string; kind: 'ok' | 'err'; action?: ToastAction; out?: boolean };
const toastListeners = new Set<(t: ToastT) => void>();
export function toast(text: string, kind: 'ok' | 'err' = 'ok', action?: ToastAction) {
  const t = { id: Date.now() + Math.random(), text, kind, action };
  toastListeners.forEach((l) => l(t));
}

// ----- Sincronizar el EVA (una sola a la vez) con la barrita de progreso arriba -----
export type SyncRes = { result: { tasksNew: number; courses: number; pastCourses: number; delivered: number; forumGrades?: number; warnings: string[] } };
let syncing: Promise<SyncRes> | null = null;
export function runSync(): Promise<SyncRes> {
  if (syncing) return syncing;
  window.dispatchEvent(new CustomEvent('rumbo:sync', { detail: true }));
  syncing = api<SyncRes>('/sync', { method: 'POST' }).finally(() => {
    syncing = null;
    window.dispatchEvent(new CustomEvent('rumbo:sync', { detail: false }));
    window.dispatchEvent(new Event('rumbo:badges'));
  });
  return syncing;
}
export function syncToast(r: SyncRes, verbose = false) {
  const x = r.result;
  toast(`EVA al día${verbose ? ` · ${x.delivered} entregas en tu historial` : ''}${x.tasksNew ? ` · ${x.tasksNew} nuevas` : ''}${x.forumGrades ? ` · ${x.forumGrades} nota${x.forumGrades === 1 ? '' : 's'} de foros` : ''}`);
  if (verbose && x.warnings?.length) toast('Algunas partes del EVA no respondieron: ' + x.warnings.join(' · '), 'err');
}
export function SyncBar() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const l = (e: Event) => setOn(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('rumbo:sync', l);
    return () => window.removeEventListener('rumbo:sync', l);
  }, []);
  return <div className={`sync-bar ${on ? 'on' : ''}`} role="status" aria-label={on ? 'Actualizando el EVA' : undefined} />;
}

/** Marca una tarea como hecha o pendiente; al completarla ofrece «Deshacer» por unos segundos. */
/**
 * Quitar una actividad que no se corrige (rúbrica de actitudes y valores, espacio fuera de fecha…): sale de pendientes y del promedio.
 * Con «Deshacer» por si fue sin querer. Sirve para tareas (taskId) y para renglones de Notas (gradeId).
 */
export async function setActivityIgnored(target: { taskId?: number; gradeId?: number }, ignored: boolean, reload: () => void) {
  const path = target.taskId ? `/tasks/${target.taskId}/ignore` : `/grades/${target.gradeId}/ignore`;
  await api(path, { method: 'POST', body: { ignored } });
  haptic(10);
  reload();
  window.dispatchEvent(new Event('rumbo:grades'));
  window.dispatchEvent(new Event('rumbo:badges'));
  toast(ignored ? 'Quitada: ya no cuenta para tu promedio ni sale en pendientes' : 'Volvió a contar para tu promedio', 'ok', {
    label: 'Deshacer',
    run: async () => {
      try { await api(path, { method: 'POST', body: { ignored: !ignored } }); reload(); window.dispatchEvent(new Event('rumbo:grades')); window.dispatchEvent(new Event('rumbo:badges')); }
      catch (e) { toast((e as Error).message, 'err'); }
    },
  });
}

/** Confeti corto (28 piezas, solo transform/opacity): para celebrar una entrega, una nota alta o terminar un repaso. */
export function confetti(x = window.innerWidth / 2, y = window.innerHeight * 0.38) {
  if (typeof document === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
  const colors = ['#3B8CFF', '#FF8A1F', '#34D399', '#A78BFA', '#F472B6', '#FDE047'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('i');
    const size = 6 + Math.random() * 6;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() > .5 ? 1 : .45)}px;border-radius:${Math.random() > .5 ? '50%' : '2px'};background:${colors[i % colors.length]}`;
    box.appendChild(p);
    const ang = (Math.random() * 1.1 - 0.55) * Math.PI - Math.PI / 2;
    const v = 140 + Math.random() * 220;
    const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v;
    p.animate([
      { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${180 + Math.random() * 300}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 260}px)) rotate(${400 + Math.random() * 300}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1800);
}

export async function toggleTask(t: Task, reload: () => void) {
  const next = t.status === 'done' ? 'pending' : 'done';
  await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: next } });
  reload();
  window.dispatchEvent(new Event('rumbo:badges'));
  if (next === 'done') confetti();
  if (next === 'done') toast('¡Bien hecho! Tarea completada', 'ok', {
    label: 'Deshacer',
    run: async () => {
      try { await api(`/tasks/${t.id}`, { method: 'PATCH', body: { status: 'pending' } }); reload(); window.dispatchEvent(new Event('rumbo:badges')); }
      catch (e) { toast((e as Error).message, 'err'); }
    },
  });
}
export function Toaster() {
  const [list, setList] = useState<ToastT[]>([]);
  useEffect(() => {
    const l = (t: ToastT) => {
      setList((x) => [...x.slice(-2), t]);
      const life = t.action ? 6000 : 4000;
      // Primero sale por el mismo camino por el que entró; después se quita.
      setTimeout(() => setList((x) => x.map((y) => (y.id === t.id ? { ...y, out: true } : y))), life);
      setTimeout(() => setList((x) => x.filter((y) => y.id !== t.id)), life + 260);
    };
    toastListeners.add(l);
    return () => { toastListeners.delete(l); };
  }, []);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {list.map((t) => <div key={t.id} className={`toast ${t.kind} ${t.out ? 'out' : ''}`} role={t.kind === 'err' ? 'alert' : 'status'}><span className="toast-ic"><Icon name={t.kind === 'ok' ? 'check' : 'alert'} size={16} style={{ strokeWidth: 2.6 }} /></span><span className="toast-txt">{t.text}</span>
        {t.action && <button className="toast-act" onClick={() => { haptic(6); t.action!.run(); setList((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}</div>)}
    </div>
  );
}

// ----- Modal: ventana centrada en escritorio, hoja inferior en móvil -----
const modalStack: RefObject<HTMLDivElement | null>[] = [];
export function Modal({ title, onClose, children, bare = false }: { title: string; onClose: () => void; children: ReactNode; bare?: boolean }) {
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number; hist: { y: number; t: number }[] } | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Cerrar: la hoja baja por el mismo camino por el que subió y después se quita.
  const close = useRef(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onCloseRef.current(); return; }
    setClosing(true);
    setTimeout(() => onCloseRef.current(), 250);
  }).current;
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
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En móvil la hoja sigue al dedo 1:1. Al soltar se proyecta adónde iba (como un lanzamiento):
  // si va a quedar más abajo de un tercio, o se lanzó rápido hacia abajo, se cierra con esa velocidad;
  // si no, vuelve a su sitio con resorte. Hacia arriba resiste como una goma.
  const onStart = (e: React.TouchEvent) => {
    if ((sheet.current?.scrollTop ?? 0) > 0 || closingRef.current) return;
    const y = e.touches[0].clientY;
    drag.current = { y, dy: 0, hist: [{ y, t: performance.now() }] };
    sheet.current?.classList.add('dragging');
  };
  const onMove = (e: React.TouchEvent) => {
    if (!drag.current || !sheet.current) return;
    const y = e.touches[0].clientY;
    const raw = y - drag.current.y;
    const h = sheet.current.offsetHeight || 600;
    const dy = raw >= 0 ? raw : -((-raw * h * 0.55) / (h + 0.55 * -raw)) * 0.35; // goma hacia arriba
    drag.current.dy = dy;
    drag.current.hist.push({ y, t: performance.now() });
    if (drag.current.hist.length > 6) drag.current.hist.shift();
    sheet.current.style.animation = 'none';
    sheet.current.style.transition = 'none';
    sheet.current.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    const d = drag.current, el = sheet.current;
    if (!d || !el) return;
    drag.current = null;
    el.classList.remove('dragging');
    const a = d.hist[0], b = d.hist[d.hist.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s
    const projected = d.dy + ((v / 1000) * 0.99) / (1 - 0.99);
    const h = el.offsetHeight || 600;
    if (d.dy > 8 && (projected > h * 0.35 || v > 900)) {
      haptic(6);
      closingRef.current = true;
      const left = h - d.dy;
      const dur = Math.min(0.32, Math.max(0.14, left / Math.max(v, 1400)));
      el.style.transition = `transform ${dur}s cubic-bezier(.25, .9, .4, 1)`;
      el.style.transform = `translateY(${h + 20}px)`;
      el.parentElement?.classList.add('closing');
      setTimeout(() => onCloseRef.current(), dur * 1000);
    } else {
      el.style.transition = 'transform .5s var(--spring-snappy)';
      el.style.transform = '';
    }
  };

  // Se dibuja directo en <body> (portal): así ninguna animación de la página puede esconderla.
  return createPortal(
    <div className={`backdrop ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()} onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={sheet} tabIndex={-1} className={`modal ${bare ? 'bare' : ''} ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drag-zone" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
          <div className="grabber" aria-hidden="true" />
          {bare
            ? <button className="icon-btn soft modal-x" onClick={close} aria-label="Cerrar"><Icon name="x" size={18} /></button>
            : <div className="modal-head"><h2>{title}</h2><button className="icon-btn soft" onClick={close} aria-label="Cerrar"><Icon name="x" size={18} /></button></div>}
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
  // Escribe el número directo en el DOM: sin volver a pintar React 60 veces por segundo.
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) { el.textContent = value.toFixed(decimals); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 600);
      el.textContent = (value * (1 - Math.pow(1 - p, 3))).toFixed(decimals);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, decimals]);
  return <span ref={ref}>{value.toFixed(decimals)}</span>;
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

  // Deslizar a la derecha para completar (o reabrir) la tarea; a la izquierda, posponerla a mañana.
  // Mantener presionada abre el menú rápido (lo pinta rumbo-plus.js al recibir «rumbo:taskmenu»).
  const row = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; dx: number; locked: boolean | null; lp?: ReturnType<typeof setTimeout>; lpFired?: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const w = window as unknown as { __rwLpAt?: number; __rwLp?: number };
  const onStart = (e: React.TouchEvent) => {
    const s: NonNullable<typeof swipe.current> = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, locked: null };
    s.lp = setTimeout(() => {
      if (s.locked) return;
      s.lpFired = true; w.__rwLpAt = Date.now(); haptic(10);
      window.dispatchEvent(new CustomEvent('rumbo:taskmenu', { detail: t }));
    }, 480);
    swipe.current = s;
  };
  const onMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimeout(s.lp);
    if (s.locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.locked = Math.abs(mx) > Math.abs(my) * 1.3 && (mx > 0 || !done);
    if (!s.locked) return;
    s.dx = Math.min(140, Math.max(done ? 0 : -140, mx));
    if ((s.dx > 90 && dx <= 90) || (s.dx < -90 && dx >= -90)) haptic(6);
    setDx(s.dx);
  };
  const onEnd = () => {
    const s = swipe.current;
    if (s) {
      clearTimeout(s.lp);
      if (s.lpFired) w.__rwLp = Date.now();
      if (s.dx > 90) toggle();
      else if (s.dx < -90) window.dispatchEvent(new CustomEvent('rumbo:postpone', { detail: t }));
    }
    swipe.current = null; setDx(0);
  };
  const onCancel = () => { if (swipe.current) clearTimeout(swipe.current.lp); swipe.current = null; setDx(0); };
  // En computadora: clic derecho abre el mismo menú (salvo que acabe de abrirse por toque largo).
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (Date.now() - (w.__rwLpAt || 0) > 1500) window.dispatchEvent(new CustomEvent('rumbo:taskmenu', { detail: t }));
  };

  const graded = t.grade !== null && t.grade !== undefined && t.grade_max;
  const pct = graded ? (t.grade! / t.grade_max!) * 100 : null;

  return (
    <div className="task-wrap" ref={row} style={{ ['--cc' as string]: t.course_color || '#B8C6E0' }}>
      <div className={`swipe-bg ${dx > 90 || dx < -90 ? 'armed' : ''} ${dx < 0 ? 'left' : ''}`} style={{ opacity: dx ? 1 : 0 }} aria-hidden="true">
        <Icon name={dx < 0 ? 'clock' : done ? 'sync' : 'check'} size={20} style={{ strokeWidth: 2.6 }} />{dx < 0 ? 'Mañana' : done ? 'Reabrir' : 'Hecha'}
      </div>
      <div className={`task ${done ? 'done' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : undefined }}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onCancel} onContextMenu={onContextMenu}>
        <button className={`check ${done ? 'on' : ''}`} onClick={toggle} aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}>
          <Icon name="check" size={15} style={{ strokeWidth: 3.2 }} />
        </button>
        <button className="body" onClick={() => { if (Date.now() - (w.__rwLp || 0) >= 800) onOpen?.(t); }} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
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
  const [studyMode, setStudyMode] = useState<'plan' | 'foro'>('plan');
  const [forum, setForum] = useState(false);
  const [task, setTask] = useState<Task>(initial);
  const refresh = () => api<Task>(`/tasks/${initial.id}`).then(setTask).catch(() => {});
  // Las instrucciones y el tiempo de estudio se cargan al abrir la ficha.
  useEffect(() => { api<Task>(`/tasks/${initial.id}`).then(setTask).catch(() => {}); }, [initial.id]);
  if (editing) return <TaskModal task={task} courses={courses} onClose={() => setEditing(false)} onSaved={onChanged} />;
  if (focus) return <FocusMode task={task} onClose={(mins) => { setFocus(false); if (mins) setTask((t) => ({ ...t, focus_minutes: (t.focus_minutes || 0) + mins })); }} />;

  const done = task.status === 'done';
  const u = urgency(task.due_at);
  const graded = task.grade !== null && task.grade !== undefined && !!task.grade_max;
  const pct = graded ? Math.round((task.grade! / task.grade_max!) * 100) : null;
  const closed = done && task.notes === 'Plazo cerrado en el EVA';
  const ignored = task.status === 'ignored';
  const state = ignored ? 'Quitada' : done ? (closed ? 'Plazo cerrado' : task.source === 'eva' ? 'Entregada' : 'Hecha') : u === 'red' && task.due_at ? overdueLabel(task.due_at) : 'Pendiente';
  const tone = ignored ? 'gray' : done ? (closed ? 'gray' : 'green') : u === 'red' ? 'red' : u === 'orange' ? 'orange' : 'blue';
  const userNotes = task.notes && !/en el EVA$/.test(task.notes) ? task.notes : '';
  const dateTime = (s: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(s * 1000));
  const isForum = !!task.moodle_key?.startsWith('forum:');
  const files: { name: string }[] = (() => { try { return JSON.parse(task.attachments || '[]'); } catch { return []; } })();
  const isAssign = !!task.moodle_key?.startsWith('assign:');
  // Todo lo de la tarea en un solo texto, listo para pegarlo en ChatGPT, Gemini o cualquier IA.
  async function copyForAI() {
    const text = [
      `Asignatura: ${task.course_name || 'Personal'}`,
      `Actividad: ${task.title}${isForum ? ' (foro de discusión)' : ''}`,
      task.due_at ? `Fecha de entrega: ${dateTime(task.due_at)}` : '',
      task.facilitator ? `Facilitador/a: ${task.facilitator}` : '',
      files.length ? `Archivos adjuntos del facilitador: ${files.map((f) => f.name).join(', ')}` : '',
      '',
      'Instrucciones del facilitador:',
      task.description || '(El EVA no tiene instrucciones escritas para esta actividad.)',
    ].filter((l, i) => l || i > 4).join('\n');
    haptic(10);
    try { await navigator.clipboard.writeText(text); toast('Instrucciones copiadas. Pégalas en tu IA favorita.'); }
    catch { toast('No pude copiar: mantén presionado el texto de las instrucciones', 'err'); }
  }
  const srcTag = task.grade_source === 'foro' ? 'tomada del foro' : task.grade_source === 'manual' ? 'puesta por ti' : '';

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
          <span className="fb-head"><Icon name="chat" size={16} />{task.grade_source === 'foro' ? 'Respuesta del facilitador en el foro' : 'Comentario del facilitador'}</span>
          <p>{task.grade_feedback}</p>
        </div>
      )}

      {ignored && (
        <div className="ignored-note"><Icon name="alert" size={17} /><span><b>No cuenta.</b> La quitaste del promedio y de pendientes (o Rumbo la quitó porque no se corrige).</span>
          <button className="link-btn" onClick={() => setActivityIgnored({ taskId: task.id }, false, () => { void refresh(); onChanged(); })}>Volver a contar</button>
        </div>
      )}

      <div className="facts">
        {/* La calificación solo cuando tiene sentido: ya hay nota o ya se entregó. */}
        {(graded || done) && <div className="fact"><Icon name="trend" size={18} /><span>Calificación{srcTag && <small className="src-tag">{srcTag}</small>}</span><b className={graded ? (pct! >= 70 ? 'good' : 'bad') : ''}>{graded ? `${fmtGrade(task.grade!)} / ${fmtGrade(task.grade_max!)} · ${pct}%` : 'Todavía sin nota'}</b></div>}
        <div className="fact"><Icon name="calendar" size={18} /><span>Fecha de entrega</span><b>{task.due_at ? cap(dateTime(task.due_at)) : 'Sin fecha'}</b></div>
        {isForum && task.forum_posts != null && (
          <div className="fact"><Icon name="chat" size={18} /><span>Tu participación en el foro</span>
            <b className={task.forum_posts && (!task.forum_needed || (task.forum_replies ?? 0) >= task.forum_needed) ? 'good' : ''}>
              {task.forum_posts ? 'Aporte ✓' : 'Sin aporte todavía'}
              {task.forum_needed ? ` · Respuestas ${task.forum_replies ?? 0} de ${task.forum_needed}` : task.forum_replies ? ` · ${task.forum_replies} respuesta${task.forum_replies === 1 ? '' : 's'} a compañeros` : ''}
            </b></div>
        )}
        {task.submitted_at && !closed && <div className="fact"><Icon name="check" size={18} /><span>Registrada como entregada</span><b>{cap(dateTime(task.submitted_at))}</b></div>}
        {task.facilitator && <div className="fact"><Icon name="cap" size={18} /><span>Facilitador/a</span><b>{task.facilitator}</b></div>}
        {userNotes && <div className="fact"><Icon name="book" size={18} /><span>Notas</span><b>{userNotes}</b></div>}
      </div>

      {!ignored && (!graded || task.grade_source === 'manual') && <ManualGrade task={task} onSaved={refresh} />}

      {isAssign && !closed && <Suspense fallback={null}><SubmitPanel task={task} onDone={() => { void refresh(); onChanged(); }} /></Suspense>}

      {files.length > 0 && (
        <div className="ts-files">
          <span className="label"><Icon name="download" size={15} />Archivos del facilitador</span>
          {files.map((f, i) => <a key={i} className="file-row" href={`/api/tasks/${task.id}/files/${i}`} target="_blank" rel="noopener"><Icon name="book" size={17} /><span>{f.name}</span><Icon name="chevron" size={16} className="row-chevron" /></a>)}
        </div>
      )}

      {task.description && (
        <div className="instructions">
          <div className="instr-head">
            <span className="label"><Icon name="book" size={15} />Instrucciones del facilitador</span>
            <button className="btn soft sm" onClick={copyForAI}><Icon name="upload" size={15} />Copiar</button>
          </div>
          <div className={`instr-text ${showAll ? 'open' : ''}`}>{task.description}</div>
          {task.description.length > 420 && <button className="link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ver menos' : 'Ver todo'}<Icon name="chevron" size={15} /></button>}
        </div>
      )}

      {/* Primero lo que más se hace con una tarea (entregarla y marcarla); después, las ayudas para hacerla. */}
      <div className="ts-actions">
        <div className="ts-row">
          {!done && !ignored && <button className="btn primary lg grow" onClick={toggle} disabled={busy}><Icon name="check" size={19} />Ya la entregué</button>}
          {task.url && <a className={`btn ${done ? 'primary' : 'line'} lg grow`} href={task.url} target="_blank" rel="noopener"><Icon name="link" size={18} />Abrir en el EVA</a>}
        </div>
        {isForum && (
          <div className="ts-help">
            <button className="btn study-btn" onClick={() => { haptic(10); setForum(true); }}><Icon name="chat" size={19} /><span className="tb-txt"><b>Ver el foro y participar</b><small>tu aporte, respuestas y compañeros</small></span></button>
            <button className="btn focus-btn" onClick={() => { haptic(10); setStudyMode('foro'); setStudying(true); }}><Icon name="spark" size={19} /><span className="tb-txt"><b>Borrador con IA</b><small>aporte e ideas para responder</small></span></button>
          </div>
        )}
        {forum && <Suspense fallback={null}><ForumSheet task={task} onClose={() => setForum(false)} onPosted={() => { void refresh(); }} /></Suspense>}
        {!done && !ignored && (
          <div className="ts-help">
            <button className="btn study-btn" onClick={() => { haptic(10); setStudyMode('plan'); setStudying(true); }}><Icon name="spark" size={19} /><span className="tb-txt"><b>Estudiar con IA</b><small>plan · práctica · explicación</small></span></button>
            <button className="btn focus-btn" onClick={() => { haptic(10); setFocus(true); }}><Icon name="clock" size={19} /><span className="tb-txt"><b>Modo enfoque</b><small>{task.focus_minutes ? `llevas ${task.focus_minutes} min` : 'temporizador para concentrarte'}</small></span></button>
            <WorkButton taskId={task.id} title={task.title} />
          </div>
        )}
        {studying && <Suspense fallback={null}><StudyModal task={task} initial={studyMode} onClose={() => setStudying(false)} /></Suspense>}
        <div className="ts-links">
          {done && <button className="link-btn" onClick={toggle} disabled={busy}><Icon name="sync" size={16} />Reabrir</button>}
          {!ignored && <button className="link-btn" onClick={() => setActivityIgnored({ taskId: task.id }, true, () => onChanged())}><Icon name="trash" size={16} />No se corrige: quitar</button>}
          {!task.description && <button className="link-btn" onClick={copyForAI}><Icon name="upload" size={16} />Copiar para la IA</button>}
          <button className="link-btn" onClick={() => setEditing(true)}><Icon name="gear" size={16} />Editar tarea</button>
        </div>
      </div>
    </Modal>
  );
}

/** «Poner mi nota»: para cuando el EVA no publica la nota (pasa mucho con los foros). */
function ManualGrade({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const manual = task.grade_source === 'manual';
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(manual && task.grade != null ? String(task.grade) : '');
  const [max, setMax] = useState(String(task.grade_max || 100));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/tasks/${task.id}/grade`, { method: 'POST', body: { grade: Number(grade.replace(',', '.')), max: Number(max.replace(',', '.')) } });
      haptic(12); toast('Nota guardada. Si el EVA la publica, se usa la del EVA.'); setOpen(false); onSaved();
      window.dispatchEvent(new Event('rumbo:grades'));
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function remove() {
    setBusy(true);
    try { await api(`/tasks/${task.id}/grade`, { method: 'DELETE' }); toast('Quitaste tu nota'); onSaved(); window.dispatchEvent(new Event('rumbo:grades')); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  if (!open) return (
    <div className="manual-grade">
      <button className="link-btn" onClick={() => { haptic(6); setOpen(true); }}><Icon name="trend" size={16} />{manual ? 'Cambiar mi nota' : 'Poner mi nota'}</button>
      {manual ? <button className="link-btn muted-link" onClick={remove} disabled={busy}>Quitar</button> : <span className="small muted">¿Ya te la dieron y el EVA no la muestra?</span>}
    </div>
  );
  return (
    <form className="manual-grade open" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label htmlFor="mg-grade">Mi nota</label>
      <div className="mg-row">
        <input id="mg-grade" className="input num lg" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="95" autoFocus />
        <span>de</span>
        <input id="mg-max" className="input num" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Nota máxima" />
      </div>
      <div className="mg-row">
        <button type="button" className="btn line grow" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="submit" className="btn primary grow" disabled={busy || !grade.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
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
      <div className="rbx" style={{ gap: 0 }}>
        <header className="top">
          <div><div className="eb">{cap(eyebrow)}</div><h1 tabIndex={-1}>{title}</h1></div>
          <div className="sp" />
          {children}
          <button className="search" onClick={() => { haptic(5); window.dispatchEvent(new Event('rumbo:search')); }} aria-label="Buscar o preguntar a Rumbo"><Icon name="search" size={18} />Buscar o preguntar a Rumbo</button>
        </header>
      </div>
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
      <span className="empty-art"><Mascot mood="tranqui" size={78} /><span className="empty-ic"><Icon name={icon} size={18} /></span></span>
      <b>{title}</b>
      {text && <span>{text}</span>}
      {children}
    </div>
  );
}

/** Datos ya vistos: al volver a una pantalla se pinta al instante y se refresca por detrás (nada de pantallas en blanco). */
const loadCache = new Map<string, unknown>();
// Copia en el teléfono: al abrir la app (o sin internet) las pantallas se pintan al instante con lo último visto.
const LC = 'rumbo-lc:';
const lcHash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function lcGet(key: string): unknown { try { const v = localStorage.getItem(LC + lcHash(key)); return v ? JSON.parse(v) : undefined; } catch { return undefined; } }
function lcSet(key: string, v: unknown) { try { const s = JSON.stringify(v); if (s.length < 300000) localStorage.setItem(LC + lcHash(key), s); } catch { /* sin espacio */ } }
export function clearLoadCache() {
  loadCache.clear();
  try { Object.keys(localStorage).filter((k) => k.startsWith(LC)).forEach((k) => localStorage.removeItem(k)); } catch { /* sin almacenamiento */ }
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const key = fn.toString() + '|' + JSON.stringify(deps);
  const [data, setDataRaw] = useState<T | null>(() => ((loadCache.get(key) ?? lcGet(key)) as T | undefined) ?? null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const setData = (d: T | null | ((prev: T | null) => T | null)) => setDataRaw((prev) => {
    const next = typeof d === 'function' ? (d as (p: T | null) => T | null)(prev) : d;
    if (next !== null) { loadCache.set(key, next); lcSet(key, next); }
    return next;
  });
  useEffect(() => {
    let alive = true;
    const cached = (loadCache.get(key) ?? lcGet(key)) as T | undefined;
    if (cached !== undefined) setDataRaw(cached);
    fn().then((d) => { loadCache.set(key, d); lcSet(key, d); if (alive) { setDataRaw(d); setError(''); } }).catch((e) => { if (alive && cached === undefined) setError(e.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  // live.js avisa «rumbo:live» cuando cambió algo en otro dispositivo o en el servidor: se recarga solo.
  useEffect(() => {
    const onLive = () => setTick((t) => t + 1);
    window.addEventListener('rumbo:live', onLive);
    return () => window.removeEventListener('rumbo:live', onLive);
  }, []);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}
