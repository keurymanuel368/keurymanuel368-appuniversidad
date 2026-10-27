// Motores de IA gratis, en cadena: si uno se agota o falla, se usa el siguiente sin que lo notes.
//   1) Groq: el más rápido, gratis.                         Secreto: GROQ_API_KEY
//   2) Cerebras: muy rápido, gratis.                        Secreto: CEREBRAS_API_KEY
//   3) NVIDIA NIM: gratis (~40 por minuto).                 Secreto: NVIDIA_API_KEY
//   4) Google Gemini (Flash): gratis.                       Secreto: GEMINI_API_KEY
//   5) OpenRouter (modelos ":free"): gratis.                Secreto: OPENROUTER_API_KEY
//   6) Cloudflare Workers AI: cuota diaria del plan gratis (último recurso).
// Todos hablan el formato de OpenAI (chat/completions con streaming SSE).
//
// Cada proveedor tiene VARIOS modelos y cada modelo tiene su propio límite por minuto:
// si uno está ocupado (429), retirado (404/410) o responde vacío, se prueba el siguiente modelo y luego el siguiente proveedor.
import type { Env } from './env';
import { noteAiFailure } from './health';

export type ChatMsg = { role: string; content: string };
type Provider = { name: string; url: string; modelsUrl: string; key: string; fixed?: string; onlyFree?: boolean };

export function providers(env: Env): Provider[] {
  const list: Provider[] = [];
  if (env.GROQ_API_KEY) list.push({ name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', modelsUrl: 'https://api.groq.com/openai/v1/models', key: env.GROQ_API_KEY, fixed: env.GROQ_MODEL });
  if (env.CEREBRAS_API_KEY) list.push({ name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', modelsUrl: 'https://api.cerebras.ai/v1/models', key: env.CEREBRAS_API_KEY });
  if (env.NVIDIA_API_KEY) list.push({ name: 'NVIDIA', url: 'https://integrate.api.nvidia.com/v1/chat/completions', modelsUrl: 'https://integrate.api.nvidia.com/v1/models', key: env.NVIDIA_API_KEY, fixed: env.NVIDIA_MODEL });
  if (env.GEMINI_API_KEY) list.push({ name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models', key: env.GEMINI_API_KEY, fixed: env.GEMINI_MODEL });
  if (env.OPENROUTER_API_KEY) list.push({ name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', modelsUrl: 'https://openrouter.ai/api/v1/models', key: env.OPENROUTER_API_KEY, onlyFree: true });
  return list;
}

// Preferencia: primero modelos grandes que responden directo (sin "pensar" largo), buenos en español.
const PREFER = [
  /gpt-oss-120b/i, /kimi-k2/i, /qwen3-235b|qwen-3-235b/i, /gemini-[\d.]+-flash(?!-lite)/i, /llama-4-maverick/i, /deepseek-v3/i, /llama-3\.3-70b/i,
  /mistral-large|mistral-medium/i, /llama-4-scout/i, /llama-3\.1-405b/i,
  /qwen3-32b|qwen-3-32b|qwen3-next/i, /gemini-[\d.]+-flash-lite/i, /gpt-oss-20b/i, /gemma-3-27b/i, /llama-3\.1-70b|llama3-70b/i,
  /llama-3\.1-8b|llama3\.1-8b|llama-3\.2-3b/i,
];
const NOT_CHAT = /whisper|guard|tts|embed|rerank|vision|vl-|-vl|audio|playai|orpheus|safety|reward|parse|ocr|clip|image|retriever|compound|distill|thinking|-r1|reasoner|coder|math|nemotron-nano|preview-tts|live|translate/i;
const MAX_CANDIDATES = 6;
const MAX_TRIES_PER_PROVIDER = 3;

async function getSetting(env: Env, key: string): Promise<string> {
  return (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>())?.value || '';
}
async function putSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}

// Modelos ocupados (429) o caídos: se saltan por un rato. Vive en memoria del servidor (se reinicia solo).
const cooldown = new Map<string, number>();
const coolKey = (p: Provider, m: string) => `${p.name}|${m}`;
const isCool = (p: Provider, m: string) => (cooldown.get(coolKey(p, m)) || 0) > Date.now();

/** Ordena los modelos disponibles del mejor al peor (según PREFER) y se queda con los primeros. */
export function rankModels(ids: string[]): string[] {
  const usable = ids.filter((id) => !NOT_CHAT.test(id));
  const ranked: string[] = [];
  for (const re of PREFER) for (const id of usable) if (re.test(id) && !ranked.includes(id)) ranked.push(id);
  if (!ranked.length) ranked.push(...usable.slice(0, 3));
  return ranked.slice(0, MAX_CANDIDATES);
}

async function listModels(p: Provider): Promise<string[]> {
  try {
    const res = await fetch(p.modelsUrl, { headers: { Authorization: `Bearer ${p.key}` } });
    if (!res.ok) { console.log(`IA: ${p.name} no listó modelos (${res.status})`); return []; }
    const data = ((await res.json()) as { data?: { id: string }[] }).data || [];
    return data.map((m) => m.id.replace(/^models\//, ''))
      .filter((id) => !NOT_CHAT.test(id) && (!p.onlyFree || id.endsWith(':free')));
  } catch { return []; }
}

/** Modelos a probar con este proveedor, del mejor al peor (se guardan un día; los retirados se descartan). */
async function candidates(env: Env, p: Provider, refresh = false): Promise<string[]> {
  if (p.fixed) return [p.fixed];
  const key = `llm_models_${p.name.toLowerCase()}`;
  const bad = new Set<string>(JSON.parse((await getSetting(env, `llm_bad_${p.name.toLowerCase()}`)) || '[]') as string[]);
  if (!refresh) {
    try {
      const saved = JSON.parse((await getSetting(env, key)) || 'null') as { at: number; ids: string[] } | null;
      if (saved && Date.now() - saved.at < 86400_000 && saved.ids.some((m) => !bad.has(m))) return saved.ids.filter((m) => !bad.has(m));
    } catch { /* se vuelve a pedir */ }
  }
  const top = rankModels((await listModels(p)).filter((m) => !bad.has(m)));
  if (top.length) { await putSetting(env, key, JSON.stringify({ at: Date.now(), ids: top })); console.log(`IA: ${p.name} → ${top.join(', ')}`); }
  return top;
}

async function markBad(env: Env, p: Provider, model: string) {
  const k = `llm_bad_${p.name.toLowerCase()}`;
  const bad = JSON.parse((await getSetting(env, k)) || '[]') as string[];
  if (!bad.includes(model)) { bad.push(model); await putSetting(env, k, JSON.stringify(bad.slice(-60))); }
}

export const modelGone = (status: number, body: string) => status === 404 || status === 410 || (status === 400 && /model|not (found|supported)|does not exist|decommission/i.test(body));

/** Lee un stream SSE estilo OpenAI y devuelve solo el texto (ignora el "pensamiento" de modelos que razonan). */
async function* openAiDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const m = line.match(/^data:\s*(.*)$/);
      if (!m || m[1] === '[DONE]') continue;
      try {
        const j = JSON.parse(m[1]) as { choices?: { delta?: { content?: string } }[]; response?: string };
        const t = j.choices?.[0]?.delta?.content ?? j.response ?? '';
        if (t) yield t;
      } catch { /* trozo incompleto */ }
    }
  }
}

/** Espera el primer trozo de texto: si el modelo termina sin decir nada, se considera fallo y se prueba otro. */
async function firstThenRest(gen: AsyncGenerator<string>): Promise<AsyncGenerator<string> | null> {
  const first = await gen.next();
  if (first.done || !first.value.trim()) {
    // Puede venir un primer trozo de solo espacios: se acumula hasta tener texto real.
    let acc = first.done ? '' : first.value;
    // (con next() a mano: un "break" dentro de for-await cerraría el stream)
    for (let n = first; !n.done && !acc.trim();) { n = await gen.next(); if (!n.done) acc += n.value; }
    if (!acc.trim()) return null;
    return (async function* () { yield acc; yield* gen; })();
  }
  return (async function* () { yield first.value; yield* gen; })();
}

const WORKERS_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-4-scout-17b-16e-instruct'];

function bodyFor(p: Provider, model: string, messages: ChatMsg[], opts: { maxTokens: number; temperature: number }, stream: boolean) {
  const b: Record<string, unknown> = { model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, stream };
  // Los modelos gpt-oss "piensan" antes de responder: se les pide pensar poco para que contesten rápido y no se queden sin espacio.
  if (/gpt-oss/i.test(model) && (p.name === 'Groq' || p.name === 'Cerebras')) { b.reasoning_effort = 'low'; b.max_tokens = opts.maxTokens + 400; }
  if (/qwen3/i.test(model) && p.name === 'Groq') b.reasoning_effort = 'none';
  return b;
}

/** Intenta un modelo concreto. Devuelve el stream si arrancó a escribir, o el motivo del fallo. */
async function tryModel(env: Env, p: Provider, model: string, messages: ChatMsg[], opts: { maxTokens: number; temperature: number }): Promise<{ deltas?: AsyncGenerator<string>; error?: string }> {
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyFor(p, model, messages, opts, true)),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok && res.body) {
      const deltas = await firstThenRest(openAiDeltas(res.body));
      if (deltas) return { deltas };
      cooldown.set(coolKey(p, model), Date.now() + 5 * 60_000);
      return { error: `${p.name} ${model}: respuesta vacía` };
    }
    const body = await res.text().catch(() => '');
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 60;
      cooldown.set(coolKey(p, model), Date.now() + Math.min(wait, 3600) * 1000);
    } else if (modelGone(res.status, body) && !p.fixed) {
      await markBad(env, p, model);
    } else {
      cooldown.set(coolKey(p, model), Date.now() + 30_000);
    }
    return { error: `${p.name} ${model} ${res.status}: ${body.slice(0, 100)}` };
  } catch (e) {
    cooldown.set(coolKey(p, model), Date.now() + 30_000);
    return { error: `${p.name} ${model}: ${(e as Error).message}` };
  }
}

/**
 * Pide una respuesta en streaming probando modelo por modelo y proveedor por proveedor.
 * Solo cambia si el anterior falla ANTES de empezar a escribir (así nunca se mezclan respuestas).
 */
export async function llmStream(env: Env, messages: ChatMsg[], opts: { maxTokens: number; temperature: number }): Promise<{ engine: string; deltas: AsyncGenerator<string> }> {
  const errors: string[] = [];
  for (const p of providers(env)) {
    let list = await candidates(env, p);
    if (!list.length) list = await candidates(env, p, true);
    let tries = 0;
    for (const model of list) {
      if (tries >= MAX_TRIES_PER_PROVIDER) break;
      if (isCool(p, model)) continue;
      tries++;
      const r = await tryModel(env, p, model, messages, opts);
      if (r.deltas) return { engine: `${p.name} · ${model}`, deltas: r.deltas };
      errors.push(r.error || p.name);
    }
    if (!list.length) errors.push(`${p.name}: sin modelos disponibles`);
  }
  if (env.AI) {
    for (const model of WORKERS_MODELS) {
      try {
        const stream = (await env.AI.run(model as Parameters<Ai['run']>[0], { messages, max_tokens: opts.maxTokens, temperature: opts.temperature, stream: true } as never)) as unknown as ReadableStream<Uint8Array>;
        return { engine: 'Workers AI', deltas: openAiDeltas(stream) };
      } catch (e) {
        errors.push(`Workers AI: ${(e as Error).message}`);
      }
    }
  }
  // Todo ocupado a la vez: se espera un momento y se reintenta el modelo que se libere primero.
  const soonest = [...cooldown.entries()].filter(([, t]) => t - Date.now() < 8000).sort((a, b) => a[1] - b[1])[0];
  if (soonest) {
    const [name, model] = soonest[0].split('|');
    const p = providers(env).find((x) => x.name === name);
    if (p) {
      await new Promise((r) => setTimeout(r, Math.max(0, soonest[1] - Date.now())));
      cooldown.delete(soonest[0]);
      const r = await tryModel(env, p, model, messages, opts);
      if (r.deltas) return { engine: `${p.name} · ${model}`, deltas: r.deltas };
      errors.push(r.error || name);
    }
  }
  if (errors.length) console.log('IA sin motor disponible: ' + errors.join(' | '));
  await noteAiFailure(env, errors.slice(0, 3).join(' | '));
  throw new Error(errors.some((x) => /4006|daily free alloc|429|quota|rate/i.test(x)) ? 'cuota agotada' : errors[0] || 'No hay motores de IA configurados');
}

/** Respuesta completa (sin streaming). */
export async function llmComplete(env: Env, messages: ChatMsg[], opts: { maxTokens: number; temperature: number }): Promise<string> {
  const { deltas } = await llmStream(env, messages, opts);
  let out = '';
  for await (const d of deltas) out += d;
  return out;
}

/** Transcribe audio con Groq Whisper (gratis). Devuelve null si no hay Groq o falla (entonces se usa Workers AI). */
export async function groqTranscribe(env: Env, audio: Uint8Array, mime: string, prompt: string): Promise<string | null> {
  if (!env.GROQ_API_KEY) return null;
  const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : 'webm';
  const auth = { Authorization: `Bearer ${env.GROQ_API_KEY}` };
  const send = (model: string) => {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mime || 'audio/webm' }), `voz.${ext}`);
    form.append('model', model);
    form.append('language', 'es');
    form.append('prompt', prompt.slice(0, 600));
    form.append('response_format', 'json');
    return fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: auth, body: form });
  };
  let model = (await getSetting(env, 'llm_whisper_groq')) || 'whisper-large-v3-turbo';
  let res = await send(model);
  if (res.status === 429 && model !== 'whisper-large-v3') res = await send('whisper-large-v3'); // cada modelo tiene su propio límite
  if (res.status === 404 || res.status === 400) {
    // Modelo de voz retirado: se busca otro Whisper disponible y se reintenta una vez.
    const list = await fetch('https://api.groq.com/openai/v1/models', { headers: auth }).then((r) => r.json() as Promise<{ data?: { id: string }[] }>).catch(() => ({ data: [] as { id: string }[] }));
    const ids = (list.data || []).map((m) => m.id).filter((id) => /whisper/i.test(id));
    const next = ids.find((id) => /turbo/i.test(id)) || ids[0];
    if (next && next !== model) { model = next; await putSetting(env, 'llm_whisper_groq', model); res = await send(model); }
  }
  if (!res.ok) { console.log(`Groq Whisper ${res.status}: ${(await res.text()).slice(0, 120)}`); return null; }
  return ((await res.json()) as { text?: string }).text?.trim() || '';
}

/** Prueba cada motor (Ajustes → Motores de IA): vuelve a pedir la lista de modelos y usa el primero que responda. */
export async function testEngines(env: Env): Promise<{ engine: string; ok: boolean; ms: number; detail: string }[]> {
  const msgs = [{ role: 'user', content: 'Responde solo con la palabra: listo' }];
  return Promise.all(providers(env).map(async (p) => {
    const t0 = Date.now();
    const list = await candidates(env, p, true);
    if (!list.length) return { engine: p.name, ok: false, ms: Date.now() - t0, detail: 'No encontré modelos disponibles con esta clave' };
    let last = '';
    for (const model of list.slice(0, MAX_TRIES_PER_PROVIDER)) {
      const r = await tryModel(env, p, model, msgs, { maxTokens: 16, temperature: 0 });
      if (r.deltas) {
        let text = ''; for await (const d of r.deltas) text += d;
        return { engine: p.name, ok: true, ms: Date.now() - t0, detail: `${model} · «${text.trim().slice(0, 20)}» · ${list.length} modelos de respaldo` };
      }
      last = r.error || '';
    }
    return { engine: p.name, ok: false, ms: Date.now() - t0, detail: last.slice(0, 140) };
  }));
}
