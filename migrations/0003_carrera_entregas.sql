-- Pensum por carrera (trimestres, correquisitos, optativas), facilitadores del EVA y entregas.
ALTER TABLE pensum ADD COLUMN coreqs TEXT;
ALTER TABLE pensum ADD COLUMN kind TEXT NOT NULL DEFAULT 'obligatoria'; -- 'obligatoria' | 'optativa'

ALTER TABLE courses ADD COLUMN facilitator_eva TEXT;   -- nombres que publica el EVA (el campo facilitator es el que escribes tú)

ALTER TABLE tasks ADD COLUMN moodle_key TEXT;           -- 'assign:123', 'quiz:45', 'forum:9'…
ALTER TABLE tasks ADD COLUMN submitted_at INTEGER;      -- cuándo se detectó como entregada en el EVA
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_moodle_key ON tasks(moodle_key);

INSERT OR IGNORE INTO settings (key, value) VALUES ('term_unit', 'trimestre');
