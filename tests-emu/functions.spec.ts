import { beforeEach, describe, expect, it } from 'vitest'
import { httpsCallable } from 'firebase/functions'
import { IDS, Timestamp, adminDb, adminUpload, seedSynthetic, studentClient, teacherClient } from './helpers'

beforeEach(async () => {
  await seedSynthetic()
})

describe('Identidad · canje, revocación y regeneración', () => {
  it('el canje válido crea un vínculo activo', async () => {
    const s = await studentClient()
    const redeem = httpsCallable<{ code: string }, { status: string; enrollmentId: string }>(s.functions, 'redeemCode')
    const r = await redeem({ code: IDS.codeS1 })
    expect(r.data.status).toBe('ok')
    expect(r.data.enrollmentId).toBe(IDS.s1)
    const b = await adminDb.doc(`sessionBindings/${s.uid}`).get()
    expect(b.data()?.state).toBe('active')
  })

  it('un código inválido se rechaza sin vínculo', async () => {
    const s = await studentClient()
    const redeem = httpsCallable<{ code: string }, { status: string }>(s.functions, 'redeemCode')
    const r = await redeem({ code: 'NO-EXISTE' })
    expect(r.data.status).toBe('invalid')
    expect((await adminDb.doc(`sessionBindings/${s.uid}`).get()).exists).toBe(false)
  })

  it('la revocación docente corta el vínculo de inmediato', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const t = await teacherClient(IDS.t1)
    await httpsCallable(t.functions, 'revokeSession')({ enrollmentId: IDS.s2, reason: 'prueba' })
    const b = await adminDb.doc(`sessionBindings/${s.uid}`).get()
    expect(b.data()?.state).toBe('revoked')
  })

  it('regenerar el código invalida el anterior y habilita el nuevo', async () => {
    const t = await teacherClient(IDS.t1)
    const regen = httpsCallable<{ enrollmentId: string }, { code: string }>(t.functions, 'regenerateCode')
    const nuevo = (await regen({ enrollmentId: IDS.s1 })).data.code
    expect(nuevo.length).toBeGreaterThanOrEqual(20)
    const s = await studentClient()
    const redeem = httpsCallable<{ code: string }, { status: string }>(s.functions, 'redeemCode')
    expect((await redeem({ code: IDS.codeS1 })).data.status).toBe('revoked')
    expect((await redeem({ code: nuevo })).data.status).toBe('ok')
  })
})

describe('Entregas · envío idempotente, equivalencia y validación', () => {
  it('submitEvidence es idempotente por submit_key', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string }, { evidenceId: string; version: number }>(s.functions, 'submitEvidence')
    const a = await submit({ deliveryId, submitKey: 'k1', format: 'text', description: 'primera' })
    const b = await submit({ deliveryId, submitKey: 'k1', format: 'text', description: 'primera' })
    expect(a.data.evidenceId).toBe(b.data.evidenceId)
    const ev = await adminDb.doc(`deliveries/${deliveryId}/evidence/k1`).get()
    expect(ev.data()?.version).toBe(1)
  })

  it('validación completa e idempotencia de XP', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'k2', format: 'text', description: 'x' })

    const t = await teacherClient(IDS.t1)
    const validate = httpsCallable<{ deliveryId: string; assessments: unknown[]; comment: string }, { status: string }>(t.functions, 'validateMilestone')
    const full = [
      { indicatorCode: 'D1', level: 'achieved' },
      { indicatorCode: 'E1', level: 'developing' },
    ]
    const r1 = await validate({ deliveryId, assessments: full, comment: 'ok' })
    expect(r1.data.status).toBe('achieved')

    // Segunda validación sin reabrir: rechazada por estado.
    await expect(validate({ deliveryId, assessments: full, comment: 'otra' })).rejects.toThrow()

    // Reabrir, reenviar y revalidar: el XP sigue siendo uno.
    await httpsCallable(t.functions, 'reopenMilestone')({ deliveryId })
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'k3', format: 'text', description: 'v2' })
    const r2 = await validate({ deliveryId, assessments: [{ indicatorCode: 'D1', level: 'achieved' }, { indicatorCode: 'E1', level: 'achieved' }], comment: 'ok2' })
    expect(r2.data.status).toBe('achieved')

    const xp = await adminDb.collection('xpEvents').where('enrollmentId', '==', IDS.s2).where('milestoneId', '==', IDS.milestone1).get()
    expect(xp.size).toBe(1)
  })

  it('rechaza validación incompleta', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'k4', format: 'text', description: 'x' })
    const t = await teacherClient(IDS.t1)
    const validate = httpsCallable(t.functions, 'validateMilestone')
    // milestone1 exige D1 y E1; enviamos solo D1.
    await expect(validate({ deliveryId, assessments: [{ indicatorCode: 'D1', level: 'achieved' }] })).rejects.toThrow()
  })

  it('registro docente de evidencia equivalente sin entrega previa', async () => {
    const t = await teacherClient(IDS.t1)
    const reg = httpsCallable<{ enrollmentId: string; milestoneId: string; format: string; description: string; testModality: string; submitKey: string }, { deliveryId: string }>(t.functions, 'registerEquivalentEvidence')
    const r = await reg({ enrollmentId: IDS.s1, milestoneId: IDS.milestone1, format: 'paper', description: 'papel', testModality: 'simulation', submitKey: 'eq-1' })
    const d = await adminDb.doc(`deliveries/${r.data.deliveryId}`).get()
    expect(d.data()?.state).toBe('pending_review')
    const ev = await adminDb.doc(`deliveries/${r.data.deliveryId}/evidence/eq-1`).get()
    expect(ev.data()?.origin).toBe('teacher_equivalent')
    // Hito inexistente → rechazado.
    await expect(reg({ enrollmentId: IDS.s1, milestoneId: 'no-existe', format: 'paper', description: 'x', testModality: 'simulation', submitKey: 'eq-2' })).rejects.toThrow()
  })

  it('el docente de otro curso no puede validar', async () => {
    const t2 = await teacherClient(IDS.t2)
    const validate = httpsCallable(t2.functions, 'validateMilestone')
    await expect(validate({ deliveryId: `${IDS.s1}_${IDS.milestone1}`, assessments: [{ indicatorCode: 'D1', level: 'achieved' }, { indicatorCode: 'E1', level: 'achieved' }] })).rejects.toThrow()
  })
})

describe('Endurecimiento · reserva de archivos y docentes desactivados', () => {
  it('reserveUpload crea una reserva que se consume al enviar evidencia', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const r = await reserve({ deliveryId, fileName: 'guia.pdf', contentType: 'application/pdf', sizeBytes: 1024 })
    expect(r.data.path).toContain(r.data.reservationId)
    expect((await adminDb.doc(`uploadReservations/${r.data.reservationId}`).get()).data()?.state).toBe('reserved')

    await adminUpload(r.data.path, Buffer.alloc(1024), 'application/pdf')
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string; reservationId: string }, { evidenceId: string }>(s.functions, 'submitEvidence')
    await submit({ deliveryId, submitKey: 'rk1', format: 'file', description: 'x', reservationId: r.data.reservationId })
    expect((await adminDb.doc(`uploadReservations/${r.data.reservationId}`).get()).data()?.state).toBe('consumed')
  })

  it('reserveUpload rechaza tipo y tamaño no permitidos', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    const reserve = httpsCallable(s.functions, 'reserveUpload')
    await expect(reserve({ deliveryId, fileName: 'a.exe', contentType: 'application/x-msdownload', sizeBytes: 10 })).rejects.toThrow()
    await expect(reserve({ deliveryId, fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 6 * 1024 * 1024 })).rejects.toThrow()
  })

  it('un docente desactivado no puede operar', async () => {
    const t3 = await teacherClient(IDS.t3)
    await expect(httpsCallable(t3.functions, 'revokeSession')({ enrollmentId: IDS.s1, reason: 'x' })).rejects.toThrow()
    await expect(httpsCallable(t3.functions, 'regenerateCode')({ enrollmentId: IDS.s1 })).rejects.toThrow()
    await expect(httpsCallable(t3.functions, 'validateMilestone')({ deliveryId: `${IDS.s1}_${IDS.milestone1}`, assessments: [{ indicatorCode: 'D1', level: 'achieved' }] })).rejects.toThrow()
  })
})

describe('Endurecimiento · verificación de objeto y reserva', () => {
  async function prepare() {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const r = (await reserve({ deliveryId, fileName: 'guia.pdf', contentType: 'application/pdf', sizeBytes: 1024 })).data
    return { s, deliveryId, ...r }
  }

  it('exige el objeto real y no consume la reserva si falta', async () => {
    const { s, deliveryId, reservationId } = await prepare()
    const submit = httpsCallable(s.functions, 'submitEvidence')
    await expect(submit({ deliveryId, submitKey: 'v1', format: 'file', description: 'x', reservationId })).rejects.toThrow()
    expect((await adminDb.doc(`uploadReservations/${reservationId}`).get()).data()?.state).toBe('reserved')
  })

  it('consume tras verificar el objeto y es idempotente sin re-consumir', async () => {
    const { s, deliveryId, reservationId, path } = await prepare()
    await adminUpload(path, Buffer.alloc(1024), 'application/pdf')
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string; reservationId: string }, { evidenceId: string; reused: boolean }>(s.functions, 'submitEvidence')
    const a = await submit({ deliveryId, submitKey: 'v2', format: 'file', description: 'x', reservationId })
    expect((await adminDb.doc(`uploadReservations/${reservationId}`).get()).data()?.state).toBe('consumed')
    const b = await submit({ deliveryId, submitKey: 'v2', format: 'file', description: 'x', reservationId })
    expect(b.data.evidenceId).toBe(a.data.evidenceId)
    expect(b.data.reused).toBe(true)
  })

  it('rechaza si el objeto no coincide con la reserva (tamaño)', async () => {
    const { s, deliveryId, reservationId, path } = await prepare()
    await adminUpload(path, Buffer.alloc(2048), 'application/pdf')
    const submit = httpsCallable(s.functions, 'submitEvidence')
    await expect(submit({ deliveryId, submitKey: 'v3', format: 'file', description: 'x', reservationId })).rejects.toThrow()
  })

  it('rechaza si la reserva caducó entre la subida y el envío', async () => {
    const { s, deliveryId, reservationId, path } = await prepare()
    await adminUpload(path, Buffer.alloc(1024), 'application/pdf')
    await adminDb.doc(`uploadReservations/${reservationId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    const submit = httpsCallable(s.functions, 'submitEvidence')
    await expect(submit({ deliveryId, submitKey: 'v4', format: 'file', description: 'x', reservationId })).rejects.toThrow()
  })
})

describe('Diagnóstico · encuesta, respuestas, envío y revisión', () => {
  const survey = { A1: 'teléfono propio', A2: 'en el colegio', A3: 'leer pasos', A4: 'ninguna', A5: 'sí', A6: 'trámite' }

  it('guarda encuesta y respuestas, y el envío es inmutable', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    await httpsCallable(s.functions, 'saveConditionsSurvey')({ answers: survey })
    const { attemptId } = (
      await httpsCallable<{ kind: string }, { attemptId: string }>(s.functions, 'startDiagnosisAttempt')({ kind: 'pre' })
    ).data
    const saveResp = httpsCallable(s.functions, 'saveDiagnosisResponse')
    await saveResp({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'respuesta', technicalIssue: false, supports: ['audio_reading'] })
    await saveResp({ attemptId, taskCode: 'T2', responseStatus: 'not_answered', responseText: '', technicalIssue: true, supports: [] })
    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })

    // Inmutable tras el envío.
    await expect(saveResp({ attemptId, taskCode: 'T3', responseStatus: 'answered', responseText: 'x', technicalIssue: false, supports: [] })).rejects.toThrow()

    const t1 = await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T1`).get()
    expect(t1.data()?.supports).toEqual(['audio_reading'])
    const t2 = await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T2`).get()
    expect(t2.data()?.responseStatus).toBe('not_answered')
    expect(t2.data()?.technicalIssue).toBe(true)
    expect(t2.data()?.score ?? null).toBeNull()
    const enroll = await adminDb.doc(`enrollments/${IDS.s2}`).get()
    expect(enroll.data()?.surveySubmitted).toBe(true)
  })

  it('el docente revisa solo tras el envío; otro docente no puede', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    await httpsCallable(s.functions, 'saveConditionsSurvey')({ answers: survey })
    const { attemptId } = (
      await httpsCallable<{ kind: string }, { attemptId: string }>(s.functions, 'startDiagnosisAttempt')({ kind: 'pre' })
    ).data
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'r', technicalIssue: false, supports: [] })

    const t1 = await teacherClient(IDS.t1)
    const review = httpsCallable(t1.functions, 'reviewDiagnosisResponse')
    await expect(review({ attemptId, taskCode: 'T1', score: 2, reviewerComment: 'x' })).rejects.toThrow()

    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })
    await review({ attemptId, taskCode: 'T1', score: 2, reviewerComment: 'Bien.' })
    expect((await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T1`).get()).data()?.score).toBe(2)

    const t2 = await teacherClient(IDS.t2)
    await expect(httpsCallable(t2.functions, 'reviewDiagnosisResponse')({ attemptId, taskCode: 'T1', score: 1 })).rejects.toThrow()
  })
})
