import { describe, expect, it } from 'vitest';
import { nextReview } from '../src/worker/kit';

describe('nextReview', () => {
  const base = { ease: 2.5, interval_days: 0, reps: 0 };
  it('"otra vez" vuelve a verse en minutos y baja la facilidad', () => {
    const n = nextReview({ ...base, reps: 3, interval_days: 10 }, 0);
    expect(n.due_in).toBe(600); expect(n.reps).toBe(0); expect(n.ease).toBeCloseTo(2.3);
  });
  it('la primera vez que sale bien se repite al día siguiente', () => { expect(nextReview(base, 2).interval_days).toBe(1); });
  it('los intervalos crecen con cada acierto', () => {
    const a = nextReview(base, 2); const b = nextReview({ ease: a.ease, interval_days: a.interval_days, reps: a.reps }, 2); const c = nextReview({ ease: b.ease, interval_days: b.interval_days, reps: b.reps }, 2);
    expect(b.interval_days).toBeGreaterThan(a.interval_days); expect(c.interval_days).toBeGreaterThan(b.interval_days);
  });
  it('la facilidad nunca baja de 1.3', () => { let c = { ease: 1.4, interval_days: 1, reps: 1 }; for (let i = 0; i < 5; i++) c = nextReview(c, 0); expect(c.ease).toBe(1.3); });
});
