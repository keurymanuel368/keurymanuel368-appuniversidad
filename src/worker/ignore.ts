// Actividades que no cuentan: la rúbrica de actitudes y valores, el espacio para enviar tareas fuera de fecha
// (no se corrigen) o lo que tú quites. Salen de pendientes, recordatorios y del promedio; la sincronización del EVA las respeta.
import type { Env } from './env';
import { NO_CUENTA_SQL } from '../shared/promedio';

/** Después de sincronizar: las que llegaron nuevas y no se corrigen pasan a «quitadas» (salvo que tú las hayas vuelto a contar). */
export async function applyAutoIgnore(env: Env): Promise<number> {
  const r = await env.DB.prepare(`UPDATE tasks SET status = 'ignored' WHERE user_id = ? AND ignored IS NULL AND status != 'ignored' AND ${NO_CUENTA_SQL('title')}`).bind(env.UID).run();
  // Si quitaste la nota antes de que existiera la tarea, la tarea nueva también queda quitada.
  const r2 = await env.DB.prepare(`UPDATE tasks SET status = 'ignored', ignored = 1 WHERE user_id = ?1 AND ignored IS NULL AND status != 'ignored'
    AND moodle_key IN (SELECT moodle_key FROM grades WHERE user_id = ?1 AND ignored = 1 AND moodle_key IS NOT NULL)`).bind(env.UID).run();
  return (r.meta.changes ?? 0) + (r2.meta.changes ?? 0);
}

/**
 * Quita (o devuelve) una actividad. Se marca la tarea y todas sus notas (mismo moodle_key),
 * así da igual si la quitas desde la tarea o desde Notas.
 */
export async function setIgnored(env: Env, target: { taskId?: number; gradeId?: number }, ignored: boolean): Promise<{ ok: boolean; error?: string }> {
  let key: string | null = null;
  let taskId: number | null = null;
  let gradeId: number | null = null;
  if (target.taskId) {
    const t = await env.DB.prepare('SELECT id, moodle_key FROM tasks WHERE id = ? AND user_id = ?').bind(target.taskId, env.UID).first<{ id: number; moodle_key: string | null }>();
    if (!t) return { ok: false, error: 'Tarea no encontrada.' };
    taskId = t.id; key = t.moodle_key;
  } else if (target.gradeId) {
    const g = await env.DB.prepare('SELECT id, moodle_key FROM grades WHERE id = ? AND user_id = ?').bind(target.gradeId, env.UID).first<{ id: number; moodle_key: string | null }>();
    if (!g) return { ok: false, error: 'Actividad no encontrada.' };
    gradeId = g.id; key = g.moodle_key;
  }
  const flag = ignored ? 1 : 0;
  // Al devolverla: entregada si ya constaba como entregada; si no, pendiente (la próxima sincronización la corrige si hace falta).
  const status = ignored ? `'ignored'` : `CASE WHEN status != 'ignored' THEN status WHEN submitted_at IS NOT NULL OR notes LIKE '%en el EVA' THEN 'done' ELSE 'pending' END`;
  const now = Math.floor(Date.now() / 1000);
  if (key) {
    await env.DB.prepare(`UPDATE tasks SET ignored = ?, status = ${status}, updated_at = ? WHERE user_id = ? AND moodle_key = ?`).bind(flag, now, env.UID, key).run();
    await env.DB.prepare('UPDATE grades SET ignored = ? WHERE user_id = ? AND moodle_key = ?').bind(flag, env.UID, key).run();
  } else if (taskId) {
    await env.DB.prepare(`UPDATE tasks SET ignored = ?, status = ${status}, updated_at = ? WHERE id = ? AND user_id = ?`).bind(flag, now, taskId, env.UID).run();
  } else if (gradeId) {
    await env.DB.prepare('UPDATE grades SET ignored = ? WHERE id = ? AND user_id = ?').bind(flag, gradeId, env.UID).run();
  }
  return { ok: true };
}
