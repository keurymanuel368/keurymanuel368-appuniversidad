// Limpieza del texto antes de leerlo en voz alta (se usa en la llamada de voz y en «Escuchar»).
/** Texto apto para leer en voz alta (sin emojis, viñetas ni símbolos). */
export const speakable = (t: string) => {
  const out = t
    .replace(/^\s*(?:\d[).]\s*)?[*_#\s]*(?:respuesta|texto|pantalla|mensaje|say|reply)[*_\s]*:\s*/i, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}✅⚠️💡]/gu, '')
    .replace(/\bklk\b/gi, 'qué lo que').replace(/\bpa'/gi, 'para').replace(/\bna'/gi, 'nada').replace(/\bta'/gi, 'está')
    .replace(/(\d+(?:\.\d+)?)\/(100|20|10)/g, '$1 de $2')
    // Horas: "7:00 p. m." → "7 de la noche", "12:04 a. m." → "12 y 4 de la mañana"
    .replace(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/gi, (_m, h: string, mi: string | undefined, ap: string) => {
      const hh = Number(h);
      const when = ap.toLowerCase() === 'a' ? 'de la mañana' : hh === 12 || hh < 7 ? 'de la tarde' : 'de la noche';
      return `${hh}${mi && mi !== '00' ? ` y ${Number(mi)}` : ''} ${when}`;
    })
    .replace(/(\d+)\s*%/g, '$1 por ciento').replace(/#(\d+)/g, 'número $1').replace(/\s&\s/g, ' y ')
    // Símbolos que la voz del teléfono lee en voz alta ("guion", "barra", "dos puntos", "comillas"…): fuera.
    .replace(/[*_•#>`~|\/()[\]{}"“”«»=+^<]/g, ' ').replace(/\s[-–—]+\s|^[-–—]+\s*/gm, ', ')
    .replace(/\.{2,}|…/g, ',').replace(/[:;]/g, ',')
    .replace(/\n+/g, '. ')
    // Signos repetidos o sueltos ("., ", ", .", " .") → uno solo pegado a la palabra.
    .replace(/\s+([,.!?¡¿])/g, '$1').replace(/([,.!?])[\s,.]*(?=[,.])/g, '').replace(/([,.!?])(?=\S)(?![\d])/g, '$1 ')
    .replace(/^[\s,.!?;:]+/, '').replace(/[\s,]+$/, '')
    .replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(out) ? out : ''; // un trozo de solo signos no se lee ("punto", "coma")
};
