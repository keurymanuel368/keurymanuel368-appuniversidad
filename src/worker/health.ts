// Alertas de salud: te avisa (máximo una vez al día por tipo) cuando algo importante deja de funcionar,
// para que no te enteres tarde. Las revisa el cron cada 30 minutos.
import type { Env } from './env';
import { getSettings, markSent, setSetting } from './db';
import { sendToMe } from './notify';
import { localDate, nowSec, ymd } from './time';

async function alertOnce(env: Env, kind: string, title: string, body: string, url = '/#ajustes') {
  if (!(await markSent(env, `alert:${kind}:${ymd(localDate(env))}`))) return false;
  await sendToMe(env, `*${title}*\n${body}`, { title, pushBody: body, tag: `alert-${kind}`, url });
  return true;
}

/** Lo llama llm.ts cuando ningún motor de IA pudo responder. */
export async function noteAiFailure(env: Env, detail: string) {
  await setSetting(env, 'ai_fail_at', String(nowSec())).catch(() => {});
  await setSetting(env, 'ai_fail_detail', detail.slice(0, 300)).catch(() => {});
}

export async function checkHealth(env: Env, extra: { backupError?: string } = {}): Promise<string[]> {
  const log: string[] = [];
  const s = await getSettings(env);

  // EVA: token vencido o sin conexión
  if (env.MOODLE_TOKEN && s.eva_last_error) {
    const expired = /token|invalid|inválid|expir|accessexception|webservice/i.test(s.eva_last_error);
    if (await alertOnce(env, 'eva', expired ? '⚠️ El EVA dejó de conectar' : '⚠️ No pude sincronizar el EVA',
      expired ? 'Parece que la conexión con el EVA venció. Vuelve a conectarlo en Ajustes → Conexiones (toma un minuto).'
        : `Error: ${s.eva_last_error.slice(0, 160)}. Lo vuelvo a intentar solo.`)) log.push('Alerta: EVA');
  }
  // EVA sin sincronizar hace más de 12 horas
  if (env.MOODLE_TOKEN && Number(s.eva_last_sync || 0) && nowSec() - Number(s.eva_last_sync) > 12 * 3600 && !s.eva_last_error) {
    if (await alertOnce(env, 'eva-old', '⚠️ El EVA lleva horas sin sincronizar', 'Abre Rumbo y toca Sincronizar. Si falla, revisa la conexión del EVA en Ajustes.')) log.push('Alerta: EVA atrasado');
  }
  // IA: todos los motores fallaron en la última media hora
  // (Los motores de IA son de todos: solo se le avisa al administrador.)
  if (env.ROLE === 'admin' && Number(s.ai_fail_at || 0) > nowSec() - 1800) {
    if (await alertOnce(env, 'ai', '⚠️ El asistente no pudo responder', `Todos los motores de IA fallaron. Abre Ajustes → Motores de IA → Probar motores. Detalle: ${(s.ai_fail_detail || '').slice(0, 120)}`)) log.push('Alerta: IA');
  }
  // Copia de seguridad
  if (extra.backupError && await alertOnce(env, 'backup', '⚠️ Falló la copia de seguridad', `Error: ${extra.backupError.slice(0, 160)}. Lo intento otra vez más tarde.`)) log.push('Alerta: copia');
  return log;
}
