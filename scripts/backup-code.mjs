// Respaldo del código: después de cada `npm run deploy` guarda los cambios en GitHub (repositorio privado).
// Nunca detiene la publicación: si no hay internet o falla el push, solo avisa.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
try {
  const version = /version:\s*(\d+)/.exec(readFileSync('src/worker/changelog.ts', 'utf8'))?.[1] || '?';
  const title = /title:\s*'([^']+)'/.exec(readFileSync('src/worker/changelog.ts', 'utf8'))?.[1] || '';
  run('git add -A');
  if (run('git status --porcelain')) {
    execSync(`git commit -q -m ${JSON.stringify(`v${version}: ${title}`)}`, { stdio: 'ignore' });
  }
  run('git push -q origin HEAD');
  console.log(`☁️  Código respaldado en GitHub (v${version}).`);
} catch (e) {
  console.log('⚠️  No se pudo respaldar el código en GitHub ahora:', (e.stderr?.toString() || e.message).split('\n')[0]);
}
