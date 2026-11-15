-- Libros por materia: enlaces o archivos (los archivos se guardan en trozos de 1 MB en D1).
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  file_name TEXT,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_course ON books (user_id, course_id);
CREATE TABLE IF NOT EXISTS book_chunks (
  book_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (book_id, idx)
);
