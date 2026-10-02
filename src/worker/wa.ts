// Piezas para que los avisos de WhatsApp se vean bien y todos con el mismo estilo:
// título con emoji y *negrita*, datos en líneas cortas con un icono, y el enlace a Rumbo al final (lo pone sendToMe).

/** Nombre de la asignatura para mostrar: el corto si es legible; si es un código del EVA ("202633-CBE109-…"), el nombre. */
export function courseLabel(name?: string | null, short?: string | null): string {
  if (short && !/\d{3,}|[-_]/.test(short)) return short;
  if (!name) return short || '';
  return name.length > 30 ? name.slice(0, 29).trimEnd() + '…' : name;
}

/** "faltan 3 horas", "falta 1 día", "faltan 40 minutos". */
export function timeLeft(dueSec: number, nowSec: number): string {
  const s = dueSec - nowSec;
  if (s <= 0) return 'ya venció';
  const min = Math.round(s / 60), h = Math.round(s / 3600), d = Math.round(s / 86400);
  if (min < 60) return `faltan ${min} minuto${min === 1 ? '' : 's'}`;
  if (h < 36) return h === 1 ? 'falta 1 hora' : `faltan ${h} horas`;
  return d === 1 ? 'falta 1 día' : `faltan ${d} días`;
}

/** "RD$ 6,500" (o el texto tal cual si no es un número). */
export function money(amount: string | number): string {
  const n = Number(String(amount).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? `RD$ ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `RD$ ${amount}`;
}

/** Une bloques con una línea en blanco entre ellos (se saltan los vacíos). */
export function blocks(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p && !!p.trim()).join('\n\n');
}
