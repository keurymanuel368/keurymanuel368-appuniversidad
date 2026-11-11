export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method || 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Sin conexión: inténtalo cuando vuelva el internet.');
  }
  // Datos guardados (sin internet): la app muestra un aviso discreto.
  if (res.headers.get('X-Rumbo-Offline')) window.dispatchEvent(new Event('rumbo:offline-data'));
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && (data as { error?: string }).error === 'Sin conexión') throw new ApiError(0, 'Sin conexión: esto todavía no está guardado en el teléfono.');
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Error ${res.status}`);
  return data as T;
}

export type Task = {
  id: number; title: string; due_at: number | null; url: string | null; source: string; status: string; notes: string | null; submitted_at?: number | null;
  grade?: number | null; grade_max?: number | null; grade_feedback?: string | null; grade_source?: string | null; facilitator?: string | null; focus_minutes?: number; description?: string | null;
  moodle_key?: string | null; forum_posts?: number | null; forum_replies?: number | null; forum_needed?: number | null; attachments?: string | null;
  course_id: number | null; course_name: string | null; course_short: string | null; course_color: string | null;
};
export type Course = { id: number; code: string | null; name: string; short_name: string | null; color: string; facilitator: string | null; facilitator_eva?: string | null; graded: number; total: number; average: number | null; pending_tasks: number; weighted?: number; eva_total?: number | null; eva_total_max?: number | null; progress?: number | null;
  /** Créditos según el pensum (3 si no aparece) y 1 cuando ya tiene todas las notas (promedio final). */
  credits?: number; complete?: number };
export type PayWindow = { state: 'open' | 'closed'; period: string; opensAt: number; closesAt: number; daysToOpen: number; daysToClose: number; paid: boolean; amount: string; openDay: number; closeDay: number };
export type Dashboard = {
  today: string; name: string; termProgress: number | null;
  counts: { pending: number; today: number; week: number; overdue: number };
  average: number | null; tasks: Task[]; graded: Task[]; weekProgress: { total: number; done: number };
  news: { id: number; title: string; kind: string; created_at: number; read: number; course_name: string | null }[]; unreadNews: number; courses: Course[]; pay: PayWindow;
  lastSync: number | null; lastSyncError: string; summaryHour: number;
  mascot?: { mood: string; headline: string; sub: string; streak: number };
  setup?: { eva: boolean; whatsapp: boolean; career: boolean };
  goals?: { id: string; label: string; done: number; total: number; ok: boolean; detail: string }[]; goalIds?: string[];
  freshGrade?: { id: number; title: string; grade: number; max: number; feedback: string; course: string | null; color: string | null; url: string | null; average: number | null; delta: number | null } | null;
};
export type PensumRow = { id: number; term: number; code: string | null; name: string; credits: number; status: string; grade: number | null; prereqs: string | null; coreqs?: string | null; kind?: string };
export type Elective = { code: string; name: string; credits: number; block: string };
export type CareersRes = {
  current: { id: string; name: string; version?: string; source?: string; totalCredits?: number; notes: string[]; electives: Elective[] } | null;
  careers: { id: string; name: string; area: string; available: boolean }[];
};

// ----- Fechas en hora de República Dominicana -----
const TZ = 'America/Santo_Domingo';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-DO', { timeZone: TZ, ...o });

export function dayKey(sec: number): string {
  return fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sec * 1000));
}

export function whenLabel(sec: number | null): string {
  if (!sec) return 'Sin fecha';
  const now = Math.floor(Date.now() / 1000);
  const d = new Date(sec * 1000);
  const hora = fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  if (dayKey(sec) === dayKey(now)) return `Hoy · ${hora}`;
  if (dayKey(sec) === dayKey(now + 86400)) return `Mañana · ${hora}`;
  const diff = (sec - now) / 86400;
  if (diff > 0 && diff < 6) return `${cap(fmt({ weekday: 'long' }).format(d))} · ${hora}`;
  return cap(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d)).replace(/\./g, '');
}

/** "Venció hoy", "Venció ayer", "Venció hace 3 días" (para las entregas atrasadas). */
export function overdueLabel(sec: number): string {
  // Días de calendario en hora de RD (UTC−4 todo el año).
  const day = (x: number) => Math.floor((x - 4 * 3600) / 86400);
  const days = day(Date.now() / 1000) - day(sec);
  if (days <= 0) return 'Venció hoy';
  return days === 1 ? 'Venció ayer' : `Venció hace ${days} días`;
}

/** «hace un momento», «hace 12 min», «hace 3 h», «ayer», o la fecha. */
export function agoLabel(sec: number): string {
  const s = Math.max(0, Date.now() / 1000 - sec);
  if (s < 90) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 2 * 86400) return 'ayer';
  return dateLabel(sec);
}

export function dateLabel(sec: number): string {
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(sec * 1000)).replace(/\./g, '');
}

export function urgency(sec: number | null): 'red' | 'orange' | 'blue' | 'gray' {
  if (!sec) return 'gray';
  const left = sec - Date.now() / 1000;
  if (left < 0) return 'red';
  if (left < 86400 || dayKey(sec) === dayKey(Math.floor(Date.now() / 1000))) return 'orange';
  if (left < 7 * 86400) return 'blue';
  return 'gray';
}

/** Convierte el valor de un <input type="datetime-local"> (hora de RD) a segundos Unix. */
export function localInputToUnix(v: string): number | null {
  if (!v) return null;
  const [date, time = '23:59'] = v.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d, h, mi) / 1000) + 4 * 3600;
}

export function unixToLocalInput(sec: number | null): string {
  if (!sec) return '';
  const d = new Date((sec - 4 * 3600) * 1000);
  return d.toISOString().slice(0, 16);
}

export type SendResult = { ok: boolean; channels: ('whatsapp' | 'callmebot' | 'push')[]; error?: string };
const CHANNEL = { whatsapp: 'WhatsApp', callmebot: 'CallMeBot', push: 'notificación' } as const;
export const channelsLabel = (r: SendResult) => r.channels.map((c) => CHANNEL[c]).join(' y ');

export const cap =(s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Quita los códigos que el EVA pone al inicio de los avisos ("202633-CBC103-HV4-2347-0: SEMANA I…" → "SEMANA I…"). */
export function cleanTitle(t: string): string {
  const out = t.replace(/^\s*\d{4,}-[A-Z0-9]+(?:-[A-Z0-9]+)*\s*[:\-–]\s*/i, '').replace(/^(Re|Fwd?|RV|RE):\s*/i, '').trim();
  return out || t;
}

/** Título para mostrar de un aviso: si el del EVA no tiene letras ("....."), usa la primera línea del mensaje. */
export function newsTitle(title: string, body?: string | null): string {
  const t = cleanTitle(title);
  if (/[\p{L}\p{N}]/u.test(t)) return t;
  const first = (body || '').split('\n').map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) || '';
  return first ? (first.length > 80 ? first.slice(0, 79).trimEnd() + '…' : first) : 'Mensaje del EVA';
}
