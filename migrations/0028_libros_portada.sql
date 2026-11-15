-- Portada (JPEG de la primera página, la genera la app) y marca de libros que no se pueden leer dentro de Rumbo.
ALTER TABLE books ADD COLUMN cover BLOB;
ALTER TABLE books ADD COLUMN unreadable INTEGER NOT NULL DEFAULT 0;
-- Quita repetidos de los libros del EVA (mismo título en la misma materia).
DELETE FROM books WHERE eva_key IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM books GROUP BY user_id, course_id, lower(title));
