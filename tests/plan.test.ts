// Plan de la semana: el domingo planifica de lunes a domingo, con orden sugerido y lo atrasado primero.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/worker/env';

const SUN = Date.UTC(2026, 9, 4, 22, 0) ; // domingo 4 oct 2026, 6:00 p. m. en RD
const t = (id: number, title: string, dueLocal: [number, number, number], course = 'Tecno') => ({
  id, title, course_short: course, course_name: null, status: 'pending',
  due_at: Math.floor(Date.UTC(2026, 9, dueLocal[0], dueLocal[1], dueLocal[2]) / 1000) + 4 * 3600,
});

vi.mock('../src/worker/db', () => ({ getSettings: async () => ({ student_name: 'Ana Pérez' }) }));
vi.mock('../src/worker/data', () => ({
  listTasks: async () => [
    t(1, 'Foro 1', [6, 23, 59]), t(2, 'Tarea 2', [8, 23, 59]), t(3, 'Quiz 3', [8, 20, 0]),
    t(4, 'Atrasada', [3, 23, 59]), t(5, 'Para otra semana', [13, 23, 59]),
  ],
  payWindow: async () => ({ paid: true, state: 'closed', opensAt: 0, closesAt: 0, period: '2026-10' }),
  periodLabel: () => 'octubre 2026',
}));

afterEach(() => vi.useRealTimers());

describe('weeklyPlan', () => {
  it('el domingo arma la semana de lunes a domingo', async () => {
    vi.useFakeTimers(); vi.setSystemTime(SUN);
    const { weeklyPlan } = await import('../src/worker/plan');
    // Notas de la semana: dos calificaciones (90 y 100).
    const DB = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ grade: 90, grade_max: 100 }, { grade: 10, grade_max: 10 }] }) }) }) };
    const p = await weeklyPlan({ TZ_OFFSET_HOURS: '-4', UID: 2, DB } as unknown as Env);
    expect(p.text).toContain('🗓️ *Tu plan de la semana, Ana*\n_5–11 oct_');
    expect(p.count).toBe(3); // la de la otra semana no entra
    expect(p.text).toContain('⚠️ *Primero, lo atrasado*\n• Atrasada _(Tecno)_');
    expect(p.text).toContain('el día más cargado es el jueves 8 (2)');
    // Orden por fecha, y el quiz de las 8 p. m. antes que la tarea de las 11:59 p. m.
    expect(p.text.indexOf('Quiz 3 →')).toBeLessThan(p.text.indexOf('Tarea 2 →'));
    expect(p.text).toContain('1. Foro 1 → _empieza mañana_');
    expect(p.text).not.toContain('Para otra semana');
    expect(p.text).toContain('te calificaron 2 actividades · promedio *95*');
  });
});
