import { beforeEach, describe, expect, it } from 'vitest'
import { httpsCallable } from 'firebase/functions'
import { IDS, adminDb, seedSynthetic, studentClient, teacherClient } from './helpers'

beforeEach(async () => {
  await seedSynthetic()
})

describe('Concurrencia · reintentos simultáneos', () => {
  it('dos envíos concurrentes con la misma clave crean una sola versión', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string }, { evidenceId: string }>(s.functions, 'submitEvidence')

    const [a, b] = await Promise.all([
      submit({ deliveryId, submitKey: 'c1', format: 'text', description: 'x' }),
      submit({ deliveryId, submitKey: 'c1', format: 'text', description: 'x' }),
    ])
    expect(a.data.evidenceId).toBe(b.data.evidenceId)
    const evs = await adminDb.collection(`deliveries/${deliveryId}/evidence`).get()
    expect(evs.size).toBe(1)
  })

  it('dos validaciones concurrentes producen un solo evento de XP', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone2 })).data
    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId, submitKey: 'c2', format: 'text', description: 'x' })

    const t = await teacherClient(IDS.t1)
    const validate = httpsCallable(t.functions, 'validateMilestone')
    const payload = { deliveryId, assessments: [{ indicatorCode: 'D1', level: 'achieved' }], comment: 'x' }

    const results = await Promise.allSettled([validate(payload), validate(payload)])
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length
    expect(fulfilled).toBe(1)

    const xp = await adminDb.collection('xpEvents').where('enrollmentId', '==', IDS.s2).where('milestoneId', '==', IDS.milestone2).get()
    expect(xp.size).toBe(1)
  })

  it('varias cuentas anónimas no se bloquean entre sí (cupo por auth.uid)', async () => {
    const clients = await Promise.all(Array.from({ length: 12 }, () => studentClient()))
    const results = await Promise.allSettled(
      clients.map((c, i) => httpsCallable<{ code: string }, { status: string }>(c.functions, 'redeemCode')({ code: `NO-${i}` })),
    )
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.data.status : 'rejected'))
    // Cada cuenta tiene su propio cupo; un intento por cuenta no agota el límite.
    expect(statuses.includes('rate_limited')).toBe(false)
  })

  it('el límite por auth.uid no se evade con códigos distintos', async () => {
    const s = await studentClient()
    const statuses: string[] = []
    for (let i = 0; i < 12; i++) {
      try {
        const r = await httpsCallable<{ code: string }, { status: string }>(s.functions, 'redeemCode')({ code: `X-${i}` })
        statuses.push(r.data.status)
      } catch {
        statuses.push('rejected')
      }
    }
    expect(statuses.filter((x) => x === 'rate_limited').length).toBeGreaterThan(0)
  })

  it('dos envíos concurrentes con claves distintas crean una sola versión', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const { deliveryId } = (await start({ milestoneId: IDS.milestone1 })).data
    const submit = httpsCallable<{ deliveryId: string; submitKey: string; format: string; description: string }, { evidenceId: string }>(s.functions, 'submitEvidence')

    const results = await Promise.allSettled([
      submit({ deliveryId, submitKey: 'd1', format: 'text', description: 'a' }),
      submit({ deliveryId, submitKey: 'd2', format: 'text', description: 'b' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1)
    const evs = await adminDb.collection(`deliveries/${deliveryId}/evidence`).get()
    expect(evs.size).toBe(1)
  })

  it('startDelivery concurrente no reinicia la entrega', async () => {
    const s = await studentClient()
    await httpsCallable(s.functions, 'redeemCode')({ code: IDS.codeS2 })
    const start = httpsCallable<{ milestoneId: string }, { deliveryId: string }>(s.functions, 'startDelivery')
    const [a, b] = await Promise.all([start({ milestoneId: IDS.milestone1 }), start({ milestoneId: IDS.milestone1 })])
    expect(a.data.deliveryId).toBe(b.data.deliveryId)
    expect((await adminDb.doc(`deliveries/${a.data.deliveryId}`).get()).data()?.state).toBe('not_started')

    await httpsCallable(s.functions, 'submitEvidence')({ deliveryId: a.data.deliveryId, submitKey: 'sd1', format: 'text', description: 'x' })
    await start({ milestoneId: IDS.milestone1 })
    expect((await adminDb.doc(`deliveries/${a.data.deliveryId}`).get()).data()?.state).toBe('pending_review')
  })
})
