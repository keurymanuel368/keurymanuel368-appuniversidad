import { useMemo, useState } from 'react';
import { api } from '../api';
import { Empty, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';
import { WeekGrid } from './Horario';

type Meeting = { b: string; e: string; d: string[]; room?: string | null; bldg?: string | null };
type Sec = { term: string; crn: string; code: string; title: string; section: string | null; credits: number; seats: number | null; capacity: number | null; campus: string | null; faculty: string | null; meetings: Meeting[] };
type Enrolled = { id: number; crn: string; code: string | null; title: string; day: number; start_min: number; end_min: number };
type PlannerData = { term: string | null; sections: Sec[]; picks: Record<string, string>; enrolled: Enrolled[]; enrolled_credits: number };

const DAY_IDX: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const minOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
const h12 = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`; };
const blocks = (s: Sec) => s.meetings.flatMap((m) => m.d.map((d) => ({ day: DAY_IDX[d], s: minOf(m.b), e: minOf(m.e) })));
const when = (s: Sec) => s.meetings.length ? s.meetings.map((m) => `${m.d.map((d) => DIAS[DAY_IDX[d]]).join('·')} ${h12(minOf(m.b))}–${h12(minOf(m.e))}`).join(' + ') : 'Sin horario';
const PALETA = [218, 262, 172, 28, 332, 148, 196, 48];
const hue = (t: string) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };
const TERMS: Record<string, string> = { '202634': 'Nov – Ene 2026-27', '202641': 'Feb – Abr 2027' };
const MIN_CR = 3, MAX_CR = 15;

export function Planner() {
  const data = useLoad(() => api<PlannerData>('/planner'));
  const [open, setOpen] = useState<string | null>(null);
  const d = data.data;
  const picks = d?.picks || {};
  const groups = useMemo(() => {
    const m = new Map<string, Sec[]>();
    for (const s of d?.sections || []) m.set(s.code, [...(m.get(s.code) || []), s]);
    return [...m.entries()];
  }, [d]);
  if (!d) return <Skeleton rows={2} hero={false} />;
  if (!d.sections.length) return <Empty icon="calendar" title="Aún no hay oferta de secciones" text="Actualiza desde «Inscribir asignaturas» en Mi UAPA con el marcador de abajo: Rumbo trae las secciones de tus materias siguientes y arma el plan contigo." />;

  const chosen = groups.map(([code, secs]) => secs.find((s) => s.crn === picks[code])).filter((x): x is Sec => !!x);
  const enrolledCredits = d.enrolled_credits || 0;
  const planCredits = chosen.reduce((a, s) => a + s.credits, 0) + enrolledCredits;
  const allBlocks = [
    ...d.enrolled.map((k) => ({ label: k.title, day: k.day, s: k.start_min, e: k.end_min })),
    ...chosen.flatMap((s) => blocks(s).map((b) => ({ label: s.title, ...b }))),
  ];
  const conflicts: string[] = [];
  const lines = [...d.enrolled.map((k) => ({ label: k.title, day: k.day, s: k.start_min, e: k.end_min })), ...chosen.flatMap((s) => blocks(s).map((b) => ({ label: s.title, ...b })))];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (a.label !== b.label && a.day === b.day && a.s < b.e && b.s < a.e) conflicts.push(`${a.label} y ${b.label} chocan el ${DIAS[a.day].toLowerCase()}`);
  }
  const conflictsOf = (s: Sec) => {
    const mine = blocks(s); const out: string[] = [];
    for (const o of lines) if (o.label !== s.title) for (const b of mine) if (o.day === b.day && o.s < b.e && b.s < o.e) { out.push(o.label); break; }
    return Array.from(new Set(out));
  };

  async function pick(code: string, crn: string | null) {
    haptic(8);
    const next = { ...picks };
    if (crn) next[code] = crn; else delete next[code];
    data.setData({ ...d!, picks: next });
    try { await api('/planner', { method: 'PUT', body: { picks: next } }); } catch (e) { toast((e as Error).message, 'err'); data.reload(); }
  }
  async function copy() {
    const crns = chosen.map((s) => s.crn).join(', ');
    try { await navigator.clipboard.writeText(crns); toast(`NRC copiados: ${crns}`); haptic(12); } catch { toast(crns); }
  }
  const weekClasses = allBlocks.map((b, i) => ({ id: i, term: d.term || '', crn: '', code: null, title: b.label, day: b.day, start_min: b.s, end_min: b.e, room: null, building: null, start_date: null, end_date: null }));
  const status = planCredits > MAX_CR ? 'over' : planCredits < MIN_CR ? 'under' : 'ok';

  return (
    <div className="pl">
      <section className={`pl-sum ${status}`}>
        <div><small>Tu plan · {TERMS[d.term || ''] || d.term}</small><b className="num">{planCredits} créditos</b><em>{status === 'over' ? `Te pasas de ${MAX_CR}` : status === 'under' ? `Mínimo ${MIN_CR} por periodo` : `Entre ${MIN_CR} y ${MAX_CR}: bien`}{enrolledCredits ? ` · ${enrolledCredits} cr. ya inscritos` : ''}</em></div>
        <button className="btn white" onClick={copy} disabled={!chosen.length}><Icon name="link" size={16} />Copiar NRC</button>
      </section>
      {conflicts.length > 0 && <div className="pl-warn"><Icon name="alert" size={18} /><span><b>Hay choques de horario</b>{Array.from(new Set(conflicts)).slice(0, 3).map((c) => <small key={c}>{c}</small>)}</span></div>}
      {weekClasses.length > 0 && <WeekGrid data={{ classes: weekClasses as never, exams: [], projection: [], synced_at: null, lead: 30, recommend: { list: [], credits: 0, note: '' } }} sel={-1} onSel={() => {}} now={new Date()} />}
      <ul className="pl-list">
        {groups.map(([code, secs]) => {
          const sel = secs.find((s) => s.crn === picks[code]);
          const isOpen = open === code;
          return (
            <li key={code} className={`pl-course ${sel ? 'has' : ''}`} style={{ ['--h' as string]: hue(secs[0].title) }}>
              <button className="pl-head" onClick={() => setOpen(isOpen ? null : code)} aria-expanded={isOpen}>
                <i />
                <span><b>{secs[0].title}</b><small>{code} · {secs[0].credits} cr. · {secs.length} secciones{sel ? ` · elegiste ${sel.section}` : ''}</small></span>
                <Icon name="chevron" size={18} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }} />
              </button>
              {isOpen && (
                <ul className="pl-secs">
                  {secs.map((s) => {
                    const cf = sel?.crn === s.crn ? [] : conflictsOf(s);
                    const full = (s.seats ?? 1) <= 0;
                    return (
                      <li key={s.crn}>
                        <button className={`pl-sec ${sel?.crn === s.crn ? 'on' : ''} ${full ? 'full' : ''}`} onClick={() => pick(code, sel?.crn === s.crn ? null : s.crn)}>
                          <b>{s.section} <span className="num">· NRC {s.crn}</span></b>
                          <span>{when(s)}</span>
                          <small>{[s.campus, s.faculty].filter(Boolean).join(' · ') || 'Virtual'}</small>
                          <em className={full ? 'bad' : (s.seats ?? 99) <= 5 ? 'warn' : 'good'}>{s.seats === null ? '' : full ? 'Sin cupos' : `${s.seats} cupos`}</em>
                          {cf.length > 0 && <em className="bad cf">Choca con {cf[0]}</em>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hz-src">Los cupos son los de Mi UAPA al momento de importar. Para inscribirte pega los NRC en «Inscribir asignaturas → Ingresar NRC».</p>
    </div>
  );
}

type AttRow = { term: string; crn: string; title: string; hora?: string; absences: number; pct: number };
type Req = { at: number; empty: boolean; rows: string[][] };
type Summary = { attendance: { at: number; rows: AttRow[] } | null; requests: Req | null };

/** Asistencia por materia del periodo (de Mi UAPA). */
export function AttendanceCard() {
  const sum = useLoad(() => api<Summary>('/uapa/summary'));
  const a = sum.data?.attendance;
  if (!a?.rows.length) return null;
  const term = a.rows[0].term;
  const cur = a.rows.filter((r) => r.term === term);
  const ago = Math.max(1, Math.round((Date.now() / 1000 - a.at) / 3600));
  return (
    <section className="att">
      <h3>Asistencia <small>· {TERMS[term] || term} · hace {ago} h</small></h3>
      <ul>
        {cur.map((r) => (
          <li key={r.crn} style={{ ['--h' as string]: hue(r.title) }}>
            <i />
            <span><b>{r.title}</b><small>{r.absences === 0 ? 'Sin ausencias' : `${r.absences} ausencia${r.absences > 1 ? 's' : ''}`}</small></span>
            <em className={`num ${r.absences === 0 ? 'good' : 'warn'}`}>{r.pct}%</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Estado de tus solicitudes de servicio (constancias, etc.) en Mi UAPA. */
export function RequestsCard() {
  const sum = useLoad(() => api<Summary>('/uapa/summary'));
  const r = sum.data?.requests;
  if (!r) return null;
  return (
    <section className="att">
      <h3>Solicitudes de servicio</h3>
      {r.empty || !r.rows.length ? <p className="pl-none"><Icon name="check" size={16} />No tienes solicitudes pendientes en Mi UAPA.</p> : (
        <ul>
          {r.rows.map((row, i) => (
            <li key={i}><i style={{ ['--h' as string]: 218 }} /><span><b>{row[3] || row[0]}</b><small>{row.slice(1).filter(Boolean).slice(0, 4).join(' · ')}</small></span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
