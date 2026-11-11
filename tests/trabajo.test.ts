import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cleanSections, normalizeWork } from '../src/worker/trabajo';
import { buildDocx, type Profile, type Work } from '../src/web/trabajo';

const work: Work = {
  etiqueta: 'TRABAJO FINAL · ANÁLISIS', titulo: 'A la deriva', subtitulo: 'Guía de análisis del cuento', motivo: ['p', 'q', '∀'],
  introduccion: 'Introducción de prueba con ñ y acentos & <símbolos>.',
  secciones: [
    { titulo: '1. Ficha técnica', parrafos: ['Párrafo con **término clave** en negrita.'], lista: ['Primera viñeta', 'Segunda viñeta'], destacado: 'Idea central destacada.', tabla: { titulo: 'Tabla 1. Ficha', columnas: ['Dato', 'Información'], filas: [['Título', 'A la deriva'], ['Autor', 'Horacio Quiroga']] } },
    { titulo: '2. Personajes', parrafos: ['Otro párrafo.'], tabla: null },
  ],
  conclusion: 'Conclusión.', referencias: ['ONU. (2015). *Objetivos de Desarrollo Sostenible*. https://www.un.org/sustainabledevelopment/es/','Quiroga, H. (1917). Cuentos.', 'Anthropic. (2026). Claude [Modelo de lenguaje grande]. https://claude.ai'],
};
const profile: Profile = { nombre: 'Keury Manuel Durán García', matricula: '100108669', carrera: 'Ingeniería de Software', facilitador: 'X', asignatura: 'Comunicación Oral y Escrita', codigo: 'CBE109', institucion: 'UNIVERSIDAD ABIERTA PARA ADULTOS', fecha: '11-11-2026' };

describe('trabajo con IA', () => {
  it('normaliza la respuesta de la IA', () => {
    const w = normalizeWork(JSON.parse(JSON.stringify(work)));
    expect(w?.secciones).toHaveLength(2);
    expect(w?.secciones[0].tabla?.filas[0]).toHaveLength(2);
    expect(normalizeWork({ titulo: 'x' })).toBeNull();
    expect(normalizeWork(null)).toBeNull();
  });
  it('quita secciones duplicadas y renumera', () => {
    const out = cleanSections([{ titulo: '1. Introducción' }, { titulo: '2. Desarrollo' }, { titulo: '3. Biografía' }, { titulo: '3.1 Infancia' }, { titulo: '4. Personajes' }, { titulo: '5. Conclusión' }, { titulo: '6. Referencias' }]);
    expect(out.map((s) => s.titulo)).toEqual(['1. Biografía', '1.1 Infancia', '2. Personajes']);
    expect(cleanSections([{ titulo: 'Conclusión' }]).length).toBe(1); // si solo hubiera esas, no se deja vacío
  });
  it('arma un .docx (zip) con sus partes', () => {
    const bytes = buildDocx(work, profile, new Uint8Array([137, 80, 78, 71]));
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    for (const n of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/media/portada.png']) expect(text).toContain(n);
    expect(text).toContain('hyperlink');
    expect(text).toContain('Primera viñeta');
    expect(text).toContain('Idea central destacada.');
    expect(text).not.toContain('**');
    expect(text).toContain('rIdL1');
    if (process.env.WORK_OUT) writeFileSync(process.env.WORK_OUT, bytes);
  });
});
