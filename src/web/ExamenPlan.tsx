import { useState } from 'react';
import { api, dayKey } from './api';
import { Modal, Skeleton, haptic, toast, useLoad } from './components';
import { Icon } from './icons';

type Session = { k: string; kind: 'estudiar' | 'repasar' | 'practicar' | 'simulacro'; title: string; min: number };
type Day = { date: string; sessions: Session[] };
type Plan = { id: number; course: string; title: string; exam_at: number; plan: Day[]; done: string[] };
type Resp = { planes: Plan[]; proximos: { course: string; title: string; exam_at: number }[]; cursos: string[] };

const KIND: Record<Session['kind'], { label: string; cls: string }> = {
  estudiar: { label: 'Estudiar', cls: 'c-blue' }, repasar: { label: 'Repasar', cls: 'c-mint' },
  practicar: { label: 'Practicar', cls: 'c-vio' }, simulacro: { label: 'Simulacro', cls: 'c-orange' },
};
const dayLabel = (d: string) => new Intl.DateTimeFormat('es-DO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00Z'));
const examLabel = (sec: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(sec * 1000));
const inDays = (sec: number) => Math.max(0, Math.ceil((sec * 1000 - Date.now()) / 86400000));

/** «Plan de examen»: eliges el examen y Rumbo arma tu calendario de estudio día por día, con simulacro al final. */
export function ExamenPlan() {
  const data = useLoad(() => api<Resp>('/examenes'));
  const [course, setCourse] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState<{ title: string; qs: { q: string; a: string }[] } | 'cargando' | null>(null);
  const today = dayKey(Date.now() / 1000);

  async function create(c: string, examAt: number, title?: string) {
    setBusy(true);
    try { await api('/examenes', { method: 'POST', body: { course: c, exam_at: examAt, title } }); haptic(12); toast('Plan armado'); data.reload(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  const manual = () => {
    if (!course || !date) { toast('Elige la materia y el día del examen', 'err'); return; }
    // 8:00 a. m. hora de República Dominicana (UTC−4) del día elegido
    void create(course, Math.floor(new Date(`${date}T08:00:00-04:00`).getTime() / 1000)).then(() => { setDate(''); });
  };
  const tick = async (p: Plan, k: string) => {
    haptic(8);
    const on = !p.done.includes(k);
    data.setData((d) => d && { ...d, planes: d.planes.map((x) => (x.id === p.id ? { ...x, done: on ? [...x.done, k] : x.done.filter((y) => y !== k) } : x)) });
    try { await api(`/examenes/${p.id}/sesion`, { method: 'POST', body: { k, done: on } }); } catch (e) { toast((e as Error).message, 'err'); data.reload(); }
  };
  const act = async (p: Plan, what: 'replan' | 'borrar') => {
    try {
      if (what === 'replan') { await api(`/examenes/${p.id}/replan`, { method: 'POST' }); toast('Plan recalculado'); } else { await api(`/examenes/${p.id}`, { method: 'DELETE' }); toast('Plan quitado'); }
      data.reload();
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const simulacro = async (p: Plan) => {
    haptic(8); setSim('cargando');
    try { const r = await api<{ preguntas: { q: string; a: string }[] }>(`/examenes/${p.id}/simulacro`, { method: 'POST' }); setSim({ title: p.title, qs: r.preguntas }); }
    catch (e) { setSim(null); toast((e as Error).message, 'err'); }
  };

  if (data.error && !data.data) return <div className="error">{data.error}</div>;
  if (!data.data) return <Skeleton rows={3} hero={false} />;
  const d = data.data;
  return (
    <>
      <section className="hero" style={{ padding: '24px 28px' }}>
        <div className="tick" />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#BCD0FF' }}>Plan de examen</div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: '-.025em', margin: '4px 0 6px' }}>{d.planes.length ? `${d.planes.length} examen${d.planes.length > 1 ? 'es' : ''} en camino` : 'Llega al examen sin correr'}</h2>
          <p style={{ color: '#D8E2FF', fontSize: 15, maxWidth: 520 }}>Elige el examen y Rumbo reparte tus temas día por día: estudiar, repasar, practicar y un simulacro la víspera.</p>
        </div>
      </section>

      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        <div className="col">
          {d.planes.map((p) => {
            const all = p.plan.flatMap((x) => x.sessions);
            const done = all.filter((s) => p.done.includes(s.k)).length;
            const pct = all.length ? Math.round((done / all.length) * 100) : 0;
            const left = inDays(p.exam_at);
            const upcoming = p.plan.filter((x) => x.date >= today);
            const shown = upcoming.slice(0, 3), rest = upcoming.slice(3);
            const dayRow = (x: Day) => (
              <div key={x.date} style={{ marginTop: 12 }}>
                <div className="eb" style={{ margin: '0 0 4px', color: x.date === today ? 'var(--cobalt)' : 'var(--muted)', textTransform: 'capitalize' }}>{x.date === today ? 'Hoy · ' : ''}{dayLabel(x.date)}</div>
                <ul>
                  {x.sessions.map((s) => {
                    const on = p.done.includes(s.k);
                    return (
                      <li key={s.k} className={`row ${on ? 'done' : ''}`}>
                        <button className={`chk ${on ? 'on' : ''}`} onClick={() => void tick(p, s.k)} aria-label={on ? 'Desmarcar' : 'Marcar como hecho'} />
                        <div className="t" style={{ cursor: 'default' }}><b>{s.title}</b><small>{s.min} min</small></div>
                        <span className={`chip ${KIND[s.kind].cls}`}>{KIND[s.kind].label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
            return (
              <section key={p.id} className="card">
                <div className="head"><div style={{ minWidth: 0 }}><h3 style={{ marginBottom: 2 }}>{p.title}</h3><small style={{ color: 'var(--muted)' }}>{p.course} · {examLabel(p.exam_at)}</small></div><span className={`chip ${left <= 3 ? 'c-rose' : left <= 7 ? 'c-orange' : 'c-blue'} num`}>{left === 0 ? 'Hoy' : `En ${left} d`}</span></div>
                <div className="bar"><i className="grow" style={{ width: `${pct}%`, background: 'var(--cobalt)' }} /></div>
                <p className="sm" style={{ color: 'var(--muted)', margin: '6px 0 0' }}>{done} de {all.length} sesiones hechas · {pct}%</p>
                {upcoming.length === 0 ? <p style={{ color: 'var(--muted)', marginTop: 12 }}>Ya pasaron todos los días del plan. ¡Éxito en el examen!</p> : shown.map(dayRow)}
                {rest.length > 0 && <details style={{ marginTop: 10 }}><summary className="link" style={{ cursor: 'pointer' }}>Ver los {rest.length} días siguientes</summary>{rest.map(dayRow)}</details>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  <button className="btn b-or" onClick={() => void simulacro(p)}><Icon name="spark" size={16} />Simulacro</button>
                  <button className="btn b-line" style={{ background: 'var(--card)' }} onClick={() => void act(p, 'replan')}><Icon name="sync" size={16} />Recalcular</button>
                  <button className="btn b-line" style={{ background: 'var(--card)', color: 'var(--rose)' }} onClick={() => void act(p, 'borrar')}><Icon name="trash" size={16} />Quitar</button>
                </div>
              </section>
            );
          })}
          {d.planes.length === 0 && <section className="card"><p style={{ color: 'var(--muted)' }}>Todavía no tienes planes. Elige un examen a la derecha o agrega uno con su fecha.</p></section>}
        </div>

        <div className="col">
          {d.proximos.length > 0 && (
            <section className="card">
              <div className="head"><h3>Exámenes del DEA</h3><span className="chip c-orange">{d.proximos.length}</span></div>
              <ul>
                {d.proximos.map((e) => (
                  <li key={e.title + e.exam_at} className="row nol">
                    <div className="t" style={{ cursor: 'default' }}><b>{e.title}</b><small>{e.course} · {examLabel(e.exam_at)}</small></div>
                    <button className="chip c-blue" disabled={busy || !e.course} onClick={() => void create(e.course, e.exam_at, e.title)}>Armar plan</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <div className="head"><h3>Otro examen</h3></div>
            <div className="field" style={{ marginBottom: 10 }}><label htmlFor="ex-c" className="sm" style={{ color: 'var(--muted)' }}>Materia</label>
              <select id="ex-c" className="input" value={course} onChange={(e) => setCourse(e.target.value)}><option value="">Elige la materia…</option>{d.cursos.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="field" style={{ marginBottom: 14 }}><label htmlFor="ex-d" className="sm" style={{ color: 'var(--muted)' }}>Día del examen</label>
              <input id="ex-d" className="input" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></div>
            <button className="btn b-pri" style={{ width: '100%' }} disabled={busy} onClick={manual}>{busy ? 'Armando…' : 'Armar mi plan'}</button>
            <p className="sm" style={{ color: 'var(--muted)', marginTop: 10 }}>Usa los temas de tu cuaderno de esa materia. Si aún no tiene hojas, arma los cuadernos en Cuadernos y pulsa «Recalcular».</p>
          </section>
        </div>
      </div>

      {sim && (
        <Modal title="Simulacro" onClose={() => setSim(null)}>
          {sim === 'cargando' ? <p style={{ padding: 16 }}>Preparando tus preguntas…</p> : (
            <div className="rbx" style={{ gap: 10 }}>
              <p className="sm" style={{ color: 'var(--muted)' }}>{sim.title}. Contesta primero en tu cabeza o en papel; luego toca «Ver respuesta».</p>
              {sim.qs.map((x, i) => (
                <details key={i} className="card" style={{ padding: '12px 16px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, lineHeight: 1.35 }}>{i + 1}. {x.q}</summary>
                  <p style={{ marginTop: 8, color: 'var(--ink2)' }}>{x.a}</p>
                </details>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
