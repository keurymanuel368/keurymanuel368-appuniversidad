// Logros en Inicio: medallas ganadas, progreso de las que faltan y celebración con la mascota al ganar una.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Modal, haptic } from './components';
import { Icon } from './icons';
import { Mascot } from './Mascot';

type Achievement = { id: string; icon: string; title: string; desc: string; goal: number; value: number; unlocked: boolean };
const SEEN = 'rumbo-logros-vistos';

export function AchievementsCard() {
  const [list, setList] = useState<Achievement[] | null>(null);
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState<Achievement | null>(null);

  useEffect(() => {
    api<Achievement[]>('/achievements').then((l) => {
      setList(l);
      // ¿Ganaste algo desde la última vez? (la primera vez solo se anota, sin fiesta)
      let seen: string[] | null = null;
      try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch { /* nada */ }
      const won = l.filter((a) => a.unlocked).map((a) => a.id);
      if (seen) { const fresh = l.find((a) => a.unlocked && !seen!.includes(a.id)); if (fresh) setTimeout(() => setParty(fresh), 900); }
      try { localStorage.setItem(SEEN, JSON.stringify(won)); } catch { /* sin almacenamiento */ }
    }).catch(() => setList([]));
  }, []);

  if (!list || !list.length) return null;
  const won = list.filter((a) => a.unlocked);
  // Lo próximo por ganar: el que tiene más avance
  const next = list.filter((a) => !a.unlocked).sort((a, b) => b.value / b.goal - a.value / a.goal)[0];

  return (
    <>
      <button className="card ach-card" onClick={() => { haptic(6); setOpen(true); }} aria-label={`Logros: ${won.length} de ${list.length}. Ver todos`}>
        <div className="card-head"><h3>Tus logros</h3><span className="pill blue spacer num">{won.length}/{list.length}</span></div>
        <div className="ach-row" aria-hidden="true">
          {list.slice(0, 8).map((a) => <span key={a.id} className={`ach-medal ${a.unlocked ? 'on' : ''}`}>{a.icon}</span>)}
        </div>
        {next && (
          <div className="ach-next">
            <span>Próximo: <b>{next.icon} {next.title}</b> · {next.desc}</span>
            <div className="ach-bar"><div style={{ width: `${(next.value / next.goal) * 100}%` }} /></div>
            <small className="num">{next.value} de {next.goal}</small>
          </div>
        )}
      </button>
      {open && (
        <Modal title="Tus logros" onClose={() => setOpen(false)}>
          <p className="small muted">Se ganan solos con lo que haces en la uni. Una vez ganados, se quedan para siempre.</p>
          <div className="ach-grid" role="list">
            {list.map((a) => (
              <div key={a.id} role="listitem" className={`ach-item ${a.unlocked ? 'on' : ''}`} aria-label={`${a.title}: ${a.desc}. ${a.unlocked ? 'Ganado' : `${a.value} de ${a.goal}`}`}>
                <span className="ach-big" aria-hidden="true">{a.icon}</span>
                <b>{a.title}</b>
                <small>{a.desc}</small>
                {a.unlocked ? <span className="ach-ok"><Icon name="check" size={12} style={{ strokeWidth: 3 }} />Ganado</span>
                  : <div className="ach-bar sm" aria-hidden="true"><div style={{ width: `${(a.value / a.goal) * 100}%` }} /></div>}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {party && <Celebration a={party} onClose={() => setParty(null)} />}
    </>
  );
}

/** Pantalla de celebración: confeti + mascota feliz. */
function Celebration({ a, onClose }: { a: Achievement; onClose: () => void }) {
  useEffect(() => { haptic(30); const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return createPortal(
    <div className="party" role="alertdialog" aria-label={`Logro desbloqueado: ${a.title}`} onClick={onClose}>
      <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${(i % 7) * 0.12}s`, ['--c' as string]: ['#F5B82E', '#4C9BFF', '#34C77B', '#FF6B8A', '#A78BFA'][i % 5] }} />)}</div>
      <div className="party-card">
        <Mascot mood="love" size={110} wave />
        <small>¡LOGRO DESBLOQUEADO!</small>
        <span className="party-medal" aria-hidden="true">{a.icon}</span>
        <h2>{a.title}</h2>
        <p>{a.desc}</p>
        <button className="auth-btn" onClick={onClose}>¡Dale! 🎉</button>
      </div>
    </div>,
    document.body,
  );
}
