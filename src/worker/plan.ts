// Plan de la semana: cada domingo, lo que vence de lunes a domingo, ordenado y con cuándo empezar cada cosa.
// Es determinista (no gasta la cuota de IA) y sale por todos los canales (WhatsApp, notificación…).
import type { Env } from './env';
import { getSettings } from './db';
import { listTasks, payWindow, periodLabel } from './data';
import { MESES_CORTO, fechaCorta, horaTexto, localDate, localToUnix, nowSec, ymd } from './time';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export type WeekPlan = { text: string; short: string; count: number };

/** Del próximo lunes (o de hoy si ya empezó la semana) al domingo, a las 11:59 p. m. */
function weekRange(env: Env, now = nowSec()): { from: number; to: number; label: string } {
  const d = localDate(env, now);
  const dow = d.getUTCDay(); // 0 = domingo
  // El domingo se planifica la semana que viene; otro día, lo que queda de esta.
  const daysToSunday = dow === 0 ? 7 : 7 - dow;
  const end = new Date(d.getTime() + daysToSunday * 86400_000);
  const start = dow === 0 ? new Date(d.getTime() + 86400_000) : d;
  const to = localToUnix(env, end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 23, 59);
  const label = `${start.getUTCDate()}${start.getUTCMonth() !== end.getUTCMonth() ? ' ' + MESES_CORTO[start.getUTCMonth()] : ''}–${end.getUTCDate()} ${MESES_CORTO[end.getUTCMonth()]}`;
  return { from: now, to, label };
}

export async function weeklyPlan(env: Env): Promise<WeekPlan> {
  const s = await getSettings(env);
  const now = nowSec();
  const { to, label } = weekRange(env, now);
  const pending = await listTasks(env, { status: 'pending', limit: 200 });
  const overdue = pending.filter((t) => t.due_at !== null && t.due_at < now && t.due_at > now - 7 * 86400);
  const week = pending.filter((t) => t.due_at !== null && t.due_at >= now && t.due_at <= to).sort((a, b) => a.due_at! - b.due_at!);
  const name = (s.student_name || '').split(' ')[0];
  const L: string[] = [`*🗓️ Tu plan de la semana${name ? ', ' + name : ''}* (${label})`];

  if (!week.length && !overdue.length) {
    L.push('', 'No tienes entregas esta semana 🎉. Buen momento para adelantar lecturas o repasar.');
  } else {
    // Día más cargado: para avisarte que adelantes.
    const byDay = new Map<string, typeof week>();
    for (const t of week) {
      const d = localDate(env, t.due_at!);
      const k = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
      byDay.set(k, [...(byDay.get(k) || []), t]);
    }
    const heavy = [...byDay].sort((a, b) => b[1].length - a[1].length)[0];
    L.push(`_${week.length} entrega${week.length === 1 ? '' : 's'}${heavy && heavy[1].length > 1 ? ` · el día más cargado es el ${heavy[0].toLowerCase()} (${heavy[1].length})` : ''}_`);

    if (overdue.length) {
      L.push('', '*⚠️ Primero, lo atrasado:*');
      for (const t of overdue.slice(0, 4)) L.push(`• ${t.title}${t.course_short ? ` (${t.course_short})` : ''}`);
    }
    for (const [day, list] of byDay) {
      L.push('', `*${day}*`);
      for (const t of list) L.push(`• ${t.title}${t.course_short ? ` (${t.course_short})` : ''} · ${horaTexto(localDate(env, t.due_at!))}`);
    }
    // Cuándo empezar: dos días antes de cada entrega; si eso ya pasó, lo antes posible.
    const today = ymd(localDate(env, now)), tomorrow = ymd(localDate(env, now + 86400));
    const starts = week.slice(0, 5).map((t) => {
      // Si faltan más de 36 h, lo más pronto es mañana (el plan llega el domingo en la noche).
      const earliest = t.due_at! - now > 36 * 3600 ? now + 86400 : now;
      const day = ymd(localDate(env, Math.max(t.due_at! - 2 * 86400, earliest)));
      return { t, when: day === today ? 'hoy' : day === tomorrow ? 'mañana' : fechaCorta(localDate(env, t.due_at! - 2 * 86400)) };
    });
    L.push('', '*Orden sugerido:*');
    starts.forEach(({ t, when }, i) => L.push(`${i + 1}. ${t.title} → ${when === 'hoy' ? 'hazla hoy' : 'empieza ' + when}`));
  }

  // Pagos que caen esta semana
  const p = await payWindow(env, s);
  if (!p.paid && p.state === 'open' && p.closesAt <= to) L.push('', `💳 La ventana de pago de ${periodLabel(p.period)} cierra el ${fechaCorta(localDate(env, p.closesAt))}.`);
  else if (!p.paid && p.state === 'closed' && p.opensAt <= to) L.push('', `💳 La ventana de pago abre el ${fechaCorta(localDate(env, p.opensAt))}.`);

  L.push('', 'Tip: abre Rumbo → Tareas → Plan para verlo día por día.');
  const short = week.length ? `${week.length} entrega${week.length === 1 ? '' : 's'}${overdue.length ? ` y ${overdue.length} atrasada${overdue.length === 1 ? '' : 's'}` : ''}. Empieza por: ${week[0].title}` : overdue.length ? `${overdue.length} atrasada${overdue.length === 1 ? '' : 's'} por resolver` : 'Semana libre 🎉';
  return { text: L.join('\n'), short, count: week.length };
}
