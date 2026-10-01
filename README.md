# Rumbo · v1

App personal para llevar la universidad bajo control: tareas del EVA, notas, pensum, pagos y un asistente por WhatsApp que te escribe todos los días.

**Costo: RD$ 0.** Todo corre en planes gratis y no pide tarjeta.

| Pieza | Servicio | Por qué es gratis |
| --- | --- | --- |
| App y API | Cloudflare Workers | Plan gratis: 100 000 peticiones al día |
| Base de datos | Cloudflare D1 | Plan gratis (sobra para una persona) |
| Tareas programadas | Cron Triggers de Workers | 1 cron cada 30 min, incluido en el plan gratis |
| Chat por WhatsApp | API de WhatsApp Cloud con el **número de prueba de Meta** | Meta no cobra los mensajes del número de prueba |
| Avisos automáticos | Notificaciones push de la propia app | Las envía el Worker directamente, sin servicios externos |
| Notas de voz | Whisper en Workers AI | Incluido en el plan gratis de Cloudflare |
| Tareas y notas | Servicios web del EVA (Moodle) | Usa tu propio acceso, igual que la app de Moodle |

---

## Qué trae esta versión

- **Inicio:** lo que vence hoy, avance del trimestre, promedio, asignaturas y ventana de pago.
- **Tareas:** se traen solas del EVA cada 2 horas; también puedes crear tareas propias. Se agrupan en vencidas, próximos 7 días, más adelante y sin fecha.
- **Asignaturas y notas:** notas por actividad y un simulador de "¿cuánto necesito en lo que falta?".
- **Pensum:** mapa por trimestres (elige tu carrera y se carga el pensum oficial) con aprobadas, en curso, disponibles y bloqueadas por prerrequisito; créditos e índice.
- **Pagos:** ventana del 25 al 5 (configurable), registro de pagos, historial y días de aviso.
- **Asistente por WhatsApp:**
  - Resumen diario a la hora que elijas.
  - Recordatorios 72 h, 24 h y 3 h antes de cada entrega.
  - Avisos de pago y de notas nuevas.
  - Conversación por comandos (lista más abajo).
- **PWA:** se instala en el teléfono como una app.

---

## 1. Probarla en tu PC

Necesitas **Node.js 20 o superior**.

```bash
npm install
cp .dev.vars.example .dev.vars        # y cambia APP_PASSWORD y SESSION_SECRET
npm run db:local                      # crea la base de datos local
npm run dev                           # abre http://localhost:8787
```

Entra con la contraseña que pusiste en `APP_PASSWORD`.

---

## 2. Obtener tu token del EVA

El token deja que Rumbo lea **tus** asignaturas, entregas y notas. Tu contraseña se usa solo en este paso y **no se guarda** en ningún lado.

En la terminal de tu PC (Git Bash, PowerShell o la terminal de Mac/Linux):

```bash
curl "https://eva.uapa.edu.do/login/token.php?service=moodle_mobile_app" \
  --data-urlencode "username=TU_MATRICULA" \
  --data-urlencode "password=TU_CONTRASEÑA"
```

- Si responde `{"token":"abc123..."}`, copia ese valor: es tu `MOODLE_TOKEN`.
- Si responde un error, el EVA no permite este acceso (por ejemplo, si el inicio de sesión es solo con Microsoft o Google). Rumbo sigue funcionando: agregas las tareas a mano o por WhatsApp con `nueva`.

Para probarlo en local, pega el token en `.dev.vars` (`MOODLE_TOKEN=...`) y pulsa **Sincronizar EVA** en la pantalla Tareas.

---

## 3. Publicarla en Cloudflare (gratis)

1. Crea una cuenta gratis en <https://dash.cloudflare.com/sign-up>. No pide tarjeta.
2. En la carpeta del proyecto:

```bash
npx wrangler login
npx wrangler d1 create rumbo-db
```

3. Copia el `database_id` que te muestra y pégalo en `wrangler.jsonc`, donde dice `00000000-...`.
4. Crea las tablas y los secretos. Cada `secret put` te pide el valor:

```bash
npm run db:remote
npx wrangler secret put APP_PASSWORD       # la contraseña para entrar a Rumbo
npx wrangler secret put SESSION_SECRET     # un texto largo y aleatorio (40+ caracteres)
npx wrangler secret put MOODLE_TOKEN       # el token del paso 2
```

5. Publica:

```bash
npm run deploy
```

Te da una dirección como `https://rumbo.TU-USUARIO.workers.dev`. Esa es tu app.

---

## 4. Conectar WhatsApp (gratis, con el número de prueba de Meta)

1. Entra a <https://developers.facebook.com> con tu Facebook y crea una app.
   - Tipo **Empresa** (o el caso de uso "Conectarte con clientes por WhatsApp").
   - Agrega el producto **WhatsApp**.
2. En **WhatsApp → Configuración de la API** verás el número de prueba (+1 555…).
   - Copia el **Identificador del número de teléfono**. Es tu `WA_PHONE_NUMBER_ID`.
   - En **"Para"**, agrega tu número de WhatsApp y confírmalo con el código que te llega.
3. Crea un token que no caduque. El que aparece en la pantalla dura solo 24 h.
   - Entra a <https://business.facebook.com> → **Configuración → Usuarios del sistema** → **Agregar** (rol administrador).
   - En **Asignar activos**, dale control total de tu app.
   - Pulsa **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y caducidad **Nunca**. Ese es tu `WA_TOKEN`.
4. Busca la **clave secreta de la app** en **Configuración de la app → Básica**. Es tu `WA_APP_SECRET`.
5. Guarda los secretos:

```bash
npx wrangler secret put WA_PHONE_NUMBER_ID
npx wrangler secret put WA_TOKEN
npx wrangler secret put WA_APP_SECRET
npx wrangler secret put WA_VERIFY_TOKEN    # inventa una palabra, p. ej. rumbo-2026
npx wrangler secret put WA_MY_NUMBER       # tu número con código de país, sin +: 1809XXXXXXX
```

6. Configura el webhook en **WhatsApp → Configuración**:
   - **URL de devolución de llamada:** `https://rumbo.TU-USUARIO.workers.dev/api/whatsapp/webhook`
   - **Token de verificación:** la misma palabra de `WA_VERIFY_TOKEN`.
   - Pulsa **Verificar y guardar**. Luego, en **Campos del webhook**, suscríbete a **messages**.
7. Escríbele **"hola"** al número de prueba desde tu WhatsApp. Te responde con la lista de comandos.

8. **Notas de voz:** mándale un audio, por ejemplo *"¿cuánto saqué en el foro de Tecnología?"*. Rumbo lo transcribe con Whisper en Workers AI (incluido en el plan gratis de Cloudflare, sin configurar nada) y te responde con lo que entendió y la respuesta.

> **La regla de las 24 horas.** WhatsApp solo deja que Rumbo te escriba libremente durante 24 horas después de tu último mensaje. Mientras le escribas algo cada día (aunque sea "hoy"), tus resúmenes llegan por WhatsApp. Si la ventana se cierra, el resumen te llega igual como **notificación de la app** (paso 5), con un botón **Pedir por WhatsApp** que abre el chat con "hoy" ya escrito: lo envías y la ventana queda abierta otra vez. Así nunca se paga nada.

---

## 5. Activar las notificaciones de la app (gratis)

Rumbo envía notificaciones push él mismo, sin servicios externos ni secretos (las claves se generan solas).

1. Instala Rumbo en el teléfono (paso 6). En iPhone es obligatorio y necesitas iOS 16.4 o superior.
2. Abre **Ajustes → Notificaciones** y activa **Notificaciones en este dispositivo**. Acepta el permiso.
3. Te llega una notificación de prueba. Desde ese momento recibes el resumen diario, las entregas próximas, los avisos de pago y las notas nuevas.

Si no quieres el aviso doble cuando algo ya llegó por WhatsApp, apaga **Notificar también si llegó por WhatsApp**.

### CallMeBot (opcional, no recomendado)

Si aun así quieres un respaldo por WhatsApp cuando la ventana está cerrada, puedes usar CallMeBot. A veces se retrasa o deja de enviar.

1. Guarda el número **+34 621 331 709** en tus contactos.
2. Envíale por WhatsApp exactamente: `I allow callmebot to send me messages`
3. Te responde con tu **apikey** en unos minutos. Guárdala:

```bash
npx wrangler secret put CALLMEBOT_APIKEY
```

Con eso ya puedes probar desde **Ajustes → Enviar mensaje de prueba**.

---

## 6. Instalar Rumbo en el teléfono

- **Android (Chrome):** abre tu dirección `…workers.dev`, toca el menú ⋮ → **Instalar app**.
- **iPhone (Safari):** toca **Compartir** → **Agregar a pantalla de inicio**.

---

## Comandos del asistente

| Escribes | Qué hace |
| --- | --- |
| `hoy` | Tu resumen del día |
| `tareas` | Entregas pendientes con su número |
| `notas` | Promedio por asignatura |
| `pagos` | Estado de la ventana de pago |
| `pagué` o `pagué 4500` | Registra el pago de la cuota del mes |
| `listo 12` | Marca la tarea #12 como hecha |
| `nueva Estudiar lógica el viernes a las 7pm` | Crea una tarea |
| `recuérdame mañana 6pm entregar el video` | Programa un recordatorio |
| `sincronizar` | Trae lo nuevo del EVA en ese momento |
| `ayuda` | La lista de comandos |

Fechas que entiende: `hoy`, `mañana`, `pasado mañana`, días de la semana, `5/10`, `2026-10-05`. Horas que entiende: `18:00`, `6pm`, `6:30 pm`, `a las 7`.

También entiende preguntas normales, escritas o en nota de voz: *"¿qué me falta por entregar?"*, *"¿cuánto tengo en los foros?"*, *"¿cuándo tengo que pagar la cuota?"*.

Todo esto también se puede probar dentro de la app, en **Asistente**.

---

## Primeros ajustes recomendados

1. **Ajustes:** hora del resumen, fecha de inicio y fin del trimestre (activa el anillo de avance) y cómo te saludo.
2. **Pagos:** monto habitual de la cuota y días de aviso.
3. **Pensum → Importar:** pega tu pensum en JSON. Truco: pásale el PDF de tu pensum a Claude y pídele *"conviértelo al formato de ejemplo de Rumbo"*. Tienes una plantilla en `ejemplos/pensum-ejemplo.json`.

---

## Solución de problemas

| Problema | Qué hacer |
| --- | --- |
| "Faltan los secretos APP_PASSWORD y SESSION_SECRET" | Créalos con `npx wrangler secret put …` y vuelve a publicar |
| El EVA da "Token no válido" | Genera el token otra vez (paso 2) y actualiza `MOODLE_TOKEN` |
| WhatsApp no responde | Revisa que el webhook esté verificado y suscrito a **messages**, y que `WA_MY_NUMBER` sea tu número sin `+` |
| El resumen no llega | Activa las notificaciones en **Ajustes** (llegan aunque la ventana de WhatsApp esté cerrada) |
| No llegan notificaciones | Revisa que el permiso de notificaciones de Rumbo esté activo en el teléfono y pulsa **Enviar notificación de prueba** |
| La nota de voz responde con error | Revisa con `npx wrangler tail`; los audios de más de ~8 minutos se rechazan |
| Ver qué pasó en el cron | `npx wrangler tail` muestra los registros en vivo |

---

## Estructura del proyecto

```
src/worker/   API (Hono), sincronización con el EVA, asistente, cron y envíos
src/web/      App React (PWA) con el diseño blanco y azul
migrations/   Esquema de la base de datos D1
public/       Íconos, manifest y service worker de la PWA
```

## Próximas fases

- **Fase 4:** importar el pensum desde el PDF dentro de la app y subir comprobantes de pago.
- **Fase 5:** conversación con IA gratis (nivel gratuito de Gemini) para preguntas libres.
- **Fase 6:** modo oscuro, resumen semanal y notificaciones push de la PWA.
