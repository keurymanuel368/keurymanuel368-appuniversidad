// Calendario académico de Grado de la UAPA (fuente: uapa.edu.do/calendario-academico-grado, revisado 2026-10-25).
// Solo lo que le sirve a un participante ya inscrito. Se actualiza a mano cuando la UAPA publica nuevos trimestres.
import type { Env } from './env';
import { getSetting, markSent } from './db';
import { localDate, localToUnix, nowSec, ymd } from './time';
import { sendToMe } from './notify';

export type CalKind = 'pago' | 'docencia' | 'tramite' | 'evaluacion' | 'graduacion';
export type CalEvent = { id: string; term: string; title: string; from: string; to: string; kind: CalKind; alert?: boolean; note?: string };

export const TERMS: Record<string, string> = { '202634': 'Noviembre 2026 – Enero 2027', '202641': 'Febrero – Abril 2027' };

export const CALENDAR: CalEvent[] = [
  // Noviembre 2026 – Enero 2027
  { id: '34-sel', term: '202634', title: 'Selección de asignaturas y pago de la Matrícula Cuota 1', from: '2026-10-22', to: '2026-10-27', kind: 'pago', alert: true },
  { id: '34-recargo', term: '202634', title: 'Última fecha de selección y pago (con recargo)', from: '2026-10-31', to: '2026-10-31', kind: 'pago', alert: true, note: 'Pagar fuera de plazo tiene recargo.' },
  { id: '34-cfg', term: '202634', title: 'Inscripción de Curso Final de Grado', from: '2026-10-29', to: '2026-10-29', kind: 'tramite' },
  { id: '34-inicio', term: '202634', title: 'Inicio de docencia', from: '2026-11-02', to: '2026-11-02', kind: 'docencia', alert: true },
  { id: '34-cambio', term: '202634', title: 'Cambio, inclusión o retiro de asignaturas', from: '2026-11-02', to: '2026-11-08', kind: 'tramite', alert: true },
  { id: '34-sss', term: '202634', title: 'Solicitud de Servicio Social Universitario', from: '2026-11-01', to: '2026-11-15', kind: 'tramite' },
  { id: '34-retiro', term: '202634', title: 'Retiro del período académico (hasta la 4.ª semana)', from: '2026-11-02', to: '2026-11-29', kind: 'tramite' },
  { id: '34-grad', term: '202634', title: 'Solicitud y pago de graduación', from: '2027-01-11', to: '2027-01-26', kind: 'graduacion' },
  { id: '34-final', term: '202634', title: 'Final de docencia y evaluación de los aprendizajes', from: '2027-01-11', to: '2027-01-17', kind: 'evaluacion', alert: true },
  { id: '34-notas', term: '202634', title: 'Reporte de calificaciones', from: '2027-01-19', to: '2027-01-19', kind: 'evaluacion', note: 'Hasta esta fecha.' },
  { id: '34-fuera', term: '202634', title: 'Prueba fuera de fecha', from: '2027-01-20', to: '2027-01-20', kind: 'evaluacion', alert: true },
  // Febrero – Abril 2027
  { id: '41-sel', term: '202641', title: 'Selección de asignaturas y pago de la Matrícula Cuota 1', from: '2027-01-22', to: '2027-01-27', kind: 'pago', alert: true },
  { id: '41-cfg', term: '202641', title: 'Inscripción de Curso Final de Grado', from: '2027-01-29', to: '2027-01-29', kind: 'tramite' },
  { id: '41-inicio', term: '202641', title: 'Inicio de docencia', from: '2027-02-01', to: '2027-02-01', kind: 'docencia', alert: true },
  { id: '41-cambio', term: '202641', title: 'Cambio, inclusión o retiro de asignaturas', from: '2027-02-01', to: '2027-02-07', kind: 'tramite', alert: true },
  { id: '41-final', term: '202641', title: 'Final de docencia y evaluación de los aprendizajes', from: '2027-04-12', to: '2027-04-18', kind: 'evaluacion', alert: true },
  { id: '41-notas', term: '202641', title: 'Reporte de calificaciones', from: '2027-04-20', to: '2027-04-20', kind: 'evaluacion', note: 'Hasta esta fecha.' },
  { id: '41-fuera', term: '202641', title: 'Prueba fuera de fecha', from: '2027-04-21', to: '2027-04-21', kind: 'evaluacion', alert: true },
];

/** Segundos Unix del inicio (0:00) o del final (23:59) de una fecha local "YYYY-MM-DD". */
export function dayStart(env: Env, iso: string): number { const [y, m, d] = iso.split('-').map(Number); return localToUnix(env, y, m, d, 0, 0); }
export function dayEnd(env: Env, iso: string): number { const [y, m, d] = iso.split('-').map(Number); return localToUnix(env, y, m, d, 23, 59); }

/** Cron: avisos de fechas límite de la UAPA (3 días y 1 día antes de que cierre; el día de inicio) + recordatorio diario de pago pendiente. */
export async function calendarAlerts(env: Env): Promise<string[]> {
  const log: string[] = [];
  const now = nowSec();
  const today = ymd(localDate(env));
  const hour = localDate(env).getUTCHours();
  if (hour < 7) return log; // nada de madrugada
  for (const e of CALENDAR.filter((x) => x.alert)) {
    const start = dayStart(env, e.from), end = dayEnd(env, e.to);
    if (now > end) continue;
    const daysToEnd = Math.ceil((end - now) / 86400);
    const daysToStart = Math.ceil((start - now) / 86400);
    let when: string | null = null;
    if (now >= start && daysToEnd === 1) when = 'hoy es el último día';
    else if (now >= start && daysToEnd === 3) when = 'cierra en 3 días';
    else if (now < start && daysToStart === 1) when = 'empieza mañana';
    else if (now >= start && now < start + 86400 && e.from === e.to) when = 'es hoy';
    else if (now >= start && now < start + 86400 && e.from !== e.to) when = 'empieza hoy';
    if (!when) continue;
    if (!(await markSent(env, `cal:${e.id}:${when}:${today}`))) continue;
    const r = await sendToMe(env, `📅 *${e.title}*: ${when}${e.note ? `\n${e.note}` : ''}`, { title: `📅 ${e.title}`, pushBody: `${when[0].toUpperCase()}${when.slice(1)}${e.note ? ' · ' + e.note : ''}`, tag: `cal-${e.id}`, url: '/#horario', type: 'avisos' });
    log.push(`Calendario ${e.id}: ${r.ok ? 'avisado' : r.error}`);
  }
  // Pago pendiente de Mi UAPA mientras corre la ventana de selección y pago
  try {
    const acc = JSON.parse(await getSetting(env, 'uapa_account', 'null')) as { balance: number } | null;
    const win = CALENDAR.find((x) => x.kind === 'pago' && now >= dayStart(env, x.from) && now <= dayEnd(env, x.to));
    if (acc && acc.balance > 0 && win && await markSent(env, `pagopend:${today}`)) {
      const left = Math.ceil((dayEnd(env, win.to) - now) / 86400);
      const r = await sendToMe(env, `💳 *Tienes un saldo pendiente de RD$${Math.round(acc.balance).toLocaleString('es-DO')}* en Mi UAPA. La selección y el pago cierran ${left <= 1 ? 'hoy' : `en ${left} días`}. Si ya pagaste, actualiza desde Mi UAPA en Horario.`, { title: '💳 Pago pendiente en Mi UAPA', pushBody: `RD$${Math.round(acc.balance).toLocaleString('es-DO')} · cierra ${left <= 1 ? 'hoy' : `en ${left} días`}`, tag: 'pago-pendiente', url: '/#pagos', type: 'pagos' });
      log.push(`Pago pendiente: ${r.ok ? 'avisado' : r.error}`);
    }
  } catch { /* sin estado de cuenta todavía */ }
  return log;
}
