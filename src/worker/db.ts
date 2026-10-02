import type { Env } from './env';
import { nowSec } from './time';

// Ajustes: los personales se guardan como 'u<id>:clave' (cada compañero tiene los suyos) y los del
// sistema (llaves de notificaciones, motores de IA, bot) se comparten sin prefijo.
const GLOBAL = new Set(['vapid_keys', 'app_origin', 'tts_chars', 'tts_day', 'tg_secret', 'wa_display_number', 'wa_last_error', 'ai_fail_at', 'ai_fail_detail']);
const isGlobal = (key: string) => GLOBAL.has(key) || key.startsWith('llm_');
const prefix = (env: Env) => `u${env.UID || 0}:`;
const fullKey = (env: Env, key: string) => (isGlobal(key) ? key : prefix(env) + key);

/** Ajustes por defecto de un usuario nuevo (los mismos con los que empezó Rumbo). */
export const DEFAULT_SETTINGS: Record<string, string> = {
  summary_hour: '7', summary_enabled: '1', task_reminders: '72,24,3',
  pay_open_day: '25', pay_close_day: '5', pay_remind_days: '25,30,4,5', pay_amount: '',
  term_start: '', term_end: '', eva_sync_hours: '2', term_unit: 'trimestre', push_also_wa: '1',
  notify_tareas: '1', notify_notas: '1', notify_pagos: '1', notify_avisos: '1', notify_resumen: '1', notify_novedades: '1',
  study_hour: '19', study_enabled: '1', achievements_seen: '', notify_plan: '1', plan_hour: '18',
};

export async function getSettings(env: Env): Promise<Record<string, string>> {
  const p = prefix(env);
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE substr(key, 1, ?) = ? OR key NOT LIKE 'u%:%'`).bind(p.length, p).all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of results) {
    if (r.key.startsWith(p)) out[r.key.slice(p.length)] = r.value;
    else if (isGlobal(r.key)) out[r.key] = r.value;
  }
  return out;
}

export async function getSetting(env: Env, key: string, fallback = ''): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(fullKey(env, key)).first<{ value: string }>();
  return row?.value ?? fallback;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(fullKey(env, key), value).run();
}

/** Busca qué usuario tiene un ajuste con ese valor (tokens del calendario, widget, correo, Telegram…). */
export async function userBySetting(env: Env, key: string, value: string): Promise<number | null> {
  if (!value) return null;
  const row = await env.DB.prepare(`SELECT key FROM settings WHERE key LIKE ? AND value = ? LIMIT 1`).bind(`u%:${key}`, value).first<{ key: string }>();
  const m = row?.key.match(/^u(\d+):/);
  return m ? Number(m[1]) : null;
}

/** Registra un envío; devuelve false si ya existía (para no repetir avisos). Cada usuario lleva su registro. */
export async function markSent(env: Env, key: string): Promise<boolean> {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO sent_log (key, sent_at) VALUES (?, ?)').bind(prefix(env) + key, nowSec()).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function wasSent(env: Env, key: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 AS x FROM sent_log WHERE key = ?').bind(prefix(env) + key).first());
}

export async function unmarkSent(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sent_log WHERE key = ?').bind(prefix(env) + key).run();
}

export type User = { id: number; login: string; name: string; role: 'admin' | 'user'; active: number };

/**
 * El mismo Env pero de un usuario: todas las consultas usan env.UID, y los secretos personales
 * (token del EVA, número de WhatsApp, CallMeBot) salen de sus ajustes. El usuario 1 (Manuel)
 * conserva los secretos de Cloudflare como respaldo, así nada de lo que ya tenía se rompe.
 */
export async function forUser(env: Env, uid: number, role?: 'admin' | 'user'): Promise<Env> {
  const u: Env = { ...env, UID: uid };
  if (!role) role = (await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(uid).first<{ role: 'admin' | 'user' }>())?.role || 'user';
  u.ROLE = role;
  const s = await getSettings(u);
  const own = uid === 1;
  // Si el ajuste existe (aunque esté vacío porque lo desconectaste), manda el ajuste.
  const pick = (k: string, secret?: string) => (k in s ? s[k] || undefined : own ? secret : undefined);
  u.MOODLE_TOKEN = s.moodle_token || (own ? env.MOODLE_TOKEN : undefined);
  u.WA_MY_NUMBER = s.wa_number || (own ? env.WA_MY_NUMBER : undefined);
  u.CALLMEBOT_APIKEY = pick('callmebot_apikey', env.CALLMEBOT_APIKEY);
  return u;
}

export async function activeUsers(env: Env): Promise<User[]> {
  const { results } = await env.DB.prepare('SELECT id, login, name, role, active FROM users WHERE active = 1 ORDER BY id').all<User>();
  return results;
}
