-- Cuota 1 de 3 de la matrícula (octubre 2026), pagada por Manuel. Las cuotas 2 y 3 son de RD$4,550 (saldo de Mi UAPA: RD$9,100).
INSERT INTO payments (user_id, period, amount, paid_at, note)
  SELECT 1, '2026-10', 4425, 1792940000, 'Cuota 1 de 3 (Mi UAPA)'
  WHERE NOT EXISTS (SELECT 1 FROM payments WHERE user_id = 1 AND period = '2026-10');
INSERT OR REPLACE INTO settings (key, value) VALUES ('u1:pay_amount', '4550');
