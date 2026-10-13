-- Peso de cada actividad en la nota final (lo da el libro de calificaciones del EVA, de 0 a 1).
ALTER TABLE grades ADD COLUMN weight REAL;
-- Foros: tu aporte, tus respuestas a compañeros y cuántas pide el facilitador.
ALTER TABLE tasks ADD COLUMN forum_posts INTEGER;
ALTER TABLE tasks ADD COLUMN forum_replies INTEGER;
ALTER TABLE tasks ADD COLUMN forum_needed INTEGER;
-- Archivos que el facilitador adjuntó a la actividad (JSON [{name, url}]).
ALTER TABLE tasks ADD COLUMN attachments TEXT;
