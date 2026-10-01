-- Modo estudio con IA: respuestas guardadas por tarea (plan, tarjetas, explicación).
CREATE TABLE IF NOT EXISTS study_cache (
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, mode)
);

-- Seguridad: intentos fallidos de entrar (para bloquear por un rato a quien adivine contraseñas).
CREATE TABLE IF NOT EXISTS login_attempts (
  ip         TEXT NOT NULL,
  at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, at);

-- Hora de estudio diaria (aviso con lo que toca hoy) y logros ya celebrados.
INSERT OR IGNORE INTO settings (key, value) VALUES ('study_hour', '19'), ('study_enabled', '1'), ('achievements_seen', '');
