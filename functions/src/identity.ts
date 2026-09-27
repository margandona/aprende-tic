import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  CONSTANTS,
  Timestamp,
  FieldValue,
  type Transaction,
  actorKeyFrom,
  assertSignedIn,
  assertTeacherOfCourse,
  audit,
  courseOfEnrollment,
  db,
  generateCode,
  hashCode,
} from './guards'

/** Resultado del canje. */
type RedeemFail = { status: 'invalid' | 'revoked' | 'expired' | 'locked' }
type RedeemOk = { status: 'ok'; enrollmentId: string; courseId: string; pseudonym: string; expiresAt: Timestamp }

/** Canje de código individual → vínculo (binding) revocable. */
export const redeemCode = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const code = String(request.data?.code ?? '')
  if (code.trim().length === 0) throw new HttpsError('invalid-argument', 'Código requerido.')
  const actorKey = actorKeyFrom(request)
  const hash = hashCode(code)
  const credRef = db.doc(`codeCredentials/${hash}`)
  const now = Date.now()

  // Límite por borde confiable (ventana).
  const windowStart = Timestamp.fromMillis(now - CONSTANTS.rateWindowMinutes * 60 * 1000)
  const recent = await db
    .collection('redeemAttempts')
    .where('actorKey', '==', actorKey)
    .where('attemptedAt', '>', windowStart)
    .get()
  if (recent.size >= CONSTANTS.rateMax) {
    throw new HttpsError('resource-exhausted', 'Demasiados intentos de canje.')
  }

  const result = await db.runTransaction(async (tx: Transaction): Promise<RedeemFail | RedeemOk> => {
    const credSnap = await tx.get(credRef)
    const fail = (status: RedeemFail['status']): RedeemFail => {
      tx.set(db.collection('redeemAttempts').doc(), {
        actorKey,
        attemptedAt: Timestamp.now(),
        success: false,
      })
      return { status }
    }

    if (!credSnap.exists) return fail('invalid')
    const cred = credSnap.data()!
    const enrollmentId = cred.enrollmentId as string

    const enrollmentRef = db.doc(`enrollments/${enrollmentId}`)
    const enrollmentSnap = await tx.get(enrollmentRef)
    if (!enrollmentSnap.exists) return fail('invalid')
    const enrollment = enrollmentSnap.data()!

    const priorRef = db.doc(`sessionBindings/${uid}`)
    const activeUid = enrollment.activeBindingUid as string | undefined
    const activeRef = activeUid ? db.doc(`sessionBindings/${activeUid}`) : null
    const priorSnap = await tx.get(priorRef)
    const activeSnap = activeRef ? await tx.get(activeRef) : null

    if (cred.state !== 'active') {
      tx.update(credRef, { failedAttempts: FieldValue.increment(1), lastFailedAt: Timestamp.now() })
      return fail('revoked')
    }
    if (cred.expiresAt && (cred.expiresAt as Timestamp).toMillis() <= now) {
      tx.update(credRef, { failedAttempts: FieldValue.increment(1), lastFailedAt: Timestamp.now() })
      return fail('expired')
    }
    if (cred.lockedUntil && (cred.lockedUntil as Timestamp).toMillis() > now) {
      tx.update(credRef, { failedAttempts: FieldValue.increment(1), lastFailedAt: Timestamp.now() })
      return fail('locked')
    }
    if ((cred.failedAttempts ?? 0) >= CONSTANTS.maxAttempts) {
      tx.update(credRef, {
        failedAttempts: FieldValue.increment(1),
        lockedUntil: Timestamp.fromMillis(now + CONSTANTS.lockMinutes * 60 * 1000),
      })
      return fail('locked')
    }

    // Revoca vínculos previos (de la matrícula o del propio uid).
    if (activeSnap?.exists && activeRef && activeRef.path !== priorRef.path) {
      tx.update(activeRef, { state: 'revoked', revokedAt: Timestamp.now(), revokedReason: 'nuevo canje' })
    }
    if (priorSnap.exists) {
      tx.update(priorRef, { state: 'revoked', revokedAt: Timestamp.now(), revokedReason: 'nuevo canje' })
    }

    const expiresAt = Timestamp.fromMillis(now + CONSTANTS.sessionHours * 60 * 60 * 1000)
    tx.set(priorRef, {
      enrollmentId,
      courseId: enrollment.courseId,
      state: 'active',
      issuedAt: Timestamp.now(),
      expiresAt,
    })
    tx.update(enrollmentRef, { activeBindingUid: uid })
    tx.update(credRef, { lastUsedAt: Timestamp.now(), failedAttempts: 0, lockedUntil: null })
    tx.set(db.collection('redeemAttempts').doc(), { actorKey, attemptedAt: Timestamp.now(), success: true })

    return {
      status: 'ok',
      enrollmentId,
      courseId: enrollment.courseId as string,
      pseudonym: enrollment.pseudonym as string,
      expiresAt,
    }
  })

  if (result.status !== 'ok') {
    return result
  }
  return {
    status: 'ok',
    enrollmentId: result.enrollmentId,
    courseId: result.courseId,
    pseudonym: result.pseudonym,
  }
})

/** Regenera el código individual (docente del curso). Devuelve el texto una sola vez. */
export const regenerateCode = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const enrollmentId = String(request.data?.enrollmentId ?? '')
  const courseId = await courseOfEnrollment(enrollmentId)
  await assertTeacherOfCourse(uid, courseId)

  const plain = generateCode()
  const newHash = hashCode(plain)

  await db.runTransaction(async (tx: Transaction) => {
    const enrollmentRef = db.doc(`enrollments/${enrollmentId}`)
    const enrollmentSnap = await tx.get(enrollmentRef)
    const enrollment = enrollmentSnap.data()!
    const oldHash = enrollment.activeCodeHash as string | undefined
    const oldRef = oldHash ? db.doc(`codeCredentials/${oldHash}`) : null
    const activeUid = enrollment.activeBindingUid as string | undefined
    const bindingRef = activeUid ? db.doc(`sessionBindings/${activeUid}`) : null

    // Todas las lecturas antes de cualquier escritura.
    const oldSnap = oldRef ? await tx.get(oldRef) : null
    const bindingSnap = bindingRef ? await tx.get(bindingRef) : null

    if (oldRef && oldSnap?.exists) {
      tx.update(oldRef, { state: 'revoked', revokedAt: Timestamp.now() })
    }
    if (bindingRef && bindingSnap?.exists) {
      tx.update(bindingRef, { state: 'revoked', revokedAt: Timestamp.now(), revokedReason: 'regeneración de código' })
    }

    tx.set(db.doc(`codeCredentials/${newHash}`), {
      enrollmentId,
      courseId,
      state: 'active',
      issuedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + CONSTANTS.codeDays * 24 * 60 * 60 * 1000),
      failedAttempts: 0,
      lockedUntil: null,
    })
    tx.update(enrollmentRef, { activeCodeHash: newHash, activeBindingUid: FieldValue.delete() })
  })

  await audit(uid, 'teacher', 'regenerate_code', 'enrollment', enrollmentId)
  return { status: 'ok', code: plain }
})

/** Revoca de inmediato el vínculo activo (docente del curso). */
export const revokeSession = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const enrollmentId = String(request.data?.enrollmentId ?? '')
  const reason = String(request.data?.reason ?? 'revocación docente')
  const courseId = await courseOfEnrollment(enrollmentId)
  await assertTeacherOfCourse(uid, courseId)

  await db.runTransaction(async (tx: Transaction) => {
    const enrollmentRef = db.doc(`enrollments/${enrollmentId}`)
    const enrollmentSnap = await tx.get(enrollmentRef)
    const activeUid = enrollmentSnap.data()?.activeBindingUid as string | undefined
    const bindingRef = activeUid ? db.doc(`sessionBindings/${activeUid}`) : null
    if (bindingRef) {
      const b = await tx.get(bindingRef)
      if (b.exists) {
        tx.update(bindingRef, { state: 'revoked', revokedAt: Timestamp.now(), revokedReason: reason })
      }
    }
    tx.update(enrollmentRef, { activeBindingUid: FieldValue.delete() })
  })

  await audit(uid, 'teacher', 'revoke_session', 'enrollment', enrollmentId, { reason })
  return { status: 'ok' }
})
