// Prueba de humo antes de publicar: levanta Rumbo en local (base de datos local), entra y abre
// las pantallas principales. Si alguna responde con error, NO se publica.
// Uso: npm run smoke   (lo corre solo `npm run deploy`)
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'smoke-' + randomBytes(6).toString('hex');
const SECRET = randomBytes(24).toString('hex');

console.log('🧪 Prueba de humo: aplicando migraciones locales…');
// wrangler a veces termina la migración pero no cierra el proceso: se le da un tiempo y se sigue.
try { execSync('npx wrangler d1 migrations apply rumbo-db --local', { stdio: 'ignore', shell: true, timeout: 60000, killSignal: 'SIGKILL' }); }
catch (e) { if (e.code !== 'ETIMEDOUT') throw e; }

const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', `APP_PASSWORD:${PASS}`, '--var', `SESSION_SECRET:${SECRET}`, '--var', 'MOODLE_TOKEN:'],
  { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
dev.stdout.on('data', (d) => { out += d; });
dev.stderr.on('data', (d) => { out += d; });

function stop() {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${dev.pid} /T /F`, { stdio: 'ignore' });
    else dev.kill('SIGTERM');
  } catch { /* ya terminó */ }
}

async function ready() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status < 500) return; } catch { /* todavía arrancando */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('wrangler dev no arrancó en 2 minutos:\n' + out.slice(-1500));
}

const failures = [];
try {
  await ready();
  const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASS }) });
  if (!login.ok) throw new Error(`No pude entrar: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const get = async (path) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie } });
    const body = await r.text();
    if (r.status >= 500 || (r.status >= 400 && r.status !== 404)) failures.push(`${path} → ${r.status} ${body.slice(0, 200)}`);
    else console.log(`  ✓ ${path}`);
    try { return JSON.parse(body); } catch { return null; }
  };
  await get('/api/dashboard');
  const tasks = await get('/api/tasks');
  await get('/api/tasks?status=pending');
  await get('/api/tasks?status=done');
  if (Array.isArray(tasks) && tasks.length) await get(`/api/tasks/${tasks[0].id}`);
  const courses = await get('/api/courses');
  if (Array.isArray(courses) && courses.length) await get(`/api/courses/${courses[0].id}/grades`);
  for (const p of ['/api/courses/history', '/api/announcements', '/api/payments', '/api/settings', '/api/pensum', '/api/search?q=foro',
    '/api/grades/history', '/api/feedback-notes', '/api/record', '/api/eva/can', '/api/plan/preview', '/api/achievements',
    '/api/ignored-tasks', '/api/usage', '/api/estudio/estado', '/api/tts/status', '/api/works', '/api/clases', '/api/index-trend', '/api/week-story', '/api/telegram/status', '/api/wa/status']) await get(p);
  const page = await fetch(`${BASE}/`);
  if (!page.ok || !(await page.text()).includes('<div id="root">')) failures.push('/ → la página principal no cargó');
  else console.log('  ✓ /');
} catch (e) {
  failures.push(e.message);
} finally {
  stop();
}

if (failures.length) {
  console.error('\n❌ La prueba de humo falló. No se publica:\n' + failures.map((f) => '  • ' + f).join('\n'));
  process.exit(1);
}
console.log('✅ Prueba de humo: todo responde bien.');
process.exit(0);
