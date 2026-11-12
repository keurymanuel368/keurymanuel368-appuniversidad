// Reglas de cada trabajo: junta lo que el facilitador exige (consigna escrita, rúbrica o guía de calificación del EVA y los
// archivos adjuntos en Word o PDF), la IA lo convierte en una lista de reglas verificables y «Hacer con IA» tiene que cumplirlas TODAS.
import type { Hono } from 'hono';
import type { Env } from './env';
import { listTasks } from './data';
import { htmlToText, moodleCall } from './moodle';
import { llmComplete } from './llm';
import { nowSec } from './time';

type App = Hono<{ Bindings: Env }>;

export type Regla = { id: string; texto: string; tipo: string; puntos: number | null };
export type Reglas = {
  resumen: string;
  palabras: { min: number | null; max: number | null } | null;
  referencias: { min: number | null; estilo: string | null } | null;
  reglas: Regla[];
  fuentes: string[];
  quitadas: string[];
  propias: string[];
  at: number;
};
export type Cumple = { texto: string; ok: boolean; nota: string };

// ---------- Lectura de archivos (puras o casi: con pruebas) ----------
export function xmlToText(xml: string): string {
  return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}

async function inflate(data: Uint8Array, fmt: 'deflate-raw' | 'deflate'): Promise<Uint8Array> {
  const ds = new DecompressionStream(fmt);
  const w = ds.writable.getWriter();
  void w.write(data as unknown as BufferSource).catch(() => {});
  void w.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** Saca un archivo de dentro de un .docx (que es un zip). */
export async function unzipEntry(buf: Uint8Array, name: string): Promise<Uint8Array | null> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    if (new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen)) === name) {
      const ln = dv.getUint16(off + 26, true), le = dv.getUint16(off + 28, true);
      const data = buf.subarray(off + 30 + ln + le, off + 30 + ln + le + csize);
      return method === 0 ? data : method === 8 ? inflate(data, 'deflate-raw') : null;
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}

export async function docxText(buf: Uint8Array): Promise<string> {
  const x = await unzipEntry(buf, 'word/document.xml').catch(() => null);
  return x ? xmlToText(new TextDecoder().decode(x)) : '';
}

/** Texto de un PDF «normal» (con texto, no escaneado): mejor esfuerzo. */
export function pdfStrings(content: string): string {
  const un = (s: string) => s.replace(/\\([nrtbf()\\])/g, (_, c: string) => ({ n: '\n', r: '', t: ' ', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c] ?? c)).replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
  const out: string[] = [];
  for (const m of content.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|\bT\*|\bET\b/g)) {
    if (m[1] !== undefined) out.push([...m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((x) => un(x[1])).join(''));
    else if (m[2] !== undefined) out.push(un(m[2]));
    else out.push('\n');
  }
  return out.join(' ').replace(/ ?\n ?/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function pdfText(buf: Uint8Array): Promise<string> {
  const raw = new TextDecoder('latin1').decode(buf);
  const parts: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let chunk = buf.subarray(start, end);
    try { chunk = await inflate(chunk, 'deflate'); } catch { /* ya venía sin comprimir o con otro filtro */ }
    const t = pdfStrings(new TextDecoder('latin1').decode(chunk));
    if (t.length > 20) parts.push(t);
    if (parts.join('').length > 14000) break;
  }
  return parts.join('\n').slice(0, 14000);
}

// ---------- Rúbrica del EVA ----------
type Definition = { name?: string; rubric?: { rubric_criteria?: { description?: string; levels?: { score?: number; definition?: string }[] }[] }; guide?: { guide_criteria?: { shortname?: string; description?: string; maxscore?: number }[] } };
export function rubricToText(areas: { definitions?: Definition[] }[]): string {
  const lines: string[] = [];
  for (const a of areas) for (const d of a.definitions || []) {
    for (const c of d.rubric?.rubric_criteria || []) {
      const lv = (c.levels || []).slice().sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
      const max = lv[0]?.score;
      lines.push(`Criterio: ${htmlToText(c.description || '')}${max !== undefined ? ` (máximo ${max} pts)` : ''}${lv.length ? ` · Niveles: ${lv.map((l) => `${l.score} pts = ${htmlToText(l.definition || '')}`).join(' | ')}` : ''}`);
    }
    for (const c of d.guide?.guide_criteria || []) lines.push(`Criterio: ${c.shortname || ''}${c.maxscore !== undefined ? ` (máximo ${c.maxscore} pts)` : ''}${c.description ? ` · ${htmlToText(c.description)}` : ''}`);
  }
  return lines.join('\n');
}

async function rubricOf(env: Env, url: string | null): Promise<string> {
  const cmid = url?.match(/\/mod\/\w+\/view\.php\?id=(\d+)/)?.[1];
  if (!cmid || !env.MOODLE_TOKEN) return '';
  try {
    const r = await moodleCall<{ areas?: { definitions?: Definition[] }[] }>(env, 'core_grading_get_definitions', { 'cmids[0]': Number(cmid), areaname: 'submission' });
    return rubricToText(r.areas || []);
  } catch { return ''; }
}

async function filesOf(env: Env, attachments: string | null): Promise<{ name: string; text: string }[]> {
  if (!attachments || !env.MOODLE_TOKEN) return [];
  const base = env.MOODLE_URL.replace(/\/$/, '');
  const out: { name: string; text: string }[] = [];
  for (const f of (JSON.parse(attachments) as { name: string; url: string }[]).slice(0, 4)) {
    if (!f.url.startsWith(base) || !/\.(docx|pdf)$/i.test(f.name)) continue;
    try {
      const u = new URL(f.url.replace('/pluginfile.php/', '/webservice/pluginfile.php/').replace('/webservice/webservice/', '/webservice/'));
      u.searchParams.set('token', env.MOODLE_TOKEN);
      const r = await fetch(u.toString());
      if (!r.ok || Number(r.headers.get('content-length') || 0) > 3_000_000) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 3_000_000) continue;
      const text = /\.docx$/i.test(f.name) ? await docxText(buf) : await pdfText(buf);
      if (text.length > 40) out.push({ name: f.name, text: text.slice(0, 7000) });
    } catch { /* archivo ilegible: se sigue con lo demás */ }
  }
  return out;
}

// ---------- Reglas ----------
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
export function parseReglas(raw: string, fuentes: string[]): Omit<Reglas, 'quitadas' | 'propias' | 'at'> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const reglas = (Array.isArray(j.reglas) ? j.reglas : []).slice(0, 30).map((x, i) => {
    const o = (x || {}) as Record<string, unknown>;
    return { id: `r${i + 1}`, texto: String(o.texto || '').trim().slice(0, 260), tipo: String(o.tipo || 'otro').slice(0, 20), puntos: num(o.puntos) };
  }).filter((r) => r.texto);
  const p = (j.palabras || null) as { min?: unknown; max?: unknown } | null;
  const rf = (j.referencias || null) as { min?: unknown; estilo?: unknown } | null;
  return {
    resumen: String(j.resumen || '').trim().slice(0, 240),
    palabras: p && (num(p.min) || num(p.max)) ? { min: num(p.min), max: num(p.max) } : null,
    referencias: rf && (num(rf.min) || rf.estilo) ? { min: num(rf.min), estilo: rf.estilo ? String(rf.estilo).slice(0, 30) : null } : null,
    reglas, fuentes,
  };
}

/** Las reglas que de verdad se aplican: las detectadas (menos las que quitaste) más las que agregaste tú. */
export function reglasActivas(r: Reglas): string[] {
  return [...r.reglas.filter((x) => !r.quitadas.includes(x.id)).map((x) => `${x.texto}${x.puntos ? ` (${x.puntos} pts)` : ''}`), ...r.propias];
}

export function reglasBlock(r: Reglas | null): string {
  const list = r ? reglasActivas(r) : [];
  if (!list.length) return '';
  return `REGLAS OBLIGATORIAS DE ESTE TRABAJO (salen de la consigna, la rúbrica y los archivos del facilitador en el EVA). Cumple TODAS, sin excepción y de forma literal: si una regla pide una cantidad, un formato, una sección, un ejemplo o un tema, hazlo tal cual:\n${list.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
}

/** Palabras objetivo si las reglas fijan la extensión (si no, null y se usa el largo elegido). */
export function palabrasObjetivo(r: Reglas | null): number | null {
  const p = r?.palabras;
  if (!p) return null;
  const v = p.min && p.max ? (p.min + p.max) / 2 : p.max ? p.max * 0.95 : p.min ? p.min * 1.12 : null;
  return v ? Math.min(6000, Math.max(300, Math.round(v))) : null;
}

export async function loadReglas(env: Env, taskId: number): Promise<Reglas | null> {
  const row = await env.DB.prepare('SELECT rules FROM task_rules WHERE task_id = ? AND user_id = ?').bind(taskId, env.UID).first<{ rules: string }>();
  if (!row) return null;
  try { const r = JSON.parse(row.rules) as Reglas; return { ...r, quitadas: r.quitadas || [], propias: r.propias || [] }; } catch { return null; }
}
async function saveReglas(env: Env, taskId: number, r: Reglas) {
  await env.DB.prepare(`INSERT INTO task_rules (task_id, user_id, rules, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET rules = excluded.rules, updated_at = excluded.updated_at`)
    .bind(taskId, env.UID, JSON.stringify(r), nowSec()).run();
}

/** Lee todas las fuentes de la tarea y arma (o rearma) sus reglas con IA. Conserva las reglas propias y las que quitaste. */
export async function detectReglas(env: Env, taskId: number): Promise<Reglas> {
  const [t] = await listTasks(env, { id: taskId, limit: 1 });
  if (!t) throw new Error('Tarea no encontrada');
  const prev = await loadReglas(env, taskId);
  const task = t as unknown as { title: string; description?: string | null; url?: string | null; attachments?: string | null; course_name?: string | null };
  const fuentes: string[] = [];
  const partes: string[] = [];
  const desc = htmlToText(task.description || '').trim();
  if (desc) { fuentes.push('Consigna del EVA'); partes.push(`CONSIGNA DEL FACILITADOR:\n${desc.slice(0, 5000)}`); }
  const rub = await rubricOf(env, task.url ?? null);
  if (rub) { fuentes.push('Rúbrica del EVA'); partes.push(`RÚBRICA / GUÍA DE CALIFICACIÓN DEL EVA:\n${rub.slice(0, 5000)}`); }
  for (const f of await filesOf(env, task.attachments ?? null)) { fuentes.push(f.name); partes.push(`ARCHIVO «${f.name}»:\n${f.text}`); }
  const base: Reglas = { resumen: '', palabras: null, referencias: null, reglas: [], fuentes, quitadas: prev?.quitadas ?? [], propias: prev?.propias ?? [], at: nowSec() };
  if (!partes.length) { base.resumen = 'El EVA no trae consigna escrita para esta tarea: Rumbo deduce lo que pide el título.'; await saveReglas(env, taskId, base); return base; }
  const raw = await llmComplete(env, [
    { role: 'system', content: `Lees la consigna, la rúbrica y los archivos de un trabajo universitario y extraes TODAS las reglas que el trabajo debe cumplir para sacar la nota completa. Usa SOLO lo que está escrito en las fuentes; no inventes nada. Responde SOLO con JSON:
{"resumen":"una frase de qué pide el trabajo","palabras":{"min":null,"max":null},"referencias":{"min":null,"estilo":null},"reglas":[{"texto":"regla clara y accionable en una línea","tipo":"extension|formato|contenido|referencias|entrega|criterio|otro","puntos":null}]}
- "palabras": la extensión pedida convertida a palabras (1 página ≈ 450 palabras); null si no la piden.
- "referencias": mínimo de fuentes y estilo (por ejemplo APA 7); null si no lo piden.
- Cada criterio de la rúbrica es una regla de tipo "criterio" con sus puntos máximos.
- Une las reglas repetidas, no más de 25, en español.` },
    { role: 'user', content: `Tarea: ${task.title}\nAsignatura: ${task.course_name || ''}\n\n${partes.join('\n\n')}`.slice(0, 16000) },
  ], { maxTokens: 1800, temperature: 0.1 });
  const p = parseReglas(raw, fuentes);
  if (!p) throw new Error('No pude leer las reglas ahora. Inténtalo otra vez.');
  const r: Reglas = { ...p, quitadas: [], propias: prev?.propias ?? [], at: nowSec() };
  await saveReglas(env, taskId, r);
  return r;
}

export async function getReglas(env: Env, taskId: number): Promise<Reglas> {
  return (await loadReglas(env, taskId)) ?? detectReglas(env, taskId);
}

/** Comprueba el trabajo ya hecho contra cada regla (y cuenta las palabras de verdad). */
export async function verifyWork(env: Env, r: Reglas, workText: string, words: number): Promise<Cumple[]> {
  const list = reglasActivas(r);
  if (!list.length) return [];
  let items: { n?: number; ok?: boolean; nota?: string }[] = [];
  try {
    const raw = await llmComplete(env, [
      { role: 'system', content: 'Eres un corrector estricto. Te doy las reglas de un trabajo y el trabajo ya escrito. Para CADA regla (en orden) di si el trabajo la cumple de verdad. Responde SOLO con JSON: {"items":[{"n":1,"ok":true,"nota":"en pocas palabras, por qué"}]}' },
      { role: 'user', content: `REGLAS:\n${list.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nTRABAJO (${words} palabras):\n${workText.slice(0, 11000)}` },
    ], { maxTokens: 1500, temperature: 0 });
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) items = (JSON.parse(m[0]).items || []) as typeof items;
  } catch { /* sin verificación: se muestran las reglas sin marca */ }
  return list.map((texto, i) => {
    const it = items.find((x) => x.n === i + 1);
    return { texto, ok: it ? !!it.ok : true, nota: String(it?.nota || '').slice(0, 140) };
  });
}

export function registerReglas(app: App) {
  app.get('/api/tasks/:id/reglas', async (c) => {
    try { return c.json(await getReglas(c.env, Number(c.req.param('id')))); }
    catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });
  app.post('/api/tasks/:id/reglas/actualizar', async (c) => {
    try { return c.json(await detectReglas(c.env, Number(c.req.param('id')))); }
    catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });
  /** Tus ajustes: reglas propias y reglas detectadas que no quieres. */
  app.put('/api/tasks/:id/reglas', async (c) => {
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{ propias?: string[]; quitadas?: string[] }>().catch(() => ({} as { propias?: string[]; quitadas?: string[] }));
    const r = await getReglas(c.env, id);
    if (Array.isArray(b.propias)) r.propias = b.propias.map((x) => String(x).trim().slice(0, 260)).filter(Boolean).slice(0, 15);
    if (Array.isArray(b.quitadas)) r.quitadas = b.quitadas.filter((x) => r.reglas.some((y) => y.id === x));
    await saveReglas(c.env, id, r);
    return c.json(r);
  });
}

// ---------- Revisión de tu trabajo contra las reglas y la rúbrica ----------
export type Revision = {
  resumen: string;
  nota: number | null; maximo: number | null;
  items: { texto: string; ok: boolean; puntos: number | null; max: number | null; nota: string }[];
  faltan: string[]; mejoras: string[];
  palabras: number; referencias: number;
  at: number;
};

/** Cuántas referencias parece tener el texto (líneas con enlace o con año entre paréntesis, típico de APA). */
export function contarReferencias(text: string): number {
  const i = text.search(/\n\s*(referencias|bibliograf[ií]a|fuentes consultadas)[^\n]{0,40}\n/i);
  const zona = i >= 0 ? text.slice(i) : text;
  return zona.split('\n').filter((l) => /https?:\/\//i.test(l) || /\((19|20)\d{2}[a-z]?\)/.test(l)).length;
}

/** Revisiones que no necesitan IA: extensión y cantidad de referencias. */
export function revisionesFijas(r: Reglas, palabras: number, refs: number): { texto: string; ok: boolean; nota: string }[] {
  const out: { texto: string; ok: boolean; nota: string }[] = [];
  const p = r.palabras;
  if (p && (p.min || p.max)) out.push({ texto: `Extensión pedida: ${p.min ?? ''}${p.min && p.max ? ' a ' : ''}${p.max ?? ''} palabras`, ok: (!p.min || palabras >= p.min * 0.9) && (!p.max || palabras <= p.max * 1.1), nota: `Tu trabajo tiene ${palabras} palabras.` });
  if (r.referencias?.min) out.push({ texto: `Al menos ${r.referencias.min} referencias${r.referencias.estilo ? ` (${r.referencias.estilo})` : ''}`, ok: refs >= r.referencias.min, nota: `Encontré ${refs} referencia${refs === 1 ? '' : 's'}.` });
  return out;
}

export async function reviewWork(env: Env, taskId: number, text: string): Promise<Revision> {
  const r = await getReglas(env, taskId);
  const clean = text.replace(/\r/g, '').trim();
  if (clean.length < 200) throw new Error('El texto es muy corto para revisarlo. Pega o sube el trabajo completo.');
  const palabras = clean.split(/\s+/).filter(Boolean).length;
  const refs = contarReferencias(clean);
  const activas = r.reglas.filter((x) => !r.quitadas.includes(x.id));
  const lista = [...activas.map((x) => ({ texto: x.texto, max: x.puntos })), ...r.propias.map((t) => ({ texto: t, max: null as number | null }))];
  let items: { n?: number; ok?: boolean; puntos?: number; nota?: string }[] = [];
  let resumen = '', faltan: string[] = [], mejoras: string[] = [];
  if (lista.length) {
    const raw = await llmComplete(env, [
      { role: 'system', content: `Eres un profesor universitario que califica con la rúbrica, de forma estricta pero justa. Te doy las reglas/criterios de un trabajo y el trabajo del estudiante. Para CADA regla (en orden) di si se cumple de verdad y, si la regla trae puntos máximos, cuántos puntos merece. Responde SOLO con JSON:
{"resumen":"2 frases de cómo está el trabajo","items":[{"n":1,"ok":true,"puntos":null,"nota":"por qué, en una frase con ejemplo del texto"}],"faltan":["lo concreto que no está y debería"],"mejoras":["cambio concreto y accionable (máx. 6)"]}
No inventes: basa todo en el texto. En "mejoras" di exactamente qué agregar o cambiar.` },
      { role: 'user', content: `REGLAS Y CRITERIOS:\n${lista.map((x, i) => `${i + 1}. ${x.texto}${x.max ? ` (máximo ${x.max} pts)` : ''}`).join('\n')}\n\nTRABAJO DEL ESTUDIANTE (${palabras} palabras):\n${clean.slice(0, 13000)}` },
    ], { maxTokens: 2000, temperature: 0.1 });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No pude revisar el trabajo ahora. Inténtalo otra vez.');
    const j = JSON.parse(m[0]) as { resumen?: string; items?: typeof items; faltan?: unknown[]; mejoras?: unknown[] };
    items = j.items || []; resumen = String(j.resumen || '').slice(0, 300);
    faltan = (j.faltan || []).map((x) => String(x).slice(0, 220)).filter(Boolean).slice(0, 8);
    mejoras = (j.mejoras || []).map((x) => String(x).slice(0, 260)).filter(Boolean).slice(0, 8);
  } else resumen = 'No hay reglas escritas para esta tarea: solo revisé extensión y referencias.';
  const rows = [...revisionesFijas(r, palabras, refs).map((x) => ({ ...x, puntos: null as number | null, max: null as number | null })),
    ...lista.map((x, i) => {
      const it = items.find((y) => y.n === i + 1);
      const max = x.max;
      const pts = max && it?.puntos !== undefined ? Math.max(0, Math.min(max, Number(it.puntos) || 0)) : null;
      return { texto: x.texto, ok: it ? !!it.ok : false, puntos: pts, max, nota: String(it?.nota || '').slice(0, 200) };
    })];
  const conPuntos = rows.filter((x) => x.max);
  const maximo = conPuntos.reduce((a, x) => a + (x.max || 0), 0) || null;
  const nota = maximo ? conPuntos.reduce((a, x) => a + (x.puntos || 0), 0) : null;
  const rev: Revision = { resumen, nota, maximo, items: rows, faltan, mejoras, palabras, referencias: refs, at: nowSec() };
  const row = await env.DB.prepare('SELECT rules FROM task_rules WHERE task_id = ? AND user_id = ?').bind(taskId, env.UID).first<{ rules: string }>();
  const cur = row ? (JSON.parse(row.rules) as Record<string, unknown>) : {};
  await env.DB.prepare('UPDATE task_rules SET rules = ?, updated_at = ? WHERE task_id = ? AND user_id = ?').bind(JSON.stringify({ ...cur, revision: rev }), nowSec(), taskId, env.UID).run();
  return rev;
}

export function registerRevision(app: App) {
  app.get('/api/tasks/:id/revision', async (c) => {
    const row = await c.env.DB.prepare('SELECT rules FROM task_rules WHERE task_id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).first<{ rules: string }>();
    try { return c.json({ revision: (JSON.parse(row?.rules || '{}') as { revision?: Revision }).revision ?? null }); } catch { return c.json({ revision: null }); }
  });
  /** Revisa tu trabajo: texto pegado, archivo Word/PDF (en base64) o el que hizo la IA. */
  app.post('/api/tasks/:id/revision', async (c) => {
    const id = Number(c.req.param('id'));
    const b = await c.req.json<{ text?: string; file?: string; name?: string }>().catch(() => ({} as { text?: string; file?: string; name?: string }));
    try {
      let text = String(b.text || '');
      if (b.file) {
        const bin = Uint8Array.from(atob(b.file), (ch) => ch.charCodeAt(0));
        if (bin.length > 4_000_000) return c.json({ error: 'El archivo pesa más de 4 MB.' }, 400);
        text = /\.docx$/i.test(b.name || '') ? await docxText(bin) : /\.pdf$/i.test(b.name || '') ? await pdfText(bin) : '';
        if (text.length < 200) return c.json({ error: 'No pude leer texto en ese archivo. Usa un Word (.docx), un PDF con texto, o pega el contenido.' }, 400);
      }
      return c.json({ revision: await reviewWork(c.env, id, text) });
    } catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });
}
