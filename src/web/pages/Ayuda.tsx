// Ayuda: preguntas frecuentes, cómo reconectar cada cosa y la versión de Rumbo.
import { useState } from 'react';
import { PageHead, haptic } from '../components';
import { Icon } from '../icons';
import { Mascot } from '../Mascot';
import { APP_VERSION } from '../updater';

const FAQ: { tema: string; items: { q: string; a: string; go?: [string, string] }[] }[] = [
  {
    tema: 'EVA y tareas',
    items: [
      { q: '¿Cada cuánto se actualizan mis tareas y notas?', a: 'Rumbo revisa el EVA solo cada 2 horas (puedes cambiarlo en Ajustes → «Sincronizar el EVA cada»). Si quieres verlo ya, toca Sincronizar en Inicio o desliza hacia abajo en Tareas.', go: ['ajustes', 'Ir a Ajustes'] },
      { q: 'Me llegó «El EVA dejó de conectar»', a: 'El token del EVA venció. No es tu contraseña: hay que generar un token nuevo desde la computadora con tu asistente de código (Claude) y guardarlo con «npx wrangler secret put MOODLE_TOKEN». Tus datos no se pierden.' },
      { q: 'Una tarea que ya entregué sale pendiente', a: 'El EVA a veces tarda en marcarla. Desliza la tarea a la derecha para marcarla como hecha, o espera la próxima sincronización.' },
      { q: '¿Cómo me entero cuando me califican?', a: 'Te llega una notificación con la nota y el comentario del facilitador. También queda en Avisos y en la ficha de la tarea.' },
    ],
  },
  {
    tema: 'Notificaciones',
    items: [
      { q: 'No me llegan las notificaciones', a: '1) En Ajustes revisa que estén activadas. 2) En Android: Ajustes del teléfono → Apps → Chrome (o Rumbo) → Notificaciones → permitidas. 3) Quita el ahorro de batería para Chrome. 4) En Ajustes de Rumbo toca «Enviar mensaje de prueba».', go: ['ajustes', 'Ir a Ajustes'] },
      { q: '¿Puedo cambiar el sonido?', a: 'Una app web no puede elegir el sonido, pero tu teléfono sí: Ajustes del teléfono → Apps → Chrome → Notificaciones → elige el canal de Rumbo → Sonido.' },
      { q: 'Me llegan demasiados avisos', a: 'En Ajustes → «Qué te aviso» puedes apagar cada tipo (tareas, notas, pagos, avisos, resumen, novedades), cambiar la hora del resumen y la hora de estudio.', go: ['ajustes', 'Ir a Ajustes'] },
    ],
  },
  {
    tema: 'Asistente y voz',
    items: [
      { q: 'El asistente dice que está ocupado', a: 'Usa motores de IA gratis que tienen límites por minuto. Rumbo cambia solo entre varios; si todos están llenos, espera unos segundos. En Ajustes → Motores de IA puedes agregar más claves gratis para que nunca pase.', go: ['ajustes', 'Ver motores'] },
      { q: '¿Cómo hago una llamada de voz?', a: 'En el asistente toca el micrófono. Habla normal: cuando te callas, responde y vuelve a escucharte. Si pasan 10 segundos sin hablar, se pone en pausa.' },
      { q: '¿Qué recuerda la IA de mí?', a: 'Lo que tú le cuentas que vale la pena (horario, metas, preferencias). Puedes verlo y editarlo en el asistente → ícono del libro.', go: ['asistente', 'Abrir asistente'] },
      { q: '¿Cómo uso el modo estudio?', a: 'Abre cualquier tarea pendiente y toca «Estudiar con IA»: te arma un plan paso a paso, tarjetas para practicar y una explicación del tema que puedes escuchar.' },
    ],
  },
  {
    tema: 'Widget y app',
    items: [
      { q: '¿Cómo pongo el widget?', a: 'Ajustes → Widget en tu pantalla de inicio → Poner. Descarga la app del widget, toca «Conectar widget» y luego «Poner widget en inicio». Hay uno grande y uno pequeño (2×2).', go: ['ajustes', 'Ir a Ajustes'] },
      { q: 'El widget no se actualiza', a: 'Toca ↻ en el widget. Se actualiza solo cada 15 minutos con internet. Si tu teléfono tiene ahorro de batería fuerte, quítalo para «Rumbo» (la app del widget).' },
      { q: '¿La app se actualiza sola?', a: 'Sí. Cuando hay versión nueva, Rumbo recarga en un momento tranquilo y te avisa «Rumbo se actualizó». El widget te muestra «Nueva versión» y se instala con un toque.' },
      { q: '¿Funciona sin internet?', a: 'Sí: ves lo último guardado de tus tareas, notas, avisos y pagos. Lo nuevo llega cuando vuelve la señal.' },
      { q: 'La mascota me estorba', a: 'Se esconde sola en el borde y cuando bajas la pantalla. Si prefieres no verla, apágala en Ajustes → Mascota en todas las pantallas.', go: ['ajustes', 'Ir a Ajustes'] },
    ],
  },
  {
    tema: 'Seguridad y datos',
    items: [
      { q: 'Me llegó «Nuevo inicio de sesión» y no fui yo', a: 'Ve a Ajustes → «Cerrar sesión en todos los dispositivos». Después de 5 intentos fallidos, Rumbo bloquea la entrada por 15 minutos.', go: ['ajustes', 'Ir a Ajustes'] },
      { q: '¿Se pueden perder mis datos?', a: 'Rumbo hace una copia de seguridad cada semana (Ajustes → Copias de seguridad, también descargable) y el código se guarda en GitHub privado cada vez que se actualiza.', go: ['ajustes', 'Ver copias'] },
      { q: '¿Cuánto cuesta?', a: 'Nada. Todo funciona con planes gratis (Cloudflare, Groq, NVIDIA…). No hay tarjetas ni suscripciones.' },
    ],
  },
];

export function Ayuda({ go }: { go: (p: string) => void }) {
  const [q, setQ] = useState('');
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const groups = FAQ.map((g) => ({ ...g, items: g.items.filter((i) => !q.trim() || fold(i.q + ' ' + i.a).includes(fold(q.trim()))) })).filter((g) => g.items.length);
  return (
    <>
      <PageHead eyebrow="Preguntas frecuentes" title="Ayuda" />
      <div className="help-hero card">
        <Mascot mood="feliz" size={64} />
        <div><b>¿En qué te ayudo?</b><span>Busca tu duda aquí o pregúntale directo al asistente: él conoce tu Rumbo.</span></div>
        <button className="btn primary sm" onClick={() => go('asistente')}><Icon name="spark" size={16} />Preguntar</button>
      </div>
      <div className="search help-search">
        <Icon name="tasks" size={18} className="ic" />
        <input className="input" type="search" aria-label="Buscar en la ayuda" placeholder="Buscar: widget, notificaciones, EVA…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.length === 0 && <p className="muted center">No encontré nada con «{q}». Pregúntale al asistente 😉</p>}
      {groups.map((g) => (
        <div className="section" key={g.tema}>
          <div className="section-head"><h3>{g.tema}</h3></div>
          <div className="card faq">
            {g.items.map((i) => (
              <details key={i.q} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) haptic(4); }}>
                <summary><span>{i.q}</span><Icon name="chevron" size={18} className="faq-ic" /></summary>
                <p>{i.a}</p>
                {i.go && <button className="link-btn" onClick={() => go(i.go![0])}>{i.go[1]}<Icon name="chevron" size={15} /></button>}
              </details>
            ))}
          </div>
        </div>
      ))}
      <p className="about">Rumbo <b>1.0</b> · versión {APP_VERSION} · hecho para la UAPA con 💙</p>
    </>
  );
}
