import { useState } from 'react';
import { api, dateLabel, type PayWindow } from '../api';
import { Empty, PageHead, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';

type Payment = { id: number; period: string; amount: number | null; paid_at: number; note: string | null };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const periodLabel = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };

export function Pagos() {
  const data = useLoad(() => api<{ window: PayWindow; history: Payment[] }>('/payments'));
  const settings = useLoad(() => api<{ settings: Record<string, string> }>('/settings'));
  const [amount, setAmount] = useState('');

  if (data.error) return <div className="error">{data.error}</div>;
  if (!data.data || !settings.data) return <Skeleton rows={2} />;
  const w = data.data.window;
  const s = settings.data.settings;
  const remindDays = (s.pay_remind_days || '').split(',').filter(Boolean);
  const windowLen = w.closeDay < w.openDay ? 30 - w.openDay + w.closeDay + 1 : w.closeDay - w.openDay + 1;
  const cells = Array.from({ length: Math.max(1, Math.min(14, windowLen)) }, (_, i) => i);
  const tone = w.paid ? 'green' : w.state === 'open' ? 'orange' : 'blue';

  async function pay() {
    await api('/payments', { method: 'POST', body: { period: w.period, amount: amount ? Number(amount) : w.amount ? Number(w.amount) : null } });
    haptic(15);
    toast(`Pago de ${periodLabel(w.period)} registrado`); setAmount(''); data.reload();
  }
  async function remove(id: number) { await api(`/payments/${id}`, { method: 'DELETE' }); toast('Pago eliminado'); data.reload(); }
  async function saveSetting(k: string, v: string) {
    if ((s[k] || '') === v) return;
    await api('/settings', { method: 'PUT', body: { [k]: v } }); settings.reload(); data.reload();
  }
  function toggleDay(day: string) {
    haptic(5);
    const set = new Set(remindDays);
    if (set.has(day)) set.delete(day); else set.add(day);
    saveSetting('pay_remind_days', [...set].sort((a, b) => Number(a) - Number(b)).join(','));
  }
  const dayList = w.closeDay < w.openDay
    ? [...Array.from({ length: 31 - w.openDay + 1 }, (_, i) => String(w.openDay + i)).filter((d) => Number(d) <= 31), ...Array.from({ length: w.closeDay }, (_, i) => String(i + 1))]
    : Array.from({ length: w.closeDay - w.openDay + 1 }, (_, i) => String(w.openDay + i));

  return (
    <>
      <PageHead eyebrow="Cuotas del trimestre" title="Pagos" />
      <section className="grid2 stagger">
        <div className={`pay-hero ${tone}`}>
          <div className="b1" /><div className="b2" />
          <div className="pay-hero-top">
            <span className="kicker"><Icon name="wallet" size={14} />CUOTA DE {periodLabel(w.period).toUpperCase()}</span>
            <span className="status-chip">{w.paid ? 'Pagada' : w.state === 'open' ? `Abierta · ${w.daysToClose} d` : `Abre en ${w.daysToOpen} d`}</span>
          </div>
          <span className="amount num"><small>RD$</small>{w.amount ? Number(w.amount).toLocaleString('es-DO') : '—'}</span>
          <div className="window">
            <div className="window-dates num"><span>{dateLabel(w.opensAt)}</span><span>{dateLabel(w.closesAt)}</span></div>
            <div className="paydays" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((i) => { const t = i / Math.max(1, cells.length - 1); return <span key={i} style={t > 0.66 ? { background: tone === 'orange' ? 'rgba(90, 30, 0, .45)' : '#FFC27A' } : { background: '#fff', opacity: 0.9 - t * 0.6 }} />; })}
            </div>
            <span className="window-note">Los últimos días (más oscuros) son la zona de cierre.</span>
          </div>
          {!w.paid && (
            <div className="pay-form">
              <label htmlFor="amt" className="sr-only">Monto pagado</label>
              <input id="amt" className="input num" inputMode="decimal" placeholder={w.amount ? `RD$ ${w.amount}` : 'Monto'} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              <button className="btn white" onClick={pay}><Icon name="check" size={18} />Registrar pago</button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Configuración y avisos</h3></div>
          <div className="form-grid three">
            <div className="field"><label htmlFor="po">Abre el día</label><input id="po" className="input num" inputMode="numeric" defaultValue={s.pay_open_day} onBlur={(e) => saveSetting('pay_open_day', e.target.value)} /></div>
            <div className="field"><label htmlFor="pc">Cierra el día</label><input id="pc" className="input num" inputMode="numeric" defaultValue={s.pay_close_day} onBlur={(e) => saveSetting('pay_close_day', e.target.value)} /></div>
            <div className="field"><label htmlFor="pa">Monto (RD$)</label><input id="pa" className="input num" inputMode="decimal" defaultValue={s.pay_amount} onBlur={(e) => saveSetting('pay_amount', e.target.value.replace(/[^\d.]/g, ''))} /></div>
          </div>
          <span className="label"><Icon name="bell" size={15} />Días en que te aviso (si no has pagado)</span>
          <div className="days">
            {dayList.map((d) => <button key={d} className={`day num ${remindDays.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(d)} aria-pressed={remindDays.includes(d)}>{d}</button>)}
          </div>
        </div>
      </section>

      <div className="section">
        <div className="section-head"><h3>Historial</h3>{data.data.history.length > 0 && <span className="pill gray num">{data.data.history.length}</span>}</div>
        <div className="card list">
          {data.data.history.length === 0 ? <Empty icon="wallet" title="Sin pagos registrados" text="Cuando registres una cuota, aparecerá aquí." /> : data.data.history.map((p) => (
            <div key={p.id} className="task">
              <span className="check on static"><Icon name="check" size={15} style={{ strokeWidth: 3.2 }} /></span>
              <div className="body static"><span className="title">Cuota de {periodLabel(p.period)}</span><span className="sub"><span className="sub-txt">Pagado el {dateLabel(p.paid_at)}{p.note ? ' · ' + p.note : ''}</span></span></div>
              <span className="num money">{p.amount ? `RD$ ${p.amount.toLocaleString('es-DO')}` : '—'}</span>
              <button className="icon-btn ghosty" onClick={() => remove(p.id)} aria-label="Eliminar pago"><Icon name="trash" size={17} /></button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
