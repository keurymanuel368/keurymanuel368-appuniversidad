-- Horario de clases (Mi UAPA / Banner) y exámenes finales del DEA.
-- day: 0 = lunes … 6 = domingo · start_min/end_min = minutos desde la medianoche (hora local).
CREATE TABLE IF NOT EXISTS uapa_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  term TEXT NOT NULL,
  crn TEXT NOT NULL,
  code TEXT,
  title TEXT NOT NULL,
  day INTEGER NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  room TEXT,
  building TEXT,
  start_date TEXT,
  end_date TEXT,
  UNIQUE (user_id, term, crn, day, start_min)
);
CREATE INDEX IF NOT EXISTS idx_uapa_classes_user ON uapa_classes (user_id, term);
CREATE TABLE IF NOT EXISTS uapa_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  course TEXT,
  title TEXT NOT NULL,
  opens_at INTEGER,
  closes_at INTEGER,
  UNIQUE (user_id, title, course)
);
