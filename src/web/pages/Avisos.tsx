import { useCallback, useEffect, useState } from 'react';
import { api, cleanTitle, newsTitle, dateLabel } from '../api';
import { Empty, Modal, PageHead, PullIndicator, Segmented, Skeleton, haptic, toast, usePullToRefresh, useLoad } from '../components';
import { Icon } from '../icons';

export type News = {
  id: number; source: string; title: string; body: string | null; author: string | null; url: string | null;
  kind: string; created_at: number; read: number; course_name: string | null; course_color: string | null;
};
type Filter = 'todo' | 'pago' | 'evento' | 'aviso';

const KIND: Record<string, { label: string; icon: string; tone: string }> = {
  pago: { label: 'Pago', icon: 'wallet', tone: 'orange' },
  evento: { label: 'Evento', icon: 'calendar', tone: 'violet' },
  nota: { label: 'Calificación', icon: 'trend', tone: 'green' },
  aviso: { label: 'Aviso', icon: 'bell', tone: 'blue' },
  novedad: { label: 'Novedad', icon: 'spark', tone: 'violet' },
};
const SOURCE: Record<string, string> = { rumbo: 'Novedad de Rumbo', notas: 'Calificación del EVA', avisos: 'Foro de avisos', eva: 'Notificación del EVA', correo: 'Correo UAPA' };

function ago(sec: number) {
  const m = Math.round((Date.now() / 1000 - sec) / 60);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d < 7 ? `hace ${d} d` : dateLabel(sec);
}

export function Avisos() {
  const data = useLoad(() => api<News[]>('/announcements'));
  const [filter, setFilter] = useState<Filter>('todo');
  const [open, setOpen] = useState<News | null>(null);
  const list = data.data || [];
  const [allRumbo, setAllRumbo] = useState(false);
  const filtered = list.filter((n) => filter === 'todo' ? n.kind !== 'nota' || n.source !== 'eva' : filter === 'aviso' ? n.kind === 'aviso' || n.kind === 'nota' : n.kind === filter);
  // Las novedades de la app no deben tapar los avisos de la UAPA: en «Todo» solo va la más reciente.
  const rumbo = filtered.filter((n) => n.source === 'rumbo');
  const shown = filter === 'todo' && !allRumbo ? filtered.filter((n) => n.source !== 'rumbo' || n.id === rumbo[0]?.id) : filtered;
  const unread = list.filter((n) => !n.read).length;
  const refresh = useCallback(async () => {
    try { await api('/sync', { method: 'POST' }); toast('Avisos al día'); } catch (e) { toast('Error: ' + (e as Error).message, 'err'); }
    data.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { pull, refreshing } = usePullToRefresh(refresh);

  // Entrar a Avisos limpia el numerito rojo de la barra.
  useEffect(() => { api('/announcements/seen', { method: 'POST' }).then(() => window.dispatchEvent(new Event('rumbo:badges'))).catch(() => {}); }, []);

  // Enlace directo desde una notificación: #avisos/123 abre el detalle de ese aviso.
  useEffect(() => {
    const m = location.hash.match(/^#avisos\/(\d+)/);
    if (!m || !data.data) return;
    const n = data.data.find((x) => x.id === Number(m[1]));
    history.replaceState(null, '', '#avisos');
    if (n) openItem(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data]);

  async function markAll() {
    haptic(8);
    await api('/announcements/read', { method: 'POST', body: {} });
    toast('Todo marcado como leído');
    data.reload();
    window.dispatchEvent(new Event('rumbo:badges'));
  }
  async function openItem(n: News) {
    setOpen(n);
    if (!n.read) { await api('/announcements/read', { method: 'POST', body: { ids: [n.id] } }); data.setData(list.map((x) => (x.id === n.id ? { ...x, read: 1 } : x))); window.dispatchEvent(new Event('rumbo:badges')); }
  }

  return (
    <>
      <PullIndicator pull={pull} refreshing={refreshing} />
      <PageHead eyebrow="Novedades de la UAPA y tus asignaturas" title="Avisos">
        {unread > 0 && <button className="btn line" onClick={markAll} aria-label="Marcar todo como leído"><Icon name="check" size={18} /><span className="lbl">Marcar leídos</span></button>}
      </PageHead>
      <Segmented label="Filtrar avisos" value={filter} onChange={setFilter} options={[
        { id: 'todo', label: 'Todo' }, { id: 'pago', label: 'Pagos' }, { id: 'evento', label: 'Eventos' }, { id: 'aviso', label: 'Avisos' },
      ]} />
      {data.error && <div className="error">{data.error}</div>}
      {!data.data ? <Skeleton hero={false} rows={4} /> : shown.length === 0 ? (
        <div className="card"><Empty icon="bell" title={list.length ? 'Nada en esta categoría' : 'Sin avisos todavía'} text={list.length ? 'Prueba con otro filtro.' : 'Se traen del EVA al sincronizar: el foro de avisos de cada asignatura y las notificaciones de la universidad.'} /></div>
      ) : (
        <>
        <div className="news-list stagger">
          {shown.map((n) => {
            const k = KIND[n.kind] || KIND.aviso;
            return (
              <button key={n.id} className={`news ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <span className={`news-ic ${k.tone}`}><Icon name={k.icon} size={19} /></span>
                <span className="news-copy">
                  <span className="news-meta"><b>{n.course_name || SOURCE[n.source] || 'EVA'}</b><span>{ago(n.created_at)}</span>{!n.read && <i className="news-dot" aria-label="Sin leer" />}</span>
                  <span className="news-title">{newsTitle(n.title, n.body)}</span>
                  {n.body && <span className="news-body">{n.body}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {filter === 'todo' && rumbo.length > 1 && <button className="link-btn center-self more-rumbo" onClick={() => setAllRumbo((v) => !v)}>{allRumbo ? 'Ocultar novedades de Rumbo' : `Ver las ${rumbo.length - 1} novedades anteriores de Rumbo`}</button>}
        </>
      )}
      {open && <NewsSheet n={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function NewsSheet({ n, onClose }: { n: News; onClose: () => void }) {
  const k = KIND[n.kind] || KIND.aviso;
  useEffect(() => haptic(5), []);
  return (
    <Modal title={newsTitle(n.title, n.body)} onClose={onClose} bare>
      <div className="news-sheet">
        <span className={`pill ${k.tone === 'violet' ? 'blue' : k.tone}`}><Icon name={k.icon} size={13} />{k.label}</span>
        <h2>{newsTitle(n.title, n.body)}</h2>
        <span className="small muted">{n.course_name || SOURCE[n.source]}{n.author ? ` · ${n.author}` : ''} · {dateLabel(n.created_at)}</span>
        <div className="news-full">{n.body || 'Sin contenido.'}</div>
      </div>
      {n.url && <a className="btn primary lg block" href={n.url} target="_blank" rel="noopener"><Icon name="link" size={18} />{n.source === 'correo' ? 'Abrir el correo' : 'Abrir en el EVA'}</a>}
    </Modal>
  );
}
