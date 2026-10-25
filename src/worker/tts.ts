// Voz del asistente. Cadena de motores, todos gratis:
//   1) ElevenLabs (voz natural) si hay ELEVENLABS_API_KEY y queda cuota del mes (plan gratis = 10 000 créditos/mes).
//   2) MeloTTS en Workers AI (neural, español, casi sin costo de neuronas) con tope diario.
//   3) La voz del teléfono (la app lo hace sola cuando este endpoint contesta con fallback).
import type { Env } from './env';
import { getSettings, setSetting } from './db';

const EL_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', hint: 'Femenina · cálida y clara' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', hint: 'Femenina · joven y animada' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', hint: 'Masculina · natural y relajada' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', hint: 'Masculina · serena' },
];
const EL_MONTHLY_CAP = 9000;   // el plan gratis da 10 000 créditos; se deja margen
const EL_MAX_CHARS = 450;      // respuestas largas se leen con la voz del teléfono para cuidar la cuota
const MELO_DAILY_CAP = 9000;

const todayKey = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const monthKey = () => todayKey().slice(0, 7);

export type TtsStatus = { elevenlabs: { connected: boolean; used: number; cap: number; voice: string; voices: typeof EL_VOICES }; melo: { used: number; cap: number } };

export async function ttsStatus(env: Env): Promise<TtsStatus> {
  const s = await getSettings(env);
  return {
    elevenlabs: { connected: !!env.ELEVENLABS_API_KEY, used: s.el_month === monthKey() ? Number(s.el_chars || 0) : 0, cap: EL_MONTHLY_CAP, voice: s.el_voice || EL_VOICES[0].id, voices: EL_VOICES },
    melo: { used: s.melo_day === todayKey() ? Number(s.melo_chars || 0) : 0, cap: MELO_DAILY_CAP },
  };
}

export type TtsResult = { ok: true; body: BodyInit; type: string; engine: 'elevenlabs' | 'melotts' } | { ok: false; error: string };

export async function synthesize(env: Env, raw: string): Promise<TtsResult> {
  const t = raw.replace(/[*_~#•]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!t) return { ok: false, error: 'Sin texto' };
  const s = await getSettings(env);
  const errors: string[] = [];

  // 1) ElevenLabs
  if (env.ELEVENLABS_API_KEY && t.length <= EL_MAX_CHARS && Number(s.el_off_until || 0) < Date.now() / 1000) {
    const used = s.el_month === monthKey() ? Number(s.el_chars || 0) : 0;
    if (used + t.length <= EL_MONTHLY_CAP) {
      try {
        const voice = s.el_voice || EL_VOICES[0].id;
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
          method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text: t, model_id: 'eleven_flash_v2_5', language_code: 'es', voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
        });
        if (r.ok && /audio/.test(r.headers.get('content-type') || '')) {
          await setSetting(env, 'el_month', monthKey());
          await setSetting(env, 'el_chars', String(used + t.length));
          return { ok: true, body: r.body as BodyInit, type: 'audio/mpeg', engine: 'elevenlabs' };
        }
        const msg = (await r.text()).slice(0, 140);
        errors.push(`ElevenLabs ${r.status}: ${msg}`);
        // Clave inválida, cuota agotada o límite de uso: se deja de intentar un rato
        if ([401, 402, 403, 429].includes(r.status)) await setSetting(env, 'el_off_until', String(Math.floor(Date.now() / 1000) + 6 * 3600));
      } catch (e) { errors.push('ElevenLabs: ' + (e as Error).message); }
    }
  }

  // 2) MeloTTS (Workers AI)
  const mUsed = s.melo_day === todayKey() ? Number(s.melo_chars || 0) : 0;
  if (mUsed + t.length <= MELO_DAILY_CAP) {
    try {
      const out = await env.AI.run('@cf/myshell-ai/melotts' as Parameters<Ai['run']>[0], { prompt: t, lang: 'es' } as never) as unknown as { audio?: string } | Uint8Array | ReadableStream;
      let bytes: Uint8Array | null = null;
      if (out && typeof (out as { audio?: string }).audio === 'string') bytes = Uint8Array.from(atob((out as { audio: string }).audio), (ch) => ch.charCodeAt(0));
      else if (out instanceof Uint8Array) bytes = out;
      if (bytes && bytes.length > 500) {
        await setSetting(env, 'melo_day', todayKey());
        await setSetting(env, 'melo_chars', String(mUsed + t.length));
        return { ok: true, body: bytes as BodyInit, type: bytes[0] === 0x52 && bytes[1] === 0x49 ? 'audio/wav' : 'audio/mpeg', engine: 'melotts' };
      }
      errors.push('MeloTTS: audio vacío');
    } catch (e) { errors.push('MeloTTS: ' + (e as Error).message.slice(0, 140)); }
  } else errors.push('Se acabó la voz neural de hoy');
  return { ok: false, error: errors.join(' · ') || 'Sin voz disponible' };
}
