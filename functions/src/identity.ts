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
type RedeemFail = { status: 'invalid' | 'revoked' | 'expired' | 'locked' | 'rate_limited' }
type RedeemOk = { status: 'ok'; enrollmentId: string; courseId: string; pseudonym: string; expiresAt: Timestamp }

const APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true'

/** Canje de código individual → vínculo (binding) revocable. */
export const redeemCode = onCall({ enforceAppCheck: APP_CHECK }, async (request) => {
  const uid = assertSignedIn(request)
  const code = String(request.data?.code ?? '')
  if (code.trim().length === 0) throw new HttpsError('invalid-argument', 'Código requerido.')
  const actorKey = actorKeyFrom(request)
  const hash = hashCode(code)
  const credRef = db.doc(`codeCredentials/${hash}`)
  // Contador acotado por actor (una sola escritura por actor y ventana).
  const rateRef = db.doc(`redeemRate/${hashCode('rate:' + actorKey)}`)
  const now = Date.now()
  const windowMs = CONSTANTS.rateWindowMinutes * 60 * 1000

  const result = await db.runTransaction(async (tx: Transaction): Promise<RedeemFail | RedeemOk> => {
    // ── Lecturas (todas antes de escribir) ──
    const rateSnap = await tx.get(rateRef)
    const credSnap = await tx.get(credRef)
    const cred = credSnap.exists ? credSnap.data()! : null
    const enrollmentId = (cred?.enrollmentId as string | undefined) ?? null
    const enrollmentRef = enrollmentId ? db.doc(`enrollments/${enrollmentId}`) : null
    const enrollmentSnap = enrollmentRef ? await tx.get(enrollmentRef) : null

    const priorRef = db.doc(`sessionBindings/${uid}`)
    const priorSnap = await tx.get(priorRef)
    const activeUid = enrollmentSnap?.data()?.activeBindingUid as string | undefined
    const activeRef = activeUid && activeUid !== uid ? db.doc(`sessionBindings/${activeUid}`) : null
    const activeSnap = activeRef ? await tx.get(activeRef) : null

    // ── Límite transaccional por actor ──
    const rateData = rateSnap.data()
    const windowStart = rateData?.windowStart as Timestamp | undefined
    const withinWindow = windowStart ? now - windowStart.toMillis() < windowMs : false
    const count = withinWindow ? ((rateData?.count as number) ?? 0) : 0
    if (count >= CONSTANTS.rateMax) {
      return { status: 'rate_limited' }
    }
    tx.set(rateRef, {
      windowStart: withinWindow && windowStart ? windowStart : Timestamp.fromMillis(now),
      count: count + 1,
      updatedAt: Timestamp.now(),
    })

    if (!cred || !enrollmentSnap?.exists) return { status: 'invalid' }
    const enrollment = enrollmentSnap.data()!

    if (cred.state !== 'active') {
      tx.update(credRef, { failedAttempts: FieldValue.increment(1), lastFailedAt: Timestamp.now() })
      return { status: 'revoked' }
    }
    if (cred.expiresAt && (cred.expiresAt as Timestamp).toMillis() <= now) {
      tx.update(credRef, { failedAttempts: FieldValue.increment(1), lastFailedAt: Timestamp.now() })
      return { status: 'expired' }
    }
    if (cred.lockedUntil && (cred.lockedUntil as Timestamp).toMillis() > now) {
      tx.update(credRef, { failedAttempts: FieldValue.increment(1), lastFailedAt: Timestamp.now() })
      return { status: 'locked' }
    }
    if (((cred.failedAttempts as number) ?? 0) >= CONSTANTS.maxAttempts) {
      tx.update(credRef, {
        failedAttempts: FieldValue.increment(1),
        lockedUntil: Timestamp.fromMillis(now + CONSTANTS.lockMinutes * 60 * 1000),
      })
      return { status: 'locked' }
    }

    // ── Revoca vínculos previos y crea el nuevo ──
    if (activeRef && activeSnap?.exists) {
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
    tx.update(enrollmentRef!, { activeBindingUid: uid })
    tx.update(credRef, { lastUsedAt: Timestamp.now(), failedAttempts: 0, lockedUntil: null })

    return {
      status: 'ok',
      enrollmentId: enrollmentId!,
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
export const regenerateCode = onCall({ enforceAppCheck: APP_CHECK }, async (request) => {
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
export const revokeSession = onCall({ enforceAppCheck: APP_CHECK }, async (request) => {
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
