// Catálogo de carreras de grado de la UAPA y pensums oficiales cargados en Rumbo.
// Fuente: uapa.edu.do (oferta de grado y PDF oficiales de cada pensum). Para agregar otra carrera,
// transcribe su PDF oficial a una lista como ISW_2025 y regístrala en CAREERS.

export type PensumItem = {
  term: number; code: string | null; name: string; credits: number;
  prereqs?: string; coreqs?: string; kind?: 'obligatoria' | 'optativa';
};
export type Elective = { code: string; name: string; credits: number; block: string };
export type Career = {
  id: string; name: string; area: string; unit: 'trimestre' | 'cuatrimestre';
  pensum?: { version: string; source: string; totalCredits: number; items: PensumItem[]; electives: Elective[]; notes?: string[] };
};

// Ingeniería en Software — pénsum vigente a partir de mayo 2025 (resolución 19-2025 del Consejo Académico).
const ISW_2025: PensumItem[] = [
  // 1.º
  { term: 1, code: 'CBC-103', name: 'Orientación a la Educación a Distancia Virtual', credits: 3 },
  { term: 1, code: 'CBC-105', name: 'Tecnología para el Aprendizaje Virtual', credits: 3 },
  { term: 1, code: 'CBE-109', name: 'Comunicación Oral y Escrita', credits: 4 },
  { term: 1, code: 'CBM-107', name: 'Razonamiento Lógico Matemático', credits: 4 },
  // 2.º
  { term: 2, code: 'FGI-103', name: 'Lógica Computacional', credits: 4, prereqs: 'CBM-107' },
  { term: 2, code: 'CBC-107', name: 'Ser Humano y Desarrollo Sostenible', credits: 3 },
  { term: 2, code: 'FGI-102', name: 'Álgebra y Geometría para Ingenieros', credits: 4 },
  { term: 2, code: 'ING-103', name: 'Inglés Comunicativo', credits: 3 },
  // 3.º
  { term: 3, code: 'CBE-110', name: 'Análisis y Producción de Textos', credits: 4 },
  { term: 3, code: 'FGI-104', name: 'Programación I', credits: 4, prereqs: 'FGI-103' },
  { term: 3, code: 'FGM-102', name: 'Análisis Matemático I', credits: 5 },
  { term: 3, code: 'FGM-205', name: 'Matemática Discreta', credits: 3 },
  // 4.º
  { term: 4, code: 'FGC-105', name: 'Metodología de la Investigación Científica', credits: 4 },
  { term: 4, code: 'FGI-106', name: 'Sistema de Base de Datos', credits: 4 },
  { term: 4, code: 'FGI-105', name: 'Programación II', credits: 4, prereqs: 'FGI-104' },
  { term: 4, code: 'FGM-103', name: 'Análisis Matemático II', credits: 5, prereqs: 'FGM-102' },
  // 5.º
  { term: 5, code: 'FGC-203', name: 'Filosofía y Sociedad', credits: 3 },
  { term: 5, code: 'ISW-305', name: 'Estructura de Datos y Algoritmos', credits: 4 },
  { term: 5, code: 'ING-213', name: 'Inglés Técnico para Ingenieros', credits: 3, prereqs: 'ING-103' },
  { term: 5, code: 'FGC-204', name: 'Investigación Aplicada', credits: 4, prereqs: 'FGC-105' },
  // 6.º
  { term: 6, code: 'FGF-201', name: 'Física General', credits: 4 },
  { term: 6, code: 'LAF-201', name: 'Práctica de Física General', credits: 1, coreqs: 'FGF-201' },
  { term: 6, code: 'ISW-204', name: 'Diseño de Interfaz de Usuario', credits: 4, prereqs: 'FGI-105' },
  { term: 6, code: 'ISW-201', name: 'Ingeniería de Software I', credits: 4 },
  // 7.º
  { term: 7, code: 'FGC-106', name: 'Historia Social Dominicana', credits: 3 },
  { term: 7, code: 'ISW-202', name: 'Ingeniería de Software II', credits: 4, prereqs: 'ISW-201' },
  { term: 7, code: 'ISW-306', name: 'Desarrollo de Aplicaciones Web', credits: 4, prereqs: 'FGI-105' },
  { term: 7, code: null, name: 'Optativa 1', credits: 3, kind: 'optativa' },
  // 8.º
  { term: 8, code: 'FGM-206', name: 'Álgebra Lineal', credits: 4 },
  { term: 8, code: 'FGI-209', name: 'Electrónica Básica', credits: 4, prereqs: 'FGF-201' },
  { term: 8, code: 'ISW-203', name: 'Calidad de Software', credits: 4 },
  { term: 8, code: null, name: 'Optativa 2', credits: 3, kind: 'optativa' },
  // 9.º
  { term: 9, code: 'FGC-208', name: 'Educación Constitucional', credits: 3 },
  { term: 9, code: 'FGM-314', name: 'Matemática Numérica', credits: 4 },
  { term: 9, code: 'FGI-210', name: 'Arquitectura de Hardware', credits: 4, prereqs: 'FGI-209' },
  { term: 9, code: 'FGM-207', name: 'Estadística y Probabilidades', credits: 4 },
  // 10.º
  { term: 10, code: 'FGC-409', name: 'Ética Profesional', credits: 3 },
  { term: 10, code: 'INF-304', name: 'Informática Gerencial', credits: 4 },
  { term: 10, code: 'ISW-412', name: 'Minería de Datos', credits: 4, prereqs: 'FGM-207' },
  { term: 10, code: null, name: 'Optativa 3', credits: 3, kind: 'optativa' },
  // 11.º
  { term: 11, code: 'FGI-312', name: 'Redes y Servicios Telemáticos', credits: 4 },
  { term: 11, code: 'LAT-312', name: 'Laboratorio de Redes y Servicios Telemáticos', credits: 1, coreqs: 'FGI-312' },
  { term: 11, code: 'ISW-309', name: 'Inteligencia Artificial', credits: 4, prereqs: 'ISW-412' },
  { term: 11, code: 'ISW-310', name: 'Sistemas Distribuidos', credits: 4 },
  // 12.º
  { term: 12, code: 'COE-101', name: 'Contabilidad I', credits: 4 },
  { term: 12, code: 'CID-115', name: 'Procesamiento del Lenguaje Natural', credits: 4, prereqs: 'ISW-309' },
  // El PDF oficial indica "FGI-311", clave que no existe en el pensum; se toma Redes (FGI-312), del trimestre anterior.
  { term: 12, code: 'ISW-420', name: 'Ciberseguridad', credits: 4, prereqs: 'FGI-312' },
  { term: 12, code: 'LAS-313', name: 'Laboratorio de Ciberseguridad', credits: 1, coreqs: 'ISW-420' },
  // 13.º
  { term: 13, code: 'INF-408', name: 'Investigación de Operaciones', credits: 4 },
  { term: 13, code: 'ISW-425', name: 'Programación Multiplataforma para Dispositivos Móviles', credits: 4 },
  { term: 13, code: 'LAP-425', name: 'Laboratorio de Programación Multiplataforma para Dispositivos Móviles', credits: 1, coreqs: 'ISW-425' },
  { term: 13, code: 'ISW-304', name: 'Desarrollo de Proyectos con Software Libre', credits: 4, prereqs: 'ISW-306' },
  // 14.º
  { term: 14, code: 'ISW-414', name: 'Fundamentos de Inteligencia de Negocios', credits: 4 },
  { term: 14, code: 'ISW-413', name: 'Simulación Digital', credits: 4 },
  { term: 14, code: 'ISW-415', name: 'Ingeniería Robótica para Software Virtuales I', credits: 4, prereqs: 'ISW-304' },
  { term: 14, code: 'LAR-415', name: 'Laboratorio de Robótica para Software Virtuales I', credits: 1, coreqs: 'ISW-415' },
  { term: 14, code: 'PPS-400', name: 'Práctica Profesional (Pasantía)', credits: 8, prereqs: 'ISW-304' },
  // 15.º
  { term: 15, code: 'INF-307', name: 'Gestión del Conocimiento y la Toma de Decisiones', credits: 4 },
  { term: 15, code: 'ISW-416', name: 'Ingeniería Robótica para Software Virtuales II', credits: 4, prereqs: 'ISW-415' },
  { term: 15, code: 'LAR-416', name: 'Laboratorio de Robótica para Software Virtuales II', credits: 1, coreqs: 'ISW-416' },
  { term: 15, code: 'ISW-417', name: 'Seminario de Proyectos de Software', credits: 4 },
  // 16.º
  { term: 16, code: 'ISW-400', name: 'Curso Final de Grado', credits: 6, prereqs: 'TODAS' },
];

const ISW_ELECTIVES: Elective[] = [
  { code: 'ISW-431', name: 'Blockchain y Aplicaciones Descentralizadas', credits: 3, block: 'Propias de la carrera' },
  { code: 'ISW-432', name: 'Administración de Servidores y Servicios Telemáticos', credits: 3, block: 'Propias de la carrera' },
  { code: 'ISW-423', name: 'Scrum Master', credits: 3, block: 'Propias de la carrera' },
  { code: 'ISW-424', name: 'Computación Cuántica y Algoritmos Avanzados', credits: 3, block: 'Propias de la carrera' },
  { code: 'FGN-309', name: 'Metodologías de Emprendimiento', credits: 3, block: 'Certificación en Emprendimiento' },
  { code: 'ADM-316', name: 'Formulación y Creación de Proyectos Emprendedores', credits: 3, block: 'Certificación en Emprendimiento' },
  { code: 'CON-334', name: 'Finanzas Básicas para Emprendedores', credits: 3, block: 'Certificación en Emprendimiento' },
  { code: 'FGP-421', name: 'Coaching', credits: 3, block: 'Certificación en Gestión y Liderazgo' },
  { code: 'PSG-419', name: 'Gestión de Conflictos y Mediación', credits: 3, block: 'Certificación en Gestión y Liderazgo' },
  { code: 'ADM-314', name: 'Liderazgo y Gestión de Equipos', credits: 3, block: 'Certificación en Gestión y Liderazgo' },
];

const T = 'trimestre' as const;

export const CAREERS: Career[] = [
  { id: 'isw', name: 'Ingeniería en Software', area: 'Ingeniería y Tecnología', unit: T, pensum: {
    version: 'Pénsum vigente desde mayo 2025 (resolución 19-2025)',
    source: 'https://www.uapa.edu.do/wp-content/uploads/2022/01/INGENIERIA-EN-SOFTWARE-5.pdf',
    totalCredits: 225, items: ISW_2025, electives: ISW_ELECTIVES,
    notes: [
      'Servicio Social Universitario de 60 horas (requiere el 6.º trimestre aprobado).',
      '9 créditos de optativas y una certificación en Emprendimiento o en Gestión y Liderazgo.',
      'Índice acumulado de 70 o más para graduarte, inglés B1 antes del Curso Final de Grado y 2 eventos científicos.',
    ],
  } },
  { id: 'cdatos', name: 'Ciencia de Datos', area: 'Ingeniería y Tecnología', unit: T },
  { id: 'infger', name: 'Informática Gerencial', area: 'Ingeniería y Tecnología', unit: T },
  { id: 'derecho', name: 'Derecho', area: 'Ciencias Jurídicas y Políticas', unit: T },
  { id: 'adm', name: 'Administración de Empresas', area: 'Negocios y Turismo', unit: T },
  { id: 'admtur', name: 'Administración de Empresas Turísticas', area: 'Negocios y Turismo', unit: T },
  { id: 'conta', name: 'Contabilidad Empresarial', area: 'Negocios y Turismo', unit: T },
  { id: 'lenguas', name: 'Lenguas Modernas Mención Turismo', area: 'Negocios y Turismo', unit: T },
  { id: 'mercadeo', name: 'Mercadeo', area: 'Negocios y Turismo', unit: T },
  { id: 'enfermeria', name: 'Enfermería', area: 'Ciencias de la Salud y Psicología', unit: T },
  { id: 'psico', name: 'Psicología', area: 'Ciencias de la Salud y Psicología', unit: T },
  { id: 'psicocli', name: 'Psicología Clínica', area: 'Ciencias de la Salud y Psicología', unit: T },
  { id: 'psicoedu', name: 'Psicología Educativa', area: 'Ciencias de la Salud y Psicología', unit: T },
  { id: 'psicoind', name: 'Psicología Industrial', area: 'Ciencias de la Salud y Psicología', unit: T },
  { id: 'eduart', name: 'Educación Artística', area: 'Educación y Formación General', unit: T },
  { id: 'eduini', name: 'Educación Inicial', area: 'Educación y Formación General', unit: T },
  { id: 'edufra', name: 'Educación Mención Lenguas Extranjeras (Francés)', area: 'Educación y Formación General', unit: T },
  { id: 'eduing', name: 'Educación Mención Lenguas Extranjeras (Inglés)', area: 'Educación y Formación General', unit: T },
  { id: 'eduprim', name: 'Educación Primaria, Primer Ciclo', area: 'Educación y Formación General', unit: T },
  { id: 'edulen', name: 'Educación Secundaria: Lengua Española y Literatura', area: 'Educación y Formación General', unit: T },
  { id: 'edumat', name: 'Educación Secundaria: Matemática y Física', area: 'Educación y Formación General', unit: T },
  { id: 'perio', name: 'Periodismo Digital', area: 'Ciencias Sociales y Comunicación', unit: T },
];

export function findCareer(id: string): Career | undefined {
  return CAREERS.find((c) => c.id === id);
}
