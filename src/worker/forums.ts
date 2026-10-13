// Notas de foros leídas directamente del foro. Muchas veces el facilitador califica el foro
// (puntúa tu mensaje o te responde «Calificación: 95») pero el EVA no la pasa al libro de calificaciones.
// Aquí se abre el foro, se buscan tus mensajes y la nota que te pusieron.
import type { Env } from './env';
import { htmlToText, moodleCall } from './moodle';

export type ForumInfo = {
  id: number; course: number; name: string; cmid: number; type: string;
  assessed?: number; scale?: number; grade_forum?: number; duedate?: number; cutoffdate?: number; intro?: string;
};

export type ForumFinding = {
  forum: ForumInfo; participated: boolean; firstPost: number | null;
  grade: number | null; max: number | null; feedback: string; how: 'puntuacion' | 'respuesta' | null;
};

type Post = { id: number; parent: number; author: number; authorName: string; text: string; created: number };
type Rating = { itemid: number; aggregate?: number | null; count?: number };

const NUM = '(\\d{1,3}(?:[.,]\\d{1,2})?)';
const KEYWORD = '(?:calificaci[oó]n|nota|puntuaci[oó]n|puntaje|valoraci[oó]n)';
const FILL = '(?:\\s*(?:es|de|del|fue|final|obtenida|asignada|total|foro|este|en|:|=|-|–)\\s*){0,4}';
const RX_KEYWORD = new RegExp(`${KEYWORD}${FILL}\\s*${NUM}(\\s*%)?(?:\\s*(?:\\/|de|sobre)\\s*(\\d{1,3})\\b)?`, 'i');
const RX_VERB = new RegExp(`(?:obtuv\\w*|obtien\\w*|obtenido|alcanz\\w*|merece\\w*|asign[oó]|otorg[oó])\\s+(?:un[a]?\\s+|con\\s+)?${NUM}(\\s*%)?(?:\\s*(?:\\/|de|sobre)\\s*(\\d{1,3})\\b)?\\s*(?:puntos|pts)?`, 'i');

/** Busca una nota escrita en el texto del facilitador («Calificación: 95/100», «obtuviste 9 de 10»). */
export function parseGradeText(text: string, gradeMax = 100): { grade: number; max: number } | null {
  const plain = text.replace(/\s+/g, ' ');
  const m = plain.match(RX_KEYWORD) || plain.match(RX_VERB);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  let max = m[2] ? 100 : m[3] ? Number(m[3]) : null;
  if (max === null) max = value <= 10 && gradeMax > 10 ? 10 : gradeMax;
  if (!Number.isFinite(value) || max < 1 || max > 100 || value > max) return null;
  return { grade: value, max };
}

/** Combina las puntuaciones de tus mensajes como lo hace el foro (promedio, máximo, mínimo, suma o cantidad). */
export function combineRatings(values: number[], assessed: number, scale: number): number | null {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const v = assessed === 2 ? values.length : assessed === 3 ? Math.max(...values) : assessed === 4 ? Math.min(...values)
    : assessed === 5 ? sum : sum / values.length;
  return scale > 0 ? Math.min(v, scale) : v;
}

async function discussionPosts(env: Env, discussionId: number): Promise<{ posts: Post[]; ratings: Rating[] }> {
  try {
    type P = { id: number; parentid?: number | null; author?: { id: number; fullname?: string }; message?: string; timecreated?: number };
    const r = await moodleCall<{ posts?: P[]; ratinginfo?: { ratings?: Rating[] } }>(env, 'mod_forum_get_discussion_posts', { discussionid: discussionId, sortby: 'created', sortdirection: 'ASC' });
    return {
      posts: (r.posts || []).map((p) => ({ id: p.id, parent: p.parentid || 0, author: p.author?.id ?? 0, authorName: p.author?.fullname || '', text: htmlToText(p.message), created: p.timecreated || 0 })),
      ratings: r.ratinginfo?.ratings || [],
    };
  } catch {
    // EVA más viejo: función anterior (sin puntuaciones).
    type P = { id: number; parent: number; userid: number; userfullname?: string; message?: string; created?: number };
    const r = await moodleCall<{ posts?: P[] }>(env, 'mod_forum_get_forum_discussion_posts', { discussionid: discussionId });
    return { posts: (r.posts || []).map((p) => ({ id: p.id, parent: p.parent, author: p.userid, authorName: p.userfullname || '', text: htmlToText(p.message), created: p.created || 0 })), ratings: [] };
  }
}

/**
 * Revisa un foro: si participaste y qué nota te pusieron (puntuación del mensaje o respuesta del facilitador).
 * Usa como máximo `budget` llamadas al EVA; devuelve cuántas gastó.
 */
export async function scanForum(env: Env, forum: ForumInfo, me: number, gradeMax: number, facilitators: string[], budget: number): Promise<{ finding: ForumFinding; calls: number }> {
  const finding: ForumFinding = { forum, participated: false, firstPost: null, grade: null, max: null, feedback: '', how: null };
  type Disc = { id: number; discussion?: number; userid?: number; userfullname?: string; numreplies?: number };
  let calls = 1;
  const discs = (await moodleCall<{ discussions?: Disc[] }>(env, 'mod_forum_get_forum_discussions', { forumid: forum.id, sortorder: 0, page: 0, perpage: 40 })).discussions || [];
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const facs = facilitators.map(norm).filter(Boolean);
  // Primero las discusiones que abriste tú, luego las del facilitador; si son pocas, todas.
  const ranked = discs.length <= 3 ? discs : [
    ...discs.filter((d) => d.userid === me),
    ...discs.filter((d) => d.userid !== me && facs.some((f) => f.includes(norm(d.userfullname || '')) || norm(d.userfullname || '').includes(f))),
    ...discs.filter((d) => d.userid !== me),
  ];
  const seen = new Set<number>();
  const ratingValues: number[] = [];
  let best: { at: number; grade: number; max: number; text: string } | null = null;
  for (const d of ranked) {
    const id = d.discussion ?? d.id;
    if (seen.has(id) || seen.size >= 3 || calls >= budget) continue;
    seen.add(id);
    calls++;
    const { posts, ratings } = await discussionPosts(env, id);
    const mine = posts.filter((p) => p.author === me);
    if (!mine.length) continue;
    finding.participated = true;
    finding.firstPost = Math.min(finding.firstPost ?? Infinity, ...mine.map((p) => p.created));
    const mineIds = new Set(mine.map((p) => p.id));
    for (const r of ratings) if (mineIds.has(r.itemid) && typeof r.aggregate === 'number' && (r.count ?? 1) > 0) ratingValues.push(r.aggregate);
    // Respuestas de otra persona a tus mensajes: ahí suele venir la nota y el comentario.
    for (const p of posts) {
      if (p.author === me || !mineIds.has(p.parent)) continue;
      const g = parseGradeText(p.text, gradeMax);
      if (g && (!best || p.created >= best.at)) best = { at: p.created, ...g, text: p.text };
      else if (!best && !finding.feedback) finding.feedback = p.text.slice(0, 1500);
    }
  }
  const scale = forum.scale ?? 0;
  const rated = scale > 0 ? combineRatings(ratingValues, forum.assessed ?? 1, scale) : null;
  if (rated !== null) {
    finding.grade = rated; finding.max = scale; finding.how = 'puntuacion';
    if (best) finding.feedback = best.text.slice(0, 1500);
  } else if (best) {
    finding.grade = best.grade; finding.max = best.max; finding.how = 'respuesta'; finding.feedback = best.text.slice(0, 1500);
  }
  return { finding, calls };
}
