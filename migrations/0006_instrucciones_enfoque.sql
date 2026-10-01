-- Instrucciones de cada tarea (del EVA), minutos de enfoque y preferencias de avisos.
ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN focus_minutes INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('notify_tareas', '1'), ('notify_notas', '1'), ('notify_pagos', '1'), ('notify_avisos', '1'), ('notify_resumen', '1'), ('notify_novedades', '1');
