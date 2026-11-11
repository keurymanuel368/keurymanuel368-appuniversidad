-- Clases en vivo: la transcripción (solo texto, el audio no se guarda), las preguntas detectadas y el resumen/explicación.
CREATE TABLE IF NOT EXISTS class_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  course TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL DEFAULT 'live',
  transcript TEXT NOT NULL DEFAULT '',
  chunks INTEGER NOT NULL DEFAULT 0,
  qa TEXT,
  work TEXT,
  notes TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_class_sessions_user ON class_sessions (user_id, started_at DESC);
