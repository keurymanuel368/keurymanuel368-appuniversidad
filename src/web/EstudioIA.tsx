// Cuadernos con IA: «Armar mis cuadernos» (recorre el EVA y escribe una hoja larga por tema) y «Pregúntale a tus cuadernos».
import { useRef, useState } from 'react';
import { api } from './api';
import { haptic, toast, useLoad } from './components';
import { Icon } from './icons';

type Estado = { cursos: { course_id: number; course: string; total: number; done: number; error: number }[]; sinEscanear: { id: number; name: string }[] };

export function ArmarCuadernos({ onProgress }: { onProgress: () => void }) {
  const st = useLoad(() => api<Estado>('/estudio/estado'));
  const [msg, setMsg] = useState('');
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const d = st.data;
  const pending = d ? d.cursos.reduce((a, c) => a + c.total - c.done, 0) : 0;
  const total = d ? d.cursos.reduce((a, c) => a + c.total, 0) : 0;
  const done = d ? d.cursos.reduce((a, c) => a + c.done, 0) : 0;
  const errors = d ? d.cursos.reduce((a, c) => a + c.error, 0) : 0;
  const allDone = !!d && !d.sinEscanear.length && total > 0 && pending === 0;

  async function go(retry = false) {
    setRunning(true); stop.current = false; haptic(10);
    try {
      // 1) Recorrer el EVA, una materia por vez
      for (let i = 0; i < 20 && !stop.current; i++) {
        setMsg('Recorriendo tu EVA…');
        const r = await api<{ done?: boolean; course?: string; topics?: number }>('/estudio/escanear', { method: 'POST', body: {} });
        if (r.done) break;
        setMsg(`Leí «${r.course}»: ${r.topics} temas`);
        st.reload();
      }
      // 2) Escribir una hoja por tema
      for (let i = 0; i < 400 && !stop.current; i++) {
        const r = await api<{ idle?: boolean; course?: string; title?: string; ok?: boolean; left?: number }>('/estudio/procesar', { method: 'POST', body: { retry: retry && i === 0 } });
        if (r.idle) break;
        setMsg(`Escribiendo · ${r.course} · ${r.title}${r.left ? ` (faltan ${r.left})` : ''}`);
        st.reload(); onProgress();
      }
      if (!stop.current) toast('Tus cuadernos están listos 📓');
    } catch (e) { toast((e as Error).message, 'err'); }
    setRunning(false); setMsg(''); st.reload(); onProgress();
  }

  return (
    <section className="ea">
      <div className="ea-copy">
        <span className="ea-eyebrow">Con IA</span>
        <h3>Cuadernos de estudio de todas tus materias</h3>
        <p>Rumbo recorre tu EVA y, tema por tema, escribe hojas largas con resumen, conceptos, explicación, ejemplos, errores comunes y práctica, más fichas de repaso. No lee los PDF del EVA, solo los temas, páginas y descripciones.</p>
      </div>
      {d && d.cursos.length > 0 && (
        <ul className="ea-courses">
          {d.cursos.map((c) => (
            <li key={c.course_id}><span>{c.course}</span><small className="num">{c.done}/{c.total}</small><i style={{ ['--p' as string]: `${c.total ? (c.done / c.total) * 100 : 0}%` }} /></li>
          ))}
        </ul>
      )}
      {running && <div className="ea-run" role="status"><span className="spin"><Icon name="sync" size={16} /></span><b>{msg || 'Trabajando…'}</b></div>}
      <div className="ea-actions">
        {!running ? (
          <button className="btn primary" onClick={() => void go(false)} disabled={allDone}>
            <Icon name="spark" size={18} />{allDone ? 'Cuadernos completos' : total ? `Continuar (${pending} temas por escribir)` : 'Armar mis cuadernos'}
          </button>
        ) : <button className="btn line" onClick={() => { stop.current = true; }}>Detener (el resto sigue solo en segundo plano)</button>}
        {errors > 0 && !running && <button className="btn line" onClick={() => void go(true)}>Reintentar {errors} con error</button>}
      </div>
      {done > 0 && <small className="muted">Cada hoja queda en el cuaderno de su materia, con su fecha. Si cierras esta pantalla, Rumbo sigue escribiendo un tema cada 10 minutos.</small>}
    </section>
  );
}

export function PreguntaCuadernos() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<{ respuesta: string; fuentes: { n: number; titulo: string; curso: string | null }[] } | null>(null);
  async function ask() {
    if (q.trim().length < 3) return;
    setBusy(true); haptic(8);
    try { setAns(await api('/cuadernos/ask', { method: 'POST', body: { q } })); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  return (
    <section className="pq">
      <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="pq-bar">
        <Icon name="search" size={18} />
        <input className="pq-input" id="pregunta-cuadernos" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregúntale a tus cuadernos: «¿qué es la inducción matemática?»" aria-label="Pregúntale a tus cuadernos" />
        <button className="btn primary pq-go" type="submit" disabled={busy || q.trim().length < 3}>{busy ? 'Buscando…' : 'Preguntar'}</button>
      </form>
      {ans && (
        <article className="pq-ans">
          <p>{ans.respuesta}</p>
          {ans.fuentes.length > 0 && <ul>{ans.fuentes.map((f) => <li key={f.n}><b>[{f.n}]</b> {f.titulo}{f.curso ? ` · ${f.curso}` : ''}</li>)}</ul>}
          <button className="link-btn" onClick={() => setAns(null)}>Cerrar</button>
        </article>
      )}
    </section>
  );
}
