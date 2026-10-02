// Logros (estilo Duolingo): se calculan con tus datos reales y, una vez ganados, se quedan para siempre.
// El cron avisa cuando ganas uno nuevo; la app lo celebra con la mascota.
import type { Env } from './env';
import { blocks } from './wa';
import { getSettings, setSetting } from './db';
import { sendToMe } from './notify';
import { nowSec } from './time';
import { streak } from './widget';

export type Achievement = { id: string; icon: string; title: string; desc: string; goal: number; value: number; unlocked: boolean };

type Stats = { done: number; streak: number; perfect: number; honorCourses: number; early: number; weekDone: number; weekTotal: number; chats: number; focus: number; high: number };

async function stats(env: Env): Promise<Stats> {
  const now = nowSec();
  // Cada consulta lleva «user_id = ?» como primer filtro: el id va primero en los parámetros.
  const one = async (sql: string, ...b: unknown[]) => Number((await env.DB.prepare(sql).bind(env.UID, ...b).first<{ n: number }>())?.n || 0);
  return {
    done: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done'`),
    streak: await streak(env),
    perfect: await one(`SELECT COUNT(*) AS n FROM grades WHERE user_id = ? AND grade IS NOT NULL AND grade_max > 0 AND grade >= grade_max`),
    honorCourses: await one(`SELECT COUNT(*) AS n FROM (SELECT AVG(g.grade * 100.0 / g.grade_max) AS a FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.grade_max > 0 GROUP BY g.course_id HAVING COUNT(*) >= 2 AND a >= 90)`),
    early: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND due_at IS NOT NULL AND submitted_at IS NOT NULL AND submitted_at <= due_at - 86400`),
    weekDone: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND due_at BETWEEN ? AND ? AND status = 'done'`, now - 7 * 86400, now),
    weekTotal: await one(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND due_at BETWEEN ? AND ?`, now - 7 * 86400, now),
    chats: await one(`SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND direction = 'in' AND channel = 'app'`),
    focus: await one(`SELECT COALESCE(SUM(focus_minutes), 0) AS n FROM tasks WHERE user_id = ?`),
    high: await one(`SELECT COUNT(*) AS n FROM grades WHERE user_id = ? AND grade IS NOT NULL AND grade_max > 0 AND grade * 100.0 / grade_max >= 90`),
  };
}

/** Lista de logros: { id, emoji, título, descripción, meta, valor actual }. */
export function catalog(s: Stats): Omit<Achievement, 'unlocked'>[] {
  const weekOk = s.weekTotal >= 3 && s.weekDone === s.weekTotal ? 1 : 0;
  return [
    { id: 'primera', icon: '🌱', title: 'Primer paso', desc: 'Entrega tu primera tarea', goal: 1, value: s.done },
    { id: 'entregas10', icon: '📚', title: 'Constante', desc: 'Entrega 10 tareas', goal: 10, value: s.done },
    { id: 'entregas25', icon: '🎒', title: 'Imparable', desc: 'Entrega 25 tareas', goal: 25, value: s.done },
    { id: 'entregas50', icon: '🏅', title: 'Veterano', desc: 'Entrega 50 tareas', goal: 50, value: s.done },
    { id: 'entregas100', icon: '👑', title: 'Leyenda de la UAPA', desc: 'Entrega 100 tareas', goal: 100, value: s.done },
    { id: 'racha3', icon: '🔥', title: 'En llamas', desc: '3 días seguidos cumpliendo', goal: 3, value: s.streak },
    { id: 'racha7', icon: '⚡', title: 'Semana perfecta', desc: '7 días seguidos cumpliendo', goal: 7, value: s.streak },
    { id: 'racha14', icon: '🚀', title: 'Cohete', desc: '14 días seguidos cumpliendo', goal: 14, value: s.streak },
    { id: 'perfecta', icon: '💯', title: 'Nota perfecta', desc: 'Saca la nota máxima en una actividad', goal: 1, value: s.perfect },
    { id: 'notas10', icon: '⭐', title: 'Estrella', desc: '10 notas de 90 o más', goal: 10, value: s.high },
    { id: 'honor', icon: '🎓', title: 'Cuadro de honor', desc: 'Promedio de 90+ en una asignatura', goal: 1, value: s.honorCourses },
    { id: 'adelantado', icon: '⏰', title: 'Adelantado', desc: 'Entrega 5 tareas con un día de anticipación', goal: 5, value: s.early },
    { id: 'semana', icon: '✅', title: 'Todo al día', desc: 'Cumple todas las entregas de una semana (mínimo 3)', goal: 1, value: weekOk },
    { id: 'enfoque', icon: '🧘', title: 'Modo bestia', desc: '2 horas en modo enfoque', goal: 120, value: s.focus },
    { id: 'pana', icon: '🤖', title: 'Pana de la IA', desc: 'Conversa 10 veces con el asistente', goal: 10, value: s.chats },
  ];
}

/** Logros con su estado. Los ganados se recuerdan aunque el valor baje (por ejemplo, si se corta la racha). */
export async function achievements(env: Env): Promise<Achievement[]> {
  const seen = new Set(((await getSettings(env)).achievements_seen || '').split(',').filter(Boolean));
  return catalog(await stats(env)).map((a) => ({ ...a, value: Math.min(a.value, a.goal), unlocked: seen.has(a.id) || a.value >= a.goal }));
}

/** Lo llama el cron: avisa los logros nuevos y los guarda como ganados. */
export async function checkAchievements(env: Env): Promise<string[]> {
  const s = await getSettings(env);
  const seen = new Set((s.achievements_seen || '').split(',').filter(Boolean));
  const firstRun = !s.achievements_seen;
  const list = await achievements(env);
  const fresh = list.filter((a) => a.unlocked && !seen.has(a.id));
  if (!fresh.length) return [];
  for (const a of fresh) seen.add(a.id);
  await setSetting(env, 'achievements_seen', [...seen].join(','));
  // La primera vez se guardan en silencio (no te llega una avalancha por lo que ya tenías).
  if (!firstRun) {
    for (const a of fresh.slice(0, 3)) {
      await sendToMe(env, blocks('🏆 *¡Logro desbloqueado!*', `${a.icon} *${a.title}*\n_${a.desc}_`, '¡Sigue así! 💪'), { title: `🏆 ¡Logro desbloqueado! ${a.icon} ${a.title}`, pushBody: a.desc, tag: `logro-${a.id}`, url: '/#inicio' });
    }
  }
  return fresh.map((a) => a.id);
}
