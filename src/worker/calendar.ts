// Calendario iCalendar (.ics): tus entregas y la ventana de pago en Google Calendar o el calendario del iPhone.
// Se suscribe una vez con un enlace privado y se actualiza solo.
import type { Env } from './env';
import { listTasks, payWindow, periodLabel } from './data';
import { getSettings } from './db';
import { localDate, localToUnix, nowSec } from './time';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (sec: number) => new Date(sec * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (sec: number) => new Date((sec - 4 * 3600) * 1000).toISOString().slice(0, 10).replace(/-/g, '');

/** Corta las líneas a 75 caracteres como pide el estándar. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
  out.push(rest);
  return out.join('\r\n');
}

export async function calendarIcs(env: Env): Promise<string> {
  const now = nowSec();
  const L: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumbo//UAPA//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Rumbo · UAPA', 'X-WR-TIMEZONE:America/Santo_Domingo', 'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H',
  ];
  const tasks = (await listTasks(env, { limit: 400 })).filter((t) => t.due_at && t.due_at > now - 60 * 86400);
  for (const t of tasks) {
    const done = t.status === 'done';
    const course = t.course_name ? ` (${t.course_short || t.course_name})` : '';
    const desc = [t.course_name, done ? (t.notes || 'Hecha') : 'Pendiente', t.grade !== null && t.grade !== undefined ? `Nota: ${t.grade}/${t.grade_max}` : '', t.url || ''].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:tarea-${t.id}@rumbo`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(t.due_at! - 3600)}`, `DTEND:${stamp(t.due_at!)}`,
      `SUMMARY:${esc(`${done ? '✓ ' : '📌 '}${t.title}${course}`)}`, `DESCRIPTION:${esc(desc)}`);
    if (t.url) L.push(`URL:${t.url}`);
    if (!done) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Mañana vence: ' + t.title)}`, 'TRIGGER:-P1D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('En 3 horas vence: ' + t.title)}`, 'TRIGGER:-PT3H', 'END:VALARM');
    L.push('END:VEVENT');
  }
  // Bloques de estudio: para cada entrega pendiente, 1 hora a tu hora de estudio dos días antes (o mañana si ya no da).
  const s = await getSettings(env);
  if (s.ics_study !== '0') {
    const hour = Number(s.study_hour || 19);
    for (const t of tasks.filter((x) => x.status === 'pending' && x.due_at! > now && x.due_at! < now + 14 * 86400)) {
      const d = localDate(env, Math.max(t.due_at! - 2 * 86400, now + 86400));
      const start = localToUnix(env, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, 0);
      if (start + 3600 > t.due_at!) continue;
      L.push('BEGIN:VEVENT', `UID:estudio-${t.id}@rumbo`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 3600)}`,
        `SUMMARY:${esc(`📚 Estudiar: ${t.title}`)}`, `DESCRIPTION:${esc(`Bloque sugerido por Rumbo. Vence ${t.course_name ? '(' + t.course_name + ') ' : ''}el ${new Date(t.due_at! * 1000).toISOString().slice(0, 10)}.`)}`, 'TRANSP:OPAQUE',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Hora de estudiar: ' + t.title)}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
    }
  }
  const p = await payWindow(env);
  L.push('BEGIN:VEVENT', `UID:pago-${p.period}@rumbo`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${dateOnly(p.opensAt)}`, `DTEND;VALUE=DATE:${dateOnly(p.closesAt + 86400)}`,
    `SUMMARY:${esc(`💳 Ventana de pago · cuota de ${periodLabel(p.period)}${p.paid ? ' (pagada)' : ''}`)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
