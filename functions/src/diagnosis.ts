import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  Timestamp,
  type Transaction,
  assertSignedIn,
  assertTeacherOfCourse,
  db,
  getActiveBinding,
} from './guards'

const TASKS = ['T1', 'T2', 'T3', 'T4', 'T5']
const RESPONSE_STATUS = ['answered', 'not_answered', 'skipped']
const SUPPORTS = ['text_amplified', 'subtitles', 'audio_reading', 'keyboard', 'extra_time', 'other']
const REVIEW_HISTORY = 'diagnosisReviewHistory'

// ── Esquema de encuesta v2 (Fase 5) ─────────────────────────────────────────
const PREFER_NOT = 'prefiero no responder'
const A1_OPTIONS = [
  'teléfono propio',
  'teléfono compartido',
  'computador propio',
  'computador compartido',
  'ninguno',
  PREFER_NOT,
]
const A2_OPTIONS = ['en el colegio', 'en casa de forma estable', 'solo datos móviles o conexión ocasional', 'ninguna', PREFER_NOT]
const A3_OPTIONS = ['leer pasos', 'ver demostración', 'escuchar explicación', 'probar con ayuda', 'combinación', PREFER_NOT]
const A4_OPTIONS = [
  'texto ampliado',
  'subtítulos',
  'audio o lectura',
  'teclado',
  'más tiempo',
  'otra',
  'ninguna',
  'prefiero hablarlo en privado',
]
const A5_OPTIONS = ['sí', 'alguna vez', 'no', 'no recuerdo']
const A5_KEYS = ['created', 'verified', 'explained'] as const

interface SurveyShape {
  A1: string[]
  A2: string
  A3: string
  A4: { option: string; other: string }
  A5: Record<string, string>
  A6: string
}

/** Valida la encuesta A1–A6 y devuelve la forma canónica. Falla con `invalid-argument`. */
function parseSurvey(answers: unknown): SurveyShape {
  if (!answers || typeof answers !== 'object') throw new HttpsError('invalid-argument', 'answers es obligatorio.')
  const a = answers as Record<string, unknown>
  const keys = Object.keys(a)
  if (keys.some((k) => !['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].includes(k))) {
    throw new HttpsError('invalid-argument', 'La encuesta solo admite A1–A6.')
  }

  // A1 — selección múltiple (puede quedar vacía).
  if (!Array.isArray(a.A1)) throw new HttpsError('invalid-argument', 'A1 debe ser una lista.')
  const a1 = a.A1.filter((v): v is string => typeof v === 'string')
  if (a1.length !== a.A1.length) throw new HttpsError('invalid-argument', 'A1 solo admite textos.')
  if (a1.some((v) => !A1_OPTIONS.includes(v))) throw new HttpsError('invalid-argument', 'A1 tiene una opción no válida.')
  if (new Set(a1).size !== a1.length) throw new HttpsError('invalid-argument', 'A1 tiene opciones repetidas.')
  if (a1.includes(PREFER_NOT) && a1.length > 1) {
    throw new HttpsError('invalid-argument', 'A1: «prefiero no responder» no se combina con otras opciones.')
  }

  const oneOf = (value: unknown, allowed: string[], field: string): string => {
    const v = typeof value === 'string' ? value : ''
    if (v !== '' && !allowed.includes(v)) throw new HttpsError('invalid-argument', `${field} tiene una opción no válida.`)
    return v
  }
  const A2 = oneOf(a.A2, A2_OPTIONS, 'A2')
  const A3 = oneOf(a.A3, A3_OPTIONS, 'A3')

  // A4 — opción + «otra» (texto breve obligatorio si se elige «otra»).
  const rawA4 = (a.A4 ?? {}) as Record<string, unknown>
  const option = oneOf(rawA4.option, A4_OPTIONS, 'A4')
  const other = typeof rawA4.other === 'string' ? rawA4.other.trim() : ''
  if (other.length > 200) throw new HttpsError('invalid-argument', 'A4 «otra» es demasiado larga.')
  if (option === 'otra' && other.length === 0) throw new HttpsError('invalid-argument', 'A4: describe la condición «otra».')
  if (option !== 'otra' && other.length > 0) throw new HttpsError('invalid-argument', 'A4: «other» solo se usa con la opción «otra».')

  // A5 — tres experiencias por separado.
  const rawA5 = (a.A5 ?? {}) as Record<string, unknown>
  if (Object.keys(rawA5).some((k) => !A5_KEYS.includes(k as (typeof A5_KEYS)[number]))) {
    throw new HttpsError('invalid-argument', 'A5 solo admite created, verified y explained.')
  }
  const A5: Record<string, string> = {}
  for (const key of A5_KEYS) A5[key] = oneOf(rawA5[key], A5_OPTIONS, `A5.${key}`)

  // A6 — opcional.
  const A6 = typeof a.A6 === 'string' ? a.A6.trim() : ''
  if (A6.length > 500) throw new HttpsError('invalid-argument', 'A6 es demasiado larga.')

  return { A1: a1, A2, A3, A4: { option, other }, A5, A6 }
}

/**
 * Encuesta de condiciones A1–A6.
 * Guarda la encuesta y la marca de completitud **de forma atómica** y solo si el
 * diagnóstico aún no fue enviado (permite corregirla antes del envío).
 */
export const saveConditionsSurvey = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const answers = parseSurvey(request.data?.answers)

  await db.runTransaction(async (tx: Transaction) => {
    const attemptRef = db.doc(`diagnosisAttempts/${binding.enrollmentId}_pre`)
    const attemptSnap = await tx.get(attemptRef)
    if (attemptSnap.exists && attemptSnap.data()?.status === 'submitted') {
      throw new HttpsError('failed-precondition', 'El diagnóstico ya fue enviado: la encuesta quedó cerrada.')
    }
    tx.set(db.doc(`conditionsSurveys/${binding.enrollmentId}`), {
      courseId: binding.courseId,
      enrollmentId: binding.enrollmentId,
      schemaVersion: 2,
      answers,
      submittedAt: Timestamp.now(),
    })
    tx.set(db.doc(`enrollments/${binding.enrollmentId}`), { surveySubmitted: true }, { merge: true })
  })
  return { status: 'ok' }
})

/** Crea (idempotente) el intento de diagnóstico del estudiante. */
export const startDiagnosisAttempt = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const kind = request.data?.kind === 'post' ? 'post' : 'pre'
  // El postest paralelo es un borrador NO validado: no puede presentarse como instrumento vigente.
  if (kind === 'post') {
    throw new HttpsError('failed-precondition', 'El postest aún no está validado y no puede iniciarse.')
  }
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
      strength: '',
      nextStep: '',
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

/**
 * Envío del diagnóstico: transición controlada draft → submitted (inmutable después).
 * Exige que la encuesta de condiciones ya esté registrada.
 */
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
    if (a.kind === 'post') {
      throw new HttpsError('failed-precondition', 'El postest aún no está validado y no puede enviarse.')
    }
    if (a.status !== 'draft') throw new HttpsError('failed-precondition', 'El intento ya fue enviado.')

    const surveySnap = await tx.get(db.doc(`conditionsSurveys/${binding.enrollmentId}`))
    if (!surveySnap.exists) throw new HttpsError('failed-precondition', 'Registra la encuesta de condiciones antes de enviar.')

    tx.update(ref, { status: 'submitted', submittedAt: Timestamp.now() })
  })
  return { status: 'ok' }
})

/**
 * Revisión docente de una respuesta T1–T5.
 * - Exige que la respuesta exista (no crea una vacía con puntaje).
 * - Una tarea no respondida o con barrera técnica conserva **puntaje nulo**.
 * - Registra cada cambio de valoración en `diagnosisReviewHistory`.
 */
export const reviewDiagnosisResponse = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const attemptId = String(request.data?.attemptId ?? '')
  const taskCode = String(request.data?.taskCode ?? '')
  const rawScore = request.data?.score
  const reviewerComment = String(request.data?.reviewerComment ?? '').slice(0, 1000)

  if (!TASKS.includes(taskCode)) throw new HttpsError('invalid-argument', 'Tarea inválida.')
  const score = rawScore === null || rawScore === undefined ? null : rawScore
  if (score !== null && (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 2)) {
    throw new HttpsError('invalid-argument', 'La puntuación debe ser 0, 1 o 2 (o nula).')
  }

  const aSnap = await db.doc(`diagnosisAttempts/${attemptId}`).get()
  if (!aSnap.exists) throw new HttpsError('not-found', 'Intento inexistente.')
  const a = aSnap.data()!
  await assertTeacherOfCourse(uid, a.courseId as string)
  if (a.status !== 'submitted') throw new HttpsError('failed-precondition', 'El intento aún no fue enviado.')

  await db.runTransaction(async (tx: Transaction) => {
    const responseRef = db.doc(`diagnosisAttempts/${attemptId}/responses/${taskCode}`)
    const rSnap = await tx.get(responseRef)
    if (!rSnap.exists) throw new HttpsError('failed-precondition', 'No existe una respuesta que valorar.')
    const r = rSnap.data()!
    const answerable = r.responseStatus === 'answered' && r.technicalIssue !== true
    if (!answerable && score !== null) {
      throw new HttpsError(
        'failed-precondition',
        'Una tarea no respondida o con barrera técnica no recibe puntaje (queda nula).',
      )
    }
    const previousScore = (r.score as number | null) ?? null
    if (previousScore !== score) {
      tx.set(db.collection(REVIEW_HISTORY).doc(), {
        attemptId,
        enrollmentId: r.enrollmentId ?? a.enrollmentId,
        courseId: a.courseId,
        kind: 'score',
        taskCode,
        previousScore,
        newScore: score,
        changedBy: uid,
        changedAt: Timestamp.now(),
      })
    }
    tx.set(responseRef, { score, reviewerComment, reviewedBy: uid, reviewedAt: Timestamp.now() }, { merge: true })
  })
  return { status: 'ok' }
})

/**
 * Devolución docente por intento: una fortaleza observada y un siguiente paso.
 * Registra el cambio en `diagnosisReviewHistory`.
 */
export const saveDiagnosisFeedback = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const attemptId = String(request.data?.attemptId ?? '')
  const strength = String(request.data?.strength ?? '').slice(0, 1000)
  const nextStep = String(request.data?.nextStep ?? '').slice(0, 1000)

  const aSnap = await db.doc(`diagnosisAttempts/${attemptId}`).get()
  if (!aSnap.exists) throw new HttpsError('not-found', 'Intento inexistente.')
  const a = aSnap.data()!
  await assertTeacherOfCourse(uid, a.courseId as string)
  if (a.status !== 'submitted') throw new HttpsError('failed-precondition', 'El intento aún no fue enviado.')

  await db.runTransaction(async (tx: Transaction) => {
    const ref = db.doc(`diagnosisAttempts/${attemptId}`)
    const snap = await tx.get(ref)
    const cur = snap.data()!
    const previousStrength = (cur.strength as string) ?? ''
    const previousNextStep = (cur.nextStep as string) ?? ''
    if (previousStrength !== strength || previousNextStep !== nextStep) {
      tx.set(db.collection(REVIEW_HISTORY).doc(), {
        attemptId,
        enrollmentId: cur.enrollmentId,
        courseId: cur.courseId,
        kind: 'feedback',
        taskCode: null,
        previousStrength,
        newStrength: strength,
        previousNextStep,
        newNextStep: nextStep,
        changedBy: uid,
        changedAt: Timestamp.now(),
      })
    }
    tx.update(ref, { strength, nextStep, feedbackBy: uid, feedbackAt: Timestamp.now() })
  })
  return { status: 'ok' }
})

export { parseSurvey }
