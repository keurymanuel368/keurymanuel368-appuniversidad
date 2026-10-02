import { describe, expect, it } from 'vitest';
import { checkPassword, hashPassword } from '../src/worker/auth';
import type { Env } from '../src/worker/env';

const env = { APP_PASSWORD: 'secreto-de-manuel', UID: 0 } as unknown as Env;

describe('contraseñas de cada usuario', () => {
  it('acepta la contraseña correcta y rechaza otra', async () => {
    const { hash, salt } = await hashPassword('clave-de-ana-123');
    const ana = { id: 2, pass_hash: hash, pass_salt: salt };
    expect(await checkPassword(env, ana, 'clave-de-ana-123')).toBe(true);
    expect(await checkPassword(env, ana, 'clave-de-ana-124')).toBe(false);
    expect(await checkPassword(env, ana, '')).toBe(false);
  });

  it('la misma contraseña da hashes distintos (sal aleatoria)', async () => {
    const a = await hashPassword('igual'), b = await hashPassword('igual');
    expect(a.hash).not.toBe(b.hash);
  });

  it('el usuario 1 sin contraseña propia entra con APP_PASSWORD; los demás no', async () => {
    expect(await checkPassword(env, { id: 1, pass_hash: null, pass_salt: null }, 'secreto-de-manuel')).toBe(true);
    expect(await checkPassword(env, { id: 2, pass_hash: null, pass_salt: null }, 'secreto-de-manuel')).toBe(false);
  });
});
