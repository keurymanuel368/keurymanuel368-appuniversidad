// Datos de Mi UAPA que llegan con el importador del navegador: estado de cuenta (bancascade) e histórico académico (Banner).
import type { Env } from './env';
import { setSetting } from './db';

export type AccountLine = { code: string; desc: string; amount: number; balance: number; payment: boolean };
export type AccountPeriod = { period: string; lines: AccountLine[]; charges: number; paid: number; balance: number };
export type Account = { balance: number; currency: string; periods: AccountPeriod[] };

const money = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;
const PERIOD = /^[A-Za-zÁ-ú]+\s*-\s*[A-Za-zÁ-ú]+\s+\d{4}(?:-\d{4})?$/;
const AMOUNT = /^([A-Z]{2,3})\s?\$?\s*([\d,]+\.\d{2})$/;

/** Lee el texto de «Resumen de cuenta por periodo» (página de pagos de Banner) y lo convierte en datos. */
export function parseAccount(text: string): Account {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Account = { balance: 0, currency: 'DOP', periods: [] };
  let cur: AccountPeriod | null = null;
  let pendingRow: { code: string; desc: string } | null = null;
  let amounts: number[] = [];
  const flush = () => {
    if (pendingRow && cur && amounts.length) {
      const payment = /^pago|^abono|^cr[eé]dito|^beca|^descuento/i.test(pendingRow.desc);
      cur.lines.push({ ...pendingRow, amount: amounts[0], balance: amounts[1] ?? 0, payment });
    }
    pendingRow = null; amounts = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const am = l.match(AMOUNT);
    if (/^Saldo de Cuenta:?$/i.test(l)) { flush(); const v = lines[i + 1]?.match(AMOUNT); if (v) { out.balance = money(v[2]); out.currency = v[1]; } continue; }
    if (PERIOD.test(l)) { flush(); cur = { period: l, lines: [], charges: 0, paid: 0, balance: 0 }; out.periods.push(cur); continue; }
    if (!cur) continue;
    const tot = l.match(/^(Cargos del Periodo|Cr[eé]ditos y Pagos del Periodo|Saldo del Periodo):?$/i);
    if (tot) {
      flush();
      const v = lines[i + 1]?.match(AMOUNT);
      if (v) { const k = tot[1].toLowerCase(); if (k.startsWith('cargos')) cur.charges = money(v[2]); else if (k.startsWith('saldo')) cur.balance = money(v[2]); else cur.paid = money(v[2]); }
      continue;
    }
    if (/^Detalle de C[oó]digo/i.test(l)) continue;
    if (am) { if (pendingRow) amounts.push(money(am[2])); continue; }
    const row = l.match(/^([A-Z0-9]{4})\s+(.+)$/);
    if (row) { flush(); pendingRow = { code: row[1], desc: row[2] }; continue; }
    if (pendingRow && !amounts.length && !/^(Resumen|Saldo|Cargos)/i.test(l)) { pendingRow.desc += ' ' + l; continue; }
    // El nombre puede venir en la línea de abajo (código solo en una línea)
    const code = l.match(/^([A-Z0-9]{4})$/);
    if (code) { flush(); pendingRow = { code: code[1], desc: '' }; }
  }
  flush();
  return out;
}

export type TranscriptBody = { done?: { code: string; grade: number; credits?: number; term?: string }[]; current?: { code: string }[]; term?: string };

/** Aplica el histórico: materia con nota final → aprobada (si llega a 70) con su nota; las del periodo actual → en curso. */
export async function applyTranscript(env: Env, b: TranscriptBody): Promise<{ approved: number; inCourse: number }> {
  const stmts = [];
  let approved = 0, inCourse = 0;
  for (const d of b.done || []) {
    if (!d.code || !Number.isFinite(d.grade)) continue;
    const ok = d.grade >= 70;
    stmts.push(env.DB.prepare(`UPDATE pensum SET grade = ?, status = ? WHERE user_id = ? AND code = ?`).bind(d.grade, ok ? 'aprobada' : 'pendiente', env.UID, d.code));
    if (ok) approved++;
  }
  for (const c of b.current || []) {
    if (!c.code) continue;
    // Solo pasa a «en curso» lo que aún no tiene nota final
    stmts.push(env.DB.prepare(`UPDATE pensum SET status = 'en_curso' WHERE user_id = ? AND code = ? AND status != 'aprobada'`).bind(env.UID, c.code));
    inCourse++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  await setSetting(env, 'uapa_transcript', JSON.stringify({ done: b.done || [], current: b.current || [], term: b.term || '' }));
  return { approved, inCourse };
}
