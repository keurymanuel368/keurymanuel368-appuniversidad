// Utilidades de fecha en hora local (República Dominicana: UTC-4 todo el año, sin horario de verano).
import type { Env } from './env';

export const nowSec = () => Math.floor(Date.now() / 1000);

export function offsetSec(env: Env): number {
  return Math.round(Number(env.TZ_OFFSET_HOURS || '-4') * 3600);
}

/** Fecha "local" representada con getters UTC. */
export function localDate(env: Env, sec = nowSec()): Date {
  return new Date((sec + offsetSec(env)) * 1000);
}

/** Convierte una fecha/hora local (año, mes 1-12, día, hora, minuto) a segundos Unix UTC. */
export function localToUnix(env: Env, y: number, m: number, d: number, h = 0, min = 0): number {
  return Math.floor(Date.UTC(y, m - 1, d, h, min) / 1000) - offsetSec(env);
}

export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function horaTexto(d: Date): string {
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suf = h < 12 ? 'a. m.' : 'p. m.';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(m).padStart(2, '0')} ${suf}`;
}

export function fechaLarga(d: Date): string {
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function fechaCorta(d: Date): string {
  return `${DIAS_CORTO[d.getUTCDay()]} ${d.getUTCDate()} ${MESES_CORTO[d.getUTCMonth()]}`;
}

/** "hoy 11:59 p. m.", "mañana 8:00 a. m.", "sáb 3 oct" */
export function cuandoTexto(env: Env, dueSec: number): string {
  const now = localDate(env);
  const due = localDate(env, dueSec);
  const dayDiff = Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000);
  if (dayDiff === 0) return `hoy ${horaTexto(due)}`;
  if (dayDiff === 1) return `mañana ${horaTexto(due)}`;
  if (dayDiff > 1 && dayDiff < 7) return `${DIAS[due.getUTCDay()]} ${horaTexto(due)}`;
  return fechaCorta(due);
}

export function daysBetween(env: Env, fromSec: number, toSec: number): number {
  const a = localDate(env, fromSec), b = localDate(env, toSec);
  return Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86400000);
}

export { MESES, MESES_CORTO };
