// La mascota de Rumbo: un estudiante redondito con birrete y una brújula en la barriga.
// Su cara cambia según cómo vas (feliz, tranqui, atento, alerta) y reacciona cuando la tocas.
import { useId } from 'react';

export type MascotFace = 'feliz' | 'tranqui' | 'atento' | 'alerta' | 'love' | 'dizzy' | 'wink' | 'talk' | 'sleep' | 'wow';

const INK = '#0A1A38';

function Eyes({ face }: { face: MascotFace }) {
  const L = 45, R = 75, Y = 70;
  if (face === 'love') {
    const heart = (x: number) => `M${x},${Y + 6} C${x - 12},${Y - 2} ${x - 7},${Y - 12} ${x},${Y - 5} C${x + 7},${Y - 12} ${x + 12},${Y - 2} ${x},${Y + 6} Z`;
    return <g className="m-eyes"><path d={heart(L)} fill="#FF4D7A" /><path d={heart(R)} fill="#FF4D7A" /></g>;
  }
  if (face === 'dizzy') {
    const spiral = (x: number) => `M${x},${Y} m-1,0 a2,2 0 1,1 3,1 a4,4 0 1,1 -6,-3 a6.5,6.5 0 1,1 10,6`;
    return <g className="m-eyes m-spin">
      <ellipse cx={L} cy={Y} rx="11" ry="13" fill="#fff" /><ellipse cx={R} cy={Y} rx="11" ry="13" fill="#fff" />
      <path d={spiral(L)} stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" /><path d={spiral(R)} stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>;
  }
  if (face === 'sleep') {
    return <g className="m-eyes"><path d={`M${L - 8},${Y + 1} Q${L},${Y + 7} ${L + 8},${Y + 1}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={`M${R - 8},${Y + 1} Q${R},${Y + 7} ${R + 8},${Y + 1}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" /></g>;
  }
  // Ojos grandes con brillo; hacia dónde mira depende del ánimo.
  const look = face === 'atento' ? [2, -2] : face === 'alerta' ? [0, -1] : face === 'wow' ? [0, 0] : [1, 1];
  const pr = face === 'alerta' || face === 'wow' ? 5 : 6.5;
  const eye = (x: number, closed: boolean) => closed
    ? <path key={x} d={`M${x - 9},${Y + 2} Q${x},${Y - 6} ${x + 9},${Y + 2}`} stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
    : <g key={x}>
        <ellipse cx={x} cy={Y} rx="11" ry="13" fill="#fff" />
        <circle cx={x + look[0]} cy={Y + look[1]} r={pr} fill={INK} />
        <circle cx={x + look[0] - 2.2} cy={Y + look[1] - 2.8} r="2.3" fill="#fff" />
        <circle cx={x + look[0] + 2} cy={Y + look[1] + 2.4} r="1.1" fill="#fff" />
      </g>;
  return <g className="m-eyes">{eye(L, false)}{eye(R, face === 'wink')}</g>;
}

function Brows({ face }: { face: MascotFace }) {
  const p: Partial<Record<MascotFace, string>> = {
    atento: 'M35,52 Q44,47 53,51 M67,51 Q76,47 85,52',
    alerta: 'M35,50 L52,54 M68,54 L85,50',
    wow: 'M36,48 Q44,42 52,47 M68,47 Q76,42 84,48',
    dizzy: 'M36,52 Q44,49 52,53 M68,51 Q76,55 84,51',
    feliz: 'M37,53 Q44,49 51,52 M69,52 Q76,49 83,53',
  };
  return p[face] ? <path d={p[face]} stroke="#0D2259" strokeWidth="3" fill="none" strokeLinecap="round" /> : null;
}

function Mouth({ face }: { face: MascotFace }) {
  switch (face) {
    case 'feliz': case 'love': case 'wink':
      return <g><path d="M48,85 Q60,101 72,85 Z" fill={INK} /><path d="M53,93 Q60,89 67,93 Q60,98 53,93 Z" fill="#FF7A93" /></g>;
    case 'tranqui':
      return <path d="M51,87 Q60,94 69,87" stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" />;
    case 'atento':
      return <path d="M51,90 Q55.5,87 60,90 Q64.5,93 69,90" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
    case 'alerta': case 'wow':
      return <ellipse cx="60" cy="91" rx="5.5" ry="6.5" fill={INK} />;
    case 'dizzy':
      return <path d="M50,91 Q53,87 56,91 Q59,95 62,91 Q65,87 68,91" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case 'talk':
      return <ellipse className="m-talk" cx="60" cy="90" rx="7" ry="5" fill={INK} />;
    case 'sleep':
      return <ellipse cx="60" cy="91" rx="3.5" ry="2.5" fill={INK} />;
  }
}

export function Mascot({ mood, size = 64, wave = false, className = '' }: { mood: string; size?: number; wave?: boolean; className?: string }) {
  const id = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const face = (mood || 'tranqui') as MascotFace;
  return (
    <svg className={`mascot m-${face} ${wave ? 'm-waving' : ''} ${className}`} width={size} height={size * 140 / 120} viewBox="0 0 120 140" aria-hidden="true">
      <defs>
        <radialGradient id={`b${id}`} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#8CC8FF" /><stop offset=".45" stopColor="#3E86F5" /><stop offset="1" stopColor="#1A4FCB" />
        </radialGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1B3A86" /><stop offset="1" stopColor="#0D2259" /></linearGradient>
      </defs>
      {/* sombra */}
      <ellipse className="m-shadow" cx="60" cy="134" rx="34" ry="5" fill="#0A1A38" opacity=".16" />
      <g className="m-body">
        {/* pies */}
        <ellipse cx="45" cy="127" rx="11" ry="6" fill="#1747AE" /><ellipse cx="75" cy="127" rx="11" ry="6" fill="#1747AE" />
        {/* brazos */}
        <ellipse cx="19" cy="90" rx="7" ry="13" fill="#2A66DD" transform="rotate(22 19 90)" />
        <g className="m-arm-r"><ellipse cx="101" cy="90" rx="7" ry="13" fill="#2A66DD" transform="rotate(-22 101 90)" /></g>
        {/* cuerpo */}
        <path d="M60,30 C89,30 105,53 105,83 C105,111 87,127 60,127 C33,127 15,111 15,83 C15,53 31,30 60,30 Z" fill={`url(#b${id})`} />
        <path d="M34,44 C40,37 50,34 56,35 C46,39 39,45 36,53 C33,52 32,47 34,44 Z" fill="#fff" opacity=".45" />
        {/* barriga con brújula */}
        <ellipse cx="60" cy="106" rx="24" ry="16" fill="#E3EFFF" opacity=".95" />
        <circle cx="60" cy="106" r="8.5" fill="#fff" stroke="#1A4FCB" strokeWidth="2" />
        <path className="m-needle" d="M60,99 L62.6,106 L57.4,106 Z" fill="#EF4444" />
        <path className="m-needle2" d="M60,113 L62.6,106 L57.4,106 Z" fill="#0D2259" />
        {/* cachetes */}
        <ellipse cx="32" cy="86" rx="6.5" ry="3.8" fill="#FF7A9A" opacity=".45" /><ellipse cx="88" cy="86" rx="6.5" ry="3.8" fill="#FF7A9A" opacity=".45" />
        <Brows face={face} />
        <Eyes face={face} />
        <Mouth face={face} />
        {/* birrete */}
        <g transform="rotate(-9 60 34)">
          <path d="M41,36 L41,45 C49,51 71,51 79,45 L79,36 L60,44 Z" fill="#13306F" />
          <path d="M27,32 L60,19 L93,32 L60,45 Z" fill={`url(#c${id})`} />
          <circle cx="60" cy="32" r="2.4" fill="#F5B82E" />
          <g className="m-tassel"><path d="M60,32 Q75,33 88,35 L88,49" stroke="#F5B82E" strokeWidth="1.8" fill="none" strokeLinecap="round" /><path d="M85,48 L91,48 L90,56 L86,56 Z" fill="#F5B82E" /></g>
        </g>
        {/* extras según el ánimo */}
        {face === 'alerta' && <path className="m-sweat" d="M100,48 C104,55 105,59 102,62 C99,64 95,62 96,58 C96,55 98,52 100,48 Z" fill="#9BD4FF" />}
        {(face === 'feliz' || face === 'love') && <g className="m-sparks" fill="#F5B82E"><path d="M106,40 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 Z" /><path d="M12,52 l1.4,3.4 3.4,1.4 -3.4,1.4 -1.4,3.4 -1.4,-3.4 -3.4,-1.4 3.4,-1.4 Z" /></g>}
        {face === 'sleep' && <g className="m-zzz" fill="#1A4FCB" fontFamily="Sora, sans-serif" fontWeight="800"><text x="94" y="30" fontSize="14">z</text><text x="104" y="18" fontSize="10">z</text></g>}
        {face === 'wow' && <g stroke="#F5B82E" strokeWidth="3" strokeLinecap="round"><path d="M104,30 l6,-6 M108,44 l8,-1 M96,22 l2,-8" /></g>}
      </g>
    </svg>
  );
}
