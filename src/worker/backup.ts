// Copias de seguridad de tus datos (tareas, notas, pagos, avisos, memoria de la IA…).
// - Automática cada semana (la hace el cron) y a mano desde Ajustes.
// - Se guardan comprimidas en Cloudflare KV (gratis); se conservan las últimas 8.
// - Las claves privadas (tokens, llaves de notificaciones) NO se copian: se regeneran solas si hiciera falta.
// Además, Cloudflare D1 permite volver a cualquier minuto de los últimos 7 días ("Time Travel").
import type { Env } from './env';

const KEEP = 8;
const SECRET_SETTING = /token|secret|vapid|private|password|apikey|api_key/i;

export type BackupInfo = { key: string; at: number; bytes: number; rows: number };

// Tablas con datos de cada usuario (las demás son del sistema).
const USER_TABLES = ['courses', 'tasks', 'grades', 'announcements', 'payments', 'pensum', 'reminders', 'messages', 'push_subs'];

/**
 * Lee la base de datos como JSON. Con `onlyMine`, solo los datos del usuario de `env` (lo que descarga
 * cada compañero); sin él, todo (la copia semanal del sistema).
 */
export async function dumpData(env: Env, onlyMine = false): Promise<{ version: 1; at: number; tables: Record<string, unknown[]> }> {
  if (onlyMine) {
    const mine: Record<string, unknown[]> = {};
    for (const t of USER_TABLES) mine[t] = (await env.DB.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).bind(env.UID).all<Record<string, unknown>>()).results;
    const p = `u${env.UID}:`;
    mine.settings = (await env.DB.prepare('SELECT key, value FROM settings WHERE substr(key, 1, ?) = ?').bind(p.length, p).all<{ key: string; value: string }>()).results
      .filter((r) => !SECRET_SETTING.test(r.key)).map((r) => ({ key: r.key.slice(p.length), value: r.value }));
    return { version: 1, at: Date.now(), tables: mine };
  }
  const { results: tables } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name`,
  ).all<{ name: string }>();
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM "${name.replace(/"/g, '')}"`).all<Record<string, unknown>>();
    out[name] = name === 'settings' ? results.filter((r) => !SECRET_SETTING.test(String(r.key))) : name === 'users' ? results.map(({ pass_hash: _h, pass_salt: _s, ...r }) => r) : results;
  }
  return { version: 1, at: Date.now(), tables: out };
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function gunzip(buf: ArrayBuffer): Promise<string> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Hace una copia ahora y borra las más viejas. */
export async function makeBackup(env: Env): Promise<BackupInfo> {
  if (!env.BACKUPS) throw new Error('Falta el almacenamiento de copias (BACKUPS)');
  const data = await dumpData(env);
  const rows = Object.values(data.tables).reduce((n, t) => n + t.length, 0);
  const body = await gzip(JSON.stringify(data));
  const key = `backup:${new Date(data.at).toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  const info: BackupInfo = { key, at: data.at, bytes: body.byteLength, rows };
  await env.BACKUPS.put(key, body, { metadata: info });
  const list = await listBackups(env);
  for (const old of list.slice(KEEP)) await env.BACKUPS.delete(old.key);
  console.log(`Copia de seguridad: ${rows} filas, ${Math.round(body.byteLength / 1024)} KB`);
  return info;
}

export async function listBackups(env: Env): Promise<BackupInfo[]> {
  if (!env.BACKUPS) return [];
  const { keys } = await env.BACKUPS.list<BackupInfo>({ prefix: 'backup:' });
  return keys.map((k) => k.metadata || { key: k.name, at: 0, bytes: 0, rows: 0 }).sort((a, b) => b.at - a.at);
}

/** ¿Toca la copia semanal? (la última tiene 7 días o más). */
export async function backupDue(env: Env): Promise<boolean> {
  if (!env.BACKUPS) return false;
  const [last] = await listBackups(env);
  return !last || Date.now() - last.at >= 7 * 86400_000 - 3600_000;
}
