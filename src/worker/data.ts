// Consultas compartidas por la API, el asistente y el cron.
import type { Env } from './env';
import { getSetting, getSettings, setSetting } from './db';
import { courseLabel, money } from './wa';
import { cuandoTexto, daysBetween, fechaCorta, fechaLarga, localDate, localToUnix, MESES, nowSec } from './time';
import { streak } from './widget';

export type Task = {
  id: number; title: string; due_at: number | null; url: string | null; source: string; status: string; notes: string | null; submitted_at: number | null;
  grade: number | null; grade_max: number | null; grade_feedback?: string | null; facilitator: string | null;
  focus_minutes?: number; description?: string | null; grade_source?: string | null; moodle_key?: string | null;
  forum_posts?: number | null; forum_replies?: number | null; forum_needed?: number | null; attachments?: string | null;
  course_id: number | null; course_name: string | null; course_short: string | null; course_color: string | null;
};

export type CourseSummary = {
  id: number; code: string | null; name: string; short_name: string | null; color: string; facilitator: string | null; facilitator_eva: string | null;
  graded: number; total: number; average: number | null; pending_tasks: number;
  /** Créditos de la asignatura según el pensum (3 si no se encuentra): pesan en el índice. */
  credits?: number;
  /** 1 si el promedio usa los pesos del EVA (cada actividad vale lo que dice el libro de calificaciones). */
  weighted?: number;
  eva_total?: number | null; eva_total_max?: number | null;
};

type GradeRow = { id: number; moodle_item_id: number | null; grade: number | null; grade_max: number; weight: number | null };

/** Promedio de una asignatura: con los pesos del EVA si todas las notas los traen; si no, todas valen igual. */
export function courseAverage(rows: GradeRow[]): { avg: number | null; weighted: boolean } {
  const g = rows.filter((r) => r.grade !== null && r.grade_max > 0);
  if (!g.length) return { avg: null, weighted: false };
  const weighted = g.every((r) => (r.weight ?? 0) > 0);
  if (weighted) {
    const w = g.reduce((a, r) => a + r.weight!, 0);
    return { avg: g.reduce((a, r) => a + (r.grade! / r.grade_max) * 100 * r.weight!, 0) / w, weighted };
  }
  return { avg: g.reduce((a, r) => a + (r.grade! / r.grade_max) * 100, 0) / g.length, weighted };
}

/** Una nota por actividad (los foros traen dos renglones: vale el que tiene nota). */
export async function bestGrades(env: Env, courseId?: number): Promise<(GradeRow & { course_id: number })[]> {
  const { results } = await env.DB.prepare(`WITH best AS (SELECT g.id, g.course_id, g.moodle_item_id, g.grade, g.grade_max, g.weight FROM grades g WHERE g.user_id = ?1 AND g.id = (SELECT g2.id FROM grades g2
      WHERE g2.course_id = g.course_id AND COALESCE(g2.moodle_key, 'i' || g2.id) = COALESCE(g.moodle_key, 'i' || g.id) ORDER BY g2.grade IS NULL, g2.id LIMIT 1))
    SELECT * FROM best${courseId ? ' WHERE course_id = ?2' : ''}`).bind(...(courseId ? [env.UID, courseId] : [env.UID])).all<GradeRow & { course_id: number }>();
  return results;
}

export type PayWindow = {
  state: 'open' | 'closed'; period: string; opensAt: number; closesAt: number;
  daysToOpen: number; daysToClose: number; paid: boolean; amount: string; openDay: number; closeDay: number;
};

export async function listTasks(env: Env, opts: { status?: string; from?: number; to?: number; limit?: number; id?: number } = {}): Promise<Task[]> {
  const where: string[] = ['t.user_id = ?'];
  const binds: unknown[] = [env.UID];
  if (opts.status) { where.push('t.status = ?'); binds.push(opts.status); }
  if (opts.id !== undefined) { where.push('t.id = ?'); binds.push(opts.id); }
  if (opts.from !== undefined) { where.push('(t.due_at IS NULL OR t.due_at >= ?)'); binds.push(opts.from); }
  if (opts.to !== undefined) { where.push('(t.due_at IS NULL OR t.due_at <= ?)'); binds.push(opts.to); }
  const sql = `SELECT t.id, t.title, t.due_at, t.url, t.source, t.status, t.notes, t.submitted_at, t.course_id, t.focus_minutes,${opts.id !== undefined ? ' t.description,' : ''}
      c.name AS course_name, c.short_name AS course_short, c.color AS course_color,
      COALESCE(NULLIF(c.facilitator, ''), c.facilitator_eva) AS facilitator,
      g.grade AS grade, g.grade_max AS grade_max, g.feedback AS grade_feedback, g.source AS grade_source,
      t.moodle_key, t.forum_posts, t.forum_replies, t.forum_needed${opts.id !== undefined ? ', t.attachments' : ''}
    FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    -- Un foro trae dos renglones de nota («calificación» y «foro completo»): se usa el que tiene nota.
    LEFT JOIN grades g ON g.id = (SELECT g2.id FROM grades g2 WHERE g2.user_id = t.user_id AND g2.moodle_key = t.moodle_key ORDER BY g2.grade IS NULL, g2.updated_at DESC LIMIT 1)
    WHERE ${where.join(' AND ')}
    ORDER BY ${opts.status === 'done' ? 'COALESCE(t.due_at, t.submitted_at, t.updated_at) DESC' : 't.due_at IS NULL, t.due_at ASC'} LIMIT ?`;
  binds.push(opts.limit ?? 200);
  const { results } = await env.DB.prepare(sql).bind(...binds).all<Task>();
  return results;
}

export async function courseSummaries(env: Env): Promise<CourseSummary[]> {
  // Cada actividad cuenta una vez (los foros traen dos renglones de nota: vale el que tiene nota).
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.code, c.name, c.short_name, c.color, c.facilitator, c.facilitator_eva, c.eva_total, c.eva_total_max,
      (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id AND t.status = 'pending') AS pending_tasks
    FROM courses c WHERE c.user_id = ? AND c.active = 1 ORDER BY c.name`).bind(env.UID).all<CourseSummary>();
  const rows = await bestGrades(env);
  // Créditos de cada asignatura (por código o por nombre en el pensum) para que el índice pese como en la UAPA.
  const { results: pen } = await env.DB.prepare('SELECT code, name, credits FROM pensum WHERE user_id = ?').bind(env.UID).all<{ code: string | null; name: string; credits: number }>().catch(() => ({ results: [] as { code: string | null; name: string; credits: number }[] }));
  const nz = (t: unknown) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const creditsOf = (c: CourseSummary) => pen.find((f) => (c.code && f.code === c.code) || (nz(f.name).length > 6 && (nz(f.name).includes(nz(c.name)) || nz(c.name).includes(nz(f.name)))))?.credits || 3;
  return results.map((r) => {
    const mine = rows.filter((g) => g.course_id === r.id);
    const { avg, weighted } = courseAverage(mine);
    return { ...r, credits: creditsOf(r), graded: mine.filter((g) => g.grade !== null).length, total: mine.length, average: avg === null ? null : Math.round(avg * 10) / 10, weighted: weighted ? 1 : 0 };
  });
}

export type GradeMatch = { course: string; item: string; grade: number | null; grade_max: number; updated_at: number };

export async function allGrades(env: Env): Promise<GradeMatch[]> {
  const { results } = await env.DB.prepare(`
    SELECT c.name AS course, g.item_name AS item, g.grade AS grade, g.grade_max AS grade_max, g.updated_at AS updated_at
    FROM grades g JOIN courses c ON c.id = g.course_id
    WHERE c.user_id = ? AND c.active = 1 ORDER BY g.updated_at DESC`).bind(env.UID).all<GradeMatch>();
  return results;
}

/** Índice del trimestre: promedio de las asignaturas ponderado por créditos. */
export function overallAverage(courses: CourseSummary[]): number | null {
  const g = courses.filter((c) => c.average !== null && c.average !== undefined);
  if (!g.length) return null;
  const w = g.reduce((a, c) => a + (c.credits || 3), 0);
  return Math.round((g.reduce((a, c) => a + c.average! * (c.credits || 3), 0) / w) * 10) / 10;
}

export type IndexTrend = { now: number | null; prev: number | null; prevAt: number | null; changedAt: number | null; hist: { t: number; v: number }[] };

/** Guarda el índice cada vez que cambia (avg_hist) y dice cuál era el anterior. */
export async function indexTrend(env: Env): Promise<IndexTrend> {
  const now = overallAverage(await courseSummaries(env));
  let hist: { t: number; v: number }[] = [];
  try { hist = JSON.parse(await getSetting(env, 'avg_hist', '[]')) || []; } catch { hist = []; }
  if (now !== null && (!hist.length || Math.abs(hist[hist.length - 1].v - now) >= 0.05)) {
    hist.push({ t: nowSec(), v: now });
    hist = hist.slice(-40);
    await setSetting(env, 'avg_hist', JSON.stringify(hist));
  }
  const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
  return { now, prev: prev ? prev.v : null, prevAt: prev ? prev.t : null, changedAt: hist.length ? hist[hist.length - 1].t : null, hist: hist.slice(-12) };
}

export function trendText(tr: IndexTrend | null): string | null {
  if (!tr || tr.now === null || tr.prev === null || Math.abs(tr.now - tr.prev) < 0.05) return null;
  const d = Math.round((tr.now - tr.prev) * 10) / 10;
  return `Tu índice ${d > 0 ? 'subió' : 'bajó'} de ${tr.prev} a ${tr.now} (${d > 0 ? '+' : ''}${d})`;
}

/** Resumen de la semana tipo historia (Inicio y cierre del domingo). */
export async function weekStory(env: Env) {
  const now = nowSec(), from = now - 7 * 86400;
  const s = await getSettings(env);
  const { results: done } = await env.DB.prepare(`SELECT t.title, c.short_name AS course FROM tasks t LEFT JOIN courses c ON c.id = t.course_id WHERE t.user_id = ? AND t.status = 'done' AND COALESCE(t.submitted_at, t.updated_at) >= ? ORDER BY COALESCE(t.submitted_at, t.updated_at) DESC`).bind(env.UID, from).all<{ title: string; course: string | null }>();
  const { results: grades } = await env.DB.prepare(`SELECT g.item_name AS item, g.grade, g.grade_max AS max, c.short_name AS course, c.color FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.updated_at >= ? ORDER BY g.grade / g.grade_max DESC`).bind(env.UID, from).all<{ item: string; grade: number; max: number; course: string | null; color: string }>();
  const { results: next } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'pending' AND due_at BETWEEN ? AND ?`).bind(env.UID, now, now + 7 * 86400).all<{ n: number }>();
  const tr = await indexTrend(env);
  const g = grades.map((r) => ({ item: String(r.item || '').replace(/\s+(calificaci[oó]n|foro completo)$/i, ''), grade: Math.round(r.grade * 100) / 100, max: r.max, course: r.course, color: r.color }));
  const avgWeek = g.length ? Math.round((g.reduce((a, x) => a + (x.grade / x.max) * 100, 0) / g.length) * 10) / 10 : null;
  return {
    name: (s.student_name || '').split(' ')[0],
    range: `${fechaCorta(localDate(env, from + 86400))} – ${fechaCorta(localDate(env, now))}`,
    done: done.length,
    doneList: done.slice(0, 4).map((d) => ({ title: d.title, course: d.course || 'Personal' })),
    grades: g.slice(0, 4),
    gradesCount: g.length,
    avgWeek,
    index: tr.now,
    indexPrev: tr.prev,
    trend: trendText(tr),
    streak: await streak(env),
    nextWeek: next[0]?.n || 0,
  };
}

/** Asignaturas activas sin nada nuevo del EVA (tareas, notas o avisos) en `days` días. */
export async function staleCourses(env: Env, days = 10) {
  const now = nowSec();
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.name, c.short_name,
      MAX(COALESCE((SELECT MAX(created_at) FROM tasks t WHERE t.course_id = c.id AND t.source = 'eva'), 0),
          COALESCE((SELECT MAX(updated_at) FROM grades g WHERE g.course_id = c.id), 0),
          COALESCE((SELECT MAX(created_at) FROM announcements a WHERE a.course_id = c.id), 0)) AS last
    FROM courses c WHERE c.user_id = ? AND c.active = 1`).bind(env.UID).all<{ id: number; name: string; short_name: string | null; last: number }>();
  return results.filter((r) => r.last > 0 && now - r.last > days * 86400).map((r) => ({ ...r, days: Math.floor((now - r.last) / 86400) }));
}

/** Ventana de pago mensual (por defecto del día 25 al día 5 del mes siguiente). */
export async function payWindow(env: Env, settings?: Record<string, string>): Promise<PayWindow> {
  const s = settings ?? (await getSettings(env));
  const openDay = Number(s.pay_open_day || 25);
  const closeDay = Number(s.pay_close_day || 5);
  const now = localDate(env);
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  const crosses = closeDay < openDay;
  let open: boolean, py: number, pm: number;
  if (crosses) {
    if (d >= openDay) { open = true; py = y; pm = m; }
    else if (d <= closeDay) { open = true; py = m === 1 ? y - 1 : y; pm = m === 1 ? 12 : m - 1; }
    else { open = false; py = y; pm = m; }
  } else {
    if (d >= openDay && d <= closeDay) { open = true; py = y; pm = m; }
    else if (d < openDay) { open = false; py = y; pm = m; }
    else { open = false; py = m === 12 ? y + 1 : y; pm = m === 12 ? 1 : m + 1; }
  }
  const opensAt = localToUnix(env, py, pm, openDay, 0, 0);
  const cy = crosses ? (pm === 12 ? py + 1 : py) : py;
  const cm = crosses ? (pm === 12 ? 1 : pm + 1) : pm;
  const closesAt = localToUnix(env, cy, cm, closeDay, 23, 59);
  const period = `${py}-${String(pm).padStart(2, '0')}`;
  const paid = !!(await env.DB.prepare('SELECT 1 AS x FROM payments WHERE user_id = ? AND period = ?').bind(env.UID, period).first());
  const now_ = nowSec();
  return {
    state: open ? 'open' : 'closed', period, opensAt, closesAt,
    daysToOpen: Math.max(0, daysBetween(env, now_, opensAt)), daysToClose: Math.max(0, daysBetween(env, now_, closesAt)),
    paid, amount: s.pay_amount || '', openDay, closeDay,
  };
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export async function termProgress(env: Env, s: Record<string, string>): Promise<number | null> {
  if (!s.term_start || !s.term_end) return null;
  const [sy, sm, sd] = s.term_start.split('-').map(Number);
  const [ey, em, ed] = s.term_end.split('-').map(Number);
  const a = localToUnix(env, sy, sm, sd), b = localToUnix(env, ey, em, ed, 23, 59);
  const p = (nowSec() - a) / (b - a);
  return Math.round(Math.min(1, Math.max(0, p)) * 100);
}

export async function dashboard(env: Env) {
  const s = await getSettings(env);
  const now = nowSec();
  const endOfToday = (() => { const d = localDate(env); return localToUnix(env, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 59); })();
  const pending = await listTasks(env, { status: 'pending', from: now - 3 * 86400, limit: 100 });
  const overdue = pending.filter((t) => t.due_at !== null && t.due_at < now);
  const today = pending.filter((t) => t.due_at !== null && t.due_at >= now && t.due_at <= endOfToday);
  const week = pending.filter((t) => t.due_at !== null && t.due_at > endOfToday && t.due_at <= now + 7 * 86400);
  const courses = await courseSummaries(env);
  const pay = await payWindow(env, s);
  // Últimas notas de tus entregas (las más recientes primero).
  const { results: recentGrades } = await env.DB.prepare(`SELECT t.id FROM tasks t JOIN grades g ON g.user_id = t.user_id AND g.moodle_key = t.moodle_key
    WHERE t.user_id = ? AND g.grade IS NOT NULL GROUP BY t.id ORDER BY MAX(g.updated_at) DESC, t.due_at DESC LIMIT 5`).bind(env.UID).all<{ id: number }>();
  const graded = recentGrades.length ? (await listTasks(env, { limit: 400 })).filter((t) => recentGrades.some((r) => r.id === t.id))
    .sort((a, b) => recentGrades.findIndex((r) => r.id === a.id) - recentGrades.findIndex((r) => r.id === b.id)) : [];
  // Progreso de la semana (lunes a domingo): cuántas entregas con fecha esta semana ya están listas.
  const ld = localDate(env);
  const dow = (ld.getUTCDay() + 6) % 7; // 0 = lunes
  const weekStart = localToUnix(env, ld.getUTCFullYear(), ld.getUTCMonth() + 1, ld.getUTCDate() - dow, 0, 0);
  const wk = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM tasks WHERE user_id = ? AND due_at >= ? AND due_at < ?`)
    .bind(env.UID, weekStart, weekStart + 7 * 86400).first<{ total: number; done: number | null }>();
  const { results: news } = await env.DB.prepare(`SELECT a.id, a.title, a.kind, a.created_at, a.read, c.name AS course_name FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.user_id = ? AND (a.source = 'avisos' OR a.kind IN ('pago', 'evento') OR a.source = 'correo') ORDER BY a.created_at DESC LIMIT 3`).bind(env.UID).all();
  const unread = await env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements WHERE user_id = ? AND read = 0 AND (source = 'avisos' OR kind IN ('pago', 'evento') OR source = 'correo')`).bind(env.UID).first<{ n: number }>();
  const fresh = await env.DB.prepare(`SELECT a.id, a.ext_id, a.title, a.body, a.url, a.course_id, a.created_at, c.name AS course_name, c.color AS course_color
    FROM announcements a LEFT JOIN courses c ON c.id = a.course_id WHERE a.user_id = ? AND a.source = 'notas' AND a.read = 0 AND a.created_at > ? ORDER BY a.created_at DESC LIMIT 1`)
    .bind(env.UID, now - 4 * 86400).first<{ id: number; ext_id: string; title: string; body: string; url: string | null; course_id: number | null; created_at: number; course_name: string | null; course_color: string | null }>();
  let freshGrade = null;
  if (fresh) {
    const [, itemId, grade] = fresh.ext_id.split(':').map(Number);
    const rows = fresh.course_id ? await bestGrades(env, fresh.course_id) : [];
    const now1 = courseAverage(rows).avg;
    const before = courseAverage(rows.filter((r) => r.moodle_item_id !== itemId && r.id !== itemId)).avg;
    const row = rows.find((r) => r.moodle_item_id === itemId || r.id === itemId);
    freshGrade = {
      id: fresh.id, title: fresh.title.replace(/^\S+\s/, '').replace(/:\s*[\d.,]+\/[\d.,]+$/, ''), grade, max: row?.grade_max ?? 100,
      feedback: fresh.body.startsWith('Comentario del facilitador:') ? fresh.body.replace('Comentario del facilitador:', '').trim() : '',
      course: fresh.course_name, color: fresh.course_color, url: fresh.url,
      average: now1 === null ? null : Math.round(now1 * 10) / 10,
      delta: now1 !== null && before !== null ? Math.round((now1 - before) * 10) / 10 : null,
    };
  }
  // Metas de la semana (las eliges en Inicio): a tiempo, un día antes, promedio mínimo.
  const goalIds = (s.goals || '').split(',').filter(Boolean);
  const goals: { id: string; label: string; done: number; total: number; ok: boolean; detail: string }[] = [];
  if (goalIds.length) {
    const { results: wkTasks } = await env.DB.prepare(`SELECT status, due_at, submitted_at FROM tasks WHERE user_id = ? AND due_at >= ? AND due_at < ?`)
      .bind(env.UID, weekStart, weekStart + 7 * 86400).all<{ status: string; due_at: number; submitted_at: number | null }>();
    for (const g of goalIds) {
      if (g === 'atiempo') {
        const due = wkTasks.filter((t) => t.due_at <= now);
        const ok = due.filter((t) => t.status === 'done').length;
        goals.push({ id: g, label: 'Entregar todo a tiempo', done: ok, total: due.length, ok: ok === due.length, detail: due.length ? `${ok} de ${due.length} entregas que ya vencieron` : 'Todavía no vence nada esta semana' });
      } else if (g === 'antes') {
        const done = wkTasks.filter((t) => t.status === 'done' && t.submitted_at);
        const early = done.filter((t) => t.submitted_at! <= t.due_at - 86400).length;
        goals.push({ id: g, label: 'Entregar un día antes', done: early, total: wkTasks.length, ok: wkTasks.length > 0 && early === wkTasks.length, detail: `${early} de ${wkTasks.length} entregas de la semana con un día de margen` });
      } else if (g.startsWith('promedio:')) {
        const target = Number(g.split(':')[1]) || 90;
        const { results: wkGrades } = await env.DB.prepare(`SELECT grade, grade_max FROM grades WHERE user_id = ? AND grade IS NOT NULL AND grade_max > 0 AND updated_at >= ?`).bind(env.UID, weekStart).all<{ grade: number; grade_max: number }>();
        const avg = wkGrades.length ? wkGrades.reduce((a, x) => a + (x.grade / x.grade_max) * 100, 0) / wkGrades.length : null;
        goals.push({ id: g, label: `Promedio de ${target} o más`, done: avg === null ? 0 : Math.round(avg * 10) / 10, total: target, ok: avg !== null && avg >= target, detail: avg === null ? 'Sin notas nuevas esta semana' : `Esta semana vas con ${Math.round(avg * 10) / 10} (${wkGrades.length} nota${wkGrades.length === 1 ? '' : 's'})` });
      }
    }
  }
  return {
    goals, goalIds,
    freshGrade,
    news, unreadNews: unread?.n ?? 0,
    weekProgress: { total: wk?.total ?? 0, done: wk?.done ?? 0 },
    graded,
    today: fechaLarga(localDate(env)),
    name: s.student_name || '',
    termProgress: await termProgress(env, s),
    counts: { pending: pending.filter((t) => t.due_at === null || t.due_at >= now).length, today: today.length, week: week.length, overdue: overdue.length },
    average: overallAverage(courses),
    tasks: pending.filter((t) => t.due_at === null || t.due_at >= now - 3 * 86400).slice(0, 12),
    courses,
    pay,
    lastSync: Number(s.eva_last_sync || 0) || null,
    lastSyncError: s.eva_last_error || '',
    summaryHour: Number(s.summary_hour || 7),
  };
}

/** Texto del resumen diario que llega por WhatsApp. */
/** Versión corta del resumen para la notificación del teléfono (cabe en 3-4 líneas). */
export async function summaryShort(env: Env): Promise<string> {
  const d = await dashboard(env);
  const now = nowSec();
  const next = d.tasks.find((t) => t.due_at !== null && t.due_at >= now);
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now).length;
  const parts: string[] = [];
  if (d.counts.today) parts.push(`📌 Hoy cierra${d.counts.today > 1 ? 'n' : ''} ${d.counts.today} entrega${d.counts.today > 1 ? 's' : ''}`);
  else if (d.counts.week) parts.push(`📅 ${d.counts.week} entrega${d.counts.week > 1 ? 's' : ''} esta semana`);
  else parts.push('✅ Nada pendiente esta semana');
  if (next) parts.push(`Lo próximo: ${next.title}${next.course_short ? ' (' + next.course_short + ')' : ''}, ${cuandoTexto(env, next.due_at!)}`);
  if (overdue) parts.push(`⚠️ ${overdue} vencida${overdue > 1 ? 's' : ''} sin marcar`);
  const p = d.pay;
  if (!p.paid && p.state === 'open') parts.push(`💳 La cuota cierra en ${p.daysToClose} día(s)`);
  if (d.average !== null) parts.push(`📊 Promedio ${d.average}`);
  return parts.join('\n');
}

/**
 * Resumen del día para los avisos (WhatsApp y notificaciones): por secciones, fácil de leer de un vistazo
 * y sin "responde…", porque por ahí no se contesta. (El asistente usa summaryText, que sí invita a responder.)
 */
export async function summaryAlert(env: Env): Promise<string> {
  const d = await dashboard(env);
  const now = nowSec();
  const hr = localDate(env).getUTCHours();
  const saludo = hr < 12 ? '☀️ *Buenos días' : hr < 19 ? '🌤️ *Buenas tardes' : '🌙 *Buenas noches';
  const item = (t: Task) => { const c = courseLabel(t.course_name, t.course_short); return `• ${t.title}${c ? ` _(${c})_` : ''} · ${t.due_at ? (t.due_at < now ? 'venció ' : '') + cuandoTexto(env, t.due_at) : 'sin fecha'}`; };
  const endToday = (() => { const l = localDate(env); return localToUnix(env, l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate(), 23, 59); })();
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now);
  const today = d.tasks.filter((t) => t.due_at !== null && t.due_at >= now && t.due_at <= endToday);
  const soon = d.tasks.filter((t) => t.due_at === null || t.due_at > endToday).slice(0, 5);
  const B: string[] = [`${saludo}${d.name ? ', ' + d.name : ''}*\n_${d.today.charAt(0).toUpperCase() + d.today.slice(1)}_`];
  B.push(today.length ? `📌 *Hoy ${today.length === 1 ? 'cierra 1 entrega' : `cierran ${today.length} entregas`}*\n${today.map(item).join('\n')}` : '✅ *Hoy no vence nada*');
  if (overdue.length) B.push(`⚠️ *Atrasadas*\n${overdue.map(item).join('\n')}`);
  if (soon.length) B.push(`📅 *Lo que viene*\n${soon.map(item).join('\n')}`);
  const p = d.pay, extra: string[] = [];
  if (!p.paid && p.state === 'open') extra.push(`💳 *Pago:* la ventana cierra en ${p.daysToClose} día${p.daysToClose === 1 ? '' : 's'}${p.amount ? ` · ${money(p.amount)}` : ''}`);
  else if (!p.paid && p.daysToOpen <= 3) extra.push(`💳 *Pago:* la ventana abre en ${p.daysToOpen} día${p.daysToOpen === 1 ? '' : 's'}`);
  if (d.average !== null) extra.push(`📊 *Promedio:* ${d.average}`);
  if (extra.length) B.push(extra.join('\n'));
  return B.join('\n\n');
}

export async function summaryText(env: Env): Promise<string> {
  const d = await dashboard(env);
  const lines: string[] = [];
  const hr = localDate(env).getUTCHours();
  const saludo = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
  lines.push(`*${saludo}${d.name ? ', ' + d.name : ''}.* Tu resumen de hoy, ${d.today}:`);
  lines.push('');
  const now = nowSec();
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now);
  const upcoming = d.tasks.filter((t) => t.due_at === null || t.due_at >= now);
  if (overdue.length) {
    lines.push('*Vencidas sin marcar:*');
    overdue.forEach((t) => lines.push(`• ${t.title}${t.course_short ? ' (' + t.course_short + ')' : ''} · #${t.id}`));
    lines.push('');
  }
  if (upcoming.length) {
    lines.push('*Pendientes:*');
    upcoming.slice(0, 8).forEach((t) => lines.push(`• ${t.title}${t.course_short ? ' (' + t.course_short + ')' : ''} · ${t.due_at ? cuandoTexto(env, t.due_at) : 'sin fecha'} · #${t.id}`));
  } else {
    lines.push('No tienes entregas pendientes. Buen trabajo.');
  }
  lines.push('');
  const p = d.pay;
  if (p.paid) lines.push(`*Pago:* la cuota de ${periodLabel(p.period)} ya está registrada.`);
  else if (p.state === 'open') lines.push(`*Pago:* la ventana está abierta; cierra en ${p.daysToClose} día(s)${p.amount ? ' · RD$ ' + p.amount : ''}. Responde "pagué" cuando pagues.`);
  else if (p.daysToOpen <= 7) lines.push(`*Pago:* la ventana abre en ${p.daysToOpen} día(s), el día ${p.openDay}.`);
  if (d.average !== null) lines.push(`*Promedio de actividades:* ${d.average}`);
  lines.push('');
  lines.push('Responde "tareas", "notas", "pagos" o "ayuda".');
  return lines.join('\n');
}
