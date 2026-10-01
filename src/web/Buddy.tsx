// La mascota que te acompaña en todas las pantallas.
// - Al cambiar de pantalla cae desde arriba, rebota y te dice algo de esa sección.
// - Tócala: reacciona (salta, guiña, se enamora…) y te dice cómo vas o un consejo. Si la tocas mucho, se marea.
// - Mantenla presionada: te lleva al asistente.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { haptic } from './components';
import { Mascot, type MascotFace } from './Mascot';

type MascotInfo = { mood: string; headline: string; sub: string; streak: number; pending: number; today: number; overdue: number };

const LANDING: Record<string, string[]> = {
  inicio: ['¡Klk! Este es tu día 👋', '¡Llegué! Mira cómo vas hoy', 'Aquí tienes todo de un vistazo'],
  tareas: ['Vamos a ver qué hay pendiente 📚', 'Una por una y las sacamos todas', '¿Cuál hacemos primero?'],
  asignaturas: ['Tus notas, mano 📈', '¡A ver esas calificaciones!', 'Cada punto cuenta'],
  pensum: ['Mira todo lo que has avanzado 🎓', 'Paso a paso hacia el título', '¡Ya falta menos!'],
  pagos: ['Ojo con la ventana de pago 💸', 'Que no se te pase la cuota', 'Aquí llevamos las cuentas claras'],
  avisos: ['Esto es lo nuevo 📣', 'Te traje las novedades', 'Revisa por si acaso'],
  ajustes: ['Aquí lo configuras todo ⚙️', 'Ponme a tu gusto', 'Ajustes, a tu manera'],
  ayuda: ['¿Te trabaste? Aquí te ayudo 🙋', 'Busca tu duda o pregúntame', 'Para eso estoy, mano'],
};
const CHEER = [
  '¡Tú puedes con todo! 💪', 'Un chin cada día y llegas lejos', 'Toma agüita y sigue 💧', 'Ese título viene, tranquilo 🎓',
  'Si te trabas, pregúntame en el asistente', 'Descansa un ratico, también cuenta', '¡Qué orgullo verte aquí! ✨', 'Hoy es buen día para adelantar',
];
const REACT: MascotFace[] = ['love', 'wink', 'wow', 'feliz'];

const enabled = () => { try { return localStorage.getItem('rumbo-mascota') !== '0'; } catch { return true; } };

export function Buddy({ page, go }: { page: string; go: (p: string) => void }) {
  const [info, setInfo] = useState<MascotInfo | null>(null);
  const [on, setOn] = useState(enabled);
  const [face, setFace] = useState<MascotFace | null>(null);
  const [say, setSay] = useState('');
  const [anim, setAnim] = useState('drop');
  const [dropKey, setDropKey] = useState(0);
  // Para no estorbar: después de saludar se asoma desde el borde (peek) y al bajar la pantalla se esconde (away).
  const [peek, setPeek] = useState(false);
  const [away, setAway] = useState(false);
  const taps = useRef<number[]>([]);
  const timers = useRef<number[]>([]);
  const press = useRef<number | null>(null);
  const tipIdx = useRef(Math.floor(Math.random() * CHEER.length));

  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const speak = (text: string, ms = 2800) => { setSay(text); later(ms, () => setSay('')); };

  // Ánimo según tus tareas (se refresca cuando algo cambia).
  useEffect(() => {
    const load = () => api<MascotInfo>('/mascot').then(setInfo).catch(() => {});
    load();
    window.addEventListener('rumbo:badges', load);
    const onToggle = () => setOn(enabled());
    window.addEventListener('rumbo:mascota', onToggle);
    return () => { window.removeEventListener('rumbo:badges', load); window.removeEventListener('rumbo:mascota', onToggle); };
  }, []);

  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY, dy = y - last;
      if (Math.abs(dy) < 10) return;
      setAway(dy > 0 && y > 80);
      if (dy > 0) setSay('');
      last = y;
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // Cada cambio de pantalla: cae desde arriba, saluda y se va a su esquinita.
  useEffect(() => {
    clear();
    setFace('wow'); setSay(''); setAnim('drop'); setDropKey((k) => k + 1); setPeek(false); setAway(false);
    later(620, () => { haptic(6); setFace(null); });
    const lines = LANDING[page];
    if (lines) later(700, () => speak(lines[Math.floor(Math.random() * lines.length)], 2000));
    later(2900, () => { setAnim(''); setPeek(true); });
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!on || page === 'asistente') return null;
  const mood = (face || info?.mood || 'tranqui') as MascotFace;

  function tap() {
    if (peek) { setPeek(false); haptic(8); }
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1600), now];
    clear(); haptic(10);
    if (taps.current.length >= 5) {
      taps.current = [];
      setFace('dizzy'); setAnim('spin'); speak('¡Ay, me mareaste, mano! 😵‍💫', 2600);
      later(2600, () => { setFace(null); setAnim(''); });
      later(4200, () => setPeek(true));
      return;
    }
    const r = REACT[Math.floor(Math.random() * REACT.length)];
    setFace(r); setAnim(''); requestAnimationFrame(() => setAnim('hop'));
    // Primero cómo vas (si hay algo urgente), luego ánimos y consejos.
    const status = info && (info.overdue || info.today) ? `${info.headline}. ${info.sub}` : info && taps.current.length === 1 && Math.random() < 0.5 ? info.sub : '';
    speak(status || CHEER[tipIdx.current++ % CHEER.length]);
    later(1400, () => { setFace(null); setAnim(''); });
    later(4200, () => setPeek(true));
  }
  const down = () => { press.current = window.setTimeout(() => { press.current = null; haptic(20); setFace('talk'); speak('¡Vamos a hablar! 🎙️', 1200); later(500, () => go('asistente')); }, 650); };
  const up = (fire: boolean) => { if (press.current) { clearTimeout(press.current); press.current = null; if (fire) tap(); } };

  return (
    <div className={`buddy ${anim} ${peek && !say ? 'peek' : ''} ${away ? 'away' : ''}`} key={dropKey}>
      {say && <div className="buddy-say" aria-hidden="true">{say}</div>}
      <div className="buddy-peek">
      <button
        className="buddy-btn"
        aria-label="Mascota de Rumbo: tócala o mantenla presionada para hablar"
        onPointerDown={down}
        onPointerUp={() => up(true)}
        onPointerLeave={() => up(false)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0) tap(); /* Enter o espacio con teclado */ }}
      >
        <Mascot mood={mood} size={56} wave={anim === 'drop' || mood === 'feliz'} />
        {!!info?.streak && <span className="buddy-streak num">🔥{info.streak}</span>}
      </button>
      </div>
    </div>
  );
}
