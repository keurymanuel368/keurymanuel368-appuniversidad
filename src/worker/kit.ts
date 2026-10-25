// Apuntes por materia y tarjetas de repaso con repetición espaciada.
import type { Hono } from 'hono';
import type { Env } from './env';
import { nowSec } from './time';
import { llmComplete } from './llm';

type App = Hono<{ Bindings: Env }>;
const clean = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);

/** Siguiente repaso: 0 = otra vez, 1 = difícil, 2 = bien, 3 = fácil (SM-2 simplificado). */
export function nextReview(card: { ease: number; interval_days: number; reps: number }, grade: 0 | 1 | 2 | 3) {
  let { ease, interval_days: iv, reps } = card;
  if (grade === 0) { reps = 0; iv = 0; ease = Math.max(1.3, ease - 0.2); return { ease, interval_days: 0, reps, due_in: 600 }; } // se vuelve a ver en 10 min
  ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  reps += 1;
  if (reps === 1) iv = grade === 3 ? 3 : 1;
  else if (reps === 2) iv = grade === 1 ? 2 : grade === 3 ? 6 : 4;
  else iv = Math.max(1, iv * (grade === 1 ? 1.2 : ease * (grade === 3 ? 1.3 : 1)));
  return { ease, interval_days: iv, reps, due_in: Math.round(iv * 86400) };
}

export function registerKit(app: App) {
  // ---- Apuntes ----
  app.get('/api/notes', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT id, course, title, body, pinned, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC LIMIT 300').bind(c.env.UID).all();
    return c.json(results);
  });
  app.post('/api/notes', async (c) => {
    const b = await c.req.json<{ course?: string; title?: string; body?: string }>();
    const now = nowSec();
    const r = await c.env.DB.prepare('INSERT INTO notes (user_id, course, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(c.env.UID, clean(b.course, 120) || null, clean(b.title, 160), String(b.body ?? '').slice(0, 20000), now, now).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  });
  app.patch('/api/notes/:id', async (c) => {
    const b = await c.req.json<{ course?: string | null; title?: string; body?: string; pinned?: boolean }>();
    const sets: string[] = ['updated_at = ?']; const binds: unknown[] = [nowSec()];
    if ('course' in b) { sets.push('course = ?'); binds.push(clean(b.course, 120) || null); }
    if ('title' in b) { sets.push('title = ?'); binds.push(clean(b.title, 160)); }
    if ('body' in b) { sets.push('body = ?'); binds.push(String(b.body ?? '').slice(0, 20000)); }
    if ('pinned' in b) { sets.push('pinned = ?'); binds.push(b.pinned ? 1 : 0); }
    await c.env.DB.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds, Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });
  app.delete('/api/notes/:id', async (c) => {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });

  // ---- Tarjetas ----
  app.get('/api/cards', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT id, course, front, back, interval_days, reps, due_at FROM cards WHERE user_id = ? ORDER BY due_at LIMIT 1000').bind(c.env.UID).all();
    const now = nowSec();
    return c.json({ cards: results, due: results.filter((r) => (r.due_at as number) <= now).length });
  });
  app.post('/api/cards', async (c) => {
    const b = await c.req.json<{ course?: string; front?: string; back?: string; cards?: { front: string; back: string }[] }>();
    const list = b.cards?.length ? b.cards : [{ front: b.front || '', back: b.back || '' }];
    const now = nowSec();
    const stmts = list.filter((x) => clean(x.front, 600) && clean(x.back, 2000)).slice(0, 100)
      .map((x) => c.env.DB.prepare('INSERT INTO cards (user_id, course, front, back, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(c.env.UID, clean(b.course, 120) || null, clean(x.front, 600), clean(x.back, 2000), now, now));
    if (!stmts.length) return c.json({ error: 'Escribe el frente y el reverso de la tarjeta.' }, 400);
    await c.env.DB.batch(stmts);
    return c.json({ ok: true, count: stmts.length });
  });
  app.post('/api/cards/:id/review', async (c) => {
    const { grade } = await c.req.json<{ grade: 0 | 1 | 2 | 3 }>();
    const id = Number(c.req.param('id'));
    const card = await c.env.DB.prepare('SELECT ease, interval_days, reps FROM cards WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<{ ease: number; interval_days: number; reps: number }>();
    if (!card) return c.json({ error: 'No encontré la tarjeta.' }, 404);
    const n = nextReview(card, ([0, 1, 2, 3].includes(grade) ? grade : 2) as 0 | 1 | 2 | 3);
    await c.env.DB.prepare('UPDATE cards SET ease = ?, interval_days = ?, reps = ?, due_at = ? WHERE id = ?').bind(n.ease, n.interval_days, n.reps, nowSec() + n.due_in, id).run();
    return c.json({ ok: true, next_in_days: n.interval_days });
  });
  // Tarjetas armadas por la IA a partir del texto de un apunte (se devuelven para revisarlas; no se guardan solas)
  app.post('/api/cards/generate', async (c) => {
    const { text, course } = await c.req.json<{ text?: string; course?: string }>();
    const src = String(text || '').trim().slice(0, 6000);
    if (src.length < 40) return c.json({ error: 'Escribe un poco más en el apunte para poder armar tarjetas.' }, 400);
    const raw = await llmComplete(c.env, [
      { role: 'system', content: 'Eres un tutor universitario dominicano. Con el apunte del estudiante crea de 4 a 8 tarjetas de repaso. Responde SOLO con JSON: {"cards":[{"front":"pregunta corta","back":"respuesta breve y exacta"}]}. Sin texto fuera del JSON. Español claro.' },
      { role: 'user', content: `${course ? 'Materia: ' + course + '\n' : ''}${src}` },
    ], { maxTokens: 900, temperature: 0.3 });
    let j: { cards?: { front?: string; back?: string }[] } | null = null;
    try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { /* respuesta rara */ }
    const cards = (j?.cards || []).filter((x) => x.front && x.back).slice(0, 8).map((x) => ({ front: clean(x.front, 600), back: clean(x.back, 2000) }));
    if (!cards.length) return c.json({ error: 'La IA no devolvió tarjetas válidas. Inténtalo otra vez.' }, 502);
    return c.json({ cards });
  });
  app.patch('/api/cards/:id', async (c) => {
    const b = await c.req.json<{ front?: string; back?: string; course?: string | null }>();
    const sets: string[] = []; const binds: unknown[] = [];
    if (b.front !== undefined) { sets.push('front = ?'); binds.push(clean(b.front, 600)); }
    if (b.back !== undefined) { sets.push('back = ?'); binds.push(clean(b.back, 2000)); }
    if ('course' in b) { sets.push('course = ?'); binds.push(clean(b.course, 120) || null); }
    if (sets.length) await c.env.DB.prepare(`UPDATE cards SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds, Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });
  app.delete('/api/cards/:id', async (c) => {
    await c.env.DB.prepare('DELETE FROM cards WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
    return c.json({ ok: true });
  });
}
