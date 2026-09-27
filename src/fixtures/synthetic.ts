/**
 * Fixtures sintéticos de RED-TIC (I0a).
 *
 * Contiene: 1 curso, 6 misiones, 2 estudiantes y 2 docentes ficticios.
 * NINGÚN dato corresponde a personas o establecimientos reales.
 */
import type {
  Badge,
  Course,
  Evidence,
  Indicator,
  Mission,
  PendingReview,
  Student,
  Teacher,
} from '../types'

export const course: Course = {
  id: 'curso-1m-a',
  name: '1º Medio A',
  level: '1º medio',
  year: 2026,
  programVersion: 'red-tic-2026.1',
}

export const missions: Mission[] = [
  {
    id: 'm1',
    order: 1,
    name: 'Abrir el mapa',
    prompt: '¿Qué sabemos y qué necesitamos averiguar?',
    deliverable: 'Diagnóstico y una pregunta abierta para un posible usuario.',
  },
  {
    id: 'm2',
    order: 2,
    name: 'Escuchar la señal',
    prompt: '¿Qué problema merece una solución?',
    deliverable: 'Ficha de necesidad con evidencias y fuentes revisadas.',
  },
  {
    id: 'm3',
    order: 3,
    name: 'Elegir una ruta',
    prompt: '¿Qué propuesta ofrece valor?',
    deliverable: 'Matriz de alternativas, propuesta de valor y plan.',
  },
  {
    id: 'm4',
    order: 4,
    name: 'Construir el primer puente',
    prompt: '¿Puede usarla otra persona?',
    deliverable: 'Prototipo v1 (guía, tutorial o microtaller).',
  },
  {
    id: 'm5',
    order: 5,
    name: 'Probar el puente',
    prompt: '¿Qué ocurre al probarla?',
    deliverable: 'Registro de prueba y versión 2.',
  },
  {
    id: 'm6',
    order: 6,
    name: 'Compartir la ruta',
    prompt: '¿Qué aprendimos y qué valor creamos?',
    deliverable: 'Presentación, postest y reflexión individual.',
  },
]

export const indicators: Indicator[] = [
  {
    code: 'D1',
    axis: 'D',
    name: 'Buscar y valorar información',
    descriptor: 'Formula una búsqueda, compara dos fuentes y justifica cuál sirve.',
    criterion: 'Selecciona una fuente verificable y explica al menos dos razones, señalando una limitación.',
  },
  {
    code: 'D2',
    axis: 'D',
    name: 'Organizar información y trabajar con otros',
    descriptor: 'Ordena archivos y coedita un recurso dejando visibles aportes y versiones.',
    criterion: 'El equipo recupera la versión acordada; cada estudiante identifica su contribución.',
  },
  {
    code: 'D3',
    axis: 'D',
    name: 'Crear un recurso comprensible y accesible',
    descriptor: 'Elabora una guía o material ajustado a la tarea y a su usuario.',
    criterion: 'El usuario de prueba completa el paso esencial y el equipo corrige una barrera.',
  },
  {
    code: 'D4',
    axis: 'D',
    name: 'Actuar con seguridad y respeto',
    descriptor: 'Reconoce una señal de fraude y decide qué dato no compartir.',
    criterion: 'Justifica con una señal observable y evita solicitar o guardar datos sensibles.',
  },
  {
    code: 'D5',
    axis: 'D',
    name: 'Resolver problemas con criterio tecnológico',
    descriptor: 'Compara dos maneras de resolver una dificultad de uso y verifica si usa IA.',
    criterion: 'La solución probada documenta un ajuste y no presenta una salida de IA sin verificación.',
  },
  {
    code: 'E1',
    axis: 'E',
    name: 'Detectar una oportunidad y escuchar',
    descriptor: 'Describe una dificultad expresada u observada y distingue necesidad de solución.',
    criterion: 'Presenta necesidad, usuario y contexto con al menos una evidencia.',
  },
  {
    code: 'E2',
    axis: 'E',
    name: 'Proponer valor y elegir una alternativa',
    descriptor: 'Compara al menos dos soluciones según utilidad, accesibilidad y recursos.',
    criterion: 'La elección responde a la necesidad y justifica dos criterios.',
  },
  {
    code: 'E3',
    axis: 'E',
    name: 'Movilizar recursos y planificar',
    descriptor: 'Define roles, recursos, entregas y un plan de prueba realizable.',
    criterion: 'El plan asigna responsables, tiempos y recursos, y contempla un riesgo.',
  },
  {
    code: 'E4',
    axis: 'E',
    name: 'Probar, colaborar y mejorar',
    descriptor: 'Realiza una prueba de uso y modifica el prototipo argumentando el cambio.',
    criterion: 'Identifica un resultado observado, incorpora un cambio y explica su efecto.',
  },
  {
    code: 'E5',
    axis: 'E',
    name: 'Reflexionar y comunicar el valor creado',
    descriptor: 'Explica qué aprendió, qué haría distinto y qué evidencia sostiene la utilidad.',
    criterion: 'Distingue aporte personal, evidencia de usuario y una limitación.',
  },
]

export const badges: Badge[] = [
  { id: 'b-escucha', name: 'Escucha activa', criterion: 'Diferencia necesidad expresada de suposición propia.' },
  { id: 'b-fuente', name: 'Fuente contrastada', criterion: 'Justifica una fuente y señala algo por verificar.' },
  { id: 'b-segura', name: 'Decisión segura', criterion: 'Reconoce un riesgo y retira una solicitud de dato sensible.' },
  { id: 'b-diseno', name: 'Diseño comprensible', criterion: 'Corrige una barrera de lenguaje o acceso detectada.' },
  { id: 'b-prueba', name: 'Aprender de la prueba', criterion: 'Documenta observación, cambio y comprobación pendiente.' },
  { id: 'b-reflexion', name: 'Reflexión útil', criterion: 'Nombra estrategia, evidencia y próxima mejora individual.' },
]

/** Estudiante con recorrido avanzado y varios indicadores evaluados. */
const studentZorro: Student = {
  id: 'est-01',
  pseudonym: 'Zorro-01',
  courseId: course.id,
  xpTotal: 95,
  narrativeLevel: 'Probador',
  xpEvents: [
    { missionId: 'm1', value: 20, validated: true },
    { missionId: 'm2', value: 20, validated: true },
    { missionId: 'm3', value: 20, validated: true },
    { missionId: 'm4', value: 20, validated: true },
    { missionId: 'm5', value: 15, validated: true },
  ],
  badges: [
    { badgeId: 'b-escucha', awardedAt: '2026-04-10' },
    { badgeId: 'b-fuente', awardedAt: '2026-04-17' },
    { badgeId: 'b-segura', awardedAt: '2026-04-24' },
  ],
  missions: [
    { missionId: 'm1', state: 'achieved', evidenceId: 'ev-01' },
    { missionId: 'm2', state: 'achieved', evidenceId: 'ev-02' },
    { missionId: 'm3', state: 'achieved', evidenceId: 'ev-03' },
    { missionId: 'm4', state: 'achieved', evidenceId: 'ev-04' },
    { missionId: 'm5', state: 'pending_review', evidenceId: 'ev-05' },
    { missionId: 'm6', state: 'not_started', evidenceId: null },
  ],
  assessments: [
    { indicatorCode: 'D1', level: 'achieved', comment: 'Comparó autoría y fecha de dos fuentes; señaló una afirmación por verificar.', evidenceId: 'ev-02' },
    { indicatorCode: 'D4', level: 'achieved', comment: 'Identificó la señal de fraude y no compartió la clave; verificó por otro canal.', evidenceId: 'ev-02' },
    { indicatorCode: 'D3', level: 'developing', comment: 'La secuencia es clara; falta una alternativa de ayuda para quien no completa un paso.', evidenceId: 'ev-04' },
    { indicatorCode: 'E1', level: 'developing', comment: 'Distinguiste necesidad de tu primera idea; agrega una evidencia del contexto.', evidenceId: 'ev-02' },
    { indicatorCode: 'E4', level: 'not_evaluated', comment: 'Aún sin evidencia de prueba: se observará en la misión 5.', evidenceId: null },
  ],
  reflections: [
    { missionId: 'm2', text: 'Antes suponía; ahora pregunto y anoto una evidencia antes de decidir.' },
  ],
}

/** Estudiante con recorrido inicial: útil para demostrar estados vacíos. */
const studentPuma: Student = {
  id: 'est-02',
  pseudonym: 'Puma-02',
  courseId: course.id,
  xpTotal: 20,
  narrativeLevel: 'Investigador',
  xpEvents: [{ missionId: 'm1', value: 20, validated: true }],
  badges: [{ badgeId: 'b-escucha', awardedAt: '2026-04-10' }],
  missions: [
    { missionId: 'm1', state: 'achieved', evidenceId: 'ev-11' },
    { missionId: 'm2', state: 'in_progress', evidenceId: null },
    { missionId: 'm3', state: 'not_started', evidenceId: null },
    { missionId: 'm4', state: 'not_started', evidenceId: null },
    { missionId: 'm5', state: 'not_started', evidenceId: null },
    { missionId: 'm6', state: 'not_started', evidenceId: null },
  ],
  assessments: [
    { indicatorCode: 'E1', level: 'incipient', comment: 'Formulaste una pregunta pertinente; separa ahora un dato de una suposición.', evidenceId: 'ev-11' },
  ],
  reflections: [],
}

export const students: Student[] = [studentZorro, studentPuma]

export const teachers: Teacher[] = [
  { id: 'doc-01', displayName: 'Docente Uno (ficticio)', courseId: course.id },
  { id: 'doc-02', displayName: 'Docente Dos (ficticio)', courseId: course.id },
]

export const evidences: Evidence[] = [
  { id: 'ev-01', missionId: 'm1', origin: 'student_digital', format: 'text', testModality: 'not_applicable', description: 'Diagnóstico y pregunta inicial.', createdAt: '2026-04-03' },
  { id: 'ev-02', missionId: 'm2', origin: 'student_digital', format: 'text', testModality: 'not_applicable', description: 'Ficha de necesidad y fuentes.', createdAt: '2026-04-10' },
  { id: 'ev-03', missionId: 'm3', origin: 'student_digital', format: 'image', testModality: 'not_applicable', description: 'Matriz de alternativas y plan.', createdAt: '2026-04-17' },
  { id: 'ev-04', missionId: 'm4', origin: 'student_digital', format: 'file', testModality: 'peer_simulation', description: 'Prototipo v1 (guía).', createdAt: '2026-04-24' },
  { id: 'ev-05', missionId: 'm5', origin: 'teacher_equivalent', format: 'paper', testModality: 'simulation', description: 'Registro docente de prueba en papel (equivalencia).', createdAt: '2026-05-08' },
  { id: 'ev-11', missionId: 'm1', origin: 'student_digital', format: 'text', testModality: 'not_applicable', description: 'Diagnóstico inicial.', createdAt: '2026-04-03' },
]

export const pendingReviews: PendingReview[] = [
  { id: 'rev-01', studentPseudonym: 'Zorro-01', missionId: 'm5', state: 'pending_review' },
  { id: 'rev-02', studentPseudonym: 'Puma-02', missionId: 'm2', state: 'in_progress' },
]

export const demoStudentCodes: Record<string, string> = {
  'ZORRO-01': 'est-01',
  'PUMA-02': 'est-02',
}

export const demoTeacherCodes: Record<string, string> = {
  'DOCENTE-01': 'doc-01',
  'DOCENTE-02': 'doc-02',
}
