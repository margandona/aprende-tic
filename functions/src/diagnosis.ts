import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp, type Transaction, assertSignedIn, assertTeacherOfCourse, db, getActiveBinding } from './guards'

const TASKS = ['T1', 'T2', 'T3', 'T4', 'T5']
const RESPONSE_STATUS = ['answered', 'not_answered', 'skipped']
const SUPPORTS = ['text_amplified', 'subtitles', 'audio_reading', 'keyboard', 'extra_time', 'other']
const SURVEY_KEYS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']

/** Encuesta de condiciones A1–A6 (esquema validado en el servidor). */
export const saveConditionsSurvey = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const answers = request.data?.answers as Record<string, unknown> | undefined
  if (!answers || typeof answers !== 'object') throw new HttpsError('invalid-argument', 'answers es obligatorio.')
  const valid = SURVEY_KEYS.every((k) => typeof answers[k] === 'string' && (answers[k] as string).length <= 500)
  if (!valid || Object.keys(answers).length !== SURVEY_KEYS.length) {
    throw new HttpsError('invalid-argument', 'Esquema de encuesta inválido (A1–A6 como texto ≤ 500).')
  }

  await db.doc(`conditionsSurveys/${binding.enrollmentId}`).set({
    courseId: binding.courseId,
    enrollmentId: binding.enrollmentId,
    schemaVersion: 1,
    answers,
    submittedAt: Timestamp.now(),
  })
  await db.doc(`enrollments/${binding.enrollmentId}`).update({ surveySubmitted: true })
  return { status: 'ok' }
})

/** Crea (idempotente) el intento de diagnóstico del estudiante. */
export const startDiagnosisAttempt = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const kind = request.data?.kind === 'post' ? 'post' : 'pre'
  const attemptId = `${binding.enrollmentId}_${kind}`
  const ref = db.doc(`diagnosisAttempts/${attemptId}`)
  try {
    await ref.create({
      courseId: binding.courseId,
      enrollmentId: binding.enrollmentId,
      kind,
      diagnosisVersionId: `${kind}-v1`,
      modality: 'digital',
      status: 'draft',
      submittedAt: null,
      createdAt: Timestamp.now(),
    })
  } catch {
    const snap = await ref.get()
    if (!snap.exists || snap.data()?.enrollmentId !== binding.enrollmentId) {
      throw new HttpsError('permission-denied', 'Intento no disponible.')
    }
  }
  return { attemptId }
})

/** Guarda una respuesta T1–T5 (apoyos independientes de la puntuación). */
export const saveDiagnosisResponse = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const attemptId = String(request.data?.attemptId ?? '')
  const taskCode = String(request.data?.taskCode ?? '')
  const responseStatus = String(request.data?.responseStatus ?? 'answered')
  const responseText = String(request.data?.responseText ?? '')
  const technicalIssue = Boolean(request.data?.technicalIssue)
  const rawSupports = Array.isArray(request.data?.supports) ? (request.data.supports as unknown[]) : []
  const supports = rawSupports.filter((s): s is string => typeof s === 'string' && SUPPORTS.includes(s))

  if (!TASKS.includes(taskCode)) throw new HttpsError('invalid-argument', 'Tarea inválida.')
  if (!RESPONSE_STATUS.includes(responseStatus)) throw new HttpsError('invalid-argument', 'Estado de respuesta inválido.')
  if (responseText.length > 4000) throw new HttpsError('invalid-argument', 'Respuesta demasiado larga.')

  await db.runTransaction(async (tx: Transaction) => {
    const attemptRef = db.doc(`diagnosisAttempts/${attemptId}`)
    const responseRef = db.doc(`diagnosisAttempts/${attemptId}/responses/${taskCode}`)
    const aSnap = await tx.get(attemptRef)
    if (!aSnap.exists) throw new HttpsError('not-found', 'Intento inexistente.')
    const a = aSnap.data()!
    if (a.enrollmentId !== binding.enrollmentId) throw new HttpsError('permission-denied', 'No autorizado.')
    if (a.status !== 'draft') throw new HttpsError('failed-precondition', 'El intento ya fue enviado.')
    tx.set(
      responseRef,
      { taskCode, responseStatus, responseText, technicalIssue, supports, updatedAt: Timestamp.now() },
      { merge: true },
    )
  })
  return { status: 'ok' }
})

/** Envío del diagnóstico: transición controlada draft → submitted (inmutable después). */
export const submitDiagnosisAttempt = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const attemptId = String(request.data?.attemptId ?? '')
  const ref = db.doc(`diagnosisAttempts/${attemptId}`)

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Intento inexistente.')
    const a = snap.data()!
    if (a.enrollmentId !== binding.enrollmentId) throw new HttpsError('permission-denied', 'No autorizado.')
    if (a.status !== 'draft') throw new HttpsError('failed-precondition', 'El intento ya fue enviado.')
    tx.update(ref, { status: 'submitted', submittedAt: Timestamp.now() })
  })
  return { status: 'ok' }
})

/** Revisión docente: puntuación 0–2 y comentario (solo tras el envío). */
export const reviewDiagnosisResponse = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const attemptId = String(request.data?.attemptId ?? '')
  const taskCode = String(request.data?.taskCode ?? '')
  const score = request.data?.score as number | null | undefined
  const reviewerComment = String(request.data?.reviewerComment ?? '')

  const aSnap = await db.doc(`diagnosisAttempts/${attemptId}`).get()
  if (!aSnap.exists) throw new HttpsError('not-found', 'Intento inexistente.')
  const a = aSnap.data()!
  await assertTeacherOfCourse(uid, a.courseId as string)
  if (!TASKS.includes(taskCode)) throw new HttpsError('invalid-argument', 'Tarea inválida.')
  if (a.status !== 'submitted') throw new HttpsError('failed-precondition', 'El intento aún no fue enviado.')
  if (score !== null && score !== undefined && (!Number.isInteger(score) || score < 0 || score > 2)) {
    throw new HttpsError('invalid-argument', 'La puntuación debe ser 0, 1 o 2 (o nula).')
  }

  await db.doc(`diagnosisAttempts/${attemptId}/responses/${taskCode}`).set(
    { score: score ?? null, reviewerComment, reviewedBy: uid, reviewedAt: Timestamp.now() },
    { merge: true },
  )
  return { status: 'ok' }
})
