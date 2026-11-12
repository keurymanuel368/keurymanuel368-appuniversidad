import { describe, expect, it } from 'vitest';
import { isQuotaError, meter } from '../src/worker/usage';

/** Una D1 de mentira: cada consulta «lee» las filas que le digamos. */
function fakeDb(rows: number) {
  const stmt = (sql: string, binds: unknown[] = []) => ({
    sql, binds,
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => ({ results: [{ n: 7, name: 'x' }], meta: { rows_read: rows, rows_written: 0 } }),
    run: async () => ({ success: true, meta: { rows_read: 0, rows_written: 1 } }),
    first: async () => ({ n: 99 }),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (s: { sql: string }[]) => s.map(() => ({ results: [], meta: { rows_read: rows, rows_written: 0 } })) } as unknown as D1Database;
}

describe('medidor de la base de datos', () => {
  it('first() sigue devolviendo la fila o la columna', async () => {
    const db = meter(fakeDb(3));
    expect(await db.prepare('SELECT n FROM t').bind(1).first()).toEqual({ n: 7, name: 'x' });
    expect(await db.prepare('SELECT n FROM t').first('n')).toBe(7);
    expect(await db.prepare('SELECT n FROM t').first('nada')).toBe(null);
  });
  it('all() y run() pasan igual y batch() acepta consultas envueltas', async () => {
    const db = meter(fakeDb(5));
    const r = await db.prepare('SELECT 1').bind(2).all();
    expect(r.results).toHaveLength(1);
    expect((await db.prepare('INSERT INTO t VALUES (1)').run()).success).toBe(true);
    const b = await db.batch([db.prepare('SELECT 1'), db.prepare('SELECT 2')]);
    expect(b).toHaveLength(2);
  });
  it('reconoce el error de cupo agotado', () => {
    expect(isQuotaError(new Error('D1_ERROR: Your account has exceeded D1\'s free tier daily row read limit.'))).toBe(true);
    expect(isQuotaError(new Error('otra cosa'))).toBe(false);
  });
});
