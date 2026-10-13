// Modo estudio con IA para cada tarea:
//   plan     → pasos concretos para hacerla, con tiempo estimado
//   tarjetas → preguntas de práctica con su respuesta (para repasar)
//   explica  → explicación corta del tema, para leer o escuchar
//   foro     → borrador de tu aporte al foro e ideas para responder a compañeros
// Las respuestas se guardan (study_cache) para no gastar los límites gratis de la IA cada vez.
import type { Env } from './env';
import { listTasks } from './data';
import { llmComplete } from './llm';
import { nowSec } from './time';

export type StudyMode = 'plan' | 'tarjetas' | 'explica' | 'foro';
export type StudyResult =
  | { mode: 'plan'; steps: { title: string; detail: string; minutes: number }[]; tip: string }
  | { mode: 'tarjetas'; cards: { q: string; a: string }[] }
  | { mode: 'explica'; title: string; text: string; keys: string[] }
  | { mode: 'foro'; aporte: string; respuestas: string[]; tips: string };

const PROMPTS: Record<StudyMode, string> = {
  plan: `Arma un plan para hacer esta tarea universitaria. Responde SOLO con JSON:
{"steps": [{"title": "verbo + qué hacer (máx 8 palabras)", "detail": "1 o 2 frases concretas", "minutes": número}], "tip": "un consejo corto"}
Entre 3 y 6 pasos, en orden, realistas para un estudiante que trabaja.`,
  tarjetas: `Crea tarjetas de repaso sobre el TEMA de esta tarea (no sobre la entrega). Responde SOLO con JSON:
{"cards": [{"q": "pregunta corta", "a": "respuesta clara de 1 a 3 frases"}]}
Exactamente 6 tarjetas, de lo básico a lo más difícil.`,
  explica: `Explica el tema central de esta tarea para que un estudiante lo entienda rápido. Responde SOLO con JSON:
{"title": "tema en pocas palabras", "text": "explicación en 2 o 3 párrafos cortos, con un ejemplo de la vida diaria en República Dominicana", "keys": ["3 a 5 ideas clave cortas"]}`,
  foro: `Ayuda a preparar la participación en este foro universitario. Responde SOLO con JSON:
{"aporte": "borrador del aporte principal: 2 a 4 párrafos en primera persona que respondan exactamente lo que pide la consigna", "respuestas": ["3 ideas para responder a compañeros: cómo empezar y qué aportar, 1 o 2 frases cada una"], "tips": "un consejo corto sobre lo que suele evaluar el facilitador en este foro"}
Escribe natural, como un estudiante dominicano que se expresa bien. No inventes citas, autores ni datos.`,
};

function parseJson(raw: string): Record<string, unknown> | null {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
}

/** Convierte lo que respondió la IA en un resultado válido (o null si no sirve). */
export function normalizeStudy(mode: StudyMode, j: Record<string, unknown> | null): StudyResult | null {
  if (!j) return null;
  const str = (x: unknown) => String(x ?? '').trim();
  if (mode === 'plan') {
    const steps = (Array.isArray(j.steps) ? j.steps : []).map((s: Record<string, unknown>) => ({ title: str(s.title), detail: str(s.detail), minutes: Math.max(5, Math.min(240, Math.round(Number(s.minutes) || 20))) })).filter((s) => s.title).slice(0, 8);
    return steps.length ? { mode, steps, tip: str(j.tip) } : null;
  }
  if (mode === 'tarjetas') {
    const cards = (Array.isArray(j.cards) ? j.cards : []).map((c: Record<string, unknown>) => ({ q: str(c.q), a: str(c.a) })).filter((c) => c.q && c.a).slice(0, 10);
    return cards.length ? { mode, cards } : null;
  }
  if (mode === 'foro') {
    const aporte = str(j.aporte);
    return aporte ? { mode, aporte, respuestas: (Array.isArray(j.respuestas) ? j.respuestas : []).map(str).filter(Boolean).slice(0, 5), tips: str(j.tips) } : null;
  }
  const text = str(j.text);
  return text ? { mode, title: str(j.title), text, keys: (Array.isArray(j.keys) ? j.keys : []).map(str).filter(Boolean).slice(0, 6) } : null;
}

export async function study(env: Env, taskId: number, mode: StudyMode, fresh = false): Promise<StudyResult> {
  // Primero se comprueba que la tarea sea tuya (la caché va por tarea).
  const [t] = await listTasks(env, { id: taskId, limit: 1 });
  if (!t) throw new Error('Tarea no encontrada');
  if (!fresh) {
    const hit = await env.DB.prepare('SELECT content FROM study_cache WHERE task_id = ? AND mode = ?').bind(taskId, mode).first<{ content: string }>();
    if (hit) return JSON.parse(hit.content) as StudyResult;
  }
  const desc = ((t as { description?: string | null }).description || '').slice(0, 3000);
  const ctx = `Asignatura: ${t.course_name || 'Personal'}\nTarea: ${t.title}\n${desc ? `Instrucciones del facilitador:\n${desc}` : 'No hay instrucciones: dedúcelo del título.'}`;
  let result: StudyResult | null = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const raw = await llmComplete(env, [
      { role: 'system', content: `Eres un tutor universitario dominicano, claro y motivador. Escribe en español neutro y sencillo. ${PROMPTS[mode]}` },
      { role: 'user', content: ctx },
    ], { maxTokens: 1400, temperature: 0.4 });
    result = normalizeStudy(mode, parseJson(raw));
  }
  if (!result) throw new Error('La IA no devolvió un resultado válido. Inténtalo otra vez.');
  await env.DB.prepare(`INSERT INTO study_cache (task_id, mode, content, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(task_id, mode) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`).bind(taskId, mode, JSON.stringify(result), nowSec()).run();
  return result;
}
