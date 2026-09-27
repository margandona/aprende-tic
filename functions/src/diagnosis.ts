import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp, assertSignedIn, db, getActiveBinding } from './guards'

/** Envío del diagnóstico: transición controlada draft → submitted (inmutable después). */
export const submitDiagnosisAttempt = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const attemptId = String(request.data?.attemptId ?? '')
  const ref = db.doc(`diagnosisAttempts/${attemptId}`)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Intento inexistente.')
    const a = snap.data()!
    if (a.enrollmentId !== binding.enrollmentId) throw new HttpsError('permission-denied', 'No autorizado.')
    if (a.status !== 'draft') throw new HttpsError('failed-precondition', 'El intento ya fue enviado.')
    tx.update(ref, { status: 'submitted', submittedAt: Timestamp.now() })
  })
  return { status: 'ok' }
})
