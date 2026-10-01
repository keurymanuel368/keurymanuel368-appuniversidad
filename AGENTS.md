# AGENTS.md — Guía de Rumbo para asistentes de IA

> Lee esto completo antes de tocar el código. Está escrito para que cualquier IA (Claude, Codex, Cursor, Gemini, Copilot…) entienda el proyecto en minutos.

## 1. Qué es Rumbo
App personal (PWA) de **Manuel**, estudiante de **Ingeniería en Software en la UAPA** (Universidad Abierta Para Adultos, República Dominicana). La UAPA organiza las carreras en **trimestres** (no cuatrimestres).

Rumbo junta en un solo lugar:
- **Tareas** del EVA (Moodle de la UAPA): pendientes, entregadas, instrucciones, plan semanal, modo enfoque (Pomodoro).
- **Notas** por actividad y por asignatura, índice del trimestre, riesgo, simulador e historial.
- **Pensum** oficial (16 trimestres, 225 créditos) que se marca solo con lo que cursa/aprueba.
- **Pagos**: ventana de pago mensual (día 25 al 5) y recordatorios.
- **Avisos**: foro de avisos y notificaciones del EVA + correos de la UAPA reenviados.
- **Asistente con IA** (gratis, Workers AI) que responde con los datos reales; también por **Telegram** y (si Meta lo permite) **WhatsApp**, incluidas **notas de voz**.
- **Notificaciones push** propias, numeritos rojos, calendario `.ics`, modo oscuro.

URL en producción: `https://rumbo.gestori.workers.dev` (Cloudflare Workers, cuenta de Manuel).

## 2. Reglas que NO se negocian
- **Idioma:** todo (UI, mensajes, comentarios, commits) en **español**.
- **Costo cero:** solo planes gratis. Nada de servicios de pago, tarjetas, Supabase ni Vercel. La IA va en cadena (`src/worker/llm.ts`): **Groq** → **NVIDIA NIM** → **Gemini** → **Workers AI** (según qué claves existan: `GROQ_API_KEY`, `NVIDIA_API_KEY`, `GEMINI_API_KEY`). Voz: Groq Whisper → Whisper en Workers AI. Ojo: la cuota gratis de Workers AI es de 10k neuronas/día; Deepgram Aura-2 es carísima (tope 700 letras/día).
- **Secretos:** nunca en código, `wrangler.jsonc`, commits ni chats. Solo `npx wrangler secret put NOMBRE`, y **Manuel los escribe él**. Las claves que genera la app (VAPID, `mail_token`, `calendar_token`, `tg_secret`) viven en la tabla `settings` de D1.
- **Base de datos:** nunca `wrangler d1 delete`. Cambios de esquema = nueva migración numerada en `migrations/`.
- **Estilo visual:** blanco y azul claro (modo oscuro azul noche), fuentes **Sora** (títulos), **Figtree** (texto) y **JetBrains Mono** (números). Mobile-first, sensación de app nativa.
- **Cada función nueva visible:** agrega una entrada ARRIBA en `src/worker/changelog.ts` con `version` mayor. `npm run deploy` llama a `/api/release/announce` al terminar y Manuel recibe al instante «✨ Nuevo en Rumbo» (una sola vez por versión).
- Antes de dar algo por terminado: `npm run typecheck` y `npm run build` sin errores.

## 3. Stack y estructura
- **Cloudflare Workers + D1 (SQLite) + Hono** → API en `src/worker/`.
- **React 19 + Vite** (sin librerías de UI) → PWA en `src/web/`. CSS propio en `src/web/styles.css` (tokens en `:root`, modo oscuro con `:root[data-mode="dark"]`).
- Un solo Worker sirve la PWA (`dist/`, assets) y la API (`/api/*`). Cron cada 30 min.

```
src/worker/
  index.ts       Rutas Hono (públicas: login, webhooks, mail ingest, calendario; el resto con sesión)
  auth.ts        Sesión por cookie HMAC + verificación de firma de Meta
  db.ts          Ajustes (tabla settings) y registro de envíos (sent_log)
  data.ts        Consultas compartidas: tareas, asignaturas, dashboard, resumen diario
  moodle.ts      Sincronización con el EVA (cursos, actividades, entregas, notas, facilitadores, avisos, pensum)
  cron.ts        Tareas programadas: sync EVA, resumen diario, recordatorios, pagos, novedades
  notify.ts      sendToMe(): push + Telegram + WhatsApp (+ CallMeBot opcional), con tipos de aviso
  push.ts        Web Push propio (VAPID + cifrado aes128gcm con WebCrypto, sin librerías)
  ai.ts          Asistente con IA: arma el contexto con los datos y llama a Workers AI
  assistant.ts   Comandos deterministas (nueva, recuérdame, listo, pagué…) y luego la IA
  voice.ts       Transcripción de notas de voz (Whisper)
  telegram.ts    Bot de Telegram (webhook con secret_token, vinculación por código)
  calendar.ts    Feed iCalendar (.ics) con alarmas
  changelog.ts   Novedades de la app y su anuncio automático
  pensums.ts     Catálogo de 22 carreras UAPA y pensum oficial de Ingeniería en Software (2025)
  time.ts        Fechas en hora de República Dominicana (UTC−4)
src/web/
  App.tsx        Shell: login, barra inferior (botón central = Asistente), menú «Más», numeritos rojos
  components.tsx Piezas reutilizables: Modal/hoja inferior, TaskRow (deslizar), TaskSheet, FocusMode,
                 RichText (formato del asistente), WeekStrip, Ring, CountUp, toasts, skeletons
  pages/         Inicio, Tareas (Pendientes/Plan/Entregadas/Todas), Asignaturas (Notas), Pensum,
                 Pagos, Avisos, Asistente, Ajustes
  push.ts        Suscripción a notificaciones   theme.ts  Modo claro/oscuro   Welcome.tsx  Bienvenida
public/          manifest, service worker (sw.js: caché + push + badge), iconos (scripts/make-icons.py)
migrations/      0001…0006 (esquema de D1)
```

## 4. Datos (D1)
Tablas principales: `courses` (asignaturas; `active=0` = trimestres pasados; `facilitator_eva`), `tasks` (`source` eva|manual, `status` pending|done, `moodle_key` = `assign:ID`/`quiz:ID`/`forum:ID`, `description`, `focus_minutes`), `grades` (`moodle_key` enlaza con la tarea), `pensum` (`term`, `status` pendiente|en_curso|aprobada, `prereqs`, `coreqs`, `kind`), `announcements` (`source` avisos|eva|correo|rumbo, `kind` pago|evento|nota|aviso|novedad), `payments`, `reminders`, `messages`, `push_subs`, `settings`, `sent_log`.

## 5. Integraciones y sus límites (importante)
- **EVA (Moodle):** token móvil `MOODLE_TOKEN` obtenido por el flujo SSO oficial (`admin/tool/mobile/launch.php`). Si expira, se repite ese flujo; nunca se automatiza el login con contraseña.
- **Correo UAPA (`@p.uapa.edu.do`, Google Workspace):** la UAPA bloquea Apps Script, reenvío automático, verificación en 2 pasos y contraseñas de aplicación. Solución vigente: Manuel **reenvía a mano** a su Gmail personal; un Apps Script en ese Gmail (generado en Ajustes) manda los correos a `/api/mail/ingest` con `X-Rumbo-Token`.
- **WhatsApp (Meta Cloud API, número de prueba):** recibir funciona; enviar está bloqueado por Meta (error 131031). Todo lo demás está listo por si lo desbloquean.
- **Telegram:** el canal de chat recomendado (sin ventana de 24 h). Requiere `TELEGRAM_BOT_TOKEN` (BotFather) y vincular el chat desde Ajustes.
- **Push:** sin servicios externos. Una app web no puede elegir el sonido; se cambia en los ajustes del teléfono (guía en la app).
- **IA (src/worker/llm.ts):** cadena gratis Groq → Cerebras → NVIDIA → Gemini → OpenRouter (`:free`) → Workers AI. Cada proveedor descubre sus modelos (`/models`), guarda hasta 6 candidatos en `settings.llm_models_<proveedor>`, descarta los retirados (`llm_bad_<proveedor>`) y salta los saturados (429) por un rato. Nunca escribas nombres de modelo fijos.
- **Memoria de la IA:** `settings.ai_memory`. La IA decide qué guardar (campo `remember`, lista) y, al pasar ~2.400 caracteres, la reordena por temas sola.
- **Widget Android (android-widget/):** app nativa mínima en Java (sin AndroidX) con un AppWidget estilo Duolingo. Lee `GET /api/widget/<widget_token>` (público, solo lectura). Se conecta con el enlace `rumbo://conectar?u=<origen>&t=<token>` que da `POST /api/widget/setup`. El APK se sirve desde `public/rumbo-widget.apk`. Compilar: JDK 17 + Gradle 8.10 → `gradle assembleRelease` dentro de `android-widget/`, y copiar `app/build/outputs/apk/release/app-release.apk` a `public/rumbo-widget.apk`. **Cada APK nuevo:** sube `versionCode` en `android-widget/app/build.gradle` y el mismo número en `WIDGET_VERSION` (`src/worker/widget.ts`); los widgets instalados lo ven en `/api/version` y se actualizan solos (JobScheduler cada 15 min + PackageInstaller).
- **Auto-actualización web:** `src/web/updater.ts` compara `__APP_VERSION__` (versión más alta del changelog, inyectada por `vite.config.ts`) con `/api/version` y recarga en un momento tranquilo.
- **Cloudflare gratis:** ~50 llamadas externas por ejecución; la sync reparte el trabajo (asignaturas pasadas de a poco).

## 6. Comandos
```bash
npm install
npm run typecheck          # worker + web
npm run build              # web → dist/
npm run deploy             # build + wrangler deploy
npm run db:local           # migraciones en D1 local
npm run db:remote          # migraciones en producción (preguntar antes)
npx wrangler dev --var APP_PASSWORD:prueba --var SESSION_SECRET:una-clave-larga   # probar en local (http://localhost:8787)
npx wrangler tail          # ver registros en vivo
python scripts/make-icons.py   # regenerar iconos (requiere Pillow)
```
Para probar con datos de ejemplo, carga filas en la D1 **local**; nunca en la remota.

## 6b. Respaldo, pruebas y alertas (Fase 1)
- **Código:** repositorio privado https://github.com/manuel3680p-debug/rumbo. `npm run deploy` corre las pruebas, publica y al final hace commit + push solo (`scripts/backup-code.mjs`). El repo usa un ayudante de credenciales local que pide el token de la cuenta manuel3680p-debug a `gh`.
- **Datos:** copia semanal automática (cron) en KV `BACKUPS` (`src/worker/backup.ts`, últimas 8, sin claves privadas). Ajustes → Copias de seguridad para hacer o descargar. Copia completa local: `npm run backup:db` (carpeta `backups/`, ignorada por git). D1 además tiene Time Travel de 7 días.
- **Pruebas:** `npm test` (Vitest, carpeta `tests/`). Si cambias la voz, la lectura de la IA, los modelos, las notas o las fechas, agrega o ajusta pruebas.
- **Alertas:** `src/worker/health.ts` avisa una vez al día si el EVA falla o lleva más de 12 h sin sincronizar, si todos los motores de IA fallan o si falla la copia.
- **Calificaciones:** `src/worker/grades.ts` avisa notas nuevas o cambiadas (con el comentario del facilitador, `grades.feedback`) desde cualquier sincronización.

## 7. Convenciones de código
- TypeScript estricto, componentes funcionales, sin librerías nuevas salvo que sea imprescindible.
- Textos de la UI cortos, cálidos y claros, en español dominicano neutro. Fechas con `America/Santo_Domingo`.
- Comentarios en español explicando el *porqué*.
- Formato de mensajes del asistente: estilo WhatsApp (`*negrita*`, `• listas`); la app lo convierte con `RichText` y Telegram con HTML.
- Accesibilidad: `aria-*` en botones de solo icono, foco visible, respeta `prefers-reduced-motion`.
