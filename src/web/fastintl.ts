// Crear un Intl.DateTimeFormat cuesta ~1 ms en un teléfono de gama media y la app lo hacía por cada fecha de cada tarea
// (Tareas congelaba la pantalla casi medio segundo). Aquí se reutiliza el mismo formateador para las mismas opciones.
const Orig = Intl.DateTimeFormat;
const cache = new Map<string, Intl.DateTimeFormat>();

function Cached(locales?: string | string[], options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = (Array.isArray(locales) ? locales.join(',') : locales || '') + '|' + JSON.stringify(options || {});
  let f = cache.get(key);
  if (!f) { f = new Orig(locales, options); cache.set(key, f); }
  return f;
}
Cached.prototype = Orig.prototype;
(Cached as unknown as { supportedLocalesOf: typeof Orig.supportedLocalesOf }).supportedLocalesOf = Orig.supportedLocalesOf.bind(Orig);
(Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = Cached;
