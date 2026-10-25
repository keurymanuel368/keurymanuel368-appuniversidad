-- Secciones de Mi UAPA (oferta del periodo) para el planificador de selección.
CREATE TABLE IF NOT EXISTS uapa_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  term TEXT NOT NULL,
  crn TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  section TEXT,
  credits REAL NOT NULL DEFAULT 0,
  seats INTEGER,
  capacity INTEGER,
  campus TEXT,
  faculty TEXT,
  meetings TEXT NOT NULL DEFAULT '[]',
  UNIQUE (user_id, term, crn)
);
CREATE INDEX IF NOT EXISTS idx_uapa_sections_user ON uapa_sections (user_id, term, code);
