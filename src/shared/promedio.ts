// Cálculo del promedio de una asignatura. Lo usan el servidor (índice, avisos, pensum) y la app (Notas, simulador),
// así los dos siempre dan el mismo número.

/** Actividades que la UAPA pone en el aula pero no se corrigen: no cuentan para el promedio ni salen como pendientes. */
export const NO_CUENTA = /actitudes\s+y\s+valores|fuera\s+del?\s+(fecha|plazo)/i;
export const noCuenta = (name: string | null | undefined) => NO_CUENTA.test(name || '');

/** Lo mismo en SQL (LIKE no distingue tildes, por eso solo usa palabras sin tilde). */
export const NO_CUENTA_SQL = (col: string) =>
  `(lower(${col}) LIKE '%actitudes y valores%' OR lower(${col}) LIKE '%fuera de fecha%' OR lower(${col}) LIKE '%fuera de plazo%' OR lower(${col}) LIKE '%fuera del plazo%')`;

export type GradeLike = { grade: number | null; grade_max: number; weight?: number | null };

/**
 * Cuánto vale cada actividad.
 * - Si el EVA publica pesos (alguna actividad tiene peso > 0), se usan: una actividad con peso 0 no cuenta
 *   (así la trata el EVA) y una nota que pusiste tú en algo que el EVA no tiene vale lo que vale el promedio de las demás.
 * - Si el EVA no publica pesos, todas valen lo mismo.
 */
export function gradeWeights<T extends GradeLike>(rows: T[]): { weighted: boolean; weightOf: (r: T) => number } {
  const positive = rows.map((r) => r.weight ?? 0).filter((w) => w > 0);
  if (!positive.length) return { weighted: false, weightOf: () => 1 };
  const mean = positive.reduce((a, b) => a + b, 0) / positive.length;
  return { weighted: true, weightOf: (r) => (r.weight === null || r.weight === undefined ? mean : Math.max(0, r.weight)) };
}

/** Promedio (0–100) con las actividades que cuentan. `rows` ya viene sin las actividades quitadas. */
export function courseAverage<T extends GradeLike>(rows: T[]): { avg: number | null; weighted: boolean; graded: number; total: number } {
  const { weighted, weightOf } = gradeWeights(rows);
  const counts = rows.filter((r) => r.grade_max > 0 && weightOf(r) > 0);
  const graded = counts.filter((r) => r.grade !== null);
  if (!graded.length) return { avg: null, weighted, graded: 0, total: counts.length };
  const w = graded.reduce((a, r) => a + weightOf(r), 0);
  const avg = graded.reduce((a, r) => a + (r.grade! / r.grade_max) * 100 * weightOf(r), 0) / w;
  return { avg, weighted, graded: graded.length, total: counts.length };
}

/** Nota que necesitas en promedio en lo que falta para terminar con `goal` (null si ya no falta nada). */
export function neededFor<T extends GradeLike>(rows: T[], goal: number): number | null {
  const { weightOf } = gradeWeights(rows);
  const counts = rows.filter((r) => r.grade_max > 0 && weightOf(r) > 0);
  const left = counts.filter((r) => r.grade === null);
  if (!left.length) return null;
  const wAll = counts.reduce((a, r) => a + weightOf(r), 0);
  const wLeft = left.reduce((a, r) => a + weightOf(r), 0);
  const sum = counts.filter((r) => r.grade !== null).reduce((a, r) => a + (r.grade! / r.grade_max) * 100 * weightOf(r), 0);
  return (goal * wAll - sum) / wLeft;
}
