// Tareas programadas: se ejecutan cada 30 minutos (un solo Cron Trigger, gratis).
import type { Env } from './env';
import { getSettings, markSent, unmarkSent, wasSent } from './db';
import { payWindow, periodLabel, summaryShort, summaryText } from './data';
import { syncEva } from './moodle';
import { sendToMe } from './notify';
import { announceRelease } from './changelog';
import { cuandoTexto, localDate, nowSec, ymd } from './time';

export async function runScheduled(env: Env): Promise<string[]> {
  const log: string[] = [];
  const s = await getSettings(env);
  const now = nowSec();
  const local = localDate(env);
  const today = ymd(local);

  // 1) Sincronizar el EVA cada N horas
  const every = Math.max(1, Number(s.eva_sync_hours || 2)) * 3600;
  if (env.MOODLE_TOKEN && now - Number(s.eva_last_sync || 0) >= every - 300) {
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
      WHERE t.status = 'pending' AND t.due_at > ? AND t.due_at <= ?`).bind(now, now + maxH * 3600).all<{ id: number; title: string; due_at: number; course: string | null }>();
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
  const { results: rem } = await env.DB.prepare('SELECT id, text FROM reminders WHERE sent = 0 AND remind_at <= ? ORDER BY remind_at LIMIT 10').bind(now + 60).all<{ id: number; text: string }>();
  for (const r0 of rem) {
    const r = await sendToMe(env, `*Recordatorio:* ${r0.text}`, { title: '⏰ Recordatorio', tag: `rem-${r0.id}`, type: 'tareas' });
    if (r.ok) await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').bind(r0.id).run();
    log.push(`Recordatorio ${r0.id}: ${r.ok ? 'ok' : r.error}`);
  }

  // Novedades de Rumbo (se anuncian una sola vez por versión)
  try { await announceRelease(env); } catch (e) { log.push('Novedades: ' + (e as Error).message); }

  // Limpieza: registros de envío de más de 90 días
  await env.DB.prepare('DELETE FROM sent_log WHERE sent_at < ?').bind(now - 90 * 86400).run();
  return log;
}
