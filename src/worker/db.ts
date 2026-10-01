import type { Env } from './env';
import { nowSec } from './time';

export async function getSettings(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function getSetting(env: Env, key: string, fallback = ''): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}

/** Registra un envío; devuelve false si ya existía (para no repetir avisos). */
export async function markSent(env: Env, key: string): Promise<boolean> {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO sent_log (key, sent_at) VALUES (?, ?)').bind(key, nowSec()).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function wasSent(env: Env, key: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 AS x FROM sent_log WHERE key = ?').bind(key).first());
}

export async function unmarkSent(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sent_log WHERE key = ?').bind(key).run();
}
