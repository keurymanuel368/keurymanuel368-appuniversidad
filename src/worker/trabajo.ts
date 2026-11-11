// «Hacer con IA»: genera un borrador de trabajo con el estilo de Manuel (portada, datos, estructura, tono y
// extensión de sus trabajos anteriores) usando los motores gratis de Rumbo, y avisa cuando está listo.
import type { Hono } from 'hono';
import type { Env } from './env';
import { getSetting, getSettings, setSetting } from './db';
import { listTasks } from './data';
import { llmComplete } from './llm';
import { sendToMe } from './notify';
import { blocks } from './wa';
import { nowSec } from './time';

type App = Hono<{ Bindings: Env }>;

export type Work = {
  etiqueta: string; titulo: string; subtitulo: string; motivo: string[];
  introduccion: string;
  secciones: { titulo: string; parrafos: string[]; lista?: string[]; destacado?: string; tabla?: { titulo: string; columnas: string[]; filas: string[][] } | null }[];
  conclusion: string; referencias: string[];
};
export type Profile = { nombre: string; matricula: string; carrera: string; facilitador: string; asignatura: string; codigo: string; institucion: string; fecha: string };
export type WorkInfo = { status: 'none' | 'pending' | 'ready' | 'error'; work?: Work; error?: string; profile?: Profile; updated_at?: number };

/** Estilo sacado de los trabajos entregados (Análisis «A la deriva», Razonamiento Lógico, Evolución de la Web…). */
export const DEFAULT_STYLE = `ESTILO DE LOS TRABAJOS (copia este estilo):
- Primera persona del singular ("seleccioné", "me impactó", "me permitió"), español formal pero natural, de estudiante dominicano que se expresa bien. Sin florituras ni relleno.
- Estructura fija: Introducción (UN párrafo: contexto, qué se hizo en el trabajo y qué partes tiene) → Desarrollo (secciones numeradas "1. …", "2. …" que siguen EXACTAMENTE, y en el mismo orden, los puntos de la guía o consigna de la tarea) → Conclusión (UN párrafo en primera persona: qué aprendí y cómo se relaciona con la asignatura) → Referencias.
- Cuando la consigna pide datos comparables (ficha técnica, personajes, estructura, cronología, comparaciones) usa una tabla con título "Tabla N. …".
- Ve al grano y NO repitas ideas: cada sección aporta algo distinto; no repitas lo dicho en la introducción ni en otras secciones; evita muletillas («es importante destacar», «en conclusión», «cabe mencionar»).
- Da formato para que se lea bonito: **negritas** en 2 a 4 términos clave por sección, listas con viñetas cuando enumeres, tablas cuando compares y una frase destacada cuando haya una idea central.
- Referencias en APA 7. Solo obras reales y muy conocidas, o las que cite la propia consigna. NUNCA inventes autores, citas, páginas ni enlaces. Si no estás seguro, no la pongas. Termina siempre con la línea: Anthropic. (2026). Claude [Modelo de lenguaje grande]. https://claude.ai`;

const DEFAULT_PROFILE = { nombre: 'Keury Manuel Durán García', matricula: '100108669', carrera: 'Ingeniería de Software' };

async function profileFor(env: Env, courseName: string, courseCode: string | null, facilitator: string | null): Promise<Profile> {
  const s = await getSettings(env);
  let saved: Partial<Profile> = {};
  try { saved = JSON.parse(s.work_profile || '{}'); } catch { /* sin perfil guardado */ }
  const base = env.UID === 1 ? DEFAULT_PROFILE : { nombre: s.student_name || '', matricula: '', carrera: '' };
  const d = new Date(Date.now() - 4 * 3600_000);
  const fecha = `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
  return { ...base, institucion: 'UNIVERSIDAD ABIERTA PARA ADULTOS', facilitador: facilitator || '', asignatura: courseName, codigo: courseCode || '', fecha, ...saved } as Profile;
}

function parseJson(raw: string): Record<string, unknown> | null {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
}
const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Títulos que Rumbo ya agrega solo (no pueden ser secciones del desarrollo). */
const META = /^\s*(?:\d+(?:\.\d+)*\.?\s*)?(introducci[oó]n|desarrollo|conclusi[oó]n(?:es)?|referencias?(?:\s+bibliogr[aá]ficas?)?|bibliograf[ií]a|portada|[ií]ndice)\s*[:.]?\s*$/i;

/** Quita secciones duplicadas (Introducción, Desarrollo, Conclusión, Referencias…) y renumera las demás desde 1. */
export function cleanSections<T extends { titulo: string }>(secs: T[]): T[] {
  const kept = secs.filter((s) => !META.test(s.titulo));
  if (!kept.length) return secs;
  const map = new Map<string, number>();
  let n = 0;
  return kept.map((s) => {
    const m = s.titulo.match(/^(\d+)((?:\.\d+)*)\.?\s+(.*)$/);
    if (!m) return s;
    if (!map.has(m[1])) map.set(m[1], ++n);
    return { ...s, titulo: `${map.get(m[1])}${m[2]}${m[2] ? '' : '.'} ${m[3]}` };
  });
}

export function normalizeWork(j: Record<string, unknown> | null): Work | null {
  if (!j) return null;
  const secciones = (Array.isArray(j.secciones) ? j.secciones : []).slice(0, 12).map((x) => {
    const o = (x || {}) as Record<string, unknown>;
    const t = o.tabla as Record<string, unknown> | null | undefined;
    const cols = Array.isArray(t?.columnas) ? (t!.columnas as unknown[]).map((c) => str(c, 60)).filter(Boolean).slice(0, 5) : [];
    const filas = Array.isArray(t?.filas) ? (t!.filas as unknown[]).slice(0, 14).map((r) => (Array.isArray(r) ? r.map((c) => str(c, 300)) : [])).filter((r) => r.length) : [];
    return {
      titulo: str(o.titulo, 140),
      parrafos: (Array.isArray(o.parrafos) ? o.parrafos : typeof o.parrafos === 'string' ? [o.parrafos] : []).map((p) => str(p, 2500)).filter(Boolean).slice(0, 5),
      lista: (Array.isArray(o.lista) ? o.lista : []).map((x) => str(x, 320)).filter(Boolean).slice(0, 8),
      destacado: str(o.destacado, 320) || undefined,
      tabla: cols.length && filas.length ? { titulo: str(t!.titulo, 140) || 'Tabla', columnas: cols, filas: filas.map((r) => cols.map((_, i) => r[i] ?? '')) } : null,
    };
  }).filter((s) => s.titulo && (s.parrafos.length || s.tabla || s.lista.length));
  const limpias = cleanSections(secciones);
  const w: Work = {
    etiqueta: str(j.etiqueta, 60).toUpperCase() || 'TRABAJO FINAL',
    titulo: str(j.titulo, 80), subtitulo: str(j.subtitulo, 140),
    motivo: (Array.isArray(j.motivo) ? j.motivo : []).map((m) => str(m, 14)).filter(Boolean).slice(0, 16),
    introduccion: str(j.introduccion, 3000), secciones: limpias,
    conclusion: str(j.conclusion, 3000),
    referencias: (Array.isArray(j.referencias) ? j.referencias : []).map((r) => str(r, 400)).filter(Boolean).slice(0, 10),
  };
  return w.titulo && w.introduccion && w.secciones.length && w.conclusion ? w : null;
}

export type Largo = 'corto' | 'medio' | 'largo' | 'muy_largo';
/** Palabras aproximadas de todo el trabajo según la extensión elegida. */
export const LARGOS: Record<Largo, number> = { corto: 600, medio: 1300, largo: 2400, muy_largo: 3800 };

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');

type Plan = { etiqueta: string; titulo: string; subtitulo: string; motivo: string[]; secciones: { titulo: string; puntos: string[]; tabla: string | null }[]; referencias: string[] };

async function ask(env: Env, system: string, user: string, maxTokens: number): Promise<Record<string, unknown>> {
  for (let i = 0; i < 2; i++) {
    const raw = await llmComplete(env, [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, temperature: 0.5 });
    const j = parseJson(raw);
    if (j) return j;
  }
  throw new Error('La IA no devolvió un resultado válido. Inténtalo otra vez.');
}

/** Comprueba que el enlace de una referencia exista de verdad; las que no abren se descartan (la IA puede inventar enlaces). */
async function linkAlive(ref: string): Promise<boolean> {
  const m = ref.match(/https?:\/\/[^\s)>\]]+/);
  if (!m) return false;
  const url = m[0].replace(/[.,;]+$/, '');
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Rumbo/1.0)' } });
    clearTimeout(t);
    return r.status < 400;
  } catch { return false; }
}

const SECTION_SPEC = `Responde SOLO con JSON: {"parrafos":["párrafo con **términos clave** en negrita"],"lista":["viñeta corta"],"destacado":"una frase clave de la sección","tabla":null}. "lista" y "destacado" son opcionales: úsalos solo si aportan (lista de 3 a 6 viñetas cuando enumeres; destacado = 1 frase de la idea central; si no, [] y null). Si te piden tabla, "tabla" es {"titulo":"Tabla N. …","columnas":["…"],"filas":[["…"]]} (máximo 5 columnas, filas cortas).`;

/** Genera el trabajo en dos etapas (plan → secciones en paralelo) y lo guarda; avisa al terminar. Corre en segundo plano. */
export async function generateWork(env: Env, taskId: number, largo: Largo = 'medio'): Promise<void> {
  try {
    const [t] = await listTasks(env, { id: taskId, limit: 1 });
    if (!t) throw new Error('Tarea no encontrada');
    const s = await getSettings(env);
    const style = (s.ai_style || '').trim() || DEFAULT_STYLE;
    const total = LARGOS[largo] || LARGOS.medio;
    const asignatura = decode(t.course_name || 'Asignatura');
    const titulo = decode(t.title);
    const desc = decode((t as { description?: string | null }).description || '').slice(0, 5000);
    const crs = t.course_id ? await env.DB.prepare('SELECT code FROM courses WHERE id = ? AND user_id = ?').bind(t.course_id, env.UID).first<{ code: string | null }>() : null;
    const profile = await profileFor(env, asignatura, crs?.code ?? null, t.facilitator);
    const sys = `Eres Keury Manuel, estudiante universitario de Ingeniería de Software en la UAPA, y escribes tus trabajos académicos.\n${style}\nNombre EXACTO de la asignatura: «${asignatura}». Cuando la menciones, escríbela exactamente así (no la abrevies ni la cambies).`;
    const ctx = `Asignatura: ${asignatura}\nTarea: ${titulo}\n${desc ? `Consigna / guía del facilitador (síguela punto por punto):\n${desc}` : 'No hay consigna escrita: deduce lo que pide el título.'}`;
    const profundidad = largo === 'corto' ? 'Lo mínimo que pide la consigna, una sección por punto.' : largo === 'medio' ? 'Una sección por cada punto de la consigna.' : 'Una sección por cada punto de la consigna; si algún punto es amplio, divídelo en subsecciones (por ejemplo 2.1 y 2.2).';

    // Etapa 1: plan (portada, secciones y referencias con enlace).
    const plan = await ask(env, `${sys}\n\nPrimero PLANIFICA el trabajo. Responde SOLO con JSON:
{"etiqueta":"TIPO DE TRABAJO · TEMA en mayúsculas, máx 4 palabras","titulo":"título corto de portada (2 a 5 palabras)","subtitulo":"una línea que describe el trabajo","motivo":["12 símbolos o palabras muy cortas del tema para decorar la portada"],
"secciones":[{"titulo":"1. Nombre","puntos":["qué debe cubrir esta sección"],"tabla":null}],
"referencias":["Autor. (año). *Título*. Editorial/Sitio. https://enlace-real"]}
IMPORTANTE: las secciones son SOLO el contenido del Desarrollo, numeradas desde 1. NO crees secciones llamadas Introducción, Desarrollo, Conclusión, Referencias ni Bibliografía: esas partes se agregan solas aparte. Aunque la consigna las mencione, no las pongas como sección.
${profundidad} "tabla" es null o el título de una tabla útil (ficha, comparación, cronología) cuando la consigna lo pida.
Referencias: 3 a 6 en APA 7, CADA UNA con su enlace https. Usa solo fuentes reales y conocidas de sitios oficiales o institucionales (ONU, UNESCO, universidades, organismos, bibliotecas), con la dirección de la página que sabes que existe. Si no estás seguro de un enlace, no pongas esa referencia. Los títulos de obras van entre asteriscos *así*.`, ctx, 2200);
    const pl: Plan = {
      etiqueta: str(plan.etiqueta, 60).toUpperCase() || 'TRABAJO FINAL', titulo: str(plan.titulo, 80) || titulo.slice(0, 40), subtitulo: str(plan.subtitulo, 140),
      motivo: (Array.isArray(plan.motivo) ? plan.motivo : []).map((m) => str(m, 14)).filter(Boolean).slice(0, 16),
      secciones: (Array.isArray(plan.secciones) ? plan.secciones : []).slice(0, 12).map((x) => {
        const o = (x || {}) as Record<string, unknown>;
        return { titulo: str(o.titulo, 140), puntos: (Array.isArray(o.puntos) ? o.puntos : []).map((p) => str(p, 300)).filter(Boolean).slice(0, 6), tabla: typeof o.tabla === 'string' && o.tabla.trim() ? o.tabla.trim().slice(0, 140) : null };
      }).filter((x) => x.titulo),
      referencias: (Array.isArray(plan.referencias) ? plan.referencias : []).map((r) => str(r, 400)).filter(Boolean).slice(0, 8),
    };
    if (!pl.secciones.length) throw new Error('La IA no pudo planear las secciones. Inténtalo otra vez.');

    // Etapa 2 (en paralelo): introducción, cada sección, conclusión y verificación de enlaces.
    const bodyWords = Math.round(total * 0.84);
    const per = Math.max(60, Math.round(bodyWords / pl.secciones.length));
    const resumenPlan = pl.secciones.map((x) => x.titulo).join('; ');
    const [intro, concl, secs, refsOk] = await Promise.all([
      ask(env, `${sys}\n\nResponde SOLO con JSON: {"texto":"..."}`, `${ctx}\n\nEscribe la INTRODUCCIÓN: UN párrafo de unas ${Math.round(total * 0.08)} palabras (contexto, qué hice en el trabajo y qué partes tiene: ${resumenPlan}).`, 1200),
      ask(env, `${sys}\n\nResponde SOLO con JSON: {"texto":"..."}`, `${ctx}\n\nEscribe la CONCLUSIÓN: UN párrafo de unas ${Math.round(total * 0.08)} palabras en primera persona (qué aprendí y cómo se relaciona con ${asignatura}). El trabajo trató: ${resumenPlan}.`, 1200),
      Promise.all(pl.secciones.map((x) => ask(env, `${sys}\n\n${SECTION_SPEC}`,
        `${ctx}\n\nEscribe SOLO la sección «${x.titulo}» del trabajo (las otras secciones, que NO debes repetir ni resumir: ${resumenPlan}).\nEsta sección NO es la introducción ni la conclusión: no escribas títulos ni encabezados dentro del texto, ni una conclusión, ni referencias. No repitas la introducción ni uses frases de relleno. Dale formato: **negritas** en términos clave, viñetas si enumeras y una frase destacada si hay una idea central.\nDebe cubrir: ${x.puntos.join('; ') || 'lo que pide ese punto de la consigna'}.\nExtensión: unas ${per} palabras${per > 250 ? ', en 2 o 3 párrafos' : ', en 1 o 2 párrafos'}.\n${x.tabla ? `Incluye la tabla titulada «${x.tabla}».` : 'No incluyas tabla (tabla = null).'}`, Math.min(4000, per * 3 + 500)))),
      Promise.all(pl.referencias.map(async (r) => ((await linkAlive(r)) ? r : null))),
    ]);
    const work = normalizeWork({
      etiqueta: pl.etiqueta, titulo: pl.titulo, subtitulo: pl.subtitulo, motivo: pl.motivo,
      introduccion: str(intro.texto, 3000),
      secciones: pl.secciones.map((x, i) => ({ titulo: x.titulo, parrafos: (secs[i] as Record<string, unknown>).parrafos, lista: (secs[i] as Record<string, unknown>).lista, destacado: (secs[i] as Record<string, unknown>).destacado, tabla: (secs[i] as Record<string, unknown>).tabla })),
      conclusion: str(concl.texto, 3000),
      referencias: [...(refsOk.filter(Boolean) as string[]), 'Anthropic. (2026). *Claude* [Modelo de lenguaje grande]. https://claude.ai'],
    });
    if (!work) throw new Error('La IA no devolvió un trabajo completo. Inténtalo otra vez.');
    await env.DB.prepare(`UPDATE ai_works SET status = 'ready', content = ?, error = NULL, updated_at = ? WHERE task_id = ? AND user_id = ?`)
      .bind(JSON.stringify({ work, profile }), nowSec(), taskId, env.UID).run();
    await sendToMe(env, blocks('📝 *Tu trabajo está listo*', `*${titulo}*`, 'Revísalo, ajústalo y descárgalo en Word desde la tarea.'),
      { title: '📝 Tu trabajo está listo', tag: `work-${taskId}`, url: `/#tareas/${taskId}`, pushBody: titulo.slice(0, 120), type: 'avisos' });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    // Un intento que falla no gasta el cupo del día.
    try { const n = Number(await getSetting(env, 'work_count', '0')); if (n > 0) await setSetting(env, 'work_count', String(n - 1)); } catch { /* sin contador */ }
    await env.DB.prepare(`UPDATE ai_works SET status = 'error', error = ?, updated_at = ? WHERE task_id = ? AND user_id = ?`).bind(msg, nowSec(), taskId, env.UID).run();
    await sendToMe(env, blocks('⚠️ *No se pudo hacer el trabajo*', msg), { title: '⚠️ No se pudo hacer el trabajo', tag: `work-${taskId}`, url: `/#tareas/${taskId}`, pushBody: msg.slice(0, 120), type: 'avisos' }).catch(() => {});
  }
}

/** Tope diario: el dueño de Rumbo tiene más margen; los compañeros comparten los motores gratis. */
const workLimit = (env: Env) => (env.ROLE === 'admin' ? 25 : 6);

export function registerTrabajo(app: App) {
  /** Todos los trabajos hechos con IA (sin el contenido completo), del más reciente al más viejo. */
  app.get('/api/works', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT w.task_id, w.status, w.updated_at, w.content, t.title AS task_title, t.status AS task_status, co.name AS course_name, co.color AS course_color
      FROM ai_works w JOIN tasks t ON t.id = w.task_id AND t.user_id = w.user_id LEFT JOIN courses co ON co.id = t.course_id
      WHERE w.user_id = ? ORDER BY w.updated_at DESC LIMIT 100`).bind(c.env.UID).all<{ task_id: number; status: string; updated_at: number; content: string | null; task_title: string; task_status: string; course_name: string | null; course_color: string | null }>();
    return c.json(results.map((r) => {
      let titulo = '', etiqueta = '', palabras = 0;
      try {
        const w = (JSON.parse(r.content || 'null') as { work?: Work } | null)?.work;
        if (w) {
          titulo = w.titulo; etiqueta = w.etiqueta;
          palabras = [w.introduccion, w.conclusion, ...w.secciones.flatMap((s) => s.parrafos)].join(' ').split(/\s+/).filter(Boolean).length;
        }
      } catch { /* contenido dañado: se muestra sin título */ }
      return { task_id: r.task_id, status: r.status, updated_at: r.updated_at, task_title: decode(r.task_title), task_status: r.task_status, course_name: r.course_name ? decode(r.course_name) : null, course_color: r.course_color, titulo, etiqueta, palabras };
    }));
  });

  app.get('/api/tasks/:id/work', async (c) => {
    const id = Number(c.req.param('id'));
    const row = await c.env.DB.prepare('SELECT status, content, error, updated_at FROM ai_works WHERE task_id = ? AND user_id = ?').bind(id, c.env.UID).first<{ status: string; content: string | null; error: string | null; updated_at: number }>();
    if (!row) return c.json({ status: 'none' } satisfies WorkInfo);
    // Si lleva más de 4 minutos «pendiente», el proceso murió: se marca como error para poder reintentar.
    if (row.status === 'pending' && nowSec() - row.updated_at > 240) {
      await c.env.DB.prepare(`UPDATE ai_works SET status = 'error', error = 'Tardó demasiado. Inténtalo otra vez.' WHERE task_id = ? AND user_id = ?`).bind(id, c.env.UID).run();
      return c.json({ status: 'error', error: 'Tardó demasiado. Inténtalo otra vez.' } satisfies WorkInfo);
    }
    const parsed = row.content ? (JSON.parse(row.content) as { work: Work; profile: Profile }) : null;
    if (parsed?.work) parsed.work.secciones = cleanSections(parsed.work.secciones);
    return c.json({ status: row.status, work: parsed?.work, profile: parsed?.profile, error: row.error || undefined, updated_at: row.updated_at } as WorkInfo);
  });

  app.post('/api/tasks/:id/work', async (c) => {
    const id = Number(c.req.param('id'));
    const [t] = await listTasks(c.env, { id, limit: 1 });
    if (!t) return c.json({ error: 'Tarea no encontrada' }, 404);
    const cur = await c.env.DB.prepare('SELECT status, updated_at FROM ai_works WHERE task_id = ? AND user_id = ?').bind(id, c.env.UID).first<{ status: string; updated_at: number }>();
    if (cur?.status === 'pending' && nowSec() - cur.updated_at < 240) return c.json({ status: 'pending' });
    // Tope diario para no gastar los motores gratis compartidos.
    const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
    const used = (await getSetting(c.env, 'work_day', '')) === today ? Number(await getSetting(c.env, 'work_count', '0')) : 0;
    if (used >= workLimit(c.env)) return c.json({ error: `Llegaste al tope de hoy (${workLimit(c.env)} trabajos con IA). Se reinicia a las 12 a. m.` }, 429);
    await setSetting(c.env, 'work_day', today);
    await setSetting(c.env, 'work_count', String(used + 1));
    const now = nowSec();
    await c.env.DB.prepare(`INSERT INTO ai_works (task_id, user_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET status = 'pending', error = NULL, updated_at = excluded.updated_at`).bind(id, c.env.UID, now, now).run();
    const body = (await c.req.json().catch(() => ({}))) as { length?: string };
    const largo = (body.length && body.length in LARGOS ? body.length : 'medio') as Largo;
    c.executionCtx.waitUntil(generateWork(c.env, id, largo));
    return c.json({ status: 'pending' });
  });
}
