// Plan de examen: dado un examen (fecha y materia) arma un calendario de estudio día por día con los temas de tu cuaderno
// (los que escribió la IA desde el EVA), repasos cortos, preguntas de práctica y un simulacro. Todo sin gastar IA, salvo el simulacro.
import type { Hono } from 'hono';
import type { Env } from './env';
import { llmComplete } from './llm';
import { localDate, nowSec, ymd } from './time';

type App = Hono<{ Bindings: Env }>;

export type Session = { k: string; kind: 'estudiar' | 'repasar' | 'practicar' | 'simulacro'; title: string; min: number };
export type PlanDay = { date: string; sessions: Session[] };

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diffDays = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

/**
 * Reparte los temas entre hoy y la víspera del examen (máximo 21 días, los últimos antes del examen):
 * primero estudiar cada tema, cada día un repaso corto de lo de ayer, el penúltimo día preguntas de práctica
 * y el último repaso general más un simulacro.
 */
export function buildPlan(topics: string[], today: string, exam: string): PlanDay[] {
  const left = diffDays(today, exam);
  if (left <= 0) return [];
  const n = Math.min(21, left);
  const start = addDays(exam, -n);
  const days: PlanDay[] = Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), sessions: [] }));
  const add = (i: number, kind: Session['kind'], title: string, min: number) => days[i].sessions.push({ k: '', kind, title, min });
  const list = topics.length ? topics : ['Todo el temario del examen'];
  const reserved = n >= 4 ? 2 : n >= 2 ? 1 : 0;
  const studyDays = Math.max(1, n - reserved);
  const per = Math.ceil(list.length / studyDays);
  list.forEach((t, i) => add(Math.min(studyDays - 1, Math.floor(i / per)), 'estudiar', t, 30));
  for (let i = 1; i < studyDays; i++) {
    const prev = days[i - 1].sessions.filter((s) => s.kind === 'estudiar');
    if (prev.length) add(i, 'repasar', `Repasa lo de ayer: ${prev.map((p) => p.title).join(', ').slice(0, 90)}`, 10);
  }
  if (reserved >= 2) add(n - 2, 'practicar', 'Preguntas de práctica de todo el temario', 45);
  add(n - 1, 'repasar', 'Repaso general: tus fichas y tus resúmenes', 30);
  add(n - 1, 'simulacro', 'Simulacro: contesta sin mirar tus apuntes', 30);
  days.forEach((d, di) => d.sessions.forEach((s, si) => { s.k = `d${di}s${si}`; }));
  return days;
}

/** Texto de las preguntas del simulacro: «P: …» y «R: …» → lista. */
export function parseSimulacro(text: string): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  let q = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^\d+[.)]\s*/, '');
    const mq = line.match(/^P(?:regunta)?\s*\d*\s*[:.\-]\s*(.+)$/i);
    const ma = line.match(/^R(?:espuesta)?\s*\d*\s*[:.\-]\s*(.+)$/i);
    if (mq) q = mq[1].trim();
    else if (ma && q) { out.push({ q, a: ma[1].trim() }); q = ''; }
  }
  return out.slice(0, 12);
}

type Row = { id: number; course: string; title: string; exam_at: number; plan: string; done: string; created_at: number };
const shape = (r: Row) => ({ id: r.id, course: r.course, title: r.title, exam_at: r.exam_at, plan: JSON.parse(r.plan) as PlanDay[], done: JSON.parse(r.done) as string[] });

async function topicsOf(env: Env, course: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT title FROM study_topics WHERE user_id = ? AND course = ? ORDER BY idx`).bind(env.UID, course).all<{ title: string }>();
  if (results.length) return results.map((t) => t.title);
  const { results: notes } = await env.DB.prepare(`SELECT title FROM notes WHERE user_id = ? AND course = ? AND title != '' ORDER BY created_at LIMIT 30`).bind(env.UID, course).all<{ title: string }>();
  return notes.map((n) => n.title);
}

/** Lo que toca hoy en los planes de examen que siguen vivos (para el aviso diario). */
export async function examReminder(env: Env): Promise<{ text: string; short: string } | null> {
  const today = ymd(localDate(env));
  const { results } = await env.DB.prepare(`SELECT * FROM exam_plans WHERE user_id = ? AND exam_at > ? ORDER BY exam_at LIMIT 3`).bind(env.UID, nowSec()).all<Row>();
  const lines: string[] = [];
  let first = '';
  for (const r of results) {
    const p = shape(r);
    const day = p.plan.find((d) => d.date === today);
    const pend = (day?.sessions || []).filter((s) => !p.done.includes(s.k));
    if (!pend.length) continue;
    const left = diffDays(today, ymd(localDate(env, r.exam_at)));
    if (!first) first = `${p.course}: ${pend[0].title}`;
    lines.push(`*${p.title}* · ${p.course} _(en ${left} día${left === 1 ? '' : 's'})_\n${pend.map((s) => `• ${s.title} · ${s.min} min`).join('\n')}`);
  }
  if (!lines.length) return null;
  return { text: `🎯 *Tu plan de examen de hoy*\n\n${lines.join('\n\n')}`, short: first };
}

export function registerExamen(app: App) {
  app.get('/api/examenes', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM exam_plans WHERE user_id = ? AND exam_at > ? ORDER BY exam_at`).bind(c.env.UID, nowSec() - 86400).all<Row>();
    const { results: dea } = await c.env.DB.prepare(`SELECT course, title, opens_at FROM uapa_exams WHERE user_id = ? AND opens_at IS NOT NULL AND opens_at > ? ORDER BY opens_at LIMIT 12`).bind(c.env.UID, nowSec()).all<{ course: string | null; title: string; opens_at: number }>();
    const taken = new Set(results.map((r) => `${r.title}|${r.exam_at}`));
    const { results: cursos } = await c.env.DB.prepare(`SELECT name FROM courses WHERE user_id = ? AND active = 1 ORDER BY name`).bind(c.env.UID).all<{ name: string }>();
    return c.json({
      planes: results.map(shape),
      proximos: dea.filter((e) => !taken.has(`${e.title}|${e.opens_at}`)).map((e) => ({ course: e.course || '', title: e.title.replace(/^PRUEBA DE EVALUACIÓN FINAL:\s*/i, 'Examen: '), exam_at: e.opens_at })),
      cursos: cursos.map((x) => x.name),
    });
  });

  app.post('/api/examenes', async (c) => {
    const b = await c.req.json<{ course?: string; title?: string; exam_at?: number }>().catch(() => ({} as { course?: string; title?: string; exam_at?: number }));
    const course = String(b.course || '').trim().slice(0, 120);
    const examAt = Number(b.exam_at);
    if (!course) return c.json({ error: 'Elige la materia del examen.' }, 400);
    if (!examAt || examAt <= nowSec()) return c.json({ error: 'La fecha del examen tiene que ser futura.' }, 400);
    const plan = buildPlan(await topicsOf(c.env, course), ymd(localDate(c.env)), ymd(localDate(c.env, examAt)));
    const title = String(b.title || '').trim().slice(0, 140) || `Examen de ${course}`;
    const r = await c.env.DB.prepare(`INSERT INTO exam_plans (user_id, course, title, exam_at, plan, done, created_at) VALUES (?, ?, ?, ?, ?, '[]', ?) RETURNING id`)
      .bind(c.env.UID, course, title, examAt, JSON.stringify(plan), nowSec()).first<{ id: number }>();
    return c.json({ id: r?.id });
  });

  app.post('/api/examenes/:id/sesion', async (c) => {
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{ k?: string; done?: boolean }>().catch(() => ({} as { k?: string; done?: boolean }));
    const r = await c.env.DB.prepare('SELECT * FROM exam_plans WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<Row>();
    if (!r || !b.k) return c.json({ error: 'No encontré ese plan.' }, 404);
    const done = new Set(JSON.parse(r.done) as string[]);
    if (b.done) done.add(b.k); else done.delete(b.k);
    await c.env.DB.prepare('UPDATE exam_plans SET done = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify([...done]), id, c.env.UID).run();
    return c.json({ ok: true });
  });

  /** Recalcula el plan (por ejemplo cuando ya hay más temas escritos o se movió el día). Conserva lo ya hecho. */
  app.post('/api/examenes/:id/replan', async (c) => {
    const id = Number(c.req.param('id'));
    const r = await c.env.DB.prepare('SELECT * FROM exam_plans WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<Row>();
    if (!r) return c.json({ error: 'No encontré ese plan.' }, 404);
    const plan = buildPlan(await topicsOf(c.env, r.course), ymd(localDate(c.env)), ymd(localDate(c.env, r.exam_at)));
    const keys = new Set(plan.flatMap((d) => d.sessions.map((s) => s.k)));
    const done = (JSON.parse(r.done) as string[]).filter((k) => keys.has(k));
    await c.env.DB.prepare('UPDATE exam_plans SET plan = ?, done = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify(plan), JSON.stringify(done), id, c.env.UID).run();
    return c.json({ ok: true });
  });

  app.delete('/api/examenes/:id', async (c) => {
    await c.env.DB.prepare('DELETE FROM exam_plans WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });

  /** Simulacro: preguntas de práctica con su respuesta, hechas con lo que hay en tus cuadernos de esa materia. */
  app.post('/api/examenes/:id/simulacro', async (c) => {
    const r = await c.env.DB.prepare('SELECT * FROM exam_plans WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).first<Row>();
    if (!r) return c.json({ error: 'No encontré ese plan.' }, 404);
    const { results: notes } = await c.env.DB.prepare(`SELECT title, body FROM notes WHERE user_id = ? AND course = ? ORDER BY updated_at DESC LIMIT 12`).bind(c.env.UID, r.course).all<{ title: string; body: string }>();
    const material = notes.map((n) => `## ${n.title}\n${(n.body || '').slice(0, 900)}`).join('\n\n').slice(0, 7000);
    if (material.length < 200) return c.json({ error: 'Todavía no hay hojas en el cuaderno de esta materia. Arma los cuadernos en Estudio → Cuadernos y vuelve.' }, 400);
    const text = await llmComplete(c.env, [
      { role: 'system', content: 'Eres un profesor que prepara un simulacro de examen. Con SOLO el material que te doy, escribe 10 preguntas variadas (conceptos, ejemplos, aplicación) con su respuesta corta y correcta. Formato exacto, una por línea y en este orden: «P: pregunta» y justo debajo «R: respuesta». Sin numeración, sin introducción, en español sencillo.' },
      { role: 'user', content: `Materia: ${r.course}\nExamen: ${r.title}\n\nMATERIAL:\n${material}` },
    ], { maxTokens: 1400, temperature: 0.3 });
    const preguntas = parseSimulacro(text);
    if (!preguntas.length) return c.json({ error: 'No pude armar el simulacro ahora. Inténtalo otra vez en un momento.' }, 502);
    return c.json({ preguntas });
  });
}
