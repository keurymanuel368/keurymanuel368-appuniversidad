import { describe, expect, it } from 'vitest';
import { buildPlan, parseSimulacro } from '../src/worker/examen';

describe('plan de examen', () => {
  it('no arma plan si el examen es hoy o ya pasó', () => {
    expect(buildPlan(['A'], '2026-11-12', '2026-11-12')).toEqual([]);
    expect(buildPlan(['A'], '2026-11-12', '2026-11-10')).toEqual([]);
  });

  it('reparte los temas, deja práctica el penúltimo día y repaso + simulacro el último', () => {
    const plan = buildPlan(['T1', 'T2', 'T3', 'T4'], '2026-11-12', '2026-11-19');
    expect(plan).toHaveLength(7);
    expect(plan[0].date).toBe('2026-11-12');
    expect(plan[6].date).toBe('2026-11-18');
    const estudiar = plan.flatMap((d) => d.sessions.filter((s) => s.kind === 'estudiar').map((s) => s.title));
    expect(estudiar).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(plan[5].sessions.some((s) => s.kind === 'practicar')).toBe(true);
    expect(plan[6].sessions.map((s) => s.kind)).toEqual(['repasar', 'simulacro']);
  });

  it('con un solo día de margen junta todo en la víspera', () => {
    const plan = buildPlan(['T1'], '2026-11-12', '2026-11-13');
    expect(plan).toHaveLength(1);
    expect(plan[0].sessions.map((s) => s.kind)).toEqual(['estudiar', 'repasar', 'simulacro']);
  });

  it('nunca pasa de 21 días y cada sesión tiene una clave única', () => {
    const plan = buildPlan(Array.from({ length: 30 }, (_, i) => `Tema ${i + 1}`), '2026-11-01', '2027-02-01');
    expect(plan).toHaveLength(21);
    const keys = plan.flatMap((d) => d.sessions.map((s) => s.k));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sin temas igual da un plan útil', () => {
    const plan = buildPlan([], '2026-11-12', '2026-11-16');
    expect(plan.flatMap((d) => d.sessions).some((s) => s.title.includes('temario'))).toBe(true);
  });
});

describe('simulacro', () => {
  it('lee pares P: / R:', () => {
    const r = parseSimulacro('P: ¿Qué es una tautología?\nR: Una proposición siempre verdadera.\n\n2. Pregunta 2: ¿Y una contradicción?\nRespuesta: Siempre falsa.');
    expect(r).toEqual([{ q: '¿Qué es una tautología?', a: 'Una proposición siempre verdadera.' }, { q: '¿Y una contradicción?', a: 'Siempre falsa.' }]);
  });
  it('ignora basura sin pregunta', () => {
    expect(parseSimulacro('hola\nR: suelta')).toEqual([]);
  });
});
