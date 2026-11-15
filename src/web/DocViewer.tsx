// Visor del trabajo «como en Word»: páginas tamaño carta sobre fondo gris, con la portada, tus datos,
// el cuerpo repartido en páginas y número de página. Se escala solo para caber en el celular o en la PC.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { haptic, toast } from './components';
import { drawCover, type Profile, type Work } from './trabajo';

const PW = 816, PH = 1056, M = 96; // carta a 96 dpi, margen de 1 pulgada

function Rich({ t }: { t: string }) {
  return <>{t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}

/** Referencia APA: títulos en cursiva (*así*) y enlaces clicables. */
function Ref({ text }: { text: string }) {
  return <>{text.split(/(\*[^*]+\*|https?:\/\/[^\s)>\]]+)/g).filter(Boolean).map((p, i) => {
    if (/^https?:/.test(p)) { const u = p.replace(/[.,;]+$/, ''); return <span key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a>{p.slice(u.length)}</span>; }
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  })}</>;
}

type Block = { key: string; node: ReactNode; heading?: boolean };

function buildBlocks(w: Work): Block[] {
  const b: Block[] = [];
  b.push({ key: 'h-intro', heading: true, node: <h1>Introducción</h1> });
  b.push({ key: 'intro', node: <p><Rich t={w.introduccion} /></p> });
  b.push({ key: 'h-des', heading: true, node: <h1>Desarrollo</h1> });
  w.secciones.forEach((s, i) => {
    b.push({ key: `s${i}`, heading: true, node: <h2>{s.titulo}</h2> });
    s.parrafos.forEach((t, j) => b.push({ key: `s${i}p${j}`, node: <p><Rich t={t} /></p> }));
    if (s.lista?.length) b.push({ key: `s${i}l`, node: <ul>{s.lista.map((x, k) => <li key={k}><Rich t={x} /></li>)}</ul> });
    if (s.destacado) b.push({ key: `s${i}d`, node: <blockquote><Rich t={s.destacado} /></blockquote> });
    if (s.tabla) {
      const t = s.tabla;
      b.push({ key: `s${i}t`, node: (
        <div className="dv-tbl"><b>{t.titulo}</b>
          <table><thead><tr>{t.columnas.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
            <tbody>{t.filas.map((r, k) => <tr key={k}>{r.map((c, l) => <td key={l}>{c}</td>)}</tr>)}</tbody></table>
        </div>
      ) });
    }
  });
  b.push({ key: 'h-con', heading: true, node: <h1>Conclusión</h1> });
  b.push({ key: 'con', node: <p><Rich t={w.conclusion} /></p> });
  if (w.referencias.length) {
    b.push({ key: 'h-ref', heading: true, node: <h1>Referencias</h1> });
    [...w.referencias].sort((a, c) => a.replace(/\*/g, '').localeCompare(c.replace(/\*/g, ''), 'es')).forEach((r, i) => b.push({ key: `r${i}`, node: <p className="dv-ref"><Ref text={r} /></p> }));
  }
  return b;
}

export function DocViewer({ work, profile, title, onClose, onRedo }: { work: Work; profile: Profile; title: string; onClose: () => void; onRedo: () => void }) {
  const blocks = useMemo(() => buildBlocks(work), [work]);
  const measure = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);
  const [scale, setScale] = useState(0.5);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Portada: se dibuja igual que la del Word.
  useEffect(() => {
    let url = ''; let alive = true;
    drawCover(work, profile).then((b) => { if (!alive) return; url = URL.createObjectURL(b); setCover(url); }).catch(() => setCover(''));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [work, profile]);

  // Reparte los bloques en páginas midiendo cada uno (un título nunca queda solo al final de una página).
  useLayoutEffect(() => {
    const m = measure.current; if (!m) return;
    const hs = [...m.children].map((c) => c.getBoundingClientRect().height);
    const maxH = PH - 2 * M, out: number[][] = [[]]; let used = 0;
    blocks.forEach((b, i) => {
      const need = hs[i] + (b.heading ? Math.min(hs[i + 1] || 0, 140) : 0);
      if (used + need > maxH && out[out.length - 1].length) { out.push([]); used = 0; }
      out[out.length - 1].push(i); used += hs[i];
    });
    setPages(out);
  }, [blocks]);

  // Escala para que la página quepa en el ancho disponible.
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 24) / PW)));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  async function word() {
    setBusy(true); haptic(10);
    try { const m = await import('./trabajo'); await m.downloadWord(work, profile, `${work.titulo}_${profile.nombre.split(' ').slice(0, 2).join('_')}`); toast('Word descargado ✅'); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy(false);
  }
  async function copy() {
    try { const m = await import('./trabajo'); await navigator.clipboard.writeText(m.workText(work)); toast('Texto copiado'); } catch { toast('No se pudo copiar', 'err'); }
  }

  const sheet = (n: number, children: ReactNode, cls = '') => (
    <div className="dv-slot" style={{ width: PW * scale, height: PH * scale }} key={n}>
      <div className={`dv-page ${cls}`} style={{ transform: `scale(${scale})` }}>{children}<span className="dv-num">{n}</span></div>
    </div>
  );
  const rows: [string, string][] = [['PARTICIPANTE', profile.nombre], ['MATRÍCULA', profile.matricula], ['FACILITADOR/A', profile.facilitador], ['CARRERA', profile.carrera], ['ASIGNATURA', profile.asignatura], ['CÓDIGO', profile.codigo]];

  return createPortal(
    <div className="dv" role="dialog" aria-label="Vista del trabajo">
      <header className="dv-bar">
        <button className="icon-round" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
        <b className="dv-title">{work.titulo || title}</b>
        <div className="dv-actions">
          <button className="btn line dv-sm" onClick={copy}>Copiar</button>
          <button className="btn line dv-sm" onClick={onRedo}>Rehacer</button>
          <button className="btn primary dv-sm" onClick={word} disabled={busy}><Icon name="download" size={16} />{busy ? 'Preparando…' : 'Descargar Word'}</button>
        </div>
      </header>
      <div className="dv-scroll" ref={wrap}>
        <p className="dv-hint">Borrador: léelo, ajústalo con tus palabras y verifica las referencias antes de entregar.</p>
        {sheet(1, (
          <>
            {cover ? <img src={cover} alt="Portada" className="dv-cover" /> : <div className="dv-cover dv-wait">Preparando portada…</div>}
            <div className="dv-data">
              <b className="dv-by">PRESENTADO POR</b>
              {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="dv-row"><span>{k}</span><b>{v}</b></div>)}
            </div>
          </>
        ), 'dv-first')}
        {(pages || []).map((idxs, p) => sheet(p + 2, <div className="dv-body">{idxs.map((i) => <div key={blocks[i].key} className="dv-b">{blocks[i].node}</div>)}</div>))}
        {/* Medición invisible: mismo ancho que el texto de una página. */}
        <div className="dv-measure dv-body" ref={measure} aria-hidden="true">{blocks.map((b) => <div key={b.key} className="dv-b">{b.node}</div>)}</div>
      </div>
    </div>
    , document.body);
}
