import { describe, expect, it } from 'vitest';
import { docxText, palabrasObjetivo, parseReglas, pdfStrings, reglasActivas, reglasBlock, rubricToText, xmlToText, type Reglas } from '../src/worker/reglas';

/** Zip mínimo con un archivo sin comprimir (suficiente para probar la lectura de un .docx). */
function zipStored(name: string, content: string): Uint8Array {
  const enc = new TextEncoder();
  const n = enc.encode(name), d = enc.encode(content);
  const local = new Uint8Array(30 + n.length + d.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(26, n.length, true); lv.setUint16(28, 0, true);
  local.set(n, 30); local.set(d, 30 + n.length);
  const cen = new Uint8Array(46 + n.length);
  const cv = new DataView(cen.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 0, true); cv.setUint32(20, d.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, 0, true);
  cen.set(n, 46);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(10, 1, true); ev.setUint32(12, cen.length, true); ev.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + cen.length + eocd.length);
  out.set(local, 0); out.set(cen, local.length); out.set(eocd, local.length + cen.length);
  return out;
}

const base = (o: Partial<Reglas> = {}): Reglas => ({ resumen: '', palabras: null, referencias: null, reglas: [], fuentes: [], quitadas: [], propias: [], at: 0, ...o });

describe('lectura de archivos del EVA', () => {
  it('saca el texto de un .docx', async () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Extensión: 3 páginas</w:t></w:r></w:p><w:p><w:r><w:t>Usar APA 7 &amp; citas</w:t></w:r></w:p></w:body></w:document>';
    const t = await docxText(zipStored('word/document.xml', xml));
    expect(t).toContain('Extensión: 3 páginas');
    expect(t).toContain('Usar APA 7 & citas');
  });
  it('xmlToText separa párrafos', () => {
    expect(xmlToText('<w:p><w:t>A</w:t></w:p><w:p><w:t>B</w:t></w:p>')).toBe('A\nB');
  });
  it('lee texto de un PDF simple', () => {
    const t = pdfStrings('BT /F1 12 Tf (Entrega en Word) Tj T* [(Fuente ) -20 (Arial 12)] TJ ET');
    expect(t).toContain('Entrega en Word');
    expect(t).toContain('Fuente Arial 12');
  });
});

describe('rúbrica del EVA', () => {
  it('convierte criterios de rúbrica y de guía en texto', () => {
    const t = rubricToText([{ definitions: [
      { rubric: { rubric_criteria: [{ description: '<p>Ortografía</p>', levels: [{ score: 2, definition: 'Sin errores' }, { score: 5, definition: 'Excelente' }] }] } },
      { guide: { guide_criteria: [{ shortname: 'Conclusión', maxscore: 10, description: 'Cierra con ideas propias' }] } },
    ] }]);
    expect(t).toContain('Criterio: Ortografía (máximo 5 pts)');
    expect(t).toContain('5 pts = Excelente');
    expect(t).toContain('Criterio: Conclusión (máximo 10 pts)');
  });
});

describe('reglas del trabajo', () => {
  const raw = '```json\n{"resumen":"Ensayo","palabras":{"min":900,"max":1100},"referencias":{"min":5,"estilo":"APA 7"},"reglas":[{"texto":"Incluir portada","tipo":"formato","puntos":null},{"texto":"Explicar el concepto","tipo":"criterio","puntos":20},{"texto":""}]}\n```';
  it('lee el JSON de la IA aunque venga con adornos', () => {
    const p = parseReglas(raw, ['Consigna del EVA'])!;
    expect(p.reglas.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(p.reglas[1].puntos).toBe(20);
    expect(p.palabras).toEqual({ min: 900, max: 1100 });
    expect(p.referencias).toEqual({ min: 5, estilo: 'APA 7' });
  });
  it('devuelve null si no hay JSON', () => {
    expect(parseReglas('no sé', [])).toBeNull();
  });
  it('las reglas activas quitan las descartadas y suman las propias', () => {
    const r = base({ reglas: [{ id: 'r1', texto: 'A', tipo: 'otro', puntos: null }, { id: 'r2', texto: 'B', tipo: 'criterio', puntos: 10 }], quitadas: ['r1'], propias: ['Usar ejemplos dominicanos'] });
    expect(reglasActivas(r)).toEqual(['B (10 pts)', 'Usar ejemplos dominicanos']);
    expect(reglasBlock(r)).toContain('1. B (10 pts)');
    expect(reglasBlock(r)).toContain('2. Usar ejemplos dominicanos');
  });
  it('sin reglas el bloque va vacío', () => {
    expect(reglasBlock(null)).toBe('');
    expect(reglasBlock(base())).toBe('');
  });
  it('la extensión de las reglas fija las palabras objetivo', () => {
    expect(palabrasObjetivo(base({ palabras: { min: 900, max: 1100 } }))).toBe(1000);
    expect(palabrasObjetivo(base({ palabras: { min: null, max: 1000 } }))).toBe(950);
    expect(palabrasObjetivo(base({ palabras: { min: 500, max: null } }))).toBe(560);
    expect(palabrasObjetivo(base())).toBeNull();
    expect(palabrasObjetivo(base({ palabras: { min: 20000, max: 30000 } }))).toBe(6000);
  });
});

import { contarReferencias, revisionesFijas } from '../src/worker/reglas';

describe('revisión del trabajo', () => {
  it('cuenta referencias en la zona de bibliografía', () => {
    const t = 'Texto con (2020) en medio.\n\nReferencias\nONU. (2015). Agenda 2030. https://un.org\nUNESCO. (2021). Educación. https://unesco.org\nLibro sin año\n';
    expect(contarReferencias(t)).toBe(2);
  });
  it('sin sección de referencias cuenta enlaces y años en todo el texto', () => {
    expect(contarReferencias('Ver https://a.org\nTambién https://b.org')).toBe(2);
  });
  it('comprueba extensión y referencias sin IA', () => {
    const r = { resumen: '', palabras: { min: 900, max: 1100 }, referencias: { min: 4, estilo: 'APA 7' }, reglas: [], fuentes: [], quitadas: [], propias: [], at: 0 };
    const ok = revisionesFijas(r, 1000, 5);
    expect(ok.every((x) => x.ok)).toBe(true);
    const mal = revisionesFijas(r, 400, 2);
    expect(mal.map((x) => x.ok)).toEqual([false, false]);
    expect(mal[0].nota).toContain('400');
  });
});
