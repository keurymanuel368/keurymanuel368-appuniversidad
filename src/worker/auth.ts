// Sesiones de varios usuarios: cookie firmada con HMAC-SHA256 que lleva el id del usuario.
// Contraseñas con PBKDF2-SHA256 (Web Crypto, sin librerías). El usuario 1 (Manuel) puede seguir
// entrando con el secreto APP_PASSWORD mientras no ponga una contraseña propia.
import type { Env } from './env';
import { getSetting } from './db';
import { nowSec } from './time';

const COOKIE = 'rumbo_session';
const DAYS = 60;
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Workers limita PBKDF2 a 100 000 iteraciones.
const ITER = 100_000;
export async function hashPassword(password: string, salt = randomHex(16)): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
  return { hash: b64url(bits), salt };
}

/** Comprueba la contraseña de un usuario. Devuelve false si no coincide. */
export async function checkPassword(env: Env, user: { id: number; pass_hash: string | null; pass_salt: string | null }, password: string): Promise<boolean> {
  if (!password) return false;
  if (user.pass_hash && user.pass_salt) return safeEqual((await hashPassword(password, user.pass_salt)).hash, user.pass_hash);
  return user.id === 1 && !!env.APP_PASSWORD && safeEqual(password, env.APP_PASSWORD);
}

/** Versión de las sesiones de cada usuario: al subirla, todas sus sesiones abiertas dejan de valer. */
async function sessionVersion(env: Env, uid: number): Promise<string> {
  return (await getSetting({ ...env, UID: uid }, 'session_version').catch(() => '')) || '0';
}

export async function createSessionCookie(env: Env, uid: number): Promise<string> {
  const exp = nowSec() + DAYS * 86400;
  const payload = `${uid}-${exp}-${await sessionVersion(env, uid)}`;
  const sig = await hmac(env.SESSION_SECRET || '', payload);
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Devuelve el id del usuario de la sesión, o null si no hay una válida. */
export async function sessionUser(env: Env, cookieHeader: string | null): Promise<number | null> {
  if (!cookieHeader || !env.SESSION_SECRET) return null;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!match) return null;
  const [payload, sig] = match.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(await hmac(env.SESSION_SECRET, payload), sig)) return null;
  const parts = payload.split('-');
  // Formato viejo (de antes del multiusuario): "vence-versión" → era de Manuel (usuario 1).
  const [uid, exp, ver = '0'] = parts.length >= 3 ? [Number(parts[0]), parts[1], parts[2]] : [1, parts[0], parts[1] || '0'];
  if (!uid || Number(exp) < nowSec()) return null;
  if (ver !== (await sessionVersion(env, uid))) return null;
  const u = await env.DB.prepare('SELECT active FROM users WHERE id = ?').bind(uid).first<{ active: number }>();
  return u?.active ? uid : null;
}

/** Verifica la firma X-Hub-Signature-256 que Meta envía en el webhook. */
export async function verifyMetaSignature(env: Env, body: string, header: string | null): Promise<boolean> {
  if (!env.WA_APP_SECRET) return true; // sin secreto configurado no se puede verificar (solo para pruebas)
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(env.WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(hex, header.slice(7));
}
