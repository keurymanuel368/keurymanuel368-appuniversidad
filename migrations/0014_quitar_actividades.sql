-- Actividades que no cuentan para el promedio: la rúbrica de actitudes y valores, el espacio para enviar
-- tareas fuera de fecha (no se corrigen) o cualquiera que quites tú desde Notas o desde la tarea.
-- ignored: NULL = lo decide Rumbo por el nombre · 1 = quitada · 0 = la quieres contar aunque el nombre parezca de las que no cuentan.
-- Una tarea quitada pasa a status = 'ignored' (sale de pendientes, entregadas, recordatorios y widget)
-- y la sincronización del EVA no la vuelve a crear ni la cambia.
ALTER TABLE tasks ADD COLUMN ignored INTEGER;
ALTER TABLE grades ADD COLUMN ignored INTEGER;

UPDATE tasks SET status = 'ignored'
  WHERE ignored IS NULL AND status != 'ignored'
    AND (lower(title) LIKE '%actitudes y valores%' OR lower(title) LIKE '%fuera de fecha%' OR lower(title) LIKE '%fuera de plazo%' OR lower(title) LIKE '%fuera del plazo%');
