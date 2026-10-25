import { describe, expect, it } from 'vitest';
import { parseAccount } from '../src/worker/uapa';

const TEXT = `Resumen
Saldo de Cuenta:

DOP9,100.00

Nov - Enero 2026-2027
Detalle de Código Descripción Cargo Pago Saldo
INSC Matrícula Cuota 1 (Grado)

DOP4,425.00

DOP0.00

MSTI Matricula

DOP9,100.00

DOP9,100.00

PGTZ Pago Azul

DOP4,425.00

DOP0.00

Cargos del Periodo:

DOP13,525.00

Créditos y Pagos del Periodo:

DOP4,425.00

Saldo del Periodo:

DOP9,100.00

Agost - Oct 2026
Detalle de Código Descripción Cargo Pago Saldo
CANI Admisión Nuevo Ingreso Grado

DOP4,800.00

DOP0.00

Cargos del Periodo:

DOP23,000.00

Créditos y Pagos del Periodo:

DOP23,000.00

Saldo del Periodo:

DOP0.00

Saldo de Cuenta:

DOP9,100.00`;

describe('parseAccount', () => {
  const a = parseAccount(TEXT);
  it('lee el saldo y la moneda', () => { expect(a.balance).toBe(9100); expect(a.currency).toBe('DOP'); });
  it('separa los periodos y sus totales', () => {
    expect(a.periods.map((p) => p.period)).toEqual(['Nov - Enero 2026-2027', 'Agost - Oct 2026']);
    expect(a.periods[0]).toMatchObject({ charges: 13525, paid: 4425, balance: 9100 });
    expect(a.periods[1].balance).toBe(0);
  });
  it('distingue cargos y pagos', () => {
    const l = a.periods[0].lines;
    expect(l.find((x) => x.code === 'MSTI')).toMatchObject({ amount: 9100, balance: 9100, payment: false });
    expect(l.find((x) => x.code === 'PGTZ')).toMatchObject({ amount: 4425, payment: true });
  });
});
