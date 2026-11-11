// Modo estudio con IA para una tarea: plan paso a paso, tarjetas de repaso y explicación (para leer o escuchar).
import { useEffect, useState } from 'react';
import { api, type Task } from './api';
import { Modal, Segmented, haptic, toast } from './components';
import { Icon } from './icons';
import { Mascot } from './Mascot';
import { speakable } from './speech';
import { utterance } from './VoiceCall';

type Mode = 'plan' | 'tarjetas' | 'explica' | 'foro';
type Result =
  | { mode: 'plan'; steps: { title: string; detail: string; minutes: number }[]; tip: string }
  | { mode: 'tarjetas'; cards: { q: string; a: string }[] }
  | { mode: 'explica'; title: string; text: string; keys: string[] }
  | { mode: 'foro'; aporte: string; respuestas: string[]; tips: string };

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

export function StudyModal({ task, onClose, initial = 'plan' }: { task: Task; onClose: () => void; initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const isForum = !!task.moodle_key?.startsWith('forum:');
  const [data, setData] = useState<Partial<Record<Mode, Result>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(m: Mode, fresh = false) {
    setBusy(true); setError('');
    try {
      const r = await api<Result>(`/study/${task.id}`, { method: 'POST', body: { mode: m, fresh } });
      setData((d) => ({ ...d, [m]: r }));
      if (fresh) toast('Listo, te lo armé de nuevo ✨');
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  useEffect(() => { if (!data[mode] && !busy) void load(mode); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const r = data[mode];
  /** Guarda lo que armó la IA en el cuaderno de la materia (la hoja queda con su fecha). */
  async function saveBook() {
    if (!r) return;
    const course = task.course_name || '';
    haptic(10);
    try {
      if (r.mode === 'tarjetas') {
        await api('/cards', { method: 'POST', body: { course, cards: r.cards.map((c) => ({ front: c.q, back: c.a })) } });
        toast(`${r.cards.length} fichas guardadas en tu cuaderno ✅`);
        return;
      }
      let title = '', body = '';
      if (r.mode === 'explica') { title = r.title || task.title; body = [r.text, '', ...r.keys.map((k) => `- ${k}`)].join('\n'); }
      else if (r.mode === 'plan') { title = `Plan: ${task.title}`; body = [...r.steps.flatMap((s, i) => [`## ${i + 1}. ${s.title} (${s.minutes} min)`, s.detail, '']), r.tip ? `Tip: ${r.tip}` : ''].join('\n'); }
      else { title = `Borrador: ${task.title}`; body = [r.aporte, '', '## Ideas para responder', ...r.respuestas.map((x) => `- ${x}`)].join('\n'); }
      await api('/notes', { method: 'POST', body: { course, title, body } });
      toast('Guardado en tu cuaderno ✅');
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <Modal title={`Estudiar: ${task.title}`} onClose={onClose}>
      <Segmented label="Tipo de ayuda" value={mode} onChange={(m) => { window.speechSynthesis?.cancel(); setMode(m); }}
        options={[...(isForum ? [{ id: 'foro' as Mode, label: 'Borrador' }] : []), { id: 'plan', label: 'Plan' }, { id: 'tarjetas', label: 'Practicar' }, { id: 'explica', label: 'Explícame' }]} />
      <div className="study-body" aria-live="polite" aria-busy={busy}>
        {busy && !r && (
          <div className="study-loading">
            <Mascot mood="talk" size={70} />
            <b>{mode === 'foro' ? 'Escribiendo tu borrador…' : mode === 'plan' ? 'Armando tu plan…' : mode === 'tarjetas' ? 'Preparando preguntas…' : 'Pensando cómo explicártelo…'}</b>
            <span>Leo las instrucciones de la tarea. Toma unos segundos.</span>
          </div>
        )}
        {error && !r && (
          <div className="study-loading">
            <Mascot mood="atento" size={64} />
            <b>No pude prepararlo</b><span>{error}</span>
            <button className="btn primary" onClick={() => load(mode)}>Intentar otra vez</button>
          </div>
        )}
        {r?.mode === 'plan' && <PlanView taskId={task.id} r={r} />}
        {r?.mode === 'tarjetas' && <Cards r={r} />}
        {r?.mode === 'explica' && <Explain r={r} />}
        {r?.mode === 'foro' && <ForumDraft r={r} />}
      </div>
      {r && (
        <button className="btn primary block" onClick={() => void saveBook()}><Icon name="book" size={18} />Guardar en mi cuaderno</button>
      )}
      {r && (
        <button className="btn line block" onClick={() => { haptic(6); void load(mode, true); }} disabled={busy}>
          <Icon name="refresh" size={18} />{busy ? 'Generando…' : 'Generar otra versión'}
        </button>
      )}
      <p className="small muted center">Lo prepara la IA con las instrucciones del EVA: úsalo como guía y revisa siempre lo que pide tu facilitador.</p>
    </Modal>
  );
}

function PlanView({ taskId, r }: { taskId: number; r: Extract<Result, { mode: 'plan' }> }) {
  const key = `rumbo-plan-${taskId}`;
  const [done, setDone] = useState<number[]>(() => { try { return JSON.parse(store.get(key) || '[]'); } catch { return []; } });
  const toggle = (i: number) => {
    haptic(8);
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next); store.set(key, JSON.stringify(next));
    if (next.length === r.steps.length) toast('¡Plan completado! 🎉 Ahora entrégala.');
  };
  const total = r.steps.reduce((t, s) => t + s.minutes, 0);
  return (
    <>
      <div className="plan-head"><b>{r.steps.length} pasos · {total >= 60 ? `${Math.floor(total / 60)} h ${total % 60 ? `${total % 60} min` : ''}` : `${total} min`}</b><span>{done.length}/{r.steps.length} listos</span></div>
      <div className="plan-bar"><div style={{ width: `${(done.length / r.steps.length) * 100}%` }} /></div>
      <ol className="plan-steps">
        {r.steps.map((s, i) => (
          <li key={i} className={done.includes(i) ? 'done' : ''}>
            <button className={`check ${done.includes(i) ? 'on' : ''}`} onClick={() => toggle(i)} aria-label={done.includes(i) ? `Desmarcar paso ${i + 1}` : `Marcar paso ${i + 1} como hecho`}><Icon name="check" size={14} style={{ strokeWidth: 3.2 }} /></button>
            <div><b>{s.title}</b><p>{s.detail}</p><small><Icon name="clock" size={12} />{s.minutes} min</small></div>
          </li>
        ))}
      </ol>
      {r.tip && <p className="hint">💡 {r.tip}</p>}
    </>
  );
}

function Cards({ r }: { r: Extract<Result, { mode: 'tarjetas' }> }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState(0);
  const c = r.cards[i];
  const next = (ok: boolean) => {
    haptic(ok ? 12 : 6);
    if (ok) setKnown((k) => k + 1);
    setFlip(false);
    if (i + 1 < r.cards.length) setI(i + 1);
    else { toast(`Repaso terminado: te sabías ${known + (ok ? 1 : 0)} de ${r.cards.length} 💪`); setI(0); setKnown(0); }
  };
  return (
    <div className="cards">
      <span className="cards-count num">Tarjeta {i + 1} de {r.cards.length}</span>
      <button className={`flashcard ${flip ? 'flipped' : ''}`} onClick={() => { haptic(6); setFlip((f) => !f); }} aria-label={flip ? 'Ver la pregunta' : 'Ver la respuesta'}>
        <span className="fc-face fc-front"><small>PREGUNTA</small><b>{c.q}</b><em>Toca para ver la respuesta</em></span>
        <span className="fc-face fc-back"><small>RESPUESTA</small><b>{c.a}</b></span>
      </button>
      {flip ? (
        <div className="cards-actions">
          <button className="btn line grow" onClick={() => next(false)}>Repasar otra vez</button>
          <button className="btn primary grow" onClick={() => next(true)}><Icon name="check" size={18} />Me la sé</button>
        </div>
      ) : <p className="small muted center">Piensa la respuesta antes de voltearla 😉</p>}
    </div>
  );
}

/** Borrador del foro: tu aporte listo para copiar y ajustar, e ideas para responder a compañeros. */
function ForumDraft({ r }: { r: Extract<Result, { mode: 'foro' }> }) {
  async function copy() {
    haptic(8);
    try { await navigator.clipboard.writeText(r.aporte); toast('Copiado. Pégalo en el foro y ponle tu toque.'); }
    catch { toast('No pude copiar: mantén presionado el texto para seleccionarlo', 'err'); }
  }
  return (
    <div className="explain">
      <div className="explain-head"><h3>Tu aporte</h3><button className="btn soft sm" onClick={copy}><Icon name="upload" size={16} />Copiar</button></div>
      <div className="draft-text">{r.aporte.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
      {r.respuestas.length > 0 && (
        <div className="explain-keys"><span className="label">Ideas para responder a compañeros</span><ul>{r.respuestas.map((k, i) => <li key={i}>{k}</li>)}</ul></div>
      )}
      {r.tips && <p className="hint">💡 {r.tips}</p>}
    </div>
  );
}

function Explain({ r }: { r: Extract<Result, { mode: 'explica' }> }) {
  const [speaking, setSpeaking] = useState(false);
  function listen() {
    const synth = window.speechSynthesis;
    if (!synth) { toast('Tu teléfono no tiene voz disponible', 'err'); return; }
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    haptic(8);
    const u = utterance(speakable(`${r.title}. ${r.text}`));
    u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    synth.cancel(); synth.speak(u); setSpeaking(true);
  }
  return (
    <div className="explain">
      <div className="explain-head"><h3>{r.title}</h3>
        <button className={`btn soft sm ${speaking ? 'on' : ''}`} onClick={listen} aria-pressed={speaking}><Icon name={speaking ? 'stop' : 'volume'} size={16} />{speaking ? 'Detener' : 'Escuchar'}</button>
      </div>
      {r.text.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
      {r.keys.length > 0 && (
        <div className="explain-keys"><span className="label">Ideas clave</span><ul>{r.keys.map((k, i) => <li key={i}>{k}</li>)}</ul></div>
      )}
    </div>
  );
}
