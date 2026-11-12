// Medidor de la base de datos (D1). El plan gratis de Cloudflare da 5 000 000 de filas leídas por día y se reinicia a
// medianoche UTC (8 p. m. en República Dominicana). Si se pasa, TODO falla. Aquí se mide cuánto se gasta, se avisa en
// Ajustes, se activa un «modo ahorro» antes de llegar al tope y se registran las consultas pesadas para encontrarlas.
import type { Env } from './env';

export const DAILY_READ_LIMIT = 5_000_000;
/** A partir de esta fracción del tope diario se activa el modo ahorro (el cron deja de sincronizar el EVA, etc.). */
export const SAVER_AT = 0.75;

type Meta = { rows_read?: number; rows_written?: number } | undefined;
let pendingRead = 0, pendingWrite = 0, lastFlush = 0, totalRead = 0;
/** Filas leídas desde que arrancó este proceso (para medir cuánto gasta cada vuelta del cron). */
export const rowsTotal = () => totalRead;
const today = () => new Date().toISOString().slice(0, 10); // el día de D1 es UTC

function add(meta: Meta, sql: string) {
  const r = meta?.rows_read || 0;
  pendingRead += r; totalRead += r; pendingWrite += meta?.rows_written || 0;
  if (r > 20000) console.log(`Consulta pesada: ${r} filas leídas · ${sql.replace(/\s+/g, ' ').slice(0, 110)}`);
}

/** Envuelve la base de datos para contar las filas leídas/escritas de cada consulta (sin cambiar cómo se usa). */
export function meter(db: D1Database): D1Database {
  const origin = new WeakMap<object, D1PreparedStatement>();
  const wrap = (st: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const p: D1PreparedStatement = new Proxy(st, {
      get(t, prop) {
        if (prop === 'bind') return (...a: unknown[]) => wrap(t.bind(...a), sql);
        if (prop === 'all' || prop === 'run') return async () => { const r = await (t as unknown as Record<string, () => Promise<{ meta?: Meta }>>)[prop](); add(r.meta, sql); return r; };
        if (prop === 'first') return async (col?: string) => {
          const r = await t.all<Record<string, unknown>>(); add(r.meta, sql);
          const row = r.results[0] ?? null;
          return col ? (row ? row[col] ?? null : null) : row;
        };
        const v = (t as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
    origin.set(p, st);
    return p;
  };
  return new Proxy(db, {
    get(t, prop) {
      if (prop === 'prepare') return (sql: string) => wrap(t.prepare(sql), sql);
      if (prop === 'batch') return async (stmts: D1PreparedStatement[]) => {
        const res = await t.batch(stmts.map((s) => origin.get(s) ?? s));
        for (const r of res) add((r as { meta?: Meta }).meta, 'batch');
        return res;
      };
      const v = (t as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

/** Guarda lo contado (como mucho una vez cada 45 s) en la tabla db_usage. */
export async function flushUsage(db: D1Database): Promise<void> {
  if ((!pendingRead && !pendingWrite) || Date.now() - lastFlush < 45_000) return;
  lastFlush = Date.now();
  const r = pendingRead, w = pendingWrite;
  pendingRead = 0; pendingWrite = 0;
  try {
    await db.prepare('INSERT INTO db_usage (day, rows_read, rows_written) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET rows_read = rows_read + excluded.rows_read, rows_written = rows_written + excluded.rows_written')
      .bind(today(), r, w).run();
  } catch { /* sin tabla todavía o sin cupo: no importa */ }
}

let cache: { at: number; read: number; written: number } | null = null;

/** Lo gastado hoy (aproximado, se actualiza cada minuto). */
export async function usageToday(env: Pick<Env, 'DB'>): Promise<{ read: number; written: number; limit: number; saver: boolean }> {
  if (!cache || Date.now() - cache.at > 60_000) {
    try {
      const row = await env.DB.prepare('SELECT rows_read, rows_written FROM db_usage WHERE day = ?').bind(today()).first<{ rows_read: number; rows_written: number }>();
      cache = { at: Date.now(), read: (row?.rows_read || 0) + pendingRead, written: (row?.rows_written || 0) + pendingWrite };
    } catch { cache = { at: Date.now(), read: cache?.read ?? 0, written: cache?.written ?? 0 }; }
  }
  return { read: cache.read, written: cache.written, limit: DAILY_READ_LIMIT, saver: cache.read >= DAILY_READ_LIMIT * SAVER_AT };
}

/** ¿El error es porque se acabó el cupo diario gratis de D1? */
export const isQuotaError = (e: unknown) => /row read limit|exceeded D1|free tier daily|D1_ERROR.*limit/i.test(String((e as Error)?.message || e));
