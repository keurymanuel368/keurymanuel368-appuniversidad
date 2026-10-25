import { api } from './api';
import { useLoad } from './components';

type Cls = { start_date: string | null; end_date: string | null };
type Hz = { classes: Cls[] };
type CalEvent = { id: string; term: string; title: string; from: string; to: string; kind: string };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const day0 = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`;
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

/** «Tu trimestre»: el camino de la primera a la última semana, con una brújula que marca dónde vas. */
export function TermJourney() {
  const hz = useLoad(() => api<Hz>('/horario'));
  const cal = useLoad(() => api<{ events: CalEvent[] }>('/uapa/calendar'));
  const ds = (hz.data?.classes || []).map((k) => k.start_date).filter(Boolean) as string[];
  const de = (hz.data?.classes || []).map((k) => k.end_date).filter(Boolean) as string[];
  if (!ds.length || !de.length) return null;
  const start = day0(ds.sort()[0]), end = day0(de.sort().reverse()[0]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total = Math.max(1, daysBetween(start, end) + 1);
  const weeks = Math.ceil(total / 7);
  const elapsed = daysBetween(start, today);
  const before = elapsed < 0, after = elapsed >= total;
  const pct = before ? 0 : after ? 1 : (elapsed + 0.5) / total;
  const week = before ? 0 : Math.min(weeks, Math.floor(elapsed / 7) + 1);
  const left = daysBetween(today, end);

  // Hitos del calendario oficial dentro del trimestre (los más útiles)
  const term = cal.data?.events.find((e) => e.kind === 'docencia' && day0(e.from).getTime() === start.getTime())?.term;
  const marks = (cal.data?.events || []).filter((e) => e.term === term && ['34-cambio', '41-cambio', '34-final', '41-final'].includes(e.id)).map((e) => ({ id: e.id, at: day0(e.to), label: /final/.test(e.id) ? 'Final' : 'Cambios' }));
  marks.push({ id: 'retiro', at: new Date(start.getTime() + 27 * 86400000), label: 'Retiro' });
  const next = [...marks, { id: 'fin', at: end, label: 'Fin' }].filter((m) => m.at >= today).sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  const W = 320, H = 86, PAD = 16;
  const x = (p: number) => PAD + p * (W - PAD * 2);
  const y = (p: number) => 46 - Math.sin(p * Math.PI * 2) * 12;           // camino ondulado
  const path = Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${x(i / 40).toFixed(1)} ${y(i / 40).toFixed(1)}`).join(' ');
  const upto = Array.from({ length: Math.max(2, Math.round(pct * 40) + 1) }, (_, i) => `${i ? 'L' : 'M'}${x(i / 40).toFixed(1)} ${y(i / 40).toFixed(1)}`).join(' ');
  const mx = x(pct), my = y(pct);

  return (
    <section className="tj" aria-label="Tu trimestre">
      <header>
        <div>
          <small>Tu trimestre · {fmt(start)} → {fmt(end)}</small>
          <h3>{before ? `Empieza en ${-elapsed} día${-elapsed === 1 ? '' : 's'}` : after ? 'Trimestre terminado' : `Semana ${week} de ${weeks}`}</h3>
        </div>
        <span className="tj-left num">{before ? '🚀' : after ? '🎓' : `${left} d`}</span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Vas por el ${Math.round(pct * 100)}% del trimestre`}>
        <defs>
          <linearGradient id="tjg" x1="0" x2="1"><stop offset="0" stopColor="#3B8CFF" /><stop offset="1" stopColor="#FF8A1F" /></linearGradient>
        </defs>
        <path d={path} className="tj-bg" />
        <path d={upto} className="tj-fg" />
        {Array.from({ length: weeks + 1 }, (_, i) => { const p = Math.min(1, (i * 7) / total); return <circle key={i} cx={x(p)} cy={y(p)} r={i % weeks === 0 ? 3.2 : 2} className={p <= pct ? 'tj-dot on' : 'tj-dot'} />; })}
        {marks.map((m) => { const p = Math.min(1, Math.max(0, (daysBetween(start, m.at) + 1) / total)); return <g key={m.id}><path d={`M${x(p)} ${y(p) - 7}v-9`} className="tj-flag" /><circle cx={x(p)} cy={y(p) - 18} r="3" className="tj-flagdot" /></g>; })}
        <g transform={`translate(${mx} ${my})`} className="tj-compass">
          <circle r="11" className="tj-halo" />
          <circle r="8.5" className="tj-ring" />
          <path d="M0 -6l2.6 6H-2.6z" fill="#FF8A1F" /><path d="M0 6l-2.6 -6h5.2z" fill="#fff" />
        </g>
      </svg>
      <footer>
        <span><b className="num">{Math.round(pct * 100)}%</b> recorrido</span>
        {next && <span>Siguiente: <b>{next.label}</b> · {fmt(next.at)}</span>}
      </footer>
    </section>
  );
}
