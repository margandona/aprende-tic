import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  Timestamp,
  assertSignedIn,
  assertTeacherOfCourse,
  audit,
  courseOfEnrollment,
  db,
  getActiveBinding,
  milestoneInCourse,
} from './guards'

export const deliveryIdFor = (enrollmentId: string, milestoneId: string) => `${enrollmentId}_${milestoneId}`

/** Crea (idempotente) la entrega individual de un hito para la matrícula de la sesión. */
export const startDelivery = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const milestoneId = String(request.data?.milestoneId ?? '')
  if (!(await milestoneInCourse(milestoneId, binding.courseId))) {
    throw new HttpsError('failed-precondition', 'El hito no pertenece al programa del curso.')
  }
  const deliveryId = deliveryIdFor(binding.enrollmentId, milestoneId)
  const ref = db.doc(`deliveries/${deliveryId}`)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({
      courseId: binding.courseId,
      ownerEnrollmentId: binding.enrollmentId,
      milestoneId,
      scope: 'individual',
      teamId: null,
      state: 'not_started',
      currentEvidenceId: null,
      evidenceCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  }
  return { deliveryId }
})

/** Envío idempotente de evidencia digital (submit_key). */
export const submitEvidence = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const deliveryId = String(request.data?.deliveryId ?? '')
  const submitKey = String(request.data?.submitKey ?? '')
  const format = String(request.data?.format ?? 'text')
  const description = String(request.data?.description ?? '')
  if (!deliveryId || !submitKey) throw new HttpsError('invalid-argument', 'deliveryId y submitKey son obligatorios.')

  return db.runTransaction(async (tx) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`)
    const evidenceRef = db.doc(`deliveries/${deliveryId}/evidence/${submitKey}`)
    const deliverySnap = await tx.get(deliveryRef)
    const evidenceSnap = await tx.get(evidenceRef)

    if (!deliverySnap.exists) throw new HttpsError('not-found', 'Entrega inexistente.')
    const d = deliverySnap.data()!
    if (d.ownerEnrollmentId !== binding.enrollmentId) {
      throw new HttpsError('permission-denied', 'Solo el propietario puede entregar.')
    }
    // Idempotencia primero: el mismo submit_key devuelve el recibo anterior.
    if (evidenceSnap.exists) {
      return { evidenceId: submitKey, version: evidenceSnap.data()!.version as number, reused: true }
    }
    if (!['not_started', 'in_progress'].includes(d.state as string)) {
      throw new HttpsError('failed-precondition', 'La entrega no admite envíos en su estado actual.')
    }

    const version = ((d.evidenceCount as number) ?? 0) + 1
    tx.create(evidenceRef, {
      version,
      origin: 'student_digital',
      format,
      testModality: 'not_applicable',
      description,
      submitKey,
      createdBy: uid,
      createdAt: Timestamp.now(),
      deletedAt: null,
    })
    tx.update(deliveryRef, {
      state: 'pending_review',
      currentEvidenceId: submitKey,
      evidenceCount: version,
      updatedAt: Timestamp.now(),
    })
    return { evidenceId: submitKey, version, reused: false }
  })
})

/** Registro docente de evidencia equivalente, sin entrega digital previa. */
export const registerEquivalentEvidence = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const enrollmentId = String(request.data?.enrollmentId ?? '')
  const milestoneId = String(request.data?.milestoneId ?? '')
  const format = String(request.data?.format ?? 'paper')
  const description = String(request.data?.description ?? '')
  const testModality = String(request.data?.testModality ?? 'not_applicable')
  const submitKey = String(request.data?.submitKey ?? `eq_${Date.now()}`)

  const courseId = await courseOfEnrollment(enrollmentId)
  await assertTeacherOfCourse(uid, courseId)
  if (!(await milestoneInCourse(milestoneId, courseId))) {
    throw new HttpsError('failed-precondition', 'El hito no pertenece al programa del curso.')
  }

  const deliveryId = deliveryIdFor(enrollmentId, milestoneId)
  const result = await db.runTransaction(async (tx) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`)
    const evidenceRef = db.doc(`deliveries/${deliveryId}/evidence/${submitKey}`)
    const deliverySnap = await tx.get(deliveryRef)
    const evidenceSnap = await tx.get(evidenceRef)

    if (evidenceSnap.exists) {
      return { evidenceId: submitKey, reused: true }
    }
    const d = deliverySnap.exists ? deliverySnap.data()! : null
    if (d && d.state === 'achieved') {
      throw new HttpsError('failed-precondition', 'La entrega ya está cerrada.')
    }
    const version = d ? ((d.evidenceCount as number) ?? 0) + 1 : 1

    tx.set(
      deliveryRef,
      {
        courseId,
        ownerEnrollmentId: enrollmentId,
        milestoneId,
        scope: d?.scope ?? 'individual',
        teamId: d?.teamId ?? null,
        state: 'pending_review',
        currentEvidenceId: submitKey,
        evidenceCount: version,
        createdAt: d?.createdAt ?? Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )
    tx.create(evidenceRef, {
      version,
      origin: 'teacher_equivalent',
      format,
      testModality,
      description,
      submitKey,
      createdBy: uid,
      createdAt: Timestamp.now(),
      deletedAt: null,
    })
    return { evidenceId: submitKey, reused: false }
  })

  await audit(uid, 'teacher', 'register_equivalent_evidence', 'delivery', deliveryId)
  return { deliveryId, ...result }
})
