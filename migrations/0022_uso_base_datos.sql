-- Medidor de la base de datos: filas leídas/escritas por día (UTC, como el límite gratis de Cloudflare).
CREATE TABLE IF NOT EXISTS db_usage (
  day TEXT PRIMARY KEY,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0
);
