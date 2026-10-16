// Conectar el EVA entrando como en el navegador (src/worker/evalogin.ts), con el EVA simulado.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenFromValue, webLoginToken } from '../src/worker/evalogin';

const TOKEN = 'a'.repeat(32);
const link = 'moodlemobile://token=' + btoa('siteid:::' + TOKEN + ':::private').replace(/\+/g, '-').replace(/\//g, '_');

const res = (status: number, body = '', headers: Record<string, string | string[]> = {}) => {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) for (const x of ([] as string[]).concat(v)) h.append(k, x);
  return new Response(body, { status, headers: h });
};
const FORM = '<form id="login"><input type="hidden" name="logintoken" value="TKN"><input name="username"><input name="password"></form>';

afterEach(() => vi.unstubAllGlobals());

describe('tokenFromValue', () => {
  it('acepta el enlace de la app, el token solo y rechaza lo demás', () => {
    expect(tokenFromValue(link)).toBe(TOKEN);
    expect(tokenFromValue(TOKEN)).toBe(TOKEN);
    expect(tokenFromValue('hola')).toBe('');
    expect(tokenFromValue('moodlemobile://token=%%%')).toBe('');
  });
});

describe('webLoginToken', () => {
  it('entra, pide el enlace de la app y devuelve el token', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method || 'GET'} ${new URL(url).pathname}`);
      if (url.endsWith('/login/index.php') && !init.method) return res(200, FORM, { 'set-cookie': 'MoodleSession=abc; path=/' });
      if (url.endsWith('/login/index.php')) {
        expect(String(init.body)).toContain('logintoken=TKN');
        expect((init.headers as Record<string, string>).cookie).toContain('MoodleSession=abc');
        return res(303, '', { location: '/my/', 'set-cookie': 'MoodleSession=nueva; path=/' });
      }
      if (url.endsWith('/my/')) return res(200, '<h1>Panel</h1>');
      expect((init.headers as Record<string, string>).cookie).toContain('MoodleSession=nueva');
      return res(303, '', { location: link });
    }));
    expect(await webLoginToken('https://eva.test', '100', 'clave')).toEqual({ token: TOKEN, reason: 'ok' });
    expect(calls).toEqual(['GET /login/index.php', 'POST /login/index.php', 'GET /my/', 'GET /admin/tool/mobile/launch.php']);
  });

  it('contraseña mala: el EVA vuelve a mostrar el formulario → invalid', async () => {
    // El EVA real: la clave mala redirige a /login/index.php?loginredirect=1 y ahí muestra el error.
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => (init.method ? res(303, '', { location: 'https://eva.test/login/index.php?loginredirect=1' }) : res(200, FORM + 'Acceso inválido'))));
    expect((await webLoginToken('https://eva.test', '100', 'mala')).reason).toBe('invalid');
  });

  it('sigue la página de confirmación del EVA (confirmed=1)', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/login/index.php')) return init.method ? res(303, '', { location: '/my/' }) : res(200, FORM);
      if (url.endsWith('/my/')) return res(200, '<h1>Panel</h1>');
      n++;
      return n === 1 ? res(200, '<a href="https://eva.test/admin/tool/mobile/launch.php?confirmed=1&amp;x=1">Continuar</a>') : res(303, '', { location: link });
    }));
    expect((await webLoginToken('https://eva.test', '100', 'clave')).token).toBe(TOKEN);
  });

  it('si el EVA no da el enlace, lo dice (no inventa que la clave es mala)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => (url.endsWith('/login/index.php') ? (init.method ? res(303, '', { location: '/my/' }) : res(200, FORM)) : res(200, '<p>nada</p>'))));
    expect((await webLoginToken('https://eva.test', '100', 'clave')).reason).toBe('nolaunch');
  });
});
