import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { Mascot } from './Mascot';
import { haptic, toast } from './components';
import { enablePush } from './push';

// Recorrido de bienvenida guiado por la mascota (se puede repetir desde Ajustes).
const SLIDES: { mood: string; wave?: boolean; title: string; text: string }[] = [
  { mood: 'feliz', wave: true, title: '¡Klk! Soy Rumbo', text: 'Tu pana de la uni. Tengo tus entregas, notas, pagos y avisos de la UAPA en un solo lugar, y te acompaño en cada pantalla.' },
  { mood: 'wow', title: 'Tu EVA, en automático', text: 'Reviso el EVA por ti: traigo tus tareas, lo que ya entregaste, tus notas con el comentario del facilitador y los avisos de cada asignatura.' },
  { mood: 'talk', title: 'Háblame como a un pana', text: 'El botón del centro es tu asistente. Escríbele, mándale una nota de voz o toca el micrófono para hablar conmigo como en una llamada.' },
  { mood: 'tranqui', title: 'Siempre a la vista', text: 'Pon mi widget en tu pantalla de inicio (Ajustes → Widget): te muestro tu racha, lo próximo que vence y tus recordatorios.' },
  { mood: 'love', title: 'Tócame cuando quieras', text: 'Si me tocas, te digo cómo vas o te doy ánimo. Si me dejas presionado, te llevo a hablar. Y si te estorbo, me escondo solo.' },
  { mood: 'feliz', title: 'No se te pasa nada', text: 'Activa las notificaciones y te aviso antes de cada entrega, cuando te califican, y cuando hay un pago o un evento.' },
];

export function Welcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const last = i === SLIDES.length - 1;
  const go = (n: number) => { haptic(6); track.current?.scrollTo({ left: n * track.current.clientWidth, behavior: 'smooth' }); };
  const finish = () => { try { localStorage.setItem('rumbo-welcome', '1'); } catch { /* sin almacenamiento */ } onDone(); };
  async function activate() {
    try { await enablePush(); toast('¡Listo! Notificaciones activadas'); } catch (e) { toast((e as Error).message, 'err'); }
    finish();
  }
  return createPortal(
    <div className="welcome" role="dialog" aria-label="Bienvenida">
      <button className="welcome-skip" onClick={finish}>Saltar</button>
      <div className="welcome-track" ref={track} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {SLIDES.map((s, n) => (
          <section key={n} className="welcome-slide">
            <div className="welcome-art"><span className="wa-ring" /><span className="wa-ring r2" /><Mascot mood={n === i ? s.mood : 'tranqui'} wave={n === i && !!s.wave} size={118} className="wa-mascot" /></div>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </section>
        ))}
      </div>
      <div className="welcome-dots" aria-label={`Paso ${i + 1} de ${SLIDES.length}`}>{SLIDES.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
      <div className="welcome-actions">
        {last ? (
          <>
            <button className="auth-btn" onClick={activate}><Icon name="bell" size={19} />Activar notificaciones</button>
            <button className="welcome-later" onClick={finish}>Ahora no</button>
          </>
        ) : <button className="auth-btn" onClick={() => go(i + 1)}>Siguiente<Icon name="chevron" size={20} style={{ strokeWidth: 2.4 }} /></button>}
      </div>
    </div>,
    document.body,
  );
}
