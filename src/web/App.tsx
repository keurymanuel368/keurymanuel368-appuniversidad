import { Suspense, lazy, startTransition, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { api, ApiError, type Course } from './api';
import { Icon } from './icons';
import { Modal, SyncBar, TaskModal, Toaster, clearLoadCache, haptic, toast } from './components';
import { SearchModal } from './Search';
import { Welcome } from './Welcome';
import { isAdmin, setMe, type Me } from './me';

// Cada pantalla se descarga solo cuando la abres: la app arranca más rápido.
const Inicio = lazy(() => import('./pages/Inicio').then((m) => ({ default: m.Inicio })));
const Tareas = lazy(() => import('./pages/Tareas').then((m) => ({ default: m.Tareas })));
const Asignaturas = lazy(() => import('./pages/Asignaturas').then((m) => ({ default: m.Asignaturas })));
const Horario = lazy(() => import('./pages/Horario').then((m) => ({ default: m.Horario })));
const Apuntes = lazy(() => import('./pages/Apuntes').then((m) => ({ default: m.Apuntes })));
const Biblioteca = lazy(() => import('./pages/Biblioteca').then((m) => ({ default: m.Biblioteca })));
const Pagos = lazy(() => import('./pages/Pagos').then((m) => ({ default: m.Pagos })));
const Pensum = lazy(() => import('./pages/Pensum').then((m) => ({ default: m.Pensum })));
const Asistente = lazy(() => import('./pages/Asistente').then((m) => ({ default: m.Asistente })));
const Ajustes = lazy(() => import('./pages/Ajustes').then((m) => ({ default: m.Ajustes })));
const Ayuda = lazy(() => import('./pages/Ayuda').then((m) => ({ default: m.Ayuda })));
const Avisos = lazy(() => import('./pages/Avisos').then((m) => ({ default: m.Avisos })));
const Conectar = lazy(() => import('./pages/Conectar').then((m) => ({ default: m.Conectar })));
const Companeros = lazy(() => import('./pages/Companeros').then((m) => ({ default: m.Companeros })));
import { Buddy } from './Buddy';
import { getLive, subscribeLive } from './clasesLive';

const PAGES: { id: string; label: string; icon: string; hint: string; admin?: boolean }[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home', hint: 'Tu día de un vistazo' },
  { id: 'tareas', label: 'Tareas', icon: 'tasks', hint: 'Entregas y pendientes' },
  { id: 'asignaturas', label: 'Notas', icon: 'book', hint: 'Asignaturas y calificaciones' },
  { id: 'horario', label: 'Horario', icon: 'calendar', hint: 'Clases, exámenes y qué cursar' },
  { id: 'apuntes', label: 'Estudio', icon: 'book', hint: 'Apuntes y tarjetas de repaso' },
  { id: 'biblioteca', label: 'Biblioteca', icon: 'book', hint: 'Libros de cada materia' },
  { id: 'pensum', label: 'Pensum', icon: 'cap', hint: 'Tu avance en la carrera' },
  { id: 'pagos', label: 'Pagos', icon: 'wallet', hint: 'Cuotas y ventana de pago' },
  { id: 'avisos', label: 'Avisos', icon: 'bell', hint: 'Novedades, pagos y eventos' },
  { id: 'asistente', label: 'Asistente', icon: 'spark', hint: 'Pregúntale lo que quieras' },
  { id: 'conectar', label: 'Conexiones', icon: 'plug', hint: 'EVA, WhatsApp y notificaciones' },
  { id: 'ajustes', label: 'Ajustes', icon: 'gear', hint: 'Tu cuenta y tus avisos' },
  { id: 'companeros', label: 'Compañeros', icon: 'users', hint: 'Invita y administra', admin: true },
  { id: 'ayuda', label: 'Ayuda', icon: 'help', hint: 'Preguntas frecuentes' },
];
// Barra inferior en móvil: dos a cada lado del botón central del asistente.
const TABS_LEFT = ['inicio', 'tareas'];
const TABS_RIGHT = ['asignaturas'];
const RAIL_TOP = ['inicio', 'tareas', 'asignaturas', 'horario'];
const RAIL_BOTTOM = ['apuntes', 'pensum', 'pagos', 'avisos', 'ajustes'];
const IN_TABS = [...TABS_LEFT, ...TABS_RIGHT, 'asistente']; // el asistente va en el botón central

function currentPage() {
  const h = location.hash.replace('#', '').split('/')[0].replace('importar', 'horario');
  return PAGES.some((p) => p.id === h) ? h : 'inicio';
}
/** Código de invitación si se abrió un enlace #unirme/CÓDIGO. */
const inviteCode = () => location.hash.match(/^#unirme\/([a-f0-9]+)/)?.[1] || '';
/** Páginas visibles para este usuario (Compañeros solo para el administrador). */
const visiblePages = () => PAGES.filter((p) => !p.admin || isAdmin());

export function App() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  const [page, setPage] = useState(currentPage());
  const [more, setMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [version, setVersion] = useState(0);
  const pageRef = useRef('');
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem("rumbo-welcome"); } catch { return false; } });
  useEffect(() => { const on = () => setWelcome(true); window.addEventListener('rumbo:tour', on); return () => window.removeEventListener('rumbo:tour', on); }, []);
  // Numeritos rojos: avisos/correos sin leer y tareas que vencen hoy o ya vencieron.
  const [badges, setBadges] = useState({ news: 0, tasks: 0 });
  useEffect(() => {
    if (auth !== 'in') return;
    const refresh = () => api<{ news: number; tasks: number }>('/badges').then((b) => {
      setBadges(b);
      // Número en el icono de la app instalada (iPhone, computadora y algunos Android).
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      const total = b.news + b.tasks;
      (total ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(() => {});
    }).catch(() => {});
    refresh();
    const t = setInterval(refresh, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('rumbo:badges', refresh);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('rumbo:badges', refresh); };
  }, [auth, page]);
  const badgeFor = (id: string) => (id === 'avisos' ? badges.news : id === 'tareas' ? badges.tasks : 0);
  const Badge = ({ n }: { n: number }) => (n > 0 ? <i className="badge num" aria-label={`${n} pendientes`}>{n > 99 ? '99+' : n}</i> : null);
  // Barra inferior: se esconde al bajar (más pantalla) y vuelve al subir.
  const [barHidden, setBarHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY, dy = y - last;
      if (Math.abs(dy) < 8) return;
      setBarHidden(dy > 0 && y > 140 && window.innerHeight + y < document.body.scrollHeight - 40);
      last = y;
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setBarHidden(false), [page]);
  // Accesibilidad: al cambiar de pantalla se actualiza el título y el lector de pantalla anuncia la nueva sección.
  const firstPage = useRef(true);
  useEffect(() => {
    const p = PAGES.find((x) => x.id === page);
    document.title = p ? `${p.label} · Rumbo` : 'Rumbo';
    if (firstPage.current) { firstPage.current = false; return; }
    const t = setTimeout(() => (document.querySelector('.page h1') as HTMLElement | null)?.focus({ preventScroll: true }), 120);
    return () => clearTimeout(t);
  }, [page]);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    api<{ user: Me }>('/me').then((r) => { setMe(r.user); setAuth('in'); }).catch((e) => setAuth(e instanceof ApiError && e.status === 401 ? 'out' : 'in'));
    const onHash = () => {
      // «#tareas/12» estando ya en Tareas: se vuelve a montar la pantalla para que abra ese elemento.
      const ORDER = ['inicio', 'tareas', 'horario', 'apuntes', 'asistente', 'asignaturas', 'avisos', 'pensum', 'pagos', 'ajustes', 'ayuda', 'conectar', 'companeros'];
      const from = ORDER.indexOf(pageRef.current), to = ORDER.indexOf(currentPage());
      document.documentElement.dataset.nav = to < from ? 'back' : 'fwd';
      const apply = () => { setPage(currentPage()); setMore(false); if (location.hash.includes('/')) setVersion((v) => v + 1); window.scrollTo({ top: 0 }); };
      // El cambio va en una transición de React: la pantalla de antes sigue viva hasta que la nueva está lista (sin parpadeos ni congelones).
      startTransition(apply);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Sin internet: un rato después de entrar, se guardan en el teléfono las fichas (con instrucciones) de lo pendiente.
  useEffect(() => {
    if (auth !== 'in' || !navigator.onLine) return;
    try { if (sessionStorage.getItem('rumbo-prefetch')) return; sessionStorage.setItem('rumbo-prefetch', '1'); } catch { /* sin almacenamiento */ }
    const t = setTimeout(async () => {
      try {
        const list = await api<{ id: number }[]>('/tasks?status=pending');
        for (const x of list.slice(0, 25)) await api(`/tasks/${x.id}`).catch(() => {});
        await api('/courses').catch(() => {});
      } catch { /* se intenta la próxima vez */ }
    }, 6000);
    return () => clearTimeout(t);
  }, [auth]);

  // Buscador: lupa de arriba o tecla «/» (en computadora).
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const open = () => setSearching(true);
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && !el.isContentEditable) { e.preventDefault(); setSearching(true); }
    };
    window.addEventListener('rumbo:search', open); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('rumbo:search', open); window.removeEventListener('keydown', key); };
  }, []);

  pageRef.current = page;
  const go = (p: string) => { haptic(5); if (location.hash === '#' + p) { setMore(false); window.scrollTo({ top: 0, behavior: 'smooth' }); } else location.hash = p; };
  async function logout() {
    await api('/logout', { method: 'POST' });
    clearLoadCache();
    navigator.serviceWorker?.controller?.postMessage('clear-api'); // borra los datos guardados del teléfono
    // El siguiente que entre (puede ser otra persona en este teléfono) empieza limpio en Inicio.
    setMore(false); setMe(null);
    history.replaceState(null, '', '#inicio'); setPage('inicio');
    setAuth('out');
  }
  // Después de abrir, descarga en silencio las demás pantallas: cambiar de sección es instantáneo y funcionan sin internet.
  useEffect(() => {
    if (auth !== 'in') return;
    const warm = () => {
      for (const load of [() => import('./pages/Tareas'), () => import('./pages/Asignaturas'), () => import('./pages/Asistente'), () => import('./pages/Avisos'), () => import('./pages/Pagos'), () => import('./pages/Horario'), () => import('./pages/Pensum'), () => import('./pages/Ajustes'), () => import('./pages/Inicio')]) load().catch(() => {});
      for (const path of ['/tasks?status=pending', '/courses', '/courses/history', '/announcements', '/pensum', '/payments', '/mascot', '/messages?channel=app']) api(path).catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const t = setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(warm) : warm()), 2500);
    return () => clearTimeout(t);
  }, [auth]);
  const [cached, setCached] = useState(false);
  useEffect(() => {
    const on = () => setCached(true);
    window.addEventListener('rumbo:offline-data', on);
    const back = () => setCached(false);
    window.addEventListener('online', back);
    return () => { window.removeEventListener('rumbo:offline-data', on); window.removeEventListener('online', back); };
  }, []);
  function openNew() {
    haptic(10);
    setCreating(true);
    api<Course[]>('/courses').then(setCourses).catch(() => setCourses([]));
  }

  if (auth === 'checking') return <div className="splash"><div className="brand-mark xl"><Icon name="compass" size={34} style={{ strokeWidth: 2.1 }} /></div></div>;
  const signedIn = () => api<{ user: Me }>('/me').then((r) => { setMe(r.user); setAuth('in'); }).catch(() => setAuth('in'));
  if (auth === 'out') {
    const code = inviteCode();
    return <>{code ? <Signup code={code} onIn={(evaOk) => { location.hash = evaOk ? 'inicio' : 'conectar'; void signedIn(); }} /> : <Login onIn={() => { void signedIn(); }} />}<Toaster /></>;
  }

  const tab = (id: string) => {
    const p = PAGES.find((x) => x.id === id)!;
    return (
      <button key={id} className={page === id ? 'active' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>
        <span className="tab-ic"><Icon name={p.icon} size={22} /><Badge n={badgeFor(id)} /></span>{p.label}
      </button>
    );
  };

  const railItem = (id: string) => {
    const p = PAGES.find((x) => x.id === id)!;
    return (
      <button key={id} className={page === id ? 'active' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>
        <span className="nv-ic"><Icon name={p.icon} size={22} />{badgeFor(id) > 0 && <span className="nav-count num">{badgeFor(id)}</span>}</span><span className="nv-lb">{p.label}</span>
      </button>
    );
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}>Saltar al contenido</a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="compass" size={22} style={{ strokeWidth: 2.2 }} /></div>
          <div className="brand-txt"><span className="brand-name">Rumbo</span><span className="brand-sub">BY DEXA</span></div>
        </div>
        <button className="rail-new" onClick={openNew} aria-label="Nueva tarea" title="Nueva tarea"><Icon name="plus" size={20} /></button>
        <nav className="nav" aria-label="Navegación principal">
          {RAIL_TOP.map(railItem)}
          <button className={`rail-orb ${page === 'asistente' ? 'on' : ''}`} onClick={() => go('asistente')} aria-label="Rumbo IA" aria-current={page === 'asistente' ? 'page' : undefined}>
            <span className="orb"><Icon name="compass" size={30} style={{ strokeWidth: 2 }} /></span><span className="orb-lb">Rumbo IA</span>
          </button>
          {RAIL_BOTTOM.map(railItem)}
          <button onClick={() => { haptic(5); setMore(true); }} aria-haspopup="dialog"><Icon name="grid" /><span className="nv-lb">Más</span></button>
        </nav>
      </aside>

      <LiveBanner page={page} go={go} />
      <main className="main" id="contenido" tabIndex={-1} aria-label={PAGES.find((p) => p.id === page)?.label}>
        <div className="page" key={page + ':' + version}>
          <Suspense fallback={<PageLoading />}>
          {page === 'inicio' && <Inicio go={go} />}
          {page === 'tareas' && <Tareas />}
          {page === 'asignaturas' && <Asignaturas />}
          {page === 'biblioteca' && <Biblioteca />}
          {page === 'pensum' && <Pensum />}
          {page === 'horario' && <Horario />}
          {page === 'apuntes' && <Apuntes />}
          {page === 'pagos' && <Pagos />}
          {page === 'avisos' && <Avisos />}
          {page === 'asistente' && <Asistente />}
          {page === 'ajustes' && <div className="rbx"><Ajustes onLogout={logout} /></div>}
          {page === 'ayuda' && <div className="rbx"><Ayuda go={go} /></div>}
          {page === 'conectar' && <div className="rbx"><Conectar /></div>}
          {page === 'companeros' && (isAdmin() ? <div className="rbx"><Companeros /></div> : null)}
          </Suspense>
        </div>
      </main>

      <nav className={`tabbar ${barHidden ? 'hidden' : ''}`} aria-label="Navegación">
        {/* Píldora que se desliza hasta la pestaña activa (el asistente tiene su propio botón) */}
        <span className="tab-glider" aria-hidden="true" data-off={page === 'asistente' ? '1' : '0'}
          style={{ ['--i' as string]: page === 'inicio' ? 0 : page === 'tareas' ? 1 : page === 'asistente' ? 2 : page === 'asignaturas' ? 3 : 4 }} />
        {TABS_LEFT.map(tab)}
        <button className={`fab ${page === 'asistente' ? 'on' : ''}`} onClick={() => go('asistente')} aria-label="Asistente" aria-current={page === 'asistente' ? 'page' : undefined}>
          <Icon name="compass" size={28} style={{ strokeWidth: 2 }} />
        </button>
        {TABS_RIGHT.map(tab)}
        <button className={!IN_TABS.includes(page) ? 'active' : ''} onClick={() => { haptic(5); setMore(true); }} aria-haspopup="dialog" aria-current={!IN_TABS.includes(page) ? 'page' : undefined}>
          <span className="tab-ic"><Icon name="grid" size={22} /><Badge n={PAGES.filter((p) => !IN_TABS.includes(p.id)).reduce((t, p) => t + badgeFor(p.id), 0)} /></span>Más
        </button>
      </nav>
      <Buddy page={page} go={go} />

      {more && (
        <Modal title="Más" onClose={() => setMore(false)}>
          <div className="more-grid">
            {visiblePages().filter((p) => !IN_TABS.includes(p.id)).map((p) => (
              <button key={p.id} className={`tile ${page === p.id ? 'on' : ''}`} onClick={() => go(p.id)}>
                <span className="tile-ic"><Icon name={p.icon} size={22} /><Badge n={badgeFor(p.id)} /></span>
                <b>{p.label}</b><span>{p.hint}</span>
              </button>
            ))}
          </div>
          <button className="btn line block" onClick={logout}><Icon name="logout" size={18} />Cerrar sesión</button>
        </Modal>
      )}

      {creating && <TaskModal task={{}} courses={courses} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setVersion((v) => v + 1); }} />}
      {(!online || cached) && <div className="offline" role="status"><Icon name="alert" size={16} />{online ? 'Mostrando lo último guardado' : 'Sin conexión: te muestro lo último guardado'}</div>}
      {welcome && <Welcome onDone={() => setWelcome(false)} />}
      {searching && <SearchModal onClose={() => setSearching(false)} />}
      <SyncBar />
      <Toaster />
    </div>
  );
}

function Login({ onIn }: { onIn: () => void }) {
  // La matrícula se recuerda en este dispositivo para no escribirla cada vez.
  const [login, setLogin] = useState(() => { try { return localStorage.getItem('rumbo-login') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api('/login', { method: 'POST', body: { login, password } });
      try { localStorage.setItem('rumbo-login', login.trim()); } catch { /* sin almacenamiento */ }
      haptic(12); onIn();
    }
    catch (e) { setErr((e as Error).message); haptic(40); setShake((n) => n + 1); }
    setBusy(false);
  }
  const hour = Number(new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', hour: 'numeric', hour12: false }).format(new Date()));
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return (
    <div className="lg2">
      <section className="lg2-hero" aria-hidden="false">
        <div className="lg2-sky" aria-hidden="true"><i /><i /><i /></div>
        <div className="lg2-brand">
          <div className="lg2-logo"><span className="lg2-halo" /><span className="lg2-halo h2" /><div className="lg2-mark"><svg className="lg2-emblem" viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="3" /><circle cx="32" cy="32" r="20" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="1.5 4.5" /><path d="M32 9l7 23H25z" fill="#FF8A1F" /><path d="M32 55l-7-23h14z" fill="#fff" /><circle cx="32" cy="32" r="3" fill="#0A5BE0" stroke="#fff" strokeWidth="2" /></svg></div></div>
          <h1>Rumbo</h1>
          <p>Tu universidad, bajo control.</p>
        </div>
        <div className="lg2-float f1" aria-hidden="true"><span className="lf-ic orange"><Icon name="clock" size={16} /></span><span><b>Foro vence hoy</b><small>Tecnología · 11:59 p. m.</small></span></div>
        <div className="lg2-float f2" aria-hidden="true"><span className="lf-ic green"><Icon name="trend" size={16} /></span><span><b>Nueva nota: 95/100</b><small>Razonamiento</small></span></div>
        <div className="lg2-float f3" aria-hidden="true"><span className="lf-ic violet"><Icon name="spark" size={16} /></span><span><b>«¿Qué entrego primero?»</b><small>Asistente IA</small></span></div>
      </section>
      <form key={shake} className={`lg2-sheet ${shake ? 'shake' : ''}`} onSubmit={submit}>
        <span className="lg2-grab" aria-hidden="true" />
        <div className="lg2-copy">
          <h2>{hello} 👋</h2>
          <p>Entra con tu matrícula y tu contraseña de Rumbo.</p>
        </div>
        <label htmlFor="lg" className="sr-only">Matrícula o usuario</label>
        <div className="lg2-field">
          <span className="lg2-key"><Icon name="users" size={18} /></span>
          <input id="lg" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Matrícula o usuario" enterKeyHint="next" />
        </div>
        <label htmlFor="pw" className="sr-only">Contraseña</label>
        <div className="lg2-field">
          <span className="lg2-key"><Icon name="gear" size={18} /></span>
          <input id="pw" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Contraseña" enterKeyHint="go" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>{show ? 'Ocultar' : 'Ver'}</button>
        </div>
        {err && <div className="auth-error" role="alert"><Icon name="alert" size={16} />{err}</div>}
        <button className="lg2-btn" type="submit" disabled={busy || !password}>
          {busy && <span className="auth-spinner" aria-hidden="true" />}
          {busy ? 'Entrando…' : 'Entrar'}
          {!busy && <span className="lg2-arrow"><Icon name="chevron" size={18} style={{ strokeWidth: 2.6 }} /></span>}
        </button>
        <ul className="lg2-perks">
          <li><Icon name="tasks" size={14} />Entregas</li><li><Icon name="trend" size={14} />Notas</li><li><Icon name="wallet" size={14} />Pagos</li><li><Icon name="bell" size={14} />Avisos</li>
        </ul>
        <span className="auth-foot">¿Te invitaron? Abre el enlace que te mandaron · DEXA · Keury Manuel · Todos los derechos reservados</span>
      </form>
    </div>
  );
}

/** Registro con invitación (#unirme/CÓDIGO): nombre, matrícula y contraseña; luego va directo a Conexiones. */
function Signup({ code, onIn }: { code: string; onIn: (evaOk: boolean) => void }) {
  const [info, setInfo] = useState<{ from?: string; error?: string } | null>(null);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [evaPass, setEvaPass] = useState('');
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ from: string }>(`/invite/${code}`).then((r) => setInfo({ from: r.from })).catch((e) => setInfo({ error: (e as Error).message })); }, [code]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      setStep('Creando tu cuenta…');
      await api('/signup', { method: 'POST', body: { code, name, login, password } });
      try { localStorage.setItem('rumbo-login', login.trim()); } catch { /* sin almacenamiento */ }
      // Ya con sesión: se conecta el EVA con la misma matrícula (la contraseña va directo a la UAPA y no se guarda).
      let evaOk = false;
      if (evaPass) {
        setStep('Conectando con tu EVA…');
        try {
          await api('/eva/connect', { method: 'POST', body: { username: login, password: evaPass } });
          evaOk = true;
          void api('/sync', { method: 'POST' }).then(() => window.dispatchEvent(new Event('rumbo:badges'))).catch(() => {});
          toast('¡Cuenta lista y EVA conectado! Trayendo tus tareas…');
        } catch (e3) { toast(`Tu cuenta quedó creada, pero el EVA no conectó: ${(e3 as Error).message}`, 'err'); }
      }
      haptic(12); onIn(evaOk);
    } catch (e2) { setErr((e2 as Error).message); haptic(40); }
    setStep(''); setBusy(false);
  }
  return (
    <div className="lg2">
      <section className="lg2-hero">
        <div className="lg2-sky" aria-hidden="true"><i /><i /><i /></div>
        <div className="lg2-brand">
          <div className="lg2-logo"><span className="lg2-halo" /><span className="lg2-halo h2" /><div className="lg2-mark"><Icon name="compass" size={42} style={{ strokeWidth: 2 }} /></div></div>
          <h1>Rumbo</h1>
          <p>{info?.from ? `${info.from} te invitó 🎉` : 'Tu universidad, bajo control.'}</p>
        </div>
      </section>
      <form className="lg2-sheet" onSubmit={submit}>
        <span className="lg2-grab" aria-hidden="true" />
        <div className="lg2-copy">
          <h2>Crea tu cuenta</h2>
          <p>{info?.error || 'Tus tareas, notas y avisos de la UAPA en un solo lugar. Solo tú ves tus datos.'}</p>
        </div>
        {!info?.error && (
          <>
            <label htmlFor="su-n" className="sr-only">Tu nombre</label>
            <div className="lg2-field"><span className="lg2-key"><Icon name="spark" size={18} /></span>
              <input id="su-n" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Tu nombre" required /></div>
            <label htmlFor="su-l" className="sr-only">Matrícula</label>
            <div className="lg2-field"><span className="lg2-key"><Icon name="users" size={18} /></span>
              <input id="su-l" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="numeric" placeholder="Matrícula (con ella entras)" required /></div>
            <label htmlFor="su-p" className="sr-only">Contraseña nueva</label>
            <div className="lg2-field"><span className="lg2-key"><Icon name="gear" size={18} /></span>
              <input id="su-p" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Contraseña nueva (8 o más)" minLength={8} required aria-describedby="su-hint" />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Ver contraseña'}>{show ? 'Ocultar' : 'Ver'}</button></div>
            <span id="su-hint" className="auth-foot">Usa una contraseña nueva para Rumbo, no la del EVA.</span>
            <label htmlFor="su-e" className="sr-only">Contraseña de tu EVA</label>
            <div className="lg2-field"><span className="lg2-key"><Icon name="book" size={18} /></span>
              <input id="su-e" type={show ? 'text' : 'password'} value={evaPass} onChange={(e) => setEvaPass(e.target.value)} autoComplete="off" placeholder="Contraseña de tu EVA (para traer tus tareas)" aria-describedby="su-eva" /></div>
            <span id="su-eva" className="auth-foot">Es la que usas para entrar al EVA con esta matrícula. Va directo a la UAPA, Rumbo no la guarda. Si la dejas vacía, lo conectas después.</span>
            {err && <div className="auth-error" role="alert"><Icon name="alert" size={16} />{err}</div>}
            <button className="lg2-btn" type="submit" disabled={busy || !info}>
              {busy && <span className="auth-spinner" aria-hidden="true" />}{busy ? (step || 'Creando tu cuenta…') : evaPass ? 'Crear cuenta y conectar mi EVA' : 'Crear mi cuenta'}
              {!busy && <span className="lg2-arrow"><Icon name="chevron" size={18} style={{ strokeWidth: 2.6 }} /></span>}
            </button>
          </>
        )}
        <button type="button" className="link-btn center-self" onClick={() => { location.hash = ''; location.reload(); }}>Ya tengo cuenta: entrar</button>
      </form>
    </div>
  );
}

/** Mientras se descarga una pantalla (solo la primera vez): esqueleto suave. */
function PageLoading() {
  return (
    <div className="page-loading" aria-busy="true" aria-label="Cargando">
      <div className="sk" style={{ height: 30, width: '45%', borderRadius: 10 }} />
      <div className="sk" style={{ height: 150, borderRadius: 24 }} />
      <div className="sk" style={{ height: 90, borderRadius: 20 }} />
      <div className="sk" style={{ height: 90, borderRadius: 20 }} />
    </div>
  );
}


/** Mientras se escucha una clase en vivo, desde cualquier pantalla hay un aviso para volver a ella. */
function LiveBanner({ page, go }: { page: string; go: (p: string) => void }) {
  const s = useSyncExternalStore(subscribeLive, getLive);
  if (s.phase === 'idle' || page === 'apuntes') return null;
  return (
    <button className="live-banner" onClick={() => go('apuntes')} aria-label="Volver a la clase en vivo">
      <span className="live-dot" aria-hidden="true" />
      <span>{s.phase === 'ending' ? 'Terminando la clase…' : `Escuchando · ${s.title}`}</span><b>Volver</b>
    </button>
  );
}
