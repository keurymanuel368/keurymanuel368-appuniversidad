import { useCallback, useEffect, useState } from 'react';
import { agoLabel, api, cleanTitle, channelsLabel, overdueLabel, type Dashboard, type SendResult, type Task, whenLabel } from '../api';
import { CountUp, Empty, confetti, PageHead, PullIndicator, Ring, Skeleton, TaskModal, TaskRow, TaskSheet, fmtGrade, haptic, runSync, syncToast, toast, toggleTask, usePullToRefresh, useLoad } from '../components';
import { Icon } from '../icons';
import { Mascot } from '../Mascot';
import { AchievementsCard } from '../Achievements';
import { TodayTimeline } from '../Today';
import { TermJourney } from '../Journey';
import { RbRing, RbTask, RbTop } from '../rb';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function Inicio({ go }: { go: (p: string) => void }) {
  const { data: d, error, reload } = useLoad(() => api<Dashboard>('/dashboard'));
  const [editing, setEditing] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [more, setMore] = useState(() => { try { return window.matchMedia('(min-width: 1100px)').matches; } catch { return false; } });
  // Jalar hacia abajo (o el botón) sincroniza el EVA y recarga tu día.
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      syncToast(await runSync());
      reload();
    } catch (e) { toast('Error: ' + (e as Error).message, 'err'); }
    setSyncing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { pull, refreshing } = usePullToRefresh(sync);

  // Si el EVA lleva más de hora y media sin revisarse, se pone al día solo al abrir (una vez por sesión).
  const lastSync = d?.lastSync ?? null;
  const evaOn = !!d?.setup?.eva;
  useEffect(() => {
    if (!evaOn || (lastSync && Date.now() / 1000 - lastSync < 90 * 60)) return;
    try { if (sessionStorage.getItem('rumbo-autosync')) return; sessionStorage.setItem('rumbo-autosync', '1'); } catch { /* sin almacenamiento */ }
    setSyncing(true);
    runSync().then(() => reload()).catch(() => {}).finally(() => setSyncing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaOn, lastSync]);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <Skeleton rows={4} />;

  const now = Date.now() / 1000;
  // «Qué hago ahora»: lo vencido más reciente; si no hay, lo que vence en las próximas 48 h.
  const overdueList = d.tasks.filter((t) => t.due_at && t.due_at < now).sort((a, b) => b.due_at! - a.due_at!);
  const now1 = overdueList[0] || d.tasks.find((t) => t.due_at && t.due_at >= now && t.due_at - now < 48 * 3600) || null;
  const soon = d.tasks.filter((t) => t.due_at && t.due_at >= now && t.due_at - now < 86400 * 1.5);
  const next = d.tasks.find((t) => t.due_at && t.due_at >= now);
  const headline = d.counts.today > 0
    ? `Hoy cierra${d.counts.today > 1 ? 'n' : ''} ${d.counts.today} entrega${d.counts.today > 1 ? 's' : ''}`
    : d.counts.week > 0 ? `${d.counts.week} entrega${d.counts.week > 1 ? 's' : ''} esta semana` : 'Semana despejada';
  const p = d.pay;
  const payState = p.paid ? 'Pagado' : p.state === 'open' ? `Cierra en ${p.daysToClose} d` : `Abre en ${p.daysToOpen} d`;
  const payTone = p.paid ? 'green' : p.state === 'open' ? 'orange' : 'blue';
  const initial = (d.name || 'R').trim().charAt(0).toUpperCase();

  const toggle = (t: Task) => toggleTask(t, reload).catch((e) => toast((e as Error).message, 'err'));
  async function sendSummary() {
    setBusy(true);
    try {
      const r = await api<SendResult>('/notify/test', { method: 'POST' });
      if (r.ok) toast(`Resumen enviado por ${channelsLabel(r)}`);
      else toast(`No se pudo enviar: ${r.error}`, 'err');
    } catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }

  // Compañero nuevo sin EVA ni datos: en vez de un Inicio en cero ("semana despejada"), una bienvenida con el siguiente paso.
  if (d.setup && !d.setup.eva && !d.courses.length && !d.tasks.length) return <FirstSteps d={d} go={go} initial={initial} />;

  const todo = [...(overdueList.length ? overdueList : []), ...d.tasks.filter((t) => t.due_at && t.due_at >= now)].filter((t, i, a2) => a2.findIndex((x) => x.id === t.id) === i).slice(0, 4);
  const firstName = d.name ? d.name.split(' ')[0] : 'Tu día';
  const dateTxt = String(d.today || '').replace(/ de (\S{3})\S*/, ' $1').replace(/^(\S{3})\S*/, '$1');
  const heroTitle = d.counts.overdue > 0 ? `${d.counts.overdue} atrasada${d.counts.overdue > 1 ? 's' : ''} y ${d.counts.week} entrega${d.counts.week === 1 ? '' : 's'} en tu semana` : headline;

  return (
    <div className="rbx">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <RbTop eyebrow={`${greeting()} · ${dateTxt}`} title={firstName} go={go} unread={d.unreadNews}>
        <button className="av hide-desktop" onClick={() => go('ajustes')} aria-label="Ajustes">{initial}</button>
      </RbTop>

      <SetupBanner setup={d.setup} go={go} />
      {d.freshGrade && <FreshGrade g={d.freshGrade} onDone={reload} />}
      {d.lastSyncError && <div className="banner"><Icon name="alert" size={18} /><span>El EVA no respondió en la última sincronización: {d.lastSyncError}</span></div>}

      <div className="grid2">
        <div className="col">
          <section className="hero">
            <div className="tick" />
            <div className="hero-row" style={{ display: 'flex', gap: 28, alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
              <div className="hero-copy" style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span className="chip" style={{ alignSelf: 'flex-start' }}>Hoy</span>
                <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(26px,3.2vw,38px)', lineHeight: 1.05, letterSpacing: '-.025em', fontWeight: 800 }}>{heroTitle}</h2>
                <p style={{ color: '#CFD8FF', fontSize: 15.5, maxWidth: 420 }}>
                  {now1 ? <>Lo más urgente: <b style={{ color: '#fff' }}>{now1.title}</b>{now1.due_at && now1.due_at < now ? ', atrasada' : ''}. Hazla primero y la semana queda limpia.</> : 'Estás al día. Buen momento para adelantar o repasar.'}
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  <button className="btn b-or" onClick={() => go('apuntes')}><Icon name="play" size={18} />Clase en vivo</button>
                  <button className="btn" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }} onClick={() => go('tareas')}>Ver qué me toca</button>
                </div>
              </div>
              <RbRing pct={d.weekProgress.total ? (d.weekProgress.done / d.weekProgress.total) * 100 : d.termProgress ?? 0} size={150} />
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 }}>
            <button className="tile" style={{ background: 'var(--rosesoft)', color: 'var(--rose)', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => go('tareas')}><b className="num">{Math.max(d.counts.overdue, overdueList.length)}</b><span>Atrasadas</span></button>
            <button className="tile" style={{ background: 'var(--cobaltsoft)', color: '#1A3FD1', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => go('tareas')}><b className="num">{d.counts.today}</b><span>Hoy</span></button>
            <button className="tile" style={{ background: 'var(--mintsoft)', color: 'var(--mint)', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => go('tareas')}><b className="num">{d.counts.week}</b><span>Esta semana</span></button>
          </section>

          <section className="card">
            <div className="head"><h3>Para hacer primero</h3><button className="link" onClick={() => go('tareas')}>Ver todas</button></div>
            {todo.length === 0 ? <p style={{ color: 'var(--muted)' }}>Nada pendiente por ahora. ¡Estás al día!</p> : <ul>{todo.map((t) => <RbTask key={t.id} t={t} onToggle={toggle} onOpen={setEditing} />)}</ul>}
          </section>
        </div>

        <div className="col">
          <TodayTimeline d={d} go={go} />
          <TermJourney />

          <section className="card" style={{ background: 'var(--night)', color: '#fff', display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8FB0FF' }}>Repaso del día</div>
              <h3 style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, margin: '4px 0 6px', letterSpacing: '-.02em' }}>Tus fichas</h3>
              <p style={{ color: '#B8C3EE', fontSize: 14, marginBottom: 14 }}>Cinco minutos al día valen más que una noche antes.</p>
              <button className="btn b-or" onClick={() => go('apuntes')}>Repasar ahora</button>
            </div>
            <div className="hand" style={{ fontSize: 64, lineHeight: 1, color: 'var(--orange)', transform: 'rotate(-6deg)' }}>¡ya!</div>
          </section>

          {d.news.length > 0 && (
            <section className="card">
              <div className="head"><h3>Avisos</h3><button className="link" onClick={() => go('avisos')}>Ver todos</button></div>
              <ul>
                {d.news.slice(0, 3).map((n) => (
                  <li key={n.id} className="row">
                    <span className="dot" style={{ background: n.kind === 'pago' ? 'var(--orange)' : n.kind === 'evento' ? '#7B5CFF' : 'var(--cobalt)' }} />
                    <button className="t" onClick={() => go(`avisos/${n.id}`)}><b>{cleanTitle(n.title)}</b><small>{n.course_name || (n.kind === 'pago' ? 'Pagos' : n.kind === 'evento' ? 'Evento' : 'UAPA')} · {agoLabel(n.created_at)}</small></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {d.courses.length > 0 && (
        <section className="card">
          <div className="head"><h3>Asignaturas</h3><button className="link" onClick={() => go('asignaturas')}>Notas</button></div>
          <ul>
            {d.courses.map((c) => (
              <li key={c.id} className="row">
                <span className="dot" style={{ background: c.color }} />
                <button className="t" onClick={() => go(`asignaturas/${c.id}`)}>
                  <b>{c.name}</b>
                  <div className="bar"><i style={{ width: `${c.total ? (c.graded / c.total) * 100 : 0}%`, background: c.color }} /></div>
                </button>
                <span className={`chip ${c.average != null && c.average >= 90 ? 'c-mint' : 'c-blue'} num`}>{c.average ?? '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.graded.length > 0 && (
        <section className="card">
          <div className="head"><h3>Últimas calificaciones</h3><button className="link" onClick={() => go('asignaturas')}>Ver notas</button></div>
          <ul>
            {d.graded.map((t) => (
              <li key={t.id} className="row">
                <span className="dot" style={{ background: t.course_color || 'var(--cobalt)' }} />
                <button className="t" onClick={() => setEditing(t)}><b>{t.title}</b><small>{t.course_short || t.course_name}</small></button>
                <span className={`chip ${(t.grade! / t.grade_max!) >= 0.9 ? 'c-mint' : (t.grade! / t.grade_max!) >= 0.7 ? 'c-blue' : 'c-rose'} num`}>{fmtGrade(t.grade!)}/{fmtGrade(t.grade_max!)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid2 extras-row">
        <GoalsCard goals={d.goals || []} ids={d.goalIds || []} onChanged={reload} />
        <AchievementsCard />
      </section>

      {creating && <TaskModal task={{}} courses={d.courses} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {editing && <TaskSheet task={editing} courses={d.courses} onClose={() => setEditing(null)} onChanged={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

/** La acción más urgente del momento, con los dos botones que se usan: abrir en el EVA y marcarla. */
function NowCard({ t, onOpen, onDone }: { t: Task; onOpen: () => void; onDone: () => void }) {
  const late = !!t.due_at && t.due_at < Date.now() / 1000;
  return (
    <section className={`now-card ${late ? 'late' : ''}`} style={{ ['--cc' as string]: t.course_color || 'var(--blue)' }} aria-label="Qué hago ahora">
      <span className="now-kicker">{late ? '⚠️ ' + overdueLabel(t.due_at!) : '⏰ Ahora te toca'}</span>
      <button className="now-title" onClick={onOpen}><b>{t.title}</b><span>{t.course_short || t.course_name || 'Personal'}{!late ? ' · ' + whenLabel(t.due_at) : ''}</span></button>
      {!late && <Countdown to={t.due_at!} />}
      <div className="now-actions">
        {t.url && <a className="btn primary" href={t.url} target="_blank" rel="noopener"><Icon name="link" size={17} />Abrir en el EVA</a>}
        <button className="btn line" onClick={() => { haptic(10); onDone(); }}><Icon name="check" size={17} />Ya la entregué</button>
      </div>
    </section>
  );
}

const GOAL_OPTIONS = [
  { id: 'atiempo', label: 'Entregar todo a tiempo', hint: 'Nada vencido sin entregar' },
  { id: 'antes', label: 'Entregar un día antes', hint: 'Con un día de margen' },
  { id: 'promedio:90', label: 'Promedio de 90 o más', hint: 'En las notas de la semana' },
  { id: 'promedio:95', label: 'Promedio de 95 o más', hint: 'Para ir por honores' },
];

/** Metas de la semana: eliges una o varias y ves cómo vas (se reinician cada lunes). */
function GoalsCard({ goals, ids, onChanged }: { goals: NonNullable<Dashboard['goals']>; ids: string[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string[]>(ids);
  async function save() {
    try { await api('/settings', { method: 'PUT', body: { goals: pick.join(',') } }); haptic(10); toast(pick.length ? 'Metas guardadas' : 'Metas quitadas'); setEditing(false); onChanged(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const toggle = (id: string) => setPick((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p.filter((x) => !(id.startsWith('promedio') && x.startsWith('promedio'))), id]);
  if (editing) return (
    <div className="card goals">
      <div className="card-head"><h3>Mis metas de la semana</h3></div>
      <div className="goal-opts">
        {GOAL_OPTIONS.map((o) => (
          <button key={o.id} className={`goal-opt ${pick.includes(o.id) ? 'on' : ''}`} onClick={() => { haptic(5); toggle(o.id); }} aria-pressed={pick.includes(o.id)}>
            <span className="go-check"><Icon name="check" size={13} style={{ strokeWidth: 3 }} /></span><span><b>{o.label}</b><small>{o.hint}</small></span>
          </button>
        ))}
      </div>
      <div className="ts-row"><button className="btn line grow" onClick={() => { setPick(ids); setEditing(false); }}>Cancelar</button><button className="btn primary grow" onClick={save}>Guardar</button></div>
    </div>
  );
  if (!goals.length) return (
    <button className="card goals-empty" onClick={() => { haptic(6); setEditing(true); }}>
      <span className="set-ic violet"><Icon name="trend" size={18} /></span>
      <span><b>Ponte una meta esta semana</b><small>«Entregar todo un día antes», «promedio de 95»… y te muestro cómo vas.</small></span>
      <Icon name="chevron" size={18} className="row-chevron" />
    </button>
  );
  return (
    <div className="card goals">
      <div className="card-head"><h3>Metas de la semana</h3><button className="link-btn spacer" onClick={() => setEditing(true)}>Cambiar</button></div>
      {goals.map((g) => {
        const isAvg = g.id.startsWith('promedio');
        const pct = isAvg ? Math.min(100, (g.done / g.total) * 100) : g.total ? (g.done / g.total) * 100 : 0;
        const R = 18, C = 2 * Math.PI * R;
        return (
          <div key={g.id} className={`goal ${g.ok ? 'ok' : ''}`}>
            <svg className="goal-ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r={R} className="gr-bg" />
              <circle cx="22" cy="22" r={R} className="gr-fg" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, pct / 100))} transform="rotate(-90 22 22)" />
              {g.ok && <path d="M15 22.5l5 5 9-10" className="gr-ok" />}
            </svg>
            <div className="goal-copy"><b>{g.label}</b><small>{g.detail}</small></div>
            <span className="goal-n num">{isAvg ? (g.done ? fmtGrade(g.done) : '—') : `${g.done}/${g.total}`}</span>
          </div>
        );
      })}
    </div>
  );
}

/** «¡Te calificaron!»: la nota nueva grande, el comentario y cuánto movió tu promedio. */
function FreshGrade({ g, onDone }: { g: NonNullable<Dashboard['freshGrade']>; onDone: () => void }) {
  const pct = g.max ? (g.grade / g.max) * 100 : 0;
  // Una nota de 90 o más se celebra (una sola vez por nota)
  useEffect(() => {
    if (pct < 90) return;
    try { const k = `rumbo-celebrada-${g.id}`; if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { /* sin almacenamiento */ }
    const t = setTimeout(() => confetti(), 500);
    return () => clearTimeout(t);
  }, [g.id, pct]);
  async function close() {
    haptic(6);
    await api('/announcements/read', { method: 'POST', body: { ids: [g.id] } }).catch(() => {});
    window.dispatchEvent(new Event('rumbo:badges'));
    onDone();
  }
  return (
    <section className={`fresh-grade ${pct >= 70 ? 'good' : 'bad'}`} aria-label="Nota nueva">
      <button className="fg-x" onClick={close} aria-label="Cerrar"><Icon name="x" size={16} /></button>
      <span className="fg-kicker">{pct >= 90 ? '🎉 ¡Te calificaron!' : pct >= 70 ? '✅ Te calificaron' : '⚠️ Te calificaron'}</span>
      <div className="fg-main">
        <span className="fg-score num"><b>{fmtGrade(g.grade)}</b><small>/{fmtGrade(g.max)}</small></span>
        <span className="fg-copy"><b>{g.title}</b><span><i className="dot" style={{ background: g.color || 'var(--blue)' }} />{g.course || 'Asignatura'}</span>
          {g.average !== null && <span className="fg-avg">Materia ahora <b className="num">{fmtGrade(g.average)}</b>{g.delta ? <em className={`num ${g.delta > 0 ? 'up' : 'down'}`}>{g.delta > 0 ? '▲ +' : '▼ '}{fmtGrade(g.delta)}</em> : null}</span>}
        </span>
      </div>
      {g.feedback && <p className="fg-fb">💬 {g.feedback.length > 220 ? g.feedback.slice(0, 220) + '…' : g.feedback}</p>}
      {g.url?.startsWith('/#') && <button className="link-btn" onClick={() => { void close(); location.hash = g.url!.slice(2); }}>Ver la ficha<Icon name="chevron" size={15} /></button>}
    </section>
  );
}

/** Cuenta regresiva en vivo hasta una entrega ("5 h 12 min"). */
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 30000); return () => clearInterval(t); }, []);
  const left = Math.max(0, to - now);
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60);
  const txt = d >= 2 ? `${d} días` : d === 1 ? `1 d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
  return <span className={`countdown num ${left < 6 * 3600 ? 'hot' : ''}`}>{txt}</span>;
}

/** Si falta conectar algo (sobre todo el EVA), lo dice arriba con un botón. Se puede posponer 3 días. */
function SetupBanner({ setup, go }: { setup?: Dashboard['setup']; go: (p: string) => void }) {
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem('rumbo-setup-later') || 0) > Date.now(); } catch { return false; } });
  if (!setup) return null;
  const missing = [!setup.eva && 'tu EVA', !setup.whatsapp && 'los avisos por WhatsApp', !setup.career && 'tu carrera'].filter(Boolean) as string[];
  // Sin EVA la app está vacía: ese aviso no se puede posponer.
  if (!missing.length || (hidden && setup.eva)) return null;
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}` : missing[0];
  return (
    <div className={`setup-banner ${setup.eva ? '' : 'urgent'}`} role="status">
      <span className="set-ic blue" aria-hidden="true"><Icon name="plug" size={18} /></span>
      <div className="t"><b>{setup.eva ? 'Te falta poco' : 'Conecta tu EVA para empezar'}</b><span>Falta conectar {list}.</span></div>
      <div className="sb-actions">
        <button className="btn primary sm" onClick={() => go('conectar')}>Terminar</button>
        {setup.eva && <button className="link-btn" onClick={() => { try { localStorage.setItem('rumbo-setup-later', String(Date.now() + 3 * 86400_000)); } catch { /* sin almacenamiento */ } setHidden(true); }}>Luego</button>}
      </div>
    </div>
  );
}

/** Inicio de alguien que acaba de llegar: qué hace Rumbo y un solo paso claro (conectar el EVA). */
function FirstSteps({ d, go, initial }: { d: Dashboard; go: (p: string) => void; initial: string }) {
  const steps = [
    { done: !!d.setup?.eva, icon: 'book', title: 'Conecta tu EVA', text: 'Trae tus asignaturas, entregas, notas y avisos. Toma un minuto.' },
    { done: !!d.setup?.whatsapp, icon: 'chat', title: 'Avisos por WhatsApp', text: 'El resumen del día y las entregas, directo a tu WhatsApp.' },
    { done: !!d.setup?.career, icon: 'cap', title: 'Elige tu carrera', text: 'Para ver tu pensum y cuánto te falta.' },
  ];
  return (
    <>
      <PageHead eyebrow={String(d.today || '').replace(/ de (\S{3})\S*/, ' $1').replace(/^(\S{3})\S*/, '$1')} title={`${greeting()}${d.name ? ', ' + d.name.split(' ')[0] : ''}`}>
        <button className="avatar hide-desktop" onClick={() => go('ajustes')} aria-label="Ajustes">{initial}</button>
      </PageHead>
      <div className="welcome-card">
        <Mascot mood="feliz" size={84} />
        <div>
          <h2>¡Qué bueno tenerte en Rumbo!</h2>
          <p>Aquí vas a ver lo que vence, tus notas y los avisos de la UAPA, y te aviso antes de cada entrega. Solo falta conectar tus cosas.</p>
        </div>
      </div>
      <ol className="first-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? 'done' : ''}>
            <span className="fs-n" aria-hidden="true">{s.done ? <Icon name="check" size={15} style={{ strokeWidth: 3 }} /> : i + 1}</span>
            <span className="fs-copy"><b>{s.title}{s.done && <span className="sr-only"> (listo)</span>}</b><small>{s.text}</small></span>
          </li>
        ))}
      </ol>
      <button className="btn primary lg block" onClick={() => go('conectar')}><Icon name="plug" size={19} />Empezar ahora</button>
      <p className="small muted center">Mientras tanto puedes agregar tareas a mano con el botón + o hablar con el asistente.</p>
    </>
  );
}


/** «Qué me toca»: lo atrasado, lo de hoy y lo de esta semana, separado y con contadores. */
function QueToca({ d, go, onOpen, onToggle }: { d: Dashboard; go: (p: string) => void; onOpen: (t: Task) => void; onToggle: (t: Task) => void }) {
  const now = Date.now() / 1000;
  const key = (sec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date(sec * 1000));
  const hoy = key(now);
  const late = (d.overdueList && d.overdueList.length ? d.overdueList : d.tasks.filter((t) => t.due_at !== null && t.due_at < now));
  const lateCount = Math.max(d.counts.overdue, late.length);
  const today = d.tasks.filter((t) => t.due_at !== null && t.due_at >= now && key(t.due_at) === hoy);
  const week = d.tasks.filter((t) => t.due_at !== null && t.due_at >= now && key(t.due_at) !== hoy && t.due_at < now + 7 * 86400);
  const block = (title: string, tone: string, items: Task[], more?: number) => items.length === 0 ? null : (
    <div className={`qt-block ${tone}`}>
      <div className="qt-head"><b>{title}</b><span className={`pill ${tone === 'red' ? 'red' : 'blue'} num`}>{more ?? items.length}</span></div>
      <div className="list">{items.slice(0, 3).map((t) => <TaskRow key={t.id} t={t} onToggle={onToggle} onOpen={onOpen} />)}</div>
    </div>
  );
  return (
    <div className="card que-toca">
      <div className="card-head"><h3>Qué me toca</h3><button className="link-btn spacer" onClick={() => go('tareas')}>Ver todo<Icon name="chevron" size={16} /></button></div>
      <div className="qt-counts">
        <button className={lateCount ? 'red' : ''} onClick={() => go('tareas')}><b className="num">{lateCount}</b><span>Atrasadas</span></button>
        <button onClick={() => go('tareas')}><b className="num">{today.length}</b><span>Hoy</span></button>
        <button onClick={() => go('tareas')}><b className="num">{week.length}</b><span>Esta semana</span></button>
      </div>
      {lateCount + today.length + week.length === 0 ? <p className="muted small">Nada pendiente por ahora. ¡Estás al día!</p> : (
        <>
          {block('Atrasadas · hazlas primero', 'red', late, lateCount)}
          {block('Para hoy', 'blue', today)}
          {block('Esta semana', 'gray', week)}
        </>
      )}
    </div>
  );
}
