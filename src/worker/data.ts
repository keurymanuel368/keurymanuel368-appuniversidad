// Consultas compartidas por la API, el asistente y el cron.
import type { Env } from './env';
import { getSettings } from './db';
import { cuandoTexto, daysBetween, fechaLarga, localDate, localToUnix, MESES, nowSec } from './time';

export type Task = {
  id: number; title: string; due_at: number | null; url: string | null; source: string; status: string; notes: string | null; submitted_at: number | null;
  grade: number | null; grade_max: number | null; grade_feedback?: string | null; facilitator: string | null;
  focus_minutes?: number; description?: string | null;
  course_id: number | null; course_name: string | null; course_short: string | null; course_color: string | null;
};

export type CourseSummary = {
  id: number; code: string | null; name: string; short_name: string | null; color: string; facilitator: string | null; facilitator_eva: string | null;
  graded: number; total: number; average: number | null; pending_tasks: number;
};

export type PayWindow = {
  state: 'open' | 'closed'; period: string; opensAt: number; closesAt: number;
  daysToOpen: number; daysToClose: number; paid: boolean; amount: string; openDay: number; closeDay: number;
};

export async function listTasks(env: Env, opts: { status?: string; from?: number; to?: number; limit?: number; id?: number } = {}): Promise<Task[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.status) { where.push('t.status = ?'); binds.push(opts.status); }
  if (opts.id !== undefined) { where.push('t.id = ?'); binds.push(opts.id); }
  if (opts.from !== undefined) { where.push('(t.due_at IS NULL OR t.due_at >= ?)'); binds.push(opts.from); }
  if (opts.to !== undefined) { where.push('(t.due_at IS NULL OR t.due_at <= ?)'); binds.push(opts.to); }
  const sql = `SELECT t.id, t.title, t.due_at, t.url, t.source, t.status, t.notes, t.submitted_at, t.course_id, t.focus_minutes,${opts.id !== undefined ? ' t.description,' : ''}
      c.name AS course_name, c.short_name AS course_short, c.color AS course_color,
      COALESCE(NULLIF(c.facilitator, ''), c.facilitator_eva) AS facilitator,
      g.grade AS grade, g.grade_max AS grade_max, g.feedback AS grade_feedback
    FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    LEFT JOIN grades g ON g.moodle_key IS NOT NULL AND g.moodle_key = t.moodle_key
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${opts.status === 'done' ? 'COALESCE(t.due_at, t.submitted_at, t.updated_at) DESC' : 't.due_at IS NULL, t.due_at ASC'} LIMIT ?`;
  binds.push(opts.limit ?? 200);
  const { results } = await env.DB.prepare(sql).bind(...binds).all<Task>();
  return results;
}

export async function courseSummaries(env: Env): Promise<CourseSummary[]> {
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.code, c.name, c.short_name, c.color, c.facilitator, c.facilitator_eva,
      (SELECT COUNT(*) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL) AS graded,
      (SELECT COUNT(*) FROM grades g WHERE g.course_id = c.id) AS total,
      (SELECT AVG(g.grade * 100.0 / g.grade_max) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL AND g.grade_max > 0) AS average,
      (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id AND t.status = 'pending') AS pending_tasks
    FROM courses c WHERE c.active = 1 ORDER BY c.name`).all<CourseSummary>();
  return results.map((r) => ({ ...r, average: r.average === null ? null : Math.round(r.average * 10) / 10 }));
}

export type GradeMatch = { course: string; item: string; grade: number | null; grade_max: number; updated_at: number };

export async function allGrades(env: Env): Promise<GradeMatch[]> {
  const { results } = await env.DB.prepare(`
    SELECT c.name AS course, g.item_name AS item, g.grade AS grade, g.grade_max AS grade_max, g.updated_at AS updated_at
    FROM grades g JOIN courses c ON c.id = g.course_id
    WHERE c.active = 1 ORDER BY g.updated_at DESC`).all<GradeMatch>();
  return results;
}

export function overallAverage(courses: CourseSummary[]): number | null {
  const vals = courses.map((c) => c.average).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
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
  const paid = !!(await env.DB.prepare('SELECT 1 AS x FROM payments WHERE period = ?').bind(period).first());
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
  const { results: recentGrades } = await env.DB.prepare(`SELECT t.id FROM tasks t JOIN grades g ON g.moodle_key = t.moodle_key
    WHERE g.grade IS NOT NULL ORDER BY g.updated_at DESC, t.due_at DESC LIMIT 5`).all<{ id: number }>();
  const graded = recentGrades.length ? (await listTasks(env, { limit: 400 })).filter((t) => recentGrades.some((r) => r.id === t.id))
    .sort((a, b) => recentGrades.findIndex((r) => r.id === a.id) - recentGrades.findIndex((r) => r.id === b.id)) : [];
  // Progreso de la semana (lunes a domingo): cuántas entregas con fecha esta semana ya están listas.
  const ld = localDate(env);
  const dow = (ld.getUTCDay() + 6) % 7; // 0 = lunes
  const weekStart = localToUnix(env, ld.getUTCFullYear(), ld.getUTCMonth() + 1, ld.getUTCDate() - dow, 0, 0);
  const wk = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM tasks WHERE due_at >= ? AND due_at < ?`)
    .bind(weekStart, weekStart + 7 * 86400).first<{ total: number; done: number | null }>();
  const { results: news } = await env.DB.prepare(`SELECT a.id, a.title, a.kind, a.created_at, a.read, c.name AS course_name FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.source = 'avisos' OR a.kind IN ('pago', 'evento') OR a.source = 'correo' ORDER BY a.created_at DESC LIMIT 3`).all();
  const unread = await env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements WHERE read = 0 AND (source = 'avisos' OR kind IN ('pago', 'evento') OR source = 'correo')`).first<{ n: number }>();
  return {
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
