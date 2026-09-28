import { createHash } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

export const PROJECT = 'demo-red-tic'
const PEPPER = process.env.CODE_PEPPER || 'emulator-synthetic-pepper'

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT })
}
export const adminDb = getFirestore()
export const adminAuth = getAuth()

export function hashCode(code: string): string {
  return createHash('sha256').update(`${PEPPER}:${code.trim().toUpperCase()}:${PEPPER}`).digest('hex')
}

export const IDS = {
  institution: 'inst-1',
  programVersion: 'pv-2026',
  courseX: 'course-x',
  courseY: 'course-y',
  mission1: 'mission-1',
  mission2: 'mission-2',
  mission3: 'mission-3',
  mission4: 'mission-4',
  mission5: 'mission-5',
  mission6: 'mission-6',
  milestone1: 'milestone-1',
  milestone2: 'milestone-2',
  milestone3: 'milestone-3',
  milestone4: 'milestone-4',
  milestone5: 'milestone-5',
  milestone6: 'milestone-6',
  indicatorD1: 'D1',
  indicatorD2: 'D2',
  indicatorD3: 'D3',
  indicatorD4: 'D4',
  indicatorD5: 'D5',
  indicatorE1: 'E1',
  indicatorE2: 'E2',
  indicatorE3: 'E3',
  indicatorE4: 'E4',
  indicatorE5: 'E5',
  teamX: 'team-x',
  teamY: 'team-y',
  s1: 'enr-s1',
  s2: 'enr-s2',
  s3: 'enr-s3',
  s4: 'enr-s4',
  s5: 'enr-s5',
  s6: 'enr-s6',
  s7: 'enr-s7',
  s8: 'enr-s8',
  s9: 'enr-s9',
  s10: 'enr-s10',
  s11: 'enr-s11',
  s12: 'enr-s12',
  t1: 'teacher-1',
  t2: 'teacher-2',
  t3: 'teacher-3',
  codeS1: 'ZORRO-01',
  codeS2: 'PUMA-02',
  codeS3: 'CONDOR-03',
  codeS4: 'PUDU-04',
  codeS5: 'GATO-05',
  codeS6: 'RANA-06',
  codeS7: 'LOBO-07',
  codeS8: 'TIGRE-08',
  codeS9: 'MONO-09',
  codeS10: 'CUERVO-10',
  codeS11: 'HALCON-11',
  codeS12: 'GARZA-12',
}

const future = () => Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000)

async function clearAll(): Promise<void> {
  await adminDb.recursiveDelete(adminDb.collection('deliveries'))
  await adminDb.recursiveDelete(adminDb.collection('teams'))
  await adminDb.recursiveDelete(adminDb.collection('diagnosisAttempts'))

  const collections = [
    'institutions', 'programVersions', 'courses', 'missions', 'milestones', 'indicators', 'badges',
    'teachers', 'teacherCourses', 'enrollments', 'codeCredentials', 'sessionBindings',
    'assessments', 'assessmentHistory', 'xpEvents', 'badgeAwards', 'deliveryHistory',
    'conditionsSurveys', 'diagnosisReviewHistory', 'teacherDemoCodes',
    'uploadReservations', 'redeemRate', 'redeemAttempts', 'auditLogs',
  ]
  for (const c of collections) {
    const snap = await adminDb.collection(c).get()
    if (snap.empty) continue
    const batch = adminDb.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/** Semilla 100 % sintética: 2 estudiantes del mismo curso, 1 de otro y 2 docentes (+1 inactivo). */
export async function seedSynthetic(): Promise<void> {
  await clearAll()
  const b = adminDb.batch()

  b.set(adminDb.doc(`institutions/${IDS.institution}`), { name: 'Colegio Innovador del Futuro (ficticio)', status: 'active' })
  b.set(adminDb.doc(`programVersions/${IDS.programVersion}`), { label: 'red-tic-2026.1' })
  b.set(adminDb.doc(`courses/${IDS.courseX}`), { institutionId: IDS.institution, name: '1º Medio A', level: '1º medio', year: 2026, programVersionId: IDS.programVersion, status: 'active' })
  b.set(adminDb.doc(`courses/${IDS.courseY}`), { institutionId: IDS.institution, name: '1º Medio B', level: '1º medio', year: 2026, programVersionId: IDS.programVersion, status: 'active' })

  // Seis misiones (Fase 6). Cada misión tiene un hito con consigna, indicadores, XP y modalidades.
  // XP por misión = suma de las acciones de Fase 7: M1 20, M2 35 (20+15), M3 20, M4 20, M5 45 (20+25), M6 20 = 160.
  b.set(adminDb.doc(`missions/${IDS.mission1}`), { programVersionId: IDS.programVersion, order: 1, name: 'Abrir el mapa', prompt: '¿Qué sabemos y qué necesitamos averiguar?', deliverable: 'Una pregunta abierta para un posible usuario.', status: 'active' })
  b.set(adminDb.doc(`missions/${IDS.mission2}`), { programVersionId: IDS.programVersion, order: 2, name: 'Escuchar la señal', prompt: '¿Qué problema merece una solución?', deliverable: 'Ficha de necesidad con evidencias y fuentes revisadas.', status: 'active' })
  b.set(adminDb.doc(`missions/${IDS.mission3}`), { programVersionId: IDS.programVersion, order: 3, name: 'Elegir una ruta', prompt: '¿Qué propuesta ofrece valor?', deliverable: 'Matriz de alternativas, propuesta de valor y plan.', status: 'active' })
  b.set(adminDb.doc(`missions/${IDS.mission4}`), { programVersionId: IDS.programVersion, order: 4, name: 'Construir el primer puente', prompt: '¿Puede usarla otra persona?', deliverable: 'Prototipo v1 (guía, tutorial o microtaller).', status: 'active' })
  b.set(adminDb.doc(`missions/${IDS.mission5}`), { programVersionId: IDS.programVersion, order: 5, name: 'Probar el puente', prompt: '¿Qué ocurre al probarla?', deliverable: 'Registro de prueba y versión 2.', status: 'active' })
  b.set(adminDb.doc(`missions/${IDS.mission6}`), { programVersionId: IDS.programVersion, order: 6, name: 'Compartir la ruta', prompt: '¿Qué aprendimos y qué valor creamos?', deliverable: 'Presentación y reflexión individual.', status: 'active' })

  b.set(adminDb.doc(`milestones/${IDS.milestone1}`), { missionId: IDS.mission1, order: 1, title: 'Pregunta abierta', xpValue: 20, indicatorCodes: [IDS.indicatorD1, IDS.indicatorE1], modalities: ['text'], requiresDiagnosis: true, guidance: 'Escribe una pregunta abierta que le harías a un posible usuario; separa lo que sabes de lo que supones. El hito se acredita con el diagnóstico entregado (o una barrera técnica registrada) y la pregunta; el puntaje del diagnóstico no afecta el XP.' })
  b.set(adminDb.doc(`milestones/${IDS.milestone2}`), { missionId: IDS.mission2, order: 1, title: 'Ficha de necesidad', xpValue: 35, indicatorCodes: [IDS.indicatorD1], modalities: ['text', 'file'], evidenceChecklist: ['Formular la necesidad (destinatario, tarea, obstáculo y evidencia).', 'Contrastar dos fuentes y señalar una afirmación por verificar.'], guidance: 'Formula la necesidad y contrasta dos fuentes. El bloque de 35 XP (necesidad 20 + contraste 15) se acredita con evidencia de ambas acciones.' })
  b.set(adminDb.doc(`milestones/${IDS.milestone3}`), { missionId: IDS.mission3, order: 1, title: 'Alternativas y plan', xpValue: 20, indicatorCodes: [IDS.indicatorE2, IDS.indicatorE3], modalities: ['text', 'file'], guidance: 'Compara al menos dos alternativas (utilidad, accesibilidad, recursos), elige una con una razón, escribe la propuesta de valor y un plan mínimo con responsables.' })
  b.set(adminDb.doc(`milestones/${IDS.milestone4}`), { missionId: IDS.mission4, order: 1, title: 'Prototipo v1', xpValue: 20, indicatorCodes: [IDS.indicatorD3, IDS.indicatorD4], modalities: ['file', 'text'], guidance: 'Produce una versión mínima (guía, tutorial o microtaller) que otra persona pueda intentar usar: lenguaje claro, pasos visibles y sin datos sensibles.' })
  b.set(adminDb.doc(`milestones/${IDS.milestone5}`), { missionId: IDS.mission5, order: 1, title: 'Prueba y versión 2', xpValue: 45, indicatorCodes: [IDS.indicatorD3, IDS.indicatorD5, IDS.indicatorE4], modalities: ['file', 'text'], evidenceChecklist: ['Registrar una observación de uso (tarea lograda/no lograda).', 'Documentar el cambio de la versión 2 y su efecto.'], guidance: 'Observa a alguien usando el prototipo, registra un hallazgo (observación, no inferencia) y modifica la versión 2 explicando el cambio y su efecto. El bloque de 45 XP (probar 20 + revisar v2 25) se acredita con evidencia de ambas acciones.' })
  b.set(adminDb.doc(`milestones/${IDS.milestone6}`), { missionId: IDS.mission6, order: 1, title: 'Presentación y reflexión', xpValue: 20, indicatorCodes: [IDS.indicatorD1, IDS.indicatorE5], modalities: ['text', 'file'], guidance: 'Presenta problema, evidencia, solución, prueba y límite; reflexiona qué mejorarías y qué evidencia sostiene la utilidad.' })

  const indicatorSeed: Array<[string, 'D' | 'E', string, string, string]> = [
    ['D1', 'D', 'Buscar y valorar información', 'Formula una búsqueda, compara dos fuentes y justifica cuál sirve.', 'Selecciona una fuente verificable y explica al menos dos razones, señalando una limitación.'],
    ['D2', 'D', 'Organizar información y trabajar con otros', 'Ordena archivos y coedita un recurso dejando visibles aportes y versiones.', 'El equipo recupera la versión acordada; cada estudiante identifica su contribución.'],
    ['D3', 'D', 'Crear un recurso comprensible y accesible', 'Elabora una guía o material ajustado a la tarea y a su usuario.', 'El usuario de prueba completa el paso esencial y el equipo corrige una barrera.'],
    ['D4', 'D', 'Actuar con seguridad y respeto', 'Reconoce una señal de fraude y decide qué dato no compartir.', 'Justifica con una señal observable y evita solicitar o guardar datos sensibles.'],
    ['D5', 'D', 'Resolver problemas con criterio tecnológico', 'Compara dos maneras de resolver una dificultad de uso y verifica si usa IA.', 'La solución probada documenta un ajuste y no presenta una salida de IA sin verificación.'],
    ['E1', 'E', 'Detectar una oportunidad y escuchar', 'Describe una dificultad expresada u observada y distingue necesidad de solución.', 'Presenta necesidad, usuario y contexto con al menos una evidencia.'],
    ['E2', 'E', 'Proponer valor y elegir una alternativa', 'Compara al menos dos soluciones según utilidad, accesibilidad y recursos.', 'La elección responde a la necesidad y justifica dos criterios.'],
    ['E3', 'E', 'Movilizar recursos y planificar', 'Define roles, recursos, entregas y un plan de prueba realizable.', 'El plan asigna responsables, tiempos y recursos, y contempla un riesgo.'],
    ['E4', 'E', 'Probar, colaborar y mejorar', 'Realiza una prueba de uso y modifica el prototipo argumentando el cambio.', 'Identifica un resultado observado, incorpora un cambio y explica su efecto.'],
    ['E5', 'E', 'Reflexionar y comunicar el valor creado', 'Explica qué aprendió, qué haría distinto y qué evidencia sostiene la utilidad.', 'Distingue aporte personal, evidencia de usuario y una limitación.'],
  ]
  for (const [code, axis, name, descriptor, criterion] of indicatorSeed) {
    b.set(adminDb.doc(`indicators/${code}`), { code, axis, name, descriptor, criterion })
  }
  b.set(adminDb.doc('badges/badge-1'), { code: 'escucha', name: 'Escucha activa', criterion: 'Diferencia necesidad de suposición.' })

  b.set(adminDb.doc(`teachers/${IDS.t1}`), { displayName: 'Docente Uno (ficticio)', status: 'active' })
  b.set(adminDb.doc(`teachers/${IDS.t2}`), { displayName: 'Docente Dos (ficticio)', status: 'active' })
  b.set(adminDb.doc(`teachers/${IDS.t3}`), { displayName: 'Docente Tres (inactivo, ficticio)', status: 'inactive' })
  b.set(adminDb.doc(`teacherCourses/${IDS.t1}_${IDS.courseX}`), { teacherUid: IDS.t1, courseId: IDS.courseX, role: 'facilitator' })
  b.set(adminDb.doc(`teacherCourses/${IDS.t2}_${IDS.courseY}`), { teacherUid: IDS.t2, courseId: IDS.courseY, role: 'facilitator' })
  b.set(adminDb.doc(`teacherCourses/${IDS.t3}_${IDS.courseX}`), { teacherUid: IDS.t3, courseId: IDS.courseX, role: 'facilitator' })
  // Códigos docentes de demostración (solo emuladores): resuelven a un docente activo.
  b.set(adminDb.doc('teacherDemoCodes/DOCENTE-01'), { code: 'DOCENTE-01', teacherUid: IDS.t1, courseId: IDS.courseX })
  b.set(adminDb.doc('teacherDemoCodes/DOCENTE-02'), { code: 'DOCENTE-02', teacherUid: IDS.t2, courseId: IDS.courseY })

  b.set(adminDb.doc(`enrollments/${IDS.s1}`), { courseId: IDS.courseX, pseudonym: 'Zorro-01', state: 'active', activeCodeHash: hashCode(IDS.codeS1), surveySubmitted: true })
  b.set(adminDb.doc(`enrollments/${IDS.s2}`), { courseId: IDS.courseX, pseudonym: 'Puma-02', state: 'active', activeCodeHash: hashCode(IDS.codeS2) })
  b.set(adminDb.doc(`enrollments/${IDS.s3}`), { courseId: IDS.courseY, pseudonym: 'Condor-03', state: 'active', activeCodeHash: hashCode(IDS.codeS3) })
  b.set(adminDb.doc(`enrollments/${IDS.s4}`), { courseId: IDS.courseX, pseudonym: 'Pudu-04', state: 'active', activeCodeHash: hashCode(IDS.codeS4) })
  b.set(adminDb.doc(`enrollments/${IDS.s5}`), { courseId: IDS.courseX, pseudonym: 'Gato-05', state: 'active', activeCodeHash: hashCode(IDS.codeS5) })
  b.set(adminDb.doc(`enrollments/${IDS.s6}`), { courseId: IDS.courseX, pseudonym: 'Rana-06', state: 'active', activeCodeHash: hashCode(IDS.codeS6) })
  b.set(adminDb.doc(`enrollments/${IDS.s7}`), { courseId: IDS.courseX, pseudonym: 'Lobo-07', state: 'active', activeCodeHash: hashCode(IDS.codeS7) })
  b.set(adminDb.doc(`enrollments/${IDS.s8}`), { courseId: IDS.courseX, pseudonym: 'Tigre-08', state: 'active', activeCodeHash: hashCode(IDS.codeS8) })
  b.set(adminDb.doc(`enrollments/${IDS.s9}`), { courseId: IDS.courseX, pseudonym: 'Mono-09', state: 'active', activeCodeHash: hashCode(IDS.codeS9) })
  b.set(adminDb.doc(`enrollments/${IDS.s10}`), { courseId: IDS.courseX, pseudonym: 'Cuervo-10', state: 'active', activeCodeHash: hashCode(IDS.codeS10) })
  b.set(adminDb.doc(`enrollments/${IDS.s11}`), { courseId: IDS.courseX, pseudonym: 'Halcón-11', state: 'active', activeCodeHash: hashCode(IDS.codeS11) })
  b.set(adminDb.doc(`enrollments/${IDS.s12}`), { courseId: IDS.courseX, pseudonym: 'Garza-12', state: 'active', activeCodeHash: hashCode(IDS.codeS12) })

  for (const [code, enrollmentId, courseId] of [
    [IDS.codeS1, IDS.s1, IDS.courseX],
    [IDS.codeS2, IDS.s2, IDS.courseX],
    [IDS.codeS3, IDS.s3, IDS.courseY],
    [IDS.codeS4, IDS.s4, IDS.courseX],
    [IDS.codeS5, IDS.s5, IDS.courseX],
    [IDS.codeS6, IDS.s6, IDS.courseX],
    [IDS.codeS7, IDS.s7, IDS.courseX],
    [IDS.codeS8, IDS.s8, IDS.courseX],
    [IDS.codeS9, IDS.s9, IDS.courseX],
    [IDS.codeS10, IDS.s10, IDS.courseX],
    [IDS.codeS11, IDS.s11, IDS.courseX],
    [IDS.codeS12, IDS.s12, IDS.courseX],
  ] as const) {
    b.set(adminDb.doc(`codeCredentials/${hashCode(code)}`), { enrollmentId, courseId, state: 'active', issuedAt: Timestamp.now(), expiresAt: future(), failedAttempts: 0, lockedUntil: null })
  }

  b.set(adminDb.doc(`teams/${IDS.teamX}`), { courseId: IDS.courseX, name: 'Equipo Zorro-Puma' })
  b.set(adminDb.doc(`teams/${IDS.teamX}/members/${IDS.s1}`), { role: 'facilitación' })
  b.set(adminDb.doc(`teams/${IDS.teamX}/members/${IDS.s2}`), { role: 'diseño' })
  b.set(adminDb.doc(`teams/${IDS.teamY}`), { courseId: IDS.courseY, name: 'Equipo de otro curso' })
  b.set(adminDb.doc(`teams/${IDS.teamY}/members/${IDS.s3}`), { role: 'miembro' })

  // Entregas y valoraciones sintéticas para que «Mi recorrido» y «Mis aprendizajes» tengan datos.
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone1}`), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s1, milestoneId: IDS.milestone1, scope: 'individual',
    teamId: null, state: 'in_progress', currentEvidenceId: 'ev1', evidenceCount: 1,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone1}/evidence/ev1`), {
    version: 1, origin: 'student_digital', format: 'text', testModality: 'not_applicable',
    description: 'Diagnóstico de Zorro-01', submitKey: 'ev1', createdBy: IDS.s1, createdAt: Timestamp.now(), deletedAt: null,
  })
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone2}`), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s1, milestoneId: IDS.milestone2, scope: 'team',
    teamId: IDS.teamX, state: 'pending_review', currentEvidenceId: 'ev-team', evidenceCount: 1,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`deliveries/${IDS.s1}_${IDS.milestone2}/evidence/ev-team`), {
    version: 1, origin: 'student_digital', format: 'file', testModality: 'peer_simulation',
    description: 'Ficha del equipo', submitKey: 'ev-team', createdBy: IDS.s1, createdAt: Timestamp.now(), deletedAt: null,
  })
  b.set(adminDb.doc('deliveries/xc-course'), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s1, milestoneId: IDS.milestone1, scope: 'team',
    teamId: IDS.teamY, state: 'in_progress', currentEvidenceId: null, evidenceCount: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  // Entrega de otro curso (course Y) para probar el aislamiento entre cursos.
  b.set(adminDb.doc(`deliveries/${IDS.s3}_${IDS.milestone2}`), {
    courseId: IDS.courseY, ownerEnrollmentId: IDS.s3, milestoneId: IDS.milestone2, scope: 'individual',
    teamId: null, state: 'in_progress', currentEvidenceId: null, evidenceCount: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  // Entrega individual por revisar (Lobo-07) para la revisión docente de I2b.
  b.set(adminDb.doc(`deliveries/${IDS.s7}_${IDS.milestone2}`), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s7, milestoneId: IDS.milestone2, scope: 'individual',
    teamId: null, state: 'pending_review', currentEvidenceId: 'ev-s7', evidenceCount: 1,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`deliveries/${IDS.s7}_${IDS.milestone2}/evidence/ev-s7`), {
    version: 1, origin: 'student_digital', format: 'text', testModality: 'not_applicable',
    description: 'Ficha de necesidad de Lobo-07: las personas mayores no encuentran el botón de reserva.',
    supports: [], submitKey: 'ev-s7', createdBy: IDS.s7, createdAt: Timestamp.now(), deletedAt: null,
  })
  // Entrega en proceso con un ajuste ya pedido (Mono-09): el estudiante debe enviar una nueva versión.
  b.set(adminDb.doc(`deliveries/${IDS.s9}_${IDS.milestone2}`), {
    courseId: IDS.courseX, ownerEnrollmentId: IDS.s9, milestoneId: IDS.milestone2, scope: 'individual',
    teamId: null, state: 'in_progress', currentEvidenceId: 'ev-s9', evidenceCount: 1,
    adjustment: { action: 'Añade una fuente y di qué confirmarías.', by: IDS.t1, at: Timestamp.now() },
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`deliveries/${IDS.s9}_${IDS.milestone2}/evidence/ev-s9`), {
    version: 1, origin: 'student_digital', format: 'text', testModality: 'not_applicable',
    description: 'Ficha de necesidad de Mono-09 (versión 1).',
    supports: [], submitKey: 'ev-s9', createdBy: IDS.s9, createdAt: Timestamp.now(), deletedAt: null,
  })

  b.set(adminDb.doc(`xpEvents/${IDS.s1}_${IDS.milestone1}_${IDS.programVersion}`), {
    courseId: IDS.courseX, enrollmentId: IDS.s1, milestoneId: IDS.milestone1, programVersionId: IDS.programVersion,
    xpValue: 20, validatedBy: IDS.t1, validatedAt: Timestamp.now(), revokedAt: null,
  })
  b.set(adminDb.doc(`badgeAwards/${IDS.s1}_badge-1`), { enrollmentId: IDS.s1, badgeId: 'badge-1', evidenceId: 'ev1', validatedBy: IDS.t1, awardedAt: Timestamp.now() })

  b.set(adminDb.doc(`assessments/${IDS.s1}_${IDS.milestone1}_${IDS.indicatorD1}`), {
    courseId: IDS.courseX, enrollmentId: IDS.s1, indicatorCode: IDS.indicatorD1, milestoneId: IDS.milestone1,
    level: 'achieved', comment: 'Comparó autoría y fecha; señaló una afirmación por verificar.', evidenceId: 'ev1', validatedBy: IDS.t1, validatedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`assessments/${IDS.s1}_${IDS.milestone1}_${IDS.indicatorE1}`), {
    courseId: IDS.courseX, enrollmentId: IDS.s1, indicatorCode: IDS.indicatorE1, milestoneId: IDS.milestone1,
    level: 'developing', comment: 'Distingue necesidad de suposición; agrega evidencia del contexto.', evidenceId: 'ev1', validatedBy: IDS.t1, validatedAt: Timestamp.now(),
  })

  // Diagnóstico enviado (S1, curso X) para lectura docente y visualización de solo lectura.
  b.set(adminDb.doc(`conditionsSurveys/${IDS.s1}`), {
    courseId: IDS.courseX, enrollmentId: IDS.s1, schemaVersion: 2,
    answers: {
      A1: ['teléfono propio'],
      A2: 'en el colegio',
      A3: 'leer pasos',
      A4: { option: 'ninguna', other: '' },
      A5: { created: 'sí', verified: 'alguna vez', explained: 'no' },
      A6: 'usar ClaveÚnica',
    },
    submittedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`diagnosisAttempts/${IDS.s1}_pre`), {
    courseId: IDS.courseX, enrollmentId: IDS.s1, kind: 'pre', diagnosisVersionId: 'pre-v1',
    modality: 'digital', status: 'submitted', submittedAt: Timestamp.now(), createdAt: Timestamp.now(),
    strength: '', nextStep: '',
  })
  for (const taskCode of ['T1', 'T2', 'T3', 'T4', 'T5']) {
    b.set(adminDb.doc(`diagnosisAttempts/${IDS.s1}_pre/responses/${taskCode}`), {
      taskCode,
      enrollmentId: IDS.s1,
      responseStatus: 'answered',
      responseText: `Respuesta sintética de ${taskCode}`,
      technicalIssue: taskCode === 'T4',
      supports: taskCode === 'T3' ? ['audio_reading'] : [],
      score: taskCode === 'T1' ? 2 : null,
      reviewerComment: taskCode === 'T1' ? 'Búsqueda pertinente y dos razones.' : '',
    })
  }

  // Diagnóstico enviado (S2, curso X): incluye una tarea no respondida (puntaje nulo).
  b.set(adminDb.doc(`conditionsSurveys/${IDS.s2}`), {
    courseId: IDS.courseX, enrollmentId: IDS.s2, schemaVersion: 2,
    answers: {
      A1: [],
      A2: 'solo datos móviles o conexión ocasional',
      A3: '',
      A4: { option: 'otra', other: 'espacio con menos ruido' },
      A5: { created: 'no', verified: 'no recuerdo', explained: 'alguna vez' },
      A6: '',
    },
    submittedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`diagnosisAttempts/${IDS.s2}_pre`), {
    courseId: IDS.courseX, enrollmentId: IDS.s2, kind: 'pre', diagnosisVersionId: 'pre-v1',
    modality: 'digital', status: 'submitted', submittedAt: Timestamp.now(), createdAt: Timestamp.now(),
    strength: 'Reconoce señales de riesgo.', nextStep: 'Practicar el contraste de fuentes.',
  })
  for (const taskCode of ['T1', 'T2', 'T3', 'T4', 'T5']) {
    const notAnswered = taskCode === 'T5'
    b.set(adminDb.doc(`diagnosisAttempts/${IDS.s2}_pre/responses/${taskCode}`), {
      taskCode,
      enrollmentId: IDS.s2,
      responseStatus: notAnswered ? 'not_answered' : 'answered',
      responseText: notAnswered ? '' : `Respuesta sintética de Puma-02 ${taskCode}`,
      technicalIssue: false,
      supports: [],
      score: null,
      reviewerComment: '',
    })
  }

  // Diagnóstico enviado (S3, curso Y): sirve para probar el aislamiento entre cursos.
  b.set(adminDb.doc(`conditionsSurveys/${IDS.s3}`), {
    courseId: IDS.courseY, enrollmentId: IDS.s3, schemaVersion: 2,
    answers: { A1: [], A2: '', A3: '', A4: { option: '', other: '' }, A5: { created: '', verified: '', explained: '' }, A6: '' },
    submittedAt: Timestamp.now(),
  })
  b.set(adminDb.doc(`diagnosisAttempts/${IDS.s3}_pre`), {
    courseId: IDS.courseY, enrollmentId: IDS.s3, kind: 'pre', diagnosisVersionId: 'pre-v1',
    modality: 'digital', status: 'submitted', submittedAt: Timestamp.now(), createdAt: Timestamp.now(),
    strength: '', nextStep: '',
  })
  b.set(adminDb.doc(`diagnosisAttempts/${IDS.s3}_pre/responses/T1`), {
    taskCode: 'T1', enrollmentId: IDS.s3, responseStatus: 'answered', responseText: 'Respuesta de otro curso',
    technicalIssue: false, supports: [], score: null, reviewerComment: '',
  })

  await b.commit()
}

/** Sube un objeto directamente con Admin SDK (bypassa reglas) para pruebas de metadata. */
export async function adminUpload(path: string, content: Buffer, contentType: string): Promise<void> {
  await getStorage().bucket(`${PROJECT}.appspot.com`).file(path).save(content, { contentType, resumable: false })
}

export { Timestamp }
