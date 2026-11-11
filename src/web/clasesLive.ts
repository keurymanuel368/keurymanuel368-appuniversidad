// Clase en vivo (PC): captura el audio de la pestaña de Meet/Teams, lo corta en trozos de 30 s y lo manda a Rumbo.
// Vive FUERA de React a propósito: si cambias de pantalla dentro de Rumbo, la captura sigue.
import { api } from './api';

export type Qa = { id: string; at: number; dirigida: 'tu' | 'clase'; pregunta: string; corta: string; completa: string; tip?: string };
export type LiveState = {
  phase: 'idle' | 'live' | 'ending';
  id: number | null; title: string; startedAt: number;
  sent: number; silent: number; failed: number; queued: number;
  lines: { at: number; text: string }[]; alerts: Qa[];
  err: string; progress: { done: number; total: number } | null; finishedId: number | null; asking: boolean;
};

const CHUNK_MS = 30_000;
const blank = (): LiveState => ({ phase: 'idle', id: null, title: '', startedAt: 0, sent: 0, silent: 0, failed: 0, queued: 0, lines: [], alerts: [], err: '', progress: null, finishedId: null, asking: false });
let st: LiveState = blank();
const subs = new Set<() => void>();
export const getLive = () => st;
export const subscribeLive = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const set = (p: Partial<LiveState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };

type Chunk = { rec: MediaRecorder; parts: Blob[]; t0: number; heard: boolean; force: boolean };
type Item = { blob: Blob; offset: number; force: boolean; mime: string };

let display: MediaStream | null = null;
let audio: MediaStream | null = null;
let current: Chunk | null = null;
let cutTimer = 0, meterTimer = 0;
let ctx: AudioContext | null = null;
let queue: Item[] = [];
let dead: Item[] = [];
let working = false;
let wake: { release: () => Promise<void> } | null = null;
let mime = 'audio/webm';

const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };

function beep() {
  try {
    const a = new AudioContext(); const o = a.createOscillator(); const g = a.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start();
    setTimeout(() => { o.frequency.value = 1175; }, 160); setTimeout(() => { o.stop(); void a.close(); }, 360);
  } catch { /* sin sonido */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
}

function newChunk(): Chunk {
  const rec = new MediaRecorder(audio!, { mimeType: mime, audioBitsPerSecond: 24000 });
  const c: Chunk = { rec, parts: [], t0: Date.now(), heard: false, force: false };
  rec.ondataavailable = (e) => { if (e.data.size) c.parts.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(c.parts, { type: mime });
    if (!c.heard && !c.force) { set({ silent: st.silent + 1 }); return; } // silencio: no se gasta cuota de transcripción
    if (blob.size < 800) return;
    queue.push({ blob, offset: Math.round((c.t0 - st.startedAt) / 1000), force: c.force, mime });
    set({ queued: queue.length });
    void pump();
  };
  rec.start();
  return c;
}

/** Corta el trozo actual y empieza otro sin perder audio (el nuevo arranca antes de cerrar el viejo). */
function cut(force = false) {
  window.clearTimeout(cutTimer);
  const old = current;
  if (st.phase === 'live') { current = newChunk(); cutTimer = window.setTimeout(() => cut(), CHUNK_MS); }
  if (old) { old.force = force; if (old.rec.state !== 'inactive') old.rec.stop(); }
}

async function upload(it: Item): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/clases/${st.id}/chunk`, { method: 'POST', headers: { 'Content-Type': it.mime, 'X-Offset': String(it.offset), 'X-Force': it.force ? '1' : '0' }, body: it.blob });
      if (res.status === 409) return true; // la clase ya terminó
      const j = (await res.json().catch(() => ({}))) as { text?: string; qa?: Qa | null; error?: string };
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      const patch: Partial<LiveState> = { sent: st.sent + 1, err: '', asking: false };
      if (j.text) patch.lines = [...st.lines, { at: it.offset, text: j.text }].slice(-60);
      if (j.qa) { patch.alerts = [j.qa, ...st.alerts]; if (j.qa.dirigida === 'tu') beep(); }
      set(patch);
      return true;
    } catch (e) {
      set({ err: (e as Error).message });
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) ** 2));
    }
  }
  return false;
}

async function pump() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const it = queue[0];
      if (await upload(it)) queue.shift(); else { dead.push(queue.shift()!); set({ failed: dead.length }); }
      set({ queued: queue.length });
    }
  } finally { working = false; set({ queued: queue.length, asking: false }); }
}

export async function startLive(title: string, course: string) {
  if (st.phase !== 'idle') return;
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Este navegador no puede compartir audio de una pestaña. Usa Chrome en una PC.');
  mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const d = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1, width: 320, height: 180 }, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } } as DisplayMediaStreamOptions);
  const tracks = d.getAudioTracks();
  if (!tracks.length) { d.getTracks().forEach((t) => t.stop()); throw new Error('No se compartió el audio. Elige la pestaña de la reunión y marca «Compartir audio de la pestaña».'); }
  let id: number;
  try { id = (await api<{ id: number }>('/clases', { method: 'POST', body: { title, course } })).id; }
  catch (e) { d.getTracks().forEach((t) => t.stop()); throw e; }
  display = d; audio = new MediaStream(tracks); queue = []; dead = [];
  st = { ...blank(), phase: 'live', id, title, startedAt: Date.now() };
  subs.forEach((f) => f());
  // Medidor de volumen: un trozo sin sonido no se sube.
  try {
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(audio); const an = ctx.createAnalyser(); an.fftSize = 1024;
    const mute = ctx.createGain(); mute.gain.value = 0; src.connect(an); an.connect(mute); mute.connect(ctx.destination);
    const buf = new Uint8Array(an.fftSize);
    meterTimer = window.setInterval(() => { an.getByteTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v - 128)); if (pk > 4 && current) current.heard = true; }, 300);
  } catch { /* sin medidor: se sube todo */ }
  tracks[0].addEventListener('ended', () => { void stopLive(); });
  d.getVideoTracks()[0]?.addEventListener('ended', () => { void stopLive(); });
  current = newChunk();
  cutTimer = window.setTimeout(() => cut(), CHUNK_MS);
  window.addEventListener('beforeunload', warn);
  try { const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }; wake = (await nav.wakeLock?.request('screen')) || null; } catch { /* sin wake lock */ }
}

/** «¿Qué me preguntaron?»: corta ya el trozo actual y revisa si hubo una pregunta. */
export function askNow() {
  if (st.phase !== 'live') return;
  set({ asking: true });
  cut(true);
}

export function retryFailed() { if (!dead.length) return; queue.push(...dead); dead = []; set({ failed: 0, queued: queue.length }); void pump(); }

export function dismissAlert(id: string) { set({ alerts: st.alerts.filter((a) => a.id !== id) }); }

/** Termina la clase, espera a que se envíe lo pendiente y arma la explicación. */
export async function stopLive() {
  if (st.phase !== 'live') return;
  const id = st.id!;
  set({ phase: 'ending', err: '' });
  window.clearTimeout(cutTimer); window.clearInterval(meterTimer);
  window.removeEventListener('beforeunload', warn);
  const last = current; current = null;
  if (last && last.rec.state !== 'inactive') { last.force = true; last.heard = true; last.rec.stop(); }
  display?.getTracks().forEach((t) => t.stop()); audio?.getTracks().forEach((t) => t.stop());
  display = null; audio = null;
  void ctx?.close().catch(() => {}); ctx = null;
  try { void wake?.release(); } catch { /* ya liberado */ } wake = null;
  for (let i = 0; i < 120 && (queue.length || working); i++) await new Promise((r) => setTimeout(r, 500));
  try {
    await api(`/clases/${id}/end`, { method: 'POST' });
    await runProcess(id);
  } catch (e) { set({ err: (e as Error).message }); }
  set({ phase: 'idle', finishedId: id, progress: null });
}

/** Sigue pidiendo pasos de resumen hasta que la clase quede lista (o falle). */
export async function runProcess(id: number): Promise<'ready' | 'error'> {
  for (let i = 0; i < 40; i++) {
    const r = await api<{ status: string; done?: number; total?: number; error?: string }>(`/clases/${id}/process`, { method: 'POST' });
    if (r.status === 'ready') { set({ progress: null }); return 'ready'; }
    if (r.status === 'error') { set({ progress: null, err: r.error || 'No se pudo armar la explicación' }); return 'error'; }
    set({ progress: { done: r.done || 0, total: r.total || 0 } });
  }
  return 'error';
}

export function clearFinished() { set({ finishedId: null, err: '' }); }
