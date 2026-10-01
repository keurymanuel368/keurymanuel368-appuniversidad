import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { haptic, toast } from './components';
import { enablePush } from './push';

const SLIDES = [
  { icon: 'compass', title: 'Bienvenido a Rumbo', text: 'Tu universidad bajo control: entregas, notas, pagos y avisos de la UAPA en un solo lugar.' },
  { icon: 'sync', title: 'Tu EVA, en automático', text: 'Rumbo revisa el EVA por ti: trae tus tareas, lo que ya entregaste, tus notas y los avisos de cada asignatura.' },
  { icon: 'spark', title: 'Pregúntale lo que quieras', text: 'El botón del centro es tu asistente con IA. Escríbele o háblale: "¿cómo voy en Razonamiento?", "¿qué entrego primero?".' },
  { icon: 'bell', title: 'No se te pasa nada', text: 'Activa las notificaciones y Rumbo te avisa antes de cada entrega, cuando sale una nota y cuando hay un pago o un evento.' },
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
            <div className="welcome-art"><span className="wa-ring" /><span className="wa-ring r2" /><div className="wa-icon"><Icon name={s.icon} size={44} style={{ strokeWidth: 1.8 }} /></div></div>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </section>
        ))}
      </div>
      <div className="welcome-dots">{SLIDES.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
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
