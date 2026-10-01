// Notificaciones de la app (Web Push) sin servicios externos ni librerías:
// cifrado RFC 8291 (aes128gcm) y firma VAPID (RFC 8292) con la Web Crypto API del Worker.
// Las claves VAPID se generan la primera vez y se guardan en D1 (no hace falta ningún secreto).
import type { Env } from './env';
import { getSetting } from './db';
import { nowSec } from './time';

const enc = new TextEncoder();

function b64u(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

async function vapidKeys(env: Env): Promise<VapidKeys> {
  const saved = await getSetting(env, 'vapid_keys');
  if (saved) return JSON.parse(saved) as VapidKeys;
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer;
  const keys: VapidKeys = { publicKey: b64u(pub), privateJwk: (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey };
  // INSERT OR IGNORE: si dos peticiones las crean a la vez, gana la primera y ambas usan la misma.
  await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('vapid_keys', JSON.stringify(keys)).run();
  return JSON.parse(await getSetting(env, 'vapid_keys')) as VapidKeys;
}

export async function vapidPublicKey(env: Env): Promise<string> {
  return (await vapidKeys(env)).publicKey;
}

async function vapidAuth(env: Env, endpoint: string): Promise<string> {
  const keys = await vapidKeys(env);
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sub = (await getSetting(env, 'app_origin')) || 'https://rumbo.workers.dev';
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec() + 12 * 3600, sub })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/** Cifra el contenido para un navegador concreto (RFC 8291, un solo registro aes128gcm). */
async function encryptPayload(p256dh: string, auth: string, payload: Uint8Array): Promise<Uint8Array> {
  const uaPub = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPub = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhParams = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  return concat(header, asPub, cipher);
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string; wa?: string; count?: number };
export type PushResult = { devices: number; sent: number; error?: string };

/** Envía la notificación a todos los dispositivos suscritos. Borra los que el navegador dio de baja. */
export async function sendPushAll(env: Env, msg: PushMessage): Promise<PushResult> {
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subs').all<{ id: number; endpoint: string; p256dh: string; auth: string }>();
  // El servicio de push acepta como máximo ~4 KB; recortamos el cuerpo con margen.
  const payload = enc.encode(JSON.stringify({ ...msg, body: msg.body.length > 1200 ? msg.body.slice(0, 1197) + '…' : msg.body }));
  let sent = 0;
  let error: string | undefined;
  for (const s of results) {
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidAuth(env, s.endpoint),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(24 * 3600),
          Urgency: 'high',
        },
        body: await encryptPayload(s.p256dh, s.auth, payload),
      });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(s.id).run();
        continue;
      }
      if (!res.ok) { error = `El servicio de notificaciones respondió ${res.status}: ${(await res.text()).slice(0, 200)}`; continue; }
      sent++;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return { devices: results.length, sent, error };
}
