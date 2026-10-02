// Bot de Telegram (gratis, oficial y sin ventana de 24 h): conversa contigo, entiende notas de voz
// y te manda resúmenes y avisos. Solo responde al chat que vinculaste desde Ajustes.
import type { Env } from './env';
import { getSetting, setSetting } from './db';

const api = (env: Env) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

export const telegramReady = (env: Env) => !!env.TELEGRAM_BOT_TOKEN;

export async function tgCall<T = unknown>(env: Env, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${api(env)}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(data.description || `Telegram respondió ${res.status}`);
  return data.result as T;
}

/** Formato de WhatsApp (*negrita*, _cursiva_) → HTML de Telegram. */
function toHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, '$1<i>$2</i>');
}

export async function sendTelegram(env: Env, text: string, chatId?: string | number): Promise<{ ok: boolean; error?: string }> {
  const chat = chatId ?? (await getSetting(env, 'tg_chat_id'));
  if (!telegramReady(env) || !chat) return { ok: false, error: 'Telegram no está conectado' };
  try {
    await tgCall(env, 'sendMessage', { chat_id: chat, text: toHtml(text).slice(0, 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    await env.DB.prepare('INSERT INTO messages (user_id, direction, channel, body) VALUES (?, ?, ?, ?)').bind(env.UID, 'out', 'telegram', text.slice(0, 4000)).run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Descarga un archivo (nota de voz) que te mandaron por Telegram. */
export async function downloadTelegramFile(env: Env, fileId: string): Promise<Uint8Array> {
  const f = await tgCall<{ file_path?: string; file_size?: number }>(env, 'getFile', { file_id: fileId });
  if (!f.file_path) throw new Error('Telegram no entregó el audio.');
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`No pude descargar el audio (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Registra el webhook y devuelve el enlace para vincular tu chat (t.me/tu_bot?start=código). */
export async function setupTelegram(env: Env, origin: string): Promise<{ username: string; link: string; connected: boolean }> {
  const me = await tgCall<{ username: string }>(env, 'getMe');
  let secret = await getSetting(env, 'tg_secret');
  if (!secret) { secret = randomHex(24); await setSetting(env, 'tg_secret', secret); }
  let code = await getSetting(env, 'tg_link_code');
  if (!code) { code = randomHex(8); await setSetting(env, 'tg_link_code', code); }
  await tgCall(env, 'setWebhook', { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
  await tgCall(env, 'setMyCommands', { commands: [
    { command: 'hoy', description: 'Tu resumen del día' },
    { command: 'tareas', description: 'Entregas pendientes' },
    { command: 'notas', description: 'Promedio por asignatura' },
    { command: 'pagos', description: 'Estado de la cuota' },
    { command: 'ayuda', description: 'Lo que puedo hacer' },
  ] }).catch(() => {});
  await setSetting(env, 'tg_username', me.username);
  return { username: me.username, link: `https://t.me/${me.username}?start=${code}`, connected: !!(await getSetting(env, 'tg_chat_id')) };
}
