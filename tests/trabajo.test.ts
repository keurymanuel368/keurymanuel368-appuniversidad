import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { normalizeWork } from '../src/worker/trabajo';
import { buildDocx, type Profile, type Work } from '../src/web/trabajo';

const work: Work = {
  etiqueta: 'TRABAJO FINAL · ANÁLISIS', titulo: 'A la deriva', subtitulo: 'Guía de análisis del cuento', motivo: ['p', 'q', '∀'],
  introduccion: 'Introducción de prueba con ñ y acentos & <símbolos>.',
  secciones: [
    { titulo: '1. Ficha técnica', parrafos: ['Párrafo uno.'], tabla: { titulo: 'Tabla 1. Ficha', columnas: ['Dato', 'Información'], filas: [['Título', 'A la deriva'], ['Autor', 'Horacio Quiroga']] } },
    { titulo: '2. Personajes', parrafos: ['Otro párrafo.'], tabla: null },
  ],
  conclusion: 'Conclusión.', referencias: ['Quiroga, H. (1917). Cuentos.', 'Anthropic. (2026). Claude [Modelo de lenguaje grande]. https://claude.ai'],
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
  it('arma un .docx (zip) con sus partes', () => {
    const bytes = buildDocx(work, profile, new Uint8Array([137, 80, 78, 71]));
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    for (const n of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/media/portada.png']) expect(text).toContain(n);
    if (process.env.WORK_OUT) writeFileSync(process.env.WORK_OUT, bytes);
  });
});
