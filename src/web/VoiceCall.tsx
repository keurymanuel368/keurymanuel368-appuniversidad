import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { haptic } from './components';

type Phase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused';
type Turn = { me: boolean; text: string };

// Reconocimiento de voz del navegador (Chrome/Android y Safari/iPhone)
type SRResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SRInstance = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: SRResultEvent) => void) | null; onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null; onspeechstart: (() => void) | null;
};
const srCtor = (): (new () => SRInstance) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => SRInstance; webkitSpeechRecognition?: new () => SRInstance };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};

export { speakable } from './speech';
import { speakable } from './speech';

/**
 * La voz más natural que tenga el teléfono en español: primero las "neuronales"/en línea (suenan humanas),
 * luego el acento más cercano al dominicano.
 */
let voiceCache: SpeechSynthesisVoice | null | undefined;
export function bestVoice(): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  if (voiceCache) return voiceCache;
  const es = synth.getVoices().filter((v) => /^es/i.test(v.lang));
  if (!es.length) return null;
  const accent = ['es-DO', 'es-US', 'es-PR', 'es-419', 'es-MX', 'es-CO', 'es-VE', 'es-ES'];
  const score = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.replace('_', '-');
    const a = accent.indexOf(lang);
    return (/natural|neural|online|enhanced|premium|wavenet/i.test(v.name) ? 100 : 0) + (!v.localService ? 20 : 0)
      + (/google/i.test(v.name) ? 10 : 0) + (a >= 0 ? 30 - a * 3 : 0);
  };
  voiceCache = es.sort((x, y) => score(y) - score(x))[0];
  return voiceCache;
}
/** Una frase con la voz del teléfono, a ritmo de conversación. */
export function utterance(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice();
  u.voice = v; u.lang = v?.lang || 'es-US'; u.rate = 1.04; u.pitch = 1.0;
  return u;
}

/**
 * Llamada de voz con Rumbo (como el modo voz de ChatGPT):
 * escucha → detecta que te callaste → transcribe y responde → habla frase por frase → vuelve a escuchar.
 */
export function VoiceCall({ voice, onClose }: { voice: string; onClose: (changed: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);
  const phaseRef = useRef<Phase>('starting');
  const useDevice = useRef(voice === 'device');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const changed = useRef(false);
  const sr = useRef<SRInstance | null>(null);
  // El dictado del teléfono suena ("bip") cada vez que arranca: se usa el micrófono abierto y en silencio.
  const useSR = useRef(false);
  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // ---------- Hablar (frase por frase, en orden) ----------
  function deviceSay(text: string): Promise<void> {
    return new Promise((res) => {
      const synth = window.speechSynthesis;
      if (!synth) { res(); return; }
      const u = utterance(text);
      u.onend = () => res(); u.onerror = () => res();
      synth.speak(u);
    });
  }
  function fetchAudio(text: string): Promise<string | null> {
    if (useDevice.current) return Promise.resolve(null);
    return fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }), credentials: 'same-origin' })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : (useDevice.current = true, null)))
      .catch(() => { useDevice.current = true; return null; });
  }
  function playUrl(url: string): Promise<void> {
    return new Promise((res) => {
      const a = player.current!;
      a.onended = () => { URL.revokeObjectURL(url); res(); };
      a.onerror = () => res();
      a.src = url;
      a.play().catch(() => res());
    });
  }
  /** Pide el audio de la frase ya (en paralelo) y lo reproduce cuando le toque. */
  function say(sentence: string) {
    const t = speakable(sentence);
    if (!t || !alive.current || phaseRef.current === 'paused') return;
    const synth = window.speechSynthesis;
    if (useDevice.current && synth) {
      // Voz del teléfono: cada frase entra directo a la cola del sistema, así no hay silencios entre frases.
      const u = utterance(t);
      const ended = new Promise<void>((res) => { u.onend = () => res(); u.onerror = () => res(); });
      u.onstart = () => { if (alive.current && phaseRef.current !== 'paused') setP('speaking'); };
      synth.speak(u);
      queue.current = queue.current.then(() => ended);
      return;
    }
    const audio = fetchAudio(t);
    queue.current = queue.current.then(async () => {
      if (!alive.current || phaseRef.current === 'paused') return;
      setP('speaking');
      const url = await audio;
      if (!alive.current || (phaseRef.current as Phase) === 'paused') return;
      if (url) await playUrl(url); else await deviceSay(t);
    });
  }
  function stopTalking() {
    player.current?.pause();
    window.speechSynthesis?.cancel();
    queue.current = Promise.resolve();
  }

  // ---------- Escuchar ----------
  // 1) Reconocimiento de voz del teléfono (gratis, en vivo y detecta solo cuando te callas).
  // 2) Si no existe o falla: grabación + detección de silencio + Whisper en el servidor.
  function listen() {
    if (!alive.current) return;
    setP('listening'); setHeard(''); setReply(''); setError('');
    if (useSR.current) listenSR(); else void listenRec();
  }

  function listenSR() {
    const Ctor = srCtor();
    if (!Ctor) { useSR.current = false; void listenRec(); return; }
    const rec = new Ctor();
    rec.lang = 'es-DO'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '', said = false, failed = false;
    const pulse = setInterval(() => setLevel((l) => (said ? 0.35 + Math.random() * 0.5 : Math.max(0, l * 0.6))), 120);
    rec.onspeechstart = () => { said = true; haptic(8); };
    rec.onresult = (e: SRResultEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      said = true;
      setHeard((finalText + ' ' + interim).trim());
    };
    rec.onerror = (e: { error: string }) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      failed = true;
      // Sin permiso del servicio, sin red para el dictado o idioma no soportado: se usa Whisper.
      useSR.current = false;
    };
    rec.onend = () => {
      clearInterval(pulse); setLevel(0);
      if (sr.current !== rec) return;
      sr.current = null;
      if (!alive.current || phaseRef.current !== 'listening') return;
      const text = finalText.trim();
      if (text) { void answerText(text); return; }
      if (failed) { void listenRec(); return; }
      setTimeout(() => { if (alive.current && phaseRef.current === 'listening') listenSR(); }, 250); // silencio: sigue escuchando
    };
    sr.current = rec;
    try { rec.start(); } catch { useSR.current = false; void listenRec(); }
  }

  async function listenRec() {
    if (!stream.current) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        stream.current = s;
        const c = new AudioContext(); ctx.current = c;
        const an = c.createAnalyser(); an.fftSize = 1024; analyser.current = an;
        c.createMediaStreamSource(s).connect(an);
      } catch {
        setError('Necesito permiso para usar el micrófono.'); setP('paused'); return;
      }
    }
    if (!alive.current || phaseRef.current !== 'listening') return;
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported(x)) || '';
    const mr = new MediaRecorder(stream.current!, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.current = mr;
    let spoke = false, lastVoice = 0, noise = 0.012, samples = 0;
    const t0 = performance.now();
    const data = new Uint8Array(analyser.current!.fftSize);
    mr.onstop = () => { if (spoke && alive.current && phaseRef.current !== 'paused') void answerAudio(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); };
    mr.start(200);
    const tick = () => {
      if (!alive.current || recorder.current !== mr || mr.state !== 'recording') return;
      analyser.current!.getByteTimeDomainData(data);
      let sum = 0; for (const v of data) sum += (v - 128) ** 2;
      const rms = Math.sqrt(sum / data.length) / 128;
      setLevel(Math.min(1, rms * 9));
      const now = performance.now();
      if (now - t0 < 350) { noise = (noise * samples + rms) / ++samples; } // ruido de fondo
      const threshold = Math.max(0.02, noise * 2.6);
      if (rms > threshold) { if (!spoke) haptic(8); spoke = true; lastVoice = now; }
      // 10 s sin que digas nada → se pone en pausa (sin sonidos).
      if (!spoke && now - t0 > 10000) { mr.onstop = null; mr.stop(); recorder.current = null; setLevel(0); setP('paused'); setError(''); haptic(10); return; }
      // Te callaste ~0.9 s después de hablar → se envía. Máximo 40 s por turno.
      if ((spoke && now - lastVoice > 900) || now - t0 > 40000) { mr.stop(); recorder.current = null; setLevel(0); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- Responder ----------
  function answerText(text: string) {
    setHeard(text);
    return consume(fetch('/api/assistant/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: true }), credentials: 'same-origin' }), text);
  }
  function answerAudio(blob: Blob) {
    return consume(fetch('/api/assistant/voice-stream', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' }, credentials: 'same-origin' }), '');
  }

  async function consume(request: Promise<Response>, said: string) {
    setP('thinking'); haptic(12);
    let acc = '', spokenUpTo = 0;
    let chunks = 0;
    const flushSentences = (final = false) => {
      // Frases completas y largas = voz fluida (cada corte es una pausa). Solo el primer trozo puede cortarse
      // en una coma para que la voz arranque rápido. No confunde "a. m." ni decimales como "92.5".
      const ends = /(?<!\b[ap]\.?\s?m|\b[ap]|\d)[.!?…]+["»)]?\s/gi;
      const rest = acc.slice(spokenUpTo);
      let cut = -1;
      for (let m: RegExpExecArray | null; (m = ends.exec(rest));) cut = m.index + m[0].length; // la última frase completa
      if (cut < 0 && chunks === 0 && rest.length > 60) { const c = rest.slice(30).search(/[,;:]\s/); if (c >= 0) cut = 30 + c + 2; }
      if (cut > 0) { say(rest.slice(0, cut)); spokenUpTo += cut; chunks++; }
      if (final && acc.slice(spokenUpTo).trim()) { say(acc.slice(spokenUpTo)); spokenUpTo = acc.length; }
    };
    try {
      const res = await request;
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', you = said;
      for (;;) {
        const { value, done } = await reader.read();
        if (done || !alive.current) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() || '';
        for (const p of parts) {
          const m = p.match(/^data:\s*([\s\S]*)$/m);
          if (!m) continue;
          const ev = JSON.parse(m[1]) as { t: string; d?: string; text?: string; done?: string[]; empty?: boolean };
          if (ev.t === 'heard') { you = ev.d || ''; setHeard(you); }
          if (ev.t === 'delta') { acc += ev.d || ''; setReply(acc); flushSentences(); }
          if (ev.t === 'done') {
            if (ev.empty) { if (alive.current) listen(); return; }
            changed.current = true;
            if (!acc && ev.text) { acc = ev.text.split('\n\n')[0]; setReply(acc); }
            flushSentences(true);
            if (ev.done?.length) { haptic(20); window.dispatchEvent(new Event('rumbo:badges')); }
            setTurns((t) => [...t, { me: true, text: you }, { me: false, text: ev.text || acc }].slice(-6));
          }
        }
      }
      await queue.current; // termina de hablar…
      if (alive.current && phaseRef.current !== 'paused') listen(); // …y vuelve a escuchar
    } catch (e) {
      setError((e as Error).message);
      if (alive.current) setTimeout(() => alive.current && phaseRef.current !== 'paused' && listen(), 1500);
    }
  }

  // ---------- Inicio / fin ----------
  useEffect(() => {
    alive.current = true;
    const a = new Audio(); a.setAttribute('playsinline', ''); player.current = a;
    a.play().catch(() => {}); // desbloquea el audio en iPhone (viene de un toque)
    window.speechSynthesis?.getVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { voiceCache = undefined; };
    // Mantiene la pantalla encendida durante la llamada
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
    listen();
    return () => {
      alive.current = false;
      if (sr.current) { const r = sr.current; sr.current = null; r.onend = null; r.abort(); }
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTalking();
      stream.current?.getTracks().forEach((t) => t.stop());
      ctx.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tocar la esfera: si habla, lo interrumpes y te escucha; si escucha, envía ya; si está en pausa, sigue. */
  function tapOrb() {
    haptic(10);
    if (phase === 'speaking') { stopTalking(); listen(); return; }
    if (phase === 'listening') { if (sr.current) { sr.current.stop(); return; } if (recorder.current) { recorder.current.stop(); recorder.current = null; } return; }
    if (phase === 'paused') { listen(); }
  }
  function togglePause() {
    haptic(8);
    if (phase === 'paused') { listen(); return; }
    setP('paused'); stopTalking();
    const mr = recorder.current; recorder.current = null; if (mr?.state === 'recording') { mr.onstop = null; mr.stop(); }
    if (sr.current) { const r = sr.current; sr.current = null; r.onend = null; r.abort(); }
    setLevel(0);
  }

  const label = { starting: 'Conectando…', listening: 'Te escucho…', thinking: 'Pensando…', speaking: 'Rumbo está hablando', paused: 'En pausa' }[phase];
  const sub = { starting: '', listening: 'Habla normal; cuando te calles, te respondo.', thinking: heard ? `«${heard}»` : 'Un momentico…', speaking: 'Toca la esfera para interrumpir', paused: '¿Sigues ahí? Toca la esfera para seguir hablando' }[phase];

  return createPortal(
    <div className={`call call-${phase}`} role="dialog" aria-label="Conversación por voz">
      <header className="call-top">
        <span className="call-brand"><Icon name="spark" size={16} />Rumbo · voz</span>
      </header>
      <div className="call-transcript" aria-live="polite">
        {turns.slice(-4).map((t, i) => <p key={i} className={t.me ? 'me' : 'bot'}>{t.text}</p>)}
        {phase !== 'listening' && heard && !turns.some((t) => t.text === heard) && <p className="me">{heard}</p>}
        {reply && phase !== 'listening' && !turns.some((t) => !t.me && t.text.startsWith(reply.slice(0, 20))) && <p className="bot live">{reply}</p>}
      </div>
      <button className="call-orb" onClick={tapOrb} style={{ ['--lv' as string]: level }} aria-label={label}>
        <span className="co-ring r1" /><span className="co-ring r2" /><span className="co-ring r3" />
        <span className="co-core">
          {phase === 'thinking' ? <span className="co-dots"><i /><i /><i /></span>
            : phase === 'speaking' ? <span className="eq big"><i /><i /><i /><i /><i /></span>
            : <Icon name={phase === 'paused' ? 'play' : 'mic'} size={40} />}
        </span>
      </button>
      <div className="call-status"><b>{label}</b><span>{error ? `⚠️ ${error}` : sub}</span></div>
      <div className="call-actions">
        <button className="call-btn" onClick={togglePause} aria-label={phase === 'paused' ? 'Seguir' : 'Pausar'}><Icon name={phase === 'paused' ? 'mic' : 'mute'} size={24} /></button>
        <button className="call-btn end" onClick={() => onClose(changed.current)} aria-label="Terminar"><Icon name="x" size={28} /></button>
      </div>
    </div>,
    document.body,
  );
}
