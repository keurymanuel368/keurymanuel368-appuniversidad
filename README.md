# Rumbo

Rumbo es tu asistente de la universidad (EVA/Moodle de UAPA). Lleva tus tareas, notas, pagos y avisos, y te escribe por Telegram, WhatsApp y notificaciones.

Funciona en **Cloudflare Workers** con una base de datos **D1**.

## Qué hay en este repositorio

| Carpeta o archivo | Qué es |
|---|---|
| `src/index.js` | El servidor (la API, el bot de Telegram, las tareas programadas). Es el código que estaba publicado en Cloudflare. |
| `public/` | La app que ve el usuario (páginas, estilos, íconos, `rumbo-widget.apk`). |
| `wrangler.toml` | La configuración para Cloudflare: base de datos, respaldos, IA y horarios. |
| `package.json` | Le dice a Cloudflare que publique con `wrangler`. |

Las claves secretas (por ejemplo `SESSION_SECRET`, `MOODLE_TOKEN`, `GROQ_API_KEY` y las de WhatsApp) **no están aquí**. Siguen guardadas en Cloudflare, en Settings → Variables and Secrets, y no se pierden al publicar desde GitHub.

## Cómo se publica

Cada vez que guardas un cambio en GitHub (rama `main`), Cloudflare publica la nueva versión sola en uno o dos minutos. Puedes ver el avance en Workers & Pages → Rumbo → Deployments.

## Bot de Telegram

Abre `https://TU-DOMINIO/telegram` con tu sesión de Rumbo iniciada.

- Como administrador, pegas ahí el token que te dio @BotFather, una sola vez.
- Cada usuario entra a esa misma página y vincula su propio Telegram.

La página explica todo, paso por paso.
