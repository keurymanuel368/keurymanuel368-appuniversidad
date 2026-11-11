// Clase en vivo: el navegador manda trozos de audio de 30 s; aquí se transcriben (el audio NO se guarda),
// se detectan las preguntas que te hacen (con respuesta lista para decir) y al terminar se arma el resumen,
// la explicación detallada, las tarjetas y las preguntas de examen.
import type { Hono } from 'hono';
import type { Env } from './env';
import { classes } from './horario';
import { groqTranscribe, llmComplete } from './llm';
import { transcribeAudio } from './voice';
import { sendToMe } from './notify';
import { blocks } from './wa';
import { localDate, nowSec } from './time';

type App = Hono<{ Bindings: Env }>;

export type Qa = { id: string; at: number; dirigida: 'tu' | 'clase'; pregunta: string; corta: string; completa: string; tip?: string };
export type ClassNotes = {
  resumen: string; temas: string[];
  explicacion: { titulo: string; texto: string }[];
  conceptos: { termino: string; definicion: string }[];
  pendientes: string[];
  tarjetas: { front: string; back: string }[];
  examen: { pregunta: string; respuesta: string }[];
};
type Row = { id: number; title: string; course: string | null; started_at: number; updated_at: number; ended_at: number | null; status: string; transcript: string; chunks: number; qa: string | null; work: string | null; notes: string | null; error: string | null };

// ---------- Utilidades puras (con pruebas) ----------
/** Whisper inventa frases cuando solo hay silencio o música: se descartan. */
export function isGhost(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return true;
  return /^(gracias por (ver|vernos|su atenci[oó]n)|subt[ií]tulos|suscr[ií]bete|¡?hasta (la pr[oó]xima|luego)|amara\.org|\.+$|m[uú]sica)/i.test(t) && t.length < 80;
}
export const fmtAt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const NAME = /\b(keury|keuri|queury|kiury|kery|keiry|quiri|keyri|kiuri|manuel|dur[aá]n)\b/i;
const ASK = /[?¿]|\b(alguien|qui[eé]n|pueden|puede|podr[ií]a|podr[ií]an|cu[aá]l|cu[aá]les|c[oó]mo|por qu[eé]|qu[eé] opina|qu[eé] piensa|participa|responde|me dice|nos dice|explique|diga)\b/i;
/** ¿Vale la pena preguntarle a la IA si hubo una pregunta? (evita gastar IA en cada fragmento) */
export const hasCue = (text: string) => NAME.test(text) || ASK.test(text);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const sameQuestion = (a: string, b: string) => { const x = norm(a).slice(0, 48), y = norm(b).slice(0, 48); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

const PART = 9000;
export function splitParts(t: string): string[] {
  const out: string[] = []; let cur = '';
  for (const l of t.split('\n')) { if (cur.length + l.length > PART && cur) { out.push(cur); cur = ''; } cur += l + '\n'; }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseJson(raw: string): Record<string, unknown> | null {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
}
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

export function normalizeNotes(a: Record<string, unknown> | null, b: Record<string, unknown> | null): ClassNotes {
  return {
    resumen: str(a?.resumen, 3000),
    temas: arr(a?.temas).map((x) => str(x, 120)).filter(Boolean).slice(0, 12),
    explicacion: arr(a?.explicacion).map((x) => { const o = (x || {}) as Record<string, unknown>; return { titulo: str(o.titulo, 140), texto: str(o.texto, 4000) }; }).filter((x) => x.titulo && x.texto).slice(0, 12),
    conceptos: arr(a?.conceptos).map((x) => { const o = (x || {}) as Record<string, unknown>; return { termino: str(o.termino, 100), definicion: str(o.definicion, 500) }; }).filter((x) => x.termino && x.definicion).slice(0, 24),
    pendientes: arr(a?.pendientes).map((x) => str(x, 300)).filter(Boolean).slice(0, 12),
    tarjetas: arr(b?.tarjetas).map((x) => { const o = (x || {}) as Record<string, unknown>; return { front: str(o.front, 400), back: str(o.back, 900) }; }).filter((x) => x.front && x.back).slice(0, 30),
    examen: arr(b?.examen).map((x) => { const o = (x || {}) as Record<string, unknown>; return { pregunta: str(o.pregunta, 400), respuesta: str(o.respuesta, 900) }; }).filter((x) => x.pregunta && x.respuesta).slice(0, 20),
  };
}

// ---------- Preguntas en vivo ----------
async function detect(env: Env, s: Row, force: boolean): Promise<Qa | null> {
  if (!force && !hasCue(s.transcript.slice(-500))) return null;
  const qa: Qa[] = s.qa ? JSON.parse(s.qa) : [];
  const prev = qa.slice(-4).map((q) => q.pregunta).join(' | ') || 'ninguna';
  const win = s.transcript.slice(-3000);
  const raw = await llmComplete(env, [
    { role: 'system', content: `Eres el copiloto en vivo de Keury Durán, estudiante de Ingeniería de Software de la UAPA, durante la clase «${s.title}». Recibes la transcripción reciente (sin separar hablantes; Whisper puede escribir mal los nombres: «Keury» puede salir como Queury, Kiuri, Keuri o Manuel).
Decide si en lo ÚLTIMO (los últimos 60 a 90 segundos, lo que está al final) el profesor o alguien:
- le hizo una pregunta a Keury, lo nombró para participar o le pidió opinar → dirigida="tu"
- hizo una pregunta abierta a toda la clase que Keury podría contestar → dirigida="clase"
- no hay ninguna pregunta reciente → dirigida="no"
Devuelve la pregunta aunque alguien ya la haya respondido en el audio (el estudiante quiere ver la respuesta correcta). Solo ignora las que ya aparecen en la lista de ya detectadas.
Si hay pregunta, redacta lo que Keury puede decir en voz alta:
- "corta": 1 o 2 frases, directa, natural, en español dominicano formal hablado, lista para decir tal cual. Empieza con la respuesta, sin rodeos.
- "completa": 4 a 6 frases por si piden que amplíe, con un ejemplo si ayuda.
Usa lo dicho en la clase y conocimiento correcto. NO inventes datos concretos (fechas, cifras, nombres) que no se dijeron. Si la pregunta depende de algo que no se alcanzó a escuchar, da una respuesta prudente y sugiere pedir que la repitan ("¿Me puede repetir la pregunta, profesor?") en "tip".
Responde SOLO con JSON: {"dirigida":"tu|clase|no","pregunta":"la pregunta limpia","corta":"…","completa":"…","tip":"opcional"}` },
    { role: 'user', content: `Clase: ${s.title}${s.course ? ` (${s.course})` : ''}\nPreguntas ya detectadas (no las repitas): ${prev}\n${force ? 'El estudiante pulsó «¿Qué me preguntaron?»: busca la pregunta más reciente aunque sea indirecta.\n' : ''}\nTRANSCRIPCIÓN RECIENTE (lo último está al final):\n${win}` },
  ], { maxTokens: 600, temperature: 0.2 });
  const j = parseJson(raw);
  const dir = str(j?.dirigida, 10);
  const pregunta = str(j?.pregunta, 400), corta = str(j?.corta, 700);
  if (!j || (dir !== 'tu' && dir !== 'clase') || !pregunta || !corta) return null;
  if (qa.some((q) => sameQuestion(q.pregunta, pregunta))) return null;
  const at = Math.max(0, nowSec() - s.started_at);
  const item: Qa = { id: `${s.id}-${qa.length + 1}`, at, dirigida: dir, pregunta, corta, completa: str(j.completa, 1500) || corta, tip: str(j.tip, 300) || undefined };
  await env.DB.prepare('UPDATE class_sessions SET qa = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify([...qa, item]), s.id, env.UID).run();
  return item;
}

// ---------- Resumen y explicación (por pasos, para no pasar de los límites de tiempo) ----------
const EXPLAIN = `Explicas clases universitarias a un estudiante dominicano de Ingeniería de Software, con claridad: como un buen tutor que se asegura de que se entienda. Corrige los errores de la transcripción (nombres, términos técnicos). No copies la transcripción: reorganiza y explica. Usa **negritas** para los términos clave.`;

async function processStep(env: Env, id: number): Promise<{ status: string; done?: number; total?: number; error?: string }> {
  const s = await env.DB.prepare('SELECT * FROM class_sessions WHERE id = ? AND user_id = ?').bind(id, env.UID).first<Row>();
  if (!s) return { status: 'error', error: 'Clase no encontrada' };
  if (s.status === 'ready') return { status: 'ready' };
  try {
    if (s.transcript.trim().length < 200) throw new Error('La clase quedó casi sin audio transcrito, no hay nada que explicar.');
    let work: { total: number; sums: (string | null)[] } = s.work ? JSON.parse(s.work) : { total: -1, sums: [] };
    if (work.total < 0) {
      const parts = s.transcript.length > 14000 ? splitParts(s.transcript) : [];
      work = { total: parts.length, sums: parts.map(() => null) };
    }
    // Fragmentos largos: se resumen de 3 en 3.
    if (work.total > 0 && work.sums.some((x) => x === null)) {
      const parts = splitParts(s.transcript);
      const todo = work.sums.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0).slice(0, 3);
      const out = await Promise.all(todo.map((i) => llmComplete(env, [
        { role: 'system', content: `${EXPLAIN}\nResume este fragmento de la clase «${s.title}» en un máximo de 350 palabras: temas tratados, definiciones y ejemplos que dio el profesor, fechas/tareas/exámenes mencionados y preguntas hechas.` },
        { role: 'user', content: parts[i] || '' },
      ], { maxTokens: 900, temperature: 0.2 })));
      todo.forEach((i, k) => { work.sums[i] = out[k].trim() || '(sin contenido)'; });
      await env.DB.prepare('UPDATE class_sessions SET work = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(work), nowSec(), id).run();
      const done = work.sums.filter((x) => x !== null).length;
      if (done < work.total) return { status: 'processing', done, total: work.total };
    }
    // Composición final (dos llamadas en paralelo).
    const material = work.total > 0 ? work.sums.join('\n\n---\n\n') : s.transcript;
    const head = `Clase: ${s.title}${s.course ? ` (${s.course})` : ''}\n\n${work.total > 0 ? 'RESÚMENES POR FRAGMENTO' : 'TRANSCRIPCIÓN'}:\n${material.slice(0, 60000)}`;
    const [a, b] = await Promise.all([
      llmComplete(env, [
        { role: 'system', content: `${EXPLAIN}\nResponde SOLO con JSON: {"resumen":"6 a 10 líneas con lo esencial de la clase","temas":["tema"],"explicacion":[{"titulo":"tema explicado","texto":"explicación detallada pero fácil de entender, 2 a 4 párrafos separados por \\n\\n, con ejemplos sencillos y el porqué de cada idea"}],"conceptos":[{"termino":"…","definicion":"definición corta y clara"}],"pendientes":["tarea, examen, fecha o aviso que se mencionó"]}\nHaz entre 4 y 8 temas en "explicacion", en el orden de la clase. "pendientes" solo con cosas que de verdad se dijeron.` },
        { role: 'user', content: head },
      ], { maxTokens: 5000, temperature: 0.3 }),
      llmComplete(env, [
        { role: 'system', content: `${EXPLAIN}\nPrepara el material de estudio. Responde SOLO con JSON: {"tarjetas":[{"front":"pregunta o término","back":"respuesta corta y clara"}],"examen":[{"pregunta":"pregunta tipo examen","respuesta":"respuesta modelo"}]}\nHaz 12 a 20 tarjetas y 8 a 12 preguntas de examen, solo sobre lo visto en la clase, variando entre definir, comparar, aplicar y explicar el porqué.` },
        { role: 'user', content: head },
      ], { maxTokens: 3500, temperature: 0.3 }),
    ]);
    const notes = normalizeNotes(parseJson(a), parseJson(b));
    if (!notes.resumen || !notes.explicacion.length) throw new Error('La IA no devolvió la explicación completa. Inténtalo otra vez.');
    await env.DB.prepare(`UPDATE class_sessions SET status = 'ready', notes = ?, error = NULL, updated_at = ? WHERE id = ?`).bind(JSON.stringify(notes), nowSec(), id).run();
    await sendToMe(env, blocks('📚 *Tu clase ya está explicada*', `*${s.title}*`, 'Resumen, explicación detallada, tarjetas y preguntas de examen listos en Estudio → Clases.'),
      { title: '📚 Tu clase ya está explicada', tag: `clase-${id}`, url: '/#apuntes', pushBody: s.title.slice(0, 120), type: 'avisos' }).catch(() => {});
    return { status: 'ready' };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await env.DB.prepare(`UPDATE class_sessions SET error = ?, updated_at = ? WHERE id = ?`).bind(msg, nowSec(), id).run();
    return { status: 'error', error: msg };
  }
}

/** Respaldo desde el cron: cierra clases que quedaron abiertas y sigue procesando las que no se terminaron. */
export async function processPendingClasses(env: Env): Promise<string[]> {
  const log: string[] = [];
  const now = nowSec();
  await env.DB.prepare(`UPDATE class_sessions SET status = 'processing', ended_at = updated_at WHERE user_id = ? AND status = 'live' AND updated_at < ?`).bind(env.UID, now - 2400).run();
  const s = await env.DB.prepare(`SELECT id FROM class_sessions WHERE user_id = ? AND status = 'processing' AND updated_at < ? ORDER BY id LIMIT 1`).bind(env.UID, now - 120).first<{ id: number }>();
  if (s) { const r = await processStep(env, s.id); log.push(`Clase ${s.id}: ${r.status}`); }
  return log;
}

export function registerClases(app: App) {
  const get = (env: Env, id: number) => env.DB.prepare('SELECT * FROM class_sessions WHERE id = ? AND user_id = ?').bind(id, env.UID).first<Row>();

  /** Qué clase toca ahora según tu horario (para poner el nombre solo). */
  app.get('/api/clases/now', async (c) => {
    const d = localDate(c.env);
    const dow = (d.getUTCDay() + 6) % 7, nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    const iso = d.toISOString().slice(0, 10);
    const hit = (await classes(c.env)).find((k) => k.day === dow && nowMin >= k.start_min - 20 && nowMin <= k.end_min + 20 && (!k.start_date || iso >= k.start_date) && (!k.end_date || iso <= k.end_date));
    return c.json({ title: hit?.title || '', course: hit?.title || '' });
  });

  app.get('/api/clases', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT id, title, course, started_at, ended_at, status, chunks, length(transcript) AS chars, qa FROM class_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 200`).bind(c.env.UID).all<{ id: number; title: string; course: string | null; started_at: number; ended_at: number | null; status: string; chunks: number; chars: number; qa: string | null }>();
    return c.json(results.map((r) => ({ id: r.id, title: r.title, course: r.course, started_at: r.started_at, ended_at: r.ended_at, status: r.status, chunks: r.chunks, words: Math.round(r.chars / 6), questions: r.qa ? (JSON.parse(r.qa) as Qa[]).length : 0 })));
  });

  app.post('/api/clases', async (c) => {
    const b = await c.req.json<{ title?: string; course?: string }>().catch(() => ({} as { title?: string; course?: string }));
    const now = nowSec();
    const title = str(b.title, 120) || 'Clase';
    const r = await c.env.DB.prepare('INSERT INTO class_sessions (user_id, title, course, started_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(c.env.UID, title, str(b.course, 120) || title, now, now).run();
    return c.json({ id: r.meta.last_row_id });
  });

  app.get('/api/clases/:id', async (c) => {
    const s = await get(c.env, Number(c.req.param('id')));
    if (!s) return c.json({ error: 'Clase no encontrada' }, 404);
    return c.json({ id: s.id, title: s.title, course: s.course, started_at: s.started_at, ended_at: s.ended_at, status: s.status, chunks: s.chunks, transcript: s.transcript,
      qa: s.qa ? JSON.parse(s.qa) : [], notes: s.notes ? JSON.parse(s.notes) : null, error: s.error, work: s.work ? JSON.parse(s.work) : null });
  });

  /** Un trozo de audio (≈30 s): se transcribe, se agrega al texto y se revisa si hubo una pregunta. El audio no se guarda. */
  app.post('/api/clases/:id/chunk', async (c) => {
    const id = Number(c.req.param('id'));
    const s = await get(c.env, id);
    if (!s) return c.json({ error: 'Clase no encontrada' }, 404);
    if (s.status !== 'live') return c.json({ error: 'La clase ya terminó' }, 409);
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.length < 800) return c.json({ text: '', qa: null, skipped: true });
    if (buf.length > 3_000_000) return c.json({ error: 'Trozo de audio demasiado grande' }, 413);
    const mime = (c.req.header('content-type') || 'audio/webm').split(';')[0];
    const offset = Math.max(0, Number(c.req.header('x-offset') || 0) || 0);
    const force = c.req.header('x-force') === '1';
    const tail = s.transcript.replace(/\[[\d:]+\]\s*/g, '').trim().slice(-260);
    const prompt = `Clase de ${s.title} en la UAPA (República Dominicana). Habla el profesor y estudiantes, entre ellos Keury Durán.${tail ? ` Continúa esta conversación: ${tail}` : ''}`;
    let text = '';
    try {
      const g = await groqTranscribe(c.env, buf, mime, prompt).catch(() => null);
      text = g !== null ? g : await transcribeAudio(c.env, buf, mime);
    } catch (e) { return c.json({ error: (e as Error).message }, 502); }
    text = text.trim();
    const real = !!text && !isGhost(text);
    if (real) {
      await c.env.DB.prepare(`UPDATE class_sessions SET transcript = transcript || ?, chunks = chunks + 1, updated_at = ? WHERE id = ? AND user_id = ?`)
        .bind(`[${fmtAt(offset)}] ${text}\n`, nowSec(), id, c.env.UID).run();
    } else {
      await c.env.DB.prepare('UPDATE class_sessions SET updated_at = ? WHERE id = ? AND user_id = ?').bind(nowSec(), id, c.env.UID).run();
    }
    const fresh = await get(c.env, id);
    const cue = force || (fresh ? hasCue(fresh.transcript.slice(-500)) : false);
    return c.json({ text: real ? text : '', cue });
  });

  /** Revisa si hubo una pregunta y arma la respuesta. Va aparte del trozo para que la transcripción salga al instante. */
  app.post('/api/clases/:id/detect', async (c) => {
    const id = Number(c.req.param('id'));
    const s = await get(c.env, id);
    if (!s) return c.json({ error: 'Clase no encontrada' }, 404);
    const b = await c.req.json<{ force?: boolean }>().catch(() => ({} as { force?: boolean }));
    let qa: Qa | null = null;
    try { qa = await detect(c.env, s, !!b.force); } catch (e) { console.log('Clase: detección falló: ' + (e as Error).message); }
    // Segunda pantalla: si te preguntaron a ti, también llega al celular con la respuesta corta.
    if (qa && qa.dirigida === 'tu') {
      c.executionCtx.waitUntil(sendToMe(c.env, blocks('❓ *Te preguntaron*', qa.pregunta, `💬 ${qa.corta}`),
        { title: '❓ Te preguntaron', tag: `clase-q-${qa.id}`, url: '/#apuntes', pushBody: `${qa.pregunta.slice(0, 90)} → ${qa.corta.slice(0, 120)}`, type: 'avisos' }).catch(() => {}));
    }
    return c.json({ qa });
  });

  app.post('/api/clases/:id/end', async (c) => {
    const id = Number(c.req.param('id'));
    const s = await get(c.env, id);
    if (!s) return c.json({ error: 'Clase no encontrada' }, 404);
    if (s.status === 'live') await c.env.DB.prepare(`UPDATE class_sessions SET status = 'processing', ended_at = ?, updated_at = ? WHERE id = ?`).bind(nowSec(), nowSec(), id).run();
    return c.json({ ok: true });
  });

  /** Un paso del resumen; el navegador lo llama hasta que diga «ready» (y el cron lo sigue si cierras la pestaña). */
  app.post('/api/clases/:id/process', async (c) => c.json(await processStep(c.env, Number(c.req.param('id')))));

  app.delete('/api/clases/:id', async (c) => {
    await c.env.DB.prepare('DELETE FROM class_sessions WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });
}
