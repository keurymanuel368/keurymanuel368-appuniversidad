// Sincronización con el EVA de la UAPA (Moodle) usando los servicios web de la app móvil.
// Solo lee TUS datos con TU token personal.
import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { nowSec } from './time';
import { notifyGrades } from './grades';
import { scanForum, type ForumInfo } from './forums';

const COLORS = ['#1F5FE0', '#12A5C9', '#7A5AF0', '#F08A1C', '#0F9F6E', '#D6457A', '#8A6D3B', '#3E4C6B'];

type MoodleCourse = { id: number; shortname: string; fullname: string; displayname?: string; startdate?: number; enddate?: number; visible?: number };
type MoodleEvent = { id: number; name: string; activityname?: string; timesort: number; url?: string; course?: { id: number; fullname: string }; modulename?: string; instance?: number };
type GradeItem = { id: number; itemname: string | null; itemtype: string; itemmodule?: string | null; iteminstance?: number | null; graderaw: number | null; grademax: number; gradedatesubmitted?: number | null; feedback?: string | null };
/** Una actividad evaluable del curso (tarea, cuestionario o foro). */
type Activity = { key: string; module: string; cmid: number; name: string; due: number | null; moodleCourse: number; intro?: string };

function flatten(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/** Durante una sincronización: cuenta las llamadas al EVA y reutiliza las que se repiten (la lista de foros). */
type WsState = { calls: number; memo: Map<string, Promise<unknown>> };
const wsState = new WeakMap<Env, WsState>();
const MEMO = new Set(['mod_forum_get_forums_by_courses']);

export async function moodleCall<T>(env: Env, fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const st = wsState.get(env);
  if (st && MEMO.has(fn)) {
    const k = fn + JSON.stringify(params);
    if (!st.memo.has(k)) st.memo.set(k, moodleCallRaw(env, fn, params));
    return st.memo.get(k) as Promise<T>;
  }
  return moodleCallRaw<T>(env, fn, params);
}

async function moodleCallRaw<T>(env: Env, fn: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!env.MOODLE_TOKEN) throw new Error('Tu EVA no está conectado. Conéctalo en Ajustes → Conexiones.');
  const st = wsState.get(env);
  if (st) st.calls++;
  const body = flatten({ wstoken: env.MOODLE_TOKEN, wsfunction: fn, moodlewsrestformat: 'json', ...params });
  const res = await fetch(`${env.MOODLE_URL.replace(/\/$/, '')}/webservice/rest/server.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!res.ok) throw new Error(`EVA respondió ${res.status}`);
  const data = (await res.json()) as T & { exception?: string; message?: string; errorcode?: string };
  if (data && typeof data === 'object' && 'exception' in data && data.exception) throw new Error(`EVA: ${data.message || data.errorcode}`);
  return data;
}

/** Arregla acentos rotos que a veces manda el EVA («Tecnolog\uFFFD\u00ADa» → «Tecnología»). */
export function fixText(s: string): string {
  return s.replace(/\uFFFD([\u0080-\u00BF])/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) + 0x40)).replace(/\uFFFD/g, '');
}

function extractCode(c: MoodleCourse): string | null {
  const m = `${c.shortname} ${c.fullname}`.match(/\b([A-Z]{3})[-\s]?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export type SyncResult = {
  courses: number; pastCourses: number; tasksNew: number; tasksUpdated: number; tasksClosed: number; facilitators: number; activities: number; delivered: number; forumGrades: number;
  newGrades: { course: string; courseId: number; item: string; grade: number; max: number; prev: number | null; feedback: string; key: string | null; itemId: number }[]; newNews: NewsItem[]; warnings: string[];
};

/** Facilitadores de cada curso: primero los "contactos" del curso; si no hay, los docentes inscritos. */
async function syncFacilitators(env: Env, moodleIds: number[], result: SyncResult): Promise<void> {
  if (!moodleIds.length) return;
  type Contact = { fullname: string };
  const r = await moodleCall<{ courses?: { id: number; contacts?: Contact[] }[] }>(env, 'core_course_get_courses_by_field', { field: 'ids', value: moodleIds.join(',') });
  for (const c of r.courses || []) {
    let names = (c.contacts || []).map((x) => x.fullname).filter(Boolean);
    if (!names.length) {
      try {
        type Member = { fullname: string; roles?: { shortname: string }[] };
        const users = await moodleCall<Member[]>(env, 'core_enrol_get_enrolled_users', { courseid: c.id, options: [{ name: 'limitnumber', value: 300 }] });
        names = users.filter((u) => u.roles?.some((ro) => /teacher|facilitador|tutor/i.test(ro.shortname))).map((u) => u.fullname);
      } catch { /* algunos EVA no dejan ver la lista de participantes */ }
    }
    if (!names.length) continue;
    await env.DB.prepare('UPDATE courses SET facilitator_eva = ? WHERE user_id = ? AND moodle_id = ?').bind([...new Set(names)].join(', '), env.UID, c.id).run();
    result.facilitators++;
  }
}

/** Todas las actividades evaluables con fecha (tareas, cuestionarios y foros calificables). */
async function fetchActivities(env: Env, courseIds: number[], result: SyncResult): Promise<Activity[]> {
  const acts: Activity[] = [];
  if (!courseIds.length) return acts;
  try {
    const r = await moodleCall<{ courses?: { id: number; assignments?: { id: number; cmid: number; name: string; duedate: number; intro?: string }[] }[] }>(env, 'mod_assign_get_assignments', { courseids: courseIds });
    for (const c of r.courses || []) for (const a of c.assignments || []) acts.push({ key: `assign:${a.id}`, module: 'assign', cmid: a.cmid, name: a.name, due: a.duedate || null, moodleCourse: c.id, intro: a.intro });
  } catch (e) { result.warnings.push('Tareas: ' + (e as Error).message); }
  try {
    const r = await moodleCall<{ quizzes?: { id: number; coursemodule: number; course: number; name: string; timeclose: number; intro?: string }[] }>(env, 'mod_quiz_get_quizzes_by_courses', { courseids: courseIds });
    for (const q of r.quizzes || []) acts.push({ key: `quiz:${q.id}`, module: 'quiz', cmid: q.coursemodule, name: q.name, due: q.timeclose || null, moodleCourse: q.course, intro: q.intro });
  } catch (e) { result.warnings.push('Cuestionarios: ' + (e as Error).message); }
  try {
    const r = await moodleCall<ForumInfo[]>(env, 'mod_forum_get_forums_by_courses', { courseids: courseIds });
    for (const f of r || []) {
      if (f.type === 'news') continue; // foro de avisos
      const graded = (f.assessed ?? 0) > 0 || (f.grade_forum ?? 0) > 0;
      if (!graded && !f.duedate) continue; // foros de conversación general
      acts.push({ key: `forum:${f.id}`, module: 'forum', cmid: f.cmid, name: f.name, due: f.duedate || f.cutoffdate || null, moodleCourse: f.course, intro: f.intro });
    }
  } catch (e) { result.warnings.push('Foros: ' + (e as Error).message); }
  return acts;
}

/** HTML de Moodle → texto plano legible. */
export function htmlToText(html: string | null | undefined): string {
  return cleanNewsText((html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''));
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", raquo: '»', laquo: '«', ndash: '–', mdash: '—', hellip: '…', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿' };

/** Limpia el texto de los avisos del EVA: entidades HTML, migas de pan ("Curso » Foros »") y pies de página. */
export function cleanNewsText(text: string): string {
  const cleaned = cleanLines(text);
  // Mensajes de foro del EVA: lo de antes de "de <autor> - <fecha>" son migas de pan (curso » Foros » foro).
  const lines = cleaned.split('\n');
  const start = lines.findIndex((l, i) => i < 12 && /^de .+ - .+\d{4}(, \d{1,2}:\d{2})?$/i.test(l));
  return start > 0 ? lines.slice(start).join('\n').trim() : cleaned;
}

function cleanLines(text: string): string {
  return text
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m)
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => !/^(»|›|\.{3,}|mostrar mensaje anterior|ver este mensaje en contexto|responder|cambiar sus preferencias de notificaci.*|cancelar la suscripci.*|darse de baja.*)$/i.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Clasifica un aviso para poder resaltarlo (pagos y eventos primero). */
export function classifyNews(text: string): 'pago' | 'evento' | 'nota' | 'aviso' {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(pago|pagar|cuota|matricula|inscripcion|reinscripcion|factura|saldo|deuda|financ|beca|descuento|mora)\w*/.test(t)) return 'pago';
  if (/\b(evento|webinar|conferencia|taller|charla|congreso|seminario|graduacion|feria|encuentro|convocatoria|jornada|simposio|actividad extracurricular|tutoria presencial)\w*/.test(t)) return 'evento';
  if (/\b(calificacion|calificado|nota final|evaluacion|retroalimentacion)\w*/.test(t)) return 'nota';
  return 'aviso';
}

export type NewsItem = { id: number; title: string; body: string; kind: string; course: string | null; source: string };

/** Avisos del EVA: foro de avisos de cada asignatura actual + notificaciones del sistema. */
async function syncNews(env: Env, userid: number, courseMap: Map<number, { id: number; name: string; current: boolean }>, result: SyncResult): Promise<void> {
  const first = !(await env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE user_id = ? AND source IN ('avisos', 'eva') LIMIT 1`).bind(env.UID).first());
  const base = env.MOODLE_URL.replace(/\/$/, '');
  const save = async (source: string, extId: string, courseId: number | null, courseName: string | null, title: string, body: string, author: string | null, url: string | null, created: number) => {
    const kind = classifyNews(`${title} ${body}`);
    const row = await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, course_id, title, body, author, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(env.UID, source, extId, courseId, title.slice(0, 300), body.slice(0, 6000), author, url, kind, created).first<{ id: number }>();
    if (row && !first) result.newNews.push({ id: row.id, title, body, kind, course: courseName, source });
  };

  // 1) Foro de avisos ("Avisos"/"Novedades") de cada asignatura actual
  const currentIds = [...courseMap].filter(([, c]) => c.current).map(([m]) => m);
  if (currentIds.length) {
    try {
      type Forum = { id: number; course: number; type: string };
      const forums = (await moodleCall<Forum[]>(env, 'mod_forum_get_forums_by_courses', { courseids: currentIds })).filter((f) => f.type === 'news');
      for (const f of forums) {
        const course = courseMap.get(f.course);
        type Disc = { discussion?: number; id: number; name?: string; subject?: string; message?: string; created?: number; timemodified?: number; userfullname?: string };
        let discs: Disc[] = [];
        try {
          discs = (await moodleCall<{ discussions: Disc[] }>(env, 'mod_forum_get_forum_discussions', { forumid: f.id, sortorder: -1, page: 0, perpage: 10 })).discussions || [];
        } catch {
          // Algunos foros de avisos están ocultos para estudiantes: se salta ese y se sigue con los demás.
          try {
            discs = (await moodleCall<{ discussions: Disc[] }>(env, 'mod_forum_get_forum_discussions_paginated', { forumid: f.id, sortby: 'timemodified', sortdirection: 'DESC', page: 0, perpage: 10 })).discussions || [];
          } catch { continue; }
        }
        for (const d of discs) {
          const did = d.discussion ?? d.id;
          await save('avisos', String(did), course?.id ?? null, course?.name ?? null, d.name || d.subject || 'Aviso', htmlToText(d.message), d.userfullname || null,
            `${base}/mod/forum/discuss.php?d=${did}`, d.created || d.timemodified || nowSec());
        }
      }
    } catch (e) { result.warnings.push('Avisos: ' + (e as Error).message); }
  }

  // 2) Notificaciones del EVA (mensajes del sistema, eventos, recordatorios de la universidad)
  try {
    type Notif = { id: number; subject?: string; smallmessage?: string; fullmessagehtml?: string; fullmessage?: string; contexturl?: string; timecreated: number; component?: string; userfromfullname?: string };
    const r = await moodleCall<{ notifications: Notif[] }>(env, 'message_popup_get_popup_notifications', { useridto: userid, newestfirst: 1, limit: 25, offset: 0 });
    for (const n of r.notifications || []) {
      // Las de calificaciones y entregas ya las cubre Rumbo; se guardan igual para el historial.
      const body = htmlToText(n.fullmessagehtml) || n.fullmessage || n.smallmessage || '';
      await save('eva', String(n.id), null, null, n.subject || n.smallmessage || 'Notificación del EVA', body, n.userfromfullname || null, n.contexturl || null, n.timecreated);
    }
  } catch (e) { result.warnings.push('Notificaciones: ' + (e as Error).message); }
}

/** Marca el pensum según tus asignaturas del EVA (nunca baja una "aprobada"). */
async function syncPensumFromCourses(env: Env): Promise<void> {
  const { results: pensum } = await env.DB.prepare('SELECT id, code, name, status FROM pensum WHERE user_id = ?').bind(env.UID).all<{ id: number; code: string | null; name: string; status: string }>();
  if (!pensum.length) return;
  const { results: courses } = await env.DB.prepare(`SELECT c.code, c.name, c.active,
      (SELECT AVG(g.grade * 100.0 / g.grade_max) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL AND g.grade_max > 0) AS avg,
      (SELECT COUNT(*) FROM grades g WHERE g.course_id = c.id AND g.grade IS NULL) AS missing
    FROM courses c WHERE c.user_id = ? AND c.moodle_id IS NOT NULL`).bind(env.UID).all<{ code: string | null; name: string; active: number; avg: number | null; missing: number }>();
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.length > 6 && y.length > 6 && (x.includes(y) || y.includes(x)); };
  for (const c of courses) {
    const p = pensum.find((r) => (c.code && r.code === c.code) || same(r.name, c.name));
    if (!p || p.status === 'aprobada') continue;
    if (c.active && p.status === 'pendiente') {
      await env.DB.prepare(`UPDATE pensum SET status = 'en_curso' WHERE id = ?`).bind(p.id).run();
    } else if (!c.active && c.avg !== null && c.avg >= 70 && c.missing === 0) {
      await env.DB.prepare(`UPDATE pensum SET status = 'aprobada', grade = ? WHERE id = ?`).bind(Math.round(c.avg * 10) / 10, p.id).run();
    }
  }
}

/**
 * Abre los foros calificables que todavía no tienen nota en el libro de calificaciones y busca
 * la nota directamente en el foro. Se revisan pocos por vez (límite de llamadas de Cloudflare gratis).
 */
async function syncForumGrades(env: Env, me: number, courseMap: Map<number, { id: number; name: string; current: boolean }>, delivered: Set<string>, result: SyncResult): Promise<void> {
  const currentIds = [...courseMap].filter(([, c]) => c.current).map(([m]) => m);
  if (!currentIds.length) return;
  const forums = (await moodleCall<ForumInfo[]>(env, 'mod_forum_get_forums_by_courses', { courseids: currentIds }))
    .filter((f) => f.type !== 'news' && ((f.assessed ?? 0) > 0 || (f.grade_forum ?? 0) > 0));
  if (!forums.length) return;
  const { results: rows } = await env.DB.prepare(`SELECT id, course_id, moodle_key, item_name, grade, grade_max, source FROM grades WHERE user_id = ? AND moodle_key LIKE 'forum:%'`)
    .bind(env.UID).all<{ id: number; course_id: number; moodle_key: string; item_name: string; grade: number | null; grade_max: number; source: string | null }>();
  const scanned = JSON.parse(await getSetting(env, 'forum_scan', '{}')) as Record<string, number>;
  const { results: facRows } = await env.DB.prepare(`SELECT moodle_id, COALESCE(NULLIF(facilitator, ''), facilitator_eva) AS f FROM courses WHERE user_id = ?`).bind(env.UID).all<{ moodle_id: number; f: string | null }>();
  const now = nowSec();
  // Los que el libro de calificaciones ya trae con nota no hace falta abrirlos.
  const todo = forums.filter((f) => !rows.some((r) => r.moodle_key === `forum:${f.id}` && r.grade !== null && r.source !== 'foro'))
    // Los que no han vencido se revisan una vez al día (para saber si ya participaste).
    .filter((f) => { const due = f.duedate || f.cutoffdate || 0; return !due || due < now || now - (scanned[f.id] ?? 0) > 86400; })
    .sort((a, b) => (scanned[a.id] ?? 0) - (scanned[b.id] ?? 0));
  let budget = Math.max(0, Math.min(16, 44 - (wsState.get(env)?.calls ?? 0)));
  const log: string[] = [];
  for (const f of todo) {
    if (budget < 2) break;
    const key = `forum:${f.id}`;
    const course = courseMap.get(f.course);
    if (!course) continue;
    const own = rows.filter((r) => r.moodle_key === key).sort((a, b) => Number(/calificaci/i.test(b.item_name)) - Number(/calificaci/i.test(a.item_name)) || a.id - b.id);
    const gradeMax = own[0]?.grade_max || 100;
    const facs = (facRows.find((r) => r.moodle_id === f.course)?.f || '').split(',');
    let out;
    try { out = await scanForum(env, f, me, gradeMax, facs, budget); }
    catch (e) { log.push(`${f.id}:error ${(e as Error).message.slice(0, 60)}`); budget -= 1; scanned[f.id] = now; continue; }
    budget -= out.calls;
    scanned[f.id] = now;
    const fd = out.finding;
    log.push(`${f.id}:${fd.participated ? 'participó' : 'sin mensajes'}${fd.grade !== null ? ` nota ${fd.grade}/${fd.max} (${fd.how})` : ''} ${fd.debug.slice(0, 900)}`);
    if (fd.participated) delivered.add(key);
    if (fd.grade === null || !fd.max) continue;
    const target = own[0];
    const grade = Math.round((fd.grade / fd.max) * gradeMax * 100) / 100;
    const feedback = fd.feedback || null;
    let itemId: number;
    if (target) {
      if (target.grade === grade && target.source === 'foro') continue;
      await env.DB.prepare(`UPDATE grades SET grade = ?, source = 'foro', feedback = COALESCE(?, feedback), updated_at = ? WHERE id = ?`).bind(grade, feedback, now, target.id).run();
      itemId = target.id;
    } else {
      // El foro ni siquiera aparece en el libro de calificaciones: se crea su renglón.
      const prev = await env.DB.prepare('SELECT grade FROM grades WHERE course_id = ? AND moodle_item_id = ?').bind(course.id, -f.id).first<{ grade: number | null }>();
      if (prev?.grade === grade) continue;
      await env.DB.prepare(`INSERT INTO grades (user_id, course_id, moodle_item_id, item_name, grade, grade_max, moodle_key, feedback, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'foro', ?)
        ON CONFLICT(course_id, moodle_item_id) DO UPDATE SET grade = excluded.grade, feedback = excluded.feedback, source = 'foro', updated_at = excluded.updated_at`)
        .bind(env.UID, course.id, -f.id, fixText(f.name), grade, gradeMax, key, feedback, now).run();
      itemId = -f.id;
    }
    result.forumGrades++;
    result.newGrades.push({ course: course.name, courseId: course.id, item: fixText(f.name), grade, max: gradeMax, prev: target?.grade ?? null, feedback: fd.feedback, key, itemId });
  }
  await setSetting(env, 'forum_scan', JSON.stringify(scanned));
  await setSetting(env, 'forum_scan_log', `${new Date(now * 1000).toISOString()} ${log.join(' | ') || 'nada que revisar'}`);
}

export async function syncEva(env: Env): Promise<SyncResult> {
  const result: SyncResult = { forumGrades: 0, courses: 0, pastCourses: 0, delivered: 0, tasksNew: 0, tasksUpdated: 0, tasksClosed: 0, facilitators: 0, activities: 0, newGrades: [], newNews: [], warnings: [] };
  wsState.set(env, { calls: 0, memo: new Map() });
  try {
    const site = await moodleCall<{ userid: number; fullname: string }>(env, 'core_webservice_get_site_info');
    const now = nowSec();

    // 1) Asignaturas: las actuales quedan activas; las de trimestres anteriores se guardan inactivas
    //    para traer tu historial de entregas y notas sin mezclarlas con lo que cursas ahora.
    const all = await moodleCall<MoodleCourse[]>(env, 'core_enrol_get_users_courses', { userid: site.userid });
    const isCurrent = (c: MoodleCourse) => (c.visible ?? 1) === 1 && (!c.enddate || c.enddate > now - 30 * 86400) && (!c.startdate || c.startdate < now + 30 * 86400);
    const current = all.filter(isCurrent);
    const existing = await env.DB.prepare('SELECT moodle_id, color FROM courses WHERE user_id = ?').bind(env.UID).all<{ moodle_id: number; color: string }>();
    const used = new Set(existing.results.map((r) => r.color));
    const courseMap = new Map<number, { id: number; name: string; current: boolean }>();
    for (const c of all) {
      c.fullname = fixText(c.fullname); if (c.displayname) c.displayname = fixText(c.displayname);
      const active = isCurrent(c) ? 1 : 0;
      const color = COLORS.find((x) => !used.has(x)) || COLORS[c.id % COLORS.length];
      // Si agregaste esta asignatura a mano antes de conectar el EVA, se enlaza en vez de duplicarla.
      const code = extractCode(c);
      await env.DB.prepare(`UPDATE courses SET moodle_id = ? WHERE id = (SELECT id FROM courses WHERE user_id = ? AND moodle_id IS NULL AND (lower(name) = lower(?) OR (code IS NOT NULL AND code = ?)) LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM courses WHERE user_id = ? AND moodle_id = ?)`).bind(c.id, env.UID, c.displayname || c.fullname, code, env.UID, c.id).run();
      const row = await env.DB.prepare(`INSERT INTO courses (user_id, moodle_id, code, name, short_name, color, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, moodle_id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, code = COALESCE(courses.code, excluded.code), active = excluded.active, updated_at = excluded.updated_at
        RETURNING id, color`).bind(env.UID, c.id, code, c.displayname || c.fullname, c.shortname, color, active, now).first<{ id: number; color: string }>();
      if (row) { used.add(row.color); courseMap.set(c.id, { id: row.id, name: c.displayname || c.fullname, current: !!active }); }
    }
    result.pastCourses = all.length - current.length;
    const currentIds = current.map((c) => c.id);
    if (currentIds.length) {
      await env.DB.prepare(`UPDATE courses SET active = 0 WHERE user_id = ? AND moodle_id IS NOT NULL AND moodle_id NOT IN (${currentIds.map(() => '?').join(',')})`).bind(env.UID, ...currentIds).run();
    }
    result.courses = current.length;

    // 2) Facilitadores (no detiene la sincronización si el EVA no los publica)
    try { await syncFacilitators(env, current.map((c) => c.id), result); }
    catch (e) { result.warnings.push('Facilitadores: ' + (e as Error).message); }

    // 2b) Avisos y novedades del EVA
    await syncNews(env, site.userid, courseMap, result);

    // 3) Calificaciones por asignatura. También dicen qué entregaste: una actividad con nota o con
    //    fecha de envío ya está entregada.
    const delivered = new Set<string>();
    // Cloudflare gratis permite ~50 llamadas externas por ejecución: las asignaturas pasadas se consultan
    // de a poco (las que nunca se han revisado primero) y el resto en las siguientes sincronizaciones.
    const pastQuota = Math.max(0, 30 - current.length);
    const pastChecked = await env.DB.prepare(`SELECT c.moodle_id AS m, MAX(g.updated_at) AS t FROM courses c LEFT JOIN grades g ON g.course_id = c.id WHERE c.user_id = ? AND c.active = 0 AND c.moodle_id IS NOT NULL GROUP BY c.moodle_id`).bind(env.UID).all<{ m: number; t: number | null }>();
    const lastCheck = new Map(pastChecked.results.map((r) => [r.m, r.t ?? 0]));
    const pastToCheck = new Set([...courseMap].filter(([, c]) => !c.current).map(([m]) => m)
      .sort((a, b) => (lastCheck.get(a) ?? 0) - (lastCheck.get(b) ?? 0)).slice(0, pastQuota));
    for (const [moodleId, course] of courseMap) {
      if (!course.current && !pastToCheck.has(moodleId)) continue;
      try {
        const g = await moodleCall<{ usergrades: { gradeitems: GradeItem[] }[] }>(env, 'gradereport_user_get_grade_items', { courseid: moodleId, userid: site.userid });
        const items = (g.usergrades?.[0]?.gradeitems || []).filter((i) => i.itemtype === 'mod' || i.itemtype === 'manual');
        const known = await env.DB.prepare('SELECT COUNT(*) AS n FROM grades WHERE course_id = ?').bind(course.id).first<{ n: number }>();
        const firstSync = !known || known.n === 0;
        for (const it of items) {
          if (it.itemname) it.itemname = fixText(it.itemname);
          if (it.itemmodule && it.iteminstance && (it.graderaw !== null || it.gradedatesubmitted)) delivered.add(`${it.itemmodule}:${it.iteminstance}`);
          const prev = await env.DB.prepare('SELECT grade FROM grades WHERE course_id = ? AND moodle_item_id = ?').bind(course.id, it.id).first<{ grade: number | null }>();
          const gKey = it.itemmodule && it.iteminstance ? `${it.itemmodule}:${it.iteminstance}` : null;
          // Comentario del facilitador (viene en HTML): se guarda como texto simple.
          const feedback = htmlToText(it.feedback || '').slice(0, 2000);
          await env.DB.prepare(`INSERT INTO grades (user_id, course_id, moodle_item_id, item_name, grade, grade_max, moodle_key, feedback, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(course_id, moodle_item_id) DO UPDATE SET item_name = excluded.item_name, grade_max = excluded.grade_max, moodle_key = excluded.moodle_key, updated_at = excluded.updated_at,
              -- Una nota encontrada en el foro se conserva mientras el libro de calificaciones siga vacío.
              grade = CASE WHEN excluded.grade IS NULL AND grades.source = 'foro' THEN grades.grade ELSE excluded.grade END,
              feedback = CASE WHEN excluded.grade IS NULL AND grades.source = 'foro' THEN grades.feedback ELSE excluded.feedback END,
              source = CASE WHEN excluded.grade IS NULL AND grades.source = 'foro' THEN 'foro' ELSE NULL END`)
            .bind(env.UID, course.id, it.id, it.itemname || 'Actividad', it.graderaw, it.grademax || 100, gKey, feedback || null, now).run();
          if (it.graderaw !== null && (!prev || prev.grade === null || prev.grade !== it.graderaw)) {
            // En la primera sincronización de una asignatura no se avisa (evita una avalancha de mensajes)
            if (!firstSync) result.newGrades.push({ course: course.name, courseId: course.id, item: it.itemname || 'Actividad', grade: it.graderaw, max: it.grademax || 100, prev: prev?.grade ?? null, feedback, key: gKey, itemId: it.id });
          }
        }
      } catch {
        // Algunas asignaturas pueden tener el libro de calificaciones oculto; se ignoran.
      }
    }

    // 3b) Foros: la nota que el facilitador puso en el foro aunque el EVA no la publique.
    try { await syncForumGrades(env, site.userid, courseMap, delivered, result); }
    catch (e) { result.warnings.push('Notas de foros: ' + (e as Error).message); }

    // 4) Entregas pendientes: el calendario de Moodle solo muestra lo que todavía requiere acción.
    const LIMIT = 50;
    const ev = await moodleCall<{ events: MoodleEvent[] }>(env, 'core_calendar_get_action_events_by_timesort', { timesortfrom: now - 45 * 86400, limitnum: LIMIT });
    const events = ev.events || [];
    const complete = events.length < LIMIT; // si vino completa, lo que no aparece ya no requiere acción
    const pendingKeys = new Set<string>();
    const seen: number[] = [];
    for (const e of events) {
      seen.push(e.id);
      const key = e.modulename && e.instance ? `${e.modulename}:${e.instance}` : null;
      if (key) pendingKeys.add(key);
      const courseId = e.course ? courseMap.get(e.course.id)?.id ?? null : null;
      const title = e.activityname || e.name.replace(/\s+(vence|debe entregarse|cierra|se cierra).*$/i, '');
      const prev = await env.DB.prepare('SELECT id, due_at, title FROM tasks WHERE user_id = ? AND (moodle_event_id = ? OR (moodle_key IS NOT NULL AND moodle_key = ?)) LIMIT 1')
        .bind(env.UID, e.id, key).first<{ id: number; due_at: number; title: string }>();
      if (!prev) {
        await env.DB.prepare(`INSERT INTO tasks (user_id, moodle_event_id, moodle_key, course_id, title, due_at, url, source, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'eva', 'pending')`)
          .bind(env.UID, e.id, key, courseId, title, e.timesort, e.url || null).run();
        result.tasksNew++;
      } else {
        if (prev.due_at !== e.timesort || prev.title !== title) result.tasksUpdated++;
        await env.DB.prepare('UPDATE tasks SET moodle_event_id = ?, moodle_key = COALESCE(moodle_key, ?), due_at = ?, title = ?, course_id = COALESCE(?, course_id), updated_at = ? WHERE id = ?')
          .bind(e.id, key, e.timesort, title, courseId, now, prev.id).run();
      }
    }

    // 5) Todas las actividades del curso: agrega las que ya entregaste y cierra las pendientes que ya no lo están.
    const acts = await fetchActivities(env, [...courseMap.keys()], result);
    result.activities = acts.length;
    const base = env.MOODLE_URL.replace(/\/$/, '');
    for (const a of acts) {
      const isPending = pendingKeys.has(a.key);
      const isDelivered = delivered.has(a.key);
      // Tarea o cuestionario que ya no pide acción en el calendario = ya lo enviaste. En foros solo cuenta la nota.
      const goneFromCalendar = complete && !isPending && a.module !== 'forum';
      const past = a.due !== null && a.due < now;
      const courseId = courseMap.get(a.moodleCourse)?.id ?? null;
      const url = `${base}/mod/${a.module}/view.php?id=${a.cmid}`;
      const note = isDelivered || (goneFromCalendar && !past) ? 'Entregada en el EVA' : 'Plazo cerrado en el EVA';
      const prev = await env.DB.prepare('SELECT id, status FROM tasks WHERE user_id = ? AND moodle_key = ?').bind(env.UID, a.key).first<{ id: number; status: string }>();
      if (prev) {
        if (prev.status === 'done' && isDelivered) {
          await env.DB.prepare(`UPDATE tasks SET notes = 'Entregada en el EVA', submitted_at = COALESCE(submitted_at, ?), course_id = COALESCE(course_id, ?) WHERE id = ? AND notes = 'Plazo cerrado en el EVA'`)
            .bind(now, courseId, prev.id).run();
        }
        if (prev.status === 'pending' && !isPending && (isDelivered || goneFromCalendar)) {
          await env.DB.prepare(`UPDATE tasks SET status = 'done', submitted_at = COALESCE(submitted_at, ?), notes = COALESCE(notes, ?), updated_at = ? WHERE id = ?`)
            .bind(note === 'Entregada en el EVA' ? now : null, note, now, prev.id).run();
          result.tasksClosed++;
        }
        continue;
      }
      if (isPending) continue; // ya la creó el calendario
      if (isDelivered || (goneFromCalendar && a.due !== null)) {
        await env.DB.prepare(`INSERT OR IGNORE INTO tasks (user_id, moodle_key, course_id, title, due_at, url, source, status, notes, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 'eva', 'done', ?, ?)`)
          .bind(env.UID, a.key, courseId, a.name, a.due, url, note, note === 'Entregada en el EVA' ? now : null).run();
        result.tasksNew++;
      } else if (a.module === 'forum' && a.due && !past) {
        // Foro con fecha que todavía no tiene nota: queda pendiente para que no se te olvide.
        await env.DB.prepare(`INSERT OR IGNORE INTO tasks (user_id, moodle_key, course_id, title, due_at, url, source, status) VALUES (?, ?, ?, ?, ?, ?, 'eva', 'pending')`)
          .bind(env.UID, a.key, courseId, a.name, a.due, url).run();
        result.tasksNew++;
      }
    }
    // Instrucciones de cada actividad (las que escribe el facilitador en el EVA)
    for (const a of acts) {
      const text = htmlToText(a.intro).slice(0, 8000);
      if (text) await env.DB.prepare('UPDATE tasks SET description = ? WHERE user_id = ? AND moodle_key = ? AND (description IS NULL OR description != ?)').bind(text, env.UID, a.key, text).run();
    }

    // Pensum automático: lo de este trimestre queda "en curso"; lo de trimestres pasados con 70 o más, "aprobada".
    try { await syncPensumFromCourses(env); } catch (e) { result.warnings.push('Pensum: ' + (e as Error).message); }

    // Tareas del calendario sin actividad conocida: si desaparecieron antes de vencer, se entregaron.
    if (complete) {
      const notIn = seen.length ? ` AND moodle_event_id NOT IN (${seen.map(() => '?').join(',')})` : '';
      const r = await env.DB.prepare(`UPDATE tasks SET status = 'done', submitted_at = COALESCE(submitted_at, ?), notes = COALESCE(notes, 'Entregada en el EVA'), updated_at = ?
        WHERE user_id = ? AND source = 'eva' AND status = 'pending' AND due_at > ? AND moodle_event_id IS NOT NULL${notIn}`).bind(now, now, env.UID, now, ...seen).run();
      result.tasksClosed += r.meta.changes ?? 0;
    }
    result.delivered = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND notes = 'Entregada en el EVA'`).bind(env.UID).first<{ n: number }>())?.n ?? 0;
    if (result.warnings.length) console.log('EVA avisos: ' + result.warnings.join(' | '));
    console.log(`EVA: ${all.length} asignaturas en total (${result.pastCourses} de trimestres anteriores), ${result.delivered} entregas registradas`);
    console.log(`EVA: ${wsState.get(env)?.calls ?? 0} llamadas, ${result.forumGrades} notas sacadas de foros`);
    console.log(`EVA: ${result.courses} cursos, ${result.activities} actividades, ${result.tasksNew} nuevas, ${result.tasksClosed} cerradas, ${result.facilitators} con facilitador`);

    await setSetting(env, 'eva_last_sync', String(now));
    await setSetting(env, 'eva_last_error', '');
    await setSetting(env, 'eva_user', site.fullname);
    // Notas nuevas o cambiadas: aviso con la nota y el comentario (también al sincronizar a mano).
    if (result.newGrades.length) await notifyGrades(env, result.newGrades).catch((e) => console.log('Aviso de notas falló: ' + (e as Error).message));
    return result;
  } catch (e) {
    await setSetting(env, 'eva_last_error', (e as Error).message.slice(0, 300));
    throw e;
  }
}
