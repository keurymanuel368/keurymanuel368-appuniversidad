-- Avisos y novedades: foro de avisos de cada asignatura y notificaciones del EVA (luego, también el correo).
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL,            -- 'avisos' (foro de avisos) | 'eva' (notificación) | 'correo'
  ext_id     TEXT NOT NULL,            -- id en el origen, para no duplicar
  course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  author     TEXT,
  url        TEXT,
  kind       TEXT,                     -- 'pago' | 'evento' | 'nota' | 'aviso'
  created_at INTEGER NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
