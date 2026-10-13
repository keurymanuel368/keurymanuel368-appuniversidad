// Notas de foros: la nota que el facilitador escribe en su respuesta, las puntuaciones y los acentos rotos del EVA.
import { describe, expect, it } from 'vitest';
import { combineRatings, parseGradeText } from '../src/worker/forums';
import { fixText } from '../src/worker/moodle';

describe('parseGradeText', () => {
  it('lee «Calificación: 95/100»', () => expect(parseGradeText('Excelente aporte.\nCalificación: 95/100')).toEqual({ grade: 95, max: 100 }));
  it('lee «su calificación es 98»', () => expect(parseGradeText('Buen trabajo, su calificación es 98.')).toEqual({ grade: 98, max: 100 }));
  it('lee «Puntuación obtenida: 9 de 10»', () => expect(parseGradeText('Puntuación obtenida: 9 de 10')).toEqual({ grade: 9, max: 10 }));
  it('lee decimales con coma', () => expect(parseGradeText('Nota final: 9,5')).toEqual({ grade: 9.5, max: 10 }));
  it('lee porcentajes', () => expect(parseGradeText('Valoración: 90%')).toEqual({ grade: 90, max: 100 }));
  it('lee «obtuviste 100 puntos»', () => expect(parseGradeText('Felicidades, obtuviste 100 puntos en este foro')).toEqual({ grade: 100, max: 100 }));
  it('no confunde fechas ni números sueltos', () => {
    expect(parseGradeText('Recuerden entregar el 12/10 antes de las 11:59')).toBeNull();
    expect(parseGradeText('Revisen la semana 3 del programa')).toBeNull();
  });
  it('descarta notas imposibles', () => expect(parseGradeText('Calificación: 150/100')).toBeNull());
});

describe('combineRatings', () => {
  it('promedia por defecto', () => expect(combineRatings([90, 100], 1, 100)).toBe(95));
  it('máximo y suma con tope', () => {
    expect(combineRatings([80, 100], 3, 100)).toBe(100);
    expect(combineRatings([60, 70], 5, 100)).toBe(100);
  });
  it('sin puntuaciones no hay nota', () => expect(combineRatings([], 1, 100)).toBeNull());
});

describe('fixText', () => {
  it('repara la í rota del EVA', () => expect(fixText('Tecnolog�­a para el Aprendizaje Virtual')).toBe('Tecnología para el Aprendizaje Virtual'));
  it('deja intacto el texto bueno', () => expect(fixText('Comunicación Oral')).toBe('Comunicación Oral'));
});
