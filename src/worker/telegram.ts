// Bot de Telegram (gratis, oficial y sin ventana de 24 h): conversa contigo, entiende notas de voz, fotos y PDF,
// y te manda resúmenes y avisos con botones. Solo responde al chat que vinculaste desde Ajustes.
// También guarda la configuración de la app (llaves de /llaves) en D1: así no hace falta `wrangler secret put`.
import type { Env } from './env';
import { forUser, getSetting, getSettings, setSetting, userBySetting } from './db';
import { bestGrades, courseSummaries, dashboard, listTasks, overallAverage, payWindow, periodLabel } from './data';
import { cuandoTexto, fechaCorta, horaTexto, localDate, localToUnix, nowSec } from './time';
import { courseLabel, money } from './wa';
import { handleCommand, keywords, normalize } from './assistant';
import { toBase64 } from './voice';
import { llmComplete } from './llm';
import { courseAverage, neededFor } from '../shared/promedio';

const api = (env: any) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
export const CONFIG_KEYS = [
  { k: "APP_URL", g: "General", l: "Dirección de la app", help: "Ej.: https://rumbo.gestori.workers.dev" },
  { k: "TZ_OFFSET_HOURS", g: "General", l: "Zona horaria (horas respecto a UTC)", help: "República Dominicana: -4" },
  { k: "APP_PASSWORD", g: "General", l: "Contraseña inicial del administrador", secret: true, help: "Solo se usa si el administrador todavía no tiene contraseña propia." },
  { k: "SESSION_SECRET", g: "General", l: "Clave de las sesiones", secret: true, danger: true, help: "Si la cambias, todos (tú incluido) tendrán que volver a entrar." },
  { k: "MOODLE_URL", g: "EVA (Moodle)", l: "Dirección de la EVA", help: "Ej.: https://eva.uapa.edu.do" },
  { k: "MOODLE_TOKEN", g: "EVA (Moodle)", l: "Token de la EVA (del administrador)", secret: true, help: "Cada usuario puede poner el suyo en Ajustes; este es el tuyo." },
  { k: "GROQ_API_KEY", g: "Inteligencia artificial", l: "Groq · clave", secret: true, help: "console.groq.com → API Keys" },
  { k: "GROQ_MODEL", g: "Inteligencia artificial", l: "Groq · modelo (opcional)" },
  { k: "GEMINI_API_KEY", g: "Inteligencia artificial", l: "Gemini · clave", secret: true, help: "aistudio.google.com → Get API key" },
  { k: "GEMINI_MODEL", g: "Inteligencia artificial", l: "Gemini · modelo (opcional)" },
  { k: "NVIDIA_API_KEY", g: "Inteligencia artificial", l: "NVIDIA · clave", secret: true, help: "build.nvidia.com → Get API Key" },
  { k: "NVIDIA_MODEL", g: "Inteligencia artificial", l: "NVIDIA · modelo (opcional)" },
  { k: "CEREBRAS_API_KEY", g: "Inteligencia artificial", l: "Cerebras · clave", secret: true, help: "cloud.cerebras.ai → API Keys" },
  { k: "OPENROUTER_API_KEY", g: "Inteligencia artificial", l: "OpenRouter · clave", secret: true, help: "openrouter.ai → Keys" },
  { k: "AZURE_SPEECH_KEY", g: "Voz del asistente", l: "Azure Speech · clave", secret: true, help: "Voces dominicanas. portal.azure.com → crear «Speech» con precio F0 (gratis) → Keys and Endpoint." },
  { k: "AZURE_SPEECH_REGION", g: "Voz del asistente", l: "Azure Speech · región", help: "La región que sale junto a la clave. Ej.: eastus" },
  { k: "ELEVENLABS_API_KEY", g: "Voz del asistente", l: "ElevenLabs · clave (opcional)", secret: true, help: "elevenlabs.io → API Keys (plan gratis, unas 10 000 letras al mes)" },
  { k: "TELEGRAM_BOT_TOKEN", g: "Telegram", l: "Token del bot", secret: true, tg: true, help: "Se configura en la página de Telegram." },
  { k: "WA_TOKEN", g: "WhatsApp (Meta)", l: "Token de acceso", secret: true },
  { k: "WA_PHONE_NUMBER_ID", g: "WhatsApp (Meta)", l: "ID del número de teléfono" },
  { k: "WA_WABA_ID", g: "WhatsApp (Meta)", l: "ID de la cuenta de WhatsApp Business" },
  { k: "WA_MY_NUMBER", g: "WhatsApp (Meta)", l: "Mi número (con código de país)", help: "Ej.: 18091234567" },
  { k: "WA_VERIFY_TOKEN", g: "WhatsApp (Meta)", l: "Token de verificación del webhook", secret: true },
  { k: "WA_APP_SECRET", g: "WhatsApp (Meta)", l: "Secreto de la app de Meta", secret: true },
  { k: "CALLMEBOT_APIKEY", g: "WhatsApp (CallMeBot)", l: "Clave de CallMeBot", secret: true }
];
export const CONFIG_NAMES = new Set(CONFIG_KEYS.map((x) => x.k));
// Las llaves guardadas en la app (settings cfg:NOMBRE) se leen como mucho una vez por minuto.
let cfgCache: { rows: { key: string; value: string }[] | null; at: number } = { rows: null, at: 0 };
/** Completa el Env con las llaves guardadas en la app (/llaves). Un secreto de Cloudflare se respeta si la app no tiene valor. */
export async function loadAppConfig(env: any): Promise<Env> {
  env.CFG_CF = {};
  env.CFG_SRC = {};
  for (const { k } of CONFIG_KEYS) {
    env.CFG_CF[k] = !!env[k];
    env.CFG_SRC[k] = env[k] ? "cloudflare" : "";
  }
  if (!cfgCache.rows || Date.now() - cfgCache.at > 6e4) {
    const r = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'cfg:%' OR key = 'tg_bot_token'").all().catch(() => ({ results: [] }));
    cfgCache = { rows: r.results || [], at: Date.now() };
  }
  for (const row of cfgCache.rows!) {
    const k = row.key === "tg_bot_token" ? "TELEGRAM_BOT_TOKEN" : row.key.slice(4);
    if (!CONFIG_NAMES.has(k) || !row.value) continue;
    env[k] = row.value;
    env.CFG_SRC[k] = "app";
  }
  if (!env.MOODLE_URL) env.MOODLE_URL = "https://eva.uapa.edu.do";
  env.TG_TOKEN_SOURCE = env.CFG_SRC.TELEGRAM_BOT_TOKEN === "cloudflare" ? "secreto" : env.CFG_SRC.TELEGRAM_BOT_TOKEN || "";
  return env;
}
export const loadTelegramToken = loadAppConfig;
export const resetAppConfig = () => {
  cfgCache = { rows: null, at: 0 };
};
export const resetTelegramToken = resetAppConfig;
export const TG_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
export const telegramReady = (env: any) => !!env.TELEGRAM_BOT_TOKEN;
export async function tgCall<T = any>(env: Env, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${api(env)}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(data.description || `Telegram respondió ${res.status}`);
  return data.result as T;
}
export function toHtml(text: any) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, "$1<i>$2</i>");
}
export type TgKb = Record<string, unknown>[][];
export async function sendTelegram(env: Env, text: string, chatId?: string | number, opts: { html?: boolean; kb?: TgKb } = {}): Promise<{ ok: boolean; error?: string }> {
  const chat = chatId ?? await getSetting(env, "tg_chat_id");
  if (!telegramReady(env) || !chat) return { ok: false, error: "Telegram no está conectado" };
  try {
    const html = opts.html ? text : tgFormat(text);
    const body: Record<string, unknown> = { chat_id: chat, text: html.slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true } };
    if (opts.kb) body.reply_markup = { inline_keyboard: opts.kb };
    await tgCall(env, "sendMessage", body).catch(async (e: any) => {
      if (!/parse|entities|tag/i.test(e.message)) throw e;
      delete body.parse_mode;
      body.text = String(text).replace(/<[^>]+>/g, "").slice(0, 4096);
      await tgCall(env, "sendMessage", body);
    });
    await env.DB.prepare("INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)").bind(env.UID, "out", "telegram", text.slice(0, 4e3)).run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
export async function downloadTelegramFile(env: any, fileId: any) {
  const f = await tgCall(env, "getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Telegram no entregó el archivo.");
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`No pude descargar el archivo (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
function randomHex(bytes: any) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function setupTelegram(env: any, origin: any) {
  const me = await tgCall(env, "getMe");
  let secret = await getSetting(env, "tg_secret");
  if (!secret) {
    secret = randomHex(24);
    await setSetting(env, "tg_secret", secret);
  }
  let code = await getSetting(env, "tg_link_code");
  if (!code) {
    code = randomHex(8);
    await setSetting(env, "tg_link_code", code);
  }
  await tgCall(env, "setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tgMenu(env, origin);
  await setSetting({ ...env, UID: 0 }, "tg_hook_v", "3");
  await tgCall(env, "setMyCommands", { commands: [
    { command: "hoy", description: "Tu resumen del día" },
    { command: "tareas", description: "Entregas pendientes" },
    { command: "notas", description: "Promedio por asignatura" },
    { command: "pagos", description: "Estado de la cuota" },
    { command: "entregadas", description: "Lo último que entregaste" },
    { command: "ayuda", description: "Lo que puedo hacer" }
  ] }).catch(() => {
  });
  await setSetting(env, "tg_username", me.username);
  return { username: me.username, link: `https://t.me/${me.username}?start=${code}`, connected: !!await getSetting(env, "tg_chat_id") };
}
export const tgEsc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const tgAttr = (s: any) => tgEsc(s).replace(/"/g, "&quot;");
export function tgBar(pct: any, n = 10) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const k = Math.round(p / 100 * n);
  return "▰".repeat(k) + "▱".repeat(n - k);
}
export const tgGradeIcon = (v: any) => v === null || v === void 0 ? "⚪" : v >= 90 ? "🟢" : v >= 80 ? "🔵" : v >= 70 ? "🟡" : "🔴";
export const TG_NAV = [
  [{ text: "🏠 Hoy", callback_data: "c:hoy" }, { text: "📝 Tareas", callback_data: "c:tareas" }, { text: "📊 Notas", callback_data: "c:notas" }],
  [{ text: "💳 Pagos", callback_data: "c:pagos" }, { text: "✅ Entregadas", callback_data: "c:entregadas" }, { text: "❔ Ayuda", callback_data: "c:ayuda" }]
];
export const TG_MINI = [[{ text: "🏠 Hoy", callback_data: "c:hoy" }, { text: "📝 Tareas", callback_data: "c:tareas" }, { text: "📊 Notas", callback_data: "c:notas" }]];
export const TG_RULE = "──────────────";
const TG_LINE = "━━━━━━━━━━━━━━";
/** Tarjeta de aviso con el estilo de Rumbo: encabezado, línea fina, cuerpo y pie en cursiva. Todo el contenido ya va escapado. */
export function tgCard(o: { icon: string; title: string; chip?: string; lines: (string | false | null | undefined)[]; foot?: string }) {
  const body = o.lines.filter((x): x is string => x !== false && x !== null && x !== undefined);
  return [`${o.icon} <b>${o.title}</b>${o.chip ? `  <code>${o.chip}</code>` : ""}`, `<code>${TG_LINE}</code>`, ...body, ...(o.foot ? ["", `<i>${o.foot}</i>`] : [])].join("\n");
}
/** Texto suelto → tarjeta: la primera línea es el encabezado y el resto el cuerpo. */
export function tgAuto(text: string) {
  const html = tgFormat(text.trim());
  const i = html.indexOf("\n");
  if (i < 0) return html;
  const head = html.slice(0, i).trim();
  const rest = html.slice(i).replace(/^\n+/, "");
  return `${/<b>/.test(head) ? head : `<b>${head}</b>`}\n<code>${TG_LINE}</code>\n${rest}`;
}
export function tgDayDiff(env: any, dueSec: any) {
  const now = localDate(env), due = localDate(env, dueSec);
  return Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 864e5);
}
export function tgUrg(env: any, t: any, now: any) {
  if (t.due_at === null || t.due_at === void 0) return "⚪";
  if (t.due_at < now) return "🔴";
  const d = tgDayDiff(env, t.due_at);
  return d <= 0 ? "🟠" : d <= 2 ? "🟡" : "🟢";
}
export function tgTaskLine(env: any, t: any, now: any, withId = true) {
  const when = t.due_at === null || t.due_at === void 0 ? "sin fecha" : t.due_at < now ? "venció " + cuandoTexto(env, t.due_at) : cuandoTexto(env, t.due_at);
  const course = t.course_short || t.course_name || "";
  const link = t.url ? ` · <a href="${tgAttr(t.url)}">abrir</a>` : "";
  return `${tgUrg(env, t, now)} <b>${tgEsc(t.title)}</b>${withId ? ` <code>#${t.id}</code>` : ""}
      <i>${tgEsc(course)}${course ? " · " : ""}⏰ ${tgEsc(when)}</i>${link}`;
}
export async function tgHoy(env: any) {
  const d = await dashboard(env);
  const now = nowSec();
  const hr = localDate(env).getUTCHours();
  const [ico, saludo] = hr < 12 ? ["☀\uFE0F", "Buenos días"] : hr < 19 ? ["🌤\uFE0F", "Buenas tardes"] : ["🌙", "Buenas noches"];
  const out = [`${ico} <b>${saludo}${d.name ? ", " + tgEsc(d.name) : ""}</b>`, `<i>${tgEsc(d.today)}</i>`, ""];
  out.push(`📌 Hoy <b>${d.counts.today}</b>   📅 Semana <b>${d.counts.week}</b>   ${d.counts.overdue ? "⚠\uFE0F" : "✅"} Vencidas <b>${d.counts.overdue}</b>`);
  const wp = d.weekProgress || { total: 0, done: 0 };
  if (wp.total) out.push(`🎯 Semana <code>${tgBar(wp.done / wp.total * 100)}</code> ${wp.done}/${wp.total}`);
  out.push("", TG_RULE);
  const overdue = d.tasks.filter((t) => t.due_at !== null && t.due_at < now);
  const upcoming = d.tasks.filter((t) => t.due_at === null || t.due_at >= now);
  if (overdue.length) {
    out.push("", "🚨 <b>Vencidas sin marcar</b>");
    overdue.slice(0, 4).forEach((t) => out.push(tgTaskLine(env, t, now)));
  }
  out.push("", "📝 <b>Lo que viene</b>");
  if (upcoming.length) upcoming.slice(0, 6).forEach((t) => out.push(tgTaskLine(env, t, now)));
  else out.push("<i>Nada pendiente. ¡Buen trabajo! 🎉</i>");
  const p = d.pay;
  out.push("", TG_RULE, "");
  if (p.paid) out.push(`💳 <b>Cuota</b> · ${tgEsc(periodLabel(p.period))} pagada ✅`);
  else if (p.state === "open") out.push(`💳 <b>Cuota</b> · ventana abierta, cierra en <b>${p.daysToClose} día${p.daysToClose === 1 ? "" : "s"}</b>${p.amount ? ` · ${tgEsc(money(p.amount))}` : ""}`);
  else if (p.daysToOpen <= 7) out.push(`💳 <b>Cuota</b> · abre en ${p.daysToOpen} día${p.daysToOpen === 1 ? "" : "s"}`);
  if (d.average !== null) out.push(`📊 <b>Promedio</b> ${tgGradeIcon(d.average)} <b>${d.average}</b>  <code>${tgBar(d.average)}</code>`);
  return { html: out.join("\n").replace(/\n{3,}/g, "\n\n"), kb: TG_NAV };
}
export async function tgTareas(env: any) {
  const now = nowSec();
  const tasks = await listTasks(env, { status: "pending", from: now - 3 * 86400, limit: 30 });
  if (!tasks.length) return { html: "🎉 <b>¡Sin tareas pendientes!</b>\n\n<i>Disfruta el descanso. Te aviso cuando salga algo nuevo.</i>", kb: TG_NAV };
  const groups: [string, any[]][] = [["🚨 Vencidas", []], ["🟠 Hoy", []], ["🟡 Mañana", []], ["📅 Esta semana", []], ["🗓\uFE0F Más adelante", []], ["⚪ Sin fecha", []]];
  for (const t of tasks) {
    if (t.due_at === null) groups[5][1].push(t);
    else if (t.due_at < now) groups[0][1].push(t);
    else {
      const dd = tgDayDiff(env, t.due_at);
      groups[dd <= 0 ? 1 : dd === 1 ? 2 : dd < 7 ? 3 : 4][1].push(t);
    }
  }
  const out = [`📝 <b>Tareas pendientes</b> · ${tasks.length}`];
  for (const [title, list] of groups) {
    if (!list.length) continue;
    out.push("", `<b>${title}</b>`);
    list.forEach((t) => out.push(tgTaskLine(env, t, now).replace(/^\S+ /, "• ")));
  }
  out.push("", "<i>Toca ✅ cuando entregues una.</i>");
  const btns = tasks.slice(0, 9).map((t) => ({ text: `✅ #${t.id}`, callback_data: `d:${t.id}` }));
  const rows = [];
  for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
  return { html: out.join("\n"), kb: [...rows, ...TG_NAV] };
}
export async function tgNotas(env: any) {
  const courses = await courseSummaries(env);
  if (!courses.length) return { html: "📚 <b>Aún no hay asignaturas</b>\n\nEscríbeme <code>sincronizar</code> para traerlas del EVA.", kb: TG_NAV };
  const out = ["📊 <b>Notas por asignatura</b>", ""];
  for (const c of courses) {
    out.push(`${tgGradeIcon(c.average)} <b>${tgEsc(c.name)}</b>`);
    out.push(c.average === null ? "      <i>sin notas todavía</i>" : `      <code>${tgBar(c.average)}</code> <b>${c.average}</b>${c.total ? ` <i>· ${c.graded}/${c.total} actividades</i>` : ""}`);
  }
  const avg = overallAverage(courses);
  if (avg !== null) out.push("", `<blockquote>🎓 <b>Promedio general: ${avg}</b>
<code>${tgBar(avg, 14)}</code></blockquote>`);
  out.push("<i>🟢 90+ · 🔵 80+ · 🟡 70+ · 🔴 menos de 70</i>");
  return { html: out.join("\n"), kb: TG_NAV };
}
export async function tgPagos(env: any) {
  const p = await payWindow(env);
  const cierre = fechaCorta(localDate(env, p.closesAt));
  const apertura = fechaCorta(localDate(env, p.opensAt));
  let html;
  let kb = TG_NAV;
  if (p.paid) html = `✅ <b>Cuota de ${tgEsc(periodLabel(p.period))} pagada</b>

<i>No te enviaré más avisos de pago este período.</i>`;
  else if (p.state === "open") {
    html = `💳 <b>Ventana de pago abierta</b>

<blockquote>🗓\uFE0F Cierra: <b>${tgEsc(cierre)}</b>
⏳ Faltan: <b>${p.daysToClose} día${p.daysToClose === 1 ? "" : "s"}</b>${p.amount ? `
💵 Monto: <b>${tgEsc(money(p.amount))}</b>` : ""}</blockquote>
<i>Cuando pagues, toca el botón y dejo de recordarte.</i>`;
    kb = [[{ text: "💵 Ya pagué", callback_data: "c:pague" }], ...TG_NAV];
  } else html = `📆 <b>Próxima ventana de pago</b>

<blockquote>🟢 Abre: <b>${tgEsc(apertura)}</b> <i>(en ${p.daysToOpen} día${p.daysToOpen === 1 ? "" : "s"})</i>
🔴 Cierra: <b>${tgEsc(cierre)}</b></blockquote>`;
  return { html, kb };
}
export async function tgEntregadas(env: any) {
  const done = await listTasks(env, { status: "done", limit: 12 });
  if (!done.length) return { html: "📭 <b>Todavía no hay entregas</b>\n\nEscríbeme <code>sincronizar</code> para revisar el EVA.", kb: TG_NAV };
  const out = ["✅ <b>Últimas entregas</b>", ""];
  for (const t of done) {
    const g = t.grade !== null && t.grade !== void 0 ? ` · ${tgGradeIcon(t.grade / (t.grade_max || 100) * 100)} <b>${Math.round(t.grade * 100) / 100}/${t.grade_max}</b>` : t.notes === "Plazo cerrado en el EVA" ? " · <i>plazo cerrado</i>" : " · <i>sin nota aún</i>";
    out.push(`• <b>${tgEsc(t.title)}</b>
      <i>${tgEsc(t.course_short || t.course_name || "")}</i>${g}`);
  }
  return { html: out.join("\n"), kb: TG_NAV };
}
export function tgAyuda() {
  return { html: `🧭 <b>Rumbo en Telegram</b>
<i>Tu trimestre, en un chat.</i>

<b>Toca un botón</b> o escríbeme como a una persona:

<blockquote expandable>🏠 <code>hoy</code> — tu resumen del día
📝 <code>tareas</code> — entregas pendientes
📊 <code>notas</code> — promedio por asignatura
💳 <code>pagos</code> — estado de la cuota
✅ <code>entregadas</code> — lo último que entregaste
👨\u200D🏫 <code>facilitadores</code> — quién da cada materia
🔄 <code>sincronizar</code> — traer lo nuevo del EVA</blockquote>

<b>Acciones rápidas</b>
<blockquote expandable>✅ <code>listo 12</code> — marcar la tarea #12 como hecha
➕ <code>nueva</code> Informe mañana 18:00 — agregar tarea
⏰ <code>recuérdame</code> mañana 6pm entregar el video
🔎 <code>nota de</code> examen final — buscar una nota
💵 <code>pagué</code> — registrar el pago
🧮 <code>necesito 80 cálculo</code> — cuánto te falta sacar
📆 <code>semana</code> — el cierre de tu semana</blockquote>

<b>Mándame archivos</b>
<blockquote expandable>📸 <b>Una foto</b> de la pizarra, apuntes o un ejercicio: te lo explico o lo resuelvo
📄 <b>Un PDF</b>: te hago el resumen y 5 preguntas de repaso
✍\uFE0F Escribe una pregunta en el pie de la foto o del PDF para algo puntual</blockquote>

🎤 <b>Nota de voz:</b> <i>«ponme el foro de ética para el viernes en la tarde»</i>
📞 <b>Llamada:</b> toca <i>Llamar a Rumbo</i> y habla como en una llamada`, kb: TG_NAV };
}
export async function tgRich(env: any, input: any): Promise<any> {
  const r: any = await tgRich0(env, input);
  return r && r.noApp ? r : tgWithApp(env, r);
}
export async function tgRich0(env: any, input: any) {
  const t = normalize(String(input || "").replace(/^\//, "").replace(/@\w+$/, "").replace(/[¿?¡!,;.]/g, " "));
  let mn;
  if (mn = t.match(/^(?:cuanto\s+)?necesito(?:\s+(?:sacar|para|un|una|llegar a|tener))*\s+(\d{1,3})(?:\s+(?:en|de|para))?\s*(.*)$/)) return tgNecesito(env, mn[1], mn[2]);
  if (/^(calculadora|necesito)$/.test(t)) return tgNecesito(env, 70, "");
  if (/^(semana|cierre|cierre de semana|resumen semanal)$/.test(t)) return tgSemana(env);
  if (mn = t.match(/^(?:whatsapp|wa|ws)(?:\s+(on|off|activar|desactivar|prender|apagar|encender))?$/)) {
    if (mn[1]) await setSetting(env, "wa_enabled", /^(on|activar|prender|encender)$/.test(mn[1]) ? "1" : "0");
    const on = await getSetting(env, "wa_enabled", "1") !== "0";
    return { html: on ? "🟢 <b>WhatsApp activado</b>\n\nTe llegan los avisos también por WhatsApp." : "⚪ <b>WhatsApp apagado</b>\n\nSolo te aviso por Telegram y notificaciones de la app.", kb: [[{ text: on ? "⏸\uFE0F Apagar WhatsApp" : "▶\uFE0F Activar WhatsApp", callback_data: on ? "c:whatsapp off" : "c:whatsapp on" }], ...TG_MINI] };
  }
  if (/^(llamar|llamada|llamame|voz|hablar)$/.test(t)) return tgLlamar(env);
  if (/^(hoy|resumen|dia)$/.test(t)) return tgHoy(env);
  if (/^(tareas?|pendientes?)$/.test(t)) return tgTareas(env);
  if (/^(notas?|calificaciones|promedio)$/.test(t)) return tgNotas(env);
  if (/^(pagos?|cuota)$/.test(t)) return tgPagos(env);
  if (/^(entregadas?|hechas?|historial)$/.test(t)) return tgEntregadas(env);
  if (!t || /^(hola|menu|ayuda|help|comandos|start)$/.test(t)) return tgAyuda();
  return null;
}
export function tgFormat(text: any) {
  let s = tgEsc(text);
  const code: string[] = [];
  s = s.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => (code.push(`<pre>${c.trim()}</pre>`), `\0${code.length - 1}\0`));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => (code.push(`<code>${c}</code>`), `\0${code.length - 1}\0`));
  s = s.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\|\|([^|\n]+)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/gm, "$1<i>$2</i>");
  s = s.replace(/(^|\s)~([^~\n]+)~(?=\s|$|[.,;:!?])/g, "$1<s>$2</s>");
  s = s.replace(/^[-*]\s+/gm, "• ");
  s = s.replace(/(^&gt; .*(?:\n&gt; .*)*)/gm, (blk) => `<blockquote>${blk.replace(/^&gt; /gm, "")}</blockquote>`);
  s = s.replace(/\0(\d+)\0/g, (_, i) => code[Number(i)]);
  return s;
}
export async function tgEdit(env: any, chat: any, msgId: any, html: any, kb: any) {
  return tgCall(env, "editMessageText", { chat_id: chat, message_id: msgId, text: html.slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: kb ? { inline_keyboard: kb } : void 0 }).catch((e) => {
    if (!/not modified/i.test(e.message)) throw e;
  });
}
export async function answerTelegramCallback(sys: any, cq: any) {
  const chat = String(cq.message?.chat?.id || "");
  const ack = (text = "", alert = false) => tgCall(sys, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {
  });
  const uid = chat && await userBySetting(sys, "tg_chat_id", chat);
  if (!uid) return ack("Primero vincula tu cuenta desde la app.", true);
  const env = await forUser(sys, uid);
  const data = String(cq.data || "");
  const msgId = cq.message.message_id;
  try {
    if (data.startsWith("d:")) {
      const res = await handleCommand(env, "listo " + data.slice(2), "telegram");
      const ok = /^Hecho/.test(res);
      await ack(ok ? "✅ ¡Marcada como hecha!" : res.slice(0, 190), !ok);
      const r = await tgTareas(env);
      await tgEdit(env, chat, msgId, r.html, r.kb);
      return;
    }
    if (data === "x") return ack();
    if (data.startsWith("dr:")) {
      const res = await handleCommand(env, "listo " + data.slice(3), "telegram");
      const ok = /^Hecho/.test(res);
      await ack(ok ? "✅ ¡Marcada como hecha!" : res.slice(0, 190), !ok);
      await tgCall(env, "editMessageReplyMarkup", { chat_id: chat, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: ok ? "✅ Entregada" : "ℹ\uFE0F Ya estaba marcada", callback_data: "x" }]] } }).catch(() => {
      });
      return;
    }
    if (data.startsWith("s:")) {
      const [, id, kind] = data.split(":");
      const t = await env.DB.prepare("SELECT title, due_at FROM tasks WHERE id = ? AND user_id = ?").bind(Number(id), env.UID).first<{ title: string; due_at: number | null }>();
      if (!t) return ack("No encontré esa tarea.", true);
      const at = tgSnoozeAt(env, kind);
      await env.DB.prepare("INSERT INTO reminders (user_id, text, remind_at) VALUES (?, ?, ?)").bind(env.UID, `📌 ${t.title}${t.due_at ? " · vence " + cuandoTexto(env, t.due_at) : ""}`, at).run();
      const when = horaTexto(localDate(env, at));
      await ack(`⏰ Te aviso a las ${when}`);
      await tgCall(env, "editMessageReplyMarkup", { chat_id: chat, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: `⏰ Te aviso a las ${when}`, callback_data: "x" }], [{ text: "✅ Ya la entregué", callback_data: `dr:${id}` }]] } }).catch(() => {
      });
      return;
    }
    if (data === "c:pague") {
      await handleCommand(env, "pague", "telegram");
      await ack("💵 Pago registrado");
      const r = await tgPagos(env);
      await tgEdit(env, chat, msgId, r.html, r.kb);
      return;
    }
    if (data.startsWith("c:")) {
      await ack();
      const r = await tgRich(env, data.slice(2));
      if (r) await tgEdit(env, chat, msgId, r.html, r.kb);
      return;
    }
    await ack();
  } catch (e) {
    await ack("No pude hacerlo: " + String((e as Error).message || e).slice(0, 150), true);
  }
}
export async function tgMenu(env: any, base: any) {
  if (!/^https:/.test(base || "")) return;
  await tgCall(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "Abrir Rumbo", web_app: { url: `${base}/?go=inicio` } } }).catch(() => {
  });
  await tgCall(env, "setMyCommands", { commands: [
    { command: "hoy", description: "Tu resumen del día" },
    { command: "tareas", description: "Entregas pendientes" },
    { command: "notas", description: "Promedio por asignatura" },
    { command: "pagos", description: "Estado de la cuota" },
    { command: "semana", description: "Cierre de tu semana" },
    { command: "necesito", description: "Cuánto te falta para una nota" },
    { command: "llamar", description: "Hablar con Rumbo por voz" },
    { command: "ayuda", description: "Todo lo que puedo hacer" }
  ] }).catch(() => {
  });
}
export async function ensureTgWebhook(env: any, origin?: string) {
  if (!telegramReady(env)) return;
  const sys = { ...env, UID: 0 };
  if (await getSetting(sys, "tg_hook_v") === "3") return;
  const secret = await getSetting(sys, "tg_secret");
  const base = (origin || env.APP_URL || await getSetting(sys, "app_origin") || "").replace(/\/$/, "");
  if (!secret || !base) return;
  await tgCall(env, "setWebhook", { url: `${base}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"] });
  await tgMenu(env, base);
  await setSetting(sys, "tg_hook_v", "3");
}
export const tgOrigin = (env: any) => /^https:\/\//.test(env.APP_URL || "") ? env.APP_URL.replace(/\/$/, "") : "";
export function tgAppRow(env: any) {
  const o = tgOrigin(env);
  return o ? [[{ text: "📱 Abrir Rumbo", web_app: { url: `${o}/?go=inicio` } }, { text: "📞 Llamar a Rumbo", web_app: { url: `${o}/?go=llamada` } }]] : [];
}
export const tgWithApp = (env: any, r: any) => r ? { ...r, kb: [...r.kb || [], ...tgAppRow(env)] } : r;
export function tgLlamar(env: any) {
  const o = tgOrigin(env);
  if (!o) return { html: "📞 Para llamar a Rumbo, abre la app → <b>Asistente</b> → botón del micrófono.", kb: TG_MINI };
  return { html: `📞 <b>Habla con Rumbo por voz</b>

Toca <b>Llamar a Rumbo</b>: se abre dentro de Telegram y conversas como en una llamada. Cuando te calles, te responde con voz.

<i>La primera vez, Telegram te pedirá permiso para el micrófono.</i>

🎤 ¿Prefieres notas de voz? Mantén presionado el micrófono de Telegram y háblame: «ponme el foro de ética para el viernes».`, kb: [[{ text: "📞 Llamar a Rumbo", web_app: { url: `${o}/?go=llamada` } }], [{ text: "📱 Abrir Rumbo", web_app: { url: `${o}/?go=inicio` } }]], noApp: true };
}
export async function tgNecesito(env: any, target: any, query: any) {
  const courses = await courseSummaries(env);
  if (!courses.length) return { html: "📚 Aún no tengo tus asignaturas. Escríbeme <code>sincronizar</code>.", kb: TG_MINI };
  const goal = Math.max(1, Math.min(100, Number(target) || 70));
  // Mismo cálculo que el simulador de Notas (src/shared/promedio.ts): pesos del EVA y sin lo quitado.
  const calc = async (c: any) => {
    const rows = await bestGrades(env, c.id);
    if (!rows.length) return { c, msg: "sin actividades todavía" };
    const a = courseAverage(rows);
    const need = neededFor(rows, goal);
    if (need === null) return { c, done: true, now: c.average };
    return { c, need: Math.round(need * 10) / 10, left: a.total - a.graded };
  };
  const words = keywords(query || "");
  let list = courses;
  if (words.length) {
    const scored = courses.map((c) => ({ c, s: words.filter((w) => normalize(`${c.name} ${c.short_name || ""} ${c.code || ""}`).includes(w)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (scored.length) list = [scored[0].c];
  }
  const res: any[] = await Promise.all(list.map(calc));
  const out = [`🧮 <b>¿Cuánto necesito para ${goal}?</b>`, ""];
  for (const r of res) {
    out.push(`<b>${tgEsc(r.c.name)}</b>${r.c.average !== null ? ` · vas con <b>${r.c.average}</b>` : ""}`);
    if (r.msg) out.push(`      <i>${r.msg}</i>`);
    else if (r.done) out.push(`      <i>Ya no quedan actividades por calificar.</i> ${r.now !== null && r.now >= goal ? "✅" : "❌"}`);
    else if (r.need <= 0) out.push(`      ✅ <b>Ya lo tienes asegurado</b>, aunque saques 0 en lo que queda.`);
    else if (r.need > 100) out.push(`      🔴 Necesitarías <b>${r.need}</b> en promedio: <i>no alcanza ${r.left === 1 ? "con la actividad que queda" : `con las ${r.left} actividades que quedan`}</i>.`);
    else out.push(`      ${r.need >= 90 ? "🟠" : r.need >= 75 ? "🟡" : "🟢"} Necesitas <b>${r.need}</b> ${r.left === 1 ? "en la actividad que falta" : `de promedio en las <b>${r.left}</b> actividades que faltan`}.`);
  }
  if (!words.length) out.push("", `<i>Para una sola materia: <code>necesito 85 cálculo</code></i>`);
  return { html: out.join("\n"), kb: TG_MINI };
}
export async function tgSemana(env: Env) {
  const now = nowSec(), weekAgo = now - 7 * 86400;
  const s = await getSettings(env);
  const { results: done } = await env.DB.prepare(`SELECT t.title, c.short_name AS course FROM tasks t LEFT JOIN courses c ON c.id = t.course_id WHERE t.user_id = ? AND t.status = 'done' AND COALESCE(t.submitted_at, t.updated_at) >= ? ORDER BY COALESCE(t.submitted_at, t.updated_at) DESC LIMIT 20`).bind(env.UID, weekAgo).all<any>();
  const { results: grades } = await env.DB.prepare(`SELECT g.item_name, g.grade, g.grade_max, c.short_name AS course, c.name AS course_name FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.user_id = ? AND g.grade IS NOT NULL AND g.grade_max > 0 AND g.updated_at >= ? ORDER BY g.updated_at DESC LIMIT 10`).bind(env.UID, weekAgo).all<any>();
  const next = await listTasks(env, { status: "pending", from: now, to: now + 7 * 86400, limit: 30 });
  const courses = await courseSummaries(env);
  const withAvg = courses.filter((c) => c.average !== null).sort((a, b) => a.average! - b.average!);
  const name = (s.student_name || "").split(" ")[0];
  const out = [`📆 <b>Cierre de la semana${name ? ", " + tgEsc(name) : ""}</b>`, ""];
  out.push(`✅ Entregaste <b>${done.length}</b> ${done.length === 1 ? "tarea" : "tareas"}`);
  if (grades.length) {
    const avg = Math.round(grades.reduce((a, g) => a + g.grade / g.grade_max * 100, 0) / grades.length * 10) / 10;
    out.push(`📊 <b>${grades.length}</b> nota${grades.length === 1 ? "" : "s"} nueva${grades.length === 1 ? "" : "s"} · promedio ${tgGradeIcon(avg)} <b>${avg}</b>`);
    out.push(`<blockquote expandable>${grades.map((g) => `${tgGradeIcon(g.grade / g.grade_max * 100)} ${tgEsc(g.item_name)} · <b>${Math.round(g.grade * 100) / 100}/${g.grade_max}</b> <i>${tgEsc(g.course || g.course_name || "")}</i>`).join("\n")}</blockquote>`);
  } else out.push("📊 Sin notas nuevas esta semana");
  if (withAvg.length) {
    const best = withAvg[withAvg.length - 1], low = withAvg[0];
    out.push("", `🏆 Tu mejor materia: <b>${tgEsc(best.name)}</b> (${best.average})`);
    if (low !== best && low.average! < 80) out.push(`💪 Para reforzar: <b>${tgEsc(low.name)}</b> (${low.average})`);
  }
  out.push("", `🗓\uFE0F <b>La próxima semana</b> · ${next.length} entrega${next.length === 1 ? "" : "s"}`);
  next.slice(0, 5).forEach((t) => out.push(tgTaskLine(env, t, now, false)));
  if (!next.length) out.push("<i>Nada por ahora. Buen momento para adelantar 😌</i>");
  out.push("", done.length >= 3 ? "<i>¡Gran semana! Sigue así 🔥</i>" : "<i>Nueva semana, nuevo arranque. Tú puedes 💪</i>");
  const plain2 = out.join("\n").replace(/<blockquote[^>]*>/g, "").replace(/<\/blockquote>/g, "").replace(/<b>|<\/b>/g, "*").replace(/<i>|<\/i>/g, "_").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { html: out.join("\n").replace(/\n{3,}/g, "\n\n"), kb: [[{ text: "📝 Ver tareas", callback_data: "c:tareas" }, { text: "📊 Ver notas", callback_data: "c:notas" }]], plain: plain2, short: `${done.length} entregadas · ${next.length} para la próxima semana` };
}
export async function visionAnswer(env: any, bytes: any, mime: any, question: any) {
  const b64 = toBase64(bytes);
  const prompt = `Eres Rumbo, el asistente de estudio de un estudiante universitario de la UAPA (República Dominicana). Responde en español, claro y en pocas líneas, con viñetas si ayudan.
${question ? `El estudiante pregunta: «${question}»` : "Explica qué hay en la imagen. Si es un ejercicio o problema, resuélvelo paso a paso. Si son apuntes o una pizarra, haz un resumen ordenado. Si es un horario o calendario, extrae fechas y tareas."}
Usa *negritas* para lo importante.`;
  const tries = [];
  if (env.GEMINI_API_KEY) tries.push({ url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: env.GEMINI_API_KEY, model: env.GEMINI_VISION_MODEL || "gemini-2.5-flash" });
  if (env.GROQ_API_KEY) tries.push({ url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, model: "meta-llama/llama-4-scout-17b-16e-instruct" });
  if (env.OPENROUTER_API_KEY) tries.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: env.OPENROUTER_API_KEY, model: "google/gemini-2.0-flash-exp:free" });
  let lastErr = "";
  for (const t of tries) {
    try {
      const res = await fetch(t.url, { method: "POST", headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: t.model, max_tokens: 900, temperature: 0.3, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }] }] }) });
      const j: any = await res.json().catch(() => ({}));
      const txt = j.choices?.[0]?.message?.content;
      if (res.ok && txt) return txt;
      lastErr = j.error?.message || `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  if (env.AI) {
    try {
      const img = [...bytes];
      let out = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt, image: img, max_tokens: 800 }).catch(async (e: any) => {
        if (!/agree|license/i.test(e.message)) throw e;
        await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" });
        return env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt, image: img, max_tokens: 800 });
      });
      if (out?.response) return out.response;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr || "No hay un motor de IA con visión configurado (pon una clave de Gemini o Groq en /llaves).");
}
export async function pdfAnswer(env: any, bytes: any, fileName: any, question: any) {
  if (!env.AI?.toMarkdown) throw new Error("Falta Workers AI para leer PDF.");
  const conv = await env.AI.toMarkdown([{ name: fileName || "documento.pdf", blob: new Blob([bytes], { type: "application/pdf" }) }]);
  const md = String((Array.isArray(conv) ? conv[0] : conv)?.data || "").trim();
  if (md.length < 40) throw new Error("No pude leer texto en ese PDF (puede ser una imagen escaneada). Mándamelo como foto.");
  const doc = md.slice(0, 24e3);
  const ask = question ? `Responde esta pregunta sobre el documento: «${question}». Luego, en 3 viñetas, lo más importante.` : `Haz esto:
1. *Resumen* en 5 a 8 viñetas cortas.
2. *Ideas clave*: 3 conceptos con su definición en una línea.
3. *Preguntas de repaso*: 5 preguntas numeradas; después de cada una escribe la respuesta corta entre || y || (por ejemplo: 1. ¿Qué es X? ||Es Y||).`;
  const text = await llmComplete(env, [
    { role: "system", content: "Eres Rumbo, asistente de estudio de un estudiante de la UAPA. Respondes en español dominicano neutro, claro y ordenado. Usa *negritas* para títulos y conceptos. No inventes datos que no estén en el documento." },
    { role: "user", content: `${ask}

DOCUMENTO «${fileName || "documento"}»${md.length > doc.length ? " (recortado)" : ""}:
${doc}` }
  ], { maxTokens: 1100, temperature: 0.3 });
  return { text, pages: (md.match(/\f/g) || []).length };
}
export function tgGradeCard(env: any, g: any, changed: any, cheer: any, courseAvg: any) {
  const pct = g.max ? g.grade / g.max * 100 : null;
  const fmt22 = (n: any) => Math.round(Number(n) * 100) / 100;
  const lines = [`${tgGradeIcon(pct)} <b>${changed ? "Te cambiaron una nota" : "¡Te calificaron!"}</b>`, `<code>${TG_LINE}</code>`, `<b>${tgEsc(g.item)}</b>`, `📚 <i>${tgEsc(courseLabel(g.course))}</i>`, "", `📊 <b>${fmt22(g.grade)}/${fmt22(g.max)}</b>${changed && g.prev !== void 0 && g.prev !== null ? ` <i>(antes ${fmt22(g.prev)})</i>` : ""}`];
  if (pct !== null) lines.push(`<code>${tgBar(pct, 12)}</code> ${Math.round(pct)}%`);
  if (courseAvg !== null && courseAvg !== void 0) lines.push(`📈 Promedio de la materia: <b>${courseAvg}</b>`);
  if (g.feedback) lines.push("", `💬 <i>Comentario del facilitador:</i>`, `<blockquote expandable>${tgEsc(g.feedback.slice(0, 900))}</blockquote>`);
  if (cheer) lines.push("", `<i>${tgEsc(cheer)}</i>`);
  return lines.join("\n");
}
export function tgSnoozeAt(env: any, kind: any) {
  const now = nowSec();
  if (kind === "1h") return now + 3600;
  if (kind === "3h") return now + 3 * 3600;
  const d = localDate(env);
  let at = localToUnix(env, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 20, 0);
  if (at <= now + 900) at = now + 3600;
  return at;

}
