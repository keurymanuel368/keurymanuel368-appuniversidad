// Avisos de calificaciones: cuando el facilitador corrige una tarea (o cambia la nota),
// te llega una notificación con la nota, el comentario y un enlace directo a la tarea, y queda guardado en Avisos.
import type { Env } from './env';
import type { SyncResult } from './moodle';
import { sendToMe } from './notify';
import { nowSec } from './time';

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export async function notifyGrades(env: Env, grades: SyncResult['newGrades']): Promise<number> {
  let sent = 0;
  for (const g of grades.slice(0, 8)) {
    const pct = g.max ? (g.grade / g.max) * 100 : 0;
    const icon = pct >= 90 ? '🎉' : pct >= 70 ? '✅' : '⚠️';
    const cheer = pct >= 90 ? '¡Excelente trabajo!' : pct >= 70 ? '¡Bien hecho!' : 'Revisa el comentario y pregúntale al asistente cómo mejorar.';
    const changed = g.prev !== null && g.prev !== g.grade;
    const task = g.key ? await env.DB.prepare('SELECT id FROM tasks WHERE moodle_key = ? LIMIT 1').bind(g.key).first<{ id: number }>() : null;
    const title = changed
      ? `${icon} Te cambiaron la nota: ${fmt(g.grade)}/${fmt(g.max)}`
      : `${icon} ¡Te calificaron! ${fmt(g.grade)}/${fmt(g.max)}`;
    const head = `${g.item} · ${g.course}`;
    const fb = g.feedback ? `
💬 ${g.feedback.slice(0, 400)}` : '';
    const body = `${head}${changed ? `
Antes tenías ${fmt(g.prev!)}.` : ''}
${cheer}${fb}`;
    // En Avisos (filtro «Avisos» → calificaciones), con el comentario completo.
    await env.DB.prepare(`INSERT OR IGNORE INTO announcements (source, ext_id, course_id, title, body, author, kind, created_at) VALUES ('notas', ?, ?, ?, ?, 'EVA', 'nota', ?)`)
      .bind(`${g.courseId}:${g.itemId}:${g.grade}`, g.courseId, `${icon} ${g.item}: ${fmt(g.grade)}/${fmt(g.max)}`, `${changed ? `Tu nota cambió de ${fmt(g.prev!)} a ${fmt(g.grade)}.

` : ''}${g.feedback ? `Comentario del facilitador:
${g.feedback}` : 'Sin comentario del facilitador.'}`, nowSec()).run();
    const r = await sendToMe(env, `*${title}*
${body}`, {
      title, tag: `grade-${g.courseId}-${g.itemId}`, url: task ? `/#tareas/${task.id}` : '/#asignaturas',
      pushBody: `${head}${g.feedback ? ' · 💬 ' + g.feedback.slice(0, 120) : ' · ' + cheer}`, type: 'notas',
    });
    if (r.ok) sent++;
  }
  return sent;
}
