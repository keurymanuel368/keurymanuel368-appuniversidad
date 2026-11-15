-- Datos FICTICIOS solo para el entorno de pruebas (rumbo-pruebas). Fechas relativas a hoy.
DELETE FROM grades; DELETE FROM tasks; DELETE FROM announcements; DELETE FROM courses; DELETE FROM payments; DELETE FROM pensum;
DELETE FROM uapa_classes; DELETE FROM uapa_exams; DELETE FROM notes; DELETE FROM reminders;
INSERT INTO courses (id,user_id,moodle_id,code,name,short_name,color,facilitator,progress,eva_total,eva_total_max) VALUES
 (1,1,101,'FGI-103','Lógica Computacional','Lógica','#1F5FE0','Prof. Ana Martínez',65,72,100),
 (2,1,102,'ING-103','Inglés Comunicativo','Inglés','#F59E0B','Prof. John Reyes',80,88,100),
 (3,1,103,'FGI-102','Álgebra y Geometría para Ingenieros','Álgebra','#10B981','Prof. Luis Peña',40,55,100),
 (4,1,104,'FGE-101','Metodología de la Investigación','Metodología','#EF4444','Prof. Carla Núñez',25,90,100);
INSERT INTO tasks (user_id,course_id,title,due_at,source,status,description) VALUES
 (1,1,'Tarea 3: Tablas de verdad',unixepoch()+86400*1,'manual','pending','Resolver los 10 ejercicios de la guía.'),
 (1,1,'Foro: Lógica proposicional',unixepoch()+3600*6,'manual','pending','Participa y responde a dos compañeros.'),
 (1,2,'Speaking activity: My routine',unixepoch()+86400*3,'manual','pending','Graba un audio de 2 minutos.'),
 (1,3,'Tarea 2: Vectores',unixepoch()+86400*5,'manual','pending','Ejercicios 1 al 8 del capítulo 2.'),
 (1,4,'Ensayo: Método científico',unixepoch()+86400*8,'manual','pending','Mínimo 3 páginas con referencias APA.'),
 (1,2,'Quiz Unit 2',unixepoch()-86400*2,'manual','done','Completado.'),
 (1,3,'Tarea 1: Conjuntos',unixepoch()-86400*6,'manual','done','Entregada.');
INSERT INTO grades (user_id,course_id,item_name,grade,grade_max,weight) VALUES
 (1,1,'Tarea 1',18,20,10),(1,1,'Tarea 2',15,20,10),(1,1,'Foro 1',9,10,5),
 (1,2,'Quiz Unit 1',46,50,15),(1,2,'Speaking 1',42,50,15),
 (1,3,'Tarea 1',12,20,10),(1,3,'Parcial 1',38,60,30),
 (1,4,'Ensayo 1',90,100,20);
INSERT INTO announcements (user_id,source,ext_id,course_id,title,body,author,kind,created_at,read) VALUES
 (1,'demo','a1',1,'Foro vence hoy','Recuerden participar en el foro antes de las 11:59 p. m.','Prof. Ana Martínez','foro',unixepoch()-3600*2,0),
 (1,'demo','a2',3,'Nueva nota publicada','Ya está disponible la nota del Parcial 1.','Prof. Luis Peña','nota',unixepoch()-86400,0),
 (1,'demo','a3',2,'Clase en vivo el sábado','Sesión de práctica oral a las 9:00 a. m.','Prof. John Reyes','aviso',unixepoch()-86400*2,1);
INSERT INTO payments (user_id,period,amount,paid_at,note) VALUES
 (1,'2026-09',4500,unixepoch()-86400*60,'Cuota 1'),(1,'2026-10',4500,unixepoch()-86400*30,'Cuota 2');
INSERT INTO pensum (user_id,term,code,name,credits,status,grade) VALUES
 (1,1,'FGI-101','Introducción a la Ingeniería',3,'aprobada',92),
 (1,1,'FGE-100','Lengua Española',3,'aprobada',88),
 (1,2,'FGI-102','Álgebra y Geometría para Ingenieros',4,'en_curso',NULL),
 (1,2,'FGI-103','Lógica Computacional',3,'en_curso',NULL),
 (1,2,'ING-103','Inglés Comunicativo',3,'en_curso',NULL),
 (1,3,'FGI-201','Cálculo I',4,'pendiente',NULL);
INSERT INTO uapa_classes (user_id,term,crn,code,title,day,start_min,end_min,room,building,start_date,end_date) VALUES
 (1,'202634','1472','FGI-103','Lógica Computacional',2,1080,1140,'A-201','Edificio A','2026-11-02','2027-01-17'),
 (1,'202634','2150','ING-103','Inglés Comunicativo',2,1155,1215,'B-105','Edificio B','2026-11-02','2027-01-17'),
 (1,'202634','1487','FGI-102','Álgebra y Geometría para Ingenieros',4,1080,1170,'A-203','Edificio A','2026-11-02','2027-01-17'),
 (1,'202634','2150','ING-103','Inglés Comunicativo',5,1080,1140,'B-105','Edificio B','2026-11-02','2027-01-17');
INSERT INTO uapa_exams (user_id,course,title,opens_at,closes_at) VALUES
 (1,'Lógica Computacional','Parcial 2',unixepoch()+86400*10,unixepoch()+86400*10+7200),
 (1,'Álgebra','Examen final',unixepoch()+86400*30,unixepoch()+86400*30+7200);
INSERT INTO notes (user_id,course,title,body,pinned,created_at,updated_at) VALUES
 (1,'Lógica Computacional','Conectores lógicos','AND, OR, NOT, implicación y bicondicional. Repasar tablas de verdad.',1,unixepoch()-86400*3,unixepoch()-86400*3),
 (1,'Inglés','Vocabulario Unit 2','routine, schedule, usually, sometimes, never.',0,unixepoch()-86400*5,unixepoch()-86400*5);
INSERT INTO reminders (user_id,text,remind_at,sent) VALUES (1,'Estudiar para el Parcial 2',unixepoch()+86400*7,0);
