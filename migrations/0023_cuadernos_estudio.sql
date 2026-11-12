-- Cuadernos de estudio hechos por la IA: un renglón por tema del EVA (el material recogido y su estado).
CREATE TABLE IF NOT EXISTS study_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  course_id INTEGER NOT NULL,
  course TEXT NOT NULL,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  material TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  note_id INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, course_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_study_topics_user ON study_topics (user_id, status, course_id, idx);
