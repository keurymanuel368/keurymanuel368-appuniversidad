-- Plan de examen: para cada examen, un calendario de estudio día por día y lo que ya hiciste.
CREATE TABLE IF NOT EXISTS exam_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  course TEXT NOT NULL,
  title TEXT NOT NULL,
  exam_at INTEGER NOT NULL,
  plan TEXT NOT NULL DEFAULT '[]',
  done TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_plans_user ON exam_plans (user_id, exam_at);
