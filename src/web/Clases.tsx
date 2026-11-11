// Estudio → Clases: escuchar la clase en vivo (PC), ver las preguntas que te hacen con su respuesta lista,
// y después tener la clase explicada, clasificada por materia, con tarjetas y preguntas de examen.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { agoLabel, api, type Course } from './api';
import { Empty, Skeleton, haptic, toast, useLoad } from './components';
import { Icon } from './icons';
import { askNow, clearFinished, dismissAlert, explainNow, getLive, retryFailed, runProcess, startLive, stopLive, subscribeLive, type Explain, type Qa } from './clasesLive';

type Item = { id: number; title: string; course: string | null; started_at: number; ended_at: number | null; status: string; chunks: number; words: number; questions: number };
type Notes = {
  resumen: string; temas: string[]; explicacion: { titulo: string; texto: string }[]; conceptos: { termino: string; definicion: string }[];
  pendientes: string[]; tarjetas: { front: string; back: string }[]; examen: { pregunta: string; respuesta: string }[];
};
type Detail = { live?: Explain[]; id: number; title: string; course: string | null; started_at: number; ended_at: number | null; status: string; chunks: number; transcript: string; qa: Qa[]; notes: Notes | null; error: string | null };

const useLive = () => useSyncExternalStore(subscribeLive, getLive);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const dateLabel = (sec: number) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(sec * 1000));

function Rich({ t }: { t: string }) {
  return <>{t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}
const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { toast('No se pudo copiar', 'err'); } };

export function Clases() {
  const live = useLive();
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => { if (live.finishedId) { setOpenId(live.finishedId); clearFinished(); } }, [live.finishedId]);
  if (live.phase !== 'idle') return <LivePanel />;
  if (openId) return <ClaseDetalle id={openId} onBack={() => setOpenId(null)} />;
  return <Inicio onOpen={setOpenId} />;
}

// ---------- Pantalla principal: empezar y lista clasificada ----------
function Inicio({ onOpen }: { onOpen: (id: number) => void }) {
  const list = useLoad(() => api<Item[]>('/clases'));
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => { if (armed === null) return; const t = setTimeout(() => setArmed(null), 3500); return () => clearTimeout(t); }, [armed]);
  async function del(id: number) {
    if (armed !== id) { setArmed(id); haptic(6); return; }
    try { await api(`/clases/${id}`, { method: 'DELETE' }); toast('Clase eliminada'); setArmed(null); list.reload(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  const now = useLoad(() => api<{ title: string; course: string }>('/clases/now').catch(() => ({ title: '', course: '' })));
  const courses = useLoad(() => api<Course[]>('/courses'));
  const [sel, setSel] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useLive();
  const key = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // La materia que toca ahora según tu horario queda elegida sola.
  useEffect(() => {
    if (sel || !courses.data || !now.data?.title) return;
    const k = key(now.data.title);
    const hit = courses.data.find((c) => key(c.name) === k || key(c.name).includes(k) || k.includes(key(c.name)));
    if (hit) setSel(hit.name);
  }, [courses.data, now.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    const name = sel === '__otra' ? custom.trim() : sel;
    if (!name) { toast('Elige la asignatura de la clase', 'err'); return; }
    setBusy(true); haptic(10);
    try { await startLive(name, name); }
    catch (e) { const m = (e as Error).message; if (!/denied|Permission|cancel/i.test(m)) toast(m, 'err'); }
    setBusy(false);
  }
  const groups = new Map<string, Item[]>();
  for (const it of list.data || []) groups.set(it.course || 'Sin asignatura', [...(groups.get(it.course || 'Sin asignatura') || []), it]);

  return (
    <div className="cl">
      <section className="cl-start">
        <div>
          <span className="cl-eyebrow">Clase en vivo</span>
          <h2>Que Rumbo escuche tu clase</h2>
          <p>Entra a tu reunión de Meet o Teams y, aquí, pulsa Empezar. Elige la pestaña de la reunión y marca <b>«Compartir audio de la pestaña»</b>. Rumbo transcribe cada 30 segundos y no guarda el audio.</p>
        </div>
        <label className="cl-field"><span>Asignatura</span>
          <select className="input cl-select" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Elige la asignatura…</option>
            {(courses.data || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__otra">Otra clase…</option>
          </select>
          {sel === '__otra' && <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nombre de la clase" />}
        </label>
        <button className="btn primary cl-go" onClick={start} disabled={busy}><Icon name="spark" size={19} />{busy ? 'Abriendo…' : 'Empezar a escuchar'}</button>
        <small className="cl-note">Solo funciona en Chrome desde una PC. Pide permiso al profesor antes de transcribir la clase.</small>
        {live.err && <small className="cl-err">{live.err}</small>}
      </section>

      {!list.data ? <Skeleton rows={2} /> : !list.data.length
        ? <div className="card"><Empty icon="book" title="Aún no hay clases" text="Cuando termines tu primera clase en vivo, aquí queda explicada y clasificada por materia." /></div>
        : [...groups.entries()].map(([course, items]) => (
          <section className="cl-group" key={course}>
            <h3>{course} <span className="pill blue num">{items.length}</span></h3>
            <div className="cl-list">
              {items.map((it) => (
                <div key={it.id} className="cl-row">
                  <button className="cl-item" onClick={() => onOpen(it.id)}>
                    <b>{it.title}</b>
                    <span className="cl-sub">{dateLabel(it.started_at)} · ≈ {it.words} palabras{it.questions ? ` · ${it.questions} pregunta${it.questions > 1 ? 's' : ''}` : ''}</span>
                    <span className={`cl-state ${it.status}`}>{it.status === 'ready' ? 'Explicada' : it.status === 'live' ? 'En vivo' : 'Por explicar'}</span>
                  </button>
                  <button className={`cl-del-btn ${armed === it.id ? 'armed' : ''}`} onClick={() => void del(it.id)} aria-label={armed === it.id ? 'Confirmar: eliminar clase' : 'Eliminar clase'}>
                    {armed === it.id ? '¿Eliminar?' : <Icon name="trash" size={17} />}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

// ---------- En vivo ----------
async function saveExplain(e: Explain, course: string) {
  try { await api('/notes', { method: 'POST', body: { course: course || '', title: e.titulo, body: [e.texto, e.ejemplo ? `\nEjemplo: ${e.ejemplo}` : ''].join('\n').replace(/\*\*/g, '') } }); toast('Guardado en tu cuaderno ✅'); }
  catch (er) { toast((er as Error).message, 'err'); }
}

function ExplainCard({ e, course }: { e: Explain; course?: string }) {
  return (
    <article className="cl-ex">
      <header><b>{e.titulo}</b><small className="num">{mmss(e.at)}</small></header>
      <p><Rich t={e.texto} /></p>
      {e.ejemplo && <div className="cl-ex-ej"><small>Ejemplo</small><p><Rich t={e.ejemplo} /></p></div>}
      {course !== undefined && <button className="link-btn cl-ex-save" onClick={() => void saveExplain(e, course)}>Guardar en el cuaderno</button>}
    </article>
  );
}

function LivePanel() {
  const s = useLive();
  const [, tick] = useState(0);
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [s.lines.length]);
  const secs = s.startedAt ? (Date.now() - s.startedAt) / 1000 : 0;
  const [main, ...older] = s.alerts;

  if (s.phase === 'ending') return (
    <div className="cl"><section className="cl-start">
      <span className="cl-eyebrow">Terminando</span>
      <h2>Armando tu explicación…</h2>
      <p>{s.progress && s.progress.total ? `Resumiendo la clase por partes (${s.progress.done} de ${s.progress.total}).` : 'Enviando lo último y preparando el resumen, la explicación detallada, las tarjetas y las preguntas de examen.'}</p>
      <div className="cl-bar"><i style={{ width: s.progress && s.progress.total ? `${(s.progress.done / s.progress.total) * 100}%` : '35%' }} /></div>
      {s.err && <small className="cl-err">{s.err}</small>}
    </section></div>
  );

  return (
    <div className="cl cl-wide">
      <section className="cl-live">
        <div className="cl-live-top">
          <span className={`cl-dot ${s.speaking ? 'on' : ''}`} aria-hidden="true" />
          <div><b>{s.title}</b><small className="num">{s.speaking ? 'Escuchando voz' : 'En silencio'} · {mmss(secs)}</small></div>
          <div className="cl-stats">
            <span><b className="num">{s.sent}</b> enviados</span><span><b className="num">{s.silent}</b> en silencio</span><span><b className="num">{s.queued}</b> en cola</span>
            {s.failed > 0 && <button className="cl-retry" onClick={retryFailed}>{s.failed} fallaron · reintentar</button>}
          </div>
          <button className="btn line cl-sm" onClick={() => { haptic(8); void stopLive(); }}>Terminar clase</button>
        </div>
        {s.err && <small className="cl-warn">Reintentando: {s.err}</small>}
      </section>

      <div className="cl-cols">
        <div className="cl-main">
          <section className="cl-caption" aria-live="polite">
            <small>{s.caption ? 'Subtítulos al instante' : 'Esperando que alguien hable'}</small>
            <p>{s.caption || 'Cuando alguien hable, aquí aparece el texto al momento.'}</p>
          </section>
          <section className="cl-feed-wrap">
            <h3>Transcripción confirmada</h3>
            <div className="cl-feed live" ref={feed}>
              {s.lines.length ? s.lines.map((l, i) => <p key={i} className={i === s.lines.length - 1 ? 'last' : ''}><span className="num">{mmss(l.at)}</span> {l.text}</p>)
                : <p className="muted">El texto exacto aparece unos segundos después de cada frase.</p>}
              {s.speaking && <p className="cl-typing"><span /><span /><span /></p>}
            </div>
          </section>
        </div>

        <aside className="cl-side">
          {main ? <Answer qa={main} big onClose={() => dismissAlert(main.id)} /> : s.thinking ? (
            <div className="cl-thinking" role="status"><span /><span /><span /><b>Pensando la respuesta…</b></div>
          ) : (
            <div className="cl-quiet"><Icon name="check" size={18} /><span>{s.notice || 'Todo tranquilo. Si te preguntan algo, aparece aquí con la respuesta lista.'}</span></div>
          )}
          {main && s.thinking && <div className="cl-thinking" role="status"><span /><span /><span /><b>Revisando otra pregunta…</b></div>}
          <button className="btn primary cl-ask" onClick={() => { haptic(10); askNow(); }} disabled={s.asking}>
            <Icon name="spark" size={19} />{s.asking ? 'Revisando lo último…' : '¿Qué me preguntaron?'}
          </button>
          {older.length > 0 && <div className="cl-older"><h3>Anteriores</h3>{older.map((q) => <Answer key={q.id} qa={q} onClose={() => dismissAlert(q.id)} />)}</div>}

          <section className="cl-exs">
            <div className="cl-exs-head"><h3>Explicación en vivo</h3>
              <button className="btn line cl-sm" onClick={() => { haptic(8); explainNow(); }} disabled={s.explaining}>{s.explaining ? 'Explicando…' : 'Explícame lo último'}</button></div>
            {s.explaining && <div className="cl-thinking" role="status"><span /><span /><span /><b>Preparando la explicación…</b></div>}
            {s.explains.length ? s.explains.map((e) => <ExplainCard key={e.id} e={e} course={s.course} />)
              : !s.explaining && <p className="muted small">Cada minuto más o menos, Rumbo te explica lo que se acaba de decir: de qué se habla, en palabras sencillas y con un ejemplo.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Answer({ qa, big, onClose }: { qa: Qa; big?: boolean; onClose: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <article className={`cl-qa ${qa.dirigida} ${big ? 'big' : ''}`}>
      <header><span className="cl-qa-tag">{qa.dirigida === 'tu' ? 'Te preguntaron a ti' : 'Pregunta para la clase'}</span><small className="num">{mmss(qa.at)}</small>
        <button className="icon-round" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button></header>
      <p className="cl-q">{qa.pregunta}</p>
      <div className="cl-say"><small>Di esto</small><p>{qa.corta}</p></div>
      {qa.tip && <small className="cl-tip">{qa.tip}</small>}
      {more && <div className="cl-say soft"><small>Si piden más</small><p>{qa.completa}</p></div>}
      <div className="cl-qa-actions">
        <button className="btn line cl-sm" onClick={() => void copy(qa.corta)}>Copiar</button>
        <button className="btn line cl-sm" onClick={() => setMore((v) => !v)}>{more ? 'Ocultar' : 'Ver más completa'}</button>
      </div>
    </article>
  );
}

// ---------- Detalle de una clase ----------
function ClaseDetalle({ id, onBack }: { id: number; onBack: () => void }) {
  const d = useLoad(() => api<Detail>(`/clases/${id}`), [id]);
  const [work, setWork] = useState(false);
  const [showText, setShowText] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const [reveal, setReveal] = useState<Set<number>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const c = d.data;

  async function finish() {
    setWork(true);
    try { if (c?.status === 'live') await api(`/clases/${id}/end`, { method: 'POST' }); const r = await runProcess(id); if (r === 'error') toast('No se pudo terminar. Inténtalo otra vez.', 'err'); d.reload(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setWork(false);
  }
  async function saveCards() {
    if (!c?.notes) return;
    try { await api('/cards', { method: 'POST', body: { course: c.course || c.title, cards: c.notes.tarjetas } }); toast(`${c.notes.tarjetas.length} fichas guardadas en tu cuaderno ✅`); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function saveNote() {
    if (!c?.notes) return;
    const body = [c.notes.resumen, '', ...c.notes.explicacion.flatMap((e) => [`## ${e.titulo}`, e.texto, '']), 'Conceptos clave', ...c.notes.conceptos.map((x) => `- ${x.termino}: ${x.definicion}`)].join('\n').replace(/\*\*/g, '');
    try { await api('/notes', { method: 'POST', body: { course: c.course || c.title, title: `${c.title} · ${dateLabel(c.started_at)}`, body } }); toast('Guardado en tu cuaderno ✅'); }
    catch (e) { toast((e as Error).message, 'err'); }
  }
  async function remove() {
    try { await api(`/clases/${id}`, { method: 'DELETE' }); toast('Clase eliminada'); onBack(); } catch (e) { toast((e as Error).message, 'err'); }
  }

  if (!c) return <Skeleton rows={3} />;
  const n = c.notes;
  const Sec = ({ title, children, count }: { title: string; children: ReactNode; count?: number }) => <section className="cl-sec"><h3>{title}{count !== undefined && <span className="pill blue num">{count}</span>}</h3>{children}</section>;
  return (
    <div className="cl cl-wide cl-detail">
      <div className="cl-head">
        <button className="link-btn" onClick={onBack}>← Clases</button>
        <h2>{c.title}</h2>
        <span className="cl-sub">{c.course || 'Sin asignatura'} · {dateLabel(c.started_at)} · {agoLabel(c.started_at)}</span>
      </div>

      {!n && (
        <div className="card cl-pending">
          <b>{c.status === 'ready' ? 'Sin explicación' : 'Esta clase aún no está explicada'}</b>
          <p className="muted small">{c.error || `Tiene ≈ ${Math.round(c.transcript.length / 6)} palabras transcritas.`}</p>
          <button className="btn primary" onClick={finish} disabled={work}>{work ? 'Explicando…' : c.status === 'live' ? 'Terminar y explicar' : 'Explicar ahora'}</button>
        </div>
      )}

      {n && <>
        <Sec title="Resumen"><div className="card"><p className="cl-p"><Rich t={n.resumen} /></p>{n.temas.length > 0 && <div className="cl-tags">{n.temas.map((t, i) => <span key={i} className="pill blue">{t}</span>)}</div>}</div></Sec>
        <div className="cl-actions">
          <button className="btn primary" onClick={saveCards}>Guardar {n.tarjetas.length} tarjetas</button>
          <button className="btn line" onClick={saveNote}>Guardar en el cuaderno</button>
        </div>

        <Sec title="Explicación detallada">
          <div className="cl-acc">{n.explicacion.map((e, i) => (
            <div key={i} className={`cl-acc-i ${open === i ? 'on' : ''}`}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><b>{e.titulo}</b><Icon name="chevron" size={16} style={{ transform: open === i ? 'rotate(90deg)' : undefined }} /></button>
              {open === i && <div className="cl-acc-b">{e.texto.split(/\n{2,}/).map((p, j) => <p key={j}><Rich t={p} /></p>)}</div>}
            </div>))}
          </div>
        </Sec>

        {n.conceptos.length > 0 && <Sec title="Conceptos clave" count={n.conceptos.length}>
          <div className="cl-concepts">{n.conceptos.map((x, i) => <div key={i} className="cl-concept"><b>{x.termino}</b><span>{x.definicion}</span></div>)}</div></Sec>}

        {n.pendientes.length > 0 && <Sec title="Pendientes que se mencionaron"><div className="card"><ul className="cl-ul">{n.pendientes.map((p, i) => <li key={i}>{p}</li>)}</ul></div></Sec>}

        {n.examen.length > 0 && <Sec title="Preguntas de examen" count={n.examen.length}>
          <div className="cl-exam">{n.examen.map((q, i) => (
            <div key={i} className="cl-q-i"><b>{i + 1}. {q.pregunta}</b>
              {reveal.has(i) ? <p><Rich t={q.respuesta} /></p> : <button className="link-btn" onClick={() => setReveal(new Set([...reveal, i]))}>Ver respuesta</button>}</div>))}
          </div></Sec>}
      </>}

      {(c.live || []).length > 0 && <Sec title="Explicaciones durante la clase" count={(c.live || []).length}><div className="cl-older">{[...(c.live || [])].reverse().map((e) => <ExplainCard key={e.id} e={e} course={c.course || c.title} />)}</div></Sec>}

      {c.qa.length > 0 && <Sec title="Preguntas que te hicieron" count={c.qa.length}><div className="cl-older">{c.qa.map((q) => <Answer key={q.id} qa={q} onClose={() => {}} />)}</div></Sec>}

      <section className="cl-sec">
        <button className="link-btn" onClick={() => setShowText((v) => !v)}>{showText ? 'Ocultar transcripción' : 'Ver transcripción completa'}</button>
        {showText && <><div className="cl-feed full">{c.transcript.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div><button className="btn line cl-sm" onClick={() => void copy(c.transcript)}>Copiar transcripción</button></>}
      </section>
      <button className={`link-btn cl-del ${confirmDel ? 'armed' : ''}`} onClick={() => { if (!confirmDel) { setConfirmDel(true); haptic(6); setTimeout(() => setConfirmDel(false), 3500); } else void remove(); }}>{confirmDel ? '¿Seguro? Toca otra vez para eliminar' : 'Eliminar esta clase'}</button>
    </div>
  );
}
