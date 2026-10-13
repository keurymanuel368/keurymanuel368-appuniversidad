// Notas: gráfica de tu promedio en el tiempo, comentarios de los facilitadores (con resumen de IA) y récord para imprimir.
import { useState } from 'react';
import { api, dateLabel } from './api';
import { Modal, fmtGrade, haptic, toast, useLoad } from './components';
import { Icon } from './icons';

/** Línea de tu promedio general día a día (se guarda una vez al día). */
export function AverageChart() {
  const h = useLoad(() => api<{ d: string; a: number }[]>('/grades/history'));
  const pts = h.data || [];
  if (pts.length < 2) return pts.length === 1 ? <p className="small muted chart-note">📈 Tu gráfica empieza hoy ({fmtGrade(pts[0].a)}). Cada día se agrega un punto.</p> : null;
  const W = 320, H = 96, P = 8;
  const vals = pts.map((p) => p.a);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 2)), hi = Math.min(100, Math.ceil(Math.max(...vals) + 2));
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.a).toFixed(1)}`).join(' ');
  const first = pts[0].a, last = pts[pts.length - 1].a, diff = Math.round((last - first) * 10) / 10;
  return (
    <div className="avg-chart">
      <div className="ac-head"><span className="label"><Icon name="trend" size={14} />Tu promedio en el tiempo</span>
        <span className={`num ac-diff ${diff >= 0 ? 'up' : 'down'}`}>{diff >= 0 ? '▲ +' : '▼ '}{fmtGrade(diff)} desde el {dateLabel(Date.parse(pts[0].d + 'T12:00:00Z') / 1000)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Promedio de ${fmtGrade(first)} a ${fmtGrade(last)}`}>
        <path d={`${line} L${x(pts.length - 1)},${H - P} L${x(0)},${H - P} Z`} className="ac-area" />
        <path d={line} className="ac-line" fill="none" />
        <circle cx={x(pts.length - 1)} cy={y(last)} r={4} className="ac-dot" />
      </svg>
      <div className="ac-scale num"><span>{lo}</span><span>{fmtGrade(last)} hoy</span><span>{hi}</span></div>
    </div>
  );
}

type Note = { id: number; item_name: string; grade: number | null; grade_max: number; feedback: string; course_name: string; course_color: string; task_id: number | null };
type Summary = { fortalezas: string[]; mejorar: string[]; consejo: string; at: number; count: number };

/** Todo lo que te comentaron los facilitadores, con un resumen de la IA: qué haces bien y qué mejorar. */
export function FeedbackNotes() {
  const q = useLoad(() => api<{ items: Note[]; summary: Summary | null }>('/feedback-notes'));
  const [open, setOpen] = useState(false);
  const [sum, setSum] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const items = q.data?.items || [];
  if (!items.length) return null;
  const summary = sum || q.data?.summary || null;
  async function summarize() {
    setBusy(true);
    try { setSum(await api<Summary>('/feedback-notes/summary', { method: 'POST' })); haptic(10); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  return (
    <div className="section">
      <div className="section-head"><h3>Lo que te dicen tus facilitadores</h3><span className="pill gray num">{items.length}</span></div>
      <div className="card fb-notes">
        {summary ? (
          <div className="fb-sum">
            <div><span className="label good-l">✅ Lo que haces bien</span><ul>{summary.fortalezas.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><span className="label warn-l">🎯 Para mejorar</span><ul>{summary.mejorar.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            {summary.consejo && <p className="hint">💡 {summary.consejo}</p>}
            <button className="link-btn" onClick={summarize} disabled={busy}><Icon name="refresh" size={15} />{busy ? 'Resumiendo…' : 'Actualizar el resumen'}</button>
          </div>
        ) : (
          <button className="btn study-btn block" onClick={summarize} disabled={busy}><Icon name="spark" size={18} /><span className="tb-txt"><b>{busy ? 'Leyendo tus comentarios…' : 'Resumir con IA'}</b><small>qué haces bien y qué mejorar, según {items.length} comentario{items.length === 1 ? '' : 's'}</small></span></button>
        )}
        <button className="link-btn" onClick={() => setOpen((v) => !v)}>{open ? 'Ocultar comentarios' : 'Ver todos los comentarios'}<Icon name="chevron" size={15} style={{ transform: open ? 'rotate(90deg)' : undefined }} /></button>
        {open && (
          <div className="fb-list">
            {items.map((n) => (
              <button key={n.id} className="fb-item" onClick={() => { if (n.task_id) location.hash = `tareas/${n.task_id}`; }} disabled={!n.task_id}>
                <span className="fb-top"><i className="dot" style={{ background: n.course_color }} /><b>{n.item_name}</b>{n.grade !== null && <span className="num">{fmtGrade(n.grade)}/{fmtGrade(n.grade_max)}</span>}</span>
                <span className="fb-text">{n.feedback}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Rec = {
  student: string; matricula: string; career: string; generated: number;
  current: { code: string | null; name: string; average: number | null; graded: number; total: number }[];
  past: { code: string | null; name: string; average: number | null }[];
  pensum: { term: number; code: string | null; name: string; credits: number; status: string; grade: number | null }[];
};

/** Récord de notas listo para imprimir o guardar en PDF (menú del teléfono → Imprimir → Guardar como PDF). */
export function RecordModal({ onClose }: { onClose: () => void }) {
  const r = useLoad(() => api<Rec>('/record'));
  const d = r.data;
  const approved = (d?.pensum || []).filter((p) => p.status === 'aprobada');
  const credits = approved.reduce((a, p) => a + (p.credits || 0), 0);
  const totalCredits = (d?.pensum || []).reduce((a, p) => a + (p.credits || 0), 0);
  return (
    <Modal title="Récord de notas" onClose={onClose}>
      {!d ? <div className="sk" style={{ height: 300 }} /> : (
        <div className="record" id="record-print">
          <header className="rec-head">
            <b>Récord de notas · UAPA</b>
            <span>{d.student}{d.matricula ? ` · Matrícula ${d.matricula}` : ''}</span>
            {d.career && <span>{d.career}</span>}
            <small>Generado por Rumbo el {dateLabel(d.generated)} · no es un documento oficial de la UAPA</small>
          </header>
          {d.current.length > 0 && (<>
            <h4>Trimestre actual (en curso)</h4>
            <table><thead><tr><th>Clave</th><th>Asignatura</th><th className="num">Promedio</th><th className="num">Calificadas</th></tr></thead>
              <tbody>{d.current.map((c, i) => <tr key={i}><td>{c.code || '—'}</td><td>{c.name}</td><td className="num">{c.average ?? '—'}</td><td className="num">{c.graded}/{c.total}</td></tr>)}</tbody></table>
          </>)}
          {d.past.length > 0 && (<>
            <h4>Trimestres anteriores</h4>
            <table><thead><tr><th>Clave</th><th>Asignatura</th><th className="num">Promedio</th></tr></thead>
              <tbody>{d.past.map((c, i) => <tr key={i}><td>{c.code || '—'}</td><td>{c.name}</td><td className="num">{c.average ?? '—'}</td></tr>)}</tbody></table>
          </>)}
          {approved.length > 0 && (<>
            <h4>Pensum aprobado · {credits} de {totalCredits} créditos</h4>
            <table><thead><tr><th>Trim.</th><th>Clave</th><th>Asignatura</th><th className="num">Cr.</th><th className="num">Nota</th></tr></thead>
              <tbody>{approved.map((p, i) => <tr key={i}><td className="num">{p.term}</td><td>{p.code || '—'}</td><td>{p.name}</td><td className="num">{p.credits}</td><td className="num">{p.grade ?? '—'}</td></tr>)}</tbody></table>
          </>)}
        </div>
      )}
      <button className="btn primary lg block no-print" onClick={() => { haptic(8); document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }} disabled={!d}>
        <Icon name="download" size={18} />Guardar en PDF o imprimir
      </button>
      <p className="small muted center no-print">En el teléfono: elige «Guardar como PDF» como impresora.</p>
    </Modal>
  );
}
