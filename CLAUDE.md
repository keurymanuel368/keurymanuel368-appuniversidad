# Instrucciones para agentes (Claude Code)

> **Primero lee `AGENTS.md`**: explica el proyecto completo (qué hace, estructura, datos, integraciones, límites y convenciones).

Proyecto: **Rumbo**, app personal de Manuel para la universidad (UAPA).
- **Stack:** Cloudflare Workers + D1 + Hono (API en `src/worker/`) y React 19 + Vite (PWA en `src/web/`).
- **Idioma:** responde y escribe todo en español.
- **Costo:** cero. No agregues servicios de pago, ni Supabase, ni Vercel, ni tarjetas.

## Reglas de seguridad
- Nunca escribas secretos en `wrangler.jsonc`, en el código ni en commits.
  - Los secretos van solo con `npx wrangler secret put NOMBRE`.
  - Cuando un comando pida un valor secreto, **detente y pide a Manuel que lo escriba él en la terminal**. No le pidas que te lo pegue en el chat.
- La contraseña del EVA se usa una sola vez para obtener el token y no se guarda en ningún archivo.
- No borres la base de datos remota ni ejecutes `wrangler d1 delete`.

## Guía original de instalación (ya completada; útil si se reinstala desde cero)

Sistema probable: Windows con PowerShell.
- Usa `copy` en lugar de `cp`.
- Usa `curl.exe` en lugar de `curl`.

1. **Revisa la instalación de Node.**
   - Comprueba con `node -v` que sea la versión 20 o superior. Si no lo es, pide a Manuel que instale la versión LTS desde nodejs.org.
   - Después ejecuta `npm install`.
2. **Configura y prueba en local.**
   - Si falta `.dev.vars`, créalo copiando `.dev.vars.example`.
   - Genera un `SESSION_SECRET` aleatorio de 48 caracteres y escríbelo en `.dev.vars`.
   - Pide a Manuel que ponga él su `APP_PASSWORD` en `.dev.vars`.
   - Ejecuta `npm run db:local` y luego `npm run typecheck`. Deben pasar sin errores.
3. **Conecta Cloudflare.** Ejecuta `npx wrangler login`. Abre el navegador; Manuel pulsa **Allow**. Espera a que confirme.
4. **Crea la base de datos en la nube.**
   - Ejecuta `npx wrangler d1 create rumbo-db`. Si ya existe, obtén el id con `npx wrangler d1 list`.
   - Reemplaza `00000000-0000-0000-0000-000000000000` en `wrangler.jsonc` por el `database_id` real. No cambies nada más de ese archivo.
5. **Crea las tablas.** Ejecuta `npm run db:remote` y responde `y` si pregunta.
6. **Publica.**
   - Ejecuta `npm run deploy`.
   - Si pide registrar un subdominio `workers.dev`, pregunta a Manuel cuál quiere.
   - Anota la URL final.
7. **Guarda los secretos.** Manuel escribe cada valor él mismo.
   - `npx wrangler secret put SESSION_SECRET`: el mismo valor de `.dev.vars`.
   - `npx wrangler secret put APP_PASSWORD`
   - `npx wrangler secret put MOODLE_TOKEN`: solo si el paso 8 da un token.
8. **Token del EVA (opcional).**
   - Pide a Manuel que ejecute él mismo, sin pegarlo en el chat:
     `curl.exe -s "https://eva.uapa.edu.do/login/token.php?service=moodle_mobile_app" --data-urlencode "username=MATRICULA" --data-urlencode "password=CONTRASEÑA"`
   - Si responde `{"token":"..."}`, Manuel lo guarda con `npx wrangler secret put MOODLE_TOKEN`.
   - Si responde un error, sigue sin EVA. Las tareas se agregan a mano.
9. **Verifica.**
   - Abre `https://<url>/api/health`. Debe responder `ok`.
   - Pide a Manuel que entre a la URL con su contraseña.
   - Si algo falla, usa `npx wrangler tail` para ver los errores.
10. **Resume.** Explícale a Manuel en pocas líneas: la URL, qué quedó configurado y qué falta. Por ejemplo, WhatsApp: pasos 4 y 5 del README.

## Otras tareas
- Antes de dar por terminado un cambio, ejecuta `npm run typecheck` y `npm run build`.
- Mantén el estilo visual: blanco y azul claro (y modo oscuro), y las fuentes Sora, Figtree y JetBrains Mono.
- Cada función nueva visible: agrega una entrada arriba en `src/worker/changelog.ts` (la app avisa sola a Manuel).
- Las carreras son por **trimestres**.
