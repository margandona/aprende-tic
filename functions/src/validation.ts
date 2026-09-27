import { onCall, HttpsError } from 'firebase-functions/v2/https'
import type { DocumentReference } from 'firebase-admin/firestore'
import {
  Timestamp,
  assertSignedIn,
  assertTeacherOfCourse,
  audit,
  db,
} from './guards'

interface AssessmentInput {
  enrollmentId?: string
  indicatorCode: string
  level: string
  comment?: string
}

const VALID_LEVELS = ['incipient', 'developing', 'achieved', 'transferable']

/**
 * Validación completa de un hito: estado, evidencia vigente, completitud por integrante,
 * historial de valoraciones y XP idempotente por (matrícula, hito, versión de programa).
 */
export const validateMilestone = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const deliveryId = String(request.data?.deliveryId ?? '')
  const comment = String(request.data?.comment ?? '')
  const input = request.data?.assessments as AssessmentInput[] | undefined
  if (!deliveryId || !Array.isArray(input) || input.length === 0) {
    throw new HttpsError('invalid-argument', 'deliveryId y assessments son obligatorios.')
  }

  const head = await db.doc(`deliveries/${deliveryId}`).get()
  if (!head.exists) throw new HttpsError('not-found', 'Entrega inexistente.')
  const courseId = head.data()!.courseId as string
  await assertTeacherOfCourse(uid, courseId)

  const result = await db.runTransaction(async (tx) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`)
    const dSnap = await tx.get(deliveryRef)
    const d = dSnap.data()!
    if (d.state !== 'pending_review') {
      throw new HttpsError('failed-precondition', 'La entrega no está en estado «por revisar».')
    }
    if (!d.currentEvidenceId) throw new HttpsError('failed-precondition', 'La entrega no tiene evidencia vigente.')

    const evidenceRef = db.doc(`deliveries/${deliveryId}/evidence/${d.currentEvidenceId}`)
    const evSnap = await tx.get(evidenceRef)
    if (!evSnap.exists || evSnap.data()!.deletedAt) {
      throw new HttpsError('failed-precondition', 'La evidencia vigente no es válida.')
    }

    const milestoneRef = db.doc(`milestones/${d.milestoneId}`)
    const mSnap = await tx.get(milestoneRef)
    const milestone = mSnap.data()!
    const required = (milestone.indicatorCodes as string[]) ?? []
    const xpValue = (milestone.xpValue as number) ?? 0

    const missionSnap = await tx.get(db.doc(`missions/${milestone.missionId}`))
    const programVersionId = missionSnap.data()!.programVersionId as string

    // Agrupa por integrante y detecta duplicados.
    const byEnrollment = new Map<string, string[]>()
    for (const a of input) {
      const enr = a.enrollmentId ?? (d.ownerEnrollmentId as string)
      const list = byEnrollment.get(enr) ?? []
      if (list.includes(a.indicatorCode)) {
        throw new HttpsError('failed-precondition', 'Indicador duplicado en la valoración.')
      }
      list.push(a.indicatorCode)
      byEnrollment.set(enr, list)
    }

    // Integrantes del equipo (si aplica).
    let teamMembers: string[] = []
    if (d.scope === 'team' && d.teamId) {
      const membersSnap = await tx.get(db.collection(`teams/${d.teamId}/members`))
      teamMembers = membersSnap.docs.map((x) => x.id)
    }

    // Lecturas previas (valoraciones e XP existentes).
    const existing = new Map<string, Record<string, unknown>>()
    for (const [enr, inds] of byEnrollment) {
      for (const code of inds) {
        const ref = db.doc(`assessments/${enr}_${d.milestoneId}_${code}`)
        const snap = await tx.get(ref)
        if (snap.exists) existing.set(ref.path, snap.data() as Record<string, unknown>)
      }
    }
    const xpRefs = new Map<string, DocumentReference>()
    for (const enr of byEnrollment.keys()) {
      xpRefs.set(enr, db.doc(`xpEvents/${enr}_${d.milestoneId}_${programVersionId}`))
    }
    for (const ref of xpRefs.values()) await tx.get(ref)

    // Validaciones (puras).
    for (const a of input) {
      if (!VALID_LEVELS.includes(a.level)) throw new HttpsError('invalid-argument', `Nivel inválido: ${a.level}`)
    }
    for (const [enr, inds] of byEnrollment) {
      const belongs = enr === d.ownerEnrollmentId || teamMembers.includes(enr)
      if (!belongs) throw new HttpsError('permission-denied', `La matrícula ${enr} no pertenece a la entrega.`)
      if (required.length > 0 && !required.every((r) => inds.includes(r))) {
        throw new HttpsError('failed-precondition', 'Faltan indicadores del hito en la valoración.')
      }
      if (inds.some((i) => !required.includes(i))) {
        throw new HttpsError('failed-precondition', 'Hay indicadores que no pertenecen al hito.')
      }
    }
    if (d.scope === 'team') {
      for (const m of teamMembers) {
        if (!byEnrollment.has(m)) throw new HttpsError('failed-precondition', 'Faltan integrantes del equipo.')
      }
    }

    // Escrituras.
    for (const a of input) {
      const enr = a.enrollmentId ?? (d.ownerEnrollmentId as string)
      const aRef = db.doc(`assessments/${enr}_${d.milestoneId}_${a.indicatorCode}`)
      const prev = existing.get(aRef.path)
      if (prev && prev.level !== a.level) {
        tx.set(db.collection('assessmentHistory').doc(), {
          assessmentId: aRef.id,
          enrollmentId: enr,
          courseId,
          previousLevel: prev.level,
          newLevel: a.level,
          comment: a.comment ?? comment,
          changedBy: uid,
          changedAt: Timestamp.now(),
        })
      }
      tx.set(aRef, {
        courseId,
        enrollmentId: enr,
        indicatorCode: a.indicatorCode,
        milestoneId: d.milestoneId,
        level: a.level,
        comment: a.comment ?? comment,
        evidenceId: d.currentEvidenceId,
        validatedBy: uid,
        validatedAt: Timestamp.now(),
      })
    }
    for (const [enr, ref] of xpRefs) {
      tx.set(ref, {
        courseId,
        enrollmentId: enr,
        milestoneId: d.milestoneId,
        programVersionId,
        xpValue,
        validatedBy: uid,
        validatedAt: Timestamp.now(),
        revokedAt: null,
      })
    }
    tx.update(deliveryRef, { state: 'achieved', updatedAt: Timestamp.now() })

    return { status: 'achieved', assessments: input.length }
  })

  await audit(uid, 'teacher', 'validate_milestone', 'delivery', deliveryId)
  return result
})

export const correctAssessment = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const assessmentId = String(request.data?.assessmentId ?? '')
  const newLevel = String(request.data?.newLevel ?? '')
  const comment = String(request.data?.comment ?? '')
  if (!VALID_LEVELS.includes(newLevel)) throw new HttpsError('invalid-argument', 'Nivel inválido.')

  const ref = db.doc(`assessments/${assessmentId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Valoración inexistente.')
  const a = snap.data()!
  await assertTeacherOfCourse(uid, a.courseId as string)

  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const cur = s.data()!
    tx.set(db.collection('assessmentHistory').doc(), {
      assessmentId,
      enrollmentId: cur.enrollmentId,
      courseId: cur.courseId,
      previousLevel: cur.level,
      newLevel,
      comment,
      changedBy: uid,
      changedAt: Timestamp.now(),
    })
    tx.update(ref, { level: newLevel, comment, validatedBy: uid, validatedAt: Timestamp.now() })
  })
  return { status: 'ok' }
})

export const revokeXp = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const xpEventId = String(request.data?.xpEventId ?? '')
  const reason = String(request.data?.reason ?? 'corrección')
  const ref = db.doc(`xpEvents/${xpEventId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Evento inexistente.')
  await assertTeacherOfCourse(uid, snap.data()!.courseId as string)
  await ref.update({ revokedAt: Timestamp.now(), revokedReason: reason })
  return { status: 'ok' }
})

export const reopenMilestone = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const deliveryId = String(request.data?.deliveryId ?? '')
  const ref = db.doc(`deliveries/${deliveryId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Entrega inexistente.')
  await assertTeacherOfCourse(uid, snap.data()!.courseId as string)
  await ref.update({ state: 'in_progress', updatedAt: Timestamp.now() })
  return { status: 'ok' }
})
