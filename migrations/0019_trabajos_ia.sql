-- Trabajos hechos con IA: un borrador por tarea (portada, secciones, referencias) en JSON.
CREATE TABLE IF NOT EXISTS ai_works (
  task_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  content TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
