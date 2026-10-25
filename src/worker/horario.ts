// Horario de clases de Mi UAPA (Banner), exámenes del DEA y recomendación de materias por trimestre.
// Los datos llegan con el importador (marcador del navegador) porque Banner pide iniciar sesión con tu clave
// y Rumbo nunca la guarda.
import type { Hono } from 'hono';
import type { Env } from './env';
import { getSetting, setSetting, markSent } from './db';
import { localDate, nowSec, ymd } from './time';
import { sendToMe } from './notify';

type App = Hono<{ Bindings: Env }>;

export type ClassRow = { id: number; term: string; crn: string; code: string | null; title: string; day: number; start_min: number; end_min: number; room: string | null; building: string | null; start_date: string | null; end_date: string | null };
export type ExamRow = { id: number; course: string | null; title: string; opens_at: number | null; closes_at: number | null };
type Recommend = { code: string | null; name: string; credits: number; term: number; why: string };

const h12 = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
/** "0830" → minutos. */
const minOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
/** "02/11/2026" (día/mes/año de Banner) → "2026-11-02". */
const isoOf = (s: string) => { const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export async function classes(env: Env): Promise<ClassRow[]> {
  const { results } = await env.DB.prepare('SELECT id, term, crn, code, title, day, start_min, end_min, room, building, start_date, end_date FROM uapa_classes WHERE user_id = ? ORDER BY day, start_min').bind(env.UID).all<ClassRow>();
  return results;
}

/** Recomienda qué cursar el trimestre que viene: pendientes con prerrequisitos cumplidos, de los trimestres más bajos. */
export async function recommend(env: Env, maxCredits = 14): Promise<{ list: Recommend[]; credits: number; note: string }> {
  const { results } = await env.DB.prepare('SELECT term, code, name, credits, status, prereqs, kind FROM pensum WHERE user_id = ? ORDER BY term, id').bind(env.UID)
    .all<{ term: number; code: string | null; name: string; credits: number; status: string; prereqs: string | null; kind: string | null }>();
  const done = new Set(results.filter((r) => r.status === 'aprobada').map((r) => r.code).filter(Boolean));
  const taking = new Set(results.filter((r) => r.status === 'en_curso').map((r) => r.code).filter(Boolean));
  const codes = (p: string) => p.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const ready = (p: string | null) => !p || (p !== 'TODAS' && codes(p).every((c) => done.has(c)));
  const open = results.filter((r) => r.status !== 'aprobada' && r.status !== 'cursando' && (r.kind || 'obligatoria') === 'obligatoria');
  const first = open.length ? Math.min(...open.map((x) => x.term)) : 0;
  const list: Recommend[] = [];
  let credits = 0;
  for (const r of open) {
    if (!ready(r.prereqs) || credits + r.credits > maxCredits) continue;
    list.push({ code: r.code, name: r.name, credits: r.credits, term: r.term, why: r.term === first ? 'Te toca por el pénsum' : 'Adelanta créditos sin prerrequisitos pendientes' });
    credits += r.credits;
  }
  const blocked = open.filter((r) => !ready(r.prereqs) && r.prereqs && r.prereqs !== 'TODAS' && codes(r.prereqs).some((c) => taking.has(c)));
  const note = blocked.length ? `Cuando apruebes lo que cursas ahora se abren: ${blocked.slice(0, 3).map((b) => b.name).join(', ')}.` : '';
  return { list, credits, note };
}

type ImportBody = {
  kind: string; term?: string;
  classes?: { crn: string; code?: string; title: string; meetings: { b: string; e: string; d: string[]; sd?: string; ed?: string; room?: string | null; bldg?: string | null }[] }[];
  exams?: { course?: string; title: string; opens?: number; closes?: number }[];
  profile?: Record<string, string>;
  projection?: { code: string; title: string }[];
};

export function registerHorario(app: App) {
  app.get('/api/horario', async (c) => {
    const { results: exams } = await c.env.DB.prepare('SELECT id, course, title, opens_at, closes_at FROM uapa_exams WHERE user_id = ? ORDER BY opens_at').bind(c.env.UID).all<ExamRow>();
    return c.json({
      classes: await classes(c.env),
      exams,
      profile: JSON.parse(await getSetting(c.env, 'uapa_profile', 'null')),
      projection: JSON.parse(await getSetting(c.env, 'uapa_projection', '[]')),
      synced_at: Number(await getSetting(c.env, 'uapa_synced_at', '0')) || null,
      lead: Number(await getSetting(c.env, 'class_lead', '30')),
      recommend: await recommend(c.env),
    });
  });

  // Importador: lo manda el marcador que corres dentro de Banner / DEA (el navegador ya tiene tu sesión).
  app.post('/api/uapa/import', async (c) => {
    const b = await c.req.json<ImportBody>();
    const env = c.env;
    const stmts = [];
    let n = 0;
    if (b.kind === 'schedule' && b.term && b.classes?.length) {
      stmts.push(env.DB.prepare('DELETE FROM uapa_classes WHERE user_id = ? AND term = ?').bind(env.UID, b.term));
      for (const k of b.classes) for (const m of k.meetings) for (const d of m.d) {
        const day = DAYS.indexOf(d);
        if (day < 0 || !/^\d{4}$/.test(m.b) || !/^\d{4}$/.test(m.e)) continue;
        stmts.push(env.DB.prepare('INSERT OR REPLACE INTO uapa_classes (user_id, term, crn, code, title, day, start_min, end_min, room, building, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(env.UID, b.term, String(k.crn), k.code || null, k.title, day, minOf(m.b), minOf(m.e), m.room || null, m.bldg || null, m.sd ? isoOf(m.sd) : null, m.ed ? isoOf(m.ed) : null));
        n++;
      }
      if (b.projection?.length) await setSetting(env, 'uapa_projection', JSON.stringify(b.projection.slice(0, 60)));
    }
    if (b.kind === 'dea' && b.exams?.length) {
      for (const x of b.exams) {
        stmts.push(env.DB.prepare('INSERT INTO uapa_exams (user_id, course, title, opens_at, closes_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, title, course) DO UPDATE SET opens_at = excluded.opens_at, closes_at = excluded.closes_at')
          .bind(env.UID, x.course || null, x.title, x.opens ?? null, x.closes ?? null));
        n++;
      }
    }
    if (b.kind === 'profile' && b.profile) { await setSetting(env, 'uapa_profile', JSON.stringify(b.profile)); n = 1; }
    if (!n) return c.json({ error: 'No llegó nada para guardar.' }, 400);
    if (stmts.length) await env.DB.batch(stmts);
    await setSetting(env, 'uapa_synced_at', String(nowSec()));
    return c.json({ ok: true, count: n });
  });

  app.post('/api/horario/lead', async (c) => {
    const { lead } = await c.req.json<{ lead: number }>();
    await setSetting(c.env, 'class_lead', String([15, 30, 45, 60].includes(lead) ? lead : 30));
    return c.json({ ok: true });
  });
}

/** Cron (cada 30 min): avisa antes de cada clase y antes de los exámenes del DEA. */
export async function classAlerts(env: Env): Promise<string[]> {
  const log: string[] = [];
  const now = nowSec();
  const local = localDate(env);
  const today = ymd(local);
  const day = (local.getUTCDay() + 6) % 7;
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const lead = Number(await getSetting(env, 'class_lead', '30'));
  for (const k of await classes(env)) {
    if (k.day !== day) continue;
    if (k.start_date && today < k.start_date) continue;
    if (k.end_date && today > k.end_date) continue;
    const inMin = k.start_min - nowMin;
    if (inMin <= 0 || inMin > lead + 14) continue;
    if (!(await markSent(env, `clase:${today}:${k.crn}:${k.start_min}`))) continue;
    const where = [k.building, k.room].filter(Boolean).join(' · ');
    const r = await sendToMe(env, `🎓 *${k.title}* empieza en ${inMin} min (${h12(k.start_min)})${where ? `\n📍 ${where}` : ''}`, {
      title: `🎓 ${k.title} · en ${inMin} min`, pushBody: `${h12(k.start_min)} – ${h12(k.end_min)}${where ? ' · ' + where : ''}`, tag: `clase-${k.crn}`, url: '/#horario', type: 'clases',
    });
    log.push(`Clase ${k.crn}: ${r.ok ? 'avisada' : r.error}`);
  }
  const { results: exams } = await env.DB.prepare('SELECT id, course, title, opens_at, closes_at FROM uapa_exams WHERE user_id = ? AND opens_at > ?').bind(env.UID, now).all<ExamRow>();
  for (const e of exams) {
    for (const [h, label] of [[24, 'mañana'], [2, 'en 2 horas']] as const) {
      const left = (e.opens_at! - now) / 3600;
      if (left > h || left < h - 1 || !(await markSent(env, `examen:${e.id}:${h}`))) continue;
      const d = localDate(env, e.opens_at!);
      const when = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${h12(d.getUTCHours() * 60 + d.getUTCMinutes())}`;
      await sendToMe(env, `📝 *${e.title}* abre ${label} (${when}) en el DEA.`, { title: `📝 Examen ${label}`, pushBody: `${e.title} · ${when}`, tag: `examen-${e.id}-${h}`, url: '/#horario', type: 'clases' });
      log.push(`Examen ${e.id}: aviso ${h}h`);
    }
  }
  return log;
}
