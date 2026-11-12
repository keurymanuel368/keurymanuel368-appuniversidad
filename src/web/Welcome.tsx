import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { Mascot } from './Mascot';
import { haptic, toast } from './components';
import { enablePush } from './push';

// Recorrido de bienvenida guiado por la mascota (se puede repetir desde Ajustes).
const SLIDES: { mood: string; wave?: boolean; icon: string; kicker: string; title: string; text: string }[] = [
  { mood: 'feliz', wave: true, icon: 'compass', kicker: 'Bienvenido', title: '¡Klk! Soy Rumbo', text: 'Tu pana de la uni. Tengo tus entregas, notas, pagos y avisos de la UAPA en un solo lugar, y te acompaño en cada pantalla.' },
  { mood: 'wow', icon: 'sync', kicker: 'En automático', title: 'Tu EVA, sin que lo abras', text: 'Reviso el EVA por ti: traigo tus tareas, lo que ya entregaste, tus notas con el comentario del facilitador y los avisos de cada asignatura.' },
  { mood: 'talk', icon: 'spark', kicker: 'Rumbo IA', title: 'La brújula del centro soy yo', text: 'Tócala y hablamos: escríbeme, mándame una nota de voz o habla conmigo como en una llamada. Hago tareas, resumo clases y respondo con tus cuadernos.' },
  { mood: 'tranqui', icon: 'calendar', kicker: 'Tu día', title: 'Todo lo que toca, de un vistazo', text: 'En Inicio ves lo atrasado, lo de hoy y tu agenda. En Tareas, Notas, Horario y Estudio tienes cada cosa en su lugar, sin perderte.' },
  { mood: 'love', icon: 'grid', kicker: 'Widget', title: 'Siempre a la vista', text: 'Pon mi widget en la pantalla de inicio del teléfono (Ajustes → Widget): te muestro lo próximo que vence, tu clase siguiente y tu racha.' },
  { mood: 'feliz', icon: 'bell', kicker: 'Último paso', title: 'No se te pasa nada', text: 'Activa las notificaciones y te aviso antes de cada entrega, cuando te califican, y cuando hay un pago o un evento.' },
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
            <div className="welcome-art"><span className="wl-bezel" aria-hidden="true" /><span className="wa-ring" /><span className="wa-ring r2" /><Mascot mood={n === i ? s.mood : 'tranqui'} wave={n === i && !!s.wave} size={118} className="wa-mascot" /></div>
            <span className="wl-kicker"><Icon name={s.icon} size={15} />{s.kicker}</span>
            <h2>{s.title}</h2>
            <p className="wl-panel">{s.text}</p>
          </section>
        ))}
      </div>
      <div className="welcome-dots" aria-label={`Paso ${i + 1} de ${SLIDES.length}`}>{SLIDES.map((_, n) => <i key={n} className={n === i ? 'on' : n < i ? 'past' : ''} />)}</div>
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
