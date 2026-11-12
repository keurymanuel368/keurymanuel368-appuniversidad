// Cuadernos de estudio con IA: recorre cada materia del EVA, junta el material de cada tema (resúmenes de la sección,
// páginas, descripciones de actividades, nombres de archivos) y la IA escribe una hoja LARGA por tema para el cuaderno
// de esa materia: resumen, conceptos, explicación, ejemplos, errores comunes, práctica y fichas. También: «Pregúntale a tus cuadernos».
import type { Hono } from 'hono';
import type { Env } from './env';
import { fixText, htmlToText, moodleCall } from './moodle';
import { llmComplete } from './llm';
import { sendToMe } from './notify';
import { blocks } from './wa';
import { nowSec } from './time';

type App = Hono<{ Bindings: Env }>;
type Topic = { id: number; course_id: number; course: string; idx: number; title: string; material: string; status: string; updated_at: number };

// ---------- Utilidades puras (con pruebas) ----------
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['que', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'es', 'por', 'para', 'con', 'del', 'al', 'se', 'lo', 'como', 'mi', 'me', 'sobre', 'dijo', 'profe', 'profesor', 'cual', 'cuales', 'esta', 'este']);
export const tokens = (s: string) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

/** Separa la hoja de estudio de sus fichas («=== TARJETAS ===» y líneas «P: … | R: …»). */
export function parseSheet(text: string): { body: string; cards: { front: string; back: string }[] } {
  const [body, rest = ''] = text.split(/={3,}\s*TARJETAS\s*={3,}/i);
  const cards: { front: string; back: string }[] = [];
  for (const l of rest.split('\n')) {
    const m = l.match(/^\s*(?:[-*•\d.)]+\s*)?P:\s*(.+?)\s*\|\s*R:\s*(.+)$/i);
    if (m && m[1].length > 3 && m[2].length > 2) cards.push({ front: m[1].trim().slice(0, 400), back: m[2].trim().slice(0, 900) });
  }
  return { body: body.trim(), cards: cards.slice(0, 16) };
}

/** Trozos de texto (≈500 caracteres) puntuados por cuántas palabras de la pregunta contienen. */
export function topChunks(docs: { id: string; titulo: string; curso: string | null; texto: string }[], q: string, n = 7) {
  const qt = new Set(tokens(q));
  if (!qt.size) return [];
  const out: { score: number; titulo: string; curso: string | null; texto: string }[] = [];
  for (const d of docs) {
    const lines = d.texto.split('\n').filter((l) => l.trim());
    let cur = '';
    const flush = () => {
      if (!cur.trim()) return;
      const words = new Set(tokens(cur + ' ' + d.titulo));
      let score = 0; for (const w of qt) if (words.has(w)) score++;
      if (score) out.push({ score: score + (tokens(d.titulo).some((w) => qt.has(w)) ? 0.5 : 0), titulo: d.titulo, curso: d.curso, texto: cur.trim().slice(0, 700) });
      cur = '';
    };
    for (const l of lines) { if (cur.length + l.length > 500) flush(); cur += l + '\n'; }
    flush();
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

// ---------- Escaneo del EVA ----------
type Section = { name?: string; summary?: string; visible?: number; modules?: { id: number; name: string; modname: string; description?: string; visible?: number; contents?: { filename?: string; type?: string }[] }[] };

async function scanCourse(env: Env, c: { id: number; moodle_id: number; name: string }): Promise<number> {
  const secs = await moodleCall<Section[]>(env, 'core_course_get_contents', { courseid: c.moodle_id });
  const pages: Record<number, string> = {};
  try {
    const r = await moodleCall<{ pages?: { coursemodule: number; content?: string }[] }>(env, 'mod_page_get_pages_by_courses', { courseids: [c.moodle_id] });
    for (const p of r.pages || []) pages[p.coursemodule] = htmlToText(p.content).slice(0, 3000);
  } catch { /* el EVA no deja leer páginas: se sigue con lo demás */ }
  let made = 0;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    if (s.visible === 0) continue;
    const parts: string[] = [];
    if (s.summary) parts.push(htmlToText(s.summary));
    for (const m of s.modules || []) {
      if (m.visible === 0) continue;
      const d = htmlToText(m.description);
      if (m.modname === 'label') { if (d) parts.push(d); continue; }
      const files = (m.contents || []).filter((f) => f.type === 'file').map((f) => f.filename).slice(0, 6).join(', ');
      parts.push(`• [${m.modname}] ${fixText(m.name)}${d ? ': ' + d.slice(0, 500) : ''}${files ? ` (archivos: ${files})` : ''}${pages[m.id] ? '\n' + pages[m.id] : ''}`);
    }
    const material = parts.filter(Boolean).join('\n').slice(0, 7000);
    const title = fixText(s.name || '').trim() || `Sección ${i}`;
    if (!(s.modules || []).length && material.length < 30) continue;
    if (/avisos|novedades|foro de (consultas|presentaci)|bienvenid/i.test(title) && material.length < 200) continue;
    await env.DB.prepare(`INSERT INTO study_topics (user_id, course_id, course, idx, title, material, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      ON CONFLICT(user_id, course_id, idx) DO UPDATE SET title = excluded.title, material = excluded.material, updated_at = excluded.updated_at WHERE study_topics.status != 'done'`)
      .bind(env.UID, c.id, c.name, i, title, material, nowSec()).run();
    made++;
  }
  return made;
}

// ---------- Hoja de estudio de un tema ----------
const SHEET = `Eres un tutor universitario dominicano excelente. Escribes la HOJA DE ESTUDIO de un tema para el cuaderno de la materia: debe ser LARGA y completa (entre 900 y 1400 palabras), clara y en español sencillo, para que un estudiante pueda estudiar de ahí sin abrir nada más.
Usa EXACTAMENTE estos encabezados (con ##), en este orden:
## En pocas palabras
## Conceptos clave
## Explicación detallada
## Ejemplos paso a paso
## Errores comunes
## Preguntas de práctica
## Cómo repasarlo
Reglas: usa **negritas** en los términos importantes; en «Conceptos clave» y «Errores comunes» usa viñetas que empiecen con «- »; en «Explicación detallada» explica el porqué de cada idea con párrafos breves; en «Ejemplos paso a paso» resuelve 2 o 3 ejemplos completos y concretos; en «Preguntas de práctica» pon 6 preguntas, cada una seguida de su respuesta en la línea siguiente que empiece con «Respuesta: ».
Usa el material del EVA como base. Si el material es escaso, explica el tema con conocimiento general CORRECTO y empieza con una línea que diga «Basado en el título del tema (el EVA trae poco material).». NUNCA inventes datos propios del curso (fechas, notas, nombres, páginas ni citas textuales).
Al final escribe una línea «=== TARJETAS ===» y debajo 10 a 12 fichas de repaso, una por línea, con el formato «P: pregunta | R: respuesta corta».`;

async function processTopic(env: Env, t: Topic): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  try {
    const raw = await llmComplete(env, [
      { role: 'system', content: SHEET },
      { role: 'user', content: `Materia: ${t.course}\nTema ${t.idx}: ${t.title}\n\nMATERIAL DEL EVA:\n${t.material || '(sin material, solo el título)'}` },
    ], { maxTokens: 4300, temperature: 0.4 });
    const { body, cards } = parseSheet(raw);
    if (body.length < 900) throw new Error('La IA devolvió una hoja muy corta. Se reintenta.');
    const now = nowSec();
    const note = await env.DB.prepare('INSERT INTO notes (user_id, course, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(env.UID, t.course, `Tema ${t.idx}: ${t.title}`.slice(0, 160), body.slice(0, 19500), now, now).run();
    if (cards.length) await env.DB.batch(cards.map((c) => env.DB.prepare('INSERT INTO cards (user_id, course, front, back, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(env.UID, t.course, c.front, c.back, now, now)));
    await env.DB.prepare(`UPDATE study_topics SET status = 'done', note_id = ?, error = NULL, updated_at = ? WHERE id = ?`).bind(note.meta.last_row_id, now, t.id).run();
    // ¿Era el último tema de la materia? Aviso.
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM study_topics WHERE user_id = ? AND course_id = ? AND status != 'done'`).bind(env.UID, t.course_id).first<{ n: number }>();
    if (!left?.n) {
      const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM study_topics WHERE user_id = ? AND course_id = ?').bind(env.UID, t.course_id).first<{ n: number }>();
      await sendToMe(env, blocks('📓 *Tu cuaderno está listo*', `*${t.course}*`, `${total?.n ?? 0} hojas de estudio con fichas, en Estudio → Cuadernos.`),
        { title: '📓 Tu cuaderno está listo', tag: `estudio-${t.course_id}`, url: '/#apuntes', pushBody: `${t.course} · ${total?.n ?? 0} hojas`, type: 'avisos' }).catch(() => {});
    }
    return { ok: true, title: t.title };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 250);
    await env.DB.prepare(`UPDATE study_topics SET status = 'error', error = ?, updated_at = ? WHERE id = ?`).bind(msg, nowSec(), t.id).run();
    return { ok: false, error: msg };
  }
}

async function nextTopic(env: Env, retryErrors = false): Promise<Topic | null> {
  if (retryErrors) await env.DB.prepare(`UPDATE study_topics SET status = 'pending' WHERE user_id = ? AND status = 'error'`).bind(env.UID).run();
  const t = await env.DB.prepare(`SELECT id, course_id, course, idx, title, material, status, updated_at FROM study_topics
    WHERE user_id = ? AND (status = 'pending' OR (status = 'working' AND updated_at < ?)) ORDER BY course_id, idx LIMIT 1`).bind(env.UID, nowSec() - 240).first<Topic>();
  if (!t) return null;
  await env.DB.prepare(`UPDATE study_topics SET status = 'working', updated_at = ? WHERE id = ?`).bind(nowSec(), t.id).run();
  return t;
}

/** Respaldo desde el cron: si quedan temas por escribir, escribe uno por vuelta aunque cierres la pestaña. */
export async function processNextTopic(env: Env): Promise<string[]> {
  const t = await nextTopic(env);
  if (!t) return [];
  const r = await processTopic(env, t);
  return [`Cuaderno ${t.course} · ${t.title}: ${r.ok ? 'escrito' : r.error}`];
}

export function registerEstudio(app: App) {
  /** Estado del recorrido: por materia, cuántos temas hay, cuántos están escritos y cuáles faltan por escanear. */
  app.get('/api/estudio/estado', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT course_id, course, status, COUNT(*) AS n FROM study_topics WHERE user_id = ? GROUP BY course_id, course, status`).bind(c.env.UID).all<{ course_id: number; course: string; status: string; n: number }>();
    const map = new Map<number, { course_id: number; course: string; total: number; done: number; error: number }>();
    for (const r of results) {
      const m = map.get(r.course_id) || { course_id: r.course_id, course: r.course, total: 0, done: 0, error: 0 };
      m.total += r.n; if (r.status === 'done') m.done += r.n; if (r.status === 'error') m.error += r.n;
      map.set(r.course_id, m);
    }
    const { results: unscanned } = await c.env.DB.prepare(`SELECT id, name FROM courses WHERE user_id = ? AND active = 1 AND moodle_id IS NOT NULL AND id NOT IN (SELECT course_id FROM study_topics WHERE user_id = ?) ORDER BY name`).bind(c.env.UID, c.env.UID).all<{ id: number; name: string }>();
    return c.json({ cursos: [...map.values()], sinEscanear: unscanned });
  });

  /** Escanea UNA materia por llamada (el EVA gratis limita las llamadas por ejecución). */
  app.post('/api/estudio/escanear', async (c) => {
    if (!c.env.MOODLE_TOKEN) return c.json({ error: 'Conecta tu EVA en Conexiones para que Rumbo pueda recorrerlo.' }, 400);
    const b = await c.req.json<{ course_id?: number }>().catch(() => ({} as { course_id?: number }));
    const course = b.course_id
      ? await c.env.DB.prepare('SELECT id, moodle_id, name FROM courses WHERE id = ? AND user_id = ? AND moodle_id IS NOT NULL').bind(b.course_id, c.env.UID).first<{ id: number; moodle_id: number; name: string }>()
      : await c.env.DB.prepare(`SELECT id, moodle_id, name FROM courses WHERE user_id = ? AND active = 1 AND moodle_id IS NOT NULL AND id NOT IN (SELECT course_id FROM study_topics WHERE user_id = ?) ORDER BY name LIMIT 1`).bind(c.env.UID, c.env.UID).first<{ id: number; moodle_id: number; name: string }>();
    if (!course) return c.json({ done: true });
    try { const made = await scanCourse(c.env, course); return c.json({ course: course.name, topics: made }); }
    catch (e) { return c.json({ error: `No pude leer «${course.name}» en el EVA: ${(e as Error).message}` }, 502); }
  });

  /** Escribe la hoja del siguiente tema pendiente. El navegador la llama en bucle y el cron la sigue de respaldo. */
  app.post('/api/estudio/procesar', async (c) => {
    const b = await c.req.json<{ retry?: boolean }>().catch(() => ({} as { retry?: boolean }));
    const t = await nextTopic(c.env, !!b.retry);
    if (!t) return c.json({ idle: true });
    const r = await processTopic(c.env, t);
    const left = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM study_topics WHERE user_id = ? AND status IN ('pending', 'working')`).bind(c.env.UID).first<{ n: number }>();
    return c.json({ course: t.course, title: t.title, ok: r.ok, error: r.ok ? undefined : r.error, left: left?.n ?? 0 });
  });

  /** «Pregúntale a tus cuadernos»: responde con tus hojas y tus clases, citando de dónde sale. */
  app.post('/api/cuadernos/ask', async (c) => {
    const b = await c.req.json<{ q?: string; course?: string }>().catch(() => ({} as { q?: string; course?: string }));
    const q = String(b.q || '').trim().slice(0, 300);
    if (q.length < 3) return c.json({ error: 'Escribe tu pregunta.' }, 400);
    const { results: notes } = await c.env.DB.prepare(`SELECT id, course, title, body FROM notes WHERE user_id = ?${b.course ? ' AND course = ?' : ''} ORDER BY updated_at DESC LIMIT 400`)
      .bind(...(b.course ? [c.env.UID, b.course] : [c.env.UID])).all<{ id: number; course: string | null; title: string; body: string }>();
    const { results: cls } = await c.env.DB.prepare(`SELECT id, title, course, notes FROM class_sessions WHERE user_id = ? AND status = 'ready' AND notes IS NOT NULL ORDER BY started_at DESC LIMIT 40`).bind(c.env.UID).all<{ id: number; title: string; course: string | null; notes: string }>();
    const docs = [
      ...notes.map((n) => ({ id: `n${n.id}`, titulo: n.title || 'Hoja', curso: n.course, texto: n.body })),
      ...cls.map((k) => {
        let texto = '';
        try { const j = JSON.parse(k.notes) as { resumen?: string; explicacion?: { titulo: string; texto: string }[] }; texto = [j.resumen || '', ...(j.explicacion || []).map((e) => `${e.titulo}\n${e.texto}`)].join('\n'); } catch { /* sin notas */ }
        return { id: `c${k.id}`, titulo: `Clase: ${k.title}`, curso: k.course, texto };
      }),
    ];
    const top = topChunks(docs, q);
    if (!top.length) return c.json({ respuesta: 'No encontré nada sobre eso en tus cuadernos ni en tus clases. Prueba con otras palabras, o arma los cuadernos de estudio para tener más material.', fuentes: [] });
    const ctx = top.map((t, i) => `[${i + 1}] ${t.titulo}${t.curso ? ` (${t.curso})` : ''}\n${t.texto}`).join('\n\n');
    const resp = await llmComplete(c.env, [
      { role: 'system', content: 'Respondes preguntas de un estudiante usando SOLO los fragmentos de sus cuadernos y clases que te doy. Responde en español sencillo, en máximo 160 palabras, y cita las fuentes con [1], [2]… Si los fragmentos no alcanzan para responder, dilo claramente y di qué sí encontraste. No inventes nada.' },
      { role: 'user', content: `Pregunta: ${q}\n\nFRAGMENTOS:\n${ctx}` },
    ], { maxTokens: 700, temperature: 0.2 });
    return c.json({ respuesta: resp.trim(), fuentes: top.map((t, i) => ({ n: i + 1, titulo: t.titulo, curso: t.curso })) });
  });
}
