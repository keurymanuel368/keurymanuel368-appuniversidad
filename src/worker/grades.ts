// Avisos de calificaciones: cuando el facilitador corrige una tarea (o cambia la nota),
// te llega una notificación con la nota, el comentario y un enlace directo a la tarea, y queda guardado en Avisos.
import type { Env } from './env';
import type { SyncResult } from './moodle';
import { sendToMe } from './notify';
import { nowSec } from './time';
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
  for (const g of grades.slice(0, 8)) {
    const m = gradeMessage(g);
    const { icon, cheer, changed, title, head, body } = m;
    const task = g.key ? await env.DB.prepare('SELECT id FROM tasks WHERE user_id = ? AND moodle_key = ? LIMIT 1').bind(env.UID, g.key).first<{ id: number }>() : null;
    // En Avisos (filtro «Avisos» → calificaciones), con el comentario completo.
    await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, course_id, title, body, author, kind, created_at) VALUES (?, 'notas', ?, ?, ?, ?, 'EVA', 'nota', ?)`)
      .bind(env.UID, `${g.courseId}:${g.itemId}:${g.grade}`, g.courseId, `${icon} ${g.item}: ${fmt(g.grade)}/${fmt(g.max)}`, `${changed ? `Tu nota cambió de ${fmt(g.prev!)} a ${fmt(g.grade)}.

` : ''}${g.feedback ? `Comentario del facilitador:
${g.feedback}` : 'Sin comentario del facilitador.'}`, nowSec()).run();
    // WhatsApp: la nota grande, el comentario como cita (con «> » WhatsApp lo muestra con la barrita al lado).
    const quote = g.feedback ? `💬 _Comentario del facilitador:_\n${g.feedback.slice(0, 500).split('\n').filter((l) => l.trim()).map((l) => `> ${l}`).join('\n')}` : '';
    const r = await sendToMe(env, blocks(
      `${icon} *${changed ? 'Te cambiaron una nota' : '¡Te calificaron!'}*`,
      [`*${g.item}*`, `📚 ${courseLabel(g.course)}`, `📊 Nota: *${fmt(g.grade)}/${fmt(g.max)}*${changed ? ` _(antes ${fmt(g.prev!)})_` : ''}`].join('\n'),
      quote,
      cheer,
    ), {
      title, tag: `grade-${g.courseId}-${g.itemId}`, url: task ? `/#tareas/${task.id}` : '/#asignaturas',
      pushBody: `${head}${g.feedback ? ' · 💬 ' + g.feedback.slice(0, 120) : ' · ' + cheer}`, type: 'notas',
    });
    if (r.ok) sent++;
  }
  return sent;
}
