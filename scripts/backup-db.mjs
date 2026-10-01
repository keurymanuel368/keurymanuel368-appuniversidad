// Copia completa de la base de datos en tu PC (archivo .sql en la carpeta backups/, que no se sube a GitHub).
// Uso: npm run backup:db
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const file = `backups/rumbo-${stamp}.sql`;
execSync(`npx wrangler d1 export rumbo-db --remote --output ${file}`, { stdio: 'inherit' });
console.log(`\n✅ Copia guardada en ${file}`);
