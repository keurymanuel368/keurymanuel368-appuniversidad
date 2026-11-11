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
  secciones: { titulo: string; parrafos: string[]; tabla?: { titulo: string; columnas: string[]; filas: string[][] } | null }[];
  conclusion: string; referencias: string[];
};
export type Profile = { nombre: string; matricula: string; carrera: string; facilitador: string; asignatura: string; codigo: string; institucion: string; fecha: string };
export type WorkInfo = { status: 'none' | 'pending' | 'ready' | 'error'; work?: Work; error?: string; profile?: Profile; updated_at?: number };

/** Estilo sacado de los trabajos entregados (Análisis «A la deriva», Razonamiento Lógico, Evolución de la Web…). */
export const DEFAULT_STYLE = `ESTILO DE LOS TRABAJOS (copia este estilo):
- Primera persona del singular ("seleccioné", "me impactó", "me permitió"), español formal pero natural, de estudiante dominicano que se expresa bien. Sin florituras ni relleno.
- Estructura fija: Introducción (UN párrafo: contexto, qué se hizo en el trabajo y qué partes tiene) → Desarrollo (secciones numeradas "1. …", "2. …" que siguen EXACTAMENTE, y en el mismo orden, los puntos de la guía o consigna de la tarea) → Conclusión (UN párrafo en primera persona: qué aprendí y cómo se relaciona con la asignatura) → Referencias.
- Cuando la consigna pide datos comparables (ficha técnica, personajes, estructura, cronología, comparaciones) usa una tabla con título "Tabla N. …".
- Extensión corta y precisa: ve al grano; cada sección 1 o 2 párrafos breves. Nada de trabajos enormes.
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
      tabla: cols.length && filas.length ? { titulo: str(t!.titulo, 140) || 'Tabla', columnas: cols, filas: filas.map((r) => cols.map((_, i) => r[i] ?? '')) } : null,
    };
  }).filter((s) => s.titulo && (s.parrafos.length || s.tabla));
  const w: Work = {
    etiqueta: str(j.etiqueta, 60).toUpperCase() || 'TRABAJO FINAL',
    titulo: str(j.titulo, 80), subtitulo: str(j.subtitulo, 140),
    motivo: (Array.isArray(j.motivo) ? j.motivo : []).map((m) => str(m, 14)).filter(Boolean).slice(0, 16),
    introduccion: str(j.introduccion, 3000), secciones,
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

const SECTION_SPEC = `Responde SOLO con JSON: {"parrafos":["párrafo","párrafo"],"tabla":null}. Si te piden tabla, "tabla" es {"titulo":"Tabla N. …","columnas":["…"],"filas":[["…"]]} (máximo 5 columnas, filas cortas).`;

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
        `${ctx}\n\nEscribe SOLO la sección «${x.titulo}» del trabajo (las otras secciones: ${resumenPlan}).\nDebe cubrir: ${x.puntos.join('; ') || 'lo que pide ese punto de la consigna'}.\nExtensión: unas ${per} palabras${per > 250 ? ', en 2 o 3 párrafos' : ', en 1 o 2 párrafos'}.\n${x.tabla ? `Incluye la tabla titulada «${x.tabla}».` : 'No incluyas tabla (tabla = null).'}`, Math.min(4000, per * 3 + 500)))),
      Promise.all(pl.referencias.map(async (r) => ((await linkAlive(r)) ? r : null))),
    ]);
    const work = normalizeWork({
      etiqueta: pl.etiqueta, titulo: pl.titulo, subtitulo: pl.subtitulo, motivo: pl.motivo,
      introduccion: str(intro.texto, 3000),
      secciones: pl.secciones.map((x, i) => ({ titulo: x.titulo, parrafos: (secs[i] as Record<string, unknown>).parrafos, tabla: (secs[i] as Record<string, unknown>).tabla })),
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
    await env.DB.prepare(`UPDATE ai_works SET status = 'error', error = ?, updated_at = ? WHERE task_id = ? AND user_id = ?`).bind(msg, nowSec(), taskId, env.UID).run();
    await sendToMe(env, blocks('⚠️ *No se pudo hacer el trabajo*', msg), { title: '⚠️ No se pudo hacer el trabajo', tag: `work-${taskId}`, url: `/#tareas/${taskId}`, pushBody: msg.slice(0, 120), type: 'avisos' }).catch(() => {});
  }
}

const WORK_DAILY_LIMIT = 6;

export function registerTrabajo(app: App) {
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
    if (used >= WORK_DAILY_LIMIT) return c.json({ error: `Llegaste al tope de hoy (${WORK_DAILY_LIMIT} trabajos con IA). Mañana puedes seguir.` }, 429);
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
