// Lectura de lo que responde la IA y elección automática de modelos.
import { describe, expect, it } from 'vitest';
import { labelLength, splitOutput } from '../src/worker/ai';
import { modelGone, rankModels } from '../src/worker/llm';

describe('splitOutput (respuesta de la IA)', () => {
  it('separa el texto visible del JSON de acciones', () => {
    const r = splitOutput('Dale, te lo dejo listo 👇\n===\n{"say": "Listo mano", "actions": [{"type": "create_task", "title": "Foro"}], "remember": ["Trabaja de lunes a viernes"]}');
    expect(r.visible).toBe('Dale, te lo dejo listo 👇');
    expect(r.say).toBe('Listo mano');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe('create_task');
    expect(r.remember).toBe('Trabaja de lunes a viernes');
  });
  it('quita la etiqueta «Respuesta:»', () => {
    expect(splitOutput('Respuesta: Hola\n===\n{}').visible).toBe('Hola');
    expect(labelLength('**Respuesta para la pantalla:** Hola')).toBeGreaterThan(0);
    expect(labelLength('Hola, ¿qué tal?')).toBe(0);
  });
  it('arregla acciones anidadas {"id": {"match": …}}', () => {
    const r = splitOutput('Ok\n===\n{"actions": [{"type": "complete_task", "id": {"match": "foro"}}]}');
    expect(r.actions[0]).toMatchObject({ type: 'complete_task', match: 'foro' });
  });
  it('aguanta un JSON roto sin explotar', () => {
    const r = splitOutput('Hola\n===\n{"actions": [');
    expect(r.visible).toBe('Hola');
    expect(r.actions).toEqual([]);
  });
});

describe('rankModels (elegir el mejor modelo disponible)', () => {
  it('prefiere los modelos grandes y descarta los que no son de chat', () => {
    const top = rankModels(['whisper-large-v3', 'llama-guard-4', 'openai/gpt-oss-20b', 'meta-llama/llama-4-maverick-17b', 'openai/gpt-oss-120b']);
    expect(top[0]).toBe('meta-llama/llama-4-maverick-17b');
    expect(top).not.toContain('whisper-large-v3');
    expect(top).not.toContain('llama-guard-4');
    expect(top.indexOf('openai/gpt-oss-120b')).toBeLessThan(top.indexOf('openai/gpt-oss-20b'));
  });
  it('si no conoce ninguno, usa los primeros disponibles', () => {
    expect(rankModels(['modelo-raro-1', 'modelo-raro-2'])).toEqual(['modelo-raro-1', 'modelo-raro-2']);
  });
  it('detecta cuando un modelo fue retirado', () => {
    expect(modelGone(404, '')).toBe(true);
    expect(modelGone(410, '')).toBe(true);
    expect(modelGone(400, 'The model `x` does not exist')).toBe(true);
    expect(modelGone(429, 'rate limit')).toBe(false);
  });
});
