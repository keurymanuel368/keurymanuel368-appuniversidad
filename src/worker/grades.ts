// Avisos de calificaciones: cuando el facilitador corrige una tarea (o cambia la nota),
// te llega una notificación con la nota, el comentario y un enlace directo a la tarea, y queda guardado en Avisos.
import type { Env } from './env';
import type { SyncChange, SyncResult } from './moodle';
import { sendToMe } from './notify';
import { courseSummaries, indexTrend, trendText } from './data';
import { tgEsc, tgGradeCard } from './telegram';
import { cuandoTexto, nowSec } from './time';
import { blocks, courseLabel } from './wa';

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Arma el texto del aviso de una nota (sin tocar la base de datos). */
export function gradeMessage(g: SyncResult['newGrades'][number]) {
  const pct = g.max ? (g.grade / g.max) * 100 : 0;
  const icon = pct >= 90 ? '🎉' : pct >= 70 ? '✅' : '⚠️';
  const cheer = pct >= 90 ? '¡Excelente trabajo!' : pct >= 70 ? '¡Bien hecho!' : 'Revisa el comentario y pregúntale al asistente cómo mejorar.';
  const changed = g.prev !== null && g.prev !== g.grade;
  const title = changed ? `${icon} Te cambiaron la nota: ${fmt(g.grade)}/${fmt(g.max)}` : `${icon} ¡Te calificaron! ${fmt(g.grade)}/${fmt(g.max)}`;
  const head = `${g.item} · ${g.course}`;
  const fb = g.feedback ? `
💬 ${g.feedback.slice(0, 400)}` : '';
  const body = `${head}${changed ? `
Antes tenías ${fmt(g.prev!)}.` : ''}
${cheer}${fb}`;
  return { icon, cheer, changed, title, head, body };
}

export async function notifyGrades(env: Env, grades: SyncResult['newGrades']): Promise<number> {
  let sent = 0;
  // Cómo cambió tu índice con estas notas (p. ej. «Tu índice subió de 84.1 a 84.4»).
  const trend = trendText(await indexTrend(env).catch(() => null));
  for (const g of grades.slice(0, 8)) {
    const m = gradeMessage(g);
    const { icon, cheer, changed, title, head, body } = m;
    const task = g.key ? await env.DB.prepare('SELECT id FROM tasks WHERE user_id = ? AND moodle_key = ? LIMIT 1').bind(env.UID, g.key).first<{ id: number }>() : null;
    // En Avisos (filtro «Avisos» → calificaciones), con el comentario completo.
    await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, course_id, title, body, author, kind, url, created_at) VALUES (?, 'notas', ?, ?, ?, ?, 'EVA', 'nota', ?, ?)`)
      .bind(env.UID, `${g.courseId}:${g.itemId}:${g.grade}`, g.courseId, `${icon} ${g.item}: ${fmt(g.grade)}/${fmt(g.max)}`, `${changed ? `Tu nota cambió de ${fmt(g.prev!)} a ${fmt(g.grade)}.

` : ''}${g.feedback ? `Comentario del facilitador:
${g.feedback}` : 'Sin comentario del facilitador.'}`, task ? `/#tareas/${task.id}` : null, nowSec()).run();
    // WhatsApp: la nota grande, el comentario como cita (con «> » WhatsApp lo muestra con la barrita al lado).
    const quote = g.feedback ? `💬 _Comentario del facilitador:_\n${g.feedback.slice(0, 500).split('\n').filter((l) => l.trim()).map((l) => `> ${l}`).join('\n')}` : '';
    const r = await sendToMe(env, blocks(
      `${icon} *${changed ? 'Te cambiaron una nota' : '¡Te calificaron!'}*`,
      [`*${g.item}*`, `📚 ${courseLabel(g.course)}`, `📊 Nota: *${fmt(g.grade)}/${fmt(g.max)}*${changed ? ` _(antes ${fmt(g.prev!)})_` : ''}`].join('\n'),
      quote,
      trend ? `📈 ${trend}` : '',
      cheer,
    ), {
      title, tag: `grade-${g.courseId}-${g.itemId}`, url: task ? `/#tareas/${task.id}` : '/#asignaturas',
      pushBody: `${head}${trend ? ' · ' + trend : ''}${g.feedback ? ' · 💬 ' + g.feedback.slice(0, 120) : ' · ' + cheer}`, type: 'notas',
      tg: {
        html: tgGradeCard(env, g, changed, cheer, (await courseSummaries(env).catch(() => [])).find((c) => c.name === g.course)?.average) + (trend ? `\n\n📈 <b>${tgEsc(trend)}</b>` : ''),
        kb: [[{ text: '📊 Mis notas', callback_data: 'c:notas' }, { text: '🧮 ¿Cuánto necesito?', callback_data: 'c:necesito' }]],
      },
    });
    if (r.ok) sent++;
  }
  return sent;
}

/** Avisos de cambios en el EVA: fechas movidas, tareas nuevas y respuestas a tus mensajes en foros. */
export async function notifyChanges(env: Env, changes: SyncChange[]): Promise<number> {
  let sent = 0;
  for (const ch of changes.slice(0, 6)) {
    const curso = ch.course ? `📚 ${courseLabel(ch.course)}` : '';
    if (ch.kind === 'fecha') {
      const later = ch.to > ch.from;
      const r = await sendToMe(env, blocks(`🗓️ *Cambió una fecha de entrega*`, [`*${ch.title}*`, curso, `Antes: ~${cuandoTexto(env, ch.from)}~`, `Ahora: *${cuandoTexto(env, ch.to)}*`].filter(Boolean).join('\n'), later ? '_Te dieron más tiempo 🙌_' : '_Ojo: ahora vence antes._'),
        { title: `🗓️ ${later ? 'Más tiempo' : 'Fecha adelantada'}: ${ch.title}`.slice(0, 90), pushBody: `${ch.course ? ch.course + ' · ' : ''}ahora vence ${cuandoTexto(env, ch.to)}`, tag: `date-${ch.taskId}`, url: `/#tareas/${ch.taskId}`, type: 'tareas' });
      if (r.ok) sent++;
    } else if (ch.kind === 'nueva') {
      const r = await sendToMe(env, blocks('🆕 *Tarea nueva en el EVA*', [`*${ch.title}*`, curso, `⏰ Vence *${cuandoTexto(env, ch.due)}*`].filter(Boolean).join('\n')),
        { title: `🆕 ${ch.title}`.slice(0, 90), pushBody: `${ch.course ? ch.course + ' · ' : ''}vence ${cuandoTexto(env, ch.due)}`, tag: `new-${ch.taskId}`, url: `/#tareas/${ch.taskId}`, type: 'tareas' });
      if (r.ok) sent++;
    } else {
      const task = await env.DB.prepare('SELECT id FROM tasks WHERE user_id = ? AND moodle_key = ? LIMIT 1').bind(env.UID, ch.taskKey).first<{ id: number }>();
      const text = ch.text.length > 400 ? ch.text.slice(0, 400) + '…' : ch.text;
      const r = await sendToMe(env, blocks(`💬 *${ch.author || 'Alguien'} te respondió en el foro*`, [`*${ch.title}*`, curso].filter(Boolean).join('\n'), text.split('\n').filter((l) => l.trim()).map((l) => `> ${l}`).join('\n')),
        { title: `💬 ${ch.author || 'Alguien'} te respondió`, pushBody: `${ch.title} · ${text.slice(0, 140)}`, tag: `reply-${ch.taskKey}`, url: task ? `/#tareas/${task.id}` : '/#tareas', type: 'tareas' });
      if (r.ok) sent++;
    }
  }
  return sent;
}
