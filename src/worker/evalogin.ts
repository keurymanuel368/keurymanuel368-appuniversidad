// Conectar el EVA sin que el usuario toque F12: Rumbo hace por él lo mismo que haría en el navegador.
// 1) entra al EVA con matrícula y contraseña (formulario normal de Moodle) y 2) pide el enlace que el EVA da a su app
// (launch.php → moodlemobile://token=…), que trae el token. La contraseña se usa una vez y no se guarda.
// Sirve cuando `login/token.php` rechaza la contraseña aunque sea correcta (cuentas que entran por otro método).

/** Saca el token de «moodlemobile://token=BASE64», del propio token de 32 caracteres, o devuelve ''. */
export function tokenFromValue(value: string): string {
  const v = (value || '').trim();
  if (/^[a-f0-9]{32}$/i.test(v)) return v;
  const m = v.match(/token=([A-Za-z0-9+/=_%-]+)/);
  if (!m) return '';
  try {
    const b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
    const t = atob(b64).split(':::')[1] || '';
    return /^[a-f0-9]{32}$/i.test(t) ? t : '';
  } catch { return ''; }
}

type Jar = Map<string, string>;
const merge = (jar: Jar, res: Response) => {
  const list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of list) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

export type WebLogin = { token?: string; reason: 'ok' | 'invalid' | 'blocked' | 'nolaunch' | 'error'; detail?: string };

export async function webLoginToken(base: string, username: string, password: string): Promise<WebLogin> {
  const root = base.replace(/\/$/, '');
  const jar: Jar = new Map();
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers as Record<string, string>), cookie: cookieHeader(jar), 'user-agent': 'Mozilla/5.0 (Rumbo)' } });
    merge(jar, res);
    return res;
  };
  try {
    // 1) La página de entrada trae un código de un solo uso (logintoken).
    const page = await call(`${root}/login/index.php`);
    const html = await page.text();
    const logintoken = html.match(/name="logintoken"\s+value="([^"]+)"/)?.[1] || html.match(/value="([^"]+)"\s+name="logintoken"/)?.[1] || '';
    // 2) Entrar. Si las credenciales son buenas, el EVA redirige; si no, vuelve a mostrar el formulario (200).
    const login = await call(`${root}/login/index.php`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ anchor: '', logintoken, username, password }).toString(),
    });
    if (login.status < 300 || login.status >= 400) {
      const body = await login.text();
      if (/(login-form|name="password")/i.test(body)) return { reason: 'invalid' };
      return { reason: login.status === 403 || login.status === 429 ? 'blocked' : 'error', detail: `HTTP ${login.status}` };
    }
    await login.text().catch(() => '');
    // 3) Pedir el enlace de la app. A veces el EVA muestra antes una página de confirmación con un botón «confirmed=1».
    const passport = 'rumbo' + Math.random().toString(36).slice(2, 10);
    let url = `${root}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;
    for (let i = 0; i < 4; i++) {
      const r = await call(url);
      const loc = r.headers.get('location') || '';
      if (/^moodlemobile:\/\/token=/i.test(loc)) {
        const token = tokenFromValue(loc);
        return token ? { token, reason: 'ok' } : { reason: 'nolaunch', detail: 'enlace sin token' };
      }
      if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, root + '/').href; continue; }
      const body = await r.text();
      const next = body.match(/href="([^"]*launch\.php[^"]*confirmed=1[^"]*)"/i)?.[1]?.replace(/&amp;/g, '&');
      if (next) { url = new URL(next, root + '/').href; continue; }
      return { reason: 'nolaunch', detail: `HTTP ${r.status}` };
    }
    return { reason: 'nolaunch', detail: 'demasiados pasos' };
  } catch (e) {
    return { reason: 'error', detail: (e as Error).message };
  }
}
