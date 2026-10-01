// Avisos de calificaciones, fechas en hora de República Dominicana y títulos de avisos.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gradeMessage } from '../src/worker/grades';
import { cuandoTexto, horaTexto } from '../src/worker/time';
import { cleanTitle } from '../src/web/api';
import type { Env } from '../src/worker/env';

const base = { course: 'Tecnología', courseId: 1, item: 'Foro 1', max: 100, prev: null, feedback: '', key: null, itemId: 9 };

describe('gradeMessage (aviso de nota)', () => {
  it('celebra una nota alta', () => {
    const m = gradeMessage({ ...base, grade: 95 });
    expect(m.title).toBe('🎉 ¡Te calificaron! 95/100');
    expect(m.changed).toBe(false);
  });
  it('avisa cuando cambian la nota', () => {
    const m = gradeMessage({ ...base, grade: 80, prev: 70 });
    expect(m.title).toBe('✅ Te cambiaron la nota: 80/100');
    expect(m.body).toContain('Antes tenías 70');
  });
  it('anima cuando la nota es baja e incluye el comentario', () => {
    const m = gradeMessage({ ...base, grade: 12.5, max: 20, feedback: 'Faltó la conclusión' });
    expect(m.icon).toBe('⚠️');
    expect(m.body).toContain('💬 Faltó la conclusión');
  });
});

describe('fechas en hora de RD', () => {
  const env = { TZ_OFFSET_HOURS: '-4' } as unknown as Env;
  afterEach(() => vi.useRealTimers());
  it('horaTexto usa formato de 12 horas', () => {
    expect(horaTexto(new Date(Date.UTC(2026, 9, 1, 19, 0)))).toMatch(/^7(:00)? p\. m\.$/);
    expect(horaTexto(new Date(Date.UTC(2026, 9, 1, 9, 30)))).toMatch(/^9:30 a\. m\.$/);
  });
  it('cuandoTexto dice «hoy» y «mañana» según el día en RD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T14:00:00Z')); // 10:00 a. m. en RD
    expect(cuandoTexto(env, Date.UTC(2026, 9, 1, 23, 0) / 1000)).toMatch(/^hoy /);
    expect(cuandoTexto(env, Date.UTC(2026, 9, 2, 3, 0) / 1000)).toMatch(/^hoy /); // 11 p. m. en RD (ya es mañana en UTC)
    expect(cuandoTexto(env, Date.UTC(2026, 9, 2, 15, 0) / 1000)).toMatch(/^mañana /);
  });
});

describe('cleanTitle (títulos de avisos del EVA)', () => {
  it('quita los códigos del inicio', () => {
    expect(cleanTitle('202633-CBC103-HV4-2347-0: SEMANA I-Foro')).toBe('SEMANA I-Foro');
    expect(cleanTitle('Pago de matrícula, cuota 3')).toBe('Pago de matrícula, cuota 3');
    expect(cleanTitle('2026-Calendario académico')).toBe('2026-Calendario académico');
  });
});
