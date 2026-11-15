// Libros por materia: enlaces o archivos subidos (PDF, Word…). Los archivos se guardan en trozos de 1 MB en D1 (sin costo extra).
import type { Hono } from 'hono';
import type { Env } from './env';
import { nowSec } from './time';
import { fixText, moodleCall } from './moodle';

type App = Hono<{ Bindings: Env }>;
const CHUNK = 768 * 1024; // se guarda en base64 (≈1 MB por renglón de D1)
const MAX_FILE = 25 * 1024 * 1024;

function b64(u: Uint8Array): string { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); }
function unb64(t: string): Uint8Array { const s = atob(t); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

async function saveFile(env: Env, id: number, buf: Uint8Array) {
  for (let i = 0; i * CHUNK < buf.length; i++) await env.DB.prepare('INSERT OR REPLACE INTO book_chunks (book_id, idx, data) VALUES (?,?,?)').bind(id, i, b64(buf.subarray(i * CHUNK, (i + 1) * CHUNK))).run();
}

async function loadFile(env: Env, id: number, size: number): Promise<Uint8Array | null> {
  const rows = (await env.DB.prepare('SELECT data FROM book_chunks WHERE book_id = ? ORDER BY idx').bind(id).all<{ data: string | number[] }>()).results;
  if (!rows.length) return null;
  const out = new Uint8Array(size); let off = 0;
  for (const r of rows) { const d = typeof r.data === 'string' ? unb64(r.data) : new Uint8Array(r.data); out.set(d, off); off += d.length; }
  return out;
}

const driveUrl = (u: string) => { const m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || u.match(/drive\.google\.com\/open\?id=([\w-]+)/); return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : u; };

/** Baja el PDF de un libro del EVA con el token (nunca se guarda el token) y lo deja guardado en Rumbo. */
async function fetchEvaBook(env: Env, b: { id: number; eva_key: string; title: string }): Promise<boolean> {
  const [mid, cm] = b.eva_key.split(':').map(Number);
  const secs = await moodleCall<{ modules?: Mod[] }[]>(env, 'core_course_get_contents', { courseid: mid });
  const m = secs.flatMap((s) => s.modules || []).find((x) => x.id === cm);
  if (!m) return false;
  let target = '';
  if (m.modname === 'url') target = driveUrl((m.contents || [])[0]?.fileurl || '');
  else {
    const f = (m.contents || []).find((x) => x.type === 'file' && /\.pdf$/i.test(x.filename || ''));
    if (f?.fileurl) target = f.fileurl + (f.fileurl.includes('?') ? '&' : '?') + 'token=' + env.MOODLE_TOKEN;
  }
  if (!/^https?:/i.test(target)) return false;
  const res = await fetch(target, { redirect: 'follow' });
  if (!res.ok) return false;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_FILE || String.fromCharCode(...buf.subarray(0, 4)) !== '%PDF') return false;
  await saveFile(env, b.id, buf);
  await env.DB.prepare('UPDATE books SET size = ?, mime = ?, file_name = ? WHERE id = ?').bind(buf.length, 'application/pdf', (b.title + '.pdf').slice(0, 200), b.id).run();
  return true;
}

type Mod = { id: number; name: string; modname: string; url?: string; visible?: number; contents?: { filename?: string; type?: string; filesize?: number; fileurl?: string }[] };
const BOOKISH = /libro|book|texto|lectura|bibliograf|manual|ebook|epub/i;

/** Recorre el EVA de cada materia y guarda como enlaces los libros que encuentre (módulos «libro», PDFs grandes, EPUB, lecturas). */
export async function scanBooks(env: Env, only?: number): Promise<{ course: string; found: number }[]> {
  const q = only ? ' AND id = ?' : '';
  const stmt = env.DB.prepare(`SELECT id, name, moodle_id FROM courses WHERE user_id = ? AND moodle_id IS NOT NULL${q}`);
  const courses = (await (only ? stmt.bind(env.UID, only) : stmt.bind(env.UID)).all<{ id: number; name: string; moodle_id: number }>()).results;
  const out: { course: string; found: number }[] = [];
  for (const c of courses) {
    let found = 0;
    try {
      const secs = await moodleCall<{ modules?: Mod[] }[]>(env, 'core_course_get_contents', { courseid: c.moodle_id });
      for (const m of secs.flatMap((s) => s.modules || [])) {
        if (m.visible === 0 || !m.url) continue;
        const files = (m.contents || []).filter((f) => f.type === 'file');
        const big = files.some((f) => /\.pdf$/i.test(f.filename || '') && (f.filesize || 0) >= 1_000_000);
        const epub = files.some((f) => /\.epub$/i.test(f.filename || ''));
        const name = fixText(m.name).trim();
        const isBook = m.modname === 'book' || ((m.modname === 'resource' || m.modname === 'folder' || m.modname === 'url' || m.modname === 'imscp') && (BOOKISH.test(name) || big || epub));
        if (!isBook) continue;
        const dup = await env.DB.prepare('SELECT 1 FROM books WHERE user_id = ? AND course_id = ? AND lower(title) = lower(?)').bind(env.UID, c.id, name.slice(0, 200)).first();
        if (dup) continue;
        const r = await env.DB.prepare('INSERT OR IGNORE INTO books (user_id, course_id, title, url, note, created_at, eva_key) VALUES (?,?,?,?,?,?,?)')
          .bind(env.UID, c.id, name.slice(0, 200), m.url, 'Del EVA (ábrelo con tu sesión del EVA)', nowSec(), `${c.moodle_id}:${m.id}`).run();
        if (r.meta.changes) found++;
      }
    } catch { /* esa materia no se pudo leer: se sigue con las demás */ }
    out.push({ course: c.name, found });
  }
  return out;
}

export function registerLibros(app: App) {
  app.post('/api/books/scan', async (c) => {
    try { return c.json({ results: await scanBooks(c.env) }); }
    catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  app.get('/api/courses/:id/books', async (c) => {
    const r = await c.env.DB.prepare('SELECT id, course_id, title, url, file_name, size, note, created_at, unreadable, (cover IS NOT NULL) AS has_cover, (eva_key IS NOT NULL) AS eva FROM books WHERE user_id = ? AND course_id = ? ORDER BY title')
      .bind(c.env.UID, Number(c.req.param('id'))).all();
    return c.json(r.results);
  });

  async function ownCourse(env: Env, id: number) {
    return env.DB.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').bind(id, env.UID).first();
  }

  // Enlace: JSON {title, url, note}
  app.post('/api/courses/:id/books', async (c) => {
    const cid = Number(c.req.param('id'));
    if (!(await ownCourse(c.env, cid))) return c.json({ error: 'Materia no encontrada.' }, 404);
    const b = await c.req.json<{ title?: string; url?: string; note?: string }>().catch(() => ({} as { title?: string; url?: string; note?: string }));
    const title = (b.title || '').trim().slice(0, 200);
    const url = (b.url || '').trim();
    if (!title) return c.json({ error: 'Ponle un título al libro.' }, 400);
    if (!/^https?:\/\/\S+$/i.test(url)) return c.json({ error: 'El enlace debe empezar con http:// o https://' }, 400);
    const r = await c.env.DB.prepare('INSERT INTO books (user_id, course_id, title, url, note, created_at) VALUES (?,?,?,?,?,?)')
      .bind(c.env.UID, cid, title, url.slice(0, 1000), (b.note || '').trim().slice(0, 500) || null, nowSec()).run();
    return c.json({ id: r.meta.last_row_id });
  });

  // Archivo: cuerpo binario; título y nombre van en la URL (?title=&name=)
  app.post('/api/courses/:id/books/upload', async (c) => {
    const cid = Number(c.req.param('id'));
    if (!(await ownCourse(c.env, cid))) return c.json({ error: 'Materia no encontrada.' }, 404);
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (!buf.length) return c.json({ error: 'El archivo está vacío.' }, 400);
    if (buf.length > MAX_FILE) return c.json({ error: 'El archivo pesa más de 25 MB. Guárdalo como enlace (Drive).' }, 413);
    const name = (c.req.query('name') || 'libro').slice(0, 200);
    const title = (c.req.query('title') || name.replace(/\.[^.]+$/, '')).trim().slice(0, 200) || 'Libro';
    const mime = (c.req.header('Content-Type') || 'application/octet-stream').slice(0, 100);
    const r = await c.env.DB.prepare('INSERT INTO books (user_id, course_id, title, file_name, mime, size, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(c.env.UID, cid, title, name, mime, buf.length, nowSec()).run();
    const id = r.meta.last_row_id;
    try { await saveFile(c.env, id, buf); }
    catch (e) {
      await c.env.DB.batch([c.env.DB.prepare('DELETE FROM book_chunks WHERE book_id = ?').bind(id), c.env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id)]);
      return c.json({ error: 'No se pudo guardar el archivo: ' + (e as Error).message }, 500);
    }
    return c.json({ id });
  });

  app.get('/api/books/:id/file', async (c) => {
    const id = Number(c.req.param('id'));
    type B = { id: number; title: string; eva_key: string | null; file_name: string | null; mime: string | null; size: number; url: string | null };
    let b = await c.env.DB.prepare('SELECT id, title, eva_key, file_name, mime, size, url FROM books WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<B>();
    if (!b) return c.json({ error: 'No encontrado.' }, 404);
    if (!b.size && b.eva_key) {
      let ok = false;
      try { ok = await fetchEvaBook(c.env, { id, eva_key: b.eva_key, title: b.title }); } catch { ok = false; }
      if (!ok) { await c.env.DB.prepare('UPDATE books SET unreadable = 1 WHERE id = ?').bind(id).run(); return c.json({ error: 'Este libro no se puede leer dentro de Rumbo.', url: b.url }, 422); }
      b = (await c.env.DB.prepare('SELECT id, title, eva_key, file_name, mime, size, url FROM books WHERE id = ?').bind(id).first<B>())!;
    }
    const data = b.size ? await loadFile(c.env, id, b.size) : null;
    if (!data) return c.json({ error: 'No encontrado.' }, 404);
    return new Response(data, { headers: { 'Content-Type': b.mime || 'application/octet-stream', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(b.file_name || 'libro')}`, 'Cache-Control': 'private, max-age=3600' } });
  });

  // Portada: JPEG de la primera página; la app la genera la primera vez y se guarda aquí.
  app.post('/api/books/:id/cover', async (c) => {
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (!buf.length || buf.length > 400_000) return c.json({ error: 'Portada inválida.' }, 400);
    await c.env.DB.prepare('UPDATE books SET cover = ? WHERE id = ? AND user_id = ?').bind(b64(buf), Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });
  app.get('/api/books/:id/cover', async (c) => {
    const r = await c.env.DB.prepare('SELECT cover FROM books WHERE id = ? AND user_id = ? AND cover IS NOT NULL').bind(Number(c.req.param('id')), c.env.UID).first<{ cover: string }>();
    if (!r) return c.json({ error: 'Sin portada.' }, 404);
    return new Response(unb64(r.cover), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
  });

  // Todos los libros de todas las materias (Biblioteca).
  app.get('/api/books', async (c) => {
    const r = await c.env.DB.prepare(`SELECT b.id, b.course_id, c.name AS course_name, c.color AS course_color, b.title, b.url, b.file_name, b.size, b.note, b.created_at, b.unreadable,
      (b.cover IS NOT NULL) AS has_cover, (b.eva_key IS NOT NULL) AS eva FROM books b LEFT JOIN courses c ON c.id = b.course_id WHERE b.user_id = ? ORDER BY c.name, b.title`).bind(c.env.UID).all();
    return c.json(r.results);
  });

  app.delete('/api/books/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const own = await c.env.DB.prepare('SELECT id FROM books WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first();
    if (!own) return c.json({ error: 'No encontrado.' }, 404);
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM book_chunks WHERE book_id = ?').bind(id), c.env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id)]);
    return c.json({ ok: true });
  });
}
