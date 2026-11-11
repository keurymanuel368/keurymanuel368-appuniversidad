// «Hacer con IA»: botón en cada tarea (y en Semana eficiente) + vista del trabajo con descarga en Word.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Modal, haptic, toast } from './components';
import { Icon } from './icons';
import type { Profile, Work } from './trabajo';

type Info = { status: 'none' | 'pending' | 'ready' | 'error'; work?: Work; profile?: Profile; error?: string };

/** Estado del trabajo de una tarea; mientras se está haciendo, pregunta cada 4 s. */
export function useWork(taskId: number) {
  const [info, setInfo] = useState<Info>({ status: 'none' });
  const timer = useRef<number>(0);
  const load = useCallback(async () => {
    try { const r = await api<Info>(`/tasks/${taskId}/work`); setInfo(r); return r; } catch { return null; }
  }, [taskId]);
  useEffect(() => { void load(); return () => window.clearTimeout(timer.current); }, [load]);
  useEffect(() => {
    if (info.status !== 'pending') return;
    timer.current = window.setTimeout(async () => {
      const r = await load();
      if (r?.status === 'ready') toast('📝 ¡Tu trabajo está listo!');
      if (r?.status === 'error') toast(r.error || 'No se pudo hacer el trabajo', 'err');
    }, 4000);
    return () => window.clearTimeout(timer.current);
  }, [info, load]);
  const start = useCallback(async () => {
    haptic(10);
    try {
      await api(`/tasks/${taskId}/work`, { method: 'POST' });
      setInfo({ status: 'pending' });
      toast('Listo, la IA está en eso. Te aviso cuando termine ✨');
    } catch (e) { toast((e as Error).message, 'err'); }
  }, [taskId]);
  return { info, start, reload: load };
}

/** Botón grande para la ficha de la tarea. */
export function WorkButton({ taskId, title }: { taskId: number; title: string }) {
  const { info, start } = useWork(taskId);
  const [open, setOpen] = useState(false);
  const pending = info.status === 'pending';
  return (
    <>
      <button className="btn work-btn" disabled={pending} onClick={() => (info.status === 'ready' ? setOpen(true) : void start())}>
        <Icon name={pending ? 'sync' : info.status === 'ready' ? 'book' : 'spark'} size={19} className={pending ? 'spin' : undefined} />
        <span className="tb-txt">
          <b>{pending ? 'Haciendo tu trabajo…' : info.status === 'ready' ? 'Ver mi trabajo' : info.status === 'error' ? 'Reintentar con IA' : 'Hacer con IA'}</b>
          <small>{pending ? 'te aviso al terminar' : info.status === 'ready' ? 'revisar y descargar en Word' : info.status === 'error' ? (info.error || 'algo falló').slice(0, 48) : 'con tu estilo y tus datos'}</small>
        </span>
      </button>
      {open && info.work && info.profile && <WorkSheet work={info.work} profile={info.profile} title={title} onClose={() => setOpen(false)} onRedo={() => { setOpen(false); void start(); }} />}
    </>
  );
}

/** Botón pequeño para las filas de Semana eficiente. */
export function WorkChip({ taskId, title }: { taskId: number; title: string }) {
  const { info, start } = useWork(taskId);
  const [open, setOpen] = useState(false);
  const pending = info.status === 'pending';
  return (
    <>
      <button className={`se-ai ${info.status}`} aria-label={pending ? 'La IA está haciendo el trabajo' : info.status === 'ready' ? 'Ver trabajo hecho con IA' : 'Hacer con IA'}
        onClick={(e) => { e.stopPropagation(); if (info.status === 'ready') setOpen(true); else if (!pending) void start(); }}>
        <Icon name={info.status === 'ready' ? 'check' : 'spark'} size={13} className={pending ? 'spin' : undefined} />
        <span>{pending ? 'Haciendo…' : info.status === 'ready' ? 'Ver' : 'IA'}</span>
      </button>
      {open && info.work && info.profile && <WorkSheet work={info.work} profile={info.profile} title={title} onClose={() => setOpen(false)} onRedo={() => { setOpen(false); void start(); }} />}
    </>
  );
}

function WorkSheet({ work, profile, title, onClose, onRedo }: { work: Work; profile: Profile; title: string; onClose: () => void; onRedo: () => void }) {
  const [busy, setBusy] = useState(false);
  async function word() {
    setBusy(true); haptic(10);
    try { const m = await import('./trabajo'); await m.downloadWord(work, profile, `${work.titulo}_${profile.nombre.split(' ').slice(0, 2).join('_')}`); toast('Word descargado ✅'); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function copy() {
    try { const m = await import('./trabajo'); await navigator.clipboard.writeText(m.workText(work)); toast('Texto copiado'); }
    catch { toast('No se pudo copiar', 'err'); }
  }
  return (
    <Modal title="Tu trabajo" onClose={onClose}>
      <div className="work-view">
        <div className="work-cover">
          <span className="wc-tag">{work.etiqueta}</span>
          <h2>{work.titulo}</h2>
          <p>{work.subtitulo}</p>
          <small>{title}</small>
        </div>
        <div className="work-actions">
          <button className="btn primary" onClick={word} disabled={busy}><Icon name="book" size={18} />{busy ? 'Preparando…' : 'Descargar Word'}</button>
          <button className="btn line" onClick={copy}>Copiar texto</button>
          <button className="btn line" onClick={onRedo}>Rehacer</button>
        </div>
        <p className="muted small">Es un borrador: léelo, ajústalo con tus palabras y verifica las referencias antes de entregar.</p>
        <h3>Introducción</h3><p>{work.introduccion}</p>
        {work.secciones.map((s, i) => (
          <div key={i}>
            <h4>{s.titulo}</h4>
            {s.parrafos.map((t, j) => <p key={j}>{t}</p>)}
            {s.tabla && (
              <div className="work-table"><b>{s.tabla.titulo}</b>
                <table><thead><tr>{s.tabla.columnas.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
                  <tbody>{s.tabla.filas.map((r, k) => <tr key={k}>{r.map((c, l) => <td key={l}>{c}</td>)}</tr>)}</tbody></table>
              </div>
            )}
          </div>
        ))}
        <h3>Conclusión</h3><p>{work.conclusion}</p>
        {work.referencias.length > 0 && <><h3>Referencias</h3>{work.referencias.map((r, i) => <p key={i} className="small">{r}</p>)}</>}
      </div>
    </Modal>
  );
}
