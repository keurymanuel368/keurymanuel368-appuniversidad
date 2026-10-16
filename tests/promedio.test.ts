// Promedio por asignatura (src/shared/promedio.ts): pesos del EVA, actividades que no cuentan y simulador.
import { describe, expect, it } from 'vitest';
import { courseAverage, gradeWeights, neededFor, noCuenta } from '../src/shared/promedio';

const r = (grade: number | null, weight: number | null = null, grade_max = 100) => ({ grade, grade_max, weight });

describe('noCuenta (actividades que no se corrigen)', () => {
  it('reconoce la rúbrica de actitudes y valores y el espacio fuera de fecha', () => {
    expect(noCuenta('Rúbrica de Actitudes y Valores')).toBe(true);
    expect(noCuenta('RÚBRICA ACTITUDES Y VALORES')).toBe(true);
    expect(noCuenta('Espacio para enviar una tarea fuera de fecha')).toBe(true);
    expect(noCuenta('Entrega fuera del plazo')).toBe(true);
  });
  it('no toca las actividades normales', () => {
    expect(noCuenta('Tarea IV Lectura y Redacción de Párrafo')).toBe(false);
    expect(noCuenta('Foro sobre métodos de demostración matemática')).toBe(false);
    expect(noCuenta(null)).toBe(false);
  });
});

describe('courseAverage', () => {
  it('con pesos del EVA, una actividad con peso 0 no cuenta (antes cambiaba todo el cálculo)', () => {
    // Caso real: Lógica tiene pesos; una nota puesta a mano en algo que vale 0 % no debe mover el promedio.
    const base = [r(100, 0.09), r(90, 0.09), r(10, 0.009, 10)];
    const before = courseAverage(base).avg!;
    const after = courseAverage([...base, r(100, 0)]).avg!;
    expect(after).toBeCloseTo(before, 6);
    expect(courseAverage([...base, r(100, 0)]).total).toBe(3);
  });
  it('usa los pesos del EVA', () => expect(courseAverage([r(100, 0.3), r(50, 0.1)]).avg).toBe(87.5));
  it('sin pesos en el EVA, todas valen igual', () => expect(courseAverage([r(100), r(50)]).avg).toBe(75));
  it('una nota tuya en algo que el EVA no pesa vale como el promedio de las demás', () => {
    expect(courseAverage([r(100, 0.2), r(50, null)]).avg).toBe(75);
  });
  it('sin notas no hay promedio, pero sí cuenta lo que falta', () => {
    const a = courseAverage([r(null, 0.2), r(null, 0.3)]);
    expect(a.avg).toBeNull();
    expect(a.total).toBe(2);
  });
  it('cuenta calificadas y totales solo de lo que vale algo', () => {
    const a = courseAverage([r(95, 0.5), r(null, 0.5), r(null, 0)]);
    expect([a.graded, a.total]).toEqual([1, 2]);
  });
});

describe('neededFor (simulador)', () => {
  it('dice cuánto falta sacar con pesos', () => {
    // 80 en lo que vale 50 %; para terminar con 90 hace falta 100 en el otro 50 %.
    expect(neededFor([r(80, 0.5), r(null, 0.5)], 90)).toBe(100);
  });
  it('ignora lo que vale 0 % al calcular lo que falta', () => {
    expect(neededFor([r(80, 0.5), r(null, 0.5), r(null, 0)], 90)).toBe(100);
  });
  it('null cuando ya no falta nada', () => expect(neededFor([r(90, 1)], 90)).toBeNull());
  it('gradeWeights sin pesos: todas valen 1', () => expect(gradeWeights([r(1), r(2)]).weighted).toBe(false));
});
