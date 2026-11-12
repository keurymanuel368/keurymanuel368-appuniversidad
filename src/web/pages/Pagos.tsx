import { useState } from 'react';
import { api, dateLabel, type PayWindow } from '../api';
import { Empty, Modal, PageHead, Skeleton, haptic, toast, useLoad } from '../components';
import { Icon } from '../icons';

type Payment = { id: number; period: string; amount: number | null; paid_at: number; note: string | null; has_receipt?: number | null };

/** Reduce la foto en el teléfono (máx. 1400 px, JPEG) para guardarla liviana. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const periodLabel = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };

export function Pagos() {
  const data = useLoad(() => api<{ window: PayWindow; history: Payment[] }>('/payments'));
  const settings = useLoad(() => api<{ settings: Record<string, string> }>('/settings'));
  const [amount, setAmount] = useState('');
  const [viewing, setViewing] = useState<number | null>(null);
  async function attach(id: number, file: File | undefined) {
    if (!file) return;
    try {
      await api(`/payments/${id}/receipt`, { method: 'POST', body: { dataUrl: await shrink(file) } });
      haptic(12); toast('Comprobante guardado'); data.reload();
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function removeReceipt(id: number) { await api(`/payments/${id}/receipt`, { method: 'DELETE' }); setViewing(null); toast('Comprobante quitado'); data.reload(); }

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
    <div className="rbx">
      <header className="top"><div><div className="eb">Cuotas del trimestre</div><h1 tabIndex={-1}>Pagos</h1></div></header>
      <AccountCard cuota={Number(data.data.window.amount) || 0} paidMonth={data.data.window.paid} />
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

        {/* Se configura una vez: plegada cuando ya tiene monto, para que lo importante (pagar) quede arriba. */}
        <details className="card pay-config" open={!s.pay_amount}>
          <summary className="card-head"><h3>Configuración y avisos</h3><span className="small muted spacer">{s.pay_amount && s.pay_open_day && s.pay_close_day ? `Del ${s.pay_open_day} al ${s.pay_close_day}` : s.pay_amount ? 'Sin fechas' : ''}</span><Icon name="chevron" size={18} className="pc-chev" /></summary>
          <div className="form-grid three">
            <div className="field"><label htmlFor="po">Abre el día</label><input id="po" className="input num" inputMode="numeric" defaultValue={s.pay_open_day} onBlur={(e) => saveSetting('pay_open_day', e.target.value)} /></div>
            <div className="field"><label htmlFor="pc">Cierra el día</label><input id="pc" className="input num" inputMode="numeric" defaultValue={s.pay_close_day} onBlur={(e) => saveSetting('pay_close_day', e.target.value)} /></div>
            <div className="field"><label htmlFor="pa">Monto (RD$)</label><input id="pa" className="input num" inputMode="decimal" defaultValue={s.pay_amount} onBlur={(e) => saveSetting('pay_amount', e.target.value.replace(/[^\d.]/g, ''))} /></div>
          </div>
          <span className="label"><Icon name="bell" size={15} />Días en que te aviso (si no has pagado)</span>
          <div className="days">
            {dayList.map((d) => <button key={d} className={`day num ${remindDays.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(d)} aria-pressed={remindDays.includes(d)}>{d}</button>)}
          </div>
        </details>
      </section>

      <section className="card">
        <div className="head"><h3>Historial</h3>{data.data.history.length > 0 && <span className="chip c-gray num">{data.data.history.length}</span>}</div>
        {data.data.history.length === 0 ? <Empty icon="wallet" title="Sin pagos registrados" text="Cuando registres una cuota, aparecerá aquí." /> : (
          <ul>
            {data.data.history.map((p) => (
              <li key={p.id} className="row">
                <span className="chk on" aria-hidden="true" style={{ cursor: 'default' }} />
                <div className="t"><b>Cuota de {periodLabel(p.period)}</b><small>Pagado el {dateLabel(p.paid_at)}{p.note ? ' · ' + p.note : ''}</small></div>
                <span className="chip c-mint num">{p.amount ? `RD$ ${p.amount.toLocaleString('es-DO')}` : '—'}</span>
                {p.has_receipt
                  ? <button className="pill-btn" style={{ width: 38, height: 38, boxShadow: 'none', background: 'var(--cobaltsoft)' }} onClick={() => setViewing(p.id)} aria-label="Ver comprobante"><Icon name="book" size={17} /></button>
                  : <label className="pill-btn" style={{ width: 38, height: 38, boxShadow: 'none', background: 'var(--cobaltsoft)' }} aria-label="Adjuntar foto del comprobante" title="Adjuntar comprobante"><Icon name="upload" size={17} /><input type="file" accept="image/*" hidden onChange={(e) => attach(p.id, e.target.files?.[0])} /></label>}
                <button className="pill-btn" style={{ width: 38, height: 38, boxShadow: 'none', background: 'var(--rosesoft)', color: 'var(--rose)' }} onClick={() => remove(p.id)} aria-label="Eliminar pago"><Icon name="trash" size={17} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {viewing !== null && (
        <Modal title="Comprobante de pago" onClose={() => setViewing(null)}>
          <img className="receipt-img" src={`/api/payments/${viewing}/receipt`} alt="Comprobante de pago" />
          <div className="ts-row">
            <a className="btn line grow" href={`/api/payments/${viewing}/receipt`} target="_blank" rel="noopener"><Icon name="download" size={17} />Abrir</a>
            <button className="btn line grow" onClick={() => removeReceipt(viewing)}><Icon name="trash" size={17} />Quitar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type Acc = { balance: number; currency: string; periods: { period: string; charges: number; paid: number; balance: number; lines: { code: string; desc: string; amount: number; balance: number; payment: boolean }[] }[] };
const rd = (n: number) => 'RD$' + Math.round(n).toLocaleString('es-DO');

/** Lo que debes en Mi UAPA (estado de cuenta oficial), por periodo. Se actualiza con el marcador de la pantalla Horario. */
function AccountCard({ cuota, paidMonth }: { cuota: number; paidMonth: boolean }) {
  const sum = useLoad(() => api<{ account: Acc | null; account_at: number | null }>('/uapa/summary'));
  const a = sum.data?.account;
  if (!a) return null;
  const cur = a.periods[0];
  const ago = sum.data?.account_at ? Math.max(1, Math.round((Date.now() / 1000 - sum.data.account_at) / 3600)) : 0;
  return (
    <section className="acct">
      <div className={`acct-hero ${a.balance > 0 ? 'plan' : 'ok'}`}>
        <small>{a.balance > 0 ? 'Por pagar en cuotas mensuales' : 'Estás al día en Mi UAPA'}</small>
        <b className="num">{rd(a.balance)}</b>
        {cur && cur.charges > 0 && (
          <>
            <span className="acct-bar"><i style={{ width: `${Math.min(100, (cur.paid / cur.charges) * 100)}%` }} /></span>
            <em>{cur.period}: pagaste {rd(cur.paid)} de {rd(cur.charges)}</em>
          </>
        )}
        {a.balance > 0 && cuota > 0 && <em>{paidMonth ? '✓ La cuota de este mes ya está pagada · ' : ''}Quedan {Math.max(1, Math.round(a.balance / cuota))} cuotas de {rd(cuota)}</em>}
        {ago > 0 && <em className="acct-at">Actualizado hace {ago} h · <a href="#horario">actualizar</a></em>}
      </div>
      {a.periods.map((p, i) => (
        <details key={p.period} className="acct-period" open={i === 0}>
          <summary><span>{p.period}</span><b className={`num ${p.balance > 0 ? 'owe' : 'ok'}`}>{p.balance > 0 ? 'Por pagar ' + rd(p.balance) : 'Saldado'}</b></summary>
          <ul>
            {p.lines.map((l, j) => (
              <li key={l.code + j} className={l.payment ? 'pay' : ''}>
                <span><b>{l.desc || l.code}</b><small>{l.code}{!l.payment && l.balance > 0 ? ' · pendiente ' + rd(l.balance) : ''}</small></span>
                <span className="num">{l.payment ? '− ' : ''}{rd(l.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
