-- Enlaza cada nota con su actividad del EVA ('assign:123', 'quiz:45'…) para mostrar la nota de cada tarea.
ALTER TABLE grades ADD COLUMN moodle_key TEXT;
CREATE INDEX IF NOT EXISTS idx_grades_moodle_key ON grades(moodle_key);
