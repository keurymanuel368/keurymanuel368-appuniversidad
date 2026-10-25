import { api, whenLabel, type Dashboard, type PensumRow, type Task } from './api';
import { CountUp, Ring, haptic, useLoad } from './components';
import { Icon } from './icons';
import { Mascot } from './Mascot';

type Summary = { account: { balance: number; currency: string; periods: { period: string; charges: number; paid: number; balance: number }[] } | null; account_at: number | null };
const rd = (n: number) => 'RD$' + Math.round(n).toLocaleString('es-DO');

/** El panel de Inicio: portada con tu día, tres cifras clave, dinero y carrera, y accesos rápidos. */
export function Panel({ d, now1, next, syncing, busy, go, onOpen, onNew, onSync, onSummary }: {
  d: Dashboard; now1: Task | null; next: Task | undefined; syncing: boolean; busy: boolean;
  go: (p: string) => void; onOpen: (t: Task) => void; onNew: () => void; onSync: () => void; onSummary: () => void;
}) {
  const pensum = useLoad(() => api<PensumRow[]>('/pensum'));
  const sum = useLoad(() => api<Summary>('/uapa/summary'));
  const rows = (pensum.data || []).filter((r) => (r.kind || 'obligatoria') === 'obligatoria');
  const total = rows.reduce((a, r) => a + r.credits, 0);
  const done = rows.filter((r) => r.status === 'aprobada').reduce((a, r) => a + r.credits, 0);
  const taking = rows.filter((r) => r.status === 'en_curso').reduce((a, r) => a + r.credits, 0);
  const acc = sum.data?.account;
  const cur = acc?.periods[0];
  const p = d.pay;
  const headline = d.counts.today > 0
    ? `Hoy cierra${d.counts.today > 1 ? 'n' : ''} ${d.counts.today} entrega${d.counts.today > 1 ? 's' : ''}`
    : d.counts.week > 0 ? `${d.counts.week} entrega${d.counts.week > 1 ? 's' : ''} esta semana` : 'Semana despejada';

  return (
    <section className="pn">
      <div className="pn-card">
        <div className="pn-glow" aria-hidden="true" />
        <div className="pn-top">
          {d.mascot ? (
            <div className="pn-mascot"><Mascot mood={d.mascot.mood} size={46} /><span className="bubble">{d.mascot.sub}</span></div>
          ) : <span className="kicker"><Icon name="spark" size={14} />TU DÍA EN RUMBO</span>}
          {d.termProgress !== null && <div className="pn-ring"><Ring value={d.termProgress} size={92} stroke={10} display={<b className="num">{Math.round(d.termProgress)}%</b>} /><small>del trimestre</small></div>}
        </div>
        <h2>{headline}</h2>
        {next && next.id !== now1?.id ? (
          <button className="pn-next" onClick={() => onOpen(next)}>
            <span className="next-dot" style={{ background: next.course_color || '#fff' }} />
            <span><b>{next.title}</b><small>{whenLabel(next.due_at)}{next.course_short ? ' · ' + next.course_short : ''}</small></span>
            <Icon name="chevron" size={18} />
          </button>
        ) : <p className="pn-sub">Nada pendiente con fecha. Buen momento para adelantar.</p>}
        {d.weekProgress.total > 0 && (
          <div className="pn-week">
            <span><b className="num">{d.weekProgress.done}</b> de <b className="num">{d.weekProgress.total}</b> entregas de la semana</span>
            <div className="hero-bar"><div style={{ width: `${(d.weekProgress.done / d.weekProgress.total) * 100}%` }} /></div>
          </div>
        )}
        <div className="pn-kpis">
          <button onClick={() => go('tareas')}>
            <span className="num"><CountUp value={d.counts.pending} /></span>
            <small>Pendientes</small>
            <em className={d.counts.overdue ? 'bad' : ''}>{d.counts.overdue ? `${d.counts.overdue} vencida${d.counts.overdue > 1 ? 's' : ''}` : 'al día'}</em>
          </button>
          <button onClick={() => go('asignaturas')}>
            <span className="num">{d.average === null ? '—' : <CountUp value={d.average} decimals={1} />}</span>
            <small>Promedio</small>
            <em>{d.average === null ? 'sin notas' : d.average >= 70 ? 'sobre el mínimo' : 'bajo 70'}</em>
          </button>
          <button onClick={() => go('pensum')}>
            <span className="num"><CountUp value={done} /></span>
            <small>Créditos</small>
            <em>{total ? `de ${total}` : 'aprobados'}</em>
          </button>
        </div>
      </div>

      <div className="pn-tiles">
        <button className={`pn-tile money ${acc && acc.balance > 0 && !p.paid ? 'owe' : ''}`} onClick={() => go('pagos')}>
          <span className="pn-tile-ic"><Icon name="wallet" size={18} /></span>
          <small>{acc ? (acc.balance > 0 ? 'Por pagar en cuotas' : 'Cuenta al día') : p.paid ? 'Cuota pagada' : 'Cuota del mes'}</small>
          <b className="num">{acc ? (acc.balance > 0 ? rd(acc.balance) : '✓') : p.paid ? '✓' : p.amount ? rd(Number(p.amount)) : '—'}</b>
          {acc && cur && cur.charges > 0 ? (
            <><span className="pn-bar"><i style={{ width: `${Math.min(100, (cur.paid / cur.charges) * 100)}%` }} /></span>
            <em>{p.paid ? '✓ Este mes pagado' : p.state === 'open' ? `Cierra en ${p.daysToClose} d` : `Abre en ${p.daysToOpen} d`}{Number(p.amount) > 0 && acc.balance > 0 ? ` · ${Math.max(1, Math.round(acc.balance / Number(p.amount)))} cuotas de ${rd(Number(p.amount))}` : ''}</em></>
          ) : <em>{p.paid ? '✓ Este mes pagado' : p.state === 'open' ? `Cierra en ${p.daysToClose} d` : `Abre en ${p.daysToOpen} d`}</em>}
        </button>
        <button className="pn-tile career" onClick={() => go('pensum')}>
          <span className="pn-tile-ic"><Icon name="cap" size={18} /></span>
          <small>Tu carrera</small>
          <b className="num">{total ? Math.round((done / total) * 100) : 0}%</b>
          <span className="pn-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /><i className="cur" style={{ width: `${total ? (taking / total) * 100 : 0}%` }} /></span>
          <em>{done} aprobados · {taking} en curso</em>
        </button>
      </div>

      <nav className="pn-dock" aria-label="Accesos rápidos">
        <button onClick={() => { haptic(8); onNew(); }}><span className="g1"><Icon name="plus" size={18} /></span>Nueva tarea</button>
        <button onClick={() => go('horario')}><span className="g2"><Icon name="calendar" size={18} /></span>Horario</button>
        <button onClick={() => go('apuntes')}><span className="g8"><Icon name="book" size={18} /></span>Estudio</button>
        <button onClick={() => go('pagos')}><span className="g3"><Icon name="wallet" size={18} /></span>Pagos</button>
        <button onClick={() => go('avisos')}><span className="g4"><Icon name="bell" size={18} /></span>Avisos</button>
        <button onClick={() => go('asistente')}><span className="g5"><Icon name="spark" size={18} /></span>Asistente</button>
        <button className={syncing ? 'spinning' : ''} onClick={onSync} disabled={syncing}><span className="g6"><Icon name="sync" size={18} /></span>{syncing ? 'Sincronizando' : 'Sincronizar'}</button>
        <button onClick={onSummary} disabled={busy}><span className="g7"><Icon name="send" size={18} /></span>{busy ? 'Enviando' : 'Resumen'}</button>
      </nav>
    </section>
  );
}
