// Sesión de un solo usuario: contraseña en un secreto + cookie firmada con HMAC-SHA256.
import type { Env } from './env';
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

export async function createSessionCookie(env: Env): Promise<string> {
  const exp = nowSec() + DAYS * 86400;
  const payload = String(exp);
  const sig = await hmac(env.SESSION_SECRET || '', payload);
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isAuthenticated(env: Env, cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader || !env.SESSION_SECRET) return false;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!match) return false;
  const [payload, sig] = match.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  if (Number(payload) < nowSec()) return false;
  return safeEqual(await hmac(env.SESSION_SECRET, payload), sig);
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
