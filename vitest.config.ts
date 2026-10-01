import { defineConfig } from 'vitest/config';

// Pruebas automáticas (npm test): la lógica delicada que no debe romperse con cambios nuevos.
// `npm run deploy` las corre primero y no publica si alguna falla.
export default defineConfig({
  define: { __APP_VERSION__: '0' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
