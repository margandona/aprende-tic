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
  milestone1: 'milestone-1',
  milestone2: 'milestone-2',
  indicatorD1: 'D1',
  indicatorE1: 'E1',
  teamX: 'team-x',
  teamY: 'team-y',
  s1: 'enr-s1',
  s2: 'enr-s2',
  s3: 'enr-s3',
  s4: 'enr-s4',
  s5: 'enr-s5',
  s6: 'enr-s6',
  t1: 'teacher-1',
  t2: 'teacher-2',
  t3: 'teacher-3',
  codeS1: 'ZORRO-01',
  codeS2: 'PUMA-02',
  codeS3: 'CONDOR-03',
  codeS4: 'PUDU-04',
  codeS5: 'GATO-05',
  codeS6: 'RANA-06',
}

const future = () => Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000)

async function clearAll(): Promise<void> {
  await adminDb.recursiveDelete(adminDb.collection('deliveries'))
  await adminDb.recursiveDelete(adminDb.collection('teams'))
  await adminDb.recursiveDelete(adminDb.collection('diagnosisAttempts'))

  const collections = [
    'institutions', 'programVersions', 'courses', 'missions', 'milestones', 'indicators', 'badges',
    'teachers', 'teacherCourses', 'enrollments', 'codeCredentials', 'sessionBindings',
    'assessments', 'assessmentHistory', 'xpEvents', 'badgeAwards',
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

  b.set(adminDb.doc(`missions/${IDS.mission1}`), { programVersionId: IDS.programVersion, order: 1, name: 'Abrir el mapa', prompt: '¿Qué sabemos?', status: 'active' })
  b.set(adminDb.doc(`milestones/${IDS.milestone1}`), { missionId: IDS.mission1, order: 1, title: 'Diagnóstico', xpValue: 20, indicatorCodes: [IDS.indicatorD1, IDS.indicatorE1] })
  b.set(adminDb.doc(`milestones/${IDS.milestone2}`), { missionId: IDS.mission1, order: 2, title: 'Necesidad', xpValue: 20, indicatorCodes: [IDS.indicatorD1] })
  b.set(adminDb.doc(`indicators/${IDS.indicatorD1}`), { code: 'D1', axis: 'D', name: 'Buscar y valorar información' })
  b.set(adminDb.doc(`indicators/${IDS.indicatorE1}`), { code: 'E1', axis: 'E', name: 'Detectar una oportunidad' })
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

  for (const [code, enrollmentId, courseId] of [
    [IDS.codeS1, IDS.s1, IDS.courseX],
    [IDS.codeS2, IDS.s2, IDS.courseX],
    [IDS.codeS3, IDS.s3, IDS.courseY],
    [IDS.codeS4, IDS.s4, IDS.courseX],
    [IDS.codeS5, IDS.s5, IDS.courseX],
    [IDS.codeS6, IDS.s6, IDS.courseX],
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
