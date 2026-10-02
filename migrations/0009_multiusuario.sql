-- Rumbo multiusuario: cada fila es de un usuario (user_id). Todo lo que ya existe pasa al usuario 1 (Manuel).
-- Las tablas con UNIQUE propios (el mismo curso o aviso del EVA lo tienen varios compañeros) se rehacen.
-- Orden seguro: se crean las nuevas apuntando a *_new, se copian, se borran las viejas (hijas primero,
-- así ningún ON DELETE toca datos) y al renombrar SQLite actualiza las referencias solo.
PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  login      TEXT NOT NULL UNIQUE,          -- matrícula o usuario, en minúsculas
  name       TEXT NOT NULL,
  pass_hash  TEXT,                          -- PBKDF2; vacío en el usuario 1 = usa el secreto APP_PASSWORD
  pass_salt  TEXT,
  role       TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  active     INTEGER NOT NULL DEFAULT 1,
  invited_by INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen  INTEGER
);
INSERT OR IGNORE INTO users (id, login, name, role) VALUES
  (1, '100108669', COALESCE((SELECT value FROM settings WHERE key = 'student_name'), 'Manuel'), 'admin');

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL,
  note       TEXT,
  used_by    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

-- ---------- courses ----------
CREATE TABLE courses_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL DEFAULT 1,
  moodle_id       INTEGER,
  code            TEXT,
  name            TEXT NOT NULL,
  short_name      TEXT,
  color           TEXT NOT NULL DEFAULT '#1F5FE0',
  facilitator     TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  facilitator_eva TEXT,
  UNIQUE (user_id, moodle_id)
);
INSERT INTO courses_new (id, user_id, moodle_id, code, name, short_name, color, facilitator, active, updated_at, facilitator_eva)
  SELECT id, 1, moodle_id, code, name, short_name, color, facilitator, active, updated_at, facilitator_eva FROM courses;

-- ---------- tasks ----------
CREATE TABLE tasks_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL DEFAULT 1,
  moodle_event_id INTEGER,
  course_id       INTEGER REFERENCES courses_new(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  due_at          INTEGER,
  url             TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  moodle_key      TEXT,
  submitted_at    INTEGER,
  description     TEXT,
  focus_minutes   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, moodle_event_id)
);
INSERT INTO tasks_new (id, user_id, moodle_event_id, course_id, title, due_at, url, source, status, notes, created_at, updated_at, moodle_key, submitted_at, description, focus_minutes)
  SELECT id, 1, moodle_event_id, course_id, title, due_at, url, source, status, notes, created_at, updated_at, moodle_key, submitted_at, description, focus_minutes FROM tasks;

-- ---------- grades ----------
CREATE TABLE grades_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL DEFAULT 1,
  course_id      INTEGER NOT NULL REFERENCES courses_new(id) ON DELETE CASCADE,
  moodle_item_id INTEGER,
  item_name      TEXT NOT NULL,
  grade          REAL,
  grade_max      REAL NOT NULL DEFAULT 100,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  moodle_key     TEXT,
  feedback       TEXT,
  UNIQUE (course_id, moodle_item_id)
);
INSERT INTO grades_new (id, user_id, course_id, moodle_item_id, item_name, grade, grade_max, updated_at, moodle_key, feedback)
  SELECT id, 1, course_id, moodle_item_id, item_name, grade, grade_max, updated_at, moodle_key, feedback FROM grades;

-- ---------- announcements ----------
CREATE TABLE announcements_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL DEFAULT 1,
  source     TEXT NOT NULL,
  ext_id     TEXT NOT NULL,
  course_id  INTEGER REFERENCES courses_new(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  author     TEXT,
  url        TEXT,
  kind       TEXT,
  created_at INTEGER NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, source, ext_id)
);
INSERT INTO announcements_new (id, user_id, source, ext_id, course_id, title, body, author, url, kind, created_at, read)
  SELECT id, 1, source, ext_id, course_id, title, body, author, url, kind, created_at, read FROM announcements;

-- ---------- study_cache ----------
CREATE TABLE study_cache_new (
  task_id    INTEGER NOT NULL REFERENCES tasks_new(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, mode)
);
INSERT INTO study_cache_new SELECT task_id, mode, content, created_at FROM study_cache;

-- Hijas primero: nada de lo nuevo apunta a las tablas viejas.
DROP TABLE study_cache;
DROP TABLE grades;
DROP TABLE announcements;
DROP TABLE tasks;
DROP TABLE courses;

ALTER TABLE courses_new RENAME TO courses;
ALTER TABLE tasks_new RENAME TO tasks;
ALTER TABLE grades_new RENAME TO grades;
ALTER TABLE announcements_new RENAME TO announcements;
ALTER TABLE study_cache_new RENAME TO study_cache;

CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id, active);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(user_id, status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_moodle_key ON tasks(user_id, moodle_key);
CREATE INDEX IF NOT EXISTS idx_grades_moodle_key ON grades(user_id, moodle_key);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(user_id, created_at DESC);

-- ---------- tablas sin UNIQUE propios: basta con la columna ----------
ALTER TABLE payments ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pensum ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reminders ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE messages ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subs ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_pensum_user ON pensum(user_id, term);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, channel, id);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id);

-- ---------- ajustes: los personales pasan a 'u<id>:clave'; los del sistema quedan igual ----------
INSERT OR IGNORE INTO settings (key, value)
  SELECT 'u1:' || key, value FROM settings
  WHERE key NOT IN ('vapid_keys', 'app_origin', 'tts_chars', 'tts_day', 'tg_secret', 'wa_display_number', 'wa_last_error', 'ai_fail_at', 'ai_fail_detail')
    AND key NOT LIKE 'llm_%' AND key NOT LIKE 'u%:%';

-- ---------- registro de envíos: también por usuario ----------
UPDATE sent_log SET key = 'u1:' || key WHERE key NOT LIKE 'u%:%';
