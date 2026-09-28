import { beforeEach, describe, expect, it } from 'vitest'
import { httpsCallable } from 'firebase/functions'
import { getStorage } from 'firebase-admin/storage'
import { IDS, PROJECT, Timestamp, adminDb, adminUpload, seedSynthetic, studentClient, teacherClient } from './helpers'

beforeEach(async () => {
  await seedSynthetic()
})

/**
 * Confirma por el docente todos los ítems de la evidencia mínima del hito para la versión
 * vigente de una entrega (requisito de `validateMilestone` en M2/M5).
 */
async function confirmChecklist(t: { functions: unknown }, deliveryId: string, milestoneId: string): Promise<void> {
  const ms = await adminDb.doc(`milestones/${milestoneId}`).get()
  const items = (ms.data()?.evidenceChecklist as string[]) ?? []
  for (let i = 0; i < items.length; i++) {
    await httpsCallable(t.functions as never, 'confirmChecklistItem')({ deliveryId, itemIndex: i })
  }
}

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
    const { deliveryId } = (await start({ milestoneId: IDS.milestone2 })).data
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
    const { deliveryId } = (await start({ milestoneId: IDS.milestone2 })).data
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
    const { deliveryId } = (await start({ milestoneId: IDS.milestone2 })).data
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
  const survey = {
    A1: ['teléfono propio'],
    A2: 'en el colegio',
    A3: 'leer pasos',
    A4: { option: 'ninguna', other: '' },
    A5: { created: 'sí', verified: 'alguna vez', explained: 'no' },
    A6: 'trámite',
  }

  async function prepareAttempt(code = IDS.codeS4) {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code })
    await httpsCallable(s.functions, 'saveConditionsSurvey')({ answers: survey })
    const { attemptId } = (
      await httpsCallable<{ kind: string }, { attemptId: string }>(s.functions, 'startDiagnosisAttempt')({ kind: 'pre' })
    ).data
    return { s, attemptId }
  }

  it('acepta encuesta múltiple/opcional y rechaza combinaciones inválidas', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS4 })
    const save = httpsCallable(s.functions, 'saveConditionsSurvey')

    // A1 múltiple + A6 vacío + A4 «otra» con detalle.
    await save({
      answers: {
        A1: ['teléfono propio', 'computador compartido'],
        A2: 'prefiero no responder',
        A3: '',
        A4: { option: 'otra', other: 'espacio con menos ruido' },
        A5: { created: 'no', verified: 'no recuerdo', explained: 'alguna vez' },
        A6: '',
      },
    })
    const stored = await adminDb.doc(`conditionsSurveys/${IDS.s4}`).get()
    expect(stored.data()?.schemaVersion).toBe(2)
    expect(stored.data()?.answers.A1).toEqual(['teléfono propio', 'computador compartido'])

    await expect(save({ answers: { ...survey, A1: ['prefiero no responder', 'ninguno'] } })).rejects.toThrow()
    await expect(save({ answers: { ...survey, A4: { option: 'otra', other: '' } } })).rejects.toThrow()
    await expect(save({ answers: { ...survey, A1: 'teléfono propio' } })).rejects.toThrow()
  })

  it('guarda encuesta y respuestas de forma atómica; el envío es inmutable', async () => {
    const { s, attemptId } = await prepareAttempt()
    const saveResp = httpsCallable(s.functions, 'saveDiagnosisResponse')
    await saveResp({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'respuesta', technicalIssue: false, supports: ['audio_reading'] })
    await saveResp({ attemptId, taskCode: 'T2', responseStatus: 'not_answered', responseText: '', technicalIssue: true, supports: [] })
    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })

    // Inmutable tras el envío.
    await expect(saveResp({ attemptId, taskCode: 'T3', responseStatus: 'answered', responseText: 'x', technicalIssue: false, supports: [] })).rejects.toThrow()
    await expect(httpsCallable(s.functions, 'saveConditionsSurvey')({ answers: survey })).rejects.toThrow()

    const t1 = await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T1`).get()
    expect(t1.data()?.supports).toEqual(['audio_reading'])
    const t2 = await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T2`).get()
    expect(t2.data()?.responseStatus).toBe('not_answered')
    expect(t2.data()?.technicalIssue).toBe(true)
    expect(t2.data()?.score ?? null).toBeNull()
    const enroll = await adminDb.doc(`enrollments/${IDS.s4}`).get()
    expect(enroll.data()?.surveySubmitted).toBe(true)
  })

  it('permite corregir la encuesta antes del envío y exige encuesta para enviar', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS4 })
    const { attemptId } = (
      await httpsCallable<{ kind: string }, { attemptId: string }>(s.functions, 'startDiagnosisAttempt')({ kind: 'pre' })
    ).data
    // Sin encuesta, el envío se rechaza.
    await expect(httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })).rejects.toThrow()

    const save = httpsCallable(s.functions, 'saveConditionsSurvey')
    await save({ answers: survey })
    await save({ answers: { ...survey, A6: 'corregida antes del envío' } })
    const stored = await adminDb.doc(`conditionsSurveys/${IDS.s4}`).get()
    expect(stored.data()?.answers.A6).toBe('corregida antes del envío')
  })

  it('el docente revisa solo tras el envío; otro docente o uno inactivo no puede', async () => {
    const { s, attemptId } = await prepareAttempt()
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'r', technicalIssue: false, supports: [] })

    const t1 = await teacherClient(IDS.t1)
    const review = httpsCallable(t1.functions, 'reviewDiagnosisResponse')
    await expect(review({ attemptId, taskCode: 'T1', score: 2, reviewerComment: 'x' })).rejects.toThrow()

    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })
    await review({ attemptId, taskCode: 'T1', score: 2, reviewerComment: 'Bien.' })
    expect((await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T1`).get()).data()?.score).toBe(2)

    const t2 = await teacherClient(IDS.t2)
    await expect(httpsCallable(t2.functions, 'reviewDiagnosisResponse')({ attemptId, taskCode: 'T1', score: 1 })).rejects.toThrow()
    const t3 = await teacherClient(IDS.t3)
    await expect(httpsCallable(t3.functions, 'reviewDiagnosisResponse')({ attemptId, taskCode: 'T1', score: 1 })).rejects.toThrow()
  })

  it('exige una respuesta existente y conserva puntaje nulo con barrera/no respuesta', async () => {
    const { s, attemptId } = await prepareAttempt()
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'r', technicalIssue: false, supports: [] })
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T2', responseStatus: 'not_answered', responseText: '', technicalIssue: true, supports: [] })
    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })

    const t1 = await teacherClient(IDS.t1)
    const review = httpsCallable(t1.functions, 'reviewDiagnosisResponse')

    // T5 no tiene respuesta: no se puede valorar.
    await expect(review({ attemptId, taskCode: 'T5', score: 1 })).rejects.toThrow()
    // T2 tiene barrera técnica: solo puntaje nulo.
    await expect(review({ attemptId, taskCode: 'T2', score: 1 })).rejects.toThrow()
    await review({ attemptId, taskCode: 'T2', score: null, reviewerComment: 'Barrera técnica.' })
    expect((await adminDb.doc(`diagnosisAttempts/${attemptId}/responses/T2`).get()).data()?.score ?? null).toBeNull()
  })

  it('registra el historial al corregir la valoración y la devolución', async () => {
    const { s, attemptId } = await prepareAttempt()
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'r', technicalIssue: false, supports: [] })
    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })

    const t1 = await teacherClient(IDS.t1)
    const review = httpsCallable(t1.functions, 'reviewDiagnosisResponse')
    await review({ attemptId, taskCode: 'T1', score: 2, reviewerComment: 'Muy bien.' })
    await review({ attemptId, taskCode: 'T1', score: 1, reviewerComment: 'Puede profundizar.' })
    await httpsCallable(t1.functions, 'saveDiagnosisFeedback')({ attemptId, strength: 'Contrasta autoría.', nextStep: 'Verificar la fecha.' })

    const history = await adminDb.collection('diagnosisReviewHistory').where('attemptId', '==', attemptId).get()
    const kinds = history.docs.map((d) => d.data().kind)
    expect(kinds).toContain('score')
    expect(kinds).toContain('feedback')
    const scoreEntry = history.docs.find((d) => d.data().kind === 'score' && d.data().newScore === 1)
    expect(scoreEntry?.data().previousScore).toBe(2)
    expect(scoreEntry?.data().newScore).toBe(1)
    const attempt = await adminDb.doc(`diagnosisAttempts/${attemptId}`).get()
    expect(attempt.data()?.strength).toBe('Contrasta autoría.')
    expect(attempt.data()?.nextStep).toBe('Verificar la fecha.')
  })

  it('el acceso docente de demostración solo resuelve docentes activos', async () => {
    const s = await studentClient()
    const signIn = httpsCallable<{ code: string }, { token: string; teacherUid: string }>(s.functions, 'teacherDemoSignIn')
    const ok = await signIn({ code: 'DOCENTE-01' })
    expect(ok.data.teacherUid).toBe(IDS.t1)
    expect(typeof ok.data.token).toBe('string')
    await expect(signIn({ code: 'NO-EXISTE' })).rejects.toThrow()
  })

  it('no permite iniciar ni enviar el postest no validado', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS4 })
    await expect(httpsCallable(s.functions, 'startDiagnosisAttempt')({ kind: 'post' })).rejects.toThrow()
    // Un intento post creado fuera de la función tampoco puede enviarse.
    await adminDb.doc(`diagnosisAttempts/${IDS.s4}_post`).set({
      courseId: IDS.courseX, enrollmentId: IDS.s4, kind: 'post', diagnosisVersionId: 'post-v1', status: 'draft',
    })
    await expect(httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId: `${IDS.s4}_post` })).rejects.toThrow()
  })
})

describe('Misión y entrega de texto (I2a)', () => {
  async function startMissionFor(code: string, milestoneId = IDS.milestone2) {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code })
    const { deliveryId } = (
      await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId })
    ).data
    return { s, deliveryId }
  }

  it('registra la entrega de texto y conserva versiones al reenviar tras reabrir', async () => {
    const { s, deliveryId } = await startMissionFor(IDS.codeS4)
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string }, { version: number }>(s.functions, 'submitEvidence')
    const v1 = await submit({ deliveryId, submitKey: 't1', format: 'text', description: 'Ficha v1' })
    expect(v1.data.version).toBe(1)
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('pending_review')

    // El docente reabre el hito; el estudiante envía una segunda versión.
    const t = await teacherClient(IDS.t1)
    await httpsCallable(t.functions, 'reopenMilestone')({ deliveryId })
    const v2 = await submit({ deliveryId, submitKey: 't2', format: 'text', description: 'Ficha v2' })
    expect(v2.data.version).toBe(2)

    const evs = await adminDb.collection(`deliveries/${deliveryId}/evidence`).get()
    expect(evs.size).toBe(2)
    expect(evs.docs.map((d) => d.data().version).sort()).toEqual([1, 2])
  })

  it('aísla las entregas entre estudiantes: cada uno tiene su propio documento', async () => {
    const a = await startMissionFor(IDS.codeS4)
    const b = await startMissionFor(IDS.codeS5)
    expect(a.deliveryId).not.toBe(b.deliveryId)
    const da = await adminDb.doc(`deliveries/${a.deliveryId}`).get()
    const db2 = await adminDb.doc(`deliveries/${b.deliveryId}`).get()
    expect(da.data()?.ownerEnrollmentId).toBe(IDS.s4)
    expect(db2.data()?.ownerEnrollmentId).toBe(IDS.s5)
    expect(da.data()?.courseId).toBe(IDS.courseX)
  })

  it('no permite enviar la entrega de otro estudiante', async () => {
    const { deliveryId } = await startMissionFor(IDS.codeS4)
    const other = await studentClient()
    await httpsCallable(other.functions, 'redeemCode')({ code: IDS.codeS5 })
    await expect(
      httpsCallable(other.functions, 'submitEvidence')({ deliveryId, submitKey: 'x', format: 'text', description: 'ajena' }),
    ).rejects.toThrow()
  })
})

describe('Revisión de misión · validación, XP, ajuste y equivalencia (I2b)', () => {
  const S7_DELIVERY = `${IDS.s7}_${IDS.milestone2}`
  const xpOf = (enrollmentId: string) =>
    adminDb.collection('xpEvents').where('enrollmentId', '==', enrollmentId).where('milestoneId', '==', IDS.milestone2).get()

  it('valida el hito, otorga XP una sola vez y guarda fortaleza/siguiente paso', async () => {
    const t = await teacherClient(IDS.t1)
    const validate = httpsCallable(t.functions, 'validateMilestone')
    await confirmChecklist(t, S7_DELIVERY, IDS.milestone2)
    await validate({
      deliveryId: S7_DELIVERY,
      comment: 'Buen contraste.',
      assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'achieved', comment: 'ok', strength: 'Contrasta autoría.', nextStep: 'Verificar la fecha.' }],
    })
    expect((await adminDb.doc(`deliveries/${S7_DELIVERY}`).get()).data()?.state).toBe('achieved')
    expect((await xpOf(IDS.s7)).size).toBe(1)
    const a = await adminDb.doc(`assessments/${IDS.s7}_${IDS.milestone2}_D1`).get()
    expect(a.data()?.strength).toBe('Contrasta autoría.')
    expect(a.data()?.nextStep).toBe('Verificar la fecha.')

    // Revalidar no duplica XP ni cambia el estado.
    await expect(validate({ deliveryId: S7_DELIVERY, assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'achieved' }] })).rejects.toThrow()
    expect((await xpOf(IDS.s7)).size).toBe(1)
  })

  it('admite «no evaluado» como estado distinto de una valoración baja', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS4 })
    const { deliveryId } = (await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId: IDS.milestone2 })).data
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'ne1', format: 'text', description: 'x' })

    const t = await teacherClient(IDS.t1)
    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({
      deliveryId,
      assessments: [{ enrollmentId: IDS.s4, indicatorCode: 'D1', level: 'not_evaluated' }],
    })
    expect((await adminDb.doc(`assessments/${IDS.s4}_${IDS.milestone2}_D1`).get()).data()?.level).toBe('not_evaluated')
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')
  })

  it('pide ajuste, conserva versiones y no duplica el XP en el reintento', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS4 })
    const { deliveryId } = (await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId: IDS.milestone2 })).data
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'v1', format: 'text', description: 'v1' })

    const t = await teacherClient(IDS.t1)
    await httpsCallable(t.functions, 'requestAdjustment')({ deliveryId, action: 'Añade una fuente.' })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('in_progress')
    expect((await adminDb.collection('deliveryHistory').where('deliveryId', '==', deliveryId).get()).size).toBe(1)

    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'v2', format: 'text', description: 'v2' })
    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({ deliveryId, assessments: [{ enrollmentId: IDS.s4, indicatorCode: 'D1', level: 'achieved' }] })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')
    const evs = await adminDb.collection(`deliveries/${deliveryId}/evidence`).get()
    expect(evs.size).toBe(2)
    expect((await xpOf(IDS.s4)).size).toBe(1)
  })

  it('valora por estudiante en una entrega de equipo, exigiendo contribución propia', async () => {
    const t = await teacherClient(IDS.t1)
    const deliveryId = `${IDS.s1}_${IDS.milestone2}`
    const validate = httpsCallable(t.functions, 'validateMilestone')

    // Sin contribuciones individuales, no se otorga XP por integrante.
    await expect(
      validate({
        deliveryId,
        assessments: [
          { enrollmentId: IDS.s1, indicatorCode: 'D1', level: 'achieved' },
          { enrollmentId: IDS.s2, indicatorCode: 'D1', level: 'developing' },
        ],
      }),
    ).rejects.toThrow()

    // S1 registra su aporte; el docente registra el de S2 (vía equivalente).
    const s1 = await studentClient()
    await httpsCallable(s1.functions, 'redeemCode')({ code: IDS.codeS1 })
    await httpsCallable(s1.functions, 'registerContribution')({ deliveryId, description: 'Redacté la ficha de necesidad.' })
    await httpsCallable(t.functions, 'registerContribution')({ deliveryId, enrollmentId: IDS.s2, description: 'Aportó la búsqueda de fuentes (papel).' })
    await confirmChecklist(t, deliveryId, IDS.milestone2)

    await validate({
      deliveryId,
      assessments: [
        { enrollmentId: IDS.s1, indicatorCode: 'D1', level: 'achieved' },
        { enrollmentId: IDS.s2, indicatorCode: 'D1', level: 'developing' },
      ],
    })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')
    expect((await xpOf(IDS.s1)).size).toBe(1)
    expect((await xpOf(IDS.s2)).size).toBe(1)
    expect((await adminDb.doc(`deliveries/${deliveryId}/contributors/${IDS.s2}`).get()).data()?.origin).toBe('teacher_equivalent')
  })

  it('registra entrega equivalente con apoyos, la deja por revisar y la valida con el mismo XP', async () => {
    const t = await teacherClient(IDS.t1)
    const reg = await httpsCallable<{ enrollmentId: string; milestoneId: string; format: string; description: string; testModality: string; supports: string[]; submitKey: string }, { deliveryId: string }>(
      t.functions,
      'registerEquivalentEvidence',
    )({
      enrollmentId: IDS.s8,
      milestoneId: IDS.milestone2,
      format: 'paper',
      description: 'Ficha en papel registrada por el docente.',
      testModality: 'simulation',
      supports: ['reading', 'extra_time'],
      submitKey: 'eq-s8',
    })
    const deliveryId = reg.data.deliveryId
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('pending_review')
    const ev = await adminDb.doc(`deliveries/${deliveryId}/evidence/eq-s8`).get()
    expect(ev.data()?.origin).toBe('teacher_equivalent')
    expect(ev.data()?.supports).toEqual(['reading', 'extra_time'])

    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({ deliveryId, assessments: [{ enrollmentId: IDS.s8, indicatorCode: 'D1', level: 'achieved' }] })
    expect((await xpOf(IDS.s8)).size).toBe(1)
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')
  })

  it('un docente de otro curso o inactivo no valida', async () => {
    const t2 = await teacherClient(IDS.t2)
    await expect(
      httpsCallable(t2.functions, 'validateMilestone')({ deliveryId: S7_DELIVERY, assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'achieved' }] }),
    ).rejects.toThrow()
    const t3 = await teacherClient(IDS.t3)
    await expect(
      httpsCallable(t3.functions, 'validateMilestone')({ deliveryId: S7_DELIVERY, assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'achieved' }] }),
    ).rejects.toThrow()
  })

  it('retira y reinstaura el XP sin duplicar el evento', async () => {
    const t = await teacherClient(IDS.t1)
    await confirmChecklist(t, S7_DELIVERY, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({ deliveryId: S7_DELIVERY, assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'achieved' }] })
    const xpSnap = await xpOf(IDS.s7)
    const xpEventId = xpSnap.docs[0].id

    await httpsCallable(t.functions, 'revokeXp')({ xpEventId, reason: 'corrección' })
    expect((await adminDb.doc(`xpEvents/${xpEventId}`).get()).data()?.revokedAt).not.toBeNull()

    await httpsCallable(t.functions, 'restoreXp')({ xpEventId })
    expect((await adminDb.doc(`xpEvents/${xpEventId}`).get()).data()?.revokedAt).toBeNull()
    expect((await xpOf(IDS.s7)).size).toBe(1)
  })
})


describe('I2c � reapertura segura, no evaluado y limpieza de reservas', () => {
  async function freshDelivery(code: string) {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code })
    const { deliveryId } = (
      await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId: IDS.milestone2 })
    ).data
    return { s, deliveryId }
  }

  it('reabre solo desde por revisar o logrado, con historial y sin duplicar XP', async () => {
    const { s, deliveryId } = await freshDelivery(IDS.codeS4)
    const t = await teacherClient(IDS.t1)

    // Desde not_started no se reabre.
    await expect(httpsCallable(t.functions, 'reopenMilestone')({ deliveryId })).rejects.toThrow()

    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'rc1', format: 'text', description: 'x' })
    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({ deliveryId, assessments: [{ enrollmentId: IDS.s4, indicatorCode: 'D1', level: 'achieved' }] })

    await httpsCallable(t.functions, 'reopenMilestone')({ deliveryId, action: 'Ajusta la fuente.' })
    const d = await adminDb.doc(`deliveries/${deliveryId}`).get()
    expect(d.data()?.state).toBe('in_progress')
    expect((d.data()?.adjustment as { action: string }).action).toBe('Ajusta la fuente.')
    expect((await adminDb.collection('deliveryHistory').where('deliveryId', '==', deliveryId).get()).size).toBe(1)

    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'rc2', format: 'text', description: 'y' })
    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({ deliveryId, assessments: [{ enrollmentId: IDS.s4, indicatorCode: 'D1', level: 'achieved' }] })
    const xp = await adminDb.collection('xpEvents').where('enrollmentId', '==', IDS.s4).where('milestoneId', '==', IDS.milestone2).get()
    expect(xp.size).toBe(1)
  })

  it('no reabre una entrega ya en proceso', async () => {
    const t = await teacherClient(IDS.t1)
    await expect(httpsCallable(t.functions, 'reopenMilestone')({ deliveryId: `${IDS.s9}_${IDS.milestone2}` })).rejects.toThrow()
  })

  it('acredita el hito con todo �no evaluado� sin convertir la competencia en 0', async () => {
    const t = await teacherClient(IDS.t1)
    await confirmChecklist(t, `${IDS.s7}_${IDS.milestone2}`, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({
      deliveryId: `${IDS.s7}_${IDS.milestone2}`,
      assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'not_evaluated' }],
    })
    const d = await adminDb.doc(`deliveries/${IDS.s7}_${IDS.milestone2}`).get()
    expect(d.data()?.state).toBe('achieved')
    expect(d.data()?.competenceObserved).toBe(false)
    expect((await adminDb.doc(`assessments/${IDS.s7}_${IDS.milestone2}_D1`).get()).data()?.level).toBe('not_evaluated')
    expect((await adminDb.collection('xpEvents').where('enrollmentId', '==', IDS.s7).where('milestoneId', '==', IDS.milestone2).get()).size).toBe(1)
  })

  it('marca competenceObserved=true cuando hay alguna observaci�n', async () => {
    const t = await teacherClient(IDS.t1)
    await confirmChecklist(t, `${IDS.s7}_${IDS.milestone2}`, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({
      deliveryId: `${IDS.s7}_${IDS.milestone2}`,
      assessments: [{ enrollmentId: IDS.s7, indicatorCode: 'D1', level: 'developing' }],
    })
    expect((await adminDb.doc(`deliveries/${IDS.s7}_${IDS.milestone2}`).get()).data()?.competenceObserved).toBe(true)
  })

  it('rechaza si el MIME real no coincide con la reserva', async () => {
    const { s, deliveryId } = await freshDelivery(IDS.codeS4)
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const r = (await reserve({ deliveryId, fileName: 'guia.pdf', contentType: 'application/pdf', sizeBytes: 1024 })).data
    await adminUpload(r.path, Buffer.alloc(1024), 'text/plain')
    await expect(
      httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'mime1', format: 'file', description: 'x', reservationId: r.reservationId }),
    ).rejects.toThrow()
  })

  it('limpia reservas caducadas sin evidencia y borra el objeto hu�rfano', async () => {
    const { s, deliveryId } = await freshDelivery(IDS.codeS4)
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const r = (await reserve({ deliveryId, fileName: 'guia.txt', contentType: 'text/plain', sizeBytes: 3 })).data
    await adminUpload(r.path, Buffer.from('abc'), 'text/plain')
    await adminDb.doc(`uploadReservations/${r.reservationId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })

    const t = await teacherClient(IDS.t1)
    const res = await httpsCallable<{ courseId: string }, { removed: number }>(t.functions, 'cleanupExpiredUploads')({ courseId: IDS.courseX })
    expect(res.data.removed).toBeGreaterThanOrEqual(1)
    expect((await adminDb.doc(`uploadReservations/${r.reservationId}`).get()).data()?.state).toBe('expired')
    const [exists] = await getStorage().bucket('demo-red-tic.appspot.com').file(r.path).exists()
    expect(exists).toBe(false)
  })
})


describe('I2d � seis misiones, robustez de archivos y XP narrativo', () => {
  async function freshDelivery(code: string, milestoneId = IDS.milestone2) {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code })
    const { deliveryId } = (
      await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId })
    ).data
    return { s, deliveryId }
  }

  it('completa las seis misiones y suma 160 XP (avance narrativo, no competencia)', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS4 })
    const t = await teacherClient(IDS.t1)
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const submit = httpsCallable(s.functions, 'submitEvidence')
    const validate = httpsCallable(t.functions, 'validateMilestone')

    // M1 exige el diagnóstico entregado (o barrera técnica). Se registra el diagnóstico primero.
    await httpsCallable(s.functions, 'saveConditionsSurvey')({
      answers: {
        A1: [], A2: '', A3: '', A4: { option: '', other: '' },
        A5: { created: '', verified: '', explained: '' }, A6: '',
      },
    })
    const { attemptId } = (
      await httpsCallable<{ kind: string }, { attemptId: string }>(s.functions, 'startDiagnosisAttempt')({ kind: 'pre' })
    ).data
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T1', responseStatus: 'answered', responseText: 'x', technicalIssue: false, supports: [] })
    await httpsCallable(s.functions, 'submitDiagnosisAttempt')({ attemptId })

    const plan: Array<[string, string[]]> = [
      [IDS.milestone1, ['D1', 'E1']],
      [IDS.milestone2, ['D1']],
      [IDS.milestone3, ['E2', 'E3']],
      [IDS.milestone4, ['D3', 'D4']],
      [IDS.milestone5, ['D3', 'D5', 'E4']],
      [IDS.milestone6, ['D1', 'E5']],
    ]
    for (const [milestoneId, indicators] of plan) {
      const { deliveryId } = (await start({ milestoneId })).data
      await submit({ deliveryId, submitKey: `k-${milestoneId}`, format: 'text', description: 'entrega' })
      await confirmChecklist(t, deliveryId, milestoneId)
      await validate({
        deliveryId,
        assessments: indicators.map((code) => ({ enrollmentId: IDS.s4, indicatorCode: code, level: 'achieved' })),
      })
    }
    const xp = await adminDb.collection('xpEvents').where('enrollmentId', '==', IDS.s4).get()
    const total = xp.docs.reduce((sum, d) => sum + ((d.data().xpValue as number) ?? 0), 0)
    expect(xp.size).toBe(6)
    expect(total).toBe(160)
  })

  it('reintentar el mismo submitKey con otra reserva no deja hu�rfano ni error', async () => {
    const { s, deliveryId } = await freshDelivery(IDS.codeS4)
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string; reservationId: string }, { reused: boolean }>(s.functions, 'submitEvidence')

    const r1 = (await reserve({ deliveryId, fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 3 })).data
    await adminUpload(r1.path, Buffer.from('abc'), 'text/plain')
    const first = await submit({ deliveryId, submitKey: 'rk', format: 'file', description: 'a', reservationId: r1.reservationId })
    expect(first.data.reused).toBe(false)

    // El reintento crea una reserva redundante (simulada por el cliente): el servidor la limpia.
    const r2 = { reservationId: 'res-redundante', path: `courses/${IDS.courseX}/enrollments/${IDS.s4}/deliveries/${deliveryId}/uploads/res-redundante/b.txt` }
    await adminDb.doc(`uploadReservations/${r2.reservationId}`).set({
      courseId: IDS.courseX, enrollmentId: IDS.s4, deliveryId, ownerEnrollmentId: IDS.s4,
      fileName: 'b.txt', contentType: 'text/plain', sizeBytes: 3, storagePath: r2.path,
      state: 'reserved', createdBy: s.uid, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 60000),
    })
    await adminUpload(r2.path, Buffer.from('xyz'), 'text/plain')

    const second = await submit({ deliveryId, submitKey: 'rk', format: 'file', description: 'b', reservationId: r2.reservationId })
    expect(second.data.reused).toBe(true)
    expect((await adminDb.collection(`deliveries/${deliveryId}/evidence`).get()).size).toBe(1)
    expect((await adminDb.doc(`uploadReservations/${r2.reservationId}`).get()).data()?.state).toBe('consumed')
    const [exists] = await getStorage().bucket(`${PROJECT}.appspot.com`).file(r2.path).exists()
    expect(exists).toBe(false)
  })

  it('marca la limpieza solo tras confirmar y es idempotente', async () => {
    const { s, deliveryId } = await freshDelivery(IDS.codeS4)
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')

    // Reserva sin objeto (objeto inexistente ? fallo transitorio): se limpia igual.
    const rNoObj = (await reserve({ deliveryId, fileName: 'sin.txt', contentType: 'text/plain', sizeBytes: 3 })).data
    await adminDb.doc(`uploadReservations/${rNoObj.reservationId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })

    // Reserva con objeto: se borra y luego se confirma.
    const rObj = (await reserve({ deliveryId, fileName: 'con.txt', contentType: 'text/plain', sizeBytes: 3 })).data
    await adminUpload(rObj.path, Buffer.from('abc'), 'text/plain')
    await adminDb.doc(`uploadReservations/${rObj.reservationId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })

    const t = await teacherClient(IDS.t1)
    const cleanup = httpsCallable<{ courseId: string }, { removed: number; pending: number }>(t.functions, 'cleanupExpiredUploads')
    const first = await cleanup({ courseId: IDS.courseX })
    expect(first.data.removed).toBeGreaterThanOrEqual(2)
    expect((await adminDb.doc(`uploadReservations/${rNoObj.reservationId}`).get()).data()?.state).toBe('expired')
    expect((await adminDb.doc(`uploadReservations/${rObj.reservationId}`).get()).data()?.state).toBe('expired')
    const [exists] = await getStorage().bucket(`${PROJECT}.appspot.com`).file(rObj.path).exists()
    expect(exists).toBe(false)

    // Segunda ejecuci�n: nada nuevo que limpiar.
    const second = await cleanup({ courseId: IDS.courseX })
    expect(second.data.removed).toBe(0)
  })
})


describe('I2e � autorizaci�n, modalidades, contribuciones y contrato de M1', () => {
  async function fresh(code: string, milestoneId: string) {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code })
    const { deliveryId } = (
      await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId })
    ).data
    return { s, deliveryId }
  }

  it('rechaza entregas, claves y reservas ajenas antes de responder', async () => {
    const { s: s4, deliveryId } = await fresh(IDS.codeS4, IDS.milestone2)
    const submit4 = httpsCallable(s4.functions, 'submitEvidence')
    await submit4({ deliveryId, submitKey: 'own', format: 'text', description: 'x' })

    // Otro estudiante (S6) intenta la entrega/clave de S4: no hay recibo idempotente.
    const { s: s6, deliveryId: d6 } = await fresh(IDS.codeS6, IDS.milestone2)
    await expect(
      httpsCallable(s6.functions, 'submitEvidence')({ deliveryId, submitKey: 'own', format: 'text', description: 'y' }),
    ).rejects.toThrow()

    // Reserva ajena: S6 crea su reserva; S4 intenta usarla.
    const r6 = (
      await httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(
        s6.functions,
        'reserveUpload',
      )({ deliveryId: d6, fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 3 })
    ).data
    await adminUpload(r6.path, Buffer.from('abc'), 'text/plain')
    await expect(
      submit4({ deliveryId, submitKey: 'k4', format: 'file', description: 'x', reservationId: r6.reservationId }),
    ).rejects.toThrow()
    // La reserva ajena queda intacta (no se consume ni se borra).
    expect((await adminDb.doc(`uploadReservations/${r6.reservationId}`).get()).data()?.state).toBe('reserved')
  })

  it('aplica las modalidades del hito en el servidor', async () => {
    const { s, deliveryId } = await fresh(IDS.codeS4, IDS.milestone1) // M1: solo texto
    await expect(
      httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'f1', format: 'file', description: 'x' }),
    ).rejects.toThrow()
    await expect(
      httpsCallable(s.functions, 'reserveUpload')({ deliveryId, fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 3 }),
    ).rejects.toThrow()
  })

  it('M1 exige diagn�stico entregado o barrera t�cnica', async () => {
    const { s, deliveryId } = await fresh(IDS.codeS5, IDS.milestone1)
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'm1', format: 'text', description: 'pregunta' })
    const t = await teacherClient(IDS.t1)
    const validate = httpsCallable(t.functions, 'validateMilestone')
    const assessments = [
      { enrollmentId: IDS.s5, indicatorCode: 'D1', level: 'achieved' },
      { enrollmentId: IDS.s5, indicatorCode: 'E1', level: 'achieved' },
    ]
    // Sin diagn�stico ni barrera, no acredita.
    await expect(validate({ deliveryId, assessments })).rejects.toThrow()

    // Barrera t�cnica registrada (intento en borrador) habilita la acreditaci�n.
    await httpsCallable(s.functions, 'saveConditionsSurvey')({
      answers: { A1: [], A2: '', A3: '', A4: { option: '', other: '' }, A5: { created: '', verified: '', explained: '' }, A6: '' },
    })
    const { attemptId } = (
      await httpsCallable<{ kind: string }, { attemptId: string }>(s.functions, 'startDiagnosisAttempt')({ kind: 'pre' })
    ).data
    await httpsCallable(s.functions, 'saveDiagnosisResponse')({ attemptId, taskCode: 'T1', responseStatus: 'not_answered', responseText: '', technicalIssue: true, supports: [] })
    await validate({ deliveryId, assessments })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')
  })

  it('registra contribuciones individuales y rechaza a quien no pertenece al equipo', async () => {
    const deliveryId = `${IDS.s1}_${IDS.milestone2}`
    const s1 = await studentClient()
    await httpsCallable(s1.functions, 'redeemCode')({ code: IDS.codeS1 })
    await httpsCallable(s1.functions, 'registerContribution')({ deliveryId, description: 'Redact� la ficha.' })
    expect((await adminDb.doc(`deliveries/${deliveryId}/contributors/${IDS.s1}`).get()).data()?.origin).toBe('student')

    const s3 = await studentClient() // curso Y, no miembro del equipo
    await httpsCallable(s3.functions, 'redeemCode')({ code: IDS.codeS3 })
    await expect(
      httpsCallable(s3.functions, 'registerContribution')({ deliveryId, description: 'ajena' }),
    ).rejects.toThrow()
  })
})


describe('I2f � contratos cerrados: evidencia m�nima, aportes y limpieza', () => {
  async function fresh(code: string, milestoneId: string) {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code })
    const { deliveryId } = (
      await httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')({ milestoneId })
    ).data
    return { s, deliveryId }
  }

  it('exige confirmar la evidencia m�nima antes de validar M2 y se reinicia con una nueva versi�n', async () => {
    const { s, deliveryId } = await fresh(IDS.codeS4, IDS.milestone2)
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'v1', format: 'text', description: 'v1' })
    const t = await teacherClient(IDS.t1)
    const validate = httpsCallable(t.functions, 'validateMilestone')
    const assessments = [{ enrollmentId: IDS.s4, indicatorCode: 'D1', level: 'achieved' }]

    // Sin confirmar ? no valida.
    await expect(validate({ deliveryId, assessments })).rejects.toThrow()

    // Un estudiante no puede confirmar.
    await expect(httpsCallable(s.functions, 'confirmChecklistItem')({ deliveryId, itemIndex: 0 })).rejects.toThrow()

    // Confirmaci�n parcial ? sigue sin validar.
    await httpsCallable(t.functions, 'confirmChecklistItem')({ deliveryId, itemIndex: 0 })
    await expect(validate({ deliveryId, assessments })).rejects.toThrow()

    // Confirmaci�n completa ? valida; queda registro de qui�n y cu�ndo.
    await httpsCallable(t.functions, 'confirmChecklistItem')({ deliveryId, itemIndex: 1 })
    const confs = await adminDb.collection(`deliveries/${deliveryId}/checklistConfirmations`).get()
    expect(confs.size).toBe(2)
    expect(confs.docs[0].data().confirmedBy).toBe(IDS.t1)
    expect(confs.docs[0].data().evidenceId).toBe('v1')
    await validate({ deliveryId, assessments })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')

    // Nueva versi�n: las confirmaciones de la versi�n anterior no cuentan.
    await httpsCallable(t.functions, 'reopenMilestone')({ deliveryId, action: 'Ampl�a el contraste.' })
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'v2', format: 'text', description: 'v2' })
    await expect(validate({ deliveryId, assessments })).rejects.toThrow()
    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await validate({ deliveryId, assessments })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')
  })

  it('registerContribution comprueba curso, estado, versi�n y no altera un XP validado', async () => {
    const t = await teacherClient(IDS.t1)
    const deliveryId = `${IDS.s1}_${IDS.milestone2}`

    // Estudiante de otro curso no registra.
    const s3 = await studentClient()
    await httpsCallable(s3.functions, 'redeemCode')({ code: IDS.codeS3 })
    await expect(httpsCallable(s3.functions, 'registerContribution')({ deliveryId, description: 'ajena' })).rejects.toThrow()

    // Aporte vinculado a la versi�n vigente y con historial al cambiar.
    const s1 = await studentClient()
    await httpsCallable(s1.functions, 'redeemCode')({ code: IDS.codeS1 })
    await httpsCallable(s1.functions, 'registerContribution')({ deliveryId, description: 'Aporte 1' })
    expect((await adminDb.doc(`deliveries/${deliveryId}/contributors/${IDS.s1}`).get()).data()?.evidenceId).toBe('ev-team')
    await httpsCallable(s1.functions, 'registerContribution')({ deliveryId, description: 'Aporte 2' })
    const hist = await adminDb.collection('deliveryHistory').where('deliveryId', '==', deliveryId).where('kind', '==', 'contribution').get()
    expect(hist.size).toBe(1)
    expect(hist.docs[0].data().previous).toBe('Aporte 1')

    await httpsCallable(t.functions, 'registerContribution')({ deliveryId, enrollmentId: IDS.s2, description: 'Aporte de S2 (papel).' })
    await confirmChecklist(t, deliveryId, IDS.milestone2)
    await httpsCallable(t.functions, 'validateMilestone')({
      deliveryId,
      assessments: [
        { enrollmentId: IDS.s1, indicatorCode: 'D1', level: 'achieved' },
        { enrollmentId: IDS.s2, indicatorCode: 'D1', level: 'achieved' },
      ],
    })
    expect((await adminDb.doc(`deliveries/${deliveryId}`).get()).data()?.state).toBe('achieved')

    // Tras validar, no se altera el sustento del XP.
    await expect(httpsCallable(s1.functions, 'registerContribution')({ deliveryId, description: 'tard�o' })).rejects.toThrow()
  })

  it('la limpieza redundante no toca una reserva referenciada por otra evidencia', async () => {
    const { s, deliveryId } = await fresh(IDS.codeS4, IDS.milestone2)
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const r1 = (await reserve({ deliveryId, fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 3 })).data
    await adminUpload(r1.path, Buffer.from('abc'), 'text/plain')
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'rk', format: 'file', description: 'a', reservationId: r1.reservationId })

    // Reserva redundante creada por el cliente, referenciada por otra evidencia.
    const r2 = { reservationId: 'res-ref', path: `courses/${IDS.courseX}/enrollments/${IDS.s4}/deliveries/${deliveryId}/uploads/res-ref/b.txt` }
    await adminDb.doc(`uploadReservations/${r2.reservationId}`).set({
      courseId: IDS.courseX, enrollmentId: IDS.s4, deliveryId, ownerEnrollmentId: IDS.s4,
      fileName: 'b.txt', contentType: 'text/plain', sizeBytes: 3, storagePath: r2.path,
      state: 'reserved', createdBy: s.uid, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 60000),
    })
    await adminUpload(r2.path, Buffer.from('xyz'), 'text/plain')
    await adminDb.doc(`deliveries/${deliveryId}/evidence/other-ref`).set({
      version: 99, origin: 'student_digital', format: 'file', description: 'referencia', reservationId: r2.reservationId,
      createdBy: s.uid, createdAt: Timestamp.now(), deletedAt: null,
    })

    const reused = await httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string; reservationId: string }, { reused: boolean }>(s.functions, 'submitEvidence')({
      deliveryId, submitKey: 'rk', format: 'file', description: 'b', reservationId: r2.reservationId,
    })
    expect(reused.data.reused).toBe(true)
    // No se consume ni se borra: la reserva est� referenciada por otra evidencia.
    expect((await adminDb.doc(`uploadReservations/${r2.reservationId}`).get()).data()?.state).toBe('reserved')
    const [exists] = await getStorage().bucket(`${PROJECT}.appspot.com`).file(r2.path).exists()
    expect(exists).toBe(true)
  })

  it('dos reintentos concurrentes con la misma clave limpian la reserva redundante una sola vez', async () => {
    const { s, deliveryId } = await fresh(IDS.codeS4, IDS.milestone2)
    const reserve = httpsCallable<{ deliveryId: string; fileName: string; contentType: string; sizeBytes: number }, { reservationId: string; path: string }>(s.functions, 'reserveUpload')
    const r1 = (await reserve({ deliveryId, fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 3 })).data
    await adminUpload(r1.path, Buffer.from('abc'), 'text/plain')
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'rk', format: 'file', description: 'a', reservationId: r1.reservationId })

    const r2 = { reservationId: 'res-conc', path: `courses/${IDS.courseX}/enrollments/${IDS.s4}/deliveries/${deliveryId}/uploads/res-conc/c.txt` }
    await adminDb.doc(`uploadReservations/${r2.reservationId}`).set({
      courseId: IDS.courseX, enrollmentId: IDS.s4, deliveryId, ownerEnrollmentId: IDS.s4,
      fileName: 'c.txt', contentType: 'text/plain', sizeBytes: 3, storagePath: r2.path,
      state: 'reserved', createdBy: s.uid, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 60000),
    })
    await adminUpload(r2.path, Buffer.from('qqq'), 'text/plain')

    const submit = httpsCallable(s.functions, 'submitEvidence')
    const results = await Promise.allSettled([
      submit({ deliveryId, submitKey: 'rk', format: 'file', description: 'b', reservationId: r2.reservationId }),
      submit({ deliveryId, submitKey: 'rk', format: 'file', description: 'b', reservationId: r2.reservationId }),
    ])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect((await adminDb.collection(`deliveries/${deliveryId}/evidence`).get()).size).toBe(1)
    expect((await adminDb.doc(`uploadReservations/${r2.reservationId}`).get()).data()?.state).toBe('consumed')
    const [exists] = await getStorage().bucket(`${PROJECT}.appspot.com`).file(r2.path).exists()
    expect(exists).toBe(false)
  })
})
