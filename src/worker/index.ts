import { Hono } from 'hono';
import type { Env } from './env';
import { checkPassword, clearSessionCookie, createSessionCookie, hashPassword, randomHex, safeEqual, sessionUser, verifyMetaSignature } from './auth';
import { GRADE_IGNORED_SQL, bestGrades, courseAverage, courseSummaries, dashboard, indexTrend, listTasks, payWindow, summaryAlert, summaryShort, summaryText, weekStory } from './data';
import { blocks } from './wa';
import { DEFAULT_SETTINGS, activeUsers, forUser, getSetting, getSettings, markSent, setSetting, userBySetting } from './db';
import { classifyNews, cleanNewsText, syncEva } from './moodle';
import { CALLMEBOT_ACTIVATE, CALLMEBOT_NUMBER, sendCallMeBot, GRAPH, waServerReady, callmebotConfigured, logInbound, sendToMe, sendWhatsApp, waChatLink, waConfigured, waWindowOpen } from './notify';
import { sendPushAll, vapidPublicKey } from './push';
import { transcribeAudio, transcribeWhatsAppAudio } from './voice';
import {
  CONFIG_KEYS, CONFIG_NAMES, TG_MINI, TG_TOKEN_RE, answerTelegramCallback, downloadTelegramFile, ensureTgWebhook, loadTelegramToken, pdfAnswer,
  resetAppConfig, resetTelegramToken, sendTelegram, setupTelegram, telegramReady, tgAyuda, tgCall, tgEsc, tgFormat, tgRich, visionAnswer,
} from './telegram';
import { RumboLive, notifyLive, tgVerifyInitData } from './live';
import { EXPORT_PAGE, KEYS_PAGE, TELEGRAM_PAGE } from './pages';
import { calendarIcs } from './calendar';
import { WIDGET_VERSION, widgetData } from './widget';
import { dumpData, gunzip, listBackups, makeBackup } from './backup';
import { study, type StudyMode } from './study';
import { achievements } from './achievements';
import { CHANGELOG, announceRelease } from './changelog';
import { CAREERS, findCareer } from './pensums';
import { handleCommand } from './assistant';
import { aiStream, getMemory, setMemory } from './ai';
import { providers, testEngines } from './llm';
import { runScheduled } from './cron';
import { weeklyPlan } from './plan';
import { cuandoTexto, localDate, localToUnix, nowSec } from './time';
import { setIgnored } from './ignore';
import { registerExtras } from './extras';

const app = new Hono<{ Bindings: Env }>();

// ---------- Salud y sesión ----------
app.get('/api/health', (c) => c.json({ ok: true }));
// Versión publicada: la app web y la app del widget la consultan para actualizarse solas.
app.get('/api/version', (c) => c.json({ app: CHANGELOG[0].version, widget: WIDGET_VERSION, apk: `${new URL(c.req.url).origin}/rumbo-widget.apk?v=${WIDGET_VERSION}` }, 200, { 'Cache-Control': 'no-store' }));

// Páginas sueltas (pages.ts): guía del bot de Telegram, llaves y configuración, y descarga de la app.
// Cada una pide sesión a la API cuando la necesita; la página en sí es pública.
const noStore = { 'Cache-Control': 'no-store' };
app.get('/telegram', (c) => c.html(TELEGRAM_PAGE, 200, noStore));
app.get('/api/telegram/guia', (c) => c.html(TELEGRAM_PAGE, 200, noStore));
app.get('/exportar', (c) => c.html(EXPORT_PAGE, 200, noStore));
app.get('/api/exportar', (c) => c.html(EXPORT_PAGE, 200, noStore));
app.get('/llaves', (c) => c.html(KEYS_PAGE, 200, noStore));
app.get('/api/llaves', (c) => c.html(KEYS_PAGE, 200, noStore));

app.post('/api/login', async (c) => {
  const { password, login } = await c.req.json<{ password?: string; login?: string }>().catch(() => ({ password: '', login: '' }));
  if (!c.env.SESSION_SECRET) return c.json({ error: 'Falta el secreto SESSION_SECRET en el servidor.' }, 500);
  // Protección contra quien intente adivinar la contraseña: 5 intentos fallidos = 15 minutos bloqueado.
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const since = nowSec() - 15 * 60;
  const fails = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?').bind(ip, since).first<{ n: number }>().catch(() => null))?.n || 0;
  if (fails >= 5) return c.json({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo otra vez.' }, 429);
  // Usuario: matrícula o nombre de usuario. Vacío = el dueño (usuario 1), como antes del multiusuario.
  const who = normLogin(login || '');
  const user = await c.env.DB.prepare(`SELECT id, role, active, pass_hash, pass_salt FROM users WHERE ${who ? 'login = ?' : 'id = 1'}`).bind(...(who ? [who] : []))
    .first<{ id: number; role: 'admin' | 'user'; active: number; pass_hash: string | null; pass_salt: string | null }>();
  if (!user || !user.active || !(await checkPassword(c.env, user, password || ''))) {
    await c.env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, nowSec()).run().catch(() => {});
    if (user && fails + 1 >= 5) await sendToMe(await forUser(c.env, user.id, user.role), blocks('🔐 *Bloqueé intentos de entrar a tu cuenta*', 'Alguien escribió mal tu contraseña *5 veces*. Quedó bloqueado 15 minutos.', '_Si fuiste tú, espera un rato. Si no, cambia tu contraseña en Ajustes → Mi cuenta._'), { title: '🔐 Intentos fallidos de entrar', tag: 'security', url: '/#ajustes' }).catch(() => {});
    const what = user ? 'Contraseña incorrecta' : 'No encontré ese usuario o la contraseña no coincide';
    return c.json({ error: fails + 1 >= 5 ? 'Demasiados intentos. Espera 15 minutos e inténtalo otra vez.' : `${what}. Te quedan ${4 - fails} intento${4 - fails === 1 ? '' : 's'}.` }, 401);
  }
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE ip = ? OR at < ?').bind(ip, nowSec() - 86400).run().catch(() => {});
  c.header('Set-Cookie', await createSessionCookie(c.env, user.id));
  const uenv = await forUser(c.env, user.id, user.role);
  // Aviso de seguridad: alguien (tú) entró desde un dispositivo.
  const ua = c.req.header('user-agent') || '';
  const device = `${/Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'otro dispositivo'} · ${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'navegador'}`;
  c.executionCtx.waitUntil(sendToMe(uenv, blocks('🔐 *Nuevo inicio de sesión*', `📱 ${device}`, '_Si no fuiste tú, entra a Ajustes → «Cerrar sesión en todos los dispositivos» y cambia tu contraseña._'), { title: '🔐 Nuevo inicio de sesión', pushBody: `${device}. Si no fuiste tú, cierra todas las sesiones en Ajustes.`, tag: 'security', url: '/#ajustes' }).catch(() => undefined));
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie());
  return c.json({ ok: true });
});

// ---------- Compañeros: invitaciones y registro ----------
const normLogin = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '').replace(/@p\.uapa\.edu\.do$/, '');
const validLogin = (s: string) => /^[a-z0-9._-]{3,40}$/.test(s);

async function findInvite(env: Env, code: string) {
  return env.DB.prepare(`SELECT i.code, i.used_by, i.expires_at, u.name AS from_name FROM invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.code = ?`)
    .bind(code).first<{ code: string; used_by: number | null; expires_at: number; from_name: string | null }>();
}

// La pantalla de registro lo usa para saludar ("Manuel te invitó") antes de pedir datos.
app.get('/api/invite/:code', async (c) => {
  const inv = await findInvite(c.env, c.req.param('code'));
  if (!inv) return c.json({ error: 'Esta invitación no existe. Pídele a quien te invitó un enlace nuevo.' }, 404);
  if (inv.used_by) return c.json({ error: 'Esta invitación ya se usó. Si es tuya, entra con tu matrícula y contraseña.' }, 410);
  if (inv.expires_at < nowSec()) return c.json({ error: 'Esta invitación venció. Pide un enlace nuevo.' }, 410);
  return c.json({ ok: true, from: (inv.from_name || '').split(' ')[0] });
});

app.post('/api/signup', async (c) => {
  const b = await c.req.json<{ code?: string; name?: string; login?: string; password?: string }>().catch(() => ({} as Record<string, string>));
  const inv = await findInvite(c.env, b.code || '');
  if (!inv || inv.used_by || inv.expires_at < nowSec()) return c.json({ error: 'La invitación no es válida o ya se usó. Pide un enlace nuevo.' }, 400);
  const name = (b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const login = normLogin(b.login || '');
  if (name.length < 2) return c.json({ error: 'Escribe tu nombre.' }, 400);
  if (!validLogin(login)) return c.json({ error: 'Tu matrícula o usuario debe tener de 3 a 40 letras o números, sin espacios.' }, 400);
  if ((b.password || '').length < 8) return c.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
  if (await c.env.DB.prepare('SELECT 1 AS x FROM users WHERE login = ?').bind(login).first()) return c.json({ error: 'Ya hay una cuenta con esa matrícula. Si es tuya, entra desde la pantalla de inicio.' }, 409);
  const { hash, salt } = await hashPassword(b.password!);
  const row = await c.env.DB.prepare(`INSERT INTO users (login, name, pass_hash, pass_salt, role, invited_by) VALUES (?, ?, ?, ?, 'user', (SELECT created_by FROM invites WHERE code = ?)) RETURNING id`)
    .bind(login, name, hash, salt, inv.code).first<{ id: number }>();
  if (!row) return c.json({ error: 'No pude crear la cuenta. Inténtalo otra vez.' }, 500);
  // Solo se gasta la invitación si nadie la usó en el mismo instante.
  const used = await c.env.DB.prepare('UPDATE invites SET used_by = ? WHERE code = ? AND used_by IS NULL').bind(row.id, inv.code).run();
  if (!used.meta.changes) { await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(row.id).run(); return c.json({ error: 'Esta invitación ya se usó.' }, 409); }
  const uenv = await forUser(c.env, row.id, 'user');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await setSetting(uenv, k, v);
  await setSetting(uenv, 'student_name', name.split(' ')[0]);
  await setSetting(uenv, 'changelog_seen', String(CHANGELOG[0].version)); // las novedades viejas no le importan
  // Avisa a quien invitó: "Ana ya está en Rumbo".
  const inviter = await c.env.DB.prepare('SELECT created_by FROM invites WHERE code = ?').bind(inv.code).first<{ created_by: number }>();
  if (inviter) c.executionCtx.waitUntil(forUser(c.env, inviter.created_by).then((ie) => sendToMe(ie, blocks(`🎉 *${name} ya está en Rumbo*`, 'Aceptó tu invitación y está conectando su EVA.'), { title: `🎉 ${name} ya está en Rumbo`, tag: 'invite', url: '/#companeros' })).catch(() => undefined));
  c.header('Set-Cookie', await createSessionCookie(c.env, row.id));
  return c.json({ ok: true });
});

/** ¿Qué usuario tiene este número de WhatsApp? (el usuario 1 también por el secreto WA_MY_NUMBER) */
async function userByPhone(env: Env, from: string): Promise<number | null> {
  const digits = from.replace(/\D/g, '');
  if (!digits) return null;
  const uid = await userBySetting(env, 'wa_number', digits);
  if (uid) return uid;
  return env.WA_MY_NUMBER && env.WA_MY_NUMBER.replace(/\D/g, '') === digits ? 1 : null;
}

// ---------- Webhook de WhatsApp (público, verificado con la firma de Meta) ----------
app.get('/api/whatsapp/webhook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  if (mode === 'subscribe' && token && c.env.WA_VERIFY_TOKEN && token === c.env.WA_VERIFY_TOKEN) return c.text(challenge || '');
  return c.text('Forbidden', 403);
});

app.post('/api/whatsapp/webhook', async (c) => {
  const raw = await c.req.text();
  if (!(await verifyMetaSignature(c.env, raw, c.req.header('x-hub-signature-256') || null))) return c.text('Firma inválida', 401);
  const body = JSON.parse(raw || '{}') as WaBody;
  // Estados de entrega: si Meta no pudo entregar una respuesta, guarda el motivo para verlo en Ajustes.
  const statuses = body.entry?.flatMap((e) => e.changes?.flatMap((ch) => ch.value?.statuses || []) || []) || [];
  for (const s of statuses) {
    if (s.status !== 'failed') continue;
    const err = s.errors?.[0];
    const text = `${err?.code ?? '?'} ${err?.title || ''}${err?.error_data?.details ? ' · ' + err.error_data.details : ''}`;
    console.error(`WhatsApp no entregó la respuesta: ${text}`);
    await setSetting(c.env, 'wa_last_error', `${new Date().toISOString()} · entrega: ${text}`);
  }
  const msgs = body.entry?.flatMap((e) => e.changes?.flatMap((ch) => ch.value?.messages || []) || []) || [];
  for (const m of msgs) {
    // Cada compañero registra su número en Ajustes; a números desconocidos no se les responde.
    const uid = await userByPhone(c.env, m.from);
    if (!uid) continue;
    const uenv = await forUser(c.env, uid);
    if (m.id && !(await markSent(uenv, `wa:${m.id}`))) continue; // Meta a veces reenvía el mismo mensaje
    await setSetting(uenv, 'wa_last_inbound', String(nowSec()));
    // Se responde a Meta al instante y el trabajo (transcribir, consultar) sigue en segundo plano.
    c.executionCtx.waitUntil(answerWhatsApp(uenv, m));
  }
  return c.json({ ok: true });
});

type WaMessage = {
  id?: string; from: string; type: string;
  text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string } };
  audio?: { id: string; voice?: boolean };
};
type WaStatus = { status: string; errors?: { code?: number; title?: string; error_data?: { details?: string } }[] };
type WaBody = { entry?: { changes?: { value?: { messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[] };

async function answerWhatsApp(env: Env, m: WaMessage): Promise<void> {
  try {
    if (m.type === 'audio' && m.audio?.id) {
      const heard = await transcribeWhatsAppAudio(env, m.audio.id);
      await logInbound(env, `🎤 ${heard || '(audio sin palabras)'}`);
      if (!heard) { await sendWhatsApp(env, 'No logré entender el audio 😅. ¿Me lo repites un poco más despacio o me lo escribes?', m.from); return; }
      await sendWhatsApp(env, `🎤 _"${heard}"_\n\n${await handleCommand(env, heard, 'whatsapp')}`, m.from);
      return;
    }
    const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || '';
    if (!text) { await sendWhatsApp(env, 'Por ahora entiendo mensajes de texto y notas de voz. Escribe "ayuda" para ver lo que puedo hacer.', m.from); return; }
    await logInbound(env, text);
    await sendWhatsApp(env, await handleCommand(env, text, 'whatsapp'), m.from);
  } catch (e) {
    await sendWhatsApp(env, `No pude responder: ${(e as Error).message}`, m.from);
  }
}

// ---------- Correo de la UAPA (lo envía tu Google Apps Script con su clave privada) ----------
app.post('/api/mail/ingest', async (c) => {
  // La clave de cada script identifica al usuario.
  const uid = await userBySetting(c.env, 'mail_token', c.req.header('x-rumbo-token') || '');
  if (!uid) return c.json({ error: 'Clave inválida' }, 401);
  c.env = await forUser(c.env, uid);
  type Mail = { id: string; from?: string; subject?: string; date?: number; body?: string; url?: string };
  const b = await c.req.json<{ messages?: Mail[] }>().catch(() => ({ messages: [] as Mail[] }));
  const msgs = (b.messages || []).slice(0, 60);
  const first = !(await c.env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE user_id = ? AND source = 'correo' LIMIT 1`).bind(c.env.UID).first());
  let saved = 0;
  const fresh: { id: number; title: string; body: string; kind: string; from: string }[] = [];
  for (const m of msgs) {
    if (!m.id) continue;
    // Correos reenviados a mano desde la cuenta de la UAPA: se quita "Fwd:/RV:" y se recupera el remitente original.
    const title = (m.subject || '(sin asunto)').replace(/^\s*((fwd?|rv|re|reenviado)\s*:\s*)+/i, '').slice(0, 300) || '(sin asunto)';
    let body = (m.body || '').replace(/\r/g, '');
    let from = (m.from || '').replace(/\s*<[^>]+>/, '').replace(/"/g, '').trim();
    const fwd = body.match(/-{3,}\s*(?:Forwarded message|Mensaje reenviado)\s*-{3,}\s*\n([\s\S]*?)\n\s*\n/i);
    if (fwd) {
      const orig = fwd[1].match(/^(?:De|From):\s*(.+)$/im);
      if (orig) from = orig[1].replace(/\s*<[^>]+>/, '').replace(/"/g, '').trim();
      body = body.slice((fwd.index ?? 0) + fwd[0].length);
    }
    body = body.replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
    const kind = classifyNews(`${title} ${body.slice(0, 1500)}`);
    // El mismo correo reenviado dos veces llega con otro id: se reconoce por asunto y contenido.
    const dup = await c.env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE user_id = ? AND source = 'correo' AND title = ? AND substr(body, 1, 300) = substr(?, 1, 300) AND created_at > ? LIMIT 1`)
      .bind(c.env.UID, title, body, nowSec() - 14 * 86400).first();
    if (dup) continue;
    const row = await c.env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, title, body, author, url, kind, created_at) VALUES (?, 'correo', ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(c.env.UID, m.id, title, body, from || null, m.url || null, kind, Math.floor(m.date || nowSec())).first<{ id: number }>();
    if (row) { saved++; if (!first) fresh.push({ id: row.id, title, body, kind, from }); }
  }
  await setSetting(c.env, 'mail_last_at', String(nowSec()));
  // Notifica los correos nuevos sobre pagos o eventos (los demás quedan en Avisos sin molestar).
  for (const f of fresh.filter((x) => x.kind === 'pago' || x.kind === 'evento').slice(0, 5)) {
    const icon = f.kind === 'pago' ? '💳' : '🎉';
    c.executionCtx.waitUntil(sendToMe(c.env, blocks(`${icon} *${f.kind === 'pago' ? 'Correo sobre pagos' : 'Correo sobre un evento'}*${f.from ? ` · _${f.from}_` : ''}`, `*${f.title}*`, f.body.length > 600 ? f.body.slice(0, 600).replace(/\s+\S*$/, '') + '…' : f.body),
      { type: f.kind === 'pago' ? 'pagos' : 'avisos', title: `${icon} ${f.title}`.slice(0, 90), tag: `mail-${f.kind}`, url: `/#avisos/${f.id}`, pushBody: `${f.from ? f.from + ' · ' : ''}${f.body.slice(0, 180)}` }));
  }
  return c.json({ ok: true, received: msgs.length, saved });
});

// ---------- Telegram: entrar desde la Mini App (público; Telegram firma los datos con el token del bot) ----------
app.post('/api/telegram/webapp-login', async (c) => {
  const { initData } = await c.req.json<{ initData?: string }>().catch(() => ({ initData: '' }));
  const user = await tgVerifyInitData(c.env, initData || '');
  if (!user?.id) return c.json({ error: 'No pude verificar que vienes de Telegram.' }, 401);
  const uid = await userBySetting({ ...c.env, UID: 0 }, 'tg_chat_id', String(user.id));
  if (!uid) return c.json({ error: 'Tu Telegram no está vinculado a una cuenta de Rumbo. Entra con tu contraseña y vincula el bot en /telegram.' }, 404);
  const u = await c.env.DB.prepare('SELECT active FROM users WHERE id = ?').bind(uid).first<{ active: number }>();
  if (!u?.active) return c.json({ error: 'Cuenta desactivada.' }, 403);
  c.header('Set-Cookie', await createSessionCookie(c.env, uid));
  return c.json({ ok: true });
});

// ---------- Telegram (público, verificado con la clave secreta que Telegram reenvía) ----------
type TgFile = { file_id: string; file_size?: number; mime_type?: string; file_name?: string };
type TgMsg = { message_id: number; chat: { id: number }; text?: string; caption?: string; voice?: TgFile; audio?: TgFile; photo?: TgFile[]; document?: TgFile };
app.post('/api/telegram/webhook', async (c) => {
  const secret = await getSettings(c.env).then((s) => s.tg_secret || '');
  if (!secret || !safeEqual(c.req.header('x-telegram-bot-api-secret-token') || '', secret)) return c.text('Forbidden', 403);
  const update = await c.req.json<{ update_id: number; message?: TgMsg; callback_query?: { id: string; data?: string; message?: { message_id: number; chat?: { id: number } } } }>().catch(() => null);
  // Botones (Hoy, Tareas, ✅ Ya la entregué, +1 h…): después se avisa a las pantallas abiertas.
  if (update?.callback_query) {
    const cq = update.callback_query;
    if (await markSent({ ...c.env, UID: 0 }, `tg:${update.update_id}`)) {
      c.executionCtx.waitUntil(answerTelegramCallback(c.env, cq)
        .then(() => userBySetting({ ...c.env, UID: 0 }, 'tg_chat_id', String(cq.message?.chat?.id || '')))
        .then((uid) => notifyLive(c.env, uid, 'telegram')).catch(() => {}));
    }
    return c.json({ ok: true });
  }
  const m = update?.message;
  if (!m || !(await markSent({ ...c.env, UID: 0 }, `tg:${update!.update_id}`))) return c.json({ ok: true });
  c.executionCtx.waitUntil(answerTelegram(c.env, m)
    .then(() => userBySetting({ ...c.env, UID: 0 }, 'tg_chat_id', String(m.chat.id)))
    .then((uid) => notifyLive(c.env, uid, 'telegram')).catch(() => {}));
  return c.json({ ok: true });
});

async function answerTelegram(sys: Env, m: TgMsg): Promise<unknown> {
  const chat = String(m.chat.id);
  const text = (m.text || '').trim();
  // ¿De quién es este chat? Por el código de vinculación (/start <código>) o por el chat ya vinculado.
  const code = text.startsWith('/start') ? text.split(/\s+/)[1] || '' : '';
  const uid = (code && (await userBySetting(sys, 'tg_link_code', code))) || (await userBySetting(sys, 'tg_chat_id', chat));
  if (!uid) { await sendTelegram(sys, 'Este es el bot privado de Rumbo. Para usarlo, ábrelo desde la app: Ajustes → Conexiones → Telegram.', chat); return; }
  const env = await forUser(sys, uid);
  const s = await getSettings(env);
  // Vincular: el primer "/start <código>" con el código de Ajustes queda como tu chat.
  if (text.startsWith('/start')) {
    if (s.tg_link_code && code === s.tg_link_code) {
      await setSetting(env, 'tg_chat_id', chat);
      await sendTelegram(env, `*¡Listo${s.student_name ? ', ' + s.student_name : ''}!* 🎉 Rumbo quedó conectado.\n\nPregúntame lo que quieras de tu trimestre, mándame una *nota de voz*, o escribe "ayuda".`, chat);
    } else if (s.tg_chat_id !== chat) {
      await sendTelegram(env, 'Este es un bot privado de Rumbo. Para vincularlo, abre el enlace desde Ajustes → Telegram en la app.', chat);
    } else {
      const r = tgAyuda();
      await sendTelegram(env, r.html, chat, { html: true, kb: r.kb });
    }
    return;
  }
  if (!s.tg_chat_id || s.tg_chat_id !== chat) { await sendTelegram(env, 'Este es un bot privado de Rumbo.', chat); return; }
  try {
    await tgCall(env, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
    // Fotos (pizarra, apuntes, ejercicios): las explica o resuelve una IA con visión.
    const photo = m.photo?.length ? m.photo[m.photo.length - 1] : null;
    const doc = m.document || null;
    if (photo || (doc && /^image\//.test(doc.mime_type || ''))) {
      await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'in', 'telegram', `📸 Foto${m.caption ? ': ' + m.caption : ''}`).run();
      const f = (photo || doc)!;
      if ((f.file_size || 0) > 15e6) return sendTelegram(env, 'La imagen pesa mucho. Mándamela como foto normal (no como archivo).', chat);
      const ans = await visionAnswer(env, await downloadTelegramFile(env, f.file_id), doc?.mime_type || 'image/jpeg', m.caption || '');
      await sendTelegram(env, `📸 <b>${m.caption ? tgEsc(m.caption.slice(0, 80)) : 'Lo que veo en tu foto'}</b>\n\n${tgFormat(ans)}`, chat, { html: true, kb: TG_MINI });
      return;
    }
    // PDF: resumen, ideas clave y preguntas de repaso (o la respuesta a la pregunta del pie).
    if (doc && (/pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.file_name || ''))) {
      await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'in', 'telegram', `📄 ${doc.file_name || 'PDF'}${m.caption ? ': ' + m.caption : ''}`).run();
      if ((doc.file_size || 0) > 2e7) return sendTelegram(env, 'Ese PDF pasa de 20 MB, el límite de Telegram para bots. Prueba con uno más liviano.', chat);
      await sendTelegram(env, `📄 Leyendo <b>${tgEsc(doc.file_name || 'tu PDF')}</b>… dame unos segundos.`, chat, { html: true });
      const r = await pdfAnswer(env, await downloadTelegramFile(env, doc.file_id), doc.file_name, m.caption || '');
      await sendTelegram(env, `📄 <b>${tgEsc(doc.file_name || 'Tu PDF')}</b>\n\n${tgFormat(r.text)}\n\n<i>Toca las respuestas ocultas para verlas.</i>`, chat, { html: true, kb: TG_MINI });
      return;
    }
    if (doc) return sendTelegram(env, 'Por ahora leo *fotos* y *PDF*. Si es un Word, guárdalo como PDF y mándamelo.', chat);
    const fileId = m.voice?.file_id || m.audio?.file_id;
    if (fileId) {
      const heard = await transcribeAudio(env, await downloadTelegramFile(env, fileId));
      await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'in', 'telegram', `🎤 ${heard || '(audio sin palabras)'}`).run();
      if (!heard) { await sendTelegram(env, 'No logré entender el audio 😅. ¿Me lo repites o me lo escribes?', chat); return; }
      const rv = await tgRich(env, heard);
      if (rv) await sendTelegram(env, `🎤 <i>«${tgEsc(heard)}»</i>\n\n${rv.html}`, chat, { html: true, kb: rv.kb });
      else await sendTelegram(env, `🎤 <i>«${tgEsc(heard)}»</i>\n\n${tgFormat(await handleCommand(env, heard, 'telegram'))}`, chat, { html: true, kb: TG_MINI });
      return;
    }
    if (!text) { await sendTelegram(env, 'Por ahora entiendo texto y notas de voz.', chat); return; }
    await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'in', 'telegram', text).run();
    // Hoy, tareas, notas, pagos, «necesito 80 cálculo», «semana»…: respuesta con formato y botones.
    const rich = await tgRich(env, text);
    if (rich) await sendTelegram(env, rich.html, chat, { html: true, kb: rich.kb });
    else await sendTelegram(env, await handleCommand(env, text.replace(/^\//, ''), 'telegram'), chat, { kb: TG_MINI });
  } catch (e) {
    await sendTelegram(env, `No pude responder: ${(e as Error).message}`, chat);
  }
}

// ---------- Calendario (público con tu enlace privado): tus entregas en Google Calendar o iPhone ----------
app.get('/api/calendar/:token', async (c) => {
  const uid = await userBySetting(c.env, 'calendar_token', c.req.param('token').replace(/\.ics$/, ''));
  if (!uid) return c.text('No encontrado', 404);
  return new Response(await calendarIcs(await forUser(c.env, uid)), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
});

// ---------- Widget del teléfono (público con tu clave privada; solo lectura) ----------
app.get('/api/widget/:token', async (c) => {
  const uid = await userBySetting(c.env, 'widget_token', c.req.param('token'));
  if (!uid) return c.json({ error: 'No encontrado' }, 404);
  return c.json(await widgetData(await forUser(c.env, uid)), 200, { 'Cache-Control': 'no-store' });
});

// ---------- Novedades: lo llama `npm run deploy` al terminar; cada versión se anuncia una sola vez ----------
app.post('/api/release/announce', async (c) => {
  for (const u of await activeUsers(c.env)) await announceRelease(await forUser(c.env, u.id, u.role)).catch((e) => console.log(`Novedades (${u.id}): ${(e as Error).message}`));
  return c.json({ ok: true, version: CHANGELOG[0].version });
});

// ---------- Manifest con el ícono que elegiste en Ajustes → Apariencia (público) ----------
app.get('/api/manifest', (c) => {
  const v = String(c.req.query('icon') || '');
  const ok = ['noche', 'atardecer', 'menta', 'morado'].includes(v);
  const i192 = ok ? `/icons/${v}-192.png` : '/icon-192.png', i512 = ok ? `/icons/${v}-512.png` : '/icon-512.png', im = ok ? `/icons/${v}-maskable-512.png` : '/icon-maskable-512.png';
  return c.json({
    id: '/',
    name: 'Rumbo · Tu universidad bajo control',
    short_name: 'Rumbo',
    description: 'Tareas, notas, pensum y pagos de la UAPA en un solo lugar.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: v === 'noche' ? '#000000' : '#F5F5F7',
    theme_color: v === 'noche' ? '#000000' : '#F5F5F7',
    lang: 'es-DO',
    icons: [{ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: im, sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
    shortcuts: [
      { name: 'Tareas', short_name: 'Tareas', url: '/#tareas', icons: [{ src: i192, sizes: '192x192' }] },
      { name: 'Notas', short_name: 'Notas', url: '/#asignaturas', icons: [{ src: i192, sizes: '192x192' }] },
      { name: 'Asistente', short_name: 'Asistente', url: '/#asistente', icons: [{ src: i192, sizes: '192x192' }] },
    ],
  }, 200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
});

// ---------- A partir de aquí, todo requiere sesión ----------
app.use('/api/*', async (c, next) => {
  const uid = await sessionUser(c.env, c.req.header('cookie') || null);
  if (!uid) return c.json({ error: 'No autorizado' }, 401);
  // Desde aquí, c.env es «el Env de este usuario»: todas las consultas usan c.env.UID.
  c.env = await forUser(c.env, uid);
  await next();
});

// ---------- En vivo: cada pantalla abre un WebSocket con su Durable Object (live.ts) ----------
app.get('/api/live', (c) => {
  if (!c.env.LIVE) return c.json({ error: 'Falta el enlace LIVE (Durable Object).' }, 501);
  if (c.req.header('upgrade') !== 'websocket') return c.json({ ok: true });
  return c.env.LIVE.get(c.env.LIVE.idFromName('u' + c.env.UID)).fetch(c.req.raw);
});

// Después de cualquier cambio (POST, PATCH, DELETE) se avisa a tus otras pantallas para que recarguen.
// x-rumbo-device dice qué pantalla hizo el cambio (esa no necesita recargar).
const LIVE_SKIP = /^\/api\/(live|tts|transcribe|push|login|logout|me$|telegram\/setup|assistant\/(voice|transcribe))/;
app.use('/api/*', async (c, next) => {
  await next();
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || !c.env.UID || c.res.status >= 400 || LIVE_SKIP.test(c.req.path)) return;
  const uid = c.env.UID, env = c.env;
  const dev = /^[a-z0-9]{4,16}$/.test(c.req.header('x-rumbo-device') || '') ? 'dev:' + c.req.header('x-rumbo-device') : 'app';
  if (/stream/.test(c.req.path)) {
    // El asistente con streaming hace cambios al final: se avisa a los 7 s y a los 20 s.
    c.executionCtx.waitUntil(new Promise((r) => setTimeout(r, 7000)).then(() => notifyLive(env, uid, dev)));
    c.executionCtx.waitUntil(new Promise((r) => setTimeout(r, 20000)).then(() => notifyLive(env, uid, dev)));
  } else c.executionCtx.waitUntil(notifyLive(env, uid, dev));
});

app.get('/api/me', async (c) => {
  const u = await c.env.DB.prepare('SELECT id, login, name, role, pass_hash IS NOT NULL AS has_password FROM users WHERE id = ?').bind(c.env.UID).first<{ id: number; login: string; name: string; role: string; has_password: number }>();
  c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(nowSec(), c.env.UID).run().then(() => undefined));
  return c.json({ ok: true, user: u });
});

// Cambiar la contraseña propia (pide la actual).
app.post('/api/me/password', async (c) => {
  const b = await c.req.json<{ current?: string; password?: string }>().catch(() => ({} as Record<string, string>));
  const u = await c.env.DB.prepare('SELECT id, pass_hash, pass_salt FROM users WHERE id = ?').bind(c.env.UID).first<{ id: number; pass_hash: string | null; pass_salt: string | null }>();
  if (!u || !(await checkPassword(c.env, u, b.current || ''))) return c.json({ error: 'La contraseña actual no coincide.' }, 400);
  if ((b.password || '').length < 8) return c.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }, 400);
  const { hash, salt } = await hashPassword(b.password!);
  await c.env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, c.env.UID).run();
  return c.json({ ok: true });
});

// ---------- Administración (solo el administrador): compañeros e invitaciones ----------
// ---------- Tope diario de IA por compañero ----------
// Los motores gratis tienen una cuota al día para TODOS: cada compañero tiene un tope para que nadie la agote.
// El administrador no tiene tope.
const AI_DAILY_LIMIT = 60;
const AI_PATHS = /^\/api\/(assistant(\/(stream|voice|voice-stream|transcribe))?|study\/\d+|tasks\/\d+\/forum\/draft-reply|feedback-notes\/summary)$/;
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'POST' || c.env.ROLE === 'admin' || !AI_PATHS.test(new URL(c.req.url).pathname)) return next();
  const today = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  const s = await getSettings(c.env);
  const used = s.ai_day === today ? Number(s.ai_count || 0) : 0;
  if (used >= AI_DAILY_LIMIT) {
    const msg = `Llegaste al tope de hoy (${AI_DAILY_LIMIT} preguntas) 😅. Los motores de IA son gratis y se comparten entre todos; mañana a las 12 a. m. vuelves a tener. Mientras tanto, todo lo demás de Rumbo funciona igual.`;
    if (/stream/.test(c.req.path)) return new Response(`data: ${JSON.stringify({ t: 'done', text: msg, say: '', done: [] })}\n\n`, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (c.req.path === '/api/assistant') return c.json({ reply: msg });
    return c.json({ error: msg }, 429);
  }
  await setSetting(c.env, 'ai_day', today);
  await setSetting(c.env, 'ai_count', String(used + 1));
  await next();
});

// Foros, entregas, historial del promedio, comentarios, récord y comprobantes (src/worker/extras.ts)
registerExtras(app);

// ---------- Comentarios y problemas (llegan al administrador) ----------
app.post('/api/feedback', async (c) => {
  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: '' }));
  const t = (text || '').trim().slice(0, 1500);
  if (t.length < 4) return c.json({ error: 'Cuéntame un poco más (al menos unas palabras).' }, 400);
  await c.env.DB.prepare('INSERT INTO feedback (user_id, text, created_at) VALUES (?, ?, ?)').bind(c.env.UID, t, nowSec()).run();
  const who = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(c.env.UID).first<{ name: string }>();
  if (c.env.ROLE !== 'admin') {
    c.executionCtx.waitUntil(forUser(c.env, 1, 'admin').then((a) => sendToMe(a, blocks(`💬 *${who?.name || 'Un compañero'} te escribió*`, t.slice(0, 600).split('\n').map((l) => `> ${l}`).join('\n')), { title: `💬 ${who?.name || 'Comentario'}`, pushBody: t.slice(0, 180), tag: 'feedback', url: '/#companeros' })).catch(() => undefined));
  }
  return c.json({ ok: true });
});

// Borrar mi cuenta y todos mis datos (pide la contraseña). El administrador no puede borrarse.
app.post('/api/me/delete', async (c) => {
  if (c.env.ROLE === 'admin') return c.json({ error: 'La cuenta del administrador no se puede borrar.' }, 400);
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const u = await c.env.DB.prepare('SELECT id, pass_hash, pass_salt FROM users WHERE id = ?').bind(c.env.UID).first<{ id: number; pass_hash: string | null; pass_salt: string | null }>();
  if (!u || !(await checkPassword(c.env, u, password || ''))) return c.json({ error: 'La contraseña no coincide.' }, 400);
  const uid = c.env.UID;
  const p = `u${uid}:`;
  await c.env.DB.batch([
    // Hijas primero (notas y avisos apuntan a asignaturas; la caché de estudio se va con las tareas).
    ...['grades', 'announcements', 'tasks', 'courses', 'payments', 'pensum', 'reminders', 'messages', 'push_subs', 'feedback'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid)),
    c.env.DB.prepare('DELETE FROM settings WHERE substr(key, 1, ?) = ?').bind(p.length, p),
    c.env.DB.prepare('DELETE FROM sent_log WHERE substr(key, 1, ?) = ?').bind(p.length, p),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid),
  ]);
  c.header('Set-Cookie', clearSessionCookie());
  return c.json({ ok: true });
});

app.use('/api/admin/*', async (c, next) => {
  if (c.env.ROLE !== 'admin') return c.json({ error: 'Solo el administrador puede hacer esto.' }, 403);
  await next();
});

app.get('/api/admin/users', async (c) => {
  const { results: users } = await c.env.DB.prepare(`SELECT u.id, u.login, u.name, u.role, u.active, u.created_at, u.last_seen,
      (SELECT value FROM settings WHERE key = 'u' || u.id || ':eva_last_sync') AS eva_last_sync,
      (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS tasks,
      (SELECT value FROM settings WHERE key = 'u' || u.id || ':callmebot_apikey') IS NOT NULL
        AND (SELECT value FROM settings WHERE key = 'u' || u.id || ':callmebot_apikey') != '' AS whatsapp,
      (SELECT value FROM settings WHERE key = 'u' || u.id || ':ai_count' AND (SELECT value FROM settings WHERE key = 'u' || u.id || ':ai_day') = date('now', '-4 hours')) AS ai_today
    FROM users u ORDER BY u.id`).all();
  const { results: feedback } = await c.env.DB.prepare(`SELECT f.id, f.text, f.created_at, u.name FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 20`).all();
  const { results: invites } = await c.env.DB.prepare('SELECT code, note, created_at, expires_at FROM invites WHERE used_by IS NULL AND expires_at > ? ORDER BY created_at DESC').bind(nowSec()).all();
  return c.json({ users, invites, feedback, aiLimit: AI_DAILY_LIMIT });
});

app.post('/api/admin/invites', async (c) => {
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: '' }));
  const code = randomHex(9);
  await c.env.DB.prepare('INSERT INTO invites (code, created_by, note, expires_at) VALUES (?, ?, ?, ?)').bind(code, c.env.UID, (note || '').slice(0, 60) || null, nowSec() + 14 * 86400).run();
  return c.json({ code, link: `${new URL(c.req.url).origin}/#unirme/${code}` });
});

app.delete('/api/admin/invites/:code', async (c) => {
  await c.env.DB.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').bind(c.req.param('code')).run();
  return c.json({ ok: true });
});

// Pausar o reactivar a un compañero (sus datos se conservan). El administrador no se puede pausar a sí mismo.
app.patch('/api/admin/users/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.env.UID) return c.json({ error: 'No puedes pausar tu propia cuenta.' }, 400);
  const { active } = await c.req.json<{ active?: boolean }>();
  await c.env.DB.prepare('UPDATE users SET active = ? WHERE id = ?').bind(active ? 1 : 0, id).run();
  return c.json({ ok: true });
});

// Contraseña temporal para un compañero que olvidó la suya.
app.post('/api/admin/users/:id/reset', async (c) => {
  const id = Number(c.req.param('id'));
  const temp = randomHex(4);
  const { hash, salt } = await hashPassword(temp);
  await c.env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, id).run();
  return c.json({ ok: true, password: temp });
});

app.get('/api/mascot', async (c) => c.json(await widgetData(c.env)));
app.get('/api/dashboard', async (c) => {
  const s = await getSettings(c.env);
  // Lo que le falta conectar (Inicio muestra un aviso para terminar en Conexiones).
  const setup = { eva: !!c.env.MOODLE_TOKEN && !s.eva_last_error, whatsapp: callmebotConfigured(c.env), career: !!s.career };
  return c.json({ ...(await dashboard(c.env)), mascot: await widgetData(c.env), setup });
});

/** Una asignatura solo se puede usar si es tuya (si no, la tarea queda sin asignatura). */
async function ownCourse(env: Env, id: unknown): Promise<number | null> {
  if (id === null || id === undefined || id === '') return null;
  const r = await env.DB.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').bind(Number(id), env.UID).first<{ id: number }>();
  return r?.id ?? null;
}

// Tareas
app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  return c.json(await listTasks(c.env, { status: status || undefined, limit: 300 }));
});

app.get('/api/tasks/:id', async (c) => {
  const [t] = await listTasks(c.env, { id: Number(c.req.param('id')), limit: 1 });
  return t ? c.json(t) : c.json({ error: 'Tarea no encontrada.' }, 404);
});

// Tu nota a mano: cuando el EVA no la publica (por ejemplo, un foro), la pones tú. Si luego el EVA la publica, manda la del EVA.
app.post('/api/tasks/:id/grade', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ grade?: number; max?: number }>().catch(() => ({} as { grade?: number; max?: number }));
  const grade = Number(b.grade), max = Number(b.max || 100);
  if (!Number.isFinite(grade) || !Number.isFinite(max) || max <= 0 || grade < 0 || grade > max) return c.json({ error: `Escribe una nota entre 0 y ${max || 100}.` }, 400);
  const t = await c.env.DB.prepare('SELECT id, title, course_id, moodle_key FROM tasks WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<{ id: number; title: string; course_id: number | null; moodle_key: string | null }>();
  if (!t) return c.json({ error: 'Tarea no encontrada.' }, 404);
  if (!t.course_id) return c.json({ error: 'Primero asígnale una asignatura a la tarea (Editar tarea).' }, 400);
  const key = t.moodle_key || `task:${t.id}`;
  if (!t.moodle_key) await c.env.DB.prepare('UPDATE tasks SET moodle_key = ? WHERE id = ?').bind(key, t.id).run();
  const rows = (await c.env.DB.prepare('SELECT id, item_name, grade_max FROM grades WHERE user_id = ? AND moodle_key = ?').bind(c.env.UID, key).all<{ id: number; item_name: string; grade_max: number }>()).results
    .sort((a, b2) => Number(/calificaci/i.test(b2.item_name)) - Number(/calificaci/i.test(a.item_name)) || a.id - b2.id);
  const now = nowSec();
  if (rows[0]) {
    const scaled = Math.round((grade / max) * rows[0].grade_max * 100) / 100;
    await c.env.DB.prepare(`UPDATE grades SET grade = ?, source = 'manual', updated_at = ? WHERE id = ?`).bind(scaled, now, rows[0].id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO grades (user_id, course_id, moodle_item_id, item_name, grade, grade_max, moodle_key, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)`)
      .bind(c.env.UID, t.course_id, -(2_000_000_000 + t.id), t.title, grade, max, key, now).run();
  }
  return c.json({ ok: true });
});

// Quitar una actividad que no se corrige (o devolverla). Sale de pendientes y del promedio.
app.post('/api/tasks/:id/ignore', async (c) => {
  const { ignored } = await c.req.json<{ ignored?: boolean }>().catch(() => ({ ignored: true }));
  const r = await setIgnored(c.env, { taskId: Number(c.req.param('id')) }, ignored !== false);
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, 404);
});
app.post('/api/grades/:id/ignore', async (c) => {
  const { ignored } = await c.req.json<{ ignored?: boolean }>().catch(() => ({ ignored: true }));
  const r = await setIgnored(c.env, { gradeId: Number(c.req.param('id')) }, ignored !== false);
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, 404);
});
// Las actividades quitadas, para devolverlas desde Tareas.
app.get('/api/ignored-tasks', async (c) => c.json(await listTasks(c.env, { status: 'ignored', limit: 100 })));

// Poner tu nota directamente en un renglón de Notas (aunque no haya tarea en Rumbo).
app.post('/api/grades/:id/grade', async (c) => {
  const b = await c.req.json<{ grade?: number; max?: number }>().catch(() => ({} as { grade?: number; max?: number }));
  const g = await c.env.DB.prepare('SELECT id, grade, grade_max, source FROM grades WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).first<{ id: number; grade: number | null; grade_max: number; source: string | null }>();
  if (!g) return c.json({ error: 'Actividad no encontrada.' }, 404);
  if (g.grade !== null && g.source !== 'manual') return c.json({ error: 'Esta nota ya la publicó el EVA.' }, 400);
  const grade = Number(b.grade), max = Number(b.max || g.grade_max || 100);
  if (!Number.isFinite(grade) || !Number.isFinite(max) || max <= 0 || grade < 0 || grade > max) return c.json({ error: `Escribe una nota entre 0 y ${max || 100}.` }, 400);
  const scaled = Math.round((grade / max) * g.grade_max * 100) / 100;
  await c.env.DB.prepare(`UPDATE grades SET grade = ?, source = 'manual', updated_at = ? WHERE id = ?`).bind(scaled, nowSec(), g.id).run();
  return c.json({ ok: true });
});
app.delete('/api/grades/:id/grade', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(`DELETE FROM grades WHERE id = ? AND user_id = ? AND source = 'manual' AND moodle_item_id <= -2000000000`).bind(id, c.env.UID).run();
  await c.env.DB.prepare(`UPDATE grades SET grade = NULL, source = NULL WHERE id = ? AND user_id = ? AND source = 'manual'`).bind(id, c.env.UID).run();
  return c.json({ ok: true });
});

app.delete('/api/tasks/:id/grade', async (c) => {
  const id = Number(c.req.param('id'));
  const t = await c.env.DB.prepare('SELECT moodle_key FROM tasks WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<{ moodle_key: string | null }>();
  if (!t?.moodle_key) return c.json({ ok: true });
  await c.env.DB.prepare(`DELETE FROM grades WHERE user_id = ? AND moodle_item_id = ?`).bind(c.env.UID, -(2_000_000_000 + id)).run();
  await c.env.DB.prepare(`UPDATE grades SET grade = NULL, source = NULL WHERE user_id = ? AND moodle_key = ? AND source = 'manual'`).bind(c.env.UID, t.moodle_key).run();
  return c.json({ ok: true });
});

// Archivo que adjuntó el facilitador: Rumbo lo descarga del EVA con tu token (el token nunca llega al navegador).
app.get('/api/tasks/:id/files/:n', async (c) => {
  const t = await c.env.DB.prepare('SELECT attachments FROM tasks WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).first<{ attachments: string | null }>();
  const f = (JSON.parse(t?.attachments || '[]') as { name: string; url: string }[])[Number(c.req.param('n'))];
  const base = c.env.MOODLE_URL.replace(/\/$/, '');
  if (!f || !c.env.MOODLE_TOKEN || !f.url.startsWith(base)) return c.json({ error: 'Archivo no encontrado.' }, 404);
  const u = new URL(f.url.replace('/pluginfile.php/', '/webservice/pluginfile.php/').replace('/webservice/webservice/', '/webservice/'));
  u.searchParams.set('token', c.env.MOODLE_TOKEN);
  const r = await fetch(u.toString());
  if (!r.ok) return c.json({ error: `El EVA respondió ${r.status}.` }, 502);
  return new Response(r.body, { headers: {
    'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Cache-Control': 'private, max-age=3600',
  } });
});

// Búsqueda en toda la app: tareas, avisos y asignaturas (sin importar tildes ni mayúsculas).
app.get('/api/search', async (c) => {
  const fold = (x: unknown) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = fold(c.req.query('q')).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return c.json({ tasks: [], news: [], courses: [] });
  const hit = (...parts: unknown[]) => { const t = fold(parts.join(' ')); return words.every((w) => t.includes(w)); };
  type T = { id: number; title: string; due_at: number | null; status: string; course_name: string | null; course_color: string | null; description: string | null };
  const tasks = (await c.env.DB.prepare(`SELECT t.id, t.title, t.due_at, t.status, t.description, c.name AS course_name, c.color AS course_color FROM tasks t LEFT JOIN courses c ON c.id = t.course_id
    WHERE t.user_id = ? AND t.status != 'ignored' ORDER BY t.status = 'done', COALESCE(t.due_at, 0) DESC LIMIT 600`).bind(c.env.UID).all<T>()).results
    .filter((t) => hit(t.title, t.course_name, t.description)).slice(0, 12).map(({ description: _d, ...t }) => t);
  type N = { id: number; title: string; body: string | null; kind: string; created_at: number; course_name: string | null };
  const news = (await c.env.DB.prepare(`SELECT a.id, a.title, a.body, a.kind, a.created_at, c.name AS course_name FROM announcements a LEFT JOIN courses c ON c.id = a.course_id
    WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 400`).bind(c.env.UID).all<N>()).results
    .filter((n) => hit(n.title, n.body, n.course_name)).slice(0, 8).map(({ body: _b, ...n }) => ({ ...n, title: cleanNewsText(n.title) }));
  type C = { id: number; name: string; code: string | null; color: string; facilitator_eva: string | null; facilitator: string | null };
  const courses = (await c.env.DB.prepare('SELECT id, name, code, color, facilitator, facilitator_eva FROM courses WHERE user_id = ? AND active = 1').bind(c.env.UID).all<C>()).results
    .filter((x) => hit(x.name, x.code, x.facilitator, x.facilitator_eva)).slice(0, 6);
  return c.json({ tasks, news, courses });
});

app.post('/api/tasks', async (c) => {
  const b = await c.req.json<{ title: string; due_at?: number | null; course_id?: number | null; notes?: string }>();
  if (!b.title?.trim()) return c.json({ error: 'El título es obligatorio.' }, 400);
  const r = await c.env.DB.prepare(`INSERT INTO tasks (user_id, title, due_at, course_id, notes, source, status) VALUES (?, ?, ?, ?, ?, 'manual', 'pending') RETURNING id`)
    .bind(c.env.UID, b.title.trim(), b.due_at ?? null, await ownCourse(c.env, b.course_id), b.notes ?? null).first<{ id: number }>();
  return c.json({ id: r?.id });
});

app.patch('/api/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<Partial<{ title: string; due_at: number | null; course_id: number | null; notes: string; status: string }>>();
  const fields: string[] = [], binds: unknown[] = [];
  for (const k of ['title', 'due_at', 'course_id', 'notes', 'status'] as const) {
    if (k in b) { fields.push(`${k} = ?`); binds.push((b as Record<string, unknown>)[k] ?? null); }
  }
  if (!fields.length) return c.json({ ok: true });
  if ('course_id' in b) binds[fields.indexOf('course_id = ?')] = await ownCourse(c.env, b.course_id);
  await c.env.DB.prepare(`UPDATE tasks SET ${fields.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`).bind(...binds, nowSec(), id, c.env.UID).run();
  return c.json({ ok: true });
});

// Cómo va tu índice (para «subió de 84.1 a 84.4») y el resumen de la semana tipo historia.
app.get('/api/index-trend', async (c) => c.json(await indexTrend(c.env)));
app.get('/api/week-story', async (c) => c.json(await weekStory(c.env)));

// Posponer a mañana (deslizar a la izquierda o el menú de la tarea). Si la fecha la pone el EVA, solo se recuerda mañana 8:00.
app.post('/api/tasks/:id/postpone', async (c) => {
  const id = Number(c.req.param('id'));
  const t = await c.env.DB.prepare('SELECT id, title, due_at, source FROM tasks WHERE id = ? AND user_id = ?').bind(id, c.env.UID).first<{ id: number; title: string; due_at: number | null; source: string }>();
  if (!t) return c.json({ error: 'Tarea no encontrada.' }, 404);
  const now = nowSec();
  if (t.source !== 'eva' && t.due_at) {
    const due = Math.max(t.due_at, now) + 86400;
    await c.env.DB.prepare('UPDATE tasks SET due_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(due, now, id, c.env.UID).run();
    return c.json({ ok: true, mode: 'due', message: `Movida para ${cuandoTexto(c.env, due)}` });
  }
  const d = localDate(c.env, now + 86400);
  const at = localToUnix(c.env, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 8, 0);
  await c.env.DB.prepare('INSERT INTO reminders (user_id, text, remind_at) VALUES (?, ?, ?)').bind(c.env.UID, `⏰ Retoma: ${t.title}${t.due_at ? ' · vence ' + cuandoTexto(c.env, t.due_at) : ''}`, at).run();
  return c.json({ ok: true, mode: 'reminder', message: 'La fecha la pone el EVA: te la recuerdo mañana a las 8:00 a. m.' });
});

app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
  return c.json({ ok: true });
});

// Conexión del correo: genera (una vez) la clave privada que usa tu script de Google.
app.post('/api/mail/setup', async (c) => {
  const s = await getSettings(c.env);
  let token = s.mail_token;
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    token = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
    await setSetting(c.env, 'mail_token', token);
  }
  return c.json({ token, url: new URL('/api/mail/ingest', c.req.url).href, lastAt: Number(s.mail_last_at || 0) || null });
});

app.post('/api/mail/reset', async (c) => {
  await setSetting(c.env, 'mail_token', '');
  return c.json({ ok: true });
});

// Telegram: registrar el bot y obtener el enlace para vincular tu chat
app.post('/api/telegram/setup', async (c) => {
  if (!telegramReady(c.env)) return c.json({ error: c.env.ROLE === 'admin' ? 'Falta el token del bot. Pégalo en ' + new URL('/telegram', c.req.url).href : 'El administrador todavía no ha conectado el bot de Telegram.' }, 400);
  try { return c.json(await setupTelegram(c.env, new URL(c.req.url).origin)); }
  catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

app.get('/api/telegram/status', async (c) => {
  await ensureTgWebhook(c.env, new URL(c.req.url).origin).catch(() => {});
  const s = await getSettings(c.env);
  return c.json({ configured: telegramReady(c.env), connected: !!s.tg_chat_id, username: s.tg_username || '', admin: c.env.ROLE === 'admin', source: c.env.TG_TOKEN_SOURCE || '' });
});

// El administrador pega el token de @BotFather en /telegram: se valida con Telegram y se guarda en D1.
app.post('/api/admin/telegram/token', async (c) => {
  const { token } = await c.req.json<{ token?: string }>().catch(() => ({ token: '' }));
  const t = String(token || '').trim();
  if (!TG_TOKEN_RE.test(t)) return c.json({ error: 'Ese no parece un token de BotFather. Tiene esta forma: 123456789:AAH...(unos 35 caracteres)' }, 400);
  try {
    const me = await tgCall<{ is_bot?: boolean }>({ ...c.env, TELEGRAM_BOT_TOKEN: t }, 'getMe');
    if (!me.is_bot) throw new Error('Ese token no es de un bot.');
  } catch (e) {
    return c.json({ error: 'Telegram no aceptó el token: ' + (e as Error).message + '. Cópialo otra vez desde @BotFather.' }, 400);
  }
  await setSetting(c.env, 'tg_bot_token', t);
  resetTelegramToken();
  c.env.TELEGRAM_BOT_TOKEN = t;
  c.env.TG_TOKEN_SOURCE = 'app';
  try { return c.json({ ok: true, ...(await setupTelegram(c.env, new URL(c.req.url).origin)) }); }
  catch (e) { return c.json({ error: 'Guardé el token, pero no pude configurar el bot: ' + (e as Error).message }, 502); }
});

app.post('/api/admin/telegram/token/delete', async (c) => {
  if (telegramReady(c.env)) await tgCall(c.env, 'deleteWebhook', { drop_pending_updates: true }).catch(() => {});
  await setSetting(c.env, 'tg_bot_token', '');
  resetTelegramToken();
  return c.json({ ok: true });
});

// ---------- Llaves y configuración (/llaves, solo el administrador) ----------
// Se guardan en D1 (settings cfg:NOMBRE) y pisan al secreto de Cloudflare; «Volver al de Cloudflare» las borra.
const maskVal = (v: string) => (!v ? '' : v.length <= 8 ? '•'.repeat(v.length) : '•'.repeat(Math.min(12, v.length - 4)) + v.slice(-4));
function configList(env: Env, reveal: boolean) {
  return CONFIG_KEYS.map((x) => {
    const v = String((env as unknown as Record<string, unknown>)[x.k] || '');
    return { ...x, source: env.CFG_SRC?.[x.k] || '', cloudflare: !!env.CFG_CF?.[x.k], set: !!v, value: !x.secret || reveal ? v : maskVal(v) };
  });
}
app.get('/api/admin/config', (c) => c.json({ keys: configList(c.env, false) }));
app.post('/api/admin/config/reveal', async (c) => {
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const u = await c.env.DB.prepare('SELECT id, pass_hash, pass_salt FROM users WHERE id = ?').bind(c.env.UID).first<{ id: number; pass_hash: string | null; pass_salt: string | null }>();
  if (!u || !(await checkPassword(c.env, u, password || ''))) return c.json({ error: 'La contraseña no coincide.' }, 400);
  return c.json({ keys: configList(c.env, true) });
});
app.post('/api/admin/config', async (c) => {
  const { name, value, reset } = await c.req.json<{ name?: string; value?: string; reset?: boolean }>().catch(() => ({} as { name?: string; value?: string; reset?: boolean }));
  if (!name || !CONFIG_NAMES.has(name)) return c.json({ error: 'Esa llave no existe.' }, 400);
  const key = name === 'TELEGRAM_BOT_TOKEN' ? 'tg_bot_token' : 'cfg:' + name;
  const v = reset ? '' : String(value ?? '').trim();
  if (!reset && !v) return c.json({ error: 'Escribe un valor o usa «Volver al de Cloudflare».' }, 400);
  if (v.length > 4000) return c.json({ error: 'El valor es demasiado largo.' }, 400);
  if (name === 'TZ_OFFSET_HOURS' && v && !/^[-+]?\d{1,2}(\.\d+)?$/.test(v)) return c.json({ error: 'Escribe solo el número de horas, por ejemplo -4.' }, 400);
  if (/_URL$/.test(name) && v && !/^https?:\/\//.test(v)) return c.json({ error: 'La dirección debe empezar con https://' }, 400);
  if (reset) await c.env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  else await setSetting(c.env, key, v);
  resetAppConfig();
  return c.json({ ok: true, relogin: name === 'SESSION_SECRET' });
});

// ---------- WhatsApp encendido/apagado (Ajustes o «whatsapp off» en el bot) ----------
app.get('/api/wa/status', async (c) => c.json({ on: (await getSetting(c.env, 'wa_enabled', '1')) !== '0', configured: callmebotConfigured(c.env) || waConfigured(c.env) }));
app.post('/api/wa/toggle', async (c) => {
  const b = await c.req.json<{ on?: boolean }>().catch(() => ({} as { on?: boolean }));
  const on = typeof b.on === 'boolean' ? b.on : (await getSetting(c.env, 'wa_enabled', '1')) === '0';
  await setSetting(c.env, 'wa_enabled', on ? '1' : '0');
  return c.json({ ok: true, on });
});

app.post('/api/telegram/unlink', async (c) => {
  await setSetting(c.env, 'tg_chat_id', '');
  await setSetting(c.env, 'tg_link_code', '');
  return c.json({ ok: true });
});

// Calendario: crea (una vez) tu enlace privado
app.post('/api/calendar/setup', async (c) => {
  const s = await getSettings(c.env);
  let token = s.calendar_token;
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(20))].map((x) => x.toString(16).padStart(2, '0')).join('');
    await setSetting(c.env, 'calendar_token', token);
  }
  const url = `${new URL(c.req.url).origin}/api/calendar/${token}.ics`;
  return c.json({ url, webcal: url.replace(/^https:/, 'webcal:'), google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https:/, 'webcal:'))}` });
});

// Widget: crea (una vez) la clave privada y el enlace que conecta la app del widget
app.post('/api/widget/setup', async (c) => {
  const s = await getSettings(c.env);
  let token = s.widget_token;
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(20))].map((x) => x.toString(16).padStart(2, '0')).join('');
    await setSetting(c.env, 'widget_token', token);
  }
  const origin = new URL(c.req.url).origin;
  return c.json({ link: `rumbo://conectar?u=${encodeURIComponent(origin)}&t=${token}`, apk: `${origin}/rumbo-widget.apk?v=${WIDGET_VERSION}`, preview: await widgetData(c.env) });
});
app.post('/api/widget/reset', async (c) => { await setSetting(c.env, 'widget_token', ''); return c.json({ ok: true }); });

// Copias de seguridad de tus datos
// Las copias automáticas son de toda la base (solo el administrador las ve); cada quien descarga lo suyo.
app.get('/api/backups', async (c) => c.json({ enabled: !!c.env.BACKUPS && c.env.ROLE === 'admin', list: c.env.ROLE === 'admin' ? await listBackups(c.env) : [] }));
app.post('/api/backups', async (c) => {
  if (c.env.ROLE !== 'admin') return c.json({ error: 'Solo el administrador hace copias de toda la base.' }, 403);
  try { return c.json({ ok: true, backup: await makeBackup(c.env) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 500); }
});
app.get('/api/backups/download', async (c) => {
  const key = c.req.query('key');
  let json: string;
  if (key && c.env.BACKUPS && c.env.ROLE === 'admin') {
    const buf = await c.env.BACKUPS.get(key, 'arrayBuffer');
    if (!buf) return c.json({ error: 'Copia no encontrada' }, 404);
    json = await gunzip(buf);
  } else json = JSON.stringify(await dumpData(c.env, true)); // sin clave: tus datos de este momento
  const name = `rumbo-datos-${(key || new Date().toISOString()).replace(/^backup:/, '').slice(0, 19).replace(/[:T]/g, '-')}.json`;
  return new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
});

// Modo estudio con IA (plan, tarjetas o explicación de una tarea)
app.post('/api/study/:id', async (c) => {
  const b = await c.req.json<{ mode?: string; fresh?: boolean }>().catch(() => ({} as { mode?: string; fresh?: boolean }));
  const mode = (['plan', 'tarjetas', 'explica', 'foro'].includes(b.mode || '') ? b.mode : 'plan') as StudyMode;
  try { return c.json(await study(c.env, Number(c.req.param('id')), mode, !!b.fresh)); }
  catch (e) { return c.json({ error: /cuota|motor/i.test((e as Error).message) ? 'Los motores de IA están ocupados. Inténtalo en un minuto.' : (e as Error).message }, 502); }
});

// Logros
app.get('/api/achievements', async (c) => c.json(await achievements(c.env)));

// Seguridad: cierra la sesión en todos los dispositivos (incluido este)
app.post('/api/logout-all', async (c) => {
  await setSetting(c.env, 'session_version', String(Date.now()));
  c.header('Set-Cookie', clearSessionCookie());
  return c.json({ ok: true });
});

app.post('/api/calendar/reset', async (c) => { await setSetting(c.env, 'calendar_token', ''); return c.json({ ok: true }); });

// Modo enfoque: suma minutos de estudio a una tarea
app.post('/api/tasks/:id/focus', async (c) => {
  const { minutes } = await c.req.json<{ minutes?: number }>();
  const m = Math.max(0, Math.min(180, Math.round(Number(minutes) || 0)));
  await c.env.DB.prepare('UPDATE tasks SET focus_minutes = focus_minutes + ? WHERE id = ? AND user_id = ?').bind(m, Number(c.req.param('id')), c.env.UID).run();
  return c.json({ ok: true });
});

app.get('/api/changelog', (c) => c.json(CHANGELOG));

app.post('/api/ai/test', async (c) => c.env.ROLE === 'admin' ? c.json({ results: await testEngines(c.env) }) : c.json({ error: 'Solo el administrador.' }, 403));

// Contadores para los numeritos rojos (barra, menú e icono de la app)
app.get('/api/badges', async (c) => {
  c.executionCtx.waitUntil(announceRelease(c.env).catch((e) => console.log('Novedades: ' + (e as Error).message)));
  const now = nowSec();
  const endOfDay = now + 86400 - ((now - 4 * 3600) % 86400); // fin del día en hora de RD
  const seen = Number((await getSettings(c.env)).news_seen_id || 0);
  const news = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements WHERE user_id = ? AND read = 0 AND id > ? AND (source IN ('avisos', 'correo', 'rumbo', 'notas') OR kind IN ('pago', 'evento'))`).bind(c.env.UID, seen).first<{ n: number }>();
  // Tareas: lo que vence hoy y lo vencido en los últimos 3 días (lo más viejo ya no suma).
  const tasks = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'pending' AND due_at IS NOT NULL AND due_at < ? AND due_at > ?`).bind(c.env.UID, endOfDay, now - 3 * 86400).first<{ n: number }>();
  return c.json({ news: news?.n ?? 0, tasks: tasks?.n ?? 0 });
});

// Avisos y novedades (EVA y correo)
app.get('/api/announcements', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT a.id, a.source, a.title, a.body, a.author, a.url, a.kind, a.created_at, a.read, c.name AS course_name, c.color AS course_color
    FROM announcements a LEFT JOIN courses c ON c.id = a.course_id WHERE a.user_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 120`).bind(c.env.UID).all<{ body: string | null; title: string }>();
  return c.json(results.map((r) => ({ ...r, title: cleanNewsText(r.title), body: r.body ? cleanNewsText(r.body) : r.body })));
});

// Al abrir Avisos, el numerito rojo se limpia (los puntos azules de cada aviso siguen hasta que lo abras).
app.post('/api/announcements/seen', async (c) => {
  const r = await c.env.DB.prepare('SELECT MAX(id) AS m FROM announcements WHERE user_id = ?').bind(c.env.UID).first<{ m: number | null }>();
  await setSetting(c.env, 'news_seen_id', String(r?.m ?? 0));
  return c.json({ ok: true });
});

app.post('/api/announcements/read', async (c) => {
  const b = await c.req.json<{ ids?: number[] }>().catch(() => ({} as { ids?: number[] }));
  if (b.ids?.length) await c.env.DB.prepare(`UPDATE announcements SET read = 1 WHERE user_id = ? AND id IN (${b.ids.map(() => '?').join(',')})`).bind(c.env.UID, ...b.ids).run();
  else await c.env.DB.prepare('UPDATE announcements SET read = 1 WHERE user_id = ? AND read = 0').bind(c.env.UID).run();
  return c.json({ ok: true });
});

// Asignaturas y notas
app.get('/api/courses', async (c) => c.json(await courseSummaries(c.env)));

// Historial: asignaturas de trimestres anteriores con su promedio final
app.get('/api/courses/history', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT c.id, c.code, c.name, c.color, c.updated_at, c.eva_total, c.eva_total_max,
      (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id AND t.status = 'done') AS delivered
    FROM courses c WHERE c.user_id = ? AND c.active = 0 AND c.moodle_id IS NOT NULL ORDER BY c.updated_at DESC`).bind(c.env.UID).all<{ id: number }>();
  // Mismo promedio que en el trimestre actual: una nota por actividad, con pesos y sin lo quitado.
  const rows = await bestGrades(c.env);
  return c.json(results.map((r) => {
    const a = courseAverage(rows.filter((g) => g.course_id === r.id));
    return { ...r, graded: a.graded, total: a.total, average: a.avg === null ? null : Math.round(a.avg * 10) / 10 };
  }));
});

app.get('/api/courses/:id/grades', async (c) => {
  // Cada nota trae su tarea (si existe) para abrir la ficha desde Notas.
  // ignored: 1 si no cuenta para el promedio (la quitaste o es de las que no se corrigen); auto: 1 si la quitó Rumbo por el nombre.
  type Row = { id: number; item_name: string; grade: number | null; grade_max: number; weight: number | null; moodle_key: string | null; source: string | null; task_id: number | null; due_at: number | null; status: string | null; ignored: number; auto: number };
  const { results } = await c.env.DB.prepare(`SELECT g.id, g.item_name, g.grade, g.grade_max, g.weight, g.moodle_key, g.source, t.id AS task_id, t.due_at, t.status,
      ${GRADE_IGNORED_SQL('g')} AS ignored, CASE WHEN g.ignored IS NULL AND ${GRADE_IGNORED_SQL('g')} = 1 THEN 1 ELSE 0 END AS auto
    FROM grades g LEFT JOIN tasks t ON g.moodle_key IS NOT NULL AND t.user_id = g.user_id AND t.moodle_key = g.moodle_key
    WHERE g.user_id = ? AND g.course_id = ? ORDER BY COALESCE(t.due_at, 9999999999), g.id`).bind(c.env.UID, Number(c.req.param('id'))).all<Row>();
  // Un foro trae dos renglones («… calificación» y «… foro completo»): se muestra uno solo, el que tiene nota,
  // con el peso mayor de los dos (el que usa el EVA).
  const byKey = new Map<string, Row>();
  const out: Row[] = [];
  for (const r of results) {
    if (!r.moodle_key) { out.push(r); continue; }
    const prev = byKey.get(r.moodle_key);
    if (!prev) { byKey.set(r.moodle_key, r); out.push(r); continue; }
    const weight = Math.max(prev.weight ?? -1, r.weight ?? -1);
    const keep = prev.grade === null && r.grade !== null ? r : prev;
    const merged = { ...keep, weight: weight < 0 ? null : weight };
    out[out.indexOf(prev)] = merged; byKey.set(r.moodle_key, merged);
  }
  return c.json(out.map((r) => ({ ...r, item_name: r.moodle_key?.startsWith('forum:') ? r.item_name.replace(/\s+(calificaci[oó]n|foro completo)$/i, '') : r.item_name })));
});

app.post('/api/courses', async (c) => {
  const b = await c.req.json<{ name: string; code?: string; color?: string; facilitator?: string }>();
  if (!b.name?.trim()) return c.json({ error: 'El nombre es obligatorio.' }, 400);
  await c.env.DB.prepare('INSERT INTO courses (user_id, name, code, short_name, color, facilitator) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(c.env.UID, b.name.trim(), b.code || null, b.code || b.name.trim().split(' ')[0], b.color || '#1F5FE0', b.facilitator || null).run();
  return c.json({ ok: true });
});

app.patch('/api/courses/:id', async (c) => {
  const b = await c.req.json<Partial<{ name: string; code: string; short_name: string; color: string; facilitator: string; active: number }>>();
  const fields: string[] = [], binds: unknown[] = [];
  for (const k of ['name', 'code', 'short_name', 'color', 'facilitator', 'active'] as const) {
    if (k in b) { fields.push(`${k} = ?`); binds.push((b as Record<string, unknown>)[k] ?? null); }
  }
  if (fields.length) await c.env.DB.prepare(`UPDATE courses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds, Number(c.req.param('id')), c.env.UID).run();
  return c.json({ ok: true });
});

// Pagos
app.get('/api/payments', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT p.id, p.period, p.amount, p.paid_at, p.note, (SELECT 1 FROM payment_receipts r WHERE r.payment_id = p.id) AS has_receipt FROM payments p WHERE p.user_id = ? ORDER BY p.paid_at DESC LIMIT 60').bind(c.env.UID).all();
  return c.json({ window: await payWindow(c.env), history: results });
});

app.post('/api/payments', async (c) => {
  const b = await c.req.json<{ period?: string; amount?: number | null; note?: string }>();
  const period = b.period || (await payWindow(c.env)).period;
  await c.env.DB.prepare('INSERT INTO payments (user_id, period, amount, paid_at, note) VALUES (?, ?, ?, ?, ?)').bind(c.env.UID, period, b.amount ?? null, nowSec(), b.note ?? null).run();
  return c.json({ ok: true });
});

app.delete('/api/payments/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM payments WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
  return c.json({ ok: true });
});

// Pensum
app.get('/api/pensum', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, term, code, name, credits, status, grade, prereqs, coreqs, kind FROM pensum WHERE user_id = ? ORDER BY term, id').bind(c.env.UID).all();
  return c.json(results);
});

type PensumRow = { term: number; code?: string; name: string; credits?: number; status?: string; grade?: number | null; prereqs?: string; coreqs?: string; kind?: string };
const insertPensum = (env: Env, r: PensumRow) => env.DB.prepare('INSERT INTO pensum (user_id, term, code, name, credits, status, grade, prereqs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .bind(env.UID, Number(r.term) || 1, r.code || null, r.name, Number(r.credits) || 0, r.status || 'pendiente', r.grade ?? null, r.prereqs || null);

app.post('/api/pensum', async (c) => {
  const b = await c.req.json<PensumRow>();
  if (!b.name?.trim()) return c.json({ error: 'El nombre es obligatorio.' }, 400);
  await insertPensum(c.env, b).run();
  return c.json({ ok: true });
});

app.post('/api/pensum/import', async (c) => {
  const rows = await c.req.json<PensumRow[]>();
  if (!Array.isArray(rows) || !rows.length) return c.json({ error: 'Envía una lista de asignaturas.' }, 400);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM pensum WHERE user_id = ?').bind(c.env.UID), ...rows.filter((r) => r.name).map((r) => insertPensum(c.env, r))]);
  return c.json({ ok: true, count: rows.length });
});

app.patch('/api/pensum/:id', async (c) => {
  const b = await c.req.json<Partial<PensumRow>>();
  const fields: string[] = [], binds: unknown[] = [];
  for (const k of ['term', 'code', 'name', 'credits', 'status', 'grade', 'prereqs', 'coreqs', 'kind'] as const) {
    if (k in b) { fields.push(`${k} = ?`); binds.push((b as Record<string, unknown>)[k] ?? null); }
  }
  if (fields.length) await c.env.DB.prepare(`UPDATE pensum SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds, Number(c.req.param('id')), c.env.UID).run();
  return c.json({ ok: true });
});

// Carreras de la UAPA y carga del pensum oficial
app.get('/api/careers', async (c) => {
  const s = await getSettings(c.env);
  const cur = findCareer(s.career || '');
  return c.json({
    current: cur ? { id: cur.id, name: cur.name, version: cur.pensum?.version, source: cur.pensum?.source, totalCredits: cur.pensum?.totalCredits, notes: cur.pensum?.notes || [], electives: cur.pensum?.electives || [] } : null,
    careers: CAREERS.map((k) => ({ id: k.id, name: k.name, area: k.area, available: !!k.pensum })),
  });
});

app.post('/api/pensum/career', async (c) => {
  const { career } = await c.req.json<{ career?: string }>();
  const car = findCareer(career || '');
  if (!car) return c.json({ error: 'Carrera no encontrada.' }, 400);
  if (!car.pensum) return c.json({ error: `El pensum de ${car.name} todavía no está cargado en Rumbo.` }, 400);

  // Conserva lo que ya marcaste (aprobada, nota) y pone "en curso" lo que tienes ahora en el EVA.
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const { results: old } = await c.env.DB.prepare('SELECT code, name, status, grade FROM pensum WHERE user_id = ?').bind(c.env.UID).all<{ code: string | null; name: string; status: string; grade: number | null }>();
  const { results: eva } = await c.env.DB.prepare('SELECT code, name FROM courses WHERE user_id = ? AND active = 1').bind(c.env.UID).all<{ code: string | null; name: string }>();
  const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.length > 6 && y.length > 6 && (x.includes(y) || y.includes(x)); };
  let enCurso = 0;
  const rows = car.pensum.items.map((it) => {
    const prev = old.find((o) => (it.code && o.code === it.code) || same(o.name, it.name));
    const inEva = eva.some((e) => (it.code && e.code === it.code) || same(e.name, it.name));
    const status = prev && prev.status !== 'pendiente' ? prev.status : inEva ? 'en_curso' : 'pendiente';
    if (status === 'en_curso') enCurso++;
    return c.env.DB.prepare('INSERT INTO pensum (user_id, term, code, name, credits, status, grade, prereqs, coreqs, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.env.UID, it.term, it.code, it.name, it.credits, status, prev?.grade ?? null, it.prereqs || null, it.coreqs || null, it.kind || 'obligatoria');
  });
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM pensum WHERE user_id = ?').bind(c.env.UID), ...rows]);
  await setSetting(c.env, 'career', car.id);
  return c.json({ ok: true, count: rows.length, enCurso });
});

app.delete('/api/pensum/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM pensum WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.env.UID).run();
  return c.json({ ok: true });
});

// Ajustes
const EDITABLE = ['goals', 'ics_study', 'notify_plan', 'plan_hour', 'wa_tipos', 'wa_quiet', 'wa_number', 'notify_tareas', 'notify_notas', 'notify_pagos', 'notify_avisos', 'notify_resumen', 'notify_novedades', 'push_also_wa', 'summary_hour', 'summary_enabled', 'task_reminders', 'pay_open_day', 'pay_close_day', 'pay_remind_days', 'pay_amount', 'term_start', 'term_end', 'student_name', 'eva_sync_hours', 'study_hour', 'study_enabled'];

app.get('/api/settings', async (c) => {
  const s = await getSettings(c.env);
  return c.json({
    settings: Object.fromEntries(EDITABLE.map((k) => [k, s[k] ?? ''])),
    status: {
      eva: { configured: !!c.env.MOODLE_TOKEN, lastSync: Number(s.eva_last_sync || 0) || null, error: s.eva_last_error || '', user: s.eva_user || '' },
      whatsapp: { server: waServerReady(c.env), number: s.wa_number || (c.env.UID === 1 ? (c.env.WA_MY_NUMBER || '').replace(/\D/g, '') : ''), configured: waConfigured(c.env), windowOpen: await waWindowOpen(c.env), lastInbound: Number(s.wa_last_inbound || 0) || null, lastError: s.wa_last_error || '' },
      callmebot: { configured: callmebotConfigured(c.env), number: callmebotConfigured(c.env) ? (c.env.WA_MY_NUMBER || '').replace(/\D/g, '') : '', bot: CALLMEBOT_NUMBER, activate: CALLMEBOT_ACTIVATE },
      mail: { connected: !!s.mail_token, lastAt: Number(s.mail_last_at || 0) || null },
      telegram: { configured: telegramReady(c.env), connected: !!s.tg_chat_id, username: s.tg_username || '' },
      ai: { engines: [...providers(c.env).map((p) => p.name), ...(c.env.AI ? ['Workers AI'] : [])] },
      calendar: { connected: !!s.calendar_token },
      push: { devices: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(c.env.UID).first<{ n: number }>())?.n ?? 0 },
      voice: { ready: !!c.env.AI && waConfigured(c.env) },
      waLink: waServerReady(c.env) ? await waChatLink(c.env, 'hola').catch(() => undefined) : undefined,
      career: findCareer(s.career || '')?.name || '',
      role: c.env.ROLE,
    },
  });
});

app.put('/api/settings', async (c) => {
  const b = await c.req.json<Record<string, string>>();
  // Número de WhatsApp: solo dígitos y con el 1 delante si es de RD (809/829/849).
  if ('wa_number' in b) {
    let n = String(b.wa_number || '').replace(/\D/g, '');
    if (/^(809|829|849)\d{7}$/.test(n)) n = '1' + n;
    if (n && n.length < 10) return c.json({ error: 'Ese número de WhatsApp está incompleto. Escríbelo con el código de área, por ejemplo 809 555 1234.' }, 400);
    const other = n ? await userBySetting(c.env, 'wa_number', n) : null;
    if (other && other !== c.env.UID) return c.json({ error: 'Ese número ya lo usa otra cuenta de Rumbo.' }, 409);
    b.wa_number = n;
  }
  for (const k of EDITABLE) if (k in b) await setSetting(c.env, k, String(b[k] ?? ''));
  return c.json({ ok: true });
});

// ---------- Conectar el EVA (cada quien el suyo) ----------
// Opción 1: matrícula y contraseña del EVA. La contraseña va directo a la UAPA una sola vez y NO se guarda.
app.post('/api/eva/connect', async (c) => {
  const b = await c.req.json<{ username?: string; password?: string }>().catch(() => ({} as Record<string, string>));
  if (!b.username?.trim() || !b.password) return c.json({ error: 'Escribe tu matrícula y tu contraseña del EVA.' }, 400);
  const base = c.env.MOODLE_URL.replace(/\/$/, '');
  let token = '';
  // Matrícula tolerante: espacios o guiones se quitan; un usuario con letras se escribe en minúsculas (Moodle lo exige).
  const raw = b.username.trim();
  const username = /^[\d\s-]+$/.test(raw) ? raw.replace(/\D/g, '') : raw.toLowerCase();
  try {
    const res = await fetch(`${base}/login/token.php?service=moodle_mobile_app`, { method: 'POST', body: new URLSearchParams({ username, password: b.password }) });
    const j = (await res.json().catch(() => ({}))) as { token?: string; error?: string; errorcode?: string };
    if (!j.token) return c.json({ error: j.errorcode === 'invalidlogin' ? 'Matrícula o contraseña incorrecta. Escribe los mismos datos con los que entras al EVA (revisa que no haya espacios) o usa «¿Olvidaste tu contraseña?».' : `El EVA no me dejó entrar (${j.error || 'sin respuesta'}). Prueba la opción avanzada de abajo.`, method: 'link' }, 400);
    token = j.token;
  } catch { return c.json({ error: 'No pude comunicarme con el EVA. Inténtalo en un momento.' }, 502); }
  return saveEvaToken(c.env, token).then((r) => c.json(r, r.ok ? 200 : 400));
});

// Opción 2: el enlace que da el EVA al terminar de entrar (moodlemobile://token=…) o el token tal cual.
app.post('/api/eva/token', async (c) => {
  const { value } = await c.req.json<{ value?: string }>().catch(() => ({ value: '' }));
  const v = (value || '').trim();
  let token = /^[a-f0-9]{32}$/i.test(v) ? v : '';
  const m = v.match(/token=([A-Za-z0-9+/=_-]+)/);
  if (!token && m) {
    try { token = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')).split(':::')[1] || ''; } catch { token = ''; }
  }
  if (!/^[a-f0-9]{32}$/i.test(token)) return c.json({ error: 'Eso no parece el enlace del EVA. Debe empezar con moodlemobile://token=' }, 400);
  return saveEvaToken(c.env, token).then((r) => c.json(r, r.ok ? 200 : 400));
});

async function saveEvaToken(env: Env, token: string): Promise<{ ok: boolean; user?: string; error?: string }> {
  // Se prueba antes de guardar: así nunca queda un token que no sirve.
  const res = await fetch(`${env.MOODLE_URL.replace(/\/$/, '')}/webservice/rest/server.php`, { method: 'POST', body: new URLSearchParams({ wstoken: token, wsfunction: 'core_webservice_get_site_info', moodlewsrestformat: 'json' }) });
  const site = (await res.json().catch(() => ({}))) as { fullname?: string; exception?: string; message?: string };
  if (!site.fullname) return { ok: false, error: `El EVA no aceptó la conexión: ${site.message || 'token inválido'}` };
  await setSetting(env, 'moodle_token', token);
  await setSetting(env, 'eva_user', site.fullname);
  await setSetting(env, 'eva_last_error', '');
  return { ok: true, user: site.fullname };
}

app.post('/api/eva/disconnect', async (c) => {
  await setSetting(c.env, 'moodle_token', 'off');
  await setSetting(c.env, 'eva_user', '');
  await setSetting(c.env, 'eva_last_error', '');
  return c.json({ ok: true });
});

// ---------- Avisos por WhatsApp con CallMeBot (cada quien el suyo) ----------
// Se manda un mensaje de prueba ANTES de guardar: si no llega, no queda nada a medias.
app.post('/api/callmebot/setup', async (c) => {
  const b = await c.req.json<{ phone?: string; apikey?: string }>().catch(() => ({} as Record<string, string>));
  let phone = String(b.phone || '').replace(/\D/g, '');
  if (/^(809|829|849)\d{7}$/.test(phone)) phone = '1' + phone;
  const apikey = String(b.apikey || '').trim();
  if (phone.length < 10) return c.json({ error: 'Escribe tu número de WhatsApp con el código de área, por ejemplo 809 555 1234.' }, 400);
  if (!/^[A-Za-z0-9]{4,32}$/.test(apikey)) return c.json({ error: 'La clave (apikey) son los números o letras que te mandó CallMeBot por WhatsApp.' }, 400);
  const other = await userBySetting(c.env, 'wa_number', phone);
  if (other && other !== c.env.UID) return c.json({ error: 'Ese número ya lo usa otra cuenta de Rumbo.' }, 409);
  const name = (await getSettings(c.env)).student_name || '';
  const r = await sendCallMeBot({ ...c.env, WA_MY_NUMBER: phone, CALLMEBOT_APIKEY: apikey }, `*✅ Rumbo conectado${name ? ', ' + name : ''}*\nDesde ahora te llegan aquí el resumen del día, las entregas, las notas nuevas, los pagos y los avisos.`);
  if (r.kind === 'invalid') return c.json({ error: `CallMeBot dice que esa clave no es del número +${phone}. Usa exactamente el mismo WhatsApp desde el que le escribiste a CallMeBot (con el 1 delante si es de RD) y la clave que te mandó.` }, 400);
  if (!r.ok && r.kind !== 'busy') return c.json({ error: `CallMeBot no lo envió: ${r.error}. Inténtalo en un minuto.` }, 400);
  // Saturado: se guarda igual y el mensaje de prueba sale en la próxima vuelta (cada 30 min).
  await setSetting(c.env, 'wa_number', phone);
  await setSetting(c.env, 'callmebot_apikey', apikey);
  if (r.kind === 'busy') await setSetting(c.env, 'wa_outbox', JSON.stringify([{ t: '*✅ Rumbo conectado*\nDesde ahora te llegan aquí el resumen del día y tus avisos.', at: nowSec() }]));
  return c.json({ ok: true, number: phone, pending: r.kind === 'busy' });
});

app.post('/api/callmebot/remove', async (c) => {
  await setSetting(c.env, 'callmebot_apikey', '');
  return c.json({ ok: true });
});

// Acciones manuales
app.post('/api/sync', async (c) => {
  try { return c.json({ ok: true, result: await syncEva(c.env) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

app.post('/api/notify/test', async (c) => c.json(await sendToMe(c.env, await summaryAlert(c.env), { title: '☀️ Tu resumen de hoy', tag: 'summary', url: '/#inicio', pushBody: await summaryShort(c.env) })));

// Diagnóstico y reparación de WhatsApp: suscribe la app a la cuenta de WhatsApp Business para que Meta
// reenvíe tus mensajes al webhook, y muestra el estado del número (usa el token guardado en el servidor).
app.post('/api/whatsapp/repair', async (c) => {
  const env = c.env;
  if (env.ROLE !== 'admin') return c.json({ ok: false, steps: ['Solo el administrador puede revisar la cuenta de WhatsApp.'] }, 403);
  if (!waConfigured(env)) return c.json({ ok: false, steps: ['Faltan secretos WA_PHONE_NUMBER_ID, WA_TOKEN o WA_MY_NUMBER.'] });
  const auth = { Authorization: `Bearer ${env.WA_TOKEN}` };
  const steps: string[] = [];
  const graph = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${GRAPH}/${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
    return { ok: res.ok, body };
  };

  const phone = await graph(`${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,status,quality_rating,account_mode,code_verification_status`);
  if (!phone.ok) return c.json({ ok: false, steps: [`El token no funciona con el número: ${phone.body.error?.message} (código ${phone.body.error?.code})`] });
  const p = phone.body as Record<string, string>;
  steps.push(`Número ${p.display_phone_number} (${p.verified_name || 'sin nombre'}) · estado: ${p.status || '—'} · modo: ${p.account_mode || '—'}`);

  if (!env.WA_WABA_ID) { steps.push('Falta el secreto WA_WABA_ID para revisar la suscripción.'); return c.json({ ok: false, steps }); }
  const before = await graph(`${env.WA_WABA_ID}/subscribed_apps`);
  if (!before.ok) { steps.push(`No pude leer las apps suscritas: ${before.body.error?.message}`); return c.json({ ok: false, steps }); }
  const apps = ((before.body.data as { whatsapp_business_api_data?: { name?: string } }[]) || []).map((a) => a.whatsapp_business_api_data?.name || 'app');
  steps.push(apps.length ? `Apps suscritas antes: ${apps.join(', ')}` : 'No había ninguna app suscrita a la cuenta (por eso no llegaban tus mensajes).');

  const sub = await graph(`${env.WA_WABA_ID}/subscribed_apps`, { method: 'POST' });
  steps.push(sub.ok ? 'Suscripción de la app a la cuenta: hecha ✅' : `No pude suscribir la app: ${sub.body.error?.message} (código ${sub.body.error?.code})`);
  await setSetting(env, 'wa_display_number', (p.display_phone_number || '').replace(/\D/g, ''));
  return c.json({ ok: sub.ok, steps });
});

// Notificaciones de la app (Web Push)
app.get('/api/push/key', async (c) => c.json({ key: await vapidPublicKey(c.env) }));

app.post('/api/push/subscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>();
  if (!b.endpoint?.startsWith('https://') || !b.keys?.p256dh || !b.keys?.auth) return c.json({ error: 'Suscripción inválida.' }, 400);
  await c.env.DB.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`)
    .bind(c.env.UID, b.endpoint, b.keys.p256dh, b.keys.auth, (c.req.header('user-agent') || '').slice(0, 200)).run();
  // Dirección de la app: va en la firma VAPID para que el servicio de push sepa quién envía.
  await setSetting(c.env, 'app_origin', new URL(c.req.url).origin);
  return c.json({ ok: true });
});

app.post('/api/push/unsubscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: string }>();
  if (b.endpoint) await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(b.endpoint, c.env.UID).run();
  return c.json({ ok: true });
});

app.post('/api/push/test', async (c) => {
  const r = await sendPushAll(c.env, { title: '🔔 Notificaciones activadas', body: 'Así te llegarán tus resúmenes, entregas y pagos.', tag: 'test', url: '/#inicio', wa: await waChatLink(c.env).catch(() => undefined) });
  return c.json(r.sent ? { ok: true, ...r } : { ok: false, ...r, error: r.error || 'No hay dispositivos suscritos.' });
});

// Plan de la semana: ver cómo llega y mandarlo ya (sale solo los domingos).
app.get('/api/plan/preview', async (c) => c.json(await weeklyPlan(c.env)));
app.post('/api/plan/send', async (c) => {
  const p = await weeklyPlan(c.env);
  return c.json(await sendToMe(c.env, p.text, { title: '🗓️ Tu plan de la semana', pushBody: p.short, tag: 'plan', url: '/#tareas' }));
});

app.get('/api/summary-preview', async (c) => c.json({ text: await summaryAlert(c.env) }));

// Asistente en la app: guarda la conversación (memoria corta) y responde.
async function chatApp(env: Env, text: string): Promise<string> {
  await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'in', 'app', text.slice(0, 2000)).run();
  const reply = await handleCommand(env, text, 'app');
  await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'out', 'app', reply.slice(0, 4000)).run();
  return reply;
}

app.post('/api/assistant', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ reply: await handleCommand(c.env, 'ayuda') });
  return c.json({ reply: await chatApp(c.env, text.trim()) });
});

// Nota de voz desde la app: se transcribe con Whisper y se responde igual que un mensaje escrito.
app.post('/api/assistant/voice', async (c) => {
  const audio = new Uint8Array(await c.req.arrayBuffer());
  if (audio.length < 800) return c.json({ error: 'El audio quedó vacío. Mantén pulsado un poco más.' }, 400);
  try {
    const heard = await transcribeAudio(c.env, audio, c.req.header('content-type') || 'audio/webm');
    if (!heard) return c.json({ heard: '', reply: 'No logré entender el audio 😅. ¿Me lo repites un poco más despacio?' });
    return c.json({ heard, reply: await chatApp(c.env, heard) });
  } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

// Chat en streaming: los comandos rápidos responden al instante; lo demás lo escribe la IA en vivo.
app.post('/api/assistant/stream', async (c) => {
  const { text, voice } = await c.req.json<{ text?: string; voice?: boolean }>();
  const msg = (text || '').trim().slice(0, 2000);
  const env = c.env;
  const headers = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' };
  if (!msg) return new Response(`data: ${JSON.stringify({ t: 'done', text: await handleCommand(env, 'ayuda'), say: '', done: [] })}

`, { headers });
  await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'in', 'app', msg).run();
  const save = (reply: string) => env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'out', 'app', reply.slice(0, 4000)).run().then(() => undefined);
  const quick = voice ? '' : await handleCommand(env, msg, 'app', { noAi: true });
  if (quick) {
    await save(quick);
    return new Response(`data: ${JSON.stringify({ t: 'done', text: quick, say: '', done: [] })}

`, { headers });
  }
  return new Response(aiStream(env, msg, 'app', save, { voice: !!voice }), { headers });
});

// Llamada de voz: recibe el audio, lo transcribe y responde en streaming (frases cortas para hablar).
app.post('/api/assistant/voice-stream', async (c) => {
  const audio = new Uint8Array(await c.req.arrayBuffer());
  const headers = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' };
  if (audio.length < 800) return new Response(`data: ${JSON.stringify({ t: 'done', text: '', say: '', done: [], empty: true })}

`, { headers });
  const env = c.env;
  const save = (reply: string) => env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'out', 'app', reply.slice(0, 4000)).run().then(() => undefined);
  return new Response(aiStream(env, '', 'app', save, { voice: true, audio, mime: c.req.header('content-type') || 'audio/webm' }), { headers });
});

// Solo transcribe (la app luego pide la respuesta en streaming).
app.post('/api/assistant/transcribe', async (c) => {
  const audio = new Uint8Array(await c.req.arrayBuffer());
  if (audio.length < 800) return c.json({ error: 'El audio quedó vacío.' }, 400);
  try { return c.json({ heard: await transcribeAudio(c.env, audio, c.req.header('content-type') || 'audio/webm') }); }
  catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

// Voz del asistente (Deepgram Aura-2 en español). Tope diario para no gastar la cuota gratis de IA:
// si se pasa, la app usa la voz del teléfono.
const VOICES = ['aquila', 'celeste', 'selena', 'sirio', 'javier', 'estrella', 'nestor', 'carina', 'alvaro', 'diana'];
// Aura-2 es cara en la cuota gratis de Workers AI (~2.7 neuronas por letra): tope bajo y el resto con la voz del teléfono.
const TTS_DAILY_CHARS = 700;
app.post('/api/tts', async (c) => {
  const { text, voice } = await c.req.json<{ text?: string; voice?: string }>();
  const t = (text || '').replace(/[*_~#•]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!t) return c.json({ error: 'Sin texto' }, 400);
  const s = await getSettings(c.env);
  const today = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  const used = s.tts_day === today ? Number(s.tts_chars || 0) : 0;
  if (used + t.length > TTS_DAILY_CHARS) return c.json({ error: 'Se acabó la voz premium de hoy', fallback: true }, 429);
  try {
    const speaker = VOICES.includes(voice || '') ? voice : 'aquila';
    const out = await c.env.AI.run('@cf/deepgram/aura-2-es' as Parameters<Ai['run']>[0], { text: t, speaker, encoding: 'mp3' } as never, { returnRawResponse: true } as never) as unknown;
    if (out instanceof Response && !/audio/.test(out.headers.get('content-type') || '')) throw new Error((await out.text()).slice(0, 160));
    const body = out instanceof Response ? out.body : (out as { audio?: string }).audio ? Uint8Array.from(atob((out as { audio: string }).audio), (ch) => ch.charCodeAt(0)) : (out as ReadableStream);
    await setSetting(c.env, 'tts_day', today);
    await setSetting(c.env, 'tts_chars', String(used + t.length));
    return new Response(body as BodyInit, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return c.json({ error: (e as Error).message, fallback: true }, 502);
  }
});

// Memoria de largo plazo del asistente (ver / editar / borrar)
app.get('/api/assistant/memory', async (c) => c.json({ memory: await getMemory(c.env) }));
app.put('/api/assistant/memory', async (c) => {
  const { memory } = await c.req.json<{ memory?: string }>();
  await setMemory(c.env, memory || '');
  return c.json({ ok: true });
});

app.post('/api/assistant/reset', async (c) => {
  await c.env.DB.prepare(`DELETE FROM messages WHERE user_id = ? AND channel = 'app'`).bind(c.env.UID).run();
  return c.json({ ok: true });
});

app.get('/api/messages', async (c) => {
  const ch = c.req.query('channel');
  const { results } = await (ch
    ? c.env.DB.prepare('SELECT id, direction, channel, body, created_at FROM messages WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT 60').bind(c.env.UID, ch)
    : c.env.DB.prepare('SELECT id, direction, channel, body, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 40').bind(c.env.UID)).all();
  return c.json(results.reverse());
});

app.post('/api/cron/run', async (c) => c.env.ROLE === 'admin' ? c.json({ log: await runScheduled({ ...c.env, UID: 0 }) }) : c.json({ error: 'Solo el administrador.' }, 403));

app.all('/api/*', (c) => c.json({ error: 'Ruta no encontrada' }, 404));

// Durable Object de las pantallas en vivo (wrangler.jsonc → durable_objects).
export { RumboLive };

export default {
  // Sin sesión todavía, el Env es «del sistema» (UID 0); el middleware lo cambia por el del usuario.
  // loadTelegramToken completa el Env con las llaves guardadas en /llaves.
  fetch: async (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, await loadTelegramToken({ ...env, UID: 0 }), ctx),
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(loadTelegramToken({ ...env, UID: 0 }).then((e) => runScheduled(e)).then((log) => console.log(log.join(' | '))));
  },
} satisfies ExportedHandler<Env>;
