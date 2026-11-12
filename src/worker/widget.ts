// Datos para el widget de la pantalla de inicio del teléfono (estilo Duolingo):
// una mascota con cara según cómo vas, una frase, tu racha y lo próximo que vence.
import type { Env } from './env';
import { getSettings } from './db';
import { courseSummaries, listTasks, overallAverage, payWindow } from './data';
import { classes as uapaClasses } from './horario';
import { cuandoTexto, fechaLarga, horaTexto, localDate, nowSec, offsetSec, ymd } from './time';

/** versionCode del APK publicado en public/rumbo-widget.apk (súbelo junto con android-widget/app/build.gradle). */
export const WIDGET_VERSION = 8;

export type WidgetData = {
  mood: 'feliz' | 'tranqui' | 'atento' | 'alerta';
  headline: string;
  sub: string;
  streak: number;
  pending: number;
  today: number;
  overdue: number;
  tasks: { title: string; when: string; course: string; urgent: boolean; late: boolean; dueAt: number | null }[];
  /** Hoy y los 6 días siguientes, con cuántas entregas tiene cada uno (widget grande). */
  week: { d: string; n: number; count: number; today: boolean }[];
  name: string;
  dayTitle: string;
  next: { title: string; course: string; when: string; due_at: number | null } | null;
  /** Índice del trimestre (anillo del widget). */
  average: number | null;
  reminders: { text: string; when: string }[];
  phrases: string[];
  doneWeek: number;
  updated: string;
  lastGrade: { title: string; grade: number; max: number } | null;
  /** Horario semanal de Mi UAPA: el widget calcula solo «en 25 min» con el reloj del teléfono (d: 0 = lunes). */
  schedule: { t: string; c: string | null; d: number; s: number; e: number; sd: string | null; ed: string | null; r: string }[];
  term: { start: string; end: string } | null;
  /** Minutos de diferencia con UTC de la hora local de Rumbo (República Dominicana: -240). */
  tz: number;
  pay: { paid: boolean; amount: string; state: 'open' | 'closed'; daysToOpen: number; daysToClose: number };
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
/**
 * Racha = días seguidos cumpliendo. Suma un día en el que entregaste algo de verdad; un día sin entregas pero
 * sin nada que vencía no la rompe; un día en que se te pasó una entrega (vencida sin hacer) la corta.
 */
export async function streak(env: Env): Promise<number> {
  const since = nowSec() - 120 * 86400;
  const { results: dn } = await env.DB.prepare(`SELECT submitted_at AS t FROM tasks WHERE user_id = ? AND status = 'done' AND submitted_at > ?`)
    .bind(env.UID, since).all<{ t: number }>();
  const { results: ms } = await env.DB.prepare(`SELECT due_at AS t FROM tasks WHERE user_id = ? AND due_at > ? AND due_at < ? AND source = 'eva'
      AND (status = 'pending' OR (status = 'done' AND notes = 'Plazo cerrado en el EVA')) AND COALESCE(ignored, 0) = 0`)
    .bind(env.UID, since, nowSec()).all<{ t: number }>().catch(() => ({ results: [] as { t: number }[] }));
  const delivered = new Set(dn.map((r) => dayKey(localDate(env, r.t))));
  const missed = new Set(ms.map((r) => dayKey(localDate(env, r.t))));
  let n = 0;
  let d = localDate(env);
  for (let i = 0; i < 120; i++) {
    const k = dayKey(d);
    if (delivered.has(k)) n++;
    else if (missed.has(k) && i > 0) break; // hoy todavía no cuenta como fallado
    d = new Date(d.getTime() - 86400_000);
  }
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
  // Clases de hoy (Mi UAPA): la que está en curso o la siguiente se cuela en el titular del widget.
  const todayIso = ymd(today), dow = (today.getUTCDay() + 6) % 7, nowMin = today.getUTCHours() * 60 + today.getUTCMinutes();
  const allClasses = await uapaClasses(env);
  const onDay = (k: { day: number; start_date: string | null; end_date: string | null }, iso: string, d: number) => k.day === d && (!k.start_date || iso >= k.start_date) && (!k.end_date || iso <= k.end_date);
  const todayClasses = allClasses.filter((k) => onDay(k, todayIso, dow)).sort((a, b) => a.start_min - b.start_min);
  const liveClass = todayClasses.find((k) => k.start_min <= nowMin && nowMin < k.end_min);
  const nextClassToday = todayClasses.find((k) => k.start_min > nowMin);
  const h12 = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
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

  if (liveClass) {
    mood = 'atento'; headline = `🎓 En clase: ${liveClass.title}`.slice(0, 60); sub = `Termina a las ${h12(liveClass.end_min)}.`;
  } else if (nextClassToday && nextClassToday.start_min - nowMin <= 90) {
    const m = nextClassToday.start_min - nowMin;
    mood = 'atento'; headline = `🎓 ¡Clase en ${m} min!`; sub = `${nextClassToday.title} · ${h12(nextClassToday.start_min)}`.slice(0, 70);
  }

  const list = [...overdue, ...pending.filter((t) => t.due_at! >= now)].slice(0, 5);
  // Tu semana (para el widget grande): cuántas entregas hay cada día de hoy a 6 días.
  const week: { d: string; n: number; count: number; today: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = localDate(env, now + i * 86400);
    const key = ymd(d);
    const items = pending.filter((t) => ymd(localDate(env, t.due_at!)) === key);
    const nCls = allClasses.filter((k) => onDay(k, key, (d.getUTCDay() + 6) % 7)).length;
    week.push({ d: 'DLMXJVS'[d.getUTCDay()], n: d.getUTCDate(), count: items.length + nCls, today: i === 0 });
  }
  // Última nota (de los últimos 5 días): se alterna con las frases del widget.
  const last = await env.DB.prepare(`SELECT g.item_name, g.grade, g.grade_max FROM grades g WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.updated_at > ? ORDER BY g.updated_at DESC LIMIT 1`)
    .bind(env.UID, now - 5 * 86400).first<{ item_name: string; grade: number; grade_max: number }>();
  const gradeLine = last ? `📊 Última nota: ${Math.round(last.grade * 100) / 100}/${last.grade_max} · ${last.item_name.replace(/\s+(calificaci[oó]n|foro completo)$/i, '').slice(0, 40)}` : null;
  const clsLine = todayClasses.length ? `🎓 Hoy: ${todayClasses.map((k) => `${k.title.split(' ').slice(0, 2).join(' ')} ${h12(k.start_min).replace(' a. m.', 'a').replace(' p. m.', 'p')}`).join(' · ')}`.slice(0, 90) : null;
  const classReminders = todayClasses.filter((k) => k.start_min > nowMin).slice(0, 2).map((k) => ({ text: `🎓 ${k.title}`, when: h12(k.start_min) }));
  const phrases = (gradeLine ? [gradeLine, pick(FRASES, seed * 3), gradeLine] : [0, 1, 2].map((i) => pick(FRASES, seed * 3 + i)));
  if (clsLine) phrases.unshift(clsLine);
  const starts = allClasses.map((k) => k.start_date).filter(Boolean).sort() as string[];
  const ends = allClasses.map((k) => k.end_date).filter(Boolean).sort() as string[];
  const pw = await payWindow(env, s);
  return {
    schedule: allClasses.map((k) => ({ t: k.title, c: k.code, d: k.day, s: k.start_min, e: k.end_min, sd: k.start_date, ed: k.end_date, r: [k.building, k.room].filter(Boolean).join(' ') })),
    term: starts.length && ends.length ? { start: starts[0], end: ends[ends.length - 1] } : null,
    tz: Math.round(offsetSec(env) / 60),
    pay: { paid: pw.paid, amount: pw.amount, state: pw.state, daysToOpen: pw.daysToOpen, daysToClose: pw.daysToClose },
    mood, headline, sub, streak: racha, pending: pending.length, today: dueToday.length, overdue: overdue.length,
    tasks: list.map((t) => ({ title: t.title, when: t.due_at! < now ? 'Atrasada' : cuandoTexto(env, t.due_at!), course: t.course_short || t.course_name || '', urgent: t.due_at! < now + 86400, late: t.due_at! < now, dueAt: t.due_at })),
    week,
    name,
    dayTitle: (() => { const f = fechaLarga(localDate(env)); return f.charAt(0).toUpperCase() + f.slice(1); })(),
    reminders: [...classReminders, ...rem.map((r) => ({ text: r.text, when: cuandoTexto(env, r.remind_at) }))].slice(0, 3),
    phrases,
    lastGrade: last ? { title: last.item_name, grade: last.grade, max: last.grade_max } : null,
    next: (() => {
      const t = pending.filter((x) => x.due_at! >= now).sort((a, b) => a.due_at! - b.due_at!)[0];
      return t ? { title: t.title, course: t.course_short || t.course_name || '', when: cuandoTexto(env, t.due_at!), due_at: t.due_at } : null;
    })(),
    average: overallAverage(await courseSummaries(env)),
    doneWeek,
    updated: horaTexto(today),
  };
}
