// Rumbo en vivo: un Durable Object por usuario mantiene abiertos los WebSockets de sus pantallas
// (celular, computadora, Mini App de Telegram). Cuando algo cambia (guardas una nota, sincroniza el EVA,
// marcas una tarea desde Telegram) se les avisa y public/live.js recarga los datos sin tocar nada.
import type { Env } from './env';
import { safeEqual } from './auth';
import { nowSec } from './time';

export class RumboLive {
  state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    // El «ping» del cliente se contesta sin despertar al objeto (no gasta).
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch { /* entorno sin hibernación */ }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/notify') {
      const msg = await req.text();
      let n = 0;
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(msg); n++; } catch { /* conexión cerrada */ }
      }
      return new Response(String(n));
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba un WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (msg === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try { ws.close(code, reason); } catch { /* ya cerrado */ }
  }

  async webSocketError() {}
}

/** Avisa a las pantallas abiertas de un usuario que algo cambió. `src` dice de dónde vino (app, dev:xxx, telegram). */
export async function notifyLive(env: Env, uid: number | null | undefined, src = 'app', what = ''): Promise<void> {
  if (!env.LIVE || !uid) return;
  try {
    await env.LIVE.get(env.LIVE.idFromName('u' + uid)).fetch('https://live/notify', { method: 'POST', body: JSON.stringify({ t: 'change', src, what, at: Date.now() }) });
  } catch (e) {
    console.log('live: ' + (e as Error).message);
  }
}

/** Valida los datos que Telegram le pasa a la Mini App (firma HMAC con el token del bot). Devuelve el usuario de Telegram o null. */
export async function tgVerifyInitData(env: Env, initData: string): Promise<{ id: number; first_name?: string; username?: string } | null> {
  if (!env.TELEGRAM_BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const te = new TextEncoder();
  const k1 = await crypto.subtle.importKey('raw', te.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', k1, te.encode(env.TELEGRAM_BOT_TOKEN));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k2, te.encode(check)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!safeEqual(sig, hash)) return null;
  if (nowSec() - Number(params.get('auth_date') || 0) > 86400) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}
