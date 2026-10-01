// Modo estudio (lectura de lo que responde la IA) y catálogo de logros.
import { describe, expect, it } from 'vitest';
import { normalizeStudy } from '../src/worker/study';
import { catalog } from '../src/worker/achievements';

describe('normalizeStudy', () => {
  it('arma un plan válido y limita los minutos', () => {
    const r = normalizeStudy('plan', { steps: [{ title: 'Leer las instrucciones', detail: 'Subraya lo que piden', minutes: 2 }, { title: 'Escribir', detail: '', minutes: 999 }, { title: '' }], tip: 'Empieza hoy' });
    expect(r?.mode).toBe('plan');
    if (r?.mode !== 'plan') return;
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].minutes).toBe(5);
    expect(r.steps[1].minutes).toBe(240);
    expect(r.tip).toBe('Empieza hoy');
  });
  it('descarta tarjetas incompletas', () => {
    const r = normalizeStudy('tarjetas', { cards: [{ q: '¿Qué es un foro?', a: 'Un espacio de discusión' }, { q: 'Sin respuesta' }] });
    expect(r?.mode === 'tarjetas' && r.cards).toEqual([{ q: '¿Qué es un foro?', a: 'Un espacio de discusión' }]);
  });
  it('devuelve null si la IA no mandó nada útil', () => {
    expect(normalizeStudy('explica', { title: 'X' })).toBeNull();
    expect(normalizeStudy('plan', null)).toBeNull();
  });
});

describe('logros', () => {
  const base = { done: 0, streak: 0, perfect: 0, honorCourses: 0, early: 0, weekDone: 0, weekTotal: 0, chats: 0, focus: 0, high: 0 };
  const won = (s: typeof base) => catalog(s).filter((a) => a.value >= a.goal).map((a) => a.id);
  it('al empezar no hay ninguno ganado', () => {
    expect(won(base)).toEqual([]);
  });
  it('se ganan con los datos reales', () => {
    const ids = won({ ...base, done: 12, streak: 3, perfect: 1 });
    expect(ids).toEqual(expect.arrayContaining(['primera', 'entregas10', 'racha3', 'perfecta']));
    expect(ids).not.toContain('entregas25');
  });
  it('«Todo al día» pide al menos 3 entregas en la semana y todas hechas', () => {
    expect(won({ ...base, weekDone: 2, weekTotal: 2 })).not.toContain('semana');
    expect(won({ ...base, weekDone: 3, weekTotal: 4 })).not.toContain('semana');
    expect(won({ ...base, weekDone: 4, weekTotal: 4 })).toContain('semana');
  });
  it('todos los logros tienen id único', () => {
    const ids = catalog(base).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
