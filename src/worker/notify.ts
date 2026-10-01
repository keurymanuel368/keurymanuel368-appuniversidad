// Avisos para ti, siempre por canales gratis:
// 1) Notificaciones de la app (Web Push): llegan siempre a los dispositivos donde las activaste.
// 2) API oficial de WhatsApp Cloud con el número de prueba de Meta (no se cobra), dentro de la
//    ventana de 24 h que se abre cada vez que tú le escribes al asistente.
// 3) CallMeBot (opcional) cuando esa ventana está cerrada, si lo configuraste.
import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { sendPushAll } from './push';
import { sendTelegram, telegramReady } from './telegram';
import { nowSec } from './time';

export type Channel = 'whatsapp' | 'callmebot' | 'push' | 'telegram';
export type SendResult = { ok: boolean; channels: Channel[]; error?: string };

export const GRAPH = 'https://graph.facebook.com/v21.0';

export function waConfigured(env: Env): boolean {
  return !!(env.WA_PHONE_NUMBER_ID && env.WA_TOKEN && env.WA_MY_NUMBER);
}

export function callmebotConfigured(env: Env): boolean {
  return !!(env.CALLMEBOT_APIKEY && env.WA_MY_NUMBER);
}

async function log(env: Env, direction: 'in' | 'out', channel: string, body: string) {
  await env.DB.prepare('INSERT INTO messages (direction, channel, body) VALUES (?, ?, ?)').bind(direction, channel, body.slice(0, 4000)).run();
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

/** Envía un mensaje a tu propio WhatsApp con CallMeBot (gratis para uso personal). */
export async function sendCallMeBot(env: Env, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!callmebotConfigured(env)) return { ok: false, error: 'CallMeBot no configurado' };
  const phone = '+' + (env.WA_MY_NUMBER || '').replace(/\D/g, '');
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY || '')}`;
  const res = await fetch(url);
  const body = await res.text();
  const failed = !res.ok || (/error/i.test(body) && !/(queued|sent)/i.test(body));
  if (failed) {
    return { ok: false, error: body.replace(/<[^>]+>/g, ' ').slice(0, 300) };
  }
  await log(env, 'out', 'callmebot', text);
  return { ok: true };
}

/** ¿Está abierta la ventana de 24 h de WhatsApp (me escribiste hace menos de 23 h 45 min)? */
export async function waWindowOpen(env: Env): Promise<boolean> {
  const last = Number(await getSetting(env, 'wa_last_inbound', '0'));
  return nowSec() - last < 24 * 3600 - 15 * 60;
}

/** Enlace wa.me al número del asistente con "hoy" ya escrito (para reabrir la ventana de 24 h de un toque). */
export async function waChatLink(env: Env, text = 'hoy'): Promise<string | undefined> {
  if (!waConfigured(env)) return undefined;
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
export type NotifyType = 'tareas' | 'notas' | 'pagos' | 'avisos' | 'resumen' | 'novedades';
export type SendOptions = { title?: string; tag?: string; url?: string; pushBody?: string; type?: NotifyType };

/** Envía un aviso por todos los canales gratis disponibles. */
export async function sendToMe(env: Env, text: string, opts: SendOptions = {}): Promise<SendResult> {
  const channels: Channel[] = [];
  const errors: string[] = [];
  // Si apagaste este tipo de aviso en Ajustes, no sale (y cuenta como "hecho" para no reintentar).
  if (opts.type && (await getSetting(env, `notify_${opts.type}`, '1')) === '0') return { ok: true, channels };

  // Telegram (si lo conectaste): no tiene ventana de 24 h, así que siempre llega.
  if (telegramReady(env) && (await getSetting(env, 'tg_chat_id'))) {
    const t = await sendTelegram(env, text);
    if (t.ok) channels.push('telegram'); else errors.push('Telegram: ' + t.error);
  }

  const waOpen = waConfigured(env) && (await waWindowOpen(env));
  if (waOpen) {
    const r = await sendWhatsApp(env, text);
    if (r.ok) channels.push('whatsapp'); else errors.push('WhatsApp: ' + r.error);
  } else if (callmebotConfigured(env)) {
    const r = await sendCallMeBot(env, text);
    if (r.ok) channels.push('callmebot'); else errors.push('CallMeBot: ' + r.error);
  }

  // La notificación sale siempre, salvo que ya llegó por WhatsApp y prefieres no duplicar.
  const alsoPush = (await getSetting(env, 'push_also_wa', '1')) !== '0';
  if (!channels.includes('whatsapp') || alsoPush) {
    const lines = plain(text).split('\n');
    const title = opts.title || lines[0].slice(0, 80);
    const body = opts.pushBody || (opts.title ? lines : lines.slice(1)).join('\n').trim() || lines[0];
    // Número para el icono de la app (avisos sin leer + tareas de hoy o vencidas).
    const cnt = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM announcements WHERE read = 0 AND (source IN ('avisos', 'correo') OR kind IN ('pago', 'evento'))
        AND id > COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'news_seen_id'), 0))
      + (SELECT COUNT(*) FROM tasks WHERE status = 'pending' AND due_at IS NOT NULL AND due_at < ? AND due_at > ?) AS n`).bind(nowSec() + 86400, nowSec() - 3 * 86400).first<{ n: number }>().catch(() => null);
    const p = await sendPushAll(env, { title, body, tag: opts.tag, url: opts.url || '/#inicio', count: cnt?.n ?? 0, wa: waOpen ? undefined : await waChatLink(env).catch(() => undefined) });
    if (p.sent) channels.push('push');
    else if (p.error) errors.push('Notificación: ' + p.error);
  }

  if (channels.length) return { ok: true, channels };
  return { ok: false, channels, error: errors.join(' · ') || 'No hay ningún canal activo: activa las notificaciones en Ajustes o escríbele al asistente por WhatsApp.' };
}
