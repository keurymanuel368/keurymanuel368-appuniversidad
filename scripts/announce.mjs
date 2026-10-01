// Después de publicar: le pide a Rumbo que anuncie la versión nueva (notificación «✨ Nuevo en Rumbo»).
const url = process.env.RUMBO_URL || 'https://rumbo.gestori.workers.dev';
try {
  const r = await fetch(`${url}/api/release/announce`, { method: 'POST' });
  console.log(`Novedades: ${r.ok ? 'anunciadas (v' + (await r.json()).version + ')' : 'error ' + r.status}`);
} catch (e) {
  console.log('Novedades: no se pudo avisar (' + e.message + '). Se anunciará en la próxima revisión automática.');
}
