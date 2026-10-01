-- Rumbo · esquema inicial (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  moodle_id   INTEGER UNIQUE,
  code        TEXT,
  name        TEXT NOT NULL,
  short_name  TEXT,
  color       TEXT NOT NULL DEFAULT '#1F5FE0',
  facilitator TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  moodle_event_id INTEGER UNIQUE,
  course_id       INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  due_at          INTEGER,               -- segundos Unix (UTC)
  url             TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',  -- 'eva' | 'manual'
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done'
  notes           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, due_at);

CREATE TABLE IF NOT EXISTS grades (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  moodle_item_id INTEGER,
  item_name      TEXT NOT NULL,
  grade          REAL,
  grade_max      REAL NOT NULL DEFAULT 100,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (course_id, moodle_item_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  period   TEXT NOT NULL,          -- 'AAAA-MM' = mes en que abre la ventana de pago
  amount   REAL,
  paid_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  note     TEXT
);

CREATE TABLE IF NOT EXISTS pensum (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  term     INTEGER NOT NULL,       -- número de cuatrimestre
  code     TEXT,
  name     TEXT NOT NULL,
  credits  INTEGER NOT NULL DEFAULT 0,
  status   TEXT NOT NULL DEFAULT 'pendiente', -- 'aprobada' | 'en_curso' | 'pendiente'
  grade    REAL,
  prereqs  TEXT                    -- códigos separados por coma
);

CREATE TABLE IF NOT EXISTS reminders (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  text      TEXT NOT NULL,
  remind_at INTEGER NOT NULL,
  sent      INTEGER NOT NULL DEFAULT 0
);

-- Evita enviar dos veces el mismo aviso (resumen del día, recordatorio de una tarea, etc.)
CREATE TABLE IF NOT EXISTS sent_log (
  key     TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  direction  TEXT NOT NULL,   -- 'in' | 'out'
  channel    TEXT NOT NULL,   -- 'whatsapp' | 'callmebot'
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('summary_hour', '7'),
  ('summary_enabled', '1'),
  ('task_reminders', '72,24,3'),
  ('pay_open_day', '25'),
  ('pay_close_day', '5'),
  ('pay_remind_days', '25,30,4,5'),
  ('pay_amount', ''),
  ('term_start', ''),
  ('term_end', ''),
  ('student_name', 'Keury'),
  ('eva_sync_hours', '2');
