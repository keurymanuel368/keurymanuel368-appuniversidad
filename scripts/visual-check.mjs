// Revisión visual automática: levanta Rumbo en local con datos de ejemplo, abre cada pantalla en móvil (390 px)
// y en PC (1440 px), guarda una captura de cada una y avisa si algo se sale de la pantalla o se corta.
// Uso: npm run visual   (usa el Chrome ya instalado; no se publica nada)
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 8797;
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'visual-' + randomBytes(6).toString('hex');
const SECRET = randomBytes(24).toString('hex');
const OUT = 'visual-check';
const ROUTES = ['inicio', 'tareas', 'asignaturas', 'horario', 'apuntes', 'avisos', 'pagos', 'pensum', 'asistente', 'ajustes', 'conectar', 'ayuda'];
const VIEWPORTS = [{ name: 'movil', width: 390, height: 844 }, { name: 'pc', width: 1440, height: 900 }];

try { execSync('npx wrangler d1 migrations apply rumbo-db --local', { stdio: 'ignore', shell: true, timeout: 60000, killSignal: 'SIGKILL' }); }
catch (e) { if (e.code !== 'ETIMEDOUT') throw e; }

const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', `APP_PASSWORD:${PASS}`, '--var', `SESSION_SECRET:${SECRET}`, '--var', 'MOODLE_TOKEN:'], { shell: true, stdio: 'ignore' });
const stop = () => { try { process.platform === 'win32' ? execSync(`taskkill /pid ${dev.pid} /T /F`, { stdio: 'ignore' }) : dev.kill('SIGTERM'); } catch { /* ya terminó */ } };
process.on('exit', stop);

async function ready() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status < 500) return; } catch { /* arrancando */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('wrangler dev no arrancó');
}

// Dentro de la página: busca textos cortados y cosas que se salen de la pantalla.
const AUDIT = () => {
  const issues = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 2) issues.push(`la página se desplaza de lado (${document.documentElement.scrollWidth}px > ${vw}px)`);
  const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ' «' + (el.textContent || '').trim().slice(0, 30) + '»';
  const scrollParent = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  for (const el of document.querySelectorAll('.rbx *, .tabbar *, .sidebar *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.matches('.tick, .b1, .b2, .b3, .sr-only, [aria-hidden="true"]') || el.closest('.sr-only, [aria-hidden="true"]')) continue;
    if (r.right > vw + 2 && !scrollParent(el) && !el.closest('.scroller, .pensum, [role="group"]')) issues.push('se sale por la derecha: ' + label(el));
    const clipsText = (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none' && el.children.length === 0 && (el.textContent || '').trim();
    if (clipsText) issues.push('texto cortado sin puntos suspensivos: ' + label(el));
  }
  return [...new Set(issues)].slice(0, 12);
};

let failures = 0;
try {
  await ready();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx0 = await browser.newContext();
  const login = await ctx0.request.post(`${BASE}/api/login`, { data: { password: PASS } });
  if (!login.ok()) throw new Error('No pude entrar: ' + login.status());
  const state = await ctx0.storageState();
  const seed = (u, b) => ctx0.request.post(BASE + u, { data: b });
  for (const [name, code, color] of [['Lógica Computacional', 'LC-101', '#2350FF'], ['Ser Humano y Desarrollo Sostenible', 'SHD-120', '#7B5CFF'], ['Inglés Comunicativo', 'ING-110', '#FF7A1A']]) await seed('/api/courses', { name, code, color });
  const courses = await (await ctx0.request.get(BASE + '/api/courses')).json();
  const now = Math.floor(Date.now() / 1000);
  for (const [title, off, ci] of [['Foro sobre métodos de demostración matemática y su aplicación en la lógica proposicional', -20 * 86400, 0], ['Tarea I y II (unificadas)', 28 * 3600, 1], ['Práctica: inducción matemática', 4 * 86400, 0]]) await seed('/api/tasks', { title, due_at: now + off, course_id: courses[ci]?.id });
  await ctx0.close();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: state, hasTouch: vp.name === 'movil' });
    await ctx.addInitScript(() => { try { localStorage.setItem('rumbo-welcome', '1'); localStorage.setItem('rumbo-gesto', '1'); } catch { /* sin almacenamiento */ } });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(`${BASE}/#${route}`);
      await page.reload();
      await page.waitForTimeout(2200);
      const issues = await page.evaluate(AUDIT);
      await page.screenshot({ path: `${OUT}/${vp.name}-${route}.png`, fullPage: false });
      console.log(`${issues.length ? '⚠️ ' : '✅'} ${vp.name} · ${route}${issues.length ? '\n    ' + issues.join('\n    ') : ''}`);
      failures += issues.length;
    }
    await ctx.close();
  }
  await browser.close();
} catch (e) {
  console.error('❌ ' + e.message);
  failures = -1;
} finally {
  stop();
}
console.log(failures > 0 ? `\n${failures} detalle(s) por revisar. Capturas en ${OUT}/` : failures === 0 ? `\nTodo en orden. Capturas en ${OUT}/` : '');
process.exit(failures === 0 ? 0 : 1);
