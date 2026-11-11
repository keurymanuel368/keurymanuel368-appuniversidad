import { describe, expect, it } from 'vitest';
import { fmtAt, hasCue, isGhost, normalizeNotes, sameQuestion, splitParts } from '../src/worker/clases';

describe('clase en vivo', () => {
  it('descarta lo que Whisper inventa con silencio', () => {
    expect(isGhost('Gracias por ver el video.')).toBe(true);
    expect(isGhost('Subtítulos por la comunidad de Amara.org')).toBe(true);
    expect(isGhost('ok')).toBe(true);
    expect(isGhost('Entonces la tabla de verdad de la implicación solo es falsa cuando el antecedente es verdadero y el consecuente falso.')).toBe(false);
  });
  it('detecta cuando te nombran o preguntan', () => {
    expect(hasCue('Keury, ¿me puede decir qué es una tautología?')).toBe(true);
    expect(hasCue('A ver, Queury, participe')).toBe(true);
    expect(hasCue('Quién puede explicar el modus ponens')).toBe(true);
    expect(hasCue('Hoy vamos a ver las leyes de inferencia en detalle')).toBe(false);
  });
  it('reconoce la misma pregunta dicha dos veces', () => {
    expect(sameQuestion('¿Qué es una tautología?', 'que es una tautologia')).toBe(true);
    expect(sameQuestion('¿Qué es una tautología?', 'Cuál es la diferencia entre AND y OR')).toBe(false);
  });
  it('formatea minutos y parte textos largos', () => {
    expect(fmtAt(75)).toBe('1:15'); expect(fmtAt(3725)).toBe('1:02:05');
    const t = Array.from({ length: 400 }, (_, i) => `[${i}:00] ${'palabra '.repeat(10)}`).join('\n');
    const parts = splitParts(t);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length < 9500)).toBe(true);
  });
  it('normaliza las notas de la IA', () => {
    const n = normalizeNotes({ resumen: 'R', temas: ['a'], explicacion: [{ titulo: 'T', texto: 'x' }, { titulo: '', texto: 'y' }], conceptos: [{ termino: 'c', definicion: 'd' }] }, { tarjetas: [{ front: 'f', back: 'b' }, { front: '', back: 'z' }], examen: [{ pregunta: 'p', respuesta: 'r' }] });
    expect(n.explicacion).toHaveLength(1); expect(n.tarjetas).toHaveLength(1); expect(n.examen).toHaveLength(1);
    expect(normalizeNotes(null, null).resumen).toBe('');
  });
});
