-- Libros encontrados solos en el EVA: eva_key evita duplicados al volver a buscar.
ALTER TABLE books ADD COLUMN eva_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_eva ON books (user_id, eva_key) WHERE eva_key IS NOT NULL;
