-- Reglas de cada trabajo: lo que exige la consigna, la rúbrica y los archivos del facilitador en el EVA.
CREATE TABLE IF NOT EXISTS task_rules (
  task_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1,
  rules TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_rules_user ON task_rules (user_id);
