// Novedades de Rumbo. Cada vez que se publica algo nuevo, se agrega una entrada ARRIBA con un número
// de versión mayor: Rumbo lo detecta solo, te manda una notificación "✨ Nuevo en Rumbo" y lo deja en Avisos.
import type { Env } from './env';
import { blocks } from './wa';
import { getSetting, setSetting } from './db';
import { sendToMe } from './notify';
import { nowSec } from './time';

export type Release = { version: number; date: string; title: string; items: string[] };

export const CHANGELOG: Release[] = [
  {
    version: 40,
    date: '2026-10-16',
    title: '🔌 Ya puedes desconectar tu EVA',
    items: [
      'En Ajustes → Conexiones, «Desconectar mi EVA»: Rumbo deja de traer tus tareas y notas, y lo que ya está guardado no se borra. Puedes volver a conectarlo cuando quieras.',
    ],
  },
  {
    version: 39,
    date: '2026-10-16',
    title: '🔌 Conectar el EVA es mucho más fácil',
    items: [
      'Conectar el EVA ahora es una sola pantalla: tu matrícula y tu contraseña del EVA, y listo. Ya no hace falta F12 ni copiar enlaces.',
      'Si te equivocas de contraseña, te lo dice claro y te deja corregir (antes te mandaba al paso difícil). Tu contraseña no se guarda.',
      'El método del F12 sigue existiendo, pero escondido en «opción avanzada» por si el EVA no deja entrar con contraseña.',
      'Ajustes ordenado en 4 pestañas: Cuenta, Conexiones, Avisos y Avanzado. El EVA aparece primero en Conexiones, y si aún no lo conectaste, Ajustes se abre ahí.',
    ],
  },
  {
    version: 38,
    date: '2026-10-16',
    title: '🎓 Promedio final por asignatura',
    items: [
      'En Notas, «Promedio final por asignatura»: cada materia con su nota, sus créditos y si ya está completa, y el índice del trimestre. Lo puedes copiar con un toque.',
      'Las actividades que no se corrigen (la rúbrica de actitudes y valores y el espacio para enviar tareas fuera de fecha) ya no salen como pendientes ni cuentan para el promedio.',
      'Cualquier otra que no se corrija la puedes quitar: en Notas toca la actividad → «No se corrige: quitar del promedio», o en la tarea → «No se corrige: quitar». Si te equivocas, «Deshacer» o «Volver a contar».',
      'Arreglado: la nota que pones a mano ahora sí se refleja. Antes, una nota en una actividad que el EVA cuenta como 0 % cambiaba todo el cálculo de la materia.',
      'Ahora puedes poner tu nota en cualquier actividad de Notas, aunque no la hayas marcado como entregada o no tenga tarea en Rumbo.',
      'Arreglado: los foros que traen dos renglones de nota ya no dejan la materia «incompleta» para siempre, así el pensum marca la materia como aprobada al terminar el trimestre.',
    ],
  },
  {
    version: 37,
    date: '2026-10-14',
    title: 'Rumbo se usa con gestos',
    items: [
      'Mantén presionada una tarea y sale un menú: Ya la entregué, Posponer a mañana, Modo enfoque, Abrir en el EVA y Preguntarle a Rumbo. En computadora, clic derecho.',
      'Desliza una tarea a la izquierda para posponerla. Si la fecha la pone el EVA, Rumbo te la recuerda mañana a las 8:00.',
      'En Inicio, la tarjeta «Tu día» junta lo que vence hoy y lo atrasado, con un botón Empezar que abre el modo enfoque.',
      'Cuando te califican, ves cómo cambió tu índice (por ejemplo, de 84.1 a 84.4). También llega en el aviso.',
      'El buscador ahora hace cosas: escribe «nueva tarea», «sincronizar», «modo oscuro» o «resumen».',
      'Ajustes → Apariencia: elige el color de la app, el ícono de tu pantalla de inicio y si la mascota sale solo en Inicio.',
      'Resumen de tu semana tipo historia: el domingo en la noche (o tocando el calendario arriba en Inicio).',
      'Si una asignatura pasa 10 días sin nada nuevo en el EVA, Rumbo te avisa para que le eches un ojo.',
      'El Plan muestra qué tan cargado está cada día, y la pantalla de entrada tiene la brújula animada.'
    ]
  },
  {
    version: 36,
    date: '2026-10-14',
    title: 'Detalles que se notan',
    items: [
      'La ficha de cada tarea se lee bien: el título ahora es blanco sobre el fondo oscuro.',
      'Los botones de texto (Copiar para la IA, Editar tarea, Marcar todas) ya no tienen recuadro: se ven limpios, como en el iPhone.',
      'La mascota es más pequeña en el celular y se aparta mientras bajas, para no tapar lo que lees.',
      'Toca la pestaña en la que ya estás y subes al principio.',
      'La barra de abajo se ve más nítida y los títulos de arriba caben completos.',
      '¡Confeti! Al marcar una tarea como hecha sale una pequeña lluvia de colores donde tocaste (y el teléfono vibra suave).',
      'En Mi pensum, la leyenda ahora tiene sus colores: en curso, aprobada, disponible, con prerrequisito y optativa.'
    ]
  },
  {
    version: 35,
    date: '2026-10-13',
    title: 'Rumbo, versión final del diseño',
    items: [
      'Nueva pantalla de carga: la brújula de Rumbo gira y se acomoda, te saluda por tu nombre y te dice qué está preparando.',
      'Widget nuevo para Android en tres tamaños (pequeño, mediano y grande). Cambia de color según cómo va tu día, muestra tu índice en un anillo, tu semana y la cuenta regresiva en vivo.',
      'WhatsApp se apaga y se enciende con un toque en Ajustes, o escribiéndole al bot «whatsapp off».',
      'El selector de Tareas (Pendientes, Mes, Plan, Entregadas) ya no se descentra al cambiar.',
      'Detalles: la mascota habla menos tiempo y no tapa lo que lees, los accesos rápidos llenan el ancho y en Android sientes una vibración suave al tocar.'
    ]
  },
  {
    version: 34,
    date: '2026-10-13',
    title: '🎨 Rumbo más limpio',
    items: [
      'Inicio más claro: tu nombre en grande y el saludo arriba, primero lo que tienes que hacer y al final las metas y los logros.',
      'Avisos ordenados por día (Hoy, Ayer, Esta semana). Las notificaciones automáticas del EVA (mensajes de foros, entregas confirmadas, inicios de sesión) quedan juntas en «Actividad del EVA» para que no tapen lo importante.',
      'Los números ahora usan la misma letra de la app y se leen mejor.',
      'Arreglado: el simulador de nota en Notas se veía casi transparente, y los botones grandes (como «Ya la entregué») tenían el ícono desalineado.',
      'Tareas tiene un selector más cómodo: Pendientes, Mes, Plan y Entregadas.',
    ],
  },
  {
    version: 33,
    date: '2026-10-13',
    title: '✨ Rumbo más fluido',
    items: [
      'Todo se mueve con física de resorte, como en el iPhone: botones que se hunden al tocarlos y vuelven, interruptores y pestañas que se acomodan con vida.',
      'Las hojas siguen tu dedo: si las lanzas hacia abajo se cierran a la velocidad del gesto; si no, vuelven a su sitio. Al cerrarlas bajan por el mismo camino por el que subieron.',
      'La pestaña activa tiene una píldora que se desliza hasta donde tocas, y las pantallas entran desde el lado hacia el que navegas.',
      'El título grande se encoge suavemente al bajar, los avisos flotantes entran y salen animados, y las notas nuevas aparecen con un pequeño rebote.',
      'Si en tu teléfono activaste «Reducir movimiento» o «Reducir transparencia», Rumbo lo respeta.',
    ],
  },
  {
    version: 32,
    date: '2026-10-13',
    title: '💬 Foros y entregas desde Rumbo',
    items: [
      '📋 Cada tarea tiene un botón «Copiar» junto a las instrucciones: copia la asignatura, la fecha y todo lo que pide el facilitador, listo para pegarlo en cualquier IA.',
      '💬 «Ver el foro y participar»: lees el tema y los mensajes de tus compañeros, escribes tu aporte o respondes a alguien (con borrador de IA) y lo publicas en el EVA sin salir de Rumbo.',
      '📤 Entrega tus tareas desde el teléfono: elige los archivos en la ficha y súbelos al EVA.',
      '🔔 Te aviso cuando te responden en un foro, cuando el facilitador mueve una fecha y cuando publica una tarea nueva.',
      '📊 En Notas: el total oficial del EVA de cada asignatura, la gráfica de tu promedio en el tiempo y lo que te comentan los facilitadores, con un resumen de IA de qué haces bien y qué mejorar.',
      '🧾 «Récord»: tus notas listas para guardar en PDF o imprimir.',
      '🎯 Metas de la semana en Inicio: «entregar todo a tiempo», «un día antes» o «promedio de 95», y cómo vas.',
      '🗓️ Bloques de estudio en tu calendario (Ajustes → Calendario), el widget muestra tu última nota, las fichas de lo pendiente se guardan para verlas sin internet y puedes guardar la foto del comprobante de cada pago.',
    ],
  },
  {
    version: 31,
    date: '2026-10-13',
    title: '🚀 Rumbo más rápido de usar',
    items: [
      '✍️ Pon tu nota a mano: si el EVA no muestra la nota de un foro (o de cualquier entrega), ábrela y toca «Poner mi nota». Si después el EVA la publica, se usa la del EVA.',
      '⏰ Inicio te dice qué hacer ahora: la entrega más urgente arriba, con «Abrir en el EVA» y «Ya la entregué».',
      '🎉 Cuando te califican, Inicio te muestra la nota grande, el comentario y cuánto subió o bajó tu promedio.',
      '💬 Foros: la ficha dice si ya pusiste tu aporte y cuántas respuestas a compañeros llevas («Respuestas 1 de 2»). Si el foro cierra pronto y te faltan, te aviso.',
      '🤖 «Borrador del foro con IA»: lee la consigna y te prepara tu aporte e ideas para responder a compañeros.',
      '📊 Promedios con el peso real de cada actividad (cuando el EVA lo publica), también en el simulador «¿Cuánto necesito?».',
      '🔎 Buscador en toda la app: toca la lupa de arriba y busca tareas, avisos, asignaturas o facilitadores, sin preocuparte por las tildes.',
      '📅 Nueva vista «Mes» en Tareas, con un punto de color por cada entrega.',
      '📎 Los archivos que adjunta el facilitador (rúbricas, guías) se abren desde la ficha de la tarea.',
      '🗓️ El plan del domingo ahora trae cómo te fue en notas esa semana.',
      'También: barrita arriba mientras se actualiza el EVA, Notas con filtro «Sin nota» y orden por nota, tamaño de letra en Ajustes → Apariencia, y pantallas vacías con un botón para revisar el EVA.',
    ],
  },
  {
    version: 30,
    date: '2026-10-13',
    title: '📝 Notas de foros, directo del foro',
    items: [
      'Rumbo ahora entra a tus foros calificables y busca la nota ahí mismo: la puntuación de tu mensaje o la respuesta del facilitador («Calificación: 95»). Así ves la nota aunque el EVA no la haya pasado al libro de calificaciones.',
      'Arreglado: los foros salían «sin nota» aunque ya estaban calificados (el EVA trae dos renglones por foro y a veces se tomaba el vacío). Ahora cada foro sale una sola vez, con su nota.',
      'Los foros donde ya participaste aparecen como entregados, aunque no tengan fecha.',
      'Tocar un foro (en Tareas, en Notas o en el aviso de la nota) abre su ficha con la puntuación y el comentario, igual que las tareas.',
      'Al marcar una tarea como hecha aparece «Deshacer» por si te equivocaste.',
      'En Inicio, tocar una asignatura abre directo sus notas, y dice hace cuánto se revisó el EVA. Si lleva rato sin revisarse, se pone al día solo al abrir la app.',
      'Arreglados los acentos rotos en algunos nombres del EVA («Tecnología»).',
    ],
  },
  {
    version: 29,
    date: '2026-10-03',
    title: 'Ficha de tarea más directa',
    items: [
      'Al abrir una tarea, lo primero es «Ya la entregué» y «Abrir en el EVA». Estudiar con IA y el modo enfoque quedan justo debajo, con una línea que explica cada uno.',
      'La ficha dice cuándo venció la tarea y ya no muestra «Calificación —» en lo que todavía no has entregado.',
      'Quien entra por primera vez ve una bienvenida con los pasos para dejar Rumbo listo, en vez de un Inicio vacío.',
    ],
  },
  {
    version: 28,
    date: '2026-10-03',
    title: 'Pantallas más claras',
    items: [
      'Inicio más corto y sin repetir: ya no sale dos veces lo que vence hoy, y si tienes entregas vencidas te lo dice primero.',
      'El pago ahora dice lo que importa: «2 días para pagar la cuota».',
      'Las tareas vencidas dicen cuándo vencieron («Venció ayer», «hace 3 días») y puedes marcarlas todas de una vez si ya las entregaste.',
      'En Avisos, las novedades de Rumbo ya no tapan los avisos de la UAPA, y los avisos del EVA sin título muestran su primera línea.',
      'En Pagos, la configuración se pliega cuando ya está lista.',
      'Las notas de «Últimas calificaciones» quedan alineadas.',
    ],
  },
  {
    version: 27,
    date: '2026-10-03',
    title: 'Se siente más como una app',
    items: [
      'Los botones responden al instante al tocarlos y ya no se quedan "marcados" después de tocarlos.',
      'Dejar presionado un botón ya no abre el menú de copiar.',
      'En Android, el teclado ya no tapa el cuadro del asistente.',
      'La barra de arriba del teléfono combina con el modo claro y el oscuro.',
    ],
  },
  {
    version: 26,
    date: '2026-10-02',
    title: 'WhatsApp con mejor formato',
    items: [
      'Todos los avisos por WhatsApp tienen ahora el mismo estilo: título con emoji y negrita, datos en líneas cortas y fáciles de leer.',
      'Cada aviso trae al final un enlace que abre justo esa tarea, nota o pantalla en Rumbo.',
      'El resumen del día viene por secciones: lo de hoy, lo atrasado, lo que viene, el pago y tu promedio.',
      'Los recordatorios dicen cuánto falta, las notas muestran el comentario del facilitador como cita y los montos salen como RD$ 6,500.',
      'Las asignaturas salen con su nombre, no con el código del EVA.',
    ],
  },
  {
    version: 25,
    date: '2026-10-02',
    title: '🗓️ Tu plan de la semana por WhatsApp',
    items: [
      'Cada domingo a las 6 p. m. te llega por WhatsApp (y al teléfono) tu semana organizada: lo que vence cada día, el día más cargado, lo atrasado primero y en qué orden hacerlo.',
      'También te avisa si esa semana abre o cierra la ventana de pago.',
      'En Ajustes → Plan de la semana puedes ver cómo llega, mandártelo ahora y cambiar la hora del domingo.',
    ],
  },
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
      await sendToMe(env, blocks('✨ *Nuevo en Rumbo*', `*${r.title}*`, body), { title: '✨ Nuevo en Rumbo', tag: 'release', url: `/#avisos/${row.id}`, pushBody: r.title, type: 'novedades' });
    }
  }
}
