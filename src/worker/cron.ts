// Tareas programadas: se ejecutan cada 30 minutos (un solo Cron Trigger, gratis).
import type { Env } from './env';
import { activeUsers, forUser, getSettings, markSent, setSetting, unmarkSent, wasSent } from './db';
import { indexTrend, payWindow, periodLabel, staleCourses, summaryAlert, summaryShort } from './data';
import { ensureTgWebhook, tgEsc, tgHoy, tgSemana, tgWithApp } from './telegram';
import { notifyLive } from './live';
import { blocks, courseLabel, money, timeLeft } from './wa';
import { syncEva } from './moodle';
import { flushWhatsApp, sendToMe } from './notify';
import { archivePastCourses, classAlerts } from './horario';
import { calendarAlerts } from './uapa-calendar';
import { weeklyPlan } from './plan';
import { announceRelease } from './changelog';
import { backupDue, makeBackup } from './backup';
import { checkHealth } from './health';
import { checkAchievements } from './achievements';
import { recordAverage } from './extras';
import { cuandoTexto, localDate, nowSec, ymd } from './time';

/**
 * Una vuelta del cron para todos los usuarios. El plan gratis de Cloudflare permite ~50 llamadas externas
 * por ejecución: la sincronización del EVA (la que más llamadas hace) se da a UN usuario por vuelta, el que
 * más tiempo lleva esperando; los avisos (resumen, entregas, pagos) se revisan para todos.
 */
export async function runScheduled(env: Env): Promise<string[]> {
  const log: string[] = [];
  // Si cambió la versión del webhook de Telegram (botones, menú), se vuelve a registrar sola.
  await ensureTgWebhook(env).catch((e) => log.push('tg webhook: ' + (e as Error).message));
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
      // Las pantallas abiertas se actualizan solas después de sincronizar o de un recordatorio.
      if (ue.UID === syncUid || l.some((x) => /^(Recordatorio|Tarea)/.test(x))) await notifyLive(ue, ue.UID, 'eva');
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

  // Asignaturas de trimestres anteriores → historial
  try { const n = await archivePastCourses(env); if (n) log.push(`Historial: ${n} asignaturas archivadas`); } catch (e) { log.push('Historial: ' + (e as Error).message); }

  // 1) Sincronizar el EVA cada N horas
  if (syncNow && env.MOODLE_TOKEN) {
    try {
      const r = await syncEva(env);
      log.push(`EVA: ${r.tasksNew} nuevas, ${r.tasksUpdated} actualizadas`);
      if (r.newGrades.length) log.push(`Notas nuevas: ${r.newGrades.length}`);
      // Avisos nuevos: los del foro de avisos siempre; los del sistema solo si hablan de pagos o eventos.
      for (const n of r.newNews.filter((x) => x.source === 'avisos' || x.kind === 'pago' || x.kind === 'evento').slice(0, 5)) {
        const icon = n.kind === 'pago' ? '💳' : n.kind === 'evento' ? '🎉' : '📣';
        const label = n.kind === 'pago' ? 'Aviso de pago' : n.kind === 'evento' ? 'Evento' : 'Aviso nuevo';
        const body = n.body.length > 650 ? n.body.slice(0, 650).replace(/\s+\S*$/, '') + '…' : n.body;
        await sendToMe(env, blocks(`${icon} *${label}*${n.course ? ` · _${courseLabel(n.course)}_` : ''}`, `*${n.title}*`, body),
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
    const r = await sendToMe(env, await summaryAlert(env), { title: '☀️ Tu resumen de hoy', tag: 'summary', url: '/#inicio', pushBody: await summaryShort(env), type: 'resumen', tg: tgWithApp(env, await tgHoy(env)) });
    if (!r.ok) await unmarkSent(env, `summary:${today}`);
    log.push(`Resumen: ${r.ok ? 'enviado por ' + r.channels.join(' + ') : r.error}`);
  }

  // 2b) Cierre de la semana: domingo desde las 7 p. m.
  if (s.week_close !== '0' && local.getUTCDay() === 0 && local.getUTCHours() >= 19 && !(await wasSent(env, `semana:${today}`))) {
    await markSent(env, `semana:${today}`);
    const sem = await tgSemana(env);
    const r = await sendToMe(env, sem.plain, { title: '📆 Cierre de la semana', tag: 'week', url: '/#inicio/semana', pushBody: sem.short, type: 'resumen', tg: sem });
    if (!r.ok) await unmarkSent(env, `semana:${today}`);
    log.push(`Cierre semanal: ${r.ok ? 'ok' : r.error}`);
  }

  // 2c) Asignaturas sin nada nuevo en el EVA por 10 días (solo si el EVA se sincronizó hace poco).
  if (s.stale_alerts !== '0' && local.getUTCHours() >= hour && Number(s.eva_last_sync || 0) > nowSec() - 2 * 86400 && !(await wasSent(env, `stale:${today}`))) {
    await markSent(env, `stale:${today}`);
    for (const c of (await staleCourses(env).catch(() => [])).slice(0, 2)) {
      const key = `stale_c${c.id}`;
      if (Number(s[key] || 0) > nowSec() - 10 * 86400) continue;
      await setSetting(env, key, String(nowSec()));
      const name = c.short_name || c.name;
      const text = `${name} lleva ${c.days} días sin nada nuevo en el EVA. Échale un ojo por si el facilitador publicó algo que Rumbo no ve (un anuncio en el aula, un archivo o una videoconferencia).`;
      await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, course_id, title, body, author, kind, url, created_at) VALUES (?, 'rumbo', ?, ?, ?, ?, 'Rumbo', 'aviso', ?, ?)`)
        .bind(env.UID, `stale:${c.id}:${today}`, c.id, `📭 ${name}: ${c.days} días sin movimiento`, text, '/#asignaturas', nowSec()).run();
      const r = await sendToMe(env, blocks('📭 *Asignatura sin movimiento*', text), {
        title: `📭 ${name} sin movimiento`, pushBody: text, tag: `stale-${c.id}`, url: '/#asignaturas', type: 'avisos',
        tg: { html: `📭 <b>${tgEsc(name)}</b> lleva <b>${c.days} días</b> sin nada nuevo en el EVA.\n\n<i>Échale un ojo por si el facilitador publicó algo que Rumbo no ve (un anuncio en el aula, un archivo o una videoconferencia).</i>` },
      });
      log.push(`Sin movimiento ${name}: ${r.ok ? 'avisado' : r.error}`);
    }
  }

  // 2d) Guarda el índice del día (para mostrar cuánto subió o bajó).
  if (local.getUTCHours() >= hour && !(await wasSent(env, `trend:${today}`))) {
    await markSent(env, `trend:${today}`);
    await indexTrend(env).catch(() => null);
  }

  // 3) Recordatorios de entregas (72 h, 24 h y 3 h antes, configurable)
  const thresholds = (s.task_reminders || '72,24,3').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (thresholds.length) {
    const maxH = thresholds[thresholds.length - 1];
    const { results } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, c.short_name AS course, c.name AS course_name FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
      WHERE t.user_id = ? AND t.status = 'pending' AND t.due_at > ? AND t.due_at <= ?`).bind(env.UID, now, now + maxH * 3600).all<{ id: number; title: string; due_at: number; course: string | null; course_name: string | null }>();
    for (const t of results) {
      const left = t.due_at - now;
      const h = thresholds.find((x) => left <= x * 3600);
      if (!h) continue;
      const key = `task:${t.id}:${h}`;
      if (await wasSent(env, key)) continue;
      // Marca este umbral y los mayores para no repetir avisos de una tarea creada tarde
      for (const x of thresholds.filter((x) => x >= h)) await markSent(env, `task:${t.id}:${x}`);
      const curso = courseLabel(t.course_name, t.course);
      const urgent = t.due_at - now <= 6 * 3600;
      const r = await sendToMe(env, blocks(
        `${urgent ? '🚨' : '📌'} *${urgent ? '¡Vence pronto!' : 'Recordatorio de entrega'}*`,
        [`*${t.title}*`, curso && `📚 ${curso}`, `⏰ Vence *${cuandoTexto(env, t.due_at)}*`, `⏳ ${timeLeft(t.due_at, now).replace(/^./, (x) => x.toUpperCase())}`].filter(Boolean).join('\n'),
        '_Cuando la entregues, márcala como hecha en Rumbo._',
      ), { title: `📌 ${t.title}`, pushBody: `${curso ? curso + ' · ' : ''}vence ${cuandoTexto(env, t.due_at)}`, tag: `task-${t.id}`, url: `/#tareas/${t.id}`, type: 'tareas', tg: {
        html: [`${urgent ? '🚨' : '📌'} <b>${urgent ? '¡Vence pronto!' : 'Recordatorio de entrega'}</b>`, '', `<b>${tgEsc(t.title)}</b>`, curso && `📚 <i>${tgEsc(curso)}</i>`, `⏰ Vence <b>${tgEsc(cuandoTexto(env, t.due_at))}</b>`, `⏳ ${tgEsc(timeLeft(t.due_at, now).replace(/^./, (x) => x.toUpperCase()))}`].filter(Boolean).join('\n'),
        kb: [[{ text: '✅ Ya la entregué', callback_data: `dr:${t.id}` }], [{ text: '⏰ +1 h', callback_data: `s:${t.id}:1h` }, { text: '⏰ +3 h', callback_data: `s:${t.id}:3h` }, { text: '🌙 Esta noche', callback_data: `s:${t.id}:night` }]],
      } });
      if (!r.ok) for (const x of thresholds.filter((x) => x >= h)) await unmarkSent(env, `task:${t.id}:${x}`);
      log.push(`Tarea ${t.id} (${h} h): ${r.ok ? 'ok' : r.error}`);
    }
  }

  // 3b) Foros: pusiste tu aporte pero te faltan respuestas a compañeros y el foro cierra pronto.
  const { results: foros } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, t.forum_replies, t.forum_needed, c.short_name AS course, c.name AS course_name FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    WHERE t.user_id = ? AND t.moodle_key LIKE 'forum:%' AND t.due_at > ? AND t.due_at <= ? AND t.forum_posts > 0 AND t.forum_needed > 0 AND COALESCE(t.forum_replies, 0) < t.forum_needed`)
    .bind(env.UID, now, now + 2 * 86400).all<{ id: number; title: string; due_at: number; forum_replies: number | null; forum_needed: number; course: string | null; course_name: string | null }>();
  for (const f of foros) {
    if (!(await markSent(env, `forum-replies:${f.id}`))) continue;
    const faltan = f.forum_needed - (f.forum_replies ?? 0);
    const curso = courseLabel(f.course_name, f.course);
    const r = await sendToMe(env, blocks('💬 *Te faltan respuestas en un foro*',
      [`*${f.title}*`, curso && `📚 ${curso}`, `✅ Tu aporte ya está`, `✍️ Te ${faltan === 1 ? 'falta 1 respuesta' : `faltan ${faltan} respuestas`} a compañeros (llevas ${f.forum_replies ?? 0} de ${f.forum_needed})`, `⏰ Cierra *${cuandoTexto(env, f.due_at)}*`].filter(Boolean).join('\n')),
      { title: `💬 Faltan ${faltan} respuesta${faltan === 1 ? '' : 's'}: ${f.title}`.slice(0, 90), pushBody: `${curso ? curso + ' · ' : ''}cierra ${cuandoTexto(env, f.due_at)}`, tag: `forum-${f.id}`, url: `/#tareas/${f.id}`, type: 'tareas' });
    if (!r.ok) await unmarkSent(env, `forum-replies:${f.id}`);
    log.push(`Foro ${f.id} sin respuestas: ${r.ok ? 'avisado' : r.error}`);
  }

  // 4) Avisos de pago (días configurables dentro de la ventana, a partir de la hora del resumen)
  const pay = await payWindow(env, s);
  const payDays = (s.pay_remind_days || '').split(',').map(Number).filter(Boolean);
  if (!pay.paid && pay.state === 'open' && payDays.includes(local.getUTCDate()) && local.getUTCHours() >= hour) {
    const key = `pay:${pay.period}:${local.getUTCDate()}`;
    if (await markSent(env, key)) {
      const last = local.getUTCDate() === pay.closeDay, first = local.getUTCDate() === pay.openDay;
      const head = last ? '🚨 *Último día de pago*' : first ? '💳 *Abrió la ventana de pago*' : '💳 *Recordatorio de pago*';
      const when = last ? 'Cierra *hoy* a las 11:59 p. m.' : `Cierra en *${pay.daysToClose} día${pay.daysToClose === 1 ? '' : 's'}* (el día ${pay.closeDay})`;
      const r = await sendToMe(env, blocks(
        head,
        [`🗓️ Cuota de *${periodLabel(pay.period)}*`, `⏰ ${when}`, pay.amount && `💰 Monto: *${money(pay.amount)}*`].filter(Boolean).join('\n'),
        '_Cuando pagues, regístralo en Rumbo → Pagos y no te vuelvo a avisar este mes._',
      ), { title: last ? '🚨 Último día de pago' : '💳 Ventana de pago', pushBody: `Cuota de ${periodLabel(pay.period)} · ${last ? 'cierra hoy' : `cierra en ${pay.daysToClose} días`}`, tag: 'pay', url: '/#pagos', type: 'pagos' });
      if (!r.ok) await unmarkSent(env, key);
      log.push(`Pago: ${r.ok ? 'ok' : r.error}`);
    }
  }

  // 5) Recordatorios personales ("recuérdame…")
  const { results: rem } = await env.DB.prepare('SELECT id, text FROM reminders WHERE user_id = ? AND sent = 0 AND remind_at <= ? ORDER BY remind_at LIMIT 10').bind(env.UID, now + 60).all<{ id: number; text: string }>();
  for (const r0 of rem) {
    const r = await sendToMe(env, blocks('⏰ *Recordatorio*', r0.text), { title: '⏰ Recordatorio', pushBody: r0.text, tag: `rem-${r0.id}`, url: '/#inicio', type: 'tareas' });
    if (r.ok) await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').bind(r0.id).run();
    log.push(`Recordatorio ${r0.id}: ${r.ok ? 'ok' : r.error}`);
  }

  // Novedades de Rumbo (se anuncian una sola vez por versión)
  try { await announceRelease(env); } catch (e) { log.push('Novedades: ' + (e as Error).message); }

  // Hora de estudio: a la hora que elegiste, lo que te toca estudiar hoy (lo que vence pronto).
  const studyHour = Number(s.study_hour || 19);
  if (s.study_enabled !== '0' && local.getUTCHours() >= studyHour && local.getUTCHours() < 23 && await markSent(env, `study:${today}`)) {
    const { results: todo } = await env.DB.prepare(`SELECT t.id, t.title, t.due_at, c.short_name AS course, c.name AS course_name FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
      WHERE t.user_id = ? AND t.status = 'pending' AND t.due_at IS NOT NULL AND t.due_at > ? AND t.due_at <= ? ORDER BY t.due_at LIMIT 3`).bind(env.UID, now - 3 * 86400, now + 2 * 86400).all<{ id: number; title: string; due_at: number; course: string | null; course_name: string | null }>();
    if (todo.length) {
      const lines = todo.map((t) => { const c = courseLabel(t.course_name, t.course); return `• *${t.title}*${c ? ` _(${c})_` : ''}\n   ${t.due_at < now ? '⚠️ atrasada' : '⏰ vence ' + cuandoTexto(env, t.due_at)}`; });
      const r = await sendToMe(env, blocks('📚 *Hora de estudiar*', 'Esto es lo que vence pronto:', lines.join('\n'), '💡 _Abre la tarea y toca «Estudiar con IA»: te arma un plan y tarjetas para repasar._'), { title: `📚 Hora de estudiar: ${todo.length === 1 ? todo[0].title : todo.length + ' tareas'}`, pushBody: todo.map((t) => `• ${t.title} · ${t.due_at < now ? 'atrasada' : 'vence ' + cuandoTexto(env, t.due_at)}`).join('\n'), tag: 'study', url: todo.length === 1 ? `/#tareas/${todo[0].id}` : '/#tareas', type: 'tareas' });
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

  // Clases del horario y exámenes del DEA
  if (s.notify_clases !== '0') { try { log.push(...await classAlerts(env)); } catch (e) { log.push('Clases: ' + (e as Error).message); } }

  // Fechas límite del calendario de la UAPA y pago pendiente
  if (s.notify_avisos !== '0') { try { log.push(...await calendarAlerts(env)); } catch (e) { log.push('Calendario UAPA: ' + (e as Error).message); } }

  // Historial del promedio (para la gráfica de Notas)
  try { await recordAverage(env); } catch (e) { log.push('Historial del promedio: ' + (e as Error).message); }

  // Logros nuevos
  try { const got = await checkAchievements(env); if (got.length) log.push('Logros: ' + got.join(', ')); } catch (e) { log.push('Logros: ' + (e as Error).message); }

  // Alertas si algo dejó de funcionar (EVA, IA, copias)
  try { log.push(...(await checkHealth(env, { backupError }))); } catch (e) { log.push('Salud: ' + (e as Error).message); }

  return log;
}
