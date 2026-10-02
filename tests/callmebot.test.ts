// Avisos por WhatsApp con CallMeBot: reintentos cuando está saturado y mensajes claros si la clave no coincide.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendCallMeBot } from '../src/worker/notify';
import type { Env } from '../src/worker/env';

const db = { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) };
const env = { UID: 2, DB: db, WA_MY_NUMBER: '18095550000', CALLMEBOT_APIKEY: '123456' } as unknown as Env;
const reply = (status: number, body: string) => new Response(body, { status });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('sendCallMeBot', () => {
  it('reintenta si CallMeBot está saturado y luego envía', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockResolvedValueOnce(reply(503, 'Oops! Too many requests... You have called to the API to often.'))
      .mockResolvedValueOnce(reply(200, 'Message queued. You will receive it in a few seconds.'));
    vi.stubGlobal('fetch', f);
    const p = sendCallMeBot(env, 'hola');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual({ ok: true, kind: 'ok' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('se rinde como «busy» si sigue saturado', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply(503, 'Too many requests')));
    const p = sendCallMeBot(env, 'hola');
    await vi.advanceTimersByTimeAsync(10000);
    expect((await p).kind).toBe('busy');
  });

  it('distingue la clave inválida (no reintenta)', async () => {
    const f = vi.fn().mockResolvedValue(reply(203, 'Message to: +18095550000 APIKey is invalid. Please create a new one'));
    vi.stubGlobal('fetch', f);
    expect((await sendCallMeBot(env, 'hola')).kind).toBe('invalid');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
