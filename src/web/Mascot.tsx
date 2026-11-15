// La mascota de Rumbo («Rumbi»): una brújula con vida. Su cara es la esfera del reloj, lleva birrete de estudiante
// y una pequeña aguja naranja que siempre señala hacia adelante.
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
      <ellipse cx={L} cy={Y} rx="11" ry="13" fill="#fff" stroke={INK} strokeOpacity=".25" strokeWidth="1.5" /><ellipse cx={R} cy={Y} rx="11" ry="13" fill="#fff" stroke={INK} strokeOpacity=".25" strokeWidth="1.5" />
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
    ? <path key={x} d={`M${x - 8},${Y + 2} Q${x},${Y - 6} ${x + 8},${Y + 2}`} stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
    : <g key={x}>
        <ellipse cx={x + look[0] * .6} cy={Y + look[1] * .6} rx={pr + 2.2} ry={pr + 4.2} fill={INK} />
        <ellipse cx={x + look[0] * .6} cy={Y + look[1] * .6 + 3} rx={pr} ry={pr * .8} fill="#2F6BFF" opacity=".55" />
        <circle cx={x + look[0] * .6 - 2.6} cy={Y + look[1] * .6 - 3.8} r="3" fill="#fff" />
        <circle cx={x + look[0] * .6 + 2.6} cy={Y + look[1] * .6 + 2.8} r="1.5" fill="#fff" />
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
  return p[face] ? <path d={p[face]} transform="translate(60 57) scale(.86) translate(-60 -52)" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" /> : null;
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
        <radialGradient id={`b${id}`} cx="34%" cy="24%" r="92%">
          <stop offset="0" stopColor="#9CCBFF" /><stop offset=".32" stopColor="#4C8DFF" /><stop offset=".7" stopColor="#2347D8" /><stop offset="1" stopColor="#15208F" />
        </radialGradient>
        <radialGradient id={`f${id}`} cx="40%" cy="28%" r="85%">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset=".6" stopColor="#EEF5FF" /><stop offset="1" stopColor="#CFE0FB" />
        </radialGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#24408F" /><stop offset="1" stopColor="#0B1B52" /></linearGradient>
        <linearGradient id={`o${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB04A" /><stop offset="1" stopColor="#F26A1B" /></linearGradient>
        <radialGradient id={`r${id}`} cx="78%" cy="86%" r="45%"><stop offset="0" stopColor="#7FE7FF" stopOpacity=".55" /><stop offset="1" stopColor="#7FE7FF" stopOpacity="0" /></radialGradient>
      </defs>
      {/* sombra */}
      <ellipse className="m-shadow" cx="60" cy="134" rx="34" ry="5" fill="#0A1A38" opacity=".18" />
      <g className="m-body">
        {/* pies naranja */}
        <ellipse cx="44" cy="127" rx="12" ry="6.5" fill={`url(#o${id})`} /><ellipse cx="76" cy="127" rx="12" ry="6.5" fill={`url(#o${id})`} />
        <ellipse cx="41" cy="125" rx="4" ry="1.8" fill="#fff" opacity=".45" /><ellipse cx="73" cy="125" rx="4" ry="1.8" fill="#fff" opacity=".45" />
        {/* manitas */}
        <ellipse cx="12" cy="92" rx="7.5" ry="11.5" fill="#2A5FE6" transform="rotate(20 12 92)" />
        <g className="m-arm-r"><ellipse cx="108" cy="92" rx="7.5" ry="11.5" fill="#2A5FE6" transform="rotate(-20 108 92)" /><ellipse cx="110" cy="87" rx="2.4" ry="3.6" fill="#fff" opacity=".4" transform="rotate(-20 110 87)" /></g>
        {/* cuerpo-brújula */}
        <ellipse cx="60" cy="82" rx="48" ry="46" fill={`url(#b${id})`} />
        <ellipse cx="60" cy="82" rx="48" ry="46" fill={`url(#r${id})`} />
        {/* bisel con marcas de brújula */}
        <circle cx="60" cy="80" r="43.5" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.6" strokeDasharray="1.1 8.4" />
        <path d="M60,33.5 L63,38.5 L57,38.5 Z" fill={`url(#o${id})`} />
        {/* reflejo del cuerpo */}
        <path d="M24,62 C27,47 38,38 52,36 C40,42 32,52 30,66 C27,68 24,66 24,62 Z" fill="#fff" opacity=".5" />
        {/* esfera (cara) */}
        <circle cx="60" cy="81" r="37" fill="#0A1A55" opacity=".25" transform="translate(0 2)" />
        <circle cx="60" cy="80" r="37" fill={`url(#f${id})`} stroke="#fff" strokeWidth="2" />
        <path d="M33,68 C36,56 46,49 58,48 C49,53 43,60 41,70 C37,72 33,71 33,68 Z" fill="#fff" opacity=".85" />
        {/* cachetes */}
        <ellipse cx="34" cy="88" rx="6" ry="3.6" fill="#FF7A9A" opacity=".5" /><ellipse cx="86" cy="88" rx="6" ry="3.6" fill="#FF7A9A" opacity=".5" />
        <Brows face={face} />
        <Eyes face={face} />
        <Mouth face={face} />
        {/* birrete con aguja */}
        <g transform="rotate(-9 60 34)">
          <path d="M41,35 L41,45 C49,51 71,51 79,45 L79,35 L60,43 Z" fill="#0F2561" />
          <path d="M26,31 L60,17 L94,31 L60,45 Z" fill={`url(#c${id})`} />
          <path d="M34,31 L60,20.5 L66,23 L38,34 Z" fill="#fff" opacity=".18" />
          <g className="m-needle"><path d="M60,31 L63.4,22 L60,9 L56.6,22 Z" fill={`url(#o${id})`} /><path d="M60,31 L63.4,22 L60,24 L56.6,22 Z" fill="#fff" opacity=".35" /></g>
          <circle cx="60" cy="31" r="3" fill="#fff" stroke="#F26A1B" strokeWidth="1.6" />
          <g className="m-tassel"><path d="M60,31 Q76,32 90,34 L90,49" stroke="#FF9A2E" strokeWidth="1.9" fill="none" strokeLinecap="round" /><path d="M87,48 L93,48 L92,57 L88,57 Z" fill={`url(#o${id})`} /></g>
        </g>
        {/* extras según el ánimo */}
        {face === 'alerta' && <path className="m-sweat" d="M102,48 C106,55 107,59 104,62 C101,64 97,62 98,58 C98,55 100,52 102,48 Z" fill="#9BD4FF" />}
        {(face === 'feliz' || face === 'love') && <g className="m-sparks" fill="#FF9A2E"><path d="M108,38 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2 Z" /><path d="M10,50 l1.4,3.4 3.4,1.4 -3.4,1.4 -1.4,3.4 -1.4,-3.4 -3.4,-1.4 3.4,-1.4 Z" /></g>}
        {face === 'sleep' && <g className="m-zzz" fill="#1A4FCB" fontFamily="Sora, sans-serif" fontWeight="800"><text x="96" y="30" fontSize="14">z</text><text x="106" y="18" fontSize="10">z</text></g>}
        {face === 'wow' && <g stroke="#FF9A2E" strokeWidth="3" strokeLinecap="round"><path d="M106,30 l6,-6 M110,44 l8,-1 M98,22 l2,-8" /></g>}
      </g>
    </svg>
  );
}
