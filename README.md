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

Las claves secretas **no están en el código**. Siguen guardadas en Cloudflare (no se pierden al publicar desde GitHub), y además puedes verlas y cambiarlas desde la app en `/llaves`.

## Cómo se publica

Cada vez que guardas un cambio en GitHub (rama `main`), Cloudflare publica la nueva versión sola en uno o dos minutos. Puedes ver el avance en Workers & Pages → Rumbo → Deployments.

## Llaves y configuración

Para ver, cambiar o poner claves (IA, EVA, WhatsApp, etc.) sin usar la terminal, abre `https://rumbo.gestori.workers.dev/llaves` con tu sesión de administrador.

También puedes llegar desde la app, en **Ajustes → Acciones → Llaves y configuración**.

- Las claves secretas se ven ocultas. Para verlas completas te pide tu contraseña.
- Lo que guardes ahí manda sobre lo que hay en Cloudflare. Si borras un valor de la app, Rumbo vuelve a usar el de Cloudflare.

## Tiempo real

Cuando algo cambia, Rumbo se actualiza solo en todos tus dispositivos abiertos. Eso pasa cuando:

- le pides algo al bot;
- marcas una tarea en el celular;
- se sincroniza la EVA.

Funciona con un Durable Object (`RumboLive`) y WebSockets. El archivo `public/live.js` es el que escucha y le avisa a la app que recargue los datos.

## Bot de Telegram: funciones

- **Respuestas con formato y botones:** /hoy, /tareas, /notas, /pagos, /semana y /necesito.
- **Avisos automáticos:**
  - resumen de la mañana;
  - nota nueva;
  - recordatorios con «Ya la entregué», «+1 h», «+3 h» y «Esta noche»;
  - cierre de la semana, los domingos a las 7 p. m.
- **Fotos:** mándale una foto y la explica o resuelve. Usa Gemini, Groq o Workers AI.
- **PDF:** mándale un PDF y te da un resumen con 5 preguntas de repaso.
- **Notas de voz:** le hablas y entiende; también crea tareas («ponme el foro de ética para el viernes»).
- **Botones «Abrir Rumbo» y «Llamar a Rumbo»:** abren la app dentro de Telegram y entran solos si tu Telegram está vinculado.

## Bot de Telegram

Abre `https://TU-DOMINIO/telegram` con tu sesión de Rumbo iniciada.

- Como administrador, pegas ahí el token que te dio @BotFather, una sola vez.
- Cada usuario entra a esa misma página y vincula su propio Telegram.

La página explica todo, paso por paso.

## Widget de Android

El código está en la carpeta `widget/`, escrito en Java, sin librerías extra.

Cuando cambias algo ahí, GitHub Actions compila el APK solo (`.github/workflows/widget.yml`). Lo guarda en `public/rumbo-widget.apk`, y Cloudflare lo publica.

- **Color según tu día:** azul si vas tranquilo, naranja si algo vence hoy, rojo si tienes algo atrasado y verde si estás al día.
- **Pequeño (2×2):** número grande de pendientes, la próxima entrega y su cuenta regresiva.
- **Mediano (4×2):** saludo del día, tu índice en un anillo y la próxima entrega con cuenta regresiva en vivo.
- **Grande (4×4):** todo lo anterior, más tu semana (los días con entregas tienen un punto), la lista de próximas entregas y datos rápidos (pendientes, racha y última nota).
- **Cambiar de tamaño:** mantén presionado el widget y estíralo; el diseño cambia solo.
- **Tema:** claro y oscuro automático, igual que el teléfono.
- **Actualización:** cada 30 minutos, o al tocar ↻.
- **Firma:** el APK se firma con `widget/rumbo-widget.jks`, para que cada versión se instale encima de la anterior. No borres ese archivo.
