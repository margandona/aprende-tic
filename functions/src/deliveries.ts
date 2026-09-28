import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import {
  ALLOWED_MIME,
  CONSTANTS,
  Timestamp,
  type Transaction,
  assertSignedIn,
  assertTeacherOfCourse,
  audit,
  courseOfEnrollment,
  db,
  getActiveBinding,
  milestoneInCourse,
  newId,
} from './guards'

export const deliveryIdFor = (enrollmentId: string, milestoneId: string) => `${enrollmentId}_${milestoneId}`

/** Soportes admitidos para la entrega equivalente (sin conexión / sin dispositivo). */
export const ALLOWED_EQUIVALENT_FORMATS = ['paper', 'audio_local', 'model', 'dictation', 'adaptation']
/** Apoyos registrados por separado de la valoración. */
export const EQUIVALENT_SUPPORTS = ['reading', 'extra_time', 'dictation', 'adapted_material', 'device_shared', 'other']

/** Crea (idempotente y a prueba de carrera) la entrega individual de un hito. */
export const startDelivery = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const milestoneId = String(request.data?.milestoneId ?? '')
  if (!(await milestoneInCourse(milestoneId, binding.courseId))) {
    throw new HttpsError('failed-precondition', 'El hito no pertenece al programa del curso.')
  }
  const deliveryId = deliveryIdFor(binding.enrollmentId, milestoneId)
  const ref = db.doc(`deliveries/${deliveryId}`)
  try {
    // create (no set): si ya existe, no reinicia el estado.
    await ref.create({
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
  } catch {
    const snap = await ref.get()
    if (!snap.exists || snap.data()?.ownerEnrollmentId !== binding.enrollmentId) {
      throw new HttpsError('permission-denied', 'Entrega no disponible para esta matrícula.')
    }
  }
  return { deliveryId }
})

/** Reserva de archivo: documento restringido que Storage Rules coteja. */
export const reserveUpload = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const deliveryId = String(request.data?.deliveryId ?? '')
  const fileName = String(request.data?.fileName ?? '')
  const contentType = String(request.data?.contentType ?? '')
  const sizeBytes = Number(request.data?.sizeBytes ?? 0)

  const snap = await db.doc(`deliveries/${deliveryId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Entrega inexistente.')
  const d = snap.data()!
  if (d.ownerEnrollmentId !== binding.enrollmentId) {
    throw new HttpsError('permission-denied', 'Solo el propietario reserva archivos.')
  }
  if (!['not_started', 'in_progress'].includes(d.state as string)) {
    throw new HttpsError('failed-precondition', 'La entrega no admite archivos en su estado actual.')
  }
  if (!ALLOWED_MIME.includes(contentType)) {
    throw new HttpsError('invalid-argument', 'Tipo de archivo no permitido.')
  }
  if (!(Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= CONSTANTS.maxUploadBytes)) {
    throw new HttpsError('invalid-argument', 'Tamaño de archivo no permitido.')
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(fileName)) {
    throw new HttpsError('invalid-argument', 'Nombre de archivo inválido.')
  }

  const reservationId = newId()
  const storagePath = `courses/${d.courseId}/enrollments/${binding.enrollmentId}/deliveries/${deliveryId}/uploads/${reservationId}/${fileName}`
  const expiresAt = Timestamp.fromMillis(Date.now() + CONSTANTS.reservationMinutes * 60 * 1000)

  await db.doc(`uploadReservations/${reservationId}`).set({
    courseId: d.courseId,
    enrollmentId: binding.enrollmentId,
    deliveryId,
    ownerEnrollmentId: binding.enrollmentId,
    fileName,
    contentType,
    sizeBytes,
    storagePath,
    state: 'reserved',
    createdBy: uid,
    createdAt: Timestamp.now(),
    expiresAt,
  })

  return { reservationId, path: storagePath, expiresAt: expiresAt.toMillis() }
})

/** Envío idempotente de evidencia digital (submit_key) + consumo de reserva opcional. */
export const submitEvidence = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const binding = await getActiveBinding(uid)
  const deliveryId = String(request.data?.deliveryId ?? '')
  const submitKey = String(request.data?.submitKey ?? '')
  const format = String(request.data?.format ?? 'text')
  const description = String(request.data?.description ?? '')
  const reservationId = request.data?.reservationId ? String(request.data.reservationId) : null
  if (!deliveryId || !submitKey) throw new HttpsError('invalid-argument', 'deliveryId y submitKey son obligatorios.')

  // Idempotencia (camino rápido): el mismo submit_key devuelve el recibo sin duplicar la evidencia.
  const existingEvidence = await db.doc(`deliveries/${deliveryId}/evidence/${submitKey}`).get()
  if (existingEvidence.exists) {
    // Si el reintento creó una reserva nueva, se limpia su objeto para no dejar huérfanos.
    if (reservationId) {
      const rSnap = await db.doc(`uploadReservations/${reservationId}`).get()
      const r = rSnap.data()
      if (rSnap.exists && r && r.state === 'reserved' && r.storagePath) {
        try {
          await getStorage().bucket().file(r.storagePath as string).delete()
        } catch {
          /* el objeto no existe: nada que borrar */
        }
        await rSnap.ref.update({ state: 'consumed', consumedAt: Timestamp.now() })
      }
    }
    return { evidenceId: submitKey, version: existingEvidence.data()!.version as number, reused: true }
  }

  // Verificación externa (fuera de la transacción): la operación de Storage no participa
  // en la transacción de Firestore y así no se repite en reintentos.
  let storagePath: string | null = null
  if (reservationId) {
    const rSnap = await db.doc(`uploadReservations/${reservationId}`).get()
    if (!rSnap.exists) throw new HttpsError('failed-precondition', 'Reserva de archivo inválida.')
    const r = rSnap.data()!
    if (r.deliveryId !== deliveryId || r.ownerEnrollmentId !== binding.enrollmentId) {
      throw new HttpsError('failed-precondition', 'Reserva de archivo inválida.')
    }
    if (r.state !== 'reserved') throw new HttpsError('failed-precondition', 'La reserva no está disponible.')
    if ((r.expiresAt as Timestamp).toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'La reserva de archivo caducó.')
    }
    storagePath = r.storagePath as string

    let meta: { contentType?: string; size?: string | number } | undefined
    // Bucket desde la configuración efectiva de Admin (sin asumir el sufijo `.appspot.com`).
    try {
      const [m] = await getStorage().bucket().file(storagePath).getMetadata()
      meta = m
    } catch {
      throw new HttpsError('failed-precondition', 'El archivo reservado no existe en Storage.')
    }
    if (meta.contentType !== r.contentType || Number(meta.size) !== Number(r.sizeBytes)) {
      throw new HttpsError('failed-precondition', 'El archivo no coincide con la reserva (tipo o tamaño).')
    }
  }

  return db.runTransaction(async (tx: Transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`)
    const evidenceRef = db.doc(`deliveries/${deliveryId}/evidence/${submitKey}`)
    const reservationRef = reservationId ? db.doc(`uploadReservations/${reservationId}`) : null

    const deliverySnap = await tx.get(deliveryRef)
    const evidenceSnap = await tx.get(evidenceRef)
    const reservationSnap = reservationRef ? await tx.get(reservationRef) : null

    if (!deliverySnap.exists) throw new HttpsError('not-found', 'Entrega inexistente.')
    const d = deliverySnap.data()!
    if (d.ownerEnrollmentId !== binding.enrollmentId) {
      throw new HttpsError('permission-denied', 'Solo el propietario puede entregar.')
    }
    if (evidenceSnap.exists) {
      return { evidenceId: submitKey, version: evidenceSnap.data()!.version as number, reused: true }
    }
    if (!['not_started', 'in_progress'].includes(d.state as string)) {
      throw new HttpsError('failed-precondition', 'La entrega no admite envíos en su estado actual.')
    }
    if (reservationRef) {
      const r = reservationSnap?.data()
      if (!reservationSnap?.exists || !r || r.state !== 'reserved' || (r.expiresAt as Timestamp).toMillis() <= Date.now()) {
        throw new HttpsError('failed-precondition', 'Reserva de archivo no disponible.')
      }
    }

    const version = ((d.evidenceCount as number) ?? 0) + 1
    tx.create(evidenceRef, {
      version,
      origin: 'student_digital',
      format,
      testModality: 'not_applicable',
      description,
      submitKey,
      reservationId: reservationId ?? null,
      storagePath,
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
    if (reservationRef) {
      tx.update(reservationRef, { state: 'consumed', consumedAt: Timestamp.now() })
    }
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
  const rawSupports = Array.isArray(request.data?.supports) ? (request.data.supports as unknown[]) : []
  const supports = rawSupports.filter((s): s is string => typeof s === 'string' && EQUIVALENT_SUPPORTS.includes(s))

  const courseId = await courseOfEnrollment(enrollmentId)
  await assertTeacherOfCourse(uid, courseId)
  if (!(await milestoneInCourse(milestoneId, courseId))) {
    throw new HttpsError('failed-precondition', 'El hito no pertenece al programa del curso.')
  }
  if (!ALLOWED_EQUIVALENT_FORMATS.includes(format)) {
    throw new HttpsError('invalid-argument', 'Soporte de equivalencia no admitido.')
  }

  const deliveryId = deliveryIdFor(enrollmentId, milestoneId)
  const result = await db.runTransaction(async (tx: Transaction) => {
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
      supports,
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

/**
 * Limpieza de reservas caducadas sin evidencia (objetos huérfanos).
 * Distingue «objeto inexistente» de un fallo transitorio: solo marca la limpieza como
 * completada (`expired`) **después de confirmar** que el objeto ya no existe; ante un
 * error transitorio deja la reserva en `reserved` para reintentar en la próxima ejecución.
 * El bucket se toma de la configuración efectiva de Admin.
 */
export const cleanupExpiredUploads = onCall(async (request) => {
  const uid = assertSignedIn(request)
  const courseId = String(request.data?.courseId ?? '')
  await assertTeacherOfCourse(uid, courseId)

  const now = Date.now()
  const bucket = getStorage().bucket()
  const snap = await db
    .collection('uploadReservations')
    .where('courseId', '==', courseId)
    .where('state', '==', 'reserved')
    .get()

  let removed = 0
  let pending = 0
  for (const docSnap of snap.docs) {
    const r = docSnap.data()
    const expiresAt = r.expiresAt as Timestamp
    if (expiresAt.toMillis() > now) continue

    // Si ya hay una evidencia que referencia la reserva, solo se marca como consumida.
    const evSnap = await db
      .collection(`deliveries/${r.deliveryId as string}/evidence`)
      .where('reservationId', '==', docSnap.id)
      .limit(1)
      .get()
    if (!evSnap.empty) {
      await docSnap.ref.update({ state: 'consumed' })
      continue
    }

    if (r.storagePath) {
      const file = bucket.file(r.storagePath as string)
      try {
        const [exists] = await file.exists()
        if (exists) await file.delete()
        // Confirmación: si el objeto aún existe, el borrado no se completó.
        const [stillExists] = await file.exists()
        if (stillExists) {
          pending += 1
          continue
        }
      } catch {
        // Fallo transitorio: se conserva la reserva para reintentar.
        pending += 1
        continue
      }
    }
    await docSnap.ref.update({ state: 'expired', cleanedAt: Timestamp.now(), cleanedBy: uid })
    removed += 1
  }
  await audit(uid, 'teacher', 'cleanup_expired_uploads', 'course', courseId, { removed, pending })
  return { removed, pending }
})
