import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Modal, RichText, haptic, toast } from '../components';
import { useLoad } from '../components';
import { Icon } from '../icons';
import { Mascot } from '../Mascot';
import { VoiceCall, speakable, utterance } from '../VoiceCall';

type Msg = { id: number; direction: 'in' | 'out'; channel: string; body: string; created_at: number };
type Line = {
  key: string; me: boolean; text: string; say?: string;
  voice?: { url?: string; secs: number; status: 'transcribing' | 'ok' | 'error' };
  streaming?: boolean;
};

const IDEAS = [
  { icon: 'trend', text: '¿Cómo voy en mis asignaturas?' },
  { icon: 'tasks', text: '¿Qué me conviene entregar primero?' },
  { icon: 'calendar', text: 'Ponme el foro de tecno pa’ mañana en la tarde' },
  { icon: 'clock', text: 'Recuérdame el viernes a las 7 estudiar lógica' },
  { icon: 'wallet', text: '¿Cuándo tengo que pagar la cuota?' },
  { icon: 'bell', text: '¿Hay algún aviso o evento nuevo?' },
];
const QUICK = ['hoy', 'tareas', 'notas', 'entregadas', 'pagos', 'sincronizar'];
const VOICES = [
  { id: 'rumbo', name: 'Voz de Rumbo (neural)', hint: 'Natural · gratis · usa ElevenLabs si la conectas' },
  { id: 'device', name: 'Voz del teléfono', hint: 'Gratis, ilimitada y rápida' },
];

const store = {
  get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const uid = () => Math.random().toString(36).slice(2);

// ---------- Voz ----------
let current: HTMLAudioElement | null = null;
function stopSpeaking() { current?.pause(); current = null; window.speechSynthesis?.cancel(); }
function deviceSpeak(text: string, onEnd: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) { onEnd(); return; }
  const u = utterance(text);
  u.onend = onEnd; u.onerror = onEnd;
  synth.speak(u);
}
async function speak(text: string, voice: string, onEnd: () => void) {
  stopSpeaking();
  const t = speakable(text);
  if (!t) { onEnd(); return; }
  if (voice === 'device') { deviceSpeak(t, onEnd); return; }
  try {
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, voice }), credentials: 'same-origin' });
    if (!res.ok) throw new Error('sin voz premium');
    const url = URL.createObjectURL(await res.blob());
    const a = new Audio(url);
    current = a;
    a.onended = () => { URL.revokeObjectURL(url); onEnd(); };
    a.onerror = () => { onEnd(); };
    await a.play();
  } catch {
    deviceSpeak(t, onEnd); // si se acabó la cuota del día o no hay red: la voz del teléfono
  }
}

export function Asistente() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<{ start: number } | null>(null);
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [autoVoice, setAutoVoice] = useState(() => store.get('rumbo-autovoz', '1') === '1');
  const [voice, setVoice] = useState(() => { const v = store.get('rumbo-voz2', 'rumbo'); return v === 'device' ? 'device' : 'rumbo'; });
  const [sheet, setSheet] = useState<'' | 'voz' | 'memoria'>('');
  const [call, setCall] = useState(() => /llamada/.test(location.hash));
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const cancelled = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Msg[]>('/messages?channel=app').then((m) => setLines(m.map((x) => ({ key: String(x.id), me: x.direction === 'in', text: x.body, voice: x.direction === 'in' && x.body.startsWith('🎤') ? { secs: 0, status: 'ok' } : undefined }))))
      .catch(() => setLines([]));
    window.speechSynthesis?.getVoices();
    return () => { stopSpeaking(); };
  }, []);
  useEffect(() => { if (lines && lines.length) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [lines?.length, lines?.[lines.length - 1]?.text.length]);
  useEffect(() => { if (!rec) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [rec]);

  const patch = (key: string, p: Partial<Line>) => setLines((l) => (l || []).map((x) => (x.key === key ? { ...x, ...p } : x)));

  function play(key: string, textToSay: string) {
    if (speaking === key) { stopSpeaking(); setSpeaking(null); return; }
    setSpeaking(key);
    void speak(textToSay, voice, () => setSpeaking((s) => (s === key ? null : s)));
  }

  /** Envía un mensaje y va mostrando la respuesta mientras se genera. */
  async function ask(msg: string, viaVoice = false) {
    const botKey = uid();
    setLines((l) => [...(l || []), { key: botKey, me: false, text: '', streaming: true }]);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }), credentials: 'same-origin' });
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', acc = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const p of parts) {
          const m = p.match(/^data:\s*([\s\S]*)$/m);
          if (!m) continue;
          const ev = JSON.parse(m[1]) as { t: string; d?: string; text?: string; say?: string; done?: string[] };
          if (ev.t === 'delta') { acc += ev.d || ''; patch(botKey, { text: acc }); }
          if (ev.t === 'done') {
            patch(botKey, { text: ev.text || acc, say: ev.say, streaming: false });
            if (ev.done?.length) { haptic(15); window.dispatchEvent(new Event('rumbo:badges')); }
            if (viaVoice || autoVoice) { setSpeaking(botKey); void speak(ev.say || ev.text || acc, voice, () => setSpeaking((s) => (s === botKey ? null : s))); }
          }
        }
      }
    } catch (e) {
      patch(botKey, { text: '⚠️ No pude responder: ' + (e as Error).message, streaming: false });
    }
    setBusy(false);
  }

  function send(t = text) {
    const msg = t.trim();
    if (!msg || busy) return;
    haptic(8); stopSpeaking(); setSpeaking(null);
    setLines((l) => [...(l || []), { key: uid(), me: true, text: msg }]);
    setText('');
    void ask(msg);
  }

  // ---------- Grabación ----------
  async function startRec() {
    if (busy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Este navegador no permite grabar audio', 'err'); return; }
    try {
      stopSpeaking(); setSpeaking(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported(x)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = []; cancelled.current = false;
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      const start = Date.now();
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.current?.close().catch(() => {}); audioCtx.current = null;
        if (!cancelled.current) void sendVoice(new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }), (Date.now() - start) / 1000);
      };
      // Nivel del micrófono para animar la esfera
      try {
        const ctx = new AudioContext(); audioCtx.current = ctx;
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const data = new Uint8Array(an.fftSize);
        const tick = () => { if (!audioCtx.current) return; an.getByteTimeDomainData(data); let sum = 0; for (const v of data) sum += (v - 128) ** 2; setLevel(Math.min(1, Math.sqrt(sum / data.length) / 40)); requestAnimationFrame(tick); };
        tick();
      } catch { /* sin animación de nivel */ }
      mr.start(250);
      recorder.current = mr;
      setRec({ start }); setNow(start);
      haptic(20);
    } catch {
      toast('Necesito permiso para usar el micrófono', 'err');
    }
  }
  function stopRec(cancel = false) {
    const mr = recorder.current;
    if (!mr) return;
    cancelled.current = cancel;
    mr.stop();
    recorder.current = null;
    setRec(null); setLevel(0);
    haptic(cancel ? 6 : 14);
    if (cancel) toast('Nota de voz cancelada');
  }
  async function sendVoice(blob: Blob, secs: number) {
    if (blob.size < 1500 || secs < 0.8) { toast('Muy corto: habla un poquito más', 'err'); return; }
    const key = uid();
    setLines((l) => [...(l || []), { key, me: true, text: '', voice: { url: URL.createObjectURL(blob), secs, status: 'transcribing' } }]);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant/transcribe', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' }, credentials: 'same-origin' });
      const r = (await res.json()) as { heard?: string; error?: string };
      if (!res.ok || r.error) throw new Error(r.error || `Error ${res.status}`);
      const heard = (r.heard || '').trim();
      setLines((l) => (l || []).map((x) => (x.key === key ? { ...x, text: heard ? `🎤 ${heard}` : '🎤 (no se entendió)', voice: { ...x.voice!, status: heard ? 'ok' : 'error' } } : x)));
      setBusy(false);
      if (heard) await ask(heard, true);
      else setLines((l) => [...(l || []), { key: uid(), me: false, text: 'No logré entender el audio 😅. ¿Me lo repites un poco más cerca del micrófono?' }]);
    } catch (e) {
      setLines((l) => (l || []).map((x) => (x.key === key ? { ...x, voice: { ...x.voice!, status: 'error' } } : x)));
      setLines((l) => [...(l || []), { key: uid(), me: false, text: '⚠️ No pude procesar el audio: ' + (e as Error).message }]);
      setBusy(false);
    }
  }

  async function reset() {
    haptic(8); stopSpeaking();
    await api('/assistant/reset', { method: 'POST' }).catch(() => {});
    setLines([]);
    toast('Conversación nueva (sigo recordando lo importante)');
  }

  const secs = rec ? Math.floor((now - rec.start) / 1000) : 0;
  const empty = lines !== null && lines.length === 0;

  return (
    <div className="ai-screen">
      <header className="ai-top">
        <span className="ai-mascot"><Mascot mood={busy || speaking ? 'talk' : 'feliz'} size={40} /></span>
        <div className="ai-top-copy"><b>Rumbo <i className="ai-badge">IA</i></b><span><i className="online" />{busy ? 'Escribiendo…' : speaking ? 'Hablando…' : 'Tu pana de la uni'}</span></div>
        <button className={`ai-icon ${autoVoice ? 'on' : ''}`} onClick={() => { const v = !autoVoice; setAutoVoice(v); store.set('rumbo-autovoz', v ? '1' : '0'); if (!v) { stopSpeaking(); setSpeaking(null); } haptic(6); toast(v ? 'Te respondo con voz 🔊' : 'Respuestas sin voz'); }} aria-label={autoVoice ? 'Desactivar voz' : 'Activar voz'} aria-pressed={autoVoice}>
          <Icon name={autoVoice ? 'volume' : 'mute'} size={20} />
        </button>
        <button className="ai-icon" onClick={() => setSheet('voz')} aria-label="Elegir voz"><Icon name="gear" size={19} /></button>
        <button className="ai-icon" onClick={() => setSheet('memoria')} aria-label="Memoria del asistente"><Icon name="book" size={19} /></button>
        {lines && lines.length > 0 && <button className="ai-icon" onClick={reset} aria-label="Conversación nueva"><Icon name="refresh" size={19} /></button>}
      </header>

      <div className="ai-chat">
        {lines === null && <div className="sk" style={{ height: 80, borderRadius: 18 }} />}
        {empty && (
          <div className="ai-hello">
            <Mascot mood="feliz" size={92} wave className="ai-hello-mascot" />
            <b>Klk 👋 ¿en qué te ayudo?</b>
            <span>Pregúntame lo que sea o pídeme que haga algo. Háblame normal, como a un pana. Toca el micrófono para mandarme una nota de voz.</span>
            <div className="ideas">{IDEAS.map((x, i) => <button key={x.text} className="idea" data-i={i % 6} onClick={() => send(x.text)}><span className="idea-ic"><Icon name={x.icon} size={17} /></span><span>{x.text}</span></button>)}</div>
          </div>
        )}
        {lines?.map((m) => m.me ? (
          m.voice ? (
            <div key={m.key} className="bubble me voice-msg">
              <VoicePill url={m.voice.url} secs={m.voice.secs} />
              <span className="voice-text">{m.voice.status === 'transcribing' ? <><i className="mini-spin" />Transcribiendo…</> : m.text.replace(/^🎤\s*/, '')}</span>
            </div>
          ) : <div key={m.key} className="bubble me">{m.text}</div>
        ) : (
          <div key={m.key} className={`bubble bot ${m.streaming ? 'streaming' : ''}`}>
            {m.text ? <RichText text={m.text} /> : <span className="typing-dots"><span /><span /><span /></span>}
            {m.streaming && m.text && <i className="caret" />}
            {!m.streaming && m.text && (
              <button className={`listen ${speaking === m.key ? 'on' : ''}`} onClick={() => play(m.key, m.say || m.text)} aria-label={speaking === m.key ? 'Detener' : 'Escuchar'}>
                {speaking === m.key ? <><span className="eq"><i /><i /><i /><i /></span>Detener</> : <><Icon name="volume" size={14} />Escuchar</>}
              </button>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="ai-composer">
        <div className="chips scroll">{QUICK.map((q) => <button key={q} className="chip" onClick={() => send(q)} disabled={busy}>{q}</button>)}</div>
        <form className="composer-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="msg" className="sr-only">Mensaje</label>
          <input id="msg" className="input pill-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escríbele a Rumbo…" autoComplete="off" enterKeyHint="send" />
          {text.trim()
            ? <button className="send-btn" type="submit" aria-label="Enviar" disabled={busy}><Icon name="send" size={18} /></button>
            : <button className="send-btn mic big" type="button" aria-label="Hablar con Rumbo" onClick={() => { haptic(12); stopSpeaking(); setSpeaking(null); setCall(true); }} disabled={busy}><Icon name="mic" size={22} /></button>}
        </form>
      </div>

      {rec && createPortal(
        <div className="rec-sheet" role="dialog" aria-label="Grabando nota de voz">
          <span className="rec-hint">Te escucho… habla normal 🎙️</span>
          <div className="rec-orb" style={{ ['--lv' as string]: level }}>
            <span className="orb-ring r1" /><span className="orb-ring r2" /><span className="orb-ring r3" />
            <span className="orb-core"><Icon name="mic" size={38} /></span>
          </div>
          <span className="rec-clock num"><i className="rec-dot" />{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
          <div className="rec-actions">
            <button className="rec-btn cancel" onClick={() => stopRec(true)} aria-label="Cancelar"><Icon name="x" size={24} /></button>
            <button className="rec-btn send" onClick={() => stopRec()} aria-label="Enviar"><Icon name="send" size={26} /></button>
          </div>
          <span className="rec-tip">Toca ✕ para cancelar o enviar cuando termines</span>
        </div>,
        document.body,
      )}

      {call && <VoiceCall voice={voice} onClose={(changed) => {
        setCall(false);
        if (changed) api<Msg[]>('/messages?channel=app').then((m) => setLines(m.map((x) => ({ key: String(x.id), me: x.direction === 'in', text: x.body, voice: x.direction === 'in' && x.body.startsWith('🎤') ? { secs: 0, status: 'ok' } : undefined })))).catch(() => {});
      }} />}
      {sheet === 'voz' && <VoiceSheet voice={voice} onPick={(v) => { setVoice(v); store.set('rumbo-voz2', v); }} onClose={() => setSheet('')} />}
      {sheet === 'memoria' && <MemorySheet onClose={() => setSheet('')} />}
    </div>
  );
}

/** Burbuja de tu nota de voz: se puede volver a escuchar. */
function VoicePill({ url, secs }: { url?: string; secs: number }) {
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const a = useRef<HTMLAudioElement | null>(null);
  const bars = useRef(Array.from({ length: 26 }, (_, i) => 0.3 + Math.abs(Math.sin(i * 1.7 + secs)) * 0.7));
  function toggle() {
    if (!url) return;
    if (!a.current) { a.current = new Audio(url); a.current.ontimeupdate = () => setProg(a.current!.currentTime / (a.current!.duration || secs || 1)); a.current.onended = () => { setPlaying(false); setProg(0); }; }
    if (playing) { a.current.pause(); setPlaying(false); } else { void a.current.play(); setPlaying(true); }
  }
  return (
    <span className="voice-pill">
      <button onClick={toggle} disabled={!url} aria-label={playing ? 'Pausar' : 'Reproducir'}><Icon name={playing ? 'stop' : 'play'} size={16} /></button>
      <span className="vp-bars">{bars.current.map((h, i) => <i key={i} className={i / bars.current.length <= prog ? 'on' : ''} style={{ height: `${h * 100}%` }} />)}</span>
      <span className="vp-time num">{secs ? `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}` : '🎤'}</span>
    </span>
  );
}

type TtsStatus = { elevenlabs: { connected: boolean; used: number; cap: number; voice: string; voices: { id: string; name: string; hint: string }[] }; melo: { used: number; cap: number } };

function VoiceSheet({ voice, onPick, onClose }: { voice: string; onPick: (v: string) => void; onClose: () => void }) {
  const [playing, setPlaying] = useState('');
  const st = useLoad(() => api<TtsStatus>('/tts/status'));
  function preview(id: string) {
    setPlaying(id); onPick(id);
    void speak('Qué lo que, manito. Soy Rumbo. Tranquilo, que yo te ayudo con tus tareas y tus notas.', id, () => setPlaying(''));
  }
  async function pickEl(id: string) {
    await api('/settings', { method: 'PUT', body: { el_voice: id } }).catch(() => {});
    st.reload();
    setTimeout(() => preview('rumbo'), 250);
  }
  const el = st.data?.elevenlabs;
  return (
    <Modal title="Voz del asistente" onClose={() => { stopSpeaking(); onClose(); }}>
      <div className="voice-list">
        {VOICES.map((v) => (
          <button key={v.id} className={`voice-opt ${voice === v.id ? 'on' : ''}`} onClick={() => preview(v.id)}>
            <span className="vo-ic">{playing === v.id ? <span className="eq"><i /><i /><i /><i /></span> : <Icon name="volume" size={17} />}</span>
            <span className="vo-copy"><b>{v.name}</b><small>{v.hint}</small></span>
            {voice === v.id && <span className="pill blue">Elegida</span>}
          </button>
        ))}
      </div>
      <div className="vs-engine">
        <div className="vs-head"><b>ElevenLabs</b><span className={`pill ${el?.connected ? 'green' : 'gray'}`}>{el?.connected ? 'Conectada' : 'Sin conectar'}</span></div>
        {el?.connected ? (
          <>
            <div className="vs-bar"><i style={{ width: `${Math.min(100, (el.used / el.cap) * 100)}%` }} /></div>
            <small>{el.used.toLocaleString('es-DO')} de {el.cap.toLocaleString('es-DO')} letras este mes (plan gratis). Al agotarse, Rumbo sigue con la voz neural gratis.</small>
            <div className="vs-voices">
              {el.voices.map((v) => <button key={v.id} className={el.voice === v.id ? 'on' : ''} onClick={() => pickEl(v.id)}><b>{v.name}</b><small>{v.hint}</small></button>)}
            </div>
          </>
        ) : (
          <small>Voz humana de ElevenLabs, gratis: crea una cuenta en elevenlabs.io (plan gratuito, unas 10 000 letras al mes), copia tu API key y guárdala tú mismo en la terminal con <code>npx wrangler secret put ELEVENLABS_API_KEY</code>. Sin ella, Rumbo usa su voz neural gratis.</small>
        )}
      </div>
      {st.data && <small className="vs-foot">Voz neural gratis de hoy: {st.data.melo.used.toLocaleString('es-DO')} de {st.data.melo.cap.toLocaleString('es-DO')} letras.</small>}
    </Modal>
  );
}

function MemorySheet({ onClose }: { onClose: () => void }) {
  const [mem, setMem] = useState<string | null>(null);
  useEffect(() => { api<{ memory: string }>('/assistant/memory').then((r) => setMem(r.memory)).catch(() => setMem('')); }, []);
  async function save(v: string) { await api('/assistant/memory', { method: 'PUT', body: { memory: v } }); toast(v ? 'Memoria guardada' : 'Memoria borrada'); onClose(); }
  return (
    <Modal title="Lo que Rumbo recuerda de ti" onClose={onClose}>
      <p className="hint"><Icon name="book" size={16} />Rumbo guarda aquí lo importante que le cuentas (metas, preferencias, horarios) y lo recuerda siempre, aunque empieces una conversación nueva. Puedes editarlo o decirle «acuérdate de que…».</p>
      {mem === null ? <div className="sk" style={{ height: 120 }} /> : <textarea className="input mem-area" rows={8} aria-label="Lo que el asistente recuerda de ti" value={mem} onChange={(e) => setMem(e.target.value)} placeholder="Todavía no recuerda nada. Cuéntale algo: «acuérdate de que trabajo de lunes a viernes hasta las 5»." />}
      <div className="modal-actions">
        <button className="btn danger" onClick={() => save('')} aria-label="Borrar memoria"><Icon name="trash" size={18} /><span className="lbl">Borrar</span></button>
        <button className="btn primary grow-m" onClick={() => save(mem || '')}>Guardar</button>
      </div>
    </Modal>
  );
}
