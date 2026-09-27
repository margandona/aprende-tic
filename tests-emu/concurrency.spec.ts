import { beforeAll, describe, expect, it } from 'vitest'
import { httpsCallable } from 'firebase/functions'
import { IDS, adminDb, seedSynthetic, studentClient, teacherClient } from './helpers'

beforeAll(async () => {
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
})
