-- Total oficial de la asignatura según el libro de calificaciones del EVA.
ALTER TABLE courses ADD COLUMN eva_total REAL;
ALTER TABLE courses ADD COLUMN eva_total_max REAL;
-- Foto del comprobante de cada pago (JPEG reducido en el teléfono, en base64).
CREATE TABLE IF NOT EXISTS payment_receipts (
  payment_id INTEGER PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
