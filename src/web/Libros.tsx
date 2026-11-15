// Libros: estantería con portadas (primera página del PDF), lector de PDF dentro de Rumbo,
// y la tarjeta «Libros de la materia» (enlaces, archivos subidos y búsqueda automática en el EVA).
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Icon } from './icons';
import { toast, useLoad } from './components';
import './libros.css';

export type Book = {
  id: number; course_id: number; course_name?: string | null; course_color?: string | null; title: string; url: string | null; file_name: string | null;
  size: number; note: string | null; created_at: number; unreadable: number; has_cover: number; eva: number;
};
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ----- pdf.js se carga solo cuando hace falta -----
let pdfLib: Promise<typeof import('pdfjs-dist')> | null = null;
function pdfjs() {
  pdfLib ??= (async () => {
    const m = await import('pdfjs-dist');
    m.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    return m;
  })();
  return pdfLib;
}
async function fileBytes(id: number): Promise<ArrayBuffer> {
  const res = await fetch(`/api/books/${id}/file`, { credentials: 'same-origin' });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw Object.assign(new Error((d as { error?: string }).error || `Error ${res.status}`), { status: res.status, url: (d as { url?: string }).url }); }
  return res.arrayBuffer();
}

// Una portada a la vez: baja el libro, dibuja la página 1 y la guarda en el servidor.
let queue: Promise<unknown> = Promise.resolve();
function makeCover(id: number): Promise<'ok' | 'unreadable' | 'error'> {
  const job = queue.then(async () => {
    try {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: await fileBytes(id) }).promise;
      const page = await doc.getPage(1);
      const v0 = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 360 / v0.width });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.72));
      await doc.destroy();
      if (!blob) return 'error' as const;
      await fetch(`/api/books/${id}/cover`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' }, credentials: 'same-origin' });
      return 'ok' as const;
    } catch (e) { return (e as { status?: number }).status === 422 ? 'unreadable' as const : 'error' as const; }
  });
  queue = job.catch(() => undefined);
  return job;
}

// ----- Lector -----
function Lector({ book, onClose }: { book: Book; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ n: number } | { err: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const docRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const key = `rumbo-libro-${book.id}`;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const lib = await pdfjs();
        const doc = await lib.getDocument({ data: await fileBytes(book.id) }).promise;
        if (dead) return;
        docRef.current = doc; setState({ n: doc.numPages });
      } catch (e) {
        const x = e as { message: string; url?: string; status?: number };
        if (x.status === 422 && x.url) { toast('Este libro no se puede leer aquí: lo abro en el EVA'); window.open(x.url, '_blank', 'noopener'); onClose(); return; }
        setState({ err: x.message });
      }
    })();
    return () => { dead = true; void docRef.current?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Vuelve a la última página que leíste.
  useEffect(() => {
    if (!state || 'err' in state) return;
    const last = Number(localStorage.getItem(key) || 1);
    if (last > 1) setTimeout(() => box.current?.querySelector(`[data-p="${last}"]`)?.scrollIntoView(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state && 'n' in state]);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  return (
    <div className="lector" role="dialog" aria-label={book.title}>
      <header>
        <button className="btn sm" onClick={onClose} aria-label="Cerrar libro"><Icon name="x" size={18} /></button>
        <b>{book.title}</b>
        <span className="num sm">{state && 'n' in state ? `${page}/${state.n}` : ''}</span>
        <button className="btn sm" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} aria-label="Alejar" disabled={zoom <= 1}>−</button>
        <button className="btn sm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Acercar" disabled={zoom >= 3}>+</button>
      </header>
      <div className="lector-body" ref={box} onScroll={(e) => {
        const el = e.currentTarget; const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
        for (const p of Array.from(el.querySelectorAll<HTMLElement>('[data-p]'))) { const r = p.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { const n = Number(p.dataset.p); setPage(n); try { localStorage.setItem(key, String(n)); } catch { /* sin guardado */ } break; } }
      }}>
        {!state && <p className="lector-msg">Abriendo el libro…<br /><span className="sm">La primera vez puede tardar un poco.</span></p>}
        {state && 'err' in state && <p className="lector-msg">No pude abrir el libro: {state.err}</p>}
        {state && 'n' in state && docRef.current && Array.from({ length: state.n }, (_, i) => <PageView key={i} doc={docRef.current!} n={i + 1} zoom={zoom} box={box} />)}
      </div>
    </div>
  );
}

function PageView({ doc, n, zoom, box }: { doc: import('pdfjs-dist').PDFDocumentProxy; n: number; zoom: number; box: React.RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [vis, setVis] = useState(false);
  const [ratio, setRatio] = useState(1.3);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { root: box.current, rootMargin: '600px 0px' });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
  }, [box]);
  useEffect(() => {
    if (!vis || !canvas.current) { if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; } return; }
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let dead = false;
    (async () => {
      const page = await doc.getPage(n);
      const v0 = page.getViewport({ scale: 1 });
      setRatio(v0.height / v0.width);
      const w = (box.current?.clientWidth || 360) * zoom;
      const viewport = page.getViewport({ scale: (w / v0.width) * Math.min(window.devicePixelRatio || 1, 2) });
      const c = canvas.current; if (!c || dead) return;
      c.width = viewport.width; c.height = viewport.height;
      task = page.render({ canvasContext: c.getContext('2d')!, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => { dead = true; task?.cancel(); };
  }, [vis, zoom, doc, n, box]);
  return (
    <div className="lector-page" data-p={n} ref={holder} style={{ width: `${zoom * 100}%`, aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} />
    </div>
  );
}

// ----- Portada + tarjeta de libro -----
function BookCard({ b, onOpen, onRemove, onCover }: { b: Book; onOpen: (b: Book) => void; onRemove: (b: Book) => void; onCover: (id: number, r: 'ok' | 'unreadable' | 'error') => void }) {
  const [cover, setCover] = useState(!!b.has_cover);
  const [fail, setFail] = useState(false);
  const holder = useRef<HTMLButtonElement>(null);
  const canRead = !b.unreadable && (!!b.size || !!b.eva);
  useEffect(() => {
    if (cover || fail || !canRead) return;
    // Solo cuando la tarjeta se ve en pantalla.
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      void makeCover(b.id).then((r) => { if (r === 'ok') { setCover(true); onCover(b.id, r); } else { setFail(true); onCover(b.id, r); } });
    }, { rootMargin: '200px' });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover, fail, canRead, b.id]);
  return (
    <li className="book">
      <button className="book-cover" ref={holder} onClick={() => onOpen(b)} aria-label={`Abrir ${b.title}`} style={{ ['--c' as string]: b.course_color || 'var(--blue)' }}>
        {cover ? <img src={`/api/books/${b.id}/cover`} alt="" loading="lazy" /> : <span className="book-ph"><Icon name={b.url && !b.eva ? 'link' : 'book'} size={26} /><i>{b.title}</i></span>}
      </button>
      <div className="book-meta">
        <b title={b.title}>{b.title}</b>
        <span className="sm">{b.size ? mb(b.size) : b.eva ? (canRead ? 'Del EVA · leer aquí' : 'Del EVA · enlace') : 'Enlace'}</span>
      </div>
      <button className="book-x" aria-label={`Quitar ${b.title}`} onClick={() => onRemove(b)}><Icon name="trash" size={15} /></button>
    </li>
  );
}

export function Estanteria({ books, onChanged }: { books: Book[]; onChanged: () => void }) {
  const [reading, setReading] = useState<Book | null>(null);
  function open(b: Book) {
    if (!b.unreadable && (b.size || b.eva)) { setReading(b); return; }
    if (b.url) window.open(b.url, '_blank', 'noopener');
  }
  async function remove(b: Book) {
    if (!confirm(`¿Quitar «${b.title}»?`)) return;
    try { await api(`/books/${b.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { toast((e as Error).message, 'err'); }
  }
  return (
    <>
      <ul className="shelf">{books.map((b) => <BookCard key={b.id} b={b} onOpen={open} onRemove={remove} onCover={(_, r) => { if (r === 'unreadable') onChanged(); }} />)}</ul>
      {reading && <Lector book={reading} onClose={() => setReading(null)} />}
    </>
  );
}

/** Botón «Buscar en el EVA»: recorre todas las materias y guarda los libros que encuentre. */
export function ScanButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function scan() {
    setBusy(true);
    try {
      const r = await api<{ results: { course: string; found: number }[] }>('/books/scan', { method: 'POST' });
      const n = r.results.reduce((a, x) => a + x.found, 0);
      toast(n ? `Encontré ${n} libro${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} en el EVA 📚` : 'No encontré libros nuevos en el EVA');
      onDone();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  return <button className="btn sm" disabled={busy} onClick={scan}><Icon name="sync" size={16} /> {busy ? 'Buscando…' : 'Buscar en el EVA'}</button>;
}

export function Libros({ courseId }: { courseId: number }) {
  const books = useLoad(() => api<Book[]>(`/courses/${courseId}/books`), [courseId]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function saveLink() {
    setBusy(true);
    try { await api(`/courses/${courseId}/books`, { method: 'POST', body: { title, url } }); setTitle(''); setUrl(''); setAdding(false); books.reload(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function upload(f: File) {
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/books/upload?name=${encodeURIComponent(f.name)}&title=${encodeURIComponent(title)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' }, credentials: 'same-origin' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || `Error ${res.status}`);
      setTitle(''); setAdding(false); books.reload(); toast('Libro guardado 📚');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  }

  const list = books.data || [];
  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>📚 Libros de la materia</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <ScanButton onDone={books.reload} />
          <button className="btn sm" onClick={() => setAdding((v) => !v)}><Icon name="plus" size={16} /> Agregar</button>
        </div>
      </div>
      {adding && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional si subes archivo)" aria-label="Título del libro" />
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… enlace del libro" aria-label="Enlace" inputMode="url" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={busy || !title.trim() || !url.trim()} onClick={saveLink}><Icon name="link" size={16} /> Guardar enlace</button>
            <button className="btn" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" size={16} /> {busy ? 'Subiendo…' : 'Subir archivo'}</button>
            <input ref={file} type="file" hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.epub,.txt,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </div>
        </div>
      )}
      {!list.length && !adding && <p className="sm" style={{ color: 'var(--muted)', marginTop: 10 }}>Aún no hay libros. Pulsa «Buscar en el EVA», agrega un enlace o sube el PDF.</p>}
      {list.length > 0 && <Estanteria books={list} onChanged={books.reload} />}
    </section>
  );
}
