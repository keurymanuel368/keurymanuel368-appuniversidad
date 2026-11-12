// Voz del asistente. Cadena de motores (cada uno con su tope; al agotarse pasa al siguiente y al final a la voz gratis del teléfono):
//   0) Azure Speech (voces dominicanas neurales; plan gratis F0 = 500 000 letras al mes) si hay AZURE_SPEECH_KEY.
//   1) ElevenLabs (voz natural) si hay ELEVENLABS_API_KEY y queda cuota del mes (plan gratis = 10 000 créditos/mes).
//   2) MeloTTS en Workers AI (neural, español, casi sin costo de neuronas) con tope diario.
//   3) La voz del teléfono (la app lo hace sola cuando este endpoint contesta con fallback).
import type { Env } from './env';
import { getSettings, setSetting } from './db';

const EL_VOICES = [
  { id: '8mBRP99B2Ng2QwsJMFQl', name: 'El Faraón', hint: 'Masculina · grave, de narrador' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', hint: 'Femenina · cálida y clara' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', hint: 'Femenina · joven y animada' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', hint: 'Masculina · natural y relajada' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', hint: 'Masculina · serena' },
];
const AZ_VOICES = [
  { id: 'es-DO-RamonaNeural', name: 'Ramona', hint: 'Femenina · acento dominicano' },
  { id: 'es-DO-EmilioNeural', name: 'Emilio', hint: 'Masculina · acento dominicano' },
  { id: 'es-MX-DaliaNeural', name: 'Dalia', hint: 'Femenina · mexicana, muy clara' },
  { id: 'es-MX-JorgeNeural', name: 'Jorge', hint: 'Masculina · mexicana, serena' },
];
const AZ_MONTHLY_CAP = 400000;  // el plan gratis da 500 000 letras; se deja margen
const AZ_MAX_CHARS = 900;
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const EL_MONTHLY_CAP = 9000;   // el plan gratis da 10 000 créditos; se deja margen
const EL_MAX_CHARS = 450;      // respuestas largas se leen con la voz del teléfono para cuidar la cuota
const MELO_DAILY_CAP = 9000;

const todayKey = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const monthKey = () => todayKey().slice(0, 7);

export type TtsStatus = { azure: { connected: boolean; used: number; cap: number; voice: string; voices: typeof AZ_VOICES }; elevenlabs: { connected: boolean; used: number; cap: number; voice: string; voices: typeof EL_VOICES }; melo: { used: number; cap: number } };

export async function ttsStatus(env: Env): Promise<TtsStatus> {
  const s = await getSettings(env);
  return {
    azure: { connected: !!env.AZURE_SPEECH_KEY, used: s.az_month === monthKey() ? Number(s.az_chars || 0) : 0, cap: AZ_MONTHLY_CAP, voice: s.az_voice || AZ_VOICES[0].id, voices: AZ_VOICES },
    elevenlabs: { connected: !!env.ELEVENLABS_API_KEY, used: s.el_month === monthKey() ? Number(s.el_chars || 0) : 0, cap: EL_MONTHLY_CAP, voice: s.el_voice || EL_VOICES[0].id, voices: EL_VOICES },
    melo: { used: s.melo_day === todayKey() ? Number(s.melo_chars || 0) : 0, cap: MELO_DAILY_CAP },
  };
}

export type TtsResult = { ok: true; body: BodyInit; type: string; engine: 'azure' | 'elevenlabs' | 'melotts' } | { ok: false; error: string };

export async function synthesize(env: Env, raw: string): Promise<TtsResult> {
  const t = raw.replace(/[*_~#•]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!t) return { ok: false, error: 'Sin texto' };
  const s = await getSettings(env);
  const errors: string[] = [];

  // 0) Azure Speech (voces dominicanas)
  if (env.AZURE_SPEECH_KEY && t.length <= AZ_MAX_CHARS && Number(s.az_off_until || 0) < Date.now() / 1000) {
    const used = s.az_month === monthKey() ? Number(s.az_chars || 0) : 0;
    if (used + t.length <= AZ_MONTHLY_CAP) {
      try {
        const voice = s.az_voice || AZ_VOICES[0].id;
        const region = (env.AZURE_SPEECH_REGION || 'eastus').trim();
        const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'Rumbo' },
          body: `<speak version='1.0' xml:lang='${voice.slice(0, 5)}'><voice name='${voice}'><prosody rate='+4%'>${xml(t)}</prosody></voice></speak>`,
        });
        if (r.ok && /audio/.test(r.headers.get('content-type') || '')) {
          await setSetting(env, 'az_month', monthKey());
          await setSetting(env, 'az_chars', String(used + t.length));
          return { ok: true, body: r.body as BodyInit, type: 'audio/mpeg', engine: 'azure' };
        }
        errors.push(`Azure ${r.status}: ${(await r.text()).slice(0, 140)}`);
        // Clave inválida, cuota agotada o límite de uso: se deja de intentar un rato
        if ([401, 403, 429].includes(r.status)) await setSetting(env, 'az_off_until', String(Math.floor(Date.now() / 1000) + 6 * 3600));
      } catch (e) { errors.push('Azure: ' + (e as Error).message); }
    }
  }

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
