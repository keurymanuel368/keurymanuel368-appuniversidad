-- Datos reales de Mi UAPA / DEA de Manuel (trimestre 202634), importados el 2026-10-25 desde su sesión de Banner.
INSERT OR REPLACE INTO uapa_classes (user_id, term, crn, code, title, day, start_min, end_min, room, building, start_date, end_date) VALUES
 (1, '202634', '1472', 'FGI-103', 'Lógica Computacional', 2, 1080, 1140, NULL, NULL, '2026-11-02', '2027-01-17'),
 (1, '202634', '2150', 'ING-103', 'Inglés Comunicativo', 2, 1155, 1215, NULL, NULL, '2026-11-02', '2027-01-17'),
 (1, '202634', '1487', 'FGI-102', 'Álgebra y Geometría para Ingenieros', 2, 1230, 1290, NULL, NULL, '2026-11-02', '2027-01-17'),
 (1, '202634', '1332', 'CBC-107', 'Ser Humano y Desarrollo Sostenible', 5, 630, 690, 'SMC408', 'EAYPSD', '2026-11-02', '2027-01-17');
INSERT OR REPLACE INTO uapa_exams (user_id, course, title, opens_at, closes_at) VALUES
 (1, '202633-CBE109-HV4-2349-0', 'PRUEBA DE EVALUACIÓN FINAL: Comunicación Oral y Escrita', 1792238400, 1792256400),
 (1, '202633-CBM107-HV5-2246-0', 'PRUEBA DE EVALUACIÓN FINAL: Razonamiento Lógico Matemático', 1792238400, 1792256400);
INSERT OR REPLACE INTO settings (key, value) VALUES
 ('u1:uapa_synced_at', '1792941600'),
 ('u1:uapa_projection', '[{"code":"CBC-107","title":"Ser Humano y Desarrollo Sostenible"},{"code":"CBE-110","title":"Análisis y Producción de Texto"},{"code":"COE-101","title":"Contabilidad I"},{"code":"FGC-105","title":"Metodología de la Investigación"},{"code":"FGC-106","title":"Historia Social Dominicana"},{"code":"FGC-203","title":"Filosofía y Sociedad"},{"code":"FGC-208","title":"Educación constitucional"},{"code":"FGC-409","title":"Ética Profesional"},{"code":"LAF-201","title":"Práctica de Física General"},{"code":"FGF-201","title":"Física General"}]');
