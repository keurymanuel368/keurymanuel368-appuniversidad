// Notas de voz de WhatsApp → texto, con Whisper en Workers AI (incluido en el plan gratis de Cloudflare).
import type { Env } from './env';
import { GRAPH } from './notify';
import { groqTranscribe } from './llm';

const MAX_BYTES = 8 * 1024 * 1024; // ~8 minutos de nota de voz; de sobra para una pregunta

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Descarga el audio que te llegó por WhatsApp y lo transcribe en español. */
export async function transcribeWhatsAppAudio(env: Env, mediaId: string): Promise<string> {
  if (!env.AI) throw new Error('Workers AI no está activado en el Worker.');
  const auth = { Authorization: `Bearer ${env.WA_TOKEN}` };

  // 1) Meta da una URL temporal del archivo; 2) se descarga con el mismo token.
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`WhatsApp no entregó el audio (${meta.status}).`);
  const { url, file_size } = (await meta.json()) as { url?: string; file_size?: number };
  if (!url) throw new Error('WhatsApp no entregó el audio.');
  if (file_size && file_size > MAX_BYTES) throw new Error('El audio es muy largo. Prueba con uno de menos de un minuto.');
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`No pude descargar el audio (${file.status}).`);
  const audio = new Uint8Array(await file.arrayBuffer());
  if (audio.length > MAX_BYTES) throw new Error('El audio es muy largo. Prueba con uno de menos de un minuto.');

  return transcribeAudio(env, audio);
}

/** Transcribe en español un audio (OGG/Opus, MP3, WAV…) con Whisper en Workers AI. */
export async function transcribeAudio(env: Env, audio: Uint8Array, mime = 'audio/webm'): Promise<string> {
  if (audio.length > MAX_BYTES) throw new Error('El audio es muy largo. Prueba con uno de menos de un minuto.');
  // Los nombres de tus asignaturas ayudan a Whisper a escribirlos bien.
  const { results } = await env.DB.prepare('SELECT name FROM courses WHERE user_id = ? AND active = 1').bind(env.UID).all<{ name: string }>();
  const prompt = `Preguntas a Rumbo sobre la universidad UAPA: notas, tareas, foros, pagos, EVA. Asignaturas: ${results.map((r) => r.name).join(', ')}.`;
  // 1) Groq Whisper (gratis y rápido, no gasta la cuota de Cloudflare)
  const groq = await groqTranscribe(env, audio, mime, prompt).catch(() => null);
  if (groq !== null) return groq;
  // 2) Whisper en Workers AI
  if (!env.AI) throw new Error('No hay motor de transcripción configurado.');

  const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
    audio: toBase64(audio),
    task: 'transcribe',
    language: 'es',
    vad_filter: true,
    initial_prompt: prompt,
  });
  return ((out as { text?: string }).text || '').trim();
}
