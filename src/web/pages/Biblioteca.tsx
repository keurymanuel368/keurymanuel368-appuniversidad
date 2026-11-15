// Biblioteca: todos los libros de todas tus materias, con portada y lector.
import { api } from '../api';
import { Empty, PageHead, Skeleton, useLoad } from '../components';
import { Estanteria, ScanButton, type Book } from '../Libros';

export function Biblioteca() {
  const books = useLoad(() => api<Book[]>('/books'));
  const list = books.data || [];
  const groups = new Map<string, { color: string | null; items: Book[] }>();
  for (const b of list) {
    const k = b.course_name || 'Sin materia';
    if (!groups.has(k)) groups.set(k, { color: b.course_color || null, items: [] });
    groups.get(k)!.items.push(b);
  }
  return (
    <div className="rbx">
      <PageHead eyebrow="Tus materias" title="Biblioteca" />
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="sm" style={{ color: 'var(--muted)' }}>{list.length ? `${list.length} libros en ${groups.size} materias` : 'Aún no hay libros.'}</span>
        <ScanButton onDone={books.reload} />
      </div>
      {books.error && <div className="error">{books.error}</div>}
      {!books.data ? <Skeleton hero={false} rows={3} /> : !list.length ? (
        <div className="card"><Empty icon="book" title="Tu biblioteca está vacía" text="Pulsa «Buscar en el EVA» y Rumbo guarda aquí los libros de todas tus materias." /></div>
      ) : [...groups.entries()].map(([name, g]) => (
        <section className="card lib-group" key={name}>
          <h3><span className="dot" style={{ background: g.color || 'var(--blue)' }} />{name}</h3>
          <Estanteria books={g.items} onChanged={books.reload} />
        </section>
      ))}
    </div>
  );
}
