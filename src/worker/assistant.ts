// Asistente por WhatsApp: entiende comandos y preguntas sencillas en español, sin IA de pago.
import type { Env } from './env';
import { allGrades, courseSummaries, type CourseSummary, listTasks, overallAverage, payWindow, periodLabel, summaryText } from './data';
import { syncEva } from './moodle';
import { aiAnswer } from './ai';
import { cuandoTexto, horaTexto, localDate, localToUnix, nowSec, fechaCorta } from './time';

const AYUDA = [
  '*Rumbo · lo que puedo hacer*',
  '• *hoy*: tu resumen del día',
  '• *tareas*: entregas pendientes',
  '• *notas*: promedio por asignatura',
  '• *pagos*: estado de la cuota',
  '• *pagué*: registrar el pago de la cuota',
  '• *listo 12*: marcar la tarea #12 como hecha',
  '• *nueva* texto mañana 18:00: agregar una tarea',
  '• *recuérdame* mañana 6pm entregar el video',
  '• *nota de* examen final: buscar la nota de un trabajo',
  '• *facilitadores*: quién da cada asignatura',
  '• *entregadas*: lo último que entregaste',
  '• *sincronizar*: traer lo nuevo del EVA',
  '',
  '🎤 También puedes mandarme una *nota de voz*: "¿cuánto saqué en el foro de Tecnología?"',
].join('\n');

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Interpreta "hoy", "mañana", "pasado mañana", "lunes", "5/10", "2026-10-05" + "18:00", "6pm", "6:30 pm". */
/** Pasa a minúsculas y quita tildes SIN cambiar la longitud del texto (para cortar el original por posición). */
function fold(s: string): string {
  return [...s].map((ch) => { const f = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return f.length === 1 ? f : ch.toLowerCase().slice(0, 1) || ' '; }).join('');
}

/** Interpreta "hoy", "mañana", "pasado mañana", "lunes", "5/10", "2026-10-05" + "18:00", "6pm", "6:30 pm". */
export function parseWhen(env: Env, input: string): { at: number; rest: string } | null {
  let orig = ' ' + input.normalize('NFC').replace(/\s/g, ' ') + ' ';
  let s = fold(orig);
  const cut = (m: RegExpMatchArray) => {
    const i = m.index ?? s.indexOf(m[0]);
    const blank = ' '.repeat(m[0].length);
    s = s.slice(0, i) + blank + s.slice(i + m[0].length);
    orig = orig.slice(0, i) + blank + orig.slice(i + m[0].length);
  };
  const now = localDate(env);
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  let found = false;
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const shift = (n: number) => { const t = new Date(Date.UTC(y, m - 1, d + n)); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate(); };
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/ (?:para )?pasado manana /))) { shift(2); found = true; cut(mt); }
  else if ((mt = s.match(/ (?:para )?manana /))) { shift(1); found = true; cut(mt); }
  else if ((mt = s.match(/ (?:para )?hoy /))) { found = true; cut(mt); }
  else if ((mt = s.match(/ (?:el |para el )?(\d{4})-(\d{1,2})-(\d{1,2}) /))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; found = true; cut(mt); }
  else if ((mt = s.match(/ (?:el |para el )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))? /))) {
    d = +mt[1]; m = +mt[2]; if (mt[3]) y = +mt[3] < 100 ? 2000 + +mt[3] : +mt[3];
    else if (Date.UTC(y, m - 1, d) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) y += 1;
    found = true; cut(mt);
  } else {
    for (let i = 0; i < 7; i++) {
      const re = new RegExp(` (?:el |para el |este )?${dias[i]} `);
      if ((mt = s.match(re))) { let diff = (i - now.getUTCDay() + 7) % 7; if (diff === 0) diff = 7; shift(diff); found = true; cut(mt); break; }
    }
  }
  let h = 8, min = 0, timeFound = false;
  if ((mt = s.match(/ (?:a las |a la )?(\d{1,2})(?::(\d{2}))? ?(am|pm|a\.? ?m\.?|p\.? ?m\.?)? /))) {
    const hh = +mt[1];
    if (hh <= 23 && (mt[2] !== undefined || mt[3] !== undefined || /a las|a la/.test(mt[0]))) {
      h = hh; min = mt[2] ? +mt[2] : 0;
      const suf = (mt[3] || '').replace(/[\s.]/g, '');
      if (suf === 'pm' && h < 12) h += 12;
      if (suf === 'am' && h === 12) h = 0;
      timeFound = true; cut(mt);
    }
  }
  if (!found && !timeFound) return null;
  let at = localToUnix(env, y, m, d, h, min);
  if (!found && at < nowSec()) at += 86400; // "a las 6pm" ya pasó hoy → mañana
  return { at, rest: orig.replace(/\s+/g, ' ').trim() };
}

async function tareasTexto(env: Env): Promise<string> {
  const now = nowSec();
  const tasks = await listTasks(env, { status: 'pending', from: now - 3 * 86400, limit: 30 });
  if (!tasks.length) return 'No tienes tareas pendientes.';
  const lines = ['*Tareas pendientes:*'];
  for (const t of tasks) {
    const when = t.due_at ? (t.due_at < now ? 'vencida' : cuandoTexto(env, t.due_at)) : 'sin fecha';
    lines.push(`#${t.id} · ${t.title}${t.course_short ? ' (' + t.course_short + ')' : ''} · ${when}`);
  }
  lines.push('', 'Responde "listo #" cuando termines una.');
  return lines.join('\n');
}

async function notasTexto(env: Env): Promise<string> {
  const courses = await courseSummaries(env);
  if (!courses.length) return 'Aún no hay asignaturas. Escribe "sincronizar" para traerlas del EVA.';
  const lines = ['*Notas por asignatura:*'];
  for (const c of courses) lines.push(`• ${c.name}: ${c.average ?? 'sin notas'}${c.total ? ` (${c.graded}/${c.total} actividades)` : ''}`);
  const avg = overallAverage(courses);
  if (avg !== null) lines.push('', `Promedio general de actividades: *${avg}*`);
  return lines.join('\n');
}

// Palabras que no ayudan a encontrar una actividad (artículos, verbos de la pregunta, etc.).
const STOP = new Set(('a al como con cual cuales cuanto cuanta de del dime dame el en es esta este fue hola la las lo los me mi mis ' +
  'por para porfa favor que quiero saber se sobre su tengo tuve un una y ya oye rumbo saque saco obtuve puse saber decir ' +
  'nota notas calificacion calificaciones puntuacion puntos puntaje sacaste mire ver').split(' '));

/** Palabras útiles de una pregunta: sin tildes ni signos, sin palabras vacías. */
function keywords(q: string): string[] {
  return normalize(q.replace(/[¿?¡!.,;:"'«»()]/g, ' ')).split(' ').filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

async function notaBuscarTexto(env: Env, query: string): Promise<string> {
  const limpio = query.trim();
  const qTokens = keywords(limpio);
  if (!qTokens.length) return notasTexto(env);
  const all = await allGrades(env);
  if (!all.length) return 'Aún no tengo notas guardadas. Escribe "sincronizar" o agrégalas en la app.';
  // Acepta singular/plural ("foros" ↔ "foro").
  const hit = (hay: string, t: string) => hay.includes(t) || (t.length > 4 && t.endsWith('s') && hay.includes(t.slice(0, -1)));
  const scored = all
    .map((g) => { const hay = normalize(`${g.item} ${g.course}`); return { g, score: qTokens.filter((t) => hit(hay, t)).length }; })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.g.updated_at - a.g.updated_at);
  if (!scored.length) return `No encontré ninguna actividad que coincida con "${limpio}". Escribe "notas" para ver el resumen por asignatura.`;
  const top = scored[0].score;
  const best = scored.filter((x) => x.score === top).slice(0, 6);
  const lines = best.length > 1 ? ['Encontré varias coincidencias:'] : [];
  for (const { g } of best) {
    const val = g.grade === null ? 'sin calificar todavía' : `*${g.grade}* de ${g.grade_max}`;
    lines.push(`${g.item} (${g.course}): ${val}`);
  }
  return lines.join('\n');
}

async function facilitadoresTexto(env: Env, query: string): Promise<string> {
  const courses = await courseSummaries(env);
  if (!courses.length) return 'Aún no tengo tus asignaturas. Escribe "sincronizar" para traerlas del EVA.';
  const who = (c: CourseSummary) => c.facilitator || c.facilitator_eva;
  // Si la pregunta nombra una asignatura, responde solo esa.
  const qTokens = keywords(query).filter((t) => !/^(facilitador|facilitadora|facilitadores|profesor|profesora|profesores|maestro|maestra|docente|tutor|tutora|quien|quienes|asignatura|materia|clase|son|mis)$/.test(t));
  const scored = courses.map((c) => ({ c, score: qTokens.filter((t) => normalize(`${c.name} ${c.short_name || ''} ${c.code || ''}`).includes(t)).length })).sort((a, b) => b.score - a.score);
  if (qTokens.length && scored[0].score > 0) {
    const c = scored[0].c;
    return who(c) ? `Tu facilitador/a de *${c.name}* es *${who(c)}*.` : `El EVA no publica el facilitador de *${c.name}*. Puedes escribirlo en la app (Notas → la asignatura).`;
  }
  const lines = ['*Tus facilitadores:*'];
  for (const c of courses) lines.push(`• ${c.name}: ${who(c) || 'no aparece en el EVA'}`);
  return lines.join('\n');
}

async function entregadasTexto(env: Env): Promise<string> {
  const done = await listTasks(env, { status: 'done', limit: 12 });
  if (!done.length) return 'Todavía no tengo tareas entregadas. Escribe "sincronizar" para revisar el EVA.';
  const lines = ['*Últimas tareas entregadas o cerradas:*'];
  for (const t of done) lines.push(`✓ ${t.title}${t.course_short ? ' (' + t.course_short + ')' : ''}${t.grade !== null ? ` · *${Math.round(t.grade * 100) / 100}/${t.grade_max}*` : t.notes === 'Plazo cerrado en el EVA' ? ' · plazo cerrado' : ' · sin calificar'}`);
  return lines.join('\n');
}

async function pagosTexto(env: Env): Promise<string> {
  const p = await payWindow(env);
  const cierre = fechaCorta(localDate(env, p.closesAt));
  const apertura = fechaCorta(localDate(env, p.opensAt));
  if (p.paid) return `La cuota de ${periodLabel(p.period)} ya está pagada.`;
  if (p.state === 'open') return `La ventana de pago está *abierta*. Cierra el ${cierre} (faltan ${p.daysToClose} días)${p.amount ? '. Monto: RD$ ' + p.amount : ''}.\nCuando pagues, responde "pagué".`;
  return `La próxima ventana de pago abre el ${apertura} (en ${p.daysToOpen} días) y cierra el ${cierre}.`;
}

export async function handleCommand(env: Env, input: string, channel = 'app', opts: { noAi?: boolean } = {}): Promise<string> {
  // Quita signos al principio y al final ("¿Cuánto saqué...?" → "Cuánto saqué...") para que los comandos funcionen igual
  // por texto o por nota de voz transcrita.
  const raw = input.replace(/^[\s¿¡"«]+|[\s?!.»"]+$/g, '');
  const text = normalize(raw.replace(/[¿?¡!,;"«»]/g, ' '));
  const now = nowSec();

  if (!text || /^(hola|menu|ayuda|help|\?|comandos)$/.test(text)) return AYUDA;
  if (/^(hoy|resumen|dia)$/.test(text)) return summaryText(env);
  if (/^(tareas?|pendientes?)$/.test(text)) return tareasTexto(env);
  if (/^(notas?|calificaciones|promedio)$/.test(text)) return notasTexto(env);
  if (/^(facilitador(es|a)?|profesor(es|a)?|docentes?)$/.test(text)) return facilitadoresTexto(env, '');
  if (/^(entregadas?|hechas?|historial)$/.test(text)) return entregadasTexto(env);
  if (/^(pagos?|cuota)$/.test(text)) return pagosTexto(env);

  let mtNota: RegExpMatchArray | null;
  if ((mtNota = raw.match(/^\s*(?:nota|notas|calificaci[oó]n|calificaciones)\s+(?:de|del|en|de la)\s+(.+)$/i))) {
    return notaBuscarTexto(env, mtNota[1]);
  }
  if ((mtNota = text.match(/^(?:cuanto|cual|que)\s+(?:saque|tengo|obtuve|me puse|saco)\s+(?:en|de)\s+(.+)$/))) {
    return notaBuscarTexto(env, mtNota[1]);
  }

  if (/^(ya )?pague\b/.test(text)) {
    const p = await payWindow(env);
    const monto = text.match(/(\d[\d,.]*)/);
    await env.DB.prepare('INSERT INTO payments (period, amount, paid_at, note) VALUES (?, ?, ?, ?)')
      .bind(p.period, monto ? Number(monto[1].replace(/,/g, '')) : (p.amount ? Number(p.amount) : null), now, 'Registrado por WhatsApp').run();
    return `Listo. Registré el pago de la cuota de ${periodLabel(p.period)}. No te enviaré más avisos de este mes.`;
  }

  let mt: RegExpMatchArray | null;
  if ((mt = text.match(/^(listo|lista|hecha|hecho|entregada|entregado|terminada|terminado)\s*#?(\d+)$/))) {
    const id = Number(mt[2]);
    const r = await env.DB.prepare(`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ? AND status = 'pending'`).bind(now, id).run();
    if (!r.meta.changes) return `No encontré una tarea pendiente con el número #${id}. Escribe "tareas" para ver la lista.`;
    const t = await env.DB.prepare('SELECT title FROM tasks WHERE id = ?').bind(id).first<{ title: string }>();
    return `Hecho. Marqué "${t?.title}" como terminada.`;
  }

  if (!env.AI && (mt = raw.match(/^\s*(nueva|nueva tarea|agregar|anotar)\s+(.+)$/i))) {
    const when = parseWhen(env, mt[2]);
    const title = when ? when.rest : mt[2].trim();
    const r = await env.DB.prepare(`INSERT INTO tasks (title, due_at, source, status) VALUES (?, ?, 'manual', 'pending') RETURNING id`)
      .bind(capitalize(title), when?.at ?? null).first<{ id: number }>();
    return `Agregué la tarea #${r?.id}: "${capitalize(title)}"${when ? ' (' + cuandoTexto(env, when.at) + ')' : ''}.`;
  }

  if (!env.AI && (mt = raw.match(/^\s*(recu[eé]rdame|recordar|recordarme|recordatorio)\s+(.+)$/i))) {
    const when = parseWhen(env, mt[2]);
    if (!when) return 'Dime cuándo. Por ejemplo: "recuérdame mañana 6pm entregar el video".';
    const what = when.rest.replace(/^(que |de )/i, '') || 'tu recordatorio';
    await env.DB.prepare('INSERT INTO reminders (text, remind_at) VALUES (?, ?)').bind(capitalize(what), when.at).run();
    const d = localDate(env, when.at);
    return `Listo. Te recordaré "${capitalize(what)}" el ${fechaCorta(d)}, ${horaTexto(d)}`;
  }

  if (/^(sincronizar|sync|actualizar)$/.test(text)) {
    try {
      const r = await syncEva(env);
      return `Sincronicé el EVA: ${r.courses} asignaturas, ${r.tasksNew} tareas nuevas, ${r.tasksUpdated} actualizadas, ${r.tasksClosed} entregadas.`;
    } catch (e) {
      return `No pude conectar con el EVA: ${(e as Error).message}`;
    }
  }

  // Preguntas libres: las responde la IA gratis de Workers AI con tus datos. Si no está disponible,
  // se usan las palabras clave de abajo.
  // Con noAi solo se resuelven los comandos rápidos (la app hace el resto en streaming).
  if (opts.noAi && env.AI) return '';
  const ai = await aiAnswer(env, raw, channel).catch(() => null);
  if (ai) return ai;

  // Lenguaje natural sin IA: busca la intención por palabras clave.
  if (/\b(facilitador|facilitadora|facilitadores|profesor|profesora|profesores|maestro|maestra|docente|tutor|tutora)\b/.test(text)) return facilitadoresTexto(env, raw);
  if (/\b(entregue|entregadas|entregados|entregada|ya hice|hechas|terminadas|complete)\b/.test(text)) return entregadasTexto(env);
  if (/\b(nota|notas|calificacion|calificaciones|saque|saco|obtuve|me puse|puntuacion|puntaje|puntos)\b/.test(text)) return notaBuscarTexto(env, raw);
  if (/\b(pago|pagos|pagar|cuota|mensualidad)\b/.test(text)) return pagosTexto(env);
  if (/\b(tarea|tareas|pendiente|pendientes|entregar|entrega|entregas|vence|vencen|deberes)\b/.test(text)) return tareasTexto(env);
  if (/\b(resumen|hoy|mi dia)\b/.test(text)) return summaryText(env);

  return `No entendí "${raw.trim().slice(0, 60)}".\n\n${AYUDA}`;
}

function capitalize(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
