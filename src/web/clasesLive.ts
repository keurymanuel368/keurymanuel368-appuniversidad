// Clase en vivo (PC): captura el audio de la pestaña de Meet/Teams y lo manda a Rumbo en trozos CORTOS que se cortan
// en las pausas naturales del habla (3 a 14 s): la transcripción sale casi al instante y no se parten palabras.
// Vive FUERA de React a propósito: si cambias de pantalla dentro de Rumbo, la captura sigue.
import { api } from './api';

export type Qa = { id: string; at: number; dirigida: 'tu' | 'clase'; pregunta: string; corta: string; completa: string; tip?: string };
export type LiveState = {
  phase: 'idle' | 'live' | 'ending';
  id: number | null; title: string; startedAt: number;
  sent: number; silent: number; failed: number; queued: number;
  lines: { at: number; text: string }[]; alerts: Qa[];
  err: string; notice: string; progress: { done: number; total: number } | null; finishedId: number | null;
  asking: boolean; thinking: boolean; speaking: boolean;
};

// Cuándo cortar un trozo (milisegundos): al menos 3 s y una pausa de 0,6 s; o a partir de 8 s con una pausa corta; o a los 14 s sí o sí.
const MIN_MS = 3000, SOFT_MS = 8000, HARD_MS = 14000, PAUSE_MS = 600, SHORT_PAUSE_MS = 250, DEAD_MS = 12000, TICK = 100, LEVEL = 4;

const blank = (): LiveState => ({ phase: 'idle', id: null, title: '', startedAt: 0, sent: 0, silent: 0, failed: 0, queued: 0, lines: [], alerts: [], err: '', notice: '', progress: null, finishedId: null, asking: false, thinking: false, speaking: false });
let st: LiveState = blank();
const subs = new Set<() => void>();
export const getLive = () => st;
export const subscribeLive = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const set = (p: Partial<LiveState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };

type Chunk = { rec: MediaRecorder; parts: Blob[]; t0: number; heard: boolean; silence: number; force: boolean };
type Item = { blob: Blob; offset: number; force: boolean; mime: string };

let display: MediaStream | null = null;
let audio: MediaStream | null = null;
let current: Chunk | null = null;
let meterTimer = 0, noticeTimer = 0;
let ctx: AudioContext | null = null;
let queue: Item[] = [];
let dead: Item[] = [];
let working = false;
let wake: { release: () => Promise<void> } | null = null;
let mime = 'audio/webm';
let detecting = false, detectAgain = false, detectForce = false;

const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };

function beep() {
  try {
    const a = new AudioContext(); const o = a.createOscillator(); const g = a.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start();
    setTimeout(() => { o.frequency.value = 1175; }, 160); setTimeout(() => { o.stop(); void a.close(); }, 360);
  } catch { /* sin sonido */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
}

function notice(text: string) {
  window.clearTimeout(noticeTimer); set({ notice: text });
  noticeTimer = window.setTimeout(() => set({ notice: '' }), 6000);
}

function newChunk(): Chunk {
  const rec = new MediaRecorder(audio!, { mimeType: mime, audioBitsPerSecond: 24000 });
  const c: Chunk = { rec, parts: [], t0: Date.now(), heard: false, silence: 0, force: false };
  rec.ondataavailable = (e) => { if (e.data.size) c.parts.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(c.parts, { type: mime });
    if (!c.heard && !c.force) { set({ silent: st.silent + 1 }); return; } // silencio: no se gasta cuota de transcripción
    if (blob.size < 800 && !c.force) return;
    queue.push({ blob, offset: Math.round((c.t0 - st.startedAt) / 1000), force: c.force, mime });
    set({ queued: queue.length });
    void pump();
  };
  rec.start();
  return c;
}

/** Cierra el trozo actual y abre otro enseguida (el nuevo arranca antes de cerrar el viejo: no se pierde audio). */
function cut(force = false) {
  const old = current;
  if (st.phase === 'live') current = newChunk();
  if (old) { old.force = force; if (old.rec.state !== 'inactive') old.rec.stop(); }
}

/** Cada 100 ms mira si se oye voz y decide cuándo cortar. */
function tick(an: AnalyserNode, buf: Uint8Array) {
  if (!current || st.phase !== 'live') return;
  an.getByteTimeDomainData(buf);
  let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v - 128));
  const loud = pk > LEVEL;
  if (loud) { current.heard = true; current.silence = 0; } else current.silence += TICK;
  if (loud !== st.speaking) set({ speaking: loud });
  const e = Date.now() - current.t0, c = current;
  if (!c.heard && e >= DEAD_MS) cut(false); // nadie habló: se descarta y se empieza de nuevo
  else if (c.heard && ((e >= MIN_MS && c.silence >= PAUSE_MS) || (e >= SOFT_MS && c.silence >= SHORT_PAUSE_MS) || e >= HARD_MS)) cut(false);
}

async function upload(it: Item): Promise<{ text: string; cue: boolean } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/clases/${st.id}/chunk`, { method: 'POST', headers: { 'Content-Type': it.mime, 'X-Offset': String(it.offset), 'X-Force': it.force ? '1' : '0' }, body: it.blob });
      if (res.status === 409) return { text: '', cue: false }; // la clase ya terminó
      const j = (await res.json().catch(() => ({}))) as { text?: string; cue?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      return { text: j.text || '', cue: !!j.cue };
    } catch (e) {
      set({ err: (e as Error).message });
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) ** 2));
    }
  }
  return null;
}

async function pump() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const it = queue[0];
      const r = await upload(it);
      if (r) {
        queue.shift();
        const patch: Partial<LiveState> = { sent: st.sent + 1, err: '' };
        if (r.text) patch.lines = [...st.lines, { at: it.offset, text: r.text }].slice(-80);
        set(patch);
        if (r.cue || it.force) void runDetect(it.force); // la respuesta se pide aparte: la transcripción ya salió
      } else { dead.push(queue.shift()!); set({ failed: dead.length }); }
      set({ queued: queue.length });
    }
  } finally { working = false; set({ queued: queue.length }); }
}

/** Pide la pregunta detectada y su respuesta. Una a la vez; si llega otra mientras tanto, se repite al terminar. */
async function runDetect(force: boolean) {
  if (st.phase === 'idle') return;
  if (detecting) { detectAgain = true; detectForce = detectForce || force; return; }
  detecting = true; set({ thinking: true });
  try {
    const r = await api<{ qa: Qa | null }>(`/clases/${st.id}/detect`, { method: 'POST', body: { force } });
    if (r.qa) { set({ alerts: [r.qa, ...st.alerts] }); if (r.qa.dirigida === 'tu') beep(); }
    else if (force) notice('No encontré una pregunta en lo último que se dijo.');
  } catch (e) { if (force) notice('No se pudo revisar: ' + (e as Error).message); }
  finally {
    detecting = false; set({ thinking: false, asking: false });
    if (detectAgain) { detectAgain = false; const f = detectForce; detectForce = false; void runDetect(f); }
  }
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
  display = d; audio = new MediaStream(tracks); queue = []; dead = []; detecting = false; detectAgain = false;
  st = { ...blank(), phase: 'live', id, title, startedAt: Date.now() };
  subs.forEach((f) => f());
  ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(audio); const an = ctx.createAnalyser(); an.fftSize = 1024;
  const mute = ctx.createGain(); mute.gain.value = 0; src.connect(an); an.connect(mute); mute.connect(ctx.destination);
  const buf = new Uint8Array(an.fftSize);
  current = newChunk();
  meterTimer = window.setInterval(() => tick(an, buf), TICK);
  tracks[0].addEventListener('ended', () => { void stopLive(); });
  d.getVideoTracks()[0]?.addEventListener('ended', () => { void stopLive(); });
  window.addEventListener('beforeunload', warn);
  try { const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }; wake = (await nav.wakeLock?.request('screen')) || null; } catch { /* sin wake lock */ }
}

/** «¿Qué me preguntaron?»: cierra ya el trozo actual y revisa al momento si hubo una pregunta. */
export function askNow() {
  if (st.phase !== 'live') return;
  set({ asking: true, notice: '' });
  cut(true);
  window.setTimeout(() => { if (st.asking && !working && !detecting) void runDetect(true); }, 6000); // por si el trozo salió en silencio
}

export function retryFailed() { if (!dead.length) return; queue.push(...dead); dead = []; set({ failed: 0, queued: queue.length }); void pump(); }
export function dismissAlert(id: string) { set({ alerts: st.alerts.filter((a) => a.id !== id) }); }

/** Termina la clase, espera a que se envíe lo pendiente y arma la explicación. */
export async function stopLive() {
  if (st.phase !== 'live') return;
  const id = st.id!;
  set({ phase: 'ending', err: '', speaking: false });
  window.clearInterval(meterTimer);
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
