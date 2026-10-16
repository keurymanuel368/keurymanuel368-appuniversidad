// Avisos para ti, siempre por canales gratis:
// 1) Notificaciones de la app (Web Push): llegan siempre a los dispositivos donde las activaste.
// 2) API oficial de WhatsApp Cloud con el número de prueba de Meta (no se cobra), dentro de la
//    ventana de 24 h que se abre cada vez que tú le escribes al asistente.
// 3) CallMeBot (opcional) cuando esa ventana está cerrada, si lo configuraste.
import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { sendPushAll } from './push';
import { sendTelegram, telegramReady, TG_MINI, type TgKb } from './telegram';
import { localDate, nowSec } from './time';

export type Channel = 'whatsapp' | 'callmebot' | 'push' | 'telegram';
export type SendResult = { ok: boolean; channels: Channel[]; error?: string };

export const GRAPH = 'https://graph.facebook.com/v21.0';

export function waConfigured(env: Env): boolean {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_TOKEN && env.WA_MY_NUMBER);
}

/** El número del asistente (de Rumbo, compartido por todos) está listo para recibir mensajes. */
export function waServerReady(env: Env): boolean {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_TOKEN);
}

export function callmebotConfigured(env: Env): boolean {
  return !!(env.CALLMEBOT_APIKEY && env.WA_MY_NUMBER);
}

async function log(env: Env, direction: 'in' | 'out', channel: string, body: string) {
  await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, direction, channel, body.slice(0, 4000)).run();
}

export async function logInbound(env: Env, body: string) {
  await log(env, 'in', 'whatsapp', body);
}

/** Envía texto libre por la API de WhatsApp Cloud. Solo funciona dentro de la ventana de 24 h. */
export async function sendWhatsApp(env: Env, text: string, to = env.WA_MY_NUMBER || ''): Promise<{ ok: boolean; error?: string }> {
  if (!waConfigured(env)) return { ok: false, error: 'WhatsApp no configurado' };
  const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: text } }),
  });
  if (!res.ok) {
    const err = (await res.text()).slice(0, 300);
    console.error(`WhatsApp no aceptó el envío (${res.status}): ${err}`);
    await setSetting(env, 'wa_last_error', `${new Date().toISOString()} · envío ${res.status}: ${err}`);
    return { ok: false, error: err };
  }
  await log(env, 'out', 'whatsapp', text);
  return { ok: true };
}

/** Número de CallMeBot al que cada quien le escribe para activar sus avisos (lo publica callmebot.com; si cambia, se actualiza aquí). */
export const CALLMEBOT_NUMBER = '34694242562';
export const CALLMEBOT_ACTIVATE = 'I allow callmebot to send me messages';

export type CallMeBotResult = { ok: boolean; kind: 'ok' | 'invalid' | 'busy' | 'error'; error?: string };

/**
 * Envía un mensaje a tu propio WhatsApp con CallMeBot (gratis para uso personal).
 * Cloudflare sale a internet por servidores que comparten muchas apps, y CallMeBot a veces los frena con
 * «Too many requests» (503). Por eso se reintenta unas veces con pausas: cada intento puede salir por otro servidor.
 */
export async function sendCallMeBot(env: Env, text: string): Promise<CallMeBotResult> {
  if (!callmebotConfigured(env)) return { ok: false, kind: 'error', error: 'CallMeBot no configurado' };
  const phone = '+' + (env.WA_MY_NUMBER || '').replace(/\D/g, '');
  // Va en la dirección (GET): los mensajes muy largos se recortan para no pasar el límite.
  const msg = text.length > 1500 ? text.slice(0, 1497) + '…' : text;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY || '')}`;
  let last: CallMeBotResult = { ok: false, kind: 'error', error: 'Sin respuesta de CallMeBot' };
  for (const wait of [0, 1500, 3000, 5000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    let res: Response;
    try { res = await fetch(url); } catch (e) { last = { ok: false, kind: 'error', error: 'No pude comunicarme con CallMeBot: ' + (e as Error).message }; continue; }
    const body = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (res.status === 503 || /too many requests|to often|too often/i.test(body)) { last = { ok: false, kind: 'busy', error: 'CallMeBot está saturado ahora mismo' }; continue; }
    if (/apikey is invalid|invalid apikey|not valid/i.test(body)) return { ok: false, kind: 'invalid', error: 'La clave no coincide con ese número' };
    if (!res.ok || (/(error|invalid)/i.test(body) && !/(queued|sent|enviado)/i.test(body))) return { ok: false, kind: 'error', error: body.slice(0, 200) || `CallMeBot respondió ${res.status}` };
    await log(env, 'out', 'callmebot', text);
    return { ok: true, kind: 'ok' };
  }
  return last;
}

type Pending = { t: string; at: number };

/** Guarda un aviso que CallMeBot no aceptó por saturación, para reenviarlo en la próxima vuelta del cron. */
async function queueWhatsApp(env: Env, text: string): Promise<void> {
  const list = JSON.parse((await getSetting(env, 'wa_outbox', '[]')) || '[]') as Pending[];
  list.push({ t: text, at: nowSec() });
  await setSetting(env, 'wa_outbox', JSON.stringify(list.filter((x) => nowSec() - x.at < 86400).slice(-8)));
}

/** Reenvía los avisos pendientes (los de hace más de 24 h ya no sirven y se descartan). */
export async function flushWhatsApp(env: Env): Promise<number> {
  if (!callmebotConfigured(env)) return 0;
  if ((await getSetting(env, 'wa_enabled', '1')) === '0') return 0;
  const list = (JSON.parse((await getSetting(env, 'wa_outbox', '[]')) || '[]') as Pending[]).filter((x) => nowSec() - x.at < 86400);
  if (!list.length) return 0;
  const left: Pending[] = [];
  let sent = 0;
  for (const p of list) {
    // Si ya falló uno por saturación, los demás esperan a la siguiente vuelta.
    if (left.length) { left.push(p); continue; }
    const r = await sendCallMeBot(env, p.t);
    if (r.ok) sent++; else if (r.kind === 'busy') left.push(p);
  }
  await setSetting(env, 'wa_outbox', JSON.stringify(left));
  return sent;
}

/** ¿Está abierta la ventana de 24 h de WhatsApp (me escribiste hace menos de 23 h 45 min)? */
export async function waWindowOpen(env: Env): Promise<boolean> {
  const last = Number(await getSetting(env, 'wa_last_inbound', '0'));
  return nowSec() - last < 24 * 3600 - 15 * 60;
}

/** Enlace wa.me al número del asistente con "hoy" ya escrito (para reabrir la ventana de 24 h de un toque). */
export async function waChatLink(env: Env, text = 'hoy'): Promise<string | undefined> {
  if (!waServerReady(env)) return undefined;
  let num = await getSetting(env, 'wa_display_number');
  if (!num) {
    const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } });
    if (!res.ok) return undefined;
    num = ((await res.json()) as { display_phone_number?: string }).display_phone_number?.replace(/\D/g, '') || '';
    if (!num) return undefined;
    await setSetting(env, 'wa_display_number', num);
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** Quita el formato de WhatsApp (*negrita*, _cursiva_) para mostrarlo en una notificación. */
function plain(text: string): string {
  return text.replace(/[*_~]/g, '').trim();
}

/** Tipos de aviso que puedes encender o apagar en Ajustes. */
export type NotifyType = 'tareas' | 'notas' | 'pagos' | 'avisos' | 'resumen' | 'novedades' | 'plan';
/** tg: versión con formato y botones para Telegram (si no viene, se convierte el texto normal). */
export type SendOptions = { title?: string; tag?: string; url?: string; pushBody?: string; type?: NotifyType; tg?: { html: string; kb?: TgKb } };

/** Envía un aviso por todos los canales gratis disponibles. */
export async function sendToMe(env: Env, text: string, opts: SendOptions = {}): Promise<SendResult> {
  const channels: Channel[] = [];
  const errors: string[] = [];
  // Si apagaste este tipo de aviso en Ajustes, no sale (y cuenta como "hecho" para no reintentar).
  if (opts.type && (await getSetting(env, `notify_${opts.type}`, '1')) === '0') return { ok: true, channels };

  // Telegram (si lo conectaste): no tiene ventana de 24 h, así que siempre llega.
  if (telegramReady(env) && (await getSetting(env, 'tg_chat_id'))) {
    const origin0 = (env.APP_URL || '').replace(/\/$/, '');
    const kb: TgKb = opts.url && /^https:/.test(origin0) ? [[{ text: '🔗 Abrir en Rumbo', url: `${origin0}/${opts.url.replace(/^\//, '')}` }], ...TG_MINI] : TG_MINI;
    const t = opts.tg ? await sendTelegram(env, opts.tg.html, undefined, { html: true, kb: opts.tg.kb || kb }) : await sendTelegram(env, text, undefined, { kb });
    if (t.ok) channels.push('telegram'); else errors.push('Telegram: ' + t.error);
  }

  // WhatsApp solo para avisos, con CallMeBot (cada quien pone su número y su clave en Conexiones).
  // Llega siempre: no depende de la ventana de 24 h ni de la cuenta de Meta.
  // Cada quien elige qué tipos le llegan por WhatsApp y si respeta su horario de descanso
  // (de 10 p. m. a 7 a. m. solo llega al teléfono, que no hace ruido si está en silencio).
  const waTypes = (await getSetting(env, 'wa_tipos', '')).split(',').filter(Boolean);
  // (El plan del domingo es nuevo: a quien ya había elegido tipos, le llega si tenía el resumen.)
  const typeOk = !opts.type || !waTypes.length || waTypes.includes(opts.type) || (opts.type === 'plan' && waTypes.includes('resumen'));
  const h = localDate(env).getUTCHours();
  const quiet = (await getSetting(env, 'wa_quiet', '1')) !== '0' && (h >= 22 || h < 7) && opts.tag !== 'security';
  // WhatsApp se puede apagar con un toque (Ajustes o «whatsapp off» en el bot).
  const waOn = (await getSetting(env, 'wa_enabled', '1')) !== '0';
  if (waOn && callmebotConfigured(env) && typeOk && !quiet) {
    // Al final, un enlace que abre justo eso en Rumbo (WhatsApp lo vuelve tocable).
    const origin = (env.APP_URL || (await getSetting(env, 'app_origin'))).replace(/\/$/, '');
    const link = opts.url && origin ? `\n\n👉 Ábrelo en Rumbo:\n${origin}/${opts.url.replace(/^\//, '')}` : '';
    const r = await sendCallMeBot(env, text.trim() + link);
    if (r.ok) channels.push('callmebot');
    else if (r.kind === 'busy') await queueWhatsApp(env, text); // sale en la próxima vuelta; la notificación llega ya
    else errors.push('WhatsApp: ' + r.error);
  }

  // La notificación sale siempre, salvo que ya llegó por WhatsApp y prefieres no duplicar.
  const alsoPush = (await getSetting(env, 'push_also_wa', '1')) !== '0';
  if (!channels.includes('callmebot') || alsoPush) {
    const lines = plain(text).split('\n');
    const title = opts.title || lines[0].slice(0, 80);
    const body = opts.pushBody || (opts.title ? lines : lines.slice(1)).join('\n').trim() || lines[0];
    // Número para el icono de la app (avisos sin leer + tareas de hoy o vencidas).
    const cnt = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM announcements WHERE user_id = ?1 AND read = 0 AND (source IN ('avisos', 'correo') OR kind IN ('pago', 'evento'))
        AND id > COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = ?2), 0))
      + (SELECT COUNT(*) FROM tasks WHERE user_id = ?1 AND status = 'pending' AND due_at IS NOT NULL AND due_at < ?3 AND due_at > ?4) AS n`).bind(env.UID, `u${env.UID}:news_seen_id`, nowSec() + 86400, nowSec() - 3 * 86400).first<{ n: number }>().catch(() => null);
    const p = await sendPushAll(env, { title, body, tag: opts.tag, url: opts.url || '/#inicio', count: cnt?.n ?? 0 });
    if (p.sent) channels.push('push');
    else if (p.error) errors.push('Notificación: ' + p.error);
  }

  if (channels.length) return { ok: true, channels };
  return { ok: false, channels, error: errors.join(' · ') || 'No hay ningún canal activo: activa las notificaciones en Ajustes → Conexiones.' };
}
