// Datos para el widget de la pantalla de inicio del teléfono (estilo Duolingo):
// una mascota con cara según cómo vas, una frase, tu racha y lo próximo que vence.
import type { Env } from './env';
import { getSettings } from './db';
import { listTasks } from './data';
import { cuandoTexto, horaTexto, localDate, nowSec } from './time';

/** versionCode del APK publicado en public/rumbo-widget.apk (súbelo junto con android-widget/app/build.gradle). */
export const WIDGET_VERSION = 4;

export type WidgetData = {
  mood: 'feliz' | 'tranqui' | 'atento' | 'alerta';
  headline: string;
  sub: string;
  streak: number;
  pending: number;
  today: number;
  overdue: number;
  tasks: { title: string; when: string; course: string; urgent: boolean }[];
  reminders: { text: string; when: string }[];
  phrases: string[];
  doneWeek: number;
  updated: string;
  lastGrade: { title: string; grade: number; max: number } | null;
};

const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
const pick = <T,>(arr: T[], seed: number) => arr[seed % arr.length];

// Frases que rotan en el widget (con sabor dominicano, sin pasarse).
const FRASES = [
  'Un chin cada día y llegas lejos 🚶', 'El que estudia hoy, gocea mañana 🎉', 'Tú no estás atrasado, vas a tu ritmo 💙',
  'Toma agüita y sigue dándole 💧', 'Ese título viene, tranquilo 🎓', 'Primero lo difícil, después lo sabroso 😎',
  'Media hora enfocado vale más que tres distraído ⏱️', 'Pregúntale al asistente si te trabas 🤖', 'Descansar también es parte del plan 😴',
  'Lo que empiezas hoy, mañana te lo agradeces ✨', 'Paso a paso se sube la loma ⛰️', 'Organízate y ganas tiempo para ti 🗓️',
];

/** Racha: días seguidos (hasta hoy o ayer) en los que entregaste o completaste algo. */
export async function streak(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(`SELECT COALESCE(submitted_at, updated_at) AS t FROM tasks WHERE user_id = ? AND status = 'done' AND COALESCE(submitted_at, updated_at) > ?`)
    .bind(env.UID, nowSec() - 120 * 86400).all<{ t: number }>();
  const days = new Set(results.map((r) => dayKey(localDate(env, r.t))));
  let n = 0;
  let d = localDate(env);
  if (!days.has(dayKey(d))) d = new Date(d.getTime() - 86400_000); // hoy todavía cuenta
  while (days.has(dayKey(d))) { n++; d = new Date(d.getTime() - 86400_000); }
  return n;
}

export async function widgetData(env: Env): Promise<WidgetData> {
  const s = await getSettings(env);
  const name = (s.student_name || '').split(' ')[0];
  const now = nowSec();
  const today = localDate(env);
  const endOfToday = now + (86400 - (today.getUTCHours() * 3600 + today.getUTCMinutes() * 60 + today.getUTCSeconds()));
  const pending = (await listTasks(env, { status: 'pending', limit: 100 })).filter((t) => t.due_at);
  const overdue = pending.filter((t) => t.due_at! < now);
  const dueToday = pending.filter((t) => t.due_at! >= now && t.due_at! <= endOfToday);
  const soon = pending.filter((t) => t.due_at! >= now && t.due_at! <= now + 3 * 86400);
  const racha = await streak(env);
  const { results: rem } = await env.DB.prepare('SELECT text, remind_at FROM reminders WHERE user_id = ? AND sent = 0 AND remind_at >= ? ORDER BY remind_at LIMIT 3')
    .bind(env.UID, now - 3600).all<{ text: string; remind_at: number }>();
  const doneWeek = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND COALESCE(submitted_at, updated_at) >= ?`).bind(env.UID, now - 7 * 86400).first<{ n: number }>())?.n || 0;
  const seed = today.getUTCDate() + today.getUTCHours();
  const hi = name ? `, ${name}` : '';

  let mood: WidgetData['mood'], headline: string, sub: string;
  if (overdue.length) {
    mood = 'alerta';
    headline = overdue.length === 1 ? '¡Se te pasó una entrega!' : `¡Tienes ${overdue.length} entregas atrasadas!`;
    sub = 'Todavía estás a tiempo de resolver. Dale ahora.';
  } else if (dueToday.length) {
    mood = 'atento';
    headline = dueToday.length === 1 ? `Hoy vence 1 tarea${hi}` : `Hoy vencen ${dueToday.length} tareas${hi}`;
    sub = pick(['Un empujoncito y la sacas 💪', 'Tú puedes con esto, mano.', 'Enfócate un ratico y listo.'], seed);
  } else if (soon.length) {
    mood = 'tranqui';
    headline = soon.length === 1 ? '1 entrega en los próximos días' : `${soon.length} entregas en los próximos días`;
    sub = pick(['Adelanta hoy y vive tranquilo.', 'Vas bien, pero no te confíes 😉', 'Un poquito cada día rinde.'], seed);
  } else {
    mood = 'feliz';
    headline = pick([`Todo al día${hi} 🎉`, '¡Nada pendiente! 🙌', `Vas volando${hi} 🚀`], seed);
    sub = racha > 1 ? `Llevas ${racha} días seguidos cumpliendo.` : 'Aprovecha para adelantar o descansar.';
  }

  const list = [...overdue, ...pending.filter((t) => t.due_at! >= now)].slice(0, 3);
  // Última nota (de los últimos 5 días): se alterna con las frases del widget.
  const last = await env.DB.prepare(`SELECT g.item_name, g.grade, g.grade_max FROM grades g WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.updated_at > ? ORDER BY g.updated_at DESC LIMIT 1`)
    .bind(env.UID, now - 5 * 86400).first<{ item_name: string; grade: number; grade_max: number }>();
  const gradeLine = last ? `📊 Última nota: ${Math.round(last.grade * 100) / 100}/${last.grade_max} · ${last.item_name.replace(/\s+(calificaci[oó]n|foro completo)$/i, '').slice(0, 40)}` : null;
  return {
    mood, headline, sub, streak: racha, pending: pending.length, today: dueToday.length, overdue: overdue.length,
    tasks: list.map((t) => ({ title: t.title, when: t.due_at! < now ? 'Atrasada' : cuandoTexto(env, t.due_at!), course: t.course_short || t.course_name || '', urgent: t.due_at! < now + 86400 })),
    reminders: rem.map((r) => ({ text: r.text, when: cuandoTexto(env, r.remind_at) })),
    phrases: gradeLine ? [gradeLine, pick(FRASES, seed * 3), gradeLine] : [0, 1, 2].map((i) => pick(FRASES, seed * 3 + i)),
    lastGrade: last ? { title: last.item_name, grade: last.grade, max: last.grade_max } : null,
    doneWeek,
    updated: horaTexto(today),
  };
}
