import { useCallback, useEffect, useState } from 'react';
import { agoLabel, api, cleanTitle, channelsLabel, overdueLabel, type Dashboard, type SendResult, type Task, whenLabel } from '../api';
import { CountUp, Empty, PageHead, PullIndicator, Ring, Skeleton, TaskModal, TaskRow, TaskSheet, fmtGrade, haptic, runSync, syncToast, toast, toggleTask, usePullToRefresh, useLoad } from '../components';
import { Icon } from '../icons';
import { Mascot } from '../Mascot';
import { AchievementsCard } from '../Achievements';

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

  return (
    <>
      <PullIndicator pull={pull} refreshing={refreshing} />
      <PageHead eyebrow={`${greeting()} · ${d.today}`} title={d.name ? d.name.split(' ')[0] : 'Tu día'}>
        <button className="avatar hide-desktop" onClick={() => go('ajustes')} aria-label="Ajustes">{initial}</button>
      </PageHead>

      <SetupBanner setup={d.setup} go={go} />
      {d.freshGrade && <FreshGrade g={d.freshGrade} onDone={reload} />}
      {now1 && <NowCard t={now1} onOpen={() => setEditing(now1)} onDone={() => toggle(now1)} />}

      <nav className="quick-row hide-mobile" aria-label="Accesos rápidos">
        <button className="quick" onClick={() => go('asistente')}><span className="q-ic grad"><Icon name="spark" size={19} /></span>Hablar con Rumbo</button>
        <button className="quick" onClick={() => { haptic(8); setCreating(true); }}><span className="q-ic blue"><Icon name="plus" size={19} /></span>Nueva tarea</button>
        <button className="quick" onClick={() => go('tareas')}><span className="q-ic violet"><Icon name="calendar" size={19} /></span>Mi semana</button>
        <button className={`quick ${syncing ? 'spinning' : ''}`} onClick={sync} disabled={syncing}><span className="q-ic green"><Icon name="sync" size={19} /></span>{syncing ? 'Sincronizando…' : 'Sincronizar'}</button>
      </nav>

      <section className="grid2 stagger">
        <div className="hero">
          <div className="b1" /><div className="b2" /><div className="b3" />
          <div className="copy">
            {d.mascot ? (
              <div className="hero-mascot">
                <Mascot mood={d.mascot.mood} size={48} />
                <span className="bubble">{d.mascot.sub}</span>
              </div>
            ) : <span className="kicker"><Icon name="spark" size={14} />TU DÍA EN RUMBO</span>}
            <h2>{headline}</h2>
            {next && next.id !== now1?.id ? (
              <button className="next" onClick={() => setEditing(next)}>
                <span className="next-dot" style={{ background: next.course_color || '#fff' }} />
                <span className="next-txt"><b>{next.title}</b><span>{whenLabel(next.due_at)}{next.course_short ? ' · ' + next.course_short : ''}</span><Countdown to={next.due_at!} /></span>
                <Icon name="chevron" size={18} />
              </button>
            ) : <p>Nada pendiente con fecha. Aprovecha para adelantar.</p>}
            {d.weekProgress.total > 0 && (
              <div className="hero-week">
                <span><b className="num">{d.weekProgress.done}</b> de <b className="num">{d.weekProgress.total}</b> entregas de esta semana listas</span>
                <div className="hero-bar"><div style={{ width: `${(d.weekProgress.done / d.weekProgress.total) * 100}%` }} /></div>
              </div>
            )}
            <div className="actions">
              <button className="btn white" onClick={() => go('tareas')}>Ver tareas</button>
              <button className="btn ghost" onClick={sendSummary} disabled={busy}><Icon name="send" size={17} />{busy ? 'Enviando…' : 'Resumen'}</button>
            </div>
          </div>
          {d.termProgress !== null && <div className="hero-ring"><Ring value={d.termProgress} label="del trimestre" /></div>}
        </div>

        <div className="stats">
          <button className="stat" onClick={() => go('tareas')}>
            <span className="stat-ic blue"><Icon name="tasks" size={18} /></span>
            <span className="value num"><CountUp value={d.counts.pending} /></span>
            <span className="label">Pendientes</span>
            {/* Lo vencido pesa más que lo de hoy: si hay, es lo primero que tiene que ver. */}
            <span className={`foot ${d.counts.overdue || d.counts.today ? 'warn' : ''}`}>{d.counts.overdue ? `${d.counts.overdue} ${d.counts.overdue > 1 ? 'vencidas' : 'vencida'} sin marcar` : d.counts.today ? `${d.counts.today} ${d.counts.today > 1 ? 'vencen' : 'vence'} hoy` : 'Nada vence hoy'}</span>
          </button>
          <button className="stat" onClick={() => go('asignaturas')}>
            <span className="stat-ic green"><Icon name="trend" size={18} /></span>
            <span className="value num">{d.average === null ? '—' : <CountUp value={d.average} decimals={1} />}</span>
            <span className="label">Promedio</span>
            <span className={`foot ${d.average !== null && d.average >= 70 ? 'good' : ''}`}>{d.average === null ? 'Sin notas aún' : d.average >= 70 ? 'Sobre el mínimo' : 'Bajo 70'}</span>
          </button>
          <button className="stat" onClick={() => go('asignaturas')}>
            <span className="stat-ic violet"><Icon name="book" size={18} /></span>
            <span className="value num"><CountUp value={d.courses.length} /></span>
            <span className="label">Asignaturas</span>
            <span className="foot">{syncing ? 'Actualizando el EVA…' : d.lastSync ? `EVA ${agoLabel(d.lastSync)}` : 'EVA sin sincronizar'}</span>
          </button>
          <button className="stat" onClick={() => go('pagos')}>
            <span className={`stat-ic ${payTone}`}><Icon name="wallet" size={18} /></span>
            <span className="value num">{p.paid ? '✓' : p.state === 'open' ? <><CountUp value={p.daysToClose} /><small className="unit"> {p.daysToClose === 1 ? 'día' : 'días'}</small></> : <><CountUp value={p.daysToOpen} /><small className="unit"> {p.daysToOpen === 1 ? 'día' : 'días'}</small></>}</span>
            <span className="label">{p.paid ? 'Cuota pagada' : p.state === 'open' ? 'Para pagar la cuota' : 'Para que abra el pago'}</span>
            <span className={`foot ${payTone === 'orange' ? 'warn' : payTone === 'green' ? 'good' : 'info'}`}>{p.paid ? payState : `Ventana del ${p.openDay} al ${p.closeDay}`}</span>
          </button>
        </div>
      </section>


      {d.lastSyncError && <div className="banner"><Icon name="alert" size={18} /><span>El EVA no respondió en la última sincronización: {d.lastSyncError}</span></div>}

      <section className="grid2">
        <div className="col">
          <div className="card">
            <div className="card-head">
              <h3>Próximas entregas</h3>
              {d.lastSync && <span className="pill blue hide-mobile"><Icon name="sync" size={12} style={{ strokeWidth: 2.4 }} />EVA</span>}
              <button className="link-btn spacer" onClick={() => go('tareas')}>Ver todas<Icon name="chevron" size={16} /></button>
            </div>
            {d.tasks.length === 0
              ? <Empty icon="check" title="Todo al día" text="No tienes tareas pendientes. Agrega una con el botón + o sincroniza el EVA." />
              : <div className="list">{d.tasks.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} onToggle={toggle} onOpen={setEditing} />)}</div>}
          </div>

          {d.courses.length > 0 && (
            <div className="section">
              <div className="section-head"><h3>Asignaturas</h3><button className="link-btn" onClick={() => go('asignaturas')}>Notas<Icon name="chevron" size={16} /></button></div>
              <div className="courses scroller">
                {d.courses.map((c) => (
                  <button key={c.id} className="course" onClick={() => go(`asignaturas/${c.id}`)} style={{ ['--c' as string]: c.color }}>
                    <span className="course-top"><span className="code">{c.code || (c.short_name || '').toUpperCase().slice(0, 14)}</span><span className="grade num">{c.average ?? '—'}</span></span>
                    <span className="name">{c.name}</span>
                    <div className="progress"><div style={{ width: `${c.total ? (c.graded / c.total) * 100 : 0}%` }} /></div>
                    <span className="meta num">{c.graded}/{c.total} calificadas{c.pending_tasks ? ` · ${c.pending_tasks} pend.` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col">
          {d.news.length > 0 && (
            <button className="card news-card" onClick={() => go('avisos')}>
              <div className="card-head"><h3>Avisos</h3>{d.unreadNews > 0 && <span className="pill orange num">{d.unreadNews} nuevos</span>}<Icon name="chevron" size={18} className="spacer row-chevron" /></div>
              {d.news.map((n) => (
                <span key={n.id} className={`mini-news ${n.read ? '' : 'unread'}`}>
                  <i className={`mn-dot ${n.kind}`} />
                  <span><b>{cleanTitle(n.title)}</b><small>{n.course_name || (n.kind === 'pago' ? 'Pagos' : n.kind === 'evento' ? 'Evento' : 'UAPA')}</small></span>
                </span>
              ))}
            </button>
          )}

          <div className="card hide-mobile">
            <div className="card-head"><h3>Hoy y mañana</h3><span className="pill gray num">{soon.length}</span></div>
            {soon.length === 0 ? <p className="muted small">Nada vence en las próximas 36 horas. 🎉</p> : (
              <ol className="timeline">
                {soon.map((t) => (
                  <li key={t.id}>
                    <span className="tl-dot" style={{ background: t.course_color || 'var(--blue)' }} />
                    <button onClick={() => setEditing(t)}><b>{t.title}</b><span>{whenLabel(t.due_at)}{t.course_short ? ' · ' + t.course_short : ''}</span></button>
                  </li>
                ))}
              </ol>
            )}
            <p className="hint"><Icon name="bell" size={16} />Tu resumen del día llega como notificación a las {d.summaryHour > 12 ? d.summaryHour - 12 : d.summaryHour || 12}:00 {d.summaryHour < 12 ? 'a. m.' : 'p. m.'}</p>
          </div>

          {d.graded.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Últimas calificaciones</h3><button className="link-btn spacer" onClick={() => go('tareas')}>Ver todas<Icon name="chevron" size={16} /></button></div>
              <div className="grade-feed">
                {d.graded.map((t) => {
                  const pct = (t.grade! / t.grade_max!) * 100;
                  return (
                    <button key={t.id} className="gf-row" onClick={() => setEditing(t)}>
                      <span className={`gf-score ${pct >= 70 ? 'good' : 'bad'}`}><b className="num">{fmtGrade(t.grade!)}</b><small className="num">/{fmtGrade(t.grade_max!)}</small></span>
                      <span className="gf-copy"><b>{t.title}</b><span><i className="dot" style={{ background: t.course_color || 'var(--blue)' }} />{t.course_short || t.course_name}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button className="card pay-card" onClick={() => go('pagos')}>
            <div className="card-head"><h3>Cuota del mes</h3><span className={`pill ${payTone} spacer`}>{p.paid ? 'Pagado' : p.state === 'open' ? 'Abierta' : 'Aún no abre'}</span></div>
            <span className="amount num">{p.amount ? <><small>RD$</small>{Number(p.amount).toLocaleString('es-DO')}</> : <><small>RD$</small>—</>}</span>
            <div className="paybar"><div className={payTone} style={{ width: `${p.paid ? 100 : p.state === 'open' ? 100 - Math.min(100, (p.daysToClose / 11) * 100) : Math.max(4, 100 - (p.daysToOpen / 30) * 100)}%` }} /></div>
            <div className="pay-legend"><span>{p.paid ? `Pagaste la cuota de este mes` : p.state === 'open' ? `Abrió el ${p.openDay} · cierra el ${p.closeDay}` : `Abre el ${p.openDay} · cierra el ${p.closeDay}`}</span><b className="num">{p.paid ? '✓' : p.state === 'open' ? `${p.daysToClose} d` : `en ${p.daysToOpen} d`}</b></div>
          </button>
        </div>
      </section>

      {/* Lo motivacional va al final: primero lo que hay que hacer */}
      <section className="grid2 extras-row">
        <GoalsCard goals={d.goals || []} ids={d.goalIds || []} onChanged={reload} />
        <AchievementsCard />
      </section>

      {creating && <TaskModal task={{}} courses={d.courses} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {editing && <TaskSheet task={editing} courses={d.courses} onClose={() => setEditing(null)} onChanged={() => { setEditing(null); reload(); }} />}
    </>
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
        const pct = g.id.startsWith('promedio') ? Math.min(100, (g.done / g.total) * 100) : g.total ? (g.done / g.total) * 100 : 0;
        return (
          <div key={g.id} className={`goal ${g.ok ? 'ok' : ''}`}>
            <div className="goal-top"><b>{g.ok ? '✅ ' : ''}{g.label}</b><span className="num">{g.id.startsWith('promedio') ? (g.done ? fmtGrade(g.done) : '—') : `${g.done}/${g.total}`}</span></div>
            <div className="progress thin"><div className={g.ok ? 'green' : ''} style={{ width: `${pct}%` }} /></div>
            <small>{g.detail}</small>
          </div>
        );
      })}
    </div>
  );
}

/** «¡Te calificaron!»: la nota nueva grande, el comentario y cuánto movió tu promedio. */
function FreshGrade({ g, onDone }: { g: NonNullable<Dashboard['freshGrade']>; onDone: () => void }) {
  const pct = g.max ? (g.grade / g.max) * 100 : 0;
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
          {g.average !== null && <span className="fg-avg">Promedio ahora <b className="num">{fmtGrade(g.average)}</b>{g.delta ? <em className={`num ${g.delta > 0 ? 'up' : 'down'}`}>{g.delta > 0 ? '▲ +' : '▼ '}{fmtGrade(g.delta)}</em> : null}</span>}
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
      <PageHead eyebrow={d.today} title={`${greeting()}${d.name ? ', ' + d.name : ''}`}>
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
