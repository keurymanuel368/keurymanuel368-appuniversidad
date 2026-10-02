// Novedades de Rumbo. Cada vez que se publica algo nuevo, se agrega una entrada ARRIBA con un número
// de versión mayor: Rumbo lo detecta solo, te manda una notificación "✨ Nuevo en Rumbo" y lo deja en Avisos.
import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { sendToMe } from './notify';
import { nowSec } from './time';

export type Release = { version: number; date: string; title: string; items: string[] };

export const CHANGELOG: Release[] = [
  {
    version: 24,
    date: '2026-10-02',
    title: 'Comentarios y más control',
    items: [
      'Ajustes → Comentarios: cuéntanos si algo falla o tienes una idea. Le llega al momento a quien administra Rumbo.',
      'Cada compañero puede borrar su cuenta y todos sus datos desde Ajustes, cuando quiera.',
      'Tope diario de preguntas al asistente por compañero, para que la IA gratis alcance para todos.',
      'Compañeros muestra quién tiene el EVA y el WhatsApp conectados, cuánto usó la IA hoy y sus comentarios.',
    ],
  },
  {
    version: 23,
    date: '2026-10-02',
    title: 'WhatsApp más confiable',
    items: [
      'Si CallMeBot está saturado, Rumbo reintenta solo y, si aun así no sale, te manda el aviso por WhatsApp en la próxima vuelta (máximo 30 minutos). Ya no se pierde.',
      'Al activar los avisos, tu clave se guarda aunque CallMeBot esté ocupado, y te dice claro si la clave no coincide con tu número.',
    ],
  },
  {
    version: 22,
    date: '2026-10-02',
    title: 'Elige qué te llega por WhatsApp',
    items: [
      'En Conexiones eliges qué te llega por WhatsApp: resumen, entregas, notas, pagos, avisos o novedades.',
      'No molestar de 10 p. m. a 7 a. m.: en ese horario solo te llega la notificación del teléfono.',
      'Si CallMeBot no te responde, hay un botón para pedir la clave otra vez y te explica qué hacer.',
      'Inicio te avisa si te falta conectar algo (EVA, WhatsApp o tu carrera) y te lleva directo a terminarlo.',
      'Pasos más claros para conectar el EVA con el enlace, con un botón para copiarlo.',
    ],
  },
  {
    version: 21,
    date: '2026-10-02',
    title: '💬 Avisos por WhatsApp',
    items: [
      'Ahora el resumen del día y todos los avisos de Rumbo (entregas, notas nuevas, pagos, avisos del EVA) también te llegan por WhatsApp.',
      'Se activa en 2 minutos desde Más → Conexiones → «Activar avisos por WhatsApp», con CallMeBot (gratis). Cada quien pone su propio número.',
      'Antes de guardar, Rumbo te manda un mensaje de prueba para confirmar que llega.',
    ],
  },
  {
    version: 20,
    date: '2026-10-02',
    title: '👥 Rumbo para tus compañeros',
    items: [
      'Rumbo ahora es multiusuario: invita a tus compañeros desde Más → Compañeros y mándales el enlace por WhatsApp. Cada quien ve solo sus propios datos.',
      'Nueva pantalla Conexiones (Más → Conexiones): conecta el EVA, las notificaciones, WhatsApp y tu carrera paso a paso, con un botón cada cosa.',
      'El EVA se conecta desde la app con tu matrícula (la contraseña no se guarda), sin comandos en la computadora.',
      'Ahora entras con tu matrícula y puedes cambiar tu contraseña en Ajustes → Mi cuenta.',
      'Mejor accesibilidad: más contraste en los códigos de asignatura, los numeritos rojos y el modo oscuro, y botones más fáciles de tocar.',
    ],
  },
  {
    version: 19,
    date: '2026-10-01',
    title: '🎉 Rumbo 1.0 ya está aquí',
    items: [
      'Estudiar con IA: abre una tarea pendiente y te arma un plan paso a paso, tarjetas para practicar y una explicación que puedes escuchar.',
      'Logros tipo Duolingo en Inicio: 15 medallas por entregas, rachas, notas y más. La mascota celebra cada una contigo 🏆',
      'Hora de estudio: cada día a la hora que elijas (Ajustes) te aviso qué te toca estudiar.',
      '«¿Y si…?» en Notas: mueve la barra y mira con cuánto terminarías el trimestre según lo que saques en lo que falta.',
      'Más seguridad: bloqueo tras 5 intentos fallidos, aviso de cada inicio de sesión y «Cerrar sesión en todos los dispositivos».',
      'Nueva pantalla de Ayuda (Más → Ayuda) con buscador y respuestas a las dudas más comunes.',
    ],
  },
  {
    version: 18,
    date: '2026-10-01',
    title: 'Más rápida, sin internet y con widget pequeño',
    items: [
      'Funciona sin internet: tus tareas, notas, avisos, pagos y pensum se ven aunque no tengas señal (te avisa que es lo último guardado).',
      'Abre más rápido y cambiar de pantalla es instantáneo: cada sección se prepara en segundo plano.',
      'Nuevo widget pequeño (2×2) con la mascota animada, tu racha y lo próximo que vence. Mantén presionada la pantalla de inicio → Widgets → Rumbo.',
      'Bienvenida nueva guiada por la mascota. Puedes verla otra vez en Ajustes → Ver el recorrido de bienvenida.',
    ],
  },
  {
    version: 17,
    date: '2026-10-01',
    title: 'Te avisa cuando te califican',
    items: [
      'Cuando el facilitador corrige una tarea te llega un aviso con la nota, un emoji según cómo te fue y su comentario. Al tocarlo se abre la tarea.',
      'Si te cambian una nota también te avisa (y te dice cuánto tenías antes).',
      'La ficha de cada tarea muestra el comentario del facilitador, y las calificaciones quedan guardadas en Avisos.',
      'Copias de seguridad automáticas de tus datos cada semana: Ajustes → Copias de seguridad (también puedes descargarlas).',
      'Rumbo te avisa si el EVA deja de conectar, si la IA no responde o si falla una copia.',
    ],
  },
  {
    version: 16,
    date: '2026-10-01',
    title: 'Rumbo y el widget se actualizan solos',
    items: [
      'La app se actualiza sola: cuando hay versión nueva, recarga en un momento tranquilo y te avisa «Rumbo se actualizó ✨».',
      'El widget refresca tus datos cada 15 minutos aunque no lo toques.',
      'El widget revisa si hay versión nueva: muestra «Nueva versión · toca para actualizar» y con un toque se instala. Después de la primera vez, en Android 12 o más nuevo se actualiza solo.',
      'Esta última vez sí hay que instalarlo a mano: Ajustes → Widget → Descargar.',
    ],
  },
  {
    version: 15,
    date: '2026-10-01',
    title: 'Más clara, más cómoda y accesible',
    items: [
      'Cada tarea tiene una franja con el color de su asignatura: las distingues de un vistazo.',
      'Las tarjetas responden al tocarlas y los avisos del EVA ya no muestran códigos raros en el título.',
      'Más contraste en textos grises y en las tarjetas de color (Pagos e Inicio): se leen mejor al sol.',
      'Botones más fáciles de tocar, ventanas que se manejan bien con teclado y lector de pantalla, y enlace «Saltar al contenido».',
      'Las novedades de Rumbo en Avisos ahora dicen «Novedad de Rumbo» (antes decían EVA).',
    ],
  },
  {
    version: 14,
    date: '2026-10-01',
    title: 'Widget animado y mascota discreta',
    items: [
      'Widget nuevo: fondo de color según cómo vas y mascota animada (parpadea, salta y saluda).',
      'El widget rota solo entre tarjetas: cómo vas, próximas entregas, tus recordatorios, frase del día y tu semana.',
      'Para actualizarlo: Ajustes → Widget → Descargar e instalar encima (no hace falta conectarlo otra vez).',
      'La mascota de la app ya no estorba: después de saludar se asoma desde el borde y se esconde cuando bajas la pantalla. Tócala para que salga.',
    ],
  },
  {
    version: 13,
    date: '2026-10-01',
    title: 'Tu mascota te acompaña (y ya hay widget)',
    items: [
      'Mascota nueva y mucho más linda: un estudiante con birrete y brújula que parpadea, respira y cambia de cara según cómo vas.',
      'Ahora está en todas las pantallas: al cambiar de sección cae desde arriba, rebota y te dice algo.',
      'Tócala y reacciona (si la tocas mucho se marea 😵‍💫). Mantenla presionada para hablar con el asistente.',
      'Widget para tu pantalla de inicio con la mascota, tu racha y lo próximo que vence: Ajustes → Widget en tu pantalla de inicio.',
      'El asistente ya no dice «Respuesta» antes de contestar.',
    ],
  },
  {
    version: 12,
    date: '2026-10-01',
    title: 'Mascota nueva y una IA que aprende sola',
    items: [
      'Conoce a la mascota de Rumbo: te saluda en Inicio, cambia de cara según cómo vas y te muestra tu racha 🔥.',
      'El asistente ahora decide solo qué datos tuyos vale la pena recordar y ordena su memoria por temas.',
      'Voz todavía más fluida: las frases se encadenan sin silencios y se usa la voz más natural de tu teléfono.',
    ],
  },
  {
    version: 11,
    date: '2026-10-01',
    title: 'Voz más fluida',
    items: [
      'El asistente ya no lee en voz alta los signos («punto», «coma», «guion»…).',
      'Habla en frases completas y con menos pausas, como una conversación normal.',
    ],
  },
  {
    version: 10,
    date: '2026-10-01',
    title: 'Asistente que no se cansa',
    items: [
      'Cada motor de IA ahora tiene varios modelos de respaldo: si uno se satura, Rumbo salta al siguiente en el acto.',
      'Si un modelo responde vacío o se tarda, se prueba otro sin que lo notes.',
      'En la llamada de voz se envía menos historial: respuestas más rápidas.',
      'Nuevos motores gratis opcionales: Cerebras y OpenRouter (Ajustes → Motores de IA).',
    ],
  },
  {
    version: 9,
    date: '2026-10-01',
    title: 'La IA elige sola el mejor modelo',
    items: [
      'Rumbo ahora pregunta a Groq, NVIDIA y Gemini qué modelos tienen disponibles y usa el mejor automáticamente.',
      'Si algún proveedor retira un modelo, Rumbo busca otro al instante: el asistente ya no se queda sin responder.',
      'En Ajustes → Motores de IA, «Probar motores» te muestra qué modelo está usando cada uno.',
    ],
  },
  {
    version: 8,
    date: '2026-10-01',
    title: 'IA que no se acaba y llamada sin pitidos',
    items: [
      'Rumbo ahora usa varios motores de IA gratis en cadena (Groq, NVIDIA, Gemini y Cloudflare): si uno se agota, sigue el otro.',
      'En la llamada de voz el micrófono queda abierto en silencio: ya no suena el «bip» del teléfono.',
      'Si pasan 10 segundos sin que hables, la llamada se pone en pausa sola.',
    ],
  },
  {
    version: 7,
    date: '2026-10-01',
    title: 'Inicio más práctico y pantalla más limpia',
    items: [
      'Accesos rápidos en Inicio: hablar con Rumbo, nueva tarea, tu semana y sincronizar.',
      'Cuenta regresiva en vivo de tu próxima entrega.',
      'Jala hacia abajo en Inicio y Avisos para traer lo nuevo del EVA.',
      'La barra de abajo se esconde al bajar y vuelve al subir.',
      'En Notas, cada asignatura muestra sus próximas entregas.',
    ],
  },
  {
    version: 6,
    date: '2026-10-01',
    title: 'Habla con Rumbo como en una llamada',
    items: [
      'Toca el micrófono: Rumbo te escucha, sabe cuándo te callas y te responde en voz alta, sin tocar nada más.',
      'Ves tus palabras mientras hablas y la respuesta empieza a sonar desde la primera frase.',
      'Voz más natural: la del teléfono por defecto (gratis e ilimitada) y horas leídas como se dicen.',
      'Toca la esfera para interrumpirlo; el botón rojo termina la llamada.',
    ],
  },
  {
    version: 5,
    date: '2026-10-01',
    title: 'Rumbo ahora te habla, recuerda todo y responde al instante',
    items: [
      'La respuesta va apareciendo mientras se escribe: ya no esperas a que termine.',
      'Rumbo te contesta con voz de pana joven 🔊 (elige la voz con el engrane del Asistente).',
      'Notas de voz nuevas: pantalla de grabación, puedes volver a escuchar tu audio y ver lo que entendió.',
      'Memoria permanente: recuerda lo importante que le cuentes («acuérdate de que…») y puedes verla o editarla.',
    ],
  },
  {
    version: 4,
    date: '2026-10-01',
    title: 'Asistente con IA que hace cosas y entiende notas de voz',
    items: [
      'Pídele cosas como le hablas a un pana: "ponme pa’ mañana en la tarde el foro de tecno", "muévemelo pal viernes", "ya hice la de lógica".',
      'Crea, mueve, completa y borra tareas; pone recordatorios; registra el pago; sincroniza el EVA y cambia ajustes.',
      'Toca el micrófono en el Asistente y mándale una nota de voz.',
      'Recuerda la conversación y responde con un formato más bonito.',
    ],
  },
  {
    version: 3,
    date: '2026-10-01',
    title: 'Nuevo inicio de sesión y ventanas más estables',
    items: [
      'Pantalla de entrada rediseñada para el teléfono.',
      'Arreglo: al tocar una tarea, foro o correo, la ventana de detalle ya no se queda en gris.',
      'Respuesta visual al tocar filas y tarjetas.',
    ],
  },
  {
    version: 2,
    date: '2026-10-01',
    title: 'Rumbo 2: calendario, enfoque, plan semanal y más',
    items: [
      'Pantalla de inicio de sesión nueva.',
      'Tus entregas en el calendario del teléfono (Google Calendar o iPhone).',
      'Instrucciones de cada tarea del EVA dentro de su ficha.',
      'Índice del trimestre y alerta de asignaturas en riesgo.',
      'Historial de trimestres: el pensum marca solo lo aprobado.',
      'Plan de estudio de la semana y modo enfoque (Pomodoro).',
      'Elige qué avisos recibir y guía para ponerle un sonido propio.',
      'Modo oscuro, pantalla de bienvenida y bot de Telegram.',
    ],
  },
  {
    version: 1,
    date: '2026-10-01',
    title: 'Asistente con IA, avisos del EVA y correo',
    items: [
      'Asistente con IA gratis que responde con tus datos reales.',
      'Avisos y novedades del EVA, correos de la UAPA reenviados y numeritos rojos.',
    ],
  },
];

/** Si hay una versión nueva que no te hemos contado, la anuncia (una sola vez). */
export async function announceRelease(env: Env): Promise<void> {
  const latest = CHANGELOG[0];
  const seen = Number(await getSetting(env, 'changelog_seen', '0'));
  if (latest.version <= seen) return;
  await setSetting(env, 'changelog_seen', String(latest.version)); // primero se marca: nunca se repite
  for (const r of CHANGELOG.filter((x) => x.version > seen).slice(0, 2)) {
    const body = r.items.map((i) => `• ${i}`).join('\n');
    const row = await env.DB.prepare(`INSERT OR IGNORE INTO announcements (user_id, source, ext_id, title, body, author, kind, created_at) VALUES (?, 'rumbo', ?, ?, ?, 'Rumbo', 'novedad', ?) RETURNING id`)
      .bind(env.UID, `v${r.version}`, `✨ ${r.title}`, body, nowSec()).first<{ id: number }>();
    if (r.version === latest.version && row) {
      await sendToMe(env, `*✨ Nuevo en Rumbo*\n${r.title}\n\n${body}`, { title: '✨ Nuevo en Rumbo', tag: 'release', url: `/#avisos/${row.id}`, pushBody: r.title, type: 'novedades' });
    }
  }
}
