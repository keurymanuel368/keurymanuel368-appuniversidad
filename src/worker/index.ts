import { Hono } from 'hono';
import type { Env } from './env';
import { clearSessionCookie, createSessionCookie, isAuthenticated, safeEqual, verifyMetaSignature } from './auth';
import { courseSummaries, dashboard, listTasks, payWindow, summaryShort, summaryText } from './data';
import { getSettings, markSent, setSetting } from './db';
import { classifyNews, cleanNewsText, syncEva } from './moodle';
import { GRAPH, callmebotConfigured, logInbound, sendToMe, sendWhatsApp, waChatLink, waConfigured, waWindowOpen } from './notify';
import { sendPushAll, vapidPublicKey } from './push';
import { transcribeAudio, transcribeWhatsAppAudio } from './voice';
import { downloadTelegramFile, sendTelegram, setupTelegram, telegramReady, tgCall } from './telegram';
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
import { nowSec } from './time';

const app = new Hono<{ Bindings: Env }>();

// ---------- Salud y sesión ----------
app.get('/api/health', (c) => c.json({ ok: true }));
// Versión publicada: la app web y la app del widget la consultan para actualizarse solas.
app.get('/api/version', (c) => c.json({ app: CHANGELOG[0].version, widget: WIDGET_VERSION, apk: `${new URL(c.req.url).origin}/rumbo-widget.apk?v=${WIDGET_VERSION}` }, 200, { 'Cache-Control': 'no-store' }));

app.post('/api/login', async (c) => {
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  if (!c.env.APP_PASSWORD || !c.env.SESSION_SECRET) return c.json({ error: 'Faltan los secretos APP_PASSWORD y SESSION_SECRET en el servidor.' }, 500);
  // Protección contra quien intente adivinar la contraseña: 5 intentos fallidos = 15 minutos bloqueado.
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const since = nowSec() - 15 * 60;
  const fails = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?').bind(ip, since).first<{ n: number }>().catch(() => null))?.n || 0;
  if (fails >= 5) return c.json({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo otra vez.' }, 429);
  if (!password || !safeEqual(password, c.env.APP_PASSWORD)) {
    await c.env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, nowSec()).run().catch(() => {});
    if (fails + 1 >= 5) await sendToMe(c.env, '*🔐 Bloqueé intentos de entrar a Rumbo*\nAlguien falló la contraseña 5 veces. Si no fuiste tú, no pasa nada: quedó bloqueado 15 minutos.', { title: '🔐 Intentos fallidos de entrar', tag: 'security' }).catch(() => {});
    return c.json({ error: fails + 1 >= 5 ? 'Demasiados intentos. Espera 15 minutos e inténtalo otra vez.' : `Contraseña incorrecta. Te quedan ${4 - fails} intento${4 - fails === 1 ? '' : 's'}.` }, 401);
  }
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE ip = ? OR at < ?').bind(ip, nowSec() - 86400).run().catch(() => {});
  c.header('Set-Cookie', await createSessionCookie(c.env));
  // Aviso de seguridad: alguien (tú) entró desde un dispositivo.
  const ua = c.req.header('user-agent') || '';
  const device = `${/Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'otro dispositivo'} · ${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'navegador'}`;
  c.executionCtx.waitUntil(sendToMe(c.env, `*🔐 Nuevo inicio de sesión en Rumbo*\n${device}. Si no fuiste tú, ve a Ajustes → Cerrar sesión en todos los dispositivos.`, { title: '🔐 Nuevo inicio de sesión', pushBody: `${device}. Si no fuiste tú, cierra todas las sesiones en Ajustes.`, tag: 'security', url: '/#ajustes' }).catch(() => undefined));
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie());
  return c.json({ ok: true });
});

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
  const me = (c.env.WA_MY_NUMBER || '').replace(/\D/g, '');
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
    if (!me || m.from.replace(/\D/g, '') !== me) continue; // solo responde a tu número
    if (m.id && !(await markSent(c.env, `wa:${m.id}`))) continue; // Meta a veces reenvía el mismo mensaje
    await setSetting(c.env, 'wa_last_inbound', String(nowSec()));
    // Se responde a Meta al instante y el trabajo (transcribir, consultar) sigue en segundo plano.
    c.executionCtx.waitUntil(answerWhatsApp(c.env, m));
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
  const token = await getSettings(c.env).then((s) => s.mail_token || '');
  if (!token || !safeEqual(c.req.header('x-rumbo-token') || '', token)) return c.json({ error: 'Clave inválida' }, 401);
  type Mail = { id: string; from?: string; subject?: string; date?: number; body?: string; url?: string };
  const b = await c.req.json<{ messages?: Mail[] }>().catch(() => ({ messages: [] as Mail[] }));
  const msgs = (b.messages || []).slice(0, 60);
  const first = !(await c.env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE source = 'correo' LIMIT 1`).first());
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
    const dup = await c.env.DB.prepare(`SELECT 1 AS x FROM announcements WHERE source = 'correo' AND title = ? AND substr(body, 1, 300) = substr(?, 1, 300) AND created_at > ? LIMIT 1`)
      .bind(title, body, nowSec() - 14 * 86400).first();
    if (dup) continue;
    const row = await c.env.DB.prepare(`INSERT OR IGNORE INTO announcements (source, ext_id, title, body, author, url, kind, created_at) VALUES ('correo', ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(m.id, title, body, from || null, m.url || null, kind, Math.floor(m.date || nowSec())).first<{ id: number }>();
    if (row) { saved++; if (!first) fresh.push({ id: row.id, title, body, kind, from }); }
  }
  await setSetting(c.env, 'mail_last_at', String(nowSec()));
  // Notifica los correos nuevos sobre pagos o eventos (los demás quedan en Avisos sin molestar).
  for (const f of fresh.filter((x) => x.kind === 'pago' || x.kind === 'evento').slice(0, 5)) {
    const icon = f.kind === 'pago' ? '💳' : '🎉';
    c.executionCtx.waitUntil(sendToMe(c.env, `*${icon} ${f.title}*\n_${f.from}_\n\n${f.body.slice(0, 600)}`,
      { type: f.kind === 'pago' ? 'pagos' : 'avisos', title: `${icon} ${f.title}`.slice(0, 90), tag: `mail-${f.kind}`, url: `/#avisos/${f.id}`, pushBody: `${f.from ? f.from + ' · ' : ''}${f.body.slice(0, 180)}` }));
  }
  return c.json({ ok: true, received: msgs.length, saved });
});

// ---------- Telegram (público, verificado con la clave secreta que Telegram reenvía) ----------
app.post('/api/telegram/webhook', async (c) => {
  const secret = await getSettings(c.env).then((s) => s.tg_secret || '');
  if (!secret || !safeEqual(c.req.header('x-telegram-bot-api-secret-token') || '', secret)) return c.text('Forbidden', 403);
  type TgMsg = { message_id: number; chat: { id: number }; text?: string; voice?: { file_id: string }; audio?: { file_id: string } };
  const update = await c.req.json<{ update_id: number; message?: TgMsg }>().catch(() => null);
  const m = update?.message;
  if (!m || !(await markSent(c.env, `tg:${update!.update_id}`))) return c.json({ ok: true });
  c.executionCtx.waitUntil(answerTelegram(c.env, m));
  return c.json({ ok: true });
});

async function answerTelegram(env: Env, m: { chat: { id: number }; text?: string; voice?: { file_id: string }; audio?: { file_id: string } }): Promise<void> {
  const chat = String(m.chat.id);
  const s = await getSettings(env);
  const text = (m.text || '').trim();
  // Vincular: el primer "/start <código>" con el código de Ajustes queda como tu chat.
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1] || '';
    if (s.tg_link_code && code === s.tg_link_code) {
      await setSetting(env, 'tg_chat_id', chat);
      await sendTelegram(env, `*¡Listo${s.student_name ? ', ' + s.student_name : ''}!* 🎉 Rumbo quedó conectado.\n\nPregúntame lo que quieras de tu trimestre, mándame una *nota de voz*, o escribe "ayuda".`, chat);
    } else if (s.tg_chat_id !== chat) {
      await sendTelegram(env, 'Este es un bot privado de Rumbo. Para vincularlo, abre el enlace desde Ajustes → Telegram en la app.', chat);
    } else {
      await sendTelegram(env, await handleCommand(env, 'ayuda'), chat);
    }
    return;
  }
  if (!s.tg_chat_id || s.tg_chat_id !== chat) { await sendTelegram(env, 'Este es un bot privado de Rumbo.', chat); return; }
  try {
    await tgCall(env, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
    const fileId = m.voice?.file_id || m.audio?.file_id;
    if (fileId) {
      const heard = await transcribeAudio(env, await downloadTelegramFile(env, fileId));
      await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('in', 'telegram', `🎤 ${heard || '(audio sin palabras)'}`).run();
      if (!heard) { await sendTelegram(env, 'No logré entender el audio 😅. ¿Me lo repites o me lo escribes?', chat); return; }
      await sendTelegram(env, `🎤 _"${heard}"_\n\n${await handleCommand(env, heard, 'telegram')}`, chat);
      return;
    }
    if (!text) { await sendTelegram(env, 'Por ahora entiendo texto y notas de voz.', chat); return; }
    await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('in', 'telegram', text).run();
    await sendTelegram(env, await handleCommand(env, text.replace(/^\//, ''), 'telegram'), chat);
  } catch (e) {
    await sendTelegram(env, `No pude responder: ${(e as Error).message}`, chat);
  }
}

// ---------- Calendario (público con tu enlace privado): tus entregas en Google Calendar o iPhone ----------
app.get('/api/calendar/:token', async (c) => {
  const s = await getSettings(c.env);
  const token = c.req.param('token').replace(/\.ics$/, '');
  if (!s.calendar_token || !safeEqual(token, s.calendar_token)) return c.text('No encontrado', 404);
  return new Response(await calendarIcs(c.env), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
});

// ---------- Widget del teléfono (público con tu clave privada; solo lectura) ----------
app.get('/api/widget/:token', async (c) => {
  const s = await getSettings(c.env);
  if (!s.widget_token || !safeEqual(c.req.param('token'), s.widget_token)) return c.json({ error: 'No encontrado' }, 404);
  return c.json(await widgetData(c.env), 200, { 'Cache-Control': 'no-store' });
});

// ---------- Novedades: lo llama `npm run deploy` al terminar; cada versión se anuncia una sola vez ----------
app.post('/api/release/announce', async (c) => {
  await announceRelease(c.env);
  return c.json({ ok: true, version: CHANGELOG[0].version });
});

// ---------- A partir de aquí, todo requiere sesión ----------
app.use('/api/*', async (c, next) => {
  if (!(await isAuthenticated(c.env, c.req.header('cookie') || null))) return c.json({ error: 'No autorizado' }, 401);
  await next();
});

app.get('/api/me', (c) => c.json({ ok: true }));

app.get('/api/mascot', async (c) => c.json(await widgetData(c.env)));
app.get('/api/dashboard', async (c) => c.json({ ...(await dashboard(c.env)), mascot: await widgetData(c.env) }));

// Tareas
app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  return c.json(await listTasks(c.env, { status: status || undefined, limit: 300 }));
});

app.get('/api/tasks/:id', async (c) => {
  const [t] = await listTasks(c.env, { id: Number(c.req.param('id')), limit: 1 });
  return t ? c.json(t) : c.json({ error: 'Tarea no encontrada.' }, 404);
});

app.post('/api/tasks', async (c) => {
  const b = await c.req.json<{ title: string; due_at?: number | null; course_id?: number | null; notes?: string }>();
  if (!b.title?.trim()) return c.json({ error: 'El título es obligatorio.' }, 400);
  const r = await c.env.DB.prepare(`INSERT INTO tasks (title, due_at, course_id, notes, source, status) VALUES (?, ?, ?, ?, 'manual', 'pending') RETURNING id`)
    .bind(b.title.trim(), b.due_at ?? null, b.course_id ?? null, b.notes ?? null).first<{ id: number }>();
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
  await c.env.DB.prepare(`UPDATE tasks SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).bind(...binds, nowSec(), id).run();
  return c.json({ ok: true });
});

app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(Number(c.req.param('id'))).run();
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
  if (!telegramReady(c.env)) return c.json({ error: 'Falta el secreto TELEGRAM_BOT_TOKEN. Créalo con: npx wrangler secret put TELEGRAM_BOT_TOKEN' }, 400);
  try { return c.json(await setupTelegram(c.env, new URL(c.req.url).origin)); }
  catch (e) { return c.json({ error: (e as Error).message }, 502); }
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
app.get('/api/backups', async (c) => c.json({ enabled: !!c.env.BACKUPS, list: await listBackups(c.env) }));
app.post('/api/backups', async (c) => {
  try { return c.json({ ok: true, backup: await makeBackup(c.env) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 500); }
});
app.get('/api/backups/download', async (c) => {
  const key = c.req.query('key');
  let json: string;
  if (key && c.env.BACKUPS) {
    const buf = await c.env.BACKUPS.get(key, 'arrayBuffer');
    if (!buf) return c.json({ error: 'Copia no encontrada' }, 404);
    json = await gunzip(buf);
  } else json = JSON.stringify(await dumpData(c.env)); // sin clave: tus datos de este momento
  const name = `rumbo-datos-${(key || new Date().toISOString()).replace(/^backup:/, '').slice(0, 19).replace(/[:T]/g, '-')}.json`;
  return new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
});

// Modo estudio con IA (plan, tarjetas o explicación de una tarea)
app.post('/api/study/:id', async (c) => {
  const b = await c.req.json<{ mode?: string; fresh?: boolean }>().catch(() => ({} as { mode?: string; fresh?: boolean }));
  const mode = (['plan', 'tarjetas', 'explica'].includes(b.mode || '') ? b.mode : 'plan') as StudyMode;
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
  await c.env.DB.prepare('UPDATE tasks SET focus_minutes = focus_minutes + ? WHERE id = ?').bind(m, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.get('/api/changelog', (c) => c.json(CHANGELOG));

app.post('/api/ai/test', async (c) => c.json({ results: await testEngines(c.env) }));

// Contadores para los numeritos rojos (barra, menú e icono de la app)
app.get('/api/badges', async (c) => {
  c.executionCtx.waitUntil(announceRelease(c.env).catch((e) => console.log('Novedades: ' + (e as Error).message)));
  const now = nowSec();
  const endOfDay = now + 86400 - ((now - 4 * 3600) % 86400); // fin del día en hora de RD
  const seen = Number((await getSettings(c.env)).news_seen_id || 0);
  const news = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements WHERE read = 0 AND id > ? AND (source IN ('avisos', 'correo', 'rumbo', 'notas') OR kind IN ('pago', 'evento'))`).bind(seen).first<{ n: number }>();
  // Tareas: lo que vence hoy y lo vencido en los últimos 3 días (lo más viejo ya no suma).
  const tasks = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE status = 'pending' AND due_at IS NOT NULL AND due_at < ? AND due_at > ?`).bind(endOfDay, now - 3 * 86400).first<{ n: number }>();
  return c.json({ news: news?.n ?? 0, tasks: tasks?.n ?? 0 });
});

// Avisos y novedades (EVA y correo)
app.get('/api/announcements', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT a.id, a.source, a.title, a.body, a.author, a.url, a.kind, a.created_at, a.read, c.name AS course_name, c.color AS course_color
    FROM announcements a LEFT JOIN courses c ON c.id = a.course_id ORDER BY a.created_at DESC, a.id DESC LIMIT 120`).all<{ body: string | null; title: string }>();
  return c.json(results.map((r) => ({ ...r, title: cleanNewsText(r.title), body: r.body ? cleanNewsText(r.body) : r.body })));
});

// Al abrir Avisos, el numerito rojo se limpia (los puntos azules de cada aviso siguen hasta que lo abras).
app.post('/api/announcements/seen', async (c) => {
  const r = await c.env.DB.prepare('SELECT MAX(id) AS m FROM announcements').first<{ m: number | null }>();
  await setSetting(c.env, 'news_seen_id', String(r?.m ?? 0));
  return c.json({ ok: true });
});

app.post('/api/announcements/read', async (c) => {
  const b = await c.req.json<{ ids?: number[] }>().catch(() => ({} as { ids?: number[] }));
  if (b.ids?.length) await c.env.DB.prepare(`UPDATE announcements SET read = 1 WHERE id IN (${b.ids.map(() => '?').join(',')})`).bind(...b.ids).run();
  else await c.env.DB.prepare('UPDATE announcements SET read = 1 WHERE read = 0').run();
  return c.json({ ok: true });
});

// Asignaturas y notas
app.get('/api/courses', async (c) => c.json(await courseSummaries(c.env)));

// Historial: asignaturas de trimestres anteriores con su promedio final
app.get('/api/courses/history', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT c.id, c.code, c.name, c.color, c.updated_at,
      (SELECT AVG(g.grade * 100.0 / g.grade_max) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL AND g.grade_max > 0) AS average,
      (SELECT COUNT(*) FROM grades g WHERE g.course_id = c.id AND g.grade IS NOT NULL) AS graded,
      (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id AND t.status = 'done') AS delivered
    FROM courses c WHERE c.active = 0 AND c.moodle_id IS NOT NULL ORDER BY c.updated_at DESC`).all<{ average: number | null }>();
  return c.json(results.map((r) => ({ ...r, average: r.average === null ? null : Math.round(r.average * 10) / 10 })));
});

app.get('/api/courses/:id/grades', async (c) => {
  // Cada nota trae su tarea (si existe) para abrir la ficha desde Notas.
  const { results } = await c.env.DB.prepare(`SELECT g.id, g.item_name, g.grade, g.grade_max, t.id AS task_id, t.due_at, t.status
    FROM grades g LEFT JOIN tasks t ON g.moodle_key IS NOT NULL AND t.moodle_key = g.moodle_key
    WHERE g.course_id = ? ORDER BY COALESCE(t.due_at, 9999999999), g.id`).bind(Number(c.req.param('id'))).all();
  return c.json(results);
});

app.post('/api/courses', async (c) => {
  const b = await c.req.json<{ name: string; code?: string; color?: string; facilitator?: string }>();
  if (!b.name?.trim()) return c.json({ error: 'El nombre es obligatorio.' }, 400);
  await c.env.DB.prepare('INSERT INTO courses (name, code, short_name, color, facilitator) VALUES (?, ?, ?, ?, ?)')
    .bind(b.name.trim(), b.code || null, b.code || b.name.trim().split(' ')[0], b.color || '#1F5FE0', b.facilitator || null).run();
  return c.json({ ok: true });
});

app.patch('/api/courses/:id', async (c) => {
  const b = await c.req.json<Partial<{ name: string; code: string; short_name: string; color: string; facilitator: string; active: number }>>();
  const fields: string[] = [], binds: unknown[] = [];
  for (const k of ['name', 'code', 'short_name', 'color', 'facilitator', 'active'] as const) {
    if (k in b) { fields.push(`${k} = ?`); binds.push((b as Record<string, unknown>)[k] ?? null); }
  }
  if (fields.length) await c.env.DB.prepare(`UPDATE courses SET ${fields.join(', ')} WHERE id = ?`).bind(...binds, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Pagos
app.get('/api/payments', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, period, amount, paid_at, note FROM payments ORDER BY paid_at DESC LIMIT 60').all();
  return c.json({ window: await payWindow(c.env), history: results });
});

app.post('/api/payments', async (c) => {
  const b = await c.req.json<{ period?: string; amount?: number | null; note?: string }>();
  const period = b.period || (await payWindow(c.env)).period;
  await c.env.DB.prepare('INSERT INTO payments (period, amount, paid_at, note) VALUES (?, ?, ?, ?)').bind(period, b.amount ?? null, nowSec(), b.note ?? null).run();
  return c.json({ ok: true });
});

app.delete('/api/payments/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Pensum
app.get('/api/pensum', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, term, code, name, credits, status, grade, prereqs, coreqs, kind FROM pensum ORDER BY term, id').all();
  return c.json(results);
});

type PensumRow = { term: number; code?: string; name: string; credits?: number; status?: string; grade?: number | null; prereqs?: string; coreqs?: string; kind?: string };
const insertPensum = (env: Env, r: PensumRow) => env.DB.prepare('INSERT INTO pensum (term, code, name, credits, status, grade, prereqs) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .bind(Number(r.term) || 1, r.code || null, r.name, Number(r.credits) || 0, r.status || 'pendiente', r.grade ?? null, r.prereqs || null);

app.post('/api/pensum', async (c) => {
  const b = await c.req.json<PensumRow>();
  if (!b.name?.trim()) return c.json({ error: 'El nombre es obligatorio.' }, 400);
  await insertPensum(c.env, b).run();
  return c.json({ ok: true });
});

app.post('/api/pensum/import', async (c) => {
  const rows = await c.req.json<PensumRow[]>();
  if (!Array.isArray(rows) || !rows.length) return c.json({ error: 'Envía una lista de asignaturas.' }, 400);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM pensum'), ...rows.filter((r) => r.name).map((r) => insertPensum(c.env, r))]);
  return c.json({ ok: true, count: rows.length });
});

app.patch('/api/pensum/:id', async (c) => {
  const b = await c.req.json<Partial<PensumRow>>();
  const fields: string[] = [], binds: unknown[] = [];
  for (const k of ['term', 'code', 'name', 'credits', 'status', 'grade', 'prereqs', 'coreqs', 'kind'] as const) {
    if (k in b) { fields.push(`${k} = ?`); binds.push((b as Record<string, unknown>)[k] ?? null); }
  }
  if (fields.length) await c.env.DB.prepare(`UPDATE pensum SET ${fields.join(', ')} WHERE id = ?`).bind(...binds, Number(c.req.param('id'))).run();
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
  const { results: old } = await c.env.DB.prepare('SELECT code, name, status, grade FROM pensum').all<{ code: string | null; name: string; status: string; grade: number | null }>();
  const { results: eva } = await c.env.DB.prepare('SELECT code, name FROM courses WHERE active = 1').all<{ code: string | null; name: string }>();
  const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.length > 6 && y.length > 6 && (x.includes(y) || y.includes(x)); };
  let enCurso = 0;
  const rows = car.pensum.items.map((it) => {
    const prev = old.find((o) => (it.code && o.code === it.code) || same(o.name, it.name));
    const inEva = eva.some((e) => (it.code && e.code === it.code) || same(e.name, it.name));
    const status = prev && prev.status !== 'pendiente' ? prev.status : inEva ? 'en_curso' : 'pendiente';
    if (status === 'en_curso') enCurso++;
    return c.env.DB.prepare('INSERT INTO pensum (term, code, name, credits, status, grade, prereqs, coreqs, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(it.term, it.code, it.name, it.credits, status, prev?.grade ?? null, it.prereqs || null, it.coreqs || null, it.kind || 'obligatoria');
  });
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM pensum'), ...rows]);
  await setSetting(c.env, 'career', car.id);
  return c.json({ ok: true, count: rows.length, enCurso });
});

app.delete('/api/pensum/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM pensum WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// Ajustes
const EDITABLE = ['notify_tareas', 'notify_notas', 'notify_pagos', 'notify_avisos', 'notify_resumen', 'notify_novedades', 'push_also_wa', 'summary_hour', 'summary_enabled', 'task_reminders', 'pay_open_day', 'pay_close_day', 'pay_remind_days', 'pay_amount', 'term_start', 'term_end', 'student_name', 'eva_sync_hours', 'study_hour', 'study_enabled'];

app.get('/api/settings', async (c) => {
  const s = await getSettings(c.env);
  return c.json({
    settings: Object.fromEntries(EDITABLE.map((k) => [k, s[k] ?? ''])),
    status: {
      eva: { configured: !!c.env.MOODLE_TOKEN, lastSync: Number(s.eva_last_sync || 0) || null, error: s.eva_last_error || '', user: s.eva_user || '' },
      whatsapp: { configured: waConfigured(c.env), windowOpen: await waWindowOpen(c.env), lastInbound: Number(s.wa_last_inbound || 0) || null, lastError: s.wa_last_error || '' },
      callmebot: { configured: callmebotConfigured(c.env) },
      mail: { connected: !!s.mail_token, lastAt: Number(s.mail_last_at || 0) || null },
      telegram: { configured: telegramReady(c.env), connected: !!s.tg_chat_id, username: s.tg_username || '' },
      ai: { engines: [...providers(c.env).map((p) => p.name), ...(c.env.AI ? ['Workers AI'] : [])] },
      calendar: { connected: !!s.calendar_token },
      push: { devices: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first<{ n: number }>())?.n ?? 0 },
      voice: { ready: !!c.env.AI && waConfigured(c.env) },
      waLink: waConfigured(c.env) ? await waChatLink(c.env, 'hola').catch(() => undefined) : undefined,
    },
  });
});

app.put('/api/settings', async (c) => {
  const b = await c.req.json<Record<string, string>>();
  for (const k of EDITABLE) if (k in b) await setSetting(c.env, k, String(b[k] ?? ''));
  return c.json({ ok: true });
});

// Acciones manuales
app.post('/api/sync', async (c) => {
  try { return c.json({ ok: true, result: await syncEva(c.env) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

app.post('/api/notify/test', async (c) => c.json(await sendToMe(c.env, await summaryText(c.env), { title: '☀️ Tu resumen de hoy', tag: 'summary', pushBody: await summaryShort(c.env) })));

// Diagnóstico y reparación de WhatsApp: suscribe la app a la cuenta de WhatsApp Business para que Meta
// reenvíe tus mensajes al webhook, y muestra el estado del número (usa el token guardado en el servidor).
app.post('/api/whatsapp/repair', async (c) => {
  const env = c.env;
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
  await c.env.DB.prepare(`INSERT INTO push_subs (endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`)
    .bind(b.endpoint, b.keys.p256dh, b.keys.auth, (c.req.header('user-agent') || '').slice(0, 200)).run();
  // Dirección de la app: va en la firma VAPID para que el servicio de push sepa quién envía.
  await setSetting(c.env, 'app_origin', new URL(c.req.url).origin);
  return c.json({ ok: true });
});

app.post('/api/push/unsubscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: string }>();
  if (b.endpoint) await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(b.endpoint).run();
  return c.json({ ok: true });
});

app.post('/api/push/test', async (c) => {
  const r = await sendPushAll(c.env, { title: '🔔 Notificaciones activadas', body: 'Así te llegarán tus resúmenes, entregas y pagos.', tag: 'test', url: '/#inicio', wa: await waChatLink(c.env).catch(() => undefined) });
  return c.json(r.sent ? { ok: true, ...r } : { ok: false, ...r, error: r.error || 'No hay dispositivos suscritos.' });
});

app.get('/api/summary-preview', async (c) => c.json({ text: await summaryText(c.env) }));

// Asistente en la app: guarda la conversación (memoria corta) y responde.
async function chatApp(env: Env, text: string): Promise<string> {
  await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('in', 'app', text.slice(0, 2000)).run();
  const reply = await handleCommand(env, text, 'app');
  await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('out', 'app', reply.slice(0, 4000)).run();
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
  await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('in', 'app', msg).run();
  const save = (reply: string) => env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('out', 'app', reply.slice(0, 4000)).run().then(() => undefined);
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
  const save = (reply: string) => env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind('out', 'app', reply.slice(0, 4000)).run().then(() => undefined);
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
  await c.env.DB.prepare(`DELETE FROM messages WHERE channel = 'app'`).run();
  return c.json({ ok: true });
});

app.get('/api/messages', async (c) => {
  const ch = c.req.query('channel');
  const { results } = await (ch
    ? c.env.DB.prepare('SELECT id, direction, channel, body, created_at FROM messages WHERE channel = ? ORDER BY id DESC LIMIT 60').bind(ch)
    : c.env.DB.prepare('SELECT id, direction, channel, body, created_at FROM messages ORDER BY id DESC LIMIT 40')).all();
  return c.json(results.reverse());
});

app.post('/api/cron/run', async (c) => c.json({ log: await runScheduled(c.env) }));

app.all('/api/*', (c) => c.json({ error: 'Ruta no encontrada' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env).then((log) => console.log(log.join(' | '))));
  },
} satisfies ExportedHandler<Env>;
