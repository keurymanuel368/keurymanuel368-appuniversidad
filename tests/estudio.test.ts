import { describe, expect, it } from 'vitest';
import { parseSheet, topChunks, tokens } from '../src/worker/estudio';
import { lineify } from '../src/worker/clases';

describe('cuadernos de estudio', () => {
  it('separa la hoja de sus fichas', () => {
    const r = parseSheet([
      '## En pocas palabras', 'Texto largo.', '', '=== TARJETAS ===',
      'P: ¿Qué es una tautología? | R: Una proposición siempre verdadera.',
      '- P: ¿Y una contradicción? | R: Siempre falsa.', 'línea suelta',
    ].join('\n'));
    expect(r.body).toContain('En pocas palabras');
    expect(r.cards).toHaveLength(2);
    expect(r.cards[0].back).toMatch(/siempre verdadera/);
    expect(parseSheet('solo texto').cards).toHaveLength(0);
  });
  it('busca los trozos más parecidos a la pregunta', () => {
    const docs = [
      { id: 'a', titulo: 'Inducción', curso: 'Lógica', texto: 'La inducción matemática prueba algo para todos los naturales.\nPaso base y paso inductivo.' },
      { id: 'b', titulo: 'Historia', curso: 'Lengua', texto: 'El cuento es una narración breve con pocos personajes.' },
    ];
    const top = topChunks(docs, '¿Qué es la inducción matemática?');
    expect(top[0].titulo).toBe('Inducción');
    expect(topChunks(docs, 'xyz qwerty')).toHaveLength(0);
    expect(tokens('¿Qué es la inducción?')).toEqual(['induccion']);
  });
  it('convierte un texto corrido en líneas con marcas de tiempo', () => {
    const t = lineify('Primera oración de la clase. ' + 'Otra frase más larga sobre el tema de hoy. '.repeat(30));
    const lines = t.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toMatch(/^\[0:00\] /);
    expect(lines[1]).toMatch(/^\[0:20\] /);
  });
});
