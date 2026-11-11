// Trabajo hecho con IA → portada (PNG a página completa, estilo azul marino y naranja de Manuel) + documento Word (.docx).
// Todo se arma en el navegador, sin librerías: un ZIP mínimo (sin compresión) con el XML de Word.

export type Work = {
  etiqueta: string; titulo: string; subtitulo: string; motivo: string[];
  introduccion: string;
  secciones: { titulo: string; parrafos: string[]; tabla?: { titulo: string; columnas: string[]; filas: string[][] } | null }[];
  conclusion: string; referencias: string[];
};
export type Profile = { nombre: string; matricula: string; carrera: string; facilitador: string; asignatura: string; codigo: string; institucion: string; fecha: string };

const NAVY = '#101a3d', NAVY2 = '#1a2d50', ORANGE = '#ee7f22';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('No se pudo cargar el logo')); im.src = src; });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []; let cur = '';
  for (const w of text.split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Portada de 2550×3300 (carta a 300 dpi), como las de tus trabajos. */
export async function drawCover(w: Work, p: Profile): Promise<Blob> {
  try { await Promise.all(['700 100px Sora', '400 50px Sora'].map((f) => document.fonts.load(f))); } catch { /* usa la fuente de respaldo */ }
  const logo = await loadImage('/uapa-logo.png');
  const W = 2550, H = 3300;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const font = (wt: number, px: number) => `${wt} ${px}px Sora, Poppins, "Segoe UI", Arial, sans-serif`;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  // Zona azul con borde diagonal
  const g = x.createLinearGradient(0, 0, 0, 2300); g.addColorStop(0, NAVY); g.addColorStop(1, NAVY2);
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, 1900); x.lineTo(0, 2235); x.closePath(); x.fill();
  // Motivo del tema: símbolos muy tenues
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const motif = w.motivo.length ? w.motivo : ['·'];
  x.save(); x.clip(); x.globalAlpha = 0.1; x.fillStyle = '#9db4ff'; x.textBaseline = 'middle';
  for (let i = 0; i < 46; i++) { x.font = font(500, 70 + Math.floor(rnd() * 90)); x.fillText(motif[i % motif.length], rnd() * W, 120 + rnd() * 1900); }
  x.restore(); x.globalAlpha = 1; x.textBaseline = 'alphabetic';
  // Franja naranja diagonal
  x.fillStyle = ORANGE; x.beginPath(); x.moveTo(0, 2235); x.lineTo(W, 1900); x.lineTo(W, 1936); x.lineTo(0, 2278); x.closePath(); x.fill();
  // Cabecera
  x.drawImage(logo, 169, 169, 471, 280);
  x.fillStyle = '#fff'; x.font = font(700, 54); x.fillText((p.institucion || 'UNIVERSIDAD ABIERTA PARA ADULTOS').toUpperCase(), 690, 270);
  x.fillStyle = '#c9d3e8'; x.font = font(400, 46); x.fillText(p.asignatura.slice(0, 48), 690, 340);
  x.fillStyle = ORANGE;
  for (const [sx, sy, s] of [[2298, 151, 71], [2388, 151, 71], [2298, 241, 71], [2388, 241, 71], [2208, 241, 45], [2150, 305, 32]]) { x.beginPath(); x.roundRect(sx, sy, s, s, s * 0.2); x.fill(); }
  // Título
  x.font = font(700, 230);
  let size = 230, lines = wrap(x, w.titulo, 2200);
  if (lines.length > 2) { size = 190; x.font = font(700, size); lines = wrap(x, w.titulo, 2200).slice(0, 3); }
  const lh = size * 1.08;
  const top = 1560 - (lines.length - 1) * lh; // la última línea del título queda a la misma altura
  x.font = font(400, 54); const tag = w.etiqueta; const tw = x.measureText(tag).width + 90;
  x.strokeStyle = ORANGE; x.lineWidth = 5; x.beginPath(); x.roundRect(169, top - 330, tw, 84, 42); x.stroke();
  x.fillStyle = ORANGE; x.fillText(tag, 214, top - 272);
  x.fillStyle = '#fff'; x.font = font(700, size);
  lines.forEach((l, i) => x.fillText(l, 165, top + i * lh));
  const yb = top + (lines.length - 1) * lh + 70;
  x.fillStyle = ORANGE; x.fillRect(175, yb, 300, 20);
  x.fillStyle = '#e4e9f5'; x.font = font(300, 70);
  wrap(x, w.subtitulo, 2150).slice(0, 3).forEach((l, i) => x.fillText(l, 169, yb + 130 + i * 92));
  // Pie
  x.fillStyle = ORANGE; x.fillRect(0, 3060, W, 8);
  x.fillStyle = NAVY; x.fillRect(0, 3068, W, 232);
  x.fillStyle = '#b8c4dc'; x.font = font(400, 44); x.fillText('EDUCACIÓN SUPERIOR A DISTANCIA VIRTUAL', 169, 3195);
  x.textAlign = 'right'; x.font = font(700, 50); x.fillStyle = '#fff';
  const dw = x.measureText(p.fecha).width; x.fillStyle = ORANGE; x.fillText(p.fecha, 2381, 3195);
  x.fillStyle = '#fff'; x.fillText('Fecha: ', 2381 - dw, 3195); x.textAlign = 'left';
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo crear la portada'))), 'image/png'));
}

// ----- ZIP mínimo (sin compresión) -----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of all) { out.set(a, o); o += a.length; }
  return out;
}

// ----- Word -----
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t: string, o: { b?: boolean; i?: boolean; sz?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string, o: { jc?: string; before?: number; after?: number; style?: string; hanging?: boolean; keep?: boolean } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}"/>${o.hanging ? '<w:ind w:left="720" w:hanging="720"/>' : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${inner}</w:p>`;
const cell = (inner: string, w: number, fill?: string) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
const borders = (c: string) => `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${c}"/>`).join('')}</w:tblBorders>`;

function table(t: { titulo: string; columnas: string[]; filas: string[][] }): string {
  const total = 9360, cw = Math.floor(total / t.columnas.length);
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${t.columnas.map((c) => cell(para(run(c, { b: true, color: 'FFFFFF', sz: 20 }), { after: 40, before: 40 }), cw, '14214A')).join('')}</w:tr>`;
  const rows = t.filas.map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c) => cell(para(run(c, { sz: 20 }), { after: 40, before: 40 }), cw, i % 2 ? 'F3F6FC' : undefined)).join('')}</w:tr>`).join('');
  return `${para(run(t.titulo, { b: true, sz: 20, color: '14214A' }), { before: 120, after: 60, keep: true })}<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders('B8C4DC')}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>${head}${rows}</w:tbl>${para('', { after: 120 })}`;
}

function dataTable(p: Profile): string {
  const rows: [string, string][] = [['PARTICIPANTE', p.nombre], ['MATRÍCULA', p.matricula], ['FACILITADOR/A', p.facilitador], ['CARRERA', p.carrera], ['ASIGNATURA', p.asignatura], ['CÓDIGO', p.codigo]];
  const r = rows.filter(([, v]) => v).map(([k, v]) => `<w:tr>${cell(para(run(k, { b: true, sz: 17, color: 'EE7F22' }), { after: 20, before: 20 }), 2600)}${cell(para(run(v, { b: true, sz: 22, color: '101A3D' }), { after: 20, before: 20 }), 6760)}</w:tr>`).join('');
  return `${para(run('PRESENTADO POR', { b: true, sz: 18, color: '101A3D' }), { before: 9500, after: 80 })}<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="EE7F22"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D5DCEC"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E4E9F5"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>${r}</w:tbl>`;
}

export function buildDocx(w: Work, p: Profile, cover: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const links: string[] = [];
  /** Referencia APA: títulos en cursiva (*así*) y enlaces clicables. */
  const refRuns = (t: string) => t.split(/(\*[^*]+\*|https?:\/\/[^\s)>\]]+)/g).filter(Boolean).map((part) => {
    if (/^https?:/.test(part)) {
      const u = part.replace(/[.,;]+$/, ''); links.push(u);
      return `<w:hyperlink r:id="rIdL${links.length}"><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${esc(u)}</w:t></w:r></w:hyperlink>${part.length > u.length ? run(part.slice(u.length)) : ''}`;
    }
    return /^\*[^*]+\*$/.test(part) ? run(part.slice(1, -1), { i: true }) : run(part);
  }).join('');
  const EMU_W = 7772400, EMU_H = 10058400;
  const drawing = `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${EMU_W}" cy="${EMU_H}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="Portada"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="portada.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU_W}" cy="${EMU_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
  let n = 0;
  const body = [
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${drawing}</w:p>`,
    dataTable(p),
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    para(run('Introducción'), { style: 'Heading1' }),
    para(run(w.introduccion), { jc: 'both' }),
    para(run('Desarrollo'), { style: 'Heading1' }),
    ...w.secciones.flatMap((s) => [
      para(run(s.titulo), { style: 'Heading2' }),
      ...s.parrafos.map((t) => para(run(t), { jc: 'both' })),
      ...(s.tabla ? [table({ ...s.tabla, titulo: /^tabla\s*\d/i.test(s.tabla.titulo) ? s.tabla.titulo : `Tabla ${++n}. ${s.tabla.titulo.replace(/^tabla\.?\s*/i, '')}` })] : []),
    ]),
    para(run('Conclusión'), { style: 'Heading1' }),
    para(run(w.conclusion), { jc: 'both' }),
    ...(w.referencias.length ? [para(run('Referencias'), { style: 'Heading1' }), ...[...w.referencias].sort((a, b) => a.replace(/\*/g, '').localeCompare(b.replace(/\*/g, ''), 'es')).map((r) => para(refRuns(r), { hanging: true }))] : []),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="es-DO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="EE7F22"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="101A3D"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="14214A"/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: enc.encode(document) },
    { name: 'word/styles.xml', data: enc.encode(styles) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/portada.png"/>${links.map((u, i) => `<Relationship Id="rIdL${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(u)}" TargetMode="External"/>`).join('')}</Relationships>`) },
    { name: 'word/media/portada.png', data: cover },
  ];
  return zip(files);
}

/** Genera la portada y el .docx y lo descarga. */
export async function downloadWord(w: Work, p: Profile, fileBase: string): Promise<void> {
  const cover = new Uint8Array(await (await drawCover(w, p)).arrayBuffer());
  const bytes = buildDocx(w, p, cover);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const a = document.createElement('a'); a.href = url; a.download = `${fileBase.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Trabajo'}.docx`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Texto plano del trabajo, para copiar al portapapeles. */
export function workText(w: Work): string {
  return [w.titulo, '', 'Introducción', w.introduccion, '', 'Desarrollo',
    ...w.secciones.flatMap((s) => [s.titulo, ...s.parrafos, ...(s.tabla ? [s.tabla.titulo, s.tabla.columnas.join(' | '), ...s.tabla.filas.map((r) => r.join(' | '))] : []), '']),
    'Conclusión', w.conclusion, '', 'Referencias', ...w.referencias.map((r) => r.replace(/\*/g, ''))].join('\n');
}
