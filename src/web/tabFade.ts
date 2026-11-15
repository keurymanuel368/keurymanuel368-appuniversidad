// Pistas de «hay más →»: las barras de pestañas que se deslizan muestran un degradado en el borde donde queda contenido oculto.
function update(el: HTMLElement) {
  const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 6;
  const before = el.scrollLeft > 6;
  el.classList.toggle('fade-r', more);
  el.classList.toggle('fade-l', before);
}
function scan() {
  document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((el) => {
    if (el.scrollWidth <= el.clientWidth + 1 && !el.classList.contains('fade-r') && !el.classList.contains('fade-l')) return;
    update(el);
  });
}
export function installTabFade() {
  let t = 0;
  const later = () => { clearTimeout(t); t = window.setTimeout(scan, 80); };
  document.addEventListener('scroll', (e) => { const el = e.target as HTMLElement; if (el?.getAttribute?.('role') === 'tablist') update(el); }, true);
  window.addEventListener('resize', later);
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  later();
}
