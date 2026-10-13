// Rutas de la v32: foros (ver, publicar, borrador de respuesta), entregar archivos al EVA, historial del promedio,
// comentarios de los facilitadores, récord de notas y comprobantes de pago.
import type { Hono } from 'hono';
import type { Env } from './env';
import { getSetting, getSettings, setSetting } from './db';
import { bestGrades, courseAverage, courseSummaries, overallAverage } from './data';
import { htmlToText, moodleCall } from './moodle';
import { llmComplete } from './llm';
import { localDate, nowSec, ymd } from './time';

type App = Hono<{ Bindings: Env }>;

/** Lo que el EVA de la UAPA deja hacer con el token de la app (se revisa en cada sincronización). */
export async function evaCan(env: Env): Promise<{ forumPost: boolean; submit: boolean; submitGrading: boolean; status: boolean }> {
  try { return { forumPost: false, submit: false, submitGrading: false, status: false, ...JSON.parse(await getSetting(env, 'eva_can', '{}')) }; }
  catch { return { forumPost: false, submit: false, submitGrading: false, status: false }; }
}

async function ownTask(env: Env, id: number) {
  return env.DB.prepare('SELECT id, title, moodle_key, course_id, url FROM tasks WHERE id = ? AND user_id = ?').bind(id, env.UID)
    .first<{ id: number; title: string; moodle_key: string | null; course_id: number | null; url: string | null }>();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Texto escrito en Rumbo → HTML sencillo para el foro (párrafos y saltos de línea). */
export const toForumHtml = (text: string) => text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

/** Promedio general de hoy en el historial (uno por día, máximo un año). */
export async function recordAverage(env: Env): Promise<void> {
  const avg = overallAverage(await courseSummaries(env));
  if (avg === null) return;
  const hist = JSON.parse(await getSetting(env, 'avg_history', '[]')) as { d: string; a: number }[];
  const d = ymd(localDate(env));
  const last = hist[hist.length - 1];
  if (last?.d === d) last.a = avg; else hist.push({ d, a: avg });
  await setSetting(env, 'avg_history', JSON.stringify(hist.slice(-365)));
}

export function registerExtras(app: App) {
  app.get('/api/eva/can', async (c) => c.json(await evaCan(c.env)));

  // ----- Foros: ver los mensajes, publicar tu aporte o responder a un compañero -----
  app.get('/api/tasks/:id/forum', async (c) => {
    const t = await ownTask(c.env, Number(c.req.param('id')));
    if (!t?.moodle_key?.startsWith('forum:')) return c.json({ error: 'Esta tarea no es un foro.' }, 400);
    const forumId = Number(t.moodle_key.split(':')[1]);
    const site = await moodleCall<{ userid: number }>(c.env, 'core_webservice_get_site_info');
    type Disc = { id: number; discussion?: number; name?: string; userid?: number; userfullname?: string; numreplies?: number };
    const discs = (await moodleCall<{ discussions?: Disc[] }>(c.env, 'mod_forum_get_forum_discussions', { forumid: forumId, sortorder: -1, page: 0, perpage: 20 })).discussions || [];
    type P = { id: number; parentid?: number | null; author?: { id: number; fullname?: string }; message?: string; timecreated?: number; subject?: string };
    const out = [];
    for (const d of discs.slice(0, 3)) {
      const did = d.discussion ?? d.id;
      const r = await moodleCall<{ posts?: P[] }>(c.env, 'mod_forum_get_discussion_posts', { discussionid: did, sortby: 'created', sortdirection: 'ASC' });
      const posts = (r.posts || []).map((p) => ({ id: p.id, parent: p.parentid || 0, author: p.author?.fullname || 'Alguien', mine: p.author?.id === site.userid, text: htmlToText(p.message).slice(0, 3000), created: p.timecreated || 0, subject: p.subject || '' }));
      const mineIds = new Set(posts.filter((p) => p.mine).map((p) => p.id));
      const root = posts.find((p) => !p.parent) || posts[0];
      // Lo importante primero: el tema, lo tuyo y lo que te respondieron; de los demás, los 40 más recientes.
      const keep = new Set<number>([root?.id, ...posts.filter((p) => p.mine || mineIds.has(p.parent)).map((p) => p.id), ...posts.filter((p) => !p.mine).slice(-40).map((p) => p.id)]);
      out.push({ id: did, name: d.name || root?.subject || 'Discusión', rootId: root?.id ?? null, total: posts.length,
        posts: posts.filter((p) => keep.has(p.id)).map((p) => ({ ...p, toMe: mineIds.has(p.parent) && !p.mine })) });
    }
    return c.json({ discussions: out, can: (await evaCan(c.env)).forumPost });
  });

  app.post('/api/tasks/:id/forum/post', async (c) => {
    const t = await ownTask(c.env, Number(c.req.param('id')));
    if (!t?.moodle_key?.startsWith('forum:')) return c.json({ error: 'Esta tarea no es un foro.' }, 400);
    const b = await c.req.json<{ parentId?: number; message?: string; subject?: string }>().catch(() => ({} as { parentId?: number; message?: string; subject?: string }));
    const message = (b.message || '').trim();
    if (!b.parentId || message.length < 5) return c.json({ error: 'Escribe tu mensaje antes de publicar.' }, 400);
    try {
      const r = await moodleCall<{ postid?: number; warnings?: { message: string }[] }>(c.env, 'mod_forum_add_discussion_post', {
        postid: b.parentId, subject: (b.subject || `Re: ${t.title}`).slice(0, 250), message: toForumHtml(message), messageformat: 1,
      });
      if (!r.postid) return c.json({ error: r.warnings?.[0]?.message || 'El EVA no confirmó la publicación.' }, 502);
      // Que la próxima revisión del foro cuente este mensaje.
      const scanned = JSON.parse(await getSetting(c.env, 'forum_scan', '{}')) as Record<string, number>;
      delete scanned[t.moodle_key.split(':')[1]];
      await setSetting(c.env, 'forum_scan', JSON.stringify(scanned));
      return c.json({ ok: true, postId: r.postid });
    } catch (e) {
      const m = (e as Error).message;
      return c.json({ error: /permis|capabil|acceso|access|nopermission/i.test(m) ? 'El EVA no deja publicar desde aplicaciones en este foro. Ábrelo en el EVA y pega tu texto allí.' : m }, 502);
    }
  });

  // Borrador de respuesta a un compañero (la IA lee su mensaje y la consigna del foro).
  app.post('/api/tasks/:id/forum/draft-reply', async (c) => {
    const t = await ownTask(c.env, Number(c.req.param('id')));
    if (!t) return c.json({ error: 'Tarea no encontrada.' }, 404);
    const b = await c.req.json<{ author?: string; text?: string }>().catch(() => ({} as { author?: string; text?: string }));
    const desc = (await c.env.DB.prepare('SELECT description FROM tasks WHERE id = ?').bind(t.id).first<{ description: string | null }>())?.description || '';
    const reply = await llmComplete(c.env, [
      { role: 'system', content: 'Eres un estudiante universitario dominicano que responde en un foro académico. Escribe una respuesta respetuosa de 1 o 2 párrafos al mensaje del compañero: reconoce algo concreto de su aporte, agrega una idea propia relacionada con la consigna y cierra con una pregunta o reflexión. Español natural, sin saludos largos, sin inventar citas ni datos. Devuelve solo el texto de la respuesta.' },
      { role: 'user', content: `Consigna del foro «${t.title}»:\n${desc.slice(0, 1500) || '(sin consigna)'}\n\nMensaje de ${b.author || 'un compañero'}:\n${(b.text || '').slice(0, 2500)}` },
    ], { maxTokens: 500, temperature: 0.6 });
    return c.json({ text: reply.trim().replace(/^["«]|["»]$/g, '') });
  });

  // ----- Entregar archivos a una tarea del EVA -----
  app.get('/api/tasks/:id/submission', async (c) => {
    const t = await ownTask(c.env, Number(c.req.param('id')));
    if (!t?.moodle_key?.startsWith('assign:')) return c.json({ error: 'Esta actividad no recibe archivos.' }, 400);
    const can = await evaCan(c.env);
    type F = { filename: string; filesize?: number };
    type St = { lastattempt?: { submission?: { status?: string; plugins?: { type: string; fileareas?: { files?: F[] }[] }[] }; submissionsenabled?: boolean; canedit?: boolean; cansubmit?: boolean; caneditowner?: boolean; locked?: boolean; extensionduedate?: number | null }; assignmentdata?: unknown };
    try {
      const r = await moodleCall<St>(c.env, 'mod_assign_get_submission_status', { assignid: Number(t.moodle_key.split(':')[1]) });
      const la = r.lastattempt || {};
      const files = (la.submission?.plugins || []).filter((p) => p.type === 'file').flatMap((p) => (p.fileareas || []).flatMap((a) => a.files || [])).map((f) => ({ name: f.filename, size: f.filesize || 0 }));
      return c.json({ status: la.submission?.status || 'new', files, canEdit: !!la.canedit && can.submit, canSubmit: !!la.cansubmit && can.submitGrading, enabled: la.submissionsenabled !== false, locked: !!la.locked, can });
    } catch (e) { return c.json({ error: (e as Error).message, can }, 502); }
  });

  app.post('/api/tasks/:id/submission', async (c) => {
    const t = await ownTask(c.env, Number(c.req.param('id')));
    if (!t?.moodle_key?.startsWith('assign:')) return c.json({ error: 'Esta actividad no recibe archivos.' }, 400);
    if (!c.env.MOODLE_TOKEN) return c.json({ error: 'Tu EVA no está conectado.' }, 400);
    const form = await c.req.formData();
    const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f);
    if (!files.length) return c.json({ error: 'Elige al menos un archivo.' }, 400);
    if (files.reduce((a, f) => a + f.size, 0) > 40 * 1024 * 1024) return c.json({ error: 'Los archivos pasan de 40 MB. Súbelos desde el EVA.' }, 400);
    // 1) Se suben al área temporal del EVA (todos al mismo itemid)
    let itemid = 0;
    const base = c.env.MOODLE_URL.replace(/\/$/, '');
    for (const f of files) {
      const fd = new FormData();
      fd.append('token', c.env.MOODLE_TOKEN);
      fd.append('filearea', 'draft');
      fd.append('itemid', String(itemid));
      fd.append('file_1', f, f.name);
      const r = await fetch(`${base}/webservice/upload.php`, { method: 'POST', body: fd });
      type Up = { itemid?: number; error?: string };
      const j = await r.json().catch(() => null) as Up[] | Up | null;
      const first: Up | null = Array.isArray(j) ? j[0] ?? null : j;
      if (!r.ok || !first?.itemid) return c.json({ error: `El EVA no aceptó «${f.name}»: ${first?.error || r.status}` }, 502);
      itemid = first.itemid;
    }
    // 2) Se guardan como tu entrega (reemplaza los archivos anteriores de la entrega)
    try {
      const w = await moodleCall<{ message?: string }[]>(c.env, 'mod_assign_save_submission', { assignmentid: Number(t.moodle_key.split(':')[1]), plugindata: { files_filemanager: itemid } });
      if (Array.isArray(w) && w.length) return c.json({ error: w.map((x) => x.message).join(' · ') }, 502);
    } catch (e) { return c.json({ error: (e as Error).message }, 502); }
    return c.json({ ok: true });
  });

  app.post('/api/tasks/:id/submission/submit', async (c) => {
    const t = await ownTask(c.env, Number(c.req.param('id')));
    if (!t?.moodle_key?.startsWith('assign:')) return c.json({ error: 'Esta actividad no recibe archivos.' }, 400);
    try {
      const w = await moodleCall<{ message?: string }[]>(c.env, 'mod_assign_submit_for_grading', { assignmentid: Number(t.moodle_key.split(':')[1]), acceptsubmissionstatement: 1 });
      if (Array.isArray(w) && w.length) return c.json({ error: w.map((x) => x.message).join(' · ') }, 502);
      await c.env.DB.prepare(`UPDATE tasks SET status = 'done', submitted_at = ?, notes = 'Entregada en el EVA', updated_at = ? WHERE id = ?`).bind(nowSec(), nowSec(), t.id).run();
      return c.json({ ok: true });
    } catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });

  // ----- Notas: historial del promedio, comentarios de los facilitadores y récord -----
  app.get('/api/grades/history', async (c) => c.json(JSON.parse(await getSetting(c.env, 'avg_history', '[]'))));

  app.get('/api/feedback-notes', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT g.id, g.item_name, g.grade, g.grade_max, g.feedback, g.updated_at, c.name AS course_name, c.color AS course_color,
        (SELECT t.id FROM tasks t WHERE t.user_id = g.user_id AND t.moodle_key = g.moodle_key LIMIT 1) AS task_id
      FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.user_id = ? AND g.feedback IS NOT NULL AND trim(g.feedback) != '' ORDER BY g.updated_at DESC LIMIT 80`).bind(c.env.UID).all();
    return c.json({ items: results, summary: JSON.parse(await getSetting(c.env, 'feedback_summary', 'null')) });
  });

  app.post('/api/feedback-notes/summary', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT g.item_name, g.grade, g.grade_max, g.feedback, c.name AS course FROM grades g JOIN courses c ON c.id = g.course_id
      WHERE g.user_id = ? AND g.feedback IS NOT NULL AND trim(g.feedback) != '' ORDER BY g.updated_at DESC LIMIT 30`).bind(c.env.UID).all<{ item_name: string; grade: number | null; grade_max: number; feedback: string; course: string }>();
    if (!results.length) return c.json({ error: 'Todavía no tienes comentarios de facilitadores.' }, 400);
    const raw = await llmComplete(c.env, [
      { role: 'system', content: 'Eres un tutor universitario dominicano. Lee los comentarios que los facilitadores le dejaron a un estudiante y responde SOLO con JSON: {"fortalezas": ["2 a 4 cosas que hace bien"], "mejorar": ["2 a 4 cosas concretas para mejorar, accionables"], "consejo": "un consejo corto y motivador"}. Español sencillo; no inventes nada que no esté en los comentarios.' },
      { role: 'user', content: results.map((r) => `${r.course} · ${r.item_name} (${r.grade ?? '—'}/${r.grade_max}): ${r.feedback.slice(0, 500)}`).join('\n\n') },
    ], { maxTokens: 700, temperature: 0.3 });
    let j: { fortalezas?: string[]; mejorar?: string[]; consejo?: string } | null = null;
    try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { /* respuesta rara */ }
    if (!j?.mejorar?.length && !j?.fortalezas?.length) return c.json({ error: 'La IA no devolvió un resumen válido. Inténtalo otra vez.' }, 502);
    const summary = { fortalezas: (j.fortalezas || []).slice(0, 5), mejorar: (j.mejorar || []).slice(0, 5), consejo: j.consejo || '', at: nowSec(), count: results.length };
    await setSetting(c.env, 'feedback_summary', JSON.stringify(summary));
    return c.json(summary);
  });

  // Récord de notas (para imprimir o guardar en PDF desde el teléfono)
  app.get('/api/record', async (c) => {
    const s = await getSettings(c.env);
    const { results: pensum } = await c.env.DB.prepare('SELECT term, code, name, credits, status, grade FROM pensum WHERE user_id = ? ORDER BY term, id').bind(c.env.UID).all();
    const current = await courseSummaries(c.env);
    const rows = await bestGrades(c.env);
    const { results: past } = await c.env.DB.prepare(`SELECT id, code, name FROM courses WHERE user_id = ? AND active = 0 AND moodle_id IS NOT NULL ORDER BY updated_at DESC`).bind(c.env.UID).all<{ id: number; code: string | null; name: string }>();
    return c.json({
      student: s.student_name || s.eva_user || '', career: s.career || '',
      matricula: (await c.env.DB.prepare('SELECT login FROM users WHERE id = ?').bind(c.env.UID).first<{ login: string | null }>())?.login || '',
      current: current.map((x) => ({ code: x.code, name: x.name, average: x.average, graded: x.graded, total: x.total })),
      past: past.map((p) => { const a = courseAverage(rows.filter((r) => r.course_id === p.id)).avg; return { code: p.code, name: p.name, average: a === null ? null : Math.round(a * 10) / 10 }; }),
      pensum, generated: nowSec(),
    });
  });

  // ----- Comprobantes de pago -----
  app.post('/api/payments/:id/receipt', async (c) => {
    const id = Number(c.req.param('id'));
    const own = await c.env.DB.prepare('SELECT id FROM payments WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first();
    if (!own) return c.json({ error: 'Pago no encontrado.' }, 404);
    const b = await c.req.json<{ dataUrl?: string }>().catch(() => ({} as { dataUrl?: string }));
    const m = (b.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return c.json({ error: 'La imagen no es válida.' }, 400);
    if (m[2].length > 1_500_000) return c.json({ error: 'La foto es muy grande. Prueba con otra.' }, 400);
    await c.env.DB.prepare(`INSERT INTO payment_receipts (payment_id, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(payment_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, created_at = excluded.created_at`).bind(id, c.env.UID, m[1], m[2], nowSec()).run();
    return c.json({ ok: true });
  });

  app.get('/api/payments/:id/receipt', async (c) => {
    const r = await c.env.DB.prepare('SELECT mime, data FROM payment_receipts WHERE payment_id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).first<{ mime: string; data: string }>();
    if (!r) return c.json({ error: 'Este pago no tiene comprobante.' }, 404);
    const bin = Uint8Array.from(atob(r.data), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=86400' } });
  });

  app.delete('/api/payments/:id/receipt', async (c) => {
    await c.env.DB.prepare('DELETE FROM payment_receipts WHERE payment_id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });
}
