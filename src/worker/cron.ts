// Tareas programadas: se ejecutan cada 30 minutos (un solo Cron Trigger, gratis).
import type { Env } from './env';
import { activeUsers, forUser, getSettings, markSent, unmarkSent, wasSent } from './db';
import { payWindow, periodLabel, summaryShort, summaryText } from './data';
import { syncEva } from './moodle';
import { flushWhatsApp, sendToMe } from './notify';
import { weeklyPlan } from './plan';
import { announceRelease } from './changelog';
import { backupDue, makeBackup } from './backup';
import { checkHealth } from './health';
import { checkAchievements } from './achievements';
import { cuandoTexto, localDate, nowSec, ymd } from './time';

/**
 * Una vuelta del cron para todos los usuarios. El plan gratis de Cloudflare permite ~50 llamadas externas
 * por ejecución: la sincronización del EVA (la que más llamadas hace) se da a UN usuario por vuelta, el que
 * más tiempo lleva esperando; los avisos (resumen, entregas, pagos) se revisan para todos.
 */
export async function runScheduled(env: Env): Promise<string[]> {
  const log: string[] = [];
  const users = await activeUsers(env);
  const envs = await Promise.all(users.map((u) => forUser(env, u.id, u.role)));
  // A quién le toca el EVA: con token y más atrasado respecto a su intervalo.
  let syncUid = 0, worst = 0;
  for (const ue of envs) {
    if (!ue.MOODLE_TOKEN) continue;
    const s = await getSettings(ue);
    const late = nowSec() - Number(s.eva_last_sync || 0) - Math.max(1, Number(s.eva_sync_hours || 2)) * 3600;
    if (late >= -300 && late + 301 > worst) { worst = late + 301; syncUid = ue.UID; }
  }
  let backupError: string | undefined;
  try { if (await backupDue(env)) { const b = await makeBackup(env); log.push(`Copia de seguridad: ${b.rows} filas`); } }
  catch (e) { backupError = (e as Error).message; log.push('Copia de seguridad: ' + backupError); }
  for (const ue of envs) {
    try {
      const l = await runForUser(ue, ue.UID === syncUid, ue.ROLE === 'admin' ? backupError : undefined);
      if (l.length) log.push(`[${ue.UID}] ${l.join(' · ')}`);
    } catch (e) { log.push(`[${ue.UID}] error: ${(e as Error).message}`); }
  }
  // Limpieza: registros de envío de más de 90 días
  await env.DB.prepare('DELETE FROM sent_log WHERE sent_at < ?').bind(nowSec() - 90 * 86400).run();
  return log;
}

async function runForUser(env: Env, syncNow: boolean, backupError?: string): Promise<string[]> {
  const log: string[] = [];
  // WhatsApp que CallMeBot no aceptó antes por saturación
  try { const n = await flushWhatsApp(env); if (n) log.push(`WhatsApp pendientes: ${n}`); } catch (e) { log.push('WhatsApp: ' + (e as Error).message); }
  const s = await getSettings(env);
  const now = nowSec();
  const local = localDate(env);
  const today = ymd(local);

  // 1) Sincronizar el EVA cada N horas
  if (syncNow && env.MOODLE_TOKEN) {
    try {
      const r = await syncEva(env);
      log.push(`EVA: ${r.tasksNew} nuevas, ${r.tasksUpdated} actualizadas`);
      if (r.newGrades.length) log.push(`Notas nuevas: ${r.newGrades.length}`);
      // Avisos nuevos: los del foro de avisos siempre; los del sistema solo si hablan de pagos o eventos.
      for (const n of r.newNews.filter((x) => x.source === 'avisos' || x.kind === 'pago' || x.kind === 'evento').slice(0, 5)) {
        const icon = n.kind === 'pago' ? '💳' : n.kind === 'evento' ? '🎉' : '📣';
        await sendToMe(env, `*${icon} ${n.title}*${n.course ? `\n_${n.course}_` : ''}\n\n${n.body.slice(0, 700)}`,
          { title: `${icon} ${n.title}`.slice(0, 90), tag: `news-${n.kind}`, url: `/#avisos/${n.id}`, pushBody: `${n.course ? n.course + ' · ' : ''}${n.body.slice(0, 180)}`, type: n.kind === 'pago' ? 'pagos' : 'avisos' });
      }
    } catch (e) {
      log.push(`EVA error: ${(e as Error).message}`);
    }
  }

  // 2) Resumen diario a la hora elegida
  const hour = Number(s.summary_hour || 7);
  if (s.summary_enabled !== '0' && local.getUTCHours() >= hour && !(await wasSent(env, `summary:${today}`))) {
    await markSent(env, `summary:${today}`);
    const r = await sendToMe(env, await summaryText(env), { title: '☀️ Tu resumen de hoy', tag: 'summary', pushBody: await summaryShort(env), type: 'resumen' });
    if (!r.ok) await unmarkSent(env, `summary:${today}`);
    log.push(`Resumen: ${r.ok ? 'enviado por ' + r.channels.join(' + ') : r.error}`);
  }

  // 3) Recordatorios de entregas (72 h, 24 h y 3 h antes, configurable)
  const thresholds = (s.task_reminders || '72,24,3').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (thresholds.length) {
    const maxH = thresholds[thresholds.length - 1];
    const { results } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, c.short_name AS course FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
      WHERE t.user_id = ? AND t.status = 'pending' AND t.due_at > ? AND t.due_at <= ?`).bind(env.UID, now, now + maxH * 3600).all<{ id: number; title: string; due_at: number; course: string | null }>();
    for (const t of results) {
      const left = t.due_at - now;
      const h = thresholds.find((x) => left <= x * 3600);
      if (!h) continue;
      const key = `task:${t.id}:${h}`;
      if (await wasSent(env, key)) continue;
      // Marca este umbral y los mayores para no repetir avisos de una tarea creada tarde
      for (const x of thresholds.filter((x) => x >= h)) await markSent(env, `task:${t.id}:${x}`);
      const r = await sendToMe(env, `*Recordatorio:* ${t.title}${t.course ? ' (' + t.course + ')' : ''} vence ${cuandoTexto(env, t.due_at)}.\nResponde "listo ${t.id}" cuando la entregues.`, { title: `📌 ${t.title}`, tag: `task-${t.id}`, url: `/#tareas/${t.id}`, type: 'tareas' });
      if (!r.ok) for (const x of thresholds.filter((x) => x >= h)) await unmarkSent(env, `task:${t.id}:${x}`);
      log.push(`Tarea ${t.id} (${h} h): ${r.ok ? 'ok' : r.error}`);
    }
  }

  // 4) Avisos de pago (días configurables dentro de la ventana, a partir de la hora del resumen)
  const pay = await payWindow(env, s);
  const payDays = (s.pay_remind_days || '').split(',').map(Number).filter(Boolean);
  if (!pay.paid && pay.state === 'open' && payDays.includes(local.getUTCDate()) && local.getUTCHours() >= hour) {
    const key = `pay:${pay.period}:${local.getUTCDate()}`;
    if (await markSent(env, key)) {
      const texto = local.getUTCDate() === pay.closeDay
        ? `*Último día de pago.* Hoy cierra la ventana de la cuota de ${periodLabel(pay.period)}.`
        : local.getUTCDate() === pay.openDay
          ? `*Hoy abre la ventana de pago* de la cuota de ${periodLabel(pay.period)}. Cierra en ${pay.daysToClose} días.`
          : `*Recordatorio de pago:* la ventana de ${periodLabel(pay.period)} cierra en ${pay.daysToClose} día(s).`;
      const r = await sendToMe(env, `${texto}${pay.amount ? '\nMonto: RD$ ' + pay.amount : ''}\nCuando pagues, responde "pagué".`, { title: '💳 Ventana de pago', tag: 'pay', url: '/#pagos', type: 'pagos' });
      if (!r.ok) await unmarkSent(env, key);
      log.push(`Pago: ${r.ok ? 'ok' : r.error}`);
    }
  }

  // 5) Recordatorios personales ("recuérdame…")
  const { results: rem } = await env.DB.prepare('SELECT id, text FROM reminders WHERE user_id = ? AND sent = 0 AND remind_at <= ? ORDER BY remind_at LIMIT 10').bind(env.UID, now + 60).all<{ id: number; text: string }>();
  for (const r0 of rem) {
    const r = await sendToMe(env, `*Recordatorio:* ${r0.text}`, { title: '⏰ Recordatorio', tag: `rem-${r0.id}`, type: 'tareas' });
    if (r.ok) await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').bind(r0.id).run();
    log.push(`Recordatorio ${r0.id}: ${r.ok ? 'ok' : r.error}`);
  }

  // Novedades de Rumbo (se anuncian una sola vez por versión)
  try { await announceRelease(env); } catch (e) { log.push('Novedades: ' + (e as Error).message); }

  // Hora de estudio: a la hora que elegiste, lo que te toca estudiar hoy (lo que vence pronto).
  const studyHour = Number(s.study_hour || 19);
  if (s.study_enabled !== '0' && local.getUTCHours() >= studyHour && local.getUTCHours() < 23 && await markSent(env, `study:${today}`)) {
    const { results: todo } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, c.short_name AS course FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
      WHERE t.user_id = ? AND t.status = 'pending' AND t.due_at IS NOT NULL AND t.due_at > ? AND t.due_at <= ? ORDER BY t.due_at LIMIT 3`).bind(env.UID, now - 3 * 86400, now + 2 * 86400).all<{ id: number; title: string; due_at: number; course: string | null }>();
    if (todo.length) {
      const lines = todo.map((t) => `• ${t.title}${t.course ? ' (' + t.course + ')' : ''} · ${t.due_at < now ? 'atrasada' : 'vence ' + cuandoTexto(env, t.due_at)}`);
      const r = await sendToMe(env, `*📚 Hora de estudiar*\n${lines.join('\n')}\n\nTip: abre la tarea y toca «Estudiar con IA».`, { title: `📚 Hora de estudiar: ${todo.length === 1 ? todo[0].title : todo.length + ' tareas'}`, pushBody: lines.join('\n'), tag: 'study', url: todo.length === 1 ? `/#tareas/${todo[0].id}` : '/#tareas', type: 'tareas' });
      log.push(`Hora de estudio: ${r.ok ? 'avisada' : r.error}`);
    }
  }

  // Plan de la semana: los domingos a la hora elegida (6 p. m. si no la cambiaste).
  if (local.getUTCDay() === 0 && s.notify_plan !== '0' && local.getUTCHours() >= Number(s.plan_hour || 18) && await markSent(env, `plan:${today}`)) {
    const p = await weeklyPlan(env);
    const r = await sendToMe(env, p.text, { title: '🗓️ Tu plan de la semana', pushBody: p.short, tag: 'plan', url: '/#tareas', type: 'plan' });
    if (!r.ok) await unmarkSent(env, `plan:${today}`);
    log.push(`Plan semanal: ${r.ok ? 'enviado' : r.error}`);
  }

  // Logros nuevos
  try { const got = await checkAchievements(env); if (got.length) log.push('Logros: ' + got.join(', ')); } catch (e) { log.push('Logros: ' + (e as Error).message); }

  // Alertas si algo dejó de funcionar (EVA, IA, copias)
  try { log.push(...(await checkHealth(env, { backupError }))); } catch (e) { log.push('Salud: ' + (e as Error).message); }

  return log;
}
