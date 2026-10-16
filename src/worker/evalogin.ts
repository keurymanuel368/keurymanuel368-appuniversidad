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

type Jar = Map<string, Map<string, string>>; // cookies por servidor (el EVA y el servidor de identidad de la UAPA)
const merge = (jar: Jar, host: string, res: Response) => {
  const list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const m = jar.get(host) ?? new Map<string, string>();
  for (const c of list) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) m.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar.set(host, m);
};
const cookieHeader = (jar: Jar, host: string) => [...(jar.get(host) ?? [])].map(([k, v]) => `${k}=${v}`).join('; ');

export type WebLogin = { token?: string; reason: 'ok' | 'invalid' | 'blocked' | 'nolaunch' | 'error'; detail?: string };

export async function webLoginToken(base: string, username: string, password: string): Promise<WebLogin> {
  const root = base.replace(/\/$/, '');
  const jar: Jar = new Map();
  const call = async (url: string, init: RequestInit = {}) => {
    const host = new URL(url).host;
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers as Record<string, string>), cookie: cookieHeader(jar, host), 'user-agent': 'Mozilla/5.0 (Rumbo)' } });
    merge(jar, host, res);
    return res;
  };
  // Sigue redirecciones (entre servidores) hasta una página final o un enlace moodlemobile://.
  const follow = async (first: Response, from: string) => {
    let last = first, cur = from;
    for (let i = 0; i < 10 && last.status >= 300 && last.status < 400; i++) {
      const loc = last.headers.get('location') || '';
      if (!loc || /^[a-z][a-z0-9+.-]*:/i.test(loc) && !/^https?:/i.test(loc)) break;
      await last.text().catch(() => '');
      cur = new URL(loc, cur).href;
      last = await call(cur);
    }
    return { res: last, url: cur };
  };
  try {
    // 0) La UAPA usa inicio de sesión único (CAS): el EVA manda a su servidor de identidad y ahí se escribe la clave.
    const start = `${root}/login/index.php?authCASattras=CASattras`;
    const first = await follow(await call(start), start);
    if (new URL(first.url).host !== new URL(root).host) {
      const html0 = await first.res.text();
      const form = [...html0.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((m) => m[0]).find((f) => /commonauth/i.test(f));
      if (!form) return { reason: 'nolaunch', detail: `sin formulario de identidad (HTTP ${first.res.status}, ${new URL(first.url).host}, ${html0.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)})` };
      const action = new URL((form.match(/<form\b[^>]*\baction="([^"]*)"/i)?.[1] || '/commonauth').replace(/&amp;/g, '&'), first.url).href;
      const data = new URLSearchParams();
      for (const t of form.match(/<input\b[^>]*>/gi) || []) {
        const n = t.match(/\bname="([^"]*)"/i)?.[1];
        if (!n) continue;
        const type = (t.match(/\btype="([^"]*)"/i)?.[1] || 'text').toLowerCase();
        if (type === 'checkbox' || type === 'submit') continue;
        data.set(n, type === 'password' ? password : /^(username|usernameUserInput)$/i.test(n) ? username : (t.match(/\bvalue="([^"]*)"/i)?.[1] || '').replace(/&amp;/g, '&'));
      }
      if (!data.has('sessionDataKey')) { const k = new URL(first.url).searchParams.get('sessionDataKey'); if (k) data.set('sessionDataKey', k); }
      const post = await call(action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: data.toString() });
      const done = await follow(post, action);
      if (done.res.status === 403 || done.res.status === 429) return { reason: 'blocked', detail: `HTTP ${done.res.status}` };
      if (new URL(done.url).host !== new URL(root).host) {
        const q = new URL(done.url).searchParams;
        const body = await done.res.text();
        const msg = q.get('authFailureMsg') || body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/(inv[aá]lid[^.]{0,80}|incorrect[^.]{0,80})/i)?.[1] || '';
        return { reason: 'invalid', detail: msg.slice(0, 160) };
      }
      await done.res.text().catch(() => '');
    } else {
    // 1) La página de entrada trae un código de un solo uso (logintoken).
    const page = await call(`${root}/login/index.php`);
    const html = await page.text();
    const logintoken = html.match(/name="logintoken"\s+value="([^"]+)"/)?.[1] || html.match(/value="([^"]+)"\s+name="logintoken"/)?.[1] || '';
    // 2) Entrar. Si las credenciales son buenas, el EVA redirige; si no, vuelve a mostrar el formulario (200).
    const login = await call(`${root}/login/index.php`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ anchor: '', logintoken, username, password }).toString(),
    });
    // Moodle contesta con una redirección en los dos casos: a /login/index.php?loginredirect=1 si la clave es mala
    // (y ahí muestra «Acceso inválido») o al panel si es buena. Se siguen las redirecciones y se decide por la página final.
    let last: Response = login;
    for (let i = 0; i < 5 && last.status >= 300 && last.status < 400; i++) {
      const loc = last.headers.get('location') || '';
      if (!loc || /^[a-z][a-z0-9+.-]*:/i.test(loc) && !/^https?:/i.test(loc)) break;
      await last.text().catch(() => '');
      last = await call(new URL(loc, root + '/').href);
    }
    const after = last.status >= 300 && last.status < 400 ? '' : await last.text();
    if (/id="login"|name="password"/i.test(after)) {
      const msg = after.match(/id="loginerrormessage"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || after.match(/class="[^"]*alert-danger[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
      return { reason: 'invalid', detail: msg.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) };
    }
    if (last.status === 403 || last.status === 429) return { reason: 'blocked', detail: `HTTP ${last.status}` };
    }
    // 3) Pedir el enlace de la app. A veces el EVA muestra antes una página de confirmación con un botón «confirmed=1».
    const passport = 'rumbo' + Math.random().toString(36).slice(2, 10);
    let url = `${root}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;
    let init: RequestInit = {};
    for (let i = 0; i < 4; i++) {
      const r = await call(url, init);
      init = {};
      const loc = r.headers.get('location') || '';
      if (/^moodlemobile:\/\/token=/i.test(loc)) {
        const token = tokenFromValue(loc);
        return token ? { token, reason: 'ok' } : { reason: 'nolaunch', detail: 'enlace sin token' };
      }
      if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, root + '/').href; continue; }
      const body = await r.text();
      const next = body.match(/href="([^"]*launch\.php[^"]*confirmed=1[^"]*)"/i)?.[1]?.replace(/&amp;/g, '&');
      if (next) { url = new URL(next, root + '/').href; continue; }
      // Moodle suele mostrar el botón de confirmar como un formulario (con sesskey), no como enlace.
      const form = [...body.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((m) => m[0]).find((f) => /launch\.php/i.test(f));
      if (form) {
        const attr = (re: RegExp) => form.match(re)?.[1]?.replace(/&amp;/g, '&') || '';
        const action = new URL(attr(/<form\b[^>]*\baction="([^"]*)"/i) || url, root + '/').href;
        const method = (attr(/<form\b[^>]*\bmethod="([^"]*)"/i) || 'get').toLowerCase();
        const data = new URLSearchParams();
        for (const t of form.match(/<input\b[^>]*>/gi) || []) {
          const n = t.match(/\bname="([^"]*)"/i)?.[1];
          if (n) data.set(n, (t.match(/\bvalue="([^"]*)"/i)?.[1] || '').replace(/&amp;/g, '&'));
        }
        if (method === 'post') { url = action; init = { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: data.toString() }; }
        else url = action + (action.includes('?') ? '&' : '?') + data.toString();
        continue;
      }
      return { reason: 'nolaunch', detail: `HTTP ${r.status} ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)}` };
    }
    return { reason: 'nolaunch', detail: 'demasiados pasos' };
  } catch (e) {
    return { reason: 'error', detail: (e as Error).message };
  }
}
