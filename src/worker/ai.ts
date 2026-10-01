// Asistente con IA (Workers AI, gratis): entiende español dominicano coloquial, responde con tus datos
// reales y además HACE cosas (crear/completar tareas, recordatorios, pagos, ajustes, pensum, sincronizar…).
import type { Env } from './env';
import { getSettings, setSetting } from './db';
import { courseSummaries, listTasks, payWindow, periodLabel } from './data';
import { syncEva } from './moodle';
import { findCareer } from './pensums';
import { transcribeAudio } from './voice';
import { llmComplete, llmStream } from './llm';
import { cuandoTexto, fechaLarga, horaTexto, localDate, localToUnix, nowSec } from './time';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Resume en texto compacto todo lo que la IA necesita saber de ti. */
async function buildContext(env: Env, compact = false): Promise<string> {
  const s = await getSettings(env);
  const now = nowSec();
  const L: string[] = [];
  const d = localDate(env);
  L.push(`AHORA: ${fechaLarga(d)} ${d.getUTCFullYear()}, ${horaTexto(d)} (hora de República Dominicana).`);
  // Calendario de los próximos días para que la IA convierta "el viernes", "pasado mañana"… a fechas exactas.
  const cal: string[] = [];
  for (let i = 0; i < 14; i++) {
    const x = localDate(env, now + i * 86400);
    const iso = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
    cal.push(`${DIAS[x.getUTCDay()]} ${iso}${i === 0 ? ' (HOY)' : i === 1 ? ' (mañana)' : i === 2 ? ' (pasado mañana)' : ''}`);
  }
  L.push(`CALENDARIO (próximos 14 días): ${cal.join(' · ')}. "El viernes" = el PRIMER viernes de esta lista después de hoy (aunque sea mañana).`);
  const career = findCareer(s.career || '');
  L.push(`ESTUDIANTE: ${s.student_name || 'el estudiante'}${career ? `, ${career.name} en la UAPA` : ', UAPA'} (la UAPA va por TRIMESTRES).`);

  const courses = await courseSummaries(env);
  if (courses.length) {
    L.push('', 'ASIGNATURAS ACTUALES (nombre | código | facilitador | promedio | calificadas/total | pendientes):');
    for (const c of courses) L.push(`- ${c.name} | ${c.code || c.short_name || '-'} | ${c.facilitator || c.facilitator_eva || 'desconocido'} | ${c.average ?? 'sin notas'} | ${c.graded}/${c.total} | ${c.pending_tasks}`);
  }

  const pending = await listTasks(env, { status: 'pending', limit: 40 });
  L.push('', 'TAREAS PENDIENTES (#id | título | asignatura | entrega):');
  if (!pending.length) L.push('- ninguna');
  for (const t of pending) L.push(`- #${t.id} | ${t.title} | ${t.course_name || 'Personal'} | ${t.due_at ? (t.due_at < now ? 'VENCIDA, ' : '') + cuandoTexto(env, t.due_at) : 'sin fecha'}`);

  const done = await listTasks(env, { status: 'done', limit: compact ? 8 : 40 });
  if (done.length) {
    L.push('', 'ENTREGADAS / HECHAS (#id | título | asignatura | nota):');
    for (const t of done) L.push(`- #${t.id} | ${t.title} | ${t.course_name || 'Personal'} | ${t.grade !== null && t.grade !== undefined ? `${fmt(t.grade)}/${fmt(t.grade_max || 100)}` : t.notes === 'Plazo cerrado en el EVA' ? 'plazo cerrado, sin nota' : 'sin calificar'}`);
  }

  const { results: grades } = compact ? { results: [] as { course: string; item: string; grade: number | null; grade_max: number }[] } : await env.DB.prepare(`SELECT c.name AS course, g.item_name AS item, g.grade, g.grade_max FROM grades g JOIN courses c ON c.id = g.course_id WHERE c.active = 1 ORDER BY c.name, g.id LIMIT 60`)
    .all<{ course: string; item: string; grade: number | null; grade_max: number }>();
  if (grades.length) {
    L.push('', 'LIBRO DE CALIFICACIONES (asignatura | actividad | nota):');
    for (const g of grades) L.push(`- ${g.course} | ${g.item} | ${g.grade === null ? 'pendiente' : `${fmt(g.grade)}/${fmt(g.grade_max)}`}`);
  }

  const { results: news } = await env.DB.prepare(`SELECT a.title, a.body, a.kind, a.source, a.created_at, a.read, c.name AS course FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    ORDER BY a.created_at DESC LIMIT ${compact ? 3 : 10}`).all<{ title: string; body: string | null; kind: string; source: string; created_at: number; read: number; course: string | null }>();
  if (news.length) {
    L.push('', 'AVISOS RECIENTES (fecha | origen | tipo | leído | título: resumen):');
    for (const n of news) L.push(`- ${fechaLarga(localDate(env, n.created_at))} | ${n.course || (n.source === 'correo' ? 'correo UAPA' : n.source === 'rumbo' ? 'Rumbo' : 'EVA')} | ${n.kind} | ${n.read ? 'sí' : 'no'} | ${n.title}: ${(n.body || '').replace(/\s+/g, ' ').slice(0, 200)}`);
  }

  const { results: rem } = await env.DB.prepare('SELECT id, text, remind_at FROM reminders WHERE sent = 0 ORDER BY remind_at LIMIT 10').all<{ id: number; text: string; remind_at: number }>();
  if (rem.length) { L.push('', 'RECORDATORIOS PROGRAMADOS:'); for (const r of rem) L.push(`- ${r.text} | ${cuandoTexto(env, r.remind_at)}`); }

  const p = await payWindow(env, s);
  L.push('', `PAGO: cuota de ${periodLabel(p.period)}${p.amount ? ` (RD$ ${p.amount})` : ''}: ${p.paid ? 'PAGADA' : p.state === 'open' ? `ventana ABIERTA, cierra en ${p.daysToClose} día(s) (día ${p.closeDay})` : `la ventana abre en ${p.daysToOpen} día(s) (día ${p.openDay})`}.`);

  const { results: pen } = await env.DB.prepare(`SELECT term, code, name, credits, status, grade FROM pensum ORDER BY term, id`).all<{ term: number; code: string | null; name: string; credits: number; status: string; grade: number | null }>();
  if (pen.length && !compact) {
    const tot = pen.reduce((a, r) => a + r.credits, 0), ok = pen.filter((r) => r.status === 'aprobada').reduce((a, r) => a + r.credits, 0);
    L.push('', `PENSUM: ${ok}/${tot} créditos aprobados. Mínimo para graduarse: índice 70.`);
    // Solo lo relevante (para responder rápido): lo cursado/aprobado y el próximo trimestre.
    const cur = Math.max(1, ...pen.filter((r) => r.status !== 'pendiente').map((r) => r.term));
    for (const r of pen.filter((r) => r.status !== 'pendiente')) L.push(`- T${r.term} ${r.code || ''} ${r.name} [${r.status}${r.grade ? ' ' + r.grade : ''}]`);
    L.push(`Próximo trimestre (T${cur + 1}): ${pen.filter((r) => r.term === cur + 1).map((r) => `${r.code || ''} ${r.name}`).join('; ') || '—'}. Faltan ${pen.filter((r) => r.status === 'pendiente').length} asignaturas en total.`);
  }
  L.push('', `AJUSTES: resumen diario a las ${s.summary_hour || 7}:00 (${s.summary_enabled === '0' ? 'apagado' : 'encendido'}); recordatorios ${s.task_reminders || '72,24,3'} h antes; avisos apagados: ${['tareas', 'notas', 'pagos', 'avisos', 'resumen', 'novedades'].filter((k) => s[`notify_${k}`] === '0').join(', ') || 'ninguno'}.`);
  return L.join('\n');
}

const SYSTEM = (ctx: string, memory: string) => `Eres Rumbo, el asistente académico personal (y pana) de un estudiante de la UAPA, República Dominicana.

CÓMO HABLAS
- Eres un pana joven dominicano: natural, alegre, directo. Usa con naturalidad "klk", "dale", "tranqui", "manito/mano", "tato", "ta' bien", "qué lo que", "pa'" (sin exagerar, sin groserías).
- Entiendes TODO lo coloquial: "klk", "qué lo que", "tato", "vaina", "ahorita", "en la tarde", "pa'", "na'", "to'", "manito", "ta' bien", "dímelo", "tecno" (=Tecnología), "lógica" (=Razonamiento), errores de dictado de notas de voz, sin tildes, todo en minúscula. Adivina la intención con sentido común.
- Usa SOLO los datos del CONTEXTO. Nunca inventes notas, fechas, tareas ni nombres. Si algo no está, dilo y ofrece sincronizar.

FORMATO (se ve bonito en la app; síguelo siempre)
- Abre con una línea corta y clara. Luego, si hace falta, secciones con título en su propia línea así: *📌 Título*
- Listas con "• ". Notas siempre como 95/100. Negrita con *un asterisco*.
- Deja una línea en blanco entre secciones. Máximo ~12 líneas. Nada de tablas ni "#".
- Si das un consejo, ponlo al final en una línea que empiece con "💡 ".
- Escribe natural: NUNCA copies el formato interno del contexto ("#12 | título | …"). Ej.: "• Resumen de Tecno · mañana 7:00 p. m.". No inventes horarios ni datos que no te dieron.
- SIEMPRE termina con la línea === y el JSON (aunque no haya acciones), porque de ahí sale tu voz.
- No repitas la lista de acciones: la app ya muestra lo que hiciste.

ACCIONES (puedes hacer cosas de verdad). Úsalas SOLO cuando el estudiante lo pida o lo confirme claramente:
- create_task {title, due?: "AAAA-MM-DD HH:MM", course?: nombre o código}  (si no dice hora usa 23:59; "en la tarde"=15:00, "en la noche"=20:00, "en la mañana"=09:00)
- complete_task {id}            - reopen_task {id}       (id = número #id del contexto; si no lo sabes, usa {match: "palabras del título"})
- update_task {id, title?, due?, course?}   (mover fecha, cambiar nombre o asignatura)
- delete_task {id}               (solo si lo pide explícitamente)
- add_reminder {text, at: "AAAA-MM-DD HH:MM"}   ("temprano"=07:00)
- update_reminder {match, at, new_text?}   (mover un recordatorio ya creado)
REGLAS: "ponme / anótame / agrégame / tengo que hacer X para <día>" = create_task (es una entrega). "recuérdame / avísame" = add_reminder.
Si lo que pide se refiere a algo de los mensajes anteriores ("muévemelo", "esa", "la de ahorita"), usa el historial para saber cuál es.
En "reply" NO afirmes que ya hiciste la acción con detalles; di algo corto como "Dale, te lo dejo listo 👇" — la app agrega la confirmación real.
- register_payment {amount?}     (cuando dice que pagó la cuota)
- sync_eva {}                    (traer lo nuevo del EVA)
- mark_news_read {}
- set_setting {key, value}       keys: summary_hour (0-23), summary_enabled (0/1), study_hour (0-23, hora de estudio diaria), study_enabled (0/1), task_reminders ("72,24,3"), student_name, notify_tareas|notify_notas|notify_pagos|notify_avisos|notify_resumen|notify_novedades (0/1)
- set_pensum {code, status: "aprobada"|"en_curso"|"pendiente", grade?}
Usa los #id del contexto. Las fechas, con el CALENDARIO del contexto.

CÓMO RESPONDES (formato obligatorio, en este orden):
1) Primero lo que le dices al estudiante, con el FORMATO de arriba. Empieza directo: NUNCA pongas etiquetas como "Respuesta:" o "Pantalla:".
2) Luego una línea que diga exactamente: ===
3) Luego UNA línea con JSON: {"say": "lo que dirías en voz alta", "actions": [...], "remember": ["dato duradero", ...]}
   - "say" (sin etiquetas, directo): 1 a 3 frases cortas, como si hablaras por nota de voz con un pana dominicano joven. Sin emojis, sin listas, sin símbolos, números escritos claro ("noventa y dos punto cinco").
   - "remember": TÚ decides qué vale la pena guardar, sin que te lo pidan. Guarda cada dato útil y duradero que aparezca, aunque lo diga de pasada:
     metas y notas que quiere sacar, materias que le cuestan o le gustan, horarios (trabajo, clases, cuándo estudia), facilitadores y compañeros,
     cómo quiere que le hables, gustos, situaciones personales que compartió, fechas importantes, cosas que le funcionaron para estudiar.
     Escribe cada dato corto y concreto en 3ª persona ("Trabaja de lunes a viernes hasta las 5 p. m."). Si corrige algo que ya sabías, guarda la versión nueva.
     NO guardes lo que ya está en la memoria, ni tareas o recordatorios (eso va en "actions"), ni charla sin importancia. Si no hay nada, [].
Ejemplo:
Dale, te lo dejo listo 👇
===
{"say": "Klk mano, ya te puse el foro pa' mañana en la tarde. Tranqui.", "actions": [{"type": "create_task", "title": "Foro de Tecnología", "due": "2026-10-02 15:00", "course": "Tecnología"}], "remember": []}

MEMORIA DE LARGO PLAZO (lo que sabes del estudiante de conversaciones anteriores; úsalo con naturalidad):
${memory || '(todavía nada)'}

CONTEXTO:
${ctx}`;

type Action = { type: string; [k: string]: unknown };
type Turn = { role: 'user' | 'assistant'; content: string };

function parseLocal(env: Env, v: unknown): number | null {
  const m = String(v || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return localToUnix(env, +m[1], +m[2], +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
}

async function findCourseId(env: Env, name: unknown): Promise<number | null> {
  const q = fold(String(name || ''));
  if (!q) return null;
  const { results } = await env.DB.prepare('SELECT id, name, code, short_name FROM courses WHERE active = 1').all<{ id: number; name: string; code: string | null; short_name: string | null }>();
  const hit = results.find((c) => [c.name, c.code, c.short_name].filter(Boolean).some((x) => { const f = fold(x!); return f === q || f.includes(q) || q.includes(f); }))
    || results.find((c) => q.split(' ').some((w) => w.length > 3 && fold(c.name).includes(w)));
  return hit?.id ?? null;
}

/** Encuentra la tarea por #id o, si la IA mandó el nombre, por parecido del título. */
async function resolveTask(env: Env, a: Action): Promise<{ id: number; title: string } | null> {
  const n = Number(String(a.id ?? '').replace(/\D/g, ''));
  if (n) { const t = await env.DB.prepare('SELECT id, title FROM tasks WHERE id = ?').bind(n).first<{ id: number; title: string }>(); if (t) return t; }
  const q = fold([a.match, a.task, a.name, a.type !== 'update_task' ? a.title : '', typeof a.id === 'string' && /[a-z]/i.test(a.id) ? a.id : ''].filter(Boolean).join(' '));
  if (!q) return null;
  const { results } = await env.DB.prepare(`SELECT id, title, status FROM tasks ORDER BY status = 'pending' DESC, COALESCE(due_at, 9999999999) LIMIT 300`).all<{ id: number; title: string }>();
  const words = q.split(' ').filter((w) => w.length > 2);
  const scored = results.map((t) => ({ t, s: words.filter((w) => fold(t.title).includes(w) || fold(t.title).includes(w.slice(0, 5))).length })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s);
  return scored[0]?.t ?? null;
}

/** Ejecuta las acciones que pidió la IA. Devuelve una línea "✅ …" / "⚠️ …" por cada una. */
async function runActions(env: Env, actions: Action[]): Promise<string[]> {
  const out: string[] = [];
  const now = nowSec();
  for (const a of actions.slice(0, 6)) {
    try {
      switch (a.type) {
        case 'create_task': {
          const title = String(a.title || '').trim();
          if (!title) break;
          const due = parseLocal(env, a.due);
          const course = await findCourseId(env, a.course);
          await env.DB.prepare(`INSERT INTO tasks (title, due_at, course_id, source, status) VALUES (?, ?, ?, 'manual', 'pending')`).bind(title, due, course).run();
          out.push(`✅ Tarea creada: ${title}${due ? ` · ${cuandoTexto(env, due)}` : ''}`);
          break;
        }
        case 'complete_task':
        case 'reopen_task': {
          const done = a.type === 'complete_task';
          const t = await resolveTask(env, a);
          if (!t) { out.push('⚠️ No encontré esa tarea. Dime el nombre como sale en tu lista.'); break; }
          await env.DB.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').bind(done ? 'done' : 'pending', now, t.id).run();
          out.push(`✅ ${done ? 'Marcada como hecha' : 'Reabierta'}: ${t.title}`);
          break;
        }
        case 'update_task': {
          const t = await resolveTask(env, a);
          if (!t) { out.push('⚠️ No encontré esa tarea. Dime el nombre como sale en tu lista.'); break; }
          const due = a.due !== undefined ? parseLocal(env, a.due) : undefined;
          const course = a.course !== undefined ? await findCourseId(env, a.course) : undefined;
          await env.DB.prepare(`UPDATE tasks SET title = COALESCE(?, title), due_at = CASE WHEN ? THEN ? ELSE due_at END, course_id = CASE WHEN ? THEN ? ELSE course_id END, updated_at = ? WHERE id = ?`)
            .bind(a.title ? String(a.title) : null, due !== undefined ? 1 : 0, due ?? null, course !== undefined ? 1 : 0, course ?? null, now, t.id).run();
          out.push(`✅ Tarea actualizada: ${a.title ? String(a.title) : t.title}${due ? ` · ${cuandoTexto(env, due)}` : ''}`);
          break;
        }
        case 'delete_task': {
          const t = await resolveTask(env, a);
          if (!t) { out.push('⚠️ No encontré esa tarea.'); break; }
          await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(t.id).run();
          out.push(`✅ Tarea eliminada: ${t.title}`);
          break;
        }
        case 'add_reminder': {
          const at = parseLocal(env, a.at);
          const text = String(a.text || '').trim();
          if (!at || !text) { out.push('⚠️ Me faltó la hora del recordatorio'); break; }
          await env.DB.prepare('INSERT INTO reminders (text, remind_at) VALUES (?, ?)').bind(text, at).run();
          out.push(`✅ Recordatorio: ${text} · ${cuandoTexto(env, at)}`);
          break;
        }
        case 'update_reminder': {
          const at = parseLocal(env, a.at);
          const q = fold(String(a.match || a.text || ''));
          const { results } = await env.DB.prepare('SELECT id, text FROM reminders WHERE sent = 0 ORDER BY id DESC').all<{ id: number; text: string }>();
          const r = results.find((x) => q && q.split(' ').some((w) => w.length > 3 && fold(x.text).includes(w))) || results[0];
          if (!r || !at) { out.push('⚠️ No encontré ese recordatorio'); break; }
          await env.DB.prepare('UPDATE reminders SET remind_at = ?, text = COALESCE(?, text) WHERE id = ?').bind(at, a.new_text ? String(a.new_text) : null, r.id).run();
          out.push(`✅ Recordatorio movido: ${a.new_text || r.text} · ${cuandoTexto(env, at)}`);
          break;
        }
        case 'register_payment': {
          const p = await payWindow(env);
          const amount = Number(a.amount) || (p.amount ? Number(p.amount) : null);
          await env.DB.prepare('INSERT INTO payments (period, amount, paid_at, note) VALUES (?, ?, ?, ?)').bind(p.period, amount, now, 'Registrado por el asistente').run();
          out.push(`✅ Pago registrado: cuota de ${periodLabel(p.period)}${amount ? ` · RD$ ${amount.toLocaleString('es-DO')}` : ''}`);
          break;
        }
        case 'sync_eva': {
          const r = await syncEva(env);
          out.push(`✅ EVA sincronizado: ${r.tasksNew} nuevas, ${r.tasksClosed} entregadas`);
          break;
        }
        case 'mark_news_read': {
          await env.DB.prepare('UPDATE announcements SET read = 1 WHERE read = 0').run();
          out.push('✅ Avisos marcados como leídos');
          break;
        }
        case 'set_setting': {
          const key = String(a.key || '');
          const allowed = ['summary_hour', 'summary_enabled', 'study_hour', 'study_enabled', 'task_reminders', 'student_name', 'notify_tareas', 'notify_notas', 'notify_pagos', 'notify_avisos', 'notify_resumen', 'notify_novedades'];
          if (!allowed.includes(key)) { out.push(`⚠️ No puedo cambiar «${key}» desde el chat`); break; }
          await setSetting(env, key, String(a.value ?? ''));
          out.push(`✅ Ajuste cambiado: ${key.replace('notify_', 'avisos de ').replace('summary_hour', 'hora del resumen').replace('summary_enabled', 'resumen diario').replace('task_reminders', 'recordatorios').replace('student_name', 'tu nombre')} → ${String(a.value)}`);
          break;
        }
        case 'remember': {
          await remember(env, String(a.fact || a.text || ''));
          out.push('✅ Lo tendré presente');
          break;
        }
        case 'set_pensum': {
          const code = String(a.code || '').toUpperCase();
          const st = String(a.status || '');
          if (!['aprobada', 'en_curso', 'pendiente'].includes(st)) break;
          const r = await env.DB.prepare('UPDATE pensum SET status = ?, grade = COALESCE(?, grade) WHERE code = ?').bind(st, a.grade !== undefined ? Number(a.grade) : null, code).run();
          out.push(r.meta.changes ? `✅ Pensum: ${code} → ${st.replace('_', ' ')}` : `⚠️ No encontré ${code} en tu pensum`);
          break;
        }
      }
    } catch (e) {
      out.push(`⚠️ No pude completar «${a.type}»: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Separa lo que se ve en pantalla de los datos internos (versión hablada, acciones, memoria). */
/** Etiquetas que algunos modelos ponen al inicio ("Respuesta:", "1) Respuesta para la pantalla:") y no se deben ver ni oír. */
const LABEL = /^\s*(?:\d[).]\s*)?[*_#\s]*(?:respuesta|texto|pantalla|mensaje|reply)(?:\s+(?:para|en)\s+(?:la\s+)?pantalla)?[*_\s]*:\s*[*_]*\s*/i;
export function labelLength(text: string): number { const m = LABEL.exec(text); return m ? m[0].length : 0; }

export function splitOutput(full: string): { visible: string; say: string; actions: Action[]; remember: string } {
  const i = full.search(/\n?\s*===\s*\n?/);
  let visible = (i >= 0 ? full.slice(0, i) : full).replace(LABEL, '').trim();
  const meta = i >= 0 ? full.slice(i).replace(/^\s*===\s*/, '') : '';
  let parsed: { say?: string; actions?: Action[]; remember?: string | string[]; reply?: string } = {};
  const a = meta.indexOf('{'), b = meta.lastIndexOf('}');
  if (a >= 0 && b > a) { try { parsed = JSON.parse(meta.slice(a, b + 1)); } catch { /* sin metadatos */ } }
  // Por si el modelo respondió en el formato viejo (todo en JSON)
  if (!visible.trim() || visible.trim().startsWith('{')) {
    try { const j = JSON.parse(visible.slice(visible.indexOf('{'), visible.lastIndexOf('}') + 1)); parsed = { ...j, ...parsed }; visible = j.reply || ''; } catch { /* texto normal */ }
  }
  const actions = (Array.isArray(parsed.actions) ? parsed.actions : []).map((x) => {
    // La IA a veces anida los datos: {"id": {"match": "…"}} → {"match": "…"}.
    if (x && typeof x.id === 'object' && x.id) { const inner = x.id as Record<string, unknown>; delete (x as Record<string, unknown>).id; return { ...inner, ...x } as Action; }
    return x;
  });
  visible = visible.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#+\s*/gm, '').trim();
  return { visible, say: String(parsed.say || '').trim(), actions, remember: (Array.isArray(parsed.remember) ? parsed.remember.map(String).join('\n') : String(parsed.remember || '')).trim() };
}

// ----- Memoria -----
/** Conversación reciente del canal (sin límite de tiempo): los últimos mensajes. */
async function history(env: Env, channel: string, limit = 12): Promise<Turn[]> {
  const { results } = await env.DB.prepare(`SELECT direction, body FROM messages WHERE channel = ? ORDER BY id DESC LIMIT ?`)
    .bind(channel, limit).all<{ direction: string; body: string }>();
  return results.reverse().map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body.slice(0, 600) }));
}

/**
 * Guarda datos duraderos en la memoria de largo plazo (sin duplicar).
 * Cuando crece mucho, la propia IA la reordena por temas y fusiona lo repetido o desactualizado.
 */
async function remember(env: Env, facts: string): Promise<void> {
  const cur = (await getSettings(env)).ai_memory || '';
  const lines = cur.split('\n').filter(Boolean);
  let added = 0;
  for (const raw of facts.split('\n')) {
    const f = raw.replace(/^[•\-\s]+/, '').trim().replace(/\s+/g, ' ').slice(0, 220);
    if (f.length < 4 || fold(lines.join(' ')).includes(fold(f).slice(0, 40))) continue;
    lines.push(`• ${f}`); added++;
  }
  if (!added) return;
  console.log(`IA recordó ${added} dato(s)`);
  let text = lines.join('\n');
  if (text.length > 2400) text = (await compactMemory(env, text)) || lines.slice(-30).join('\n');
  await setSetting(env, 'ai_memory', text.slice(0, 3000));
}

async function compactMemory(env: Env, text: string): Promise<string | null> {
  try {
    const out = await llmComplete(env, [
      { role: 'system', content: 'Reorganiza esta memoria sobre un estudiante. Agrupa por temas con un título en mayúsculas (PERSONAL, ESTUDIOS, HORARIOS, PREFERENCIAS, METAS). Fusiona lo repetido, quédate con la versión más reciente si algo cambió (lo de abajo es más nuevo) y borra lo trivial. Cada dato en una línea que empiece con "• ". Máximo 1800 caracteres. Responde SOLO con la memoria.' },
      { role: 'user', content: text },
    ], { maxTokens: 900, temperature: 0.1 });
    const clean = out.split('===')[0].trim();
    return clean.length > 40 ? clean : null;
  } catch { return null; }
}

const VOICE_MODE = `

MODO LLAMADA DE VOZ (manda sobre el formato de arriba): estás hablando en voz alta con el estudiante, como en una llamada.
- Antes de "===" escribe SOLO lo que vas a decir: 1 a 3 frases cortas y naturales (máximo ~45 palabras). Nada de listas, viñetas, emojis, asteriscos, títulos ni "#".
- Habla como un joven dominicano relajado pero claro. NO escribas "klk", "pa'", "na'" ni abreviaturas (la voz las lee letra por letra): escribe "qué lo que", "para", "nada", "tranquilo".
- Números y horas en palabras: "noventa y dos punto cinco", "mañana a las siete de la noche". Si hay muchas tareas, menciona las dos más urgentes y ofrece más.
- Escribe frases completas y fluidas, como se habla: sin paréntesis, comillas, barras, guiones, dos puntos ni puntos suspensivos.
- Después de "===" el JSON con "actions" y "remember" como siempre ("say" no hace falta).`;

async function preparePrompt(env: Env, question: string, channel: string, voice = false) {
  const s = await getSettings(env);
  // En llamada de voz se manda menos historial: respuestas más rápidas y menos gasto de los límites gratis.
  const past = await history(env, channel, voice ? 6 : 12);
  // El mensaje actual ya quedó guardado: no se repite.
  if (past.length && past[past.length - 1].role === 'user' && past[past.length - 1].content === question.slice(0, 600)) past.pop();
  return [{ role: 'system', content: SYSTEM(await buildContext(env, voice), s.ai_memory || '') + (voice ? VOICE_MODE : '') }, ...past, { role: 'user', content: question.slice(0, 1200) }];
}

/** Ejecuta acciones y memoria; devuelve el texto final (pantalla + confirmaciones). */
async function finish(env: Env, question: string, out: ReturnType<typeof splitOutput>): Promise<{ text: string; say: string; done: string[] }> {
  const actions = out.actions;
  // "ponme / anótame / tengo que hacer…" es una entrega, no un recordatorio (salvo que diga "recuérdame").
  if (/(ponme|anotame|anótame|agregame|agrégame|apuntame|apúntame|tengo que (hacer|entregar))/i.test(question) && !/recu[eé]rdame|av[ií]same/i.test(question)) {
    for (const x of actions) if (x.type === 'add_reminder') { x.type = 'create_task'; x.title = x.title || x.text; x.due = x.due || x.at; }
  }
  if (actions.length) console.log('IA acciones: ' + JSON.stringify(actions));
  const done = actions.length ? await runActions(env, actions) : [];
  if (out.remember) await remember(env, out.remember).catch(() => {});
  return { text: [out.visible, done.join('\n')].filter(Boolean).join('\n\n'), say: out.say, done };
}

/** Respuesta completa (sin streaming): WhatsApp, Telegram y comandos internos. */
export async function aiAnswer(env: Env, question: string, channel = 'app'): Promise<string | null> {
  try {
    const messages = await preparePrompt(env, question, channel);
    const raw = await llmComplete(env, messages, { maxTokens: 700, temperature: 0.3 });
    const parsed = splitOutput(raw);
    if (!parsed.visible && !parsed.actions.length) return null;
    return (await finish(env, question, parsed)).text;
  } catch (e) {
    console.log(`IA no respondió: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Respuesta en streaming (Server-Sent Events) para la app: el texto va apareciendo mientras se genera.
 * Eventos: {t: "delta", d: "texto"} … y al final {t: "done", text, say, done}.
 */
export function aiStream(env: Env, question: string, channel: string, onDone: (text: string) => Promise<void>, opts: { voice?: boolean; audio?: Uint8Array; mime?: string } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      let full = '';
      let shown = 0;
      try {
        // Nota de voz: se transcribe aquí mismo (una sola llamada desde el teléfono = más rápido).
        if (opts.audio) {
          question = (await transcribeAudio(env, opts.audio, opts.mime)).trim();
          send({ t: 'heard', d: question });
          if (!question) { send({ t: 'done', text: '', say: '', done: [], empty: true }); ctrl.close(); return; }
          await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('in', channel, `🎤 ${question}`).run();
        }
        const messages = await preparePrompt(env, question, channel, !!opts.voice);
        const { engine, deltas } = await llmStream(env, messages, { maxTokens: opts.voice ? 260 : 700, temperature: 0.4 });
        console.log(`IA: ${engine}`);
        for await (const piece of deltas) {
          full += piece;
          // Solo se muestra lo de antes de "===" (y se guardan 4 caracteres por si el separador viene a medias).
          const cut = full.indexOf('===');
          const visibleEnd = cut >= 0 ? cut : Math.max(0, full.length - 4);
          // Al principio se espera un poquito para quitar etiquetas como "Respuesta:" antes de mostrar o decir nada.
          if (!shown && cut < 0 && visibleEnd < 40) continue;
          const lead = shown ? 0 : labelLength(full);
          if (!shown) shown = lead;
          if (visibleEnd > shown && !full.trimStart().startsWith('{')) { send({ t: 'delta', d: full.slice(shown, visibleEnd) }); shown = visibleEnd; }
        }
        const parsed = splitOutput(full);
        if (!parsed.visible && !parsed.actions.length) throw new Error('La IA no respondió');
        const fin = await finish(env, question, parsed);
        await onDone(fin.text);
        send({ t: 'done', text: fin.text, say: fin.say, done: fin.done });
      } catch (e) {
        // Todos los motores gratis ocupados a la vez (pasa muy rara vez y dura segundos).
        const busy = /cuota agotada|4006|daily free alloc|neurons|429|rate/i.test((e as Error).message);
        const fallback = busy ? null : await aiAnswer(env, question, channel).catch(() => null);
        const text = fallback || (opts.voice
          ? 'Dame un chin, se me trabó la señal. Repíteme eso en unos segunditos.'
          : '⏳ Se me trabó la señal un momentito. Vuelve a enviarlo en unos segundos y te respondo.\n\nMientras tanto funcionan: *hoy*, *tareas*, *notas*, *entregadas*, *pagos* y *sincronizar*.');
        await onDone(text).catch(() => {});
        send({ t: 'done', text, say: opts.voice ? text : '', done: [] });
      }
      ctrl.close();
    },
  });
}

/** Memoria visible y editable desde la app. */
export async function getMemory(env: Env): Promise<string> { return (await getSettings(env)).ai_memory || ''; }
export async function setMemory(env: Env, text: string): Promise<void> { await setSetting(env, 'ai_memory', text.slice(0, 3000)); }
