import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import { AUTH_S1, E2_IND, E3_IND, M3, S1, T1_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
const KEY1 = '11111111-1111-1111-1111-111111111111'
const KEY2 = '22222222-2222-2222-2222-222222222222'
const KEY3 = '33333333-3333-3333-3333-333333333333'

let db: PGlite
let deliveryId: string

async function versionCount(): Promise<number> {
  const rows = await asUser(db, AUTH_S1, () => q(db, 'select id from public.evidence_version where delivery_id=$1', [deliveryId]))
  return rows.length
}

beforeAll(async () => {
  db = await createTestDb()
  await asUser(db, AUTH_S1, () => q(db, 'select * from public.redeem_code($1,$2)', ['ZORRO-01', 'idem']))
  const d = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.start_delivery($1) as id', [M3]))
  deliveryId = d[0].id
})

afterAll(async () => {
  writeMatrix('matriz-idempotencia', matrix)
  if (db) await db.close()
})

describe('Idempotencia de entrega', () => {
  it('reenviar con la misma clave devuelve el mismo recibo y no duplica versión', async () => {
    const a = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.submit_evidence($1,$2,$3,$4) as id', [deliveryId, KEY1, 'text', 'primera']))
    const b = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.submit_evidence($1,$2,$3,$4) as id', [deliveryId, KEY1, 'text', 'primera']))
    expect(a[0].id).toBe(b[0].id)
    expect(await versionCount()).toBe(1)
    matrix.push({ caso: 'reenvío con misma clave', actor: 'Zorro-01', accion: 'submit_evidence x2 (misma clave)', esperado: 'permitido', obtenido: 'permitido', detalle: 'una sola versión' })
  })

  it('una clave distinta mientras «por revisar» es denegada', async () => {
    const r = await denied(() => asUser(db, AUTH_S1, () => q(db, 'select public.submit_evidence($1,$2,$3,$4) as id', [deliveryId, KEY2, 'text', 'segunda'])))
    expect(r.denied).toBe(true)
    matrix.push({ caso: 'envío con clave nueva en pending_review', actor: 'Zorro-01', accion: 'submit_evidence (clave nueva)', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })

  it('tras pedir ajuste, una clave distinta crea una versión nueva', async () => {
    await asUser(db, T1_AUTH, () => q(db, 'select public.reopen_milestone($1)', [deliveryId]))
    await asUser(db, AUTH_S1, () => q(db, 'select public.submit_evidence($1,$2,$3,$4) as id', [deliveryId, KEY2, 'text', 'segunda']))
    expect(await versionCount()).toBe(2)
    matrix.push({ caso: 'reintento tras ajuste', actor: 'Zorro-01', accion: 'reopen + submit_evidence (clave nueva)', esperado: 'permitido', obtenido: 'permitido', detalle: 'nueva versión' })
  })
})

describe('Idempotencia y reinstauración de XP', () => {
  it('validar dos veces deja un solo evento de XP', async () => {
    const payload = JSON.stringify([
      { indicator_id: E2_IND, level: 'developing', comment: 'ok' },
      { indicator_id: E3_IND, level: 'achieved', comment: 'ok' },
    ])
    await asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [deliveryId, payload, 'cierre']))
    const first = await asUser(db, T1_AUTH, () => q<{ id: string; xp_value: number }>(db, 'select id, xp_value from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S1, M3]))
    expect(first.length).toBe(1)
    await asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [deliveryId, payload, 'cierre']))
    const second = await asUser(db, T1_AUTH, () => q(db, 'select id from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S1, M3]))
    expect(second.length).toBe(1)
    expect(second[0].id).toBe(first[0].id)
    matrix.push({ caso: 'validar dos veces', actor: 'Docente Uno', accion: 'validate_milestone x2', esperado: 'permitido', obtenido: 'permitido', detalle: 'un solo xp_event' })
  })

  it('revocar y reinstaurar usa la misma fila', async () => {
    const ev = await asUser(db, T1_AUTH, () => q<{ id: string }>(db, 'select id from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S1, M3]))
    await asUser(db, T1_AUTH, () => q(db, 'select public.revoke_xp($1,$2)', [ev[0].id, 'corrección']))
    const revoked = await asUser(db, T1_AUTH, () => q<{ revoked_at: string | null }>(db, 'select revoked_at from public.xp_event where id=$1', [ev[0].id]))
    expect(revoked[0].revoked_at).not.toBeNull()

    const payload = JSON.stringify([{ indicator_id: E2_IND, level: 'developing', comment: 'ok' }])
    await asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [deliveryId, payload, 'reinstaurar']))
    const reinstated = await asUser(db, T1_AUTH, () => q<{ id: string; revoked_at: string | null }>(db, 'select id, revoked_at from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S1, M3]))
    expect(reinstated.length).toBe(1)
    expect(reinstated[0].id).toBe(ev[0].id)
    expect(reinstated[0].revoked_at).toBeNull()
    matrix.push({ caso: 'reinstaurar XP revocado', actor: 'Docente Uno', accion: 'revoke_xp + validate_milestone', esperado: 'permitido', obtenido: 'permitido', detalle: 'misma fila' })
  })

  it('la restricción única impide un segundo evento', async () => {
    let failed = false
    try {
      await db.exec(`insert into public.xp_event (student_enrollment_id, milestone_id, program_version_id, xp_value)
        values ('${S1}', '${M3}', '00000000-0000-0000-0000-000000000010', 20)`)
    } catch {
      failed = true
    }
    expect(failed).toBe(true)
    matrix.push({ caso: 'segundo xp_event', actor: 'sistema', accion: 'insert directo duplicado', esperado: 'denegado', obtenido: 'denegado', detalle: 'viola UNIQUE' })
  })
})

describe('Idempotencia bajo llamadas repetidas (entorno de una sola conexión)', () => {
  it('dos envíos con la misma clave nueva no duplican', async () => {
    await asUser(db, T1_AUTH, () => q(db, 'select public.reopen_milestone($1)', [deliveryId]))
    const before = await versionCount()
    const r1 = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.submit_evidence($1,$2,$3,$4) as id', [deliveryId, KEY3, 'text', 'tercera']))
    const r2 = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.submit_evidence($1,$2,$3,$4) as id', [deliveryId, KEY3, 'text', 'tercera']))
    expect(r1[0].id).toBe(r2[0].id)
    expect(await versionCount()).toBe(before + 1)
    matrix.push({ caso: 'dos envíos misma clave nueva', actor: 'Zorro-01', accion: 'submit_evidence x2', esperado: 'permitido', obtenido: 'permitido', detalle: 'sin duplicar (una sola conexión)' })
  })
})
