-- Origen de la nota: NULL = libro de calificaciones del EVA; 'foro' = leída directamente del foro.
ALTER TABLE grades ADD COLUMN source TEXT;
