import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import { AUTH_S1, AUTH_S2, AUTH_S3, CODE_S1, CODE_S2, CODE_S3, D1_IND, DELIVERY_TEAM, E1_IND, S1, S2, S3, T1_AUTH, T2_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
  await asUser(db, AUTH_S1, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S1, 'tm-s1']))
  await asUser(db, AUTH_S2, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S2, 'tm-s2']))
  await asUser(db, AUTH_S3, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S3, 'tm-s3']))
})

afterAll(async () => {
  writeMatrix('matriz-equipo', matrix)
  if (db) await db.close()
})

describe('Propiedad de entregas de equipo', () => {
  it('el propietario y los coautores acceden; un tercero no', async () => {
    const s1 = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select id from public.delivery where id=$1', [DELIVERY_TEAM]))
    const s2 = await asUser(db, AUTH_S2, () => q<{ id: string }>(db, 'select id from public.delivery where id=$1', [DELIVERY_TEAM]))
    const s3 = await asUser(db, AUTH_S3, () => q<{ id: string }>(db, 'select id from public.delivery where id=$1', [DELIVERY_TEAM]))
    expect(s1.length).toBe(1)
    expect(s2.length).toBe(1)
    expect(s3.length).toBe(0)
    matrix.push({ caso: 'propietario accede', actor: 'Zorro-01', accion: 'select entrega de equipo', esperado: 'permitido', obtenido: 'permitido' })
    matrix.push({ caso: 'coautor accede', actor: 'Puma-02', accion: 'select entrega de equipo', esperado: 'permitido', obtenido: 'permitido' })
    matrix.push({ caso: 'tercero no accede', actor: 'Condor-03', accion: 'select entrega de equipo', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el docente del curso accede; el de otro curso no', async () => {
    const t1 = await asUser(db, T1_AUTH, () => q(db, 'select id from public.delivery where id=$1', [DELIVERY_TEAM]))
    const t2 = await asUser(db, T2_AUTH, () => q(db, 'select id from public.delivery where id=$1', [DELIVERY_TEAM]))
    expect(t1.length).toBe(1)
    expect(t2.length).toBe(0)
  })

  it('valida por integrante sin duplicar XP', async () => {
    const payload = JSON.stringify([
      { enrollment_id: S1, indicator_id: D1_IND, level: 'developing', comment: 'bien' },
      { enrollment_id: S2, indicator_id: E1_IND, level: 'achieved', comment: 'bien' },
    ])
    await asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_TEAM, payload, 'equipo']))
    const xpS1 = await asUser(db, T1_AUTH, () => q(db, 'select id from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S1, '60000000-0000-0000-0000-000000000002']))
    const xpS2 = await asUser(db, T1_AUTH, () => q(db, 'select id from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S2, '60000000-0000-0000-0000-000000000002']))
    expect(xpS1.length).toBe(1)
    expect(xpS2.length).toBe(1)
    matrix.push({ caso: 'validación por integrante', actor: 'Docente Uno', accion: 'validate_milestone (S1 y S2)', esperado: 'permitido', obtenido: 'permitido', detalle: 'un xp_event por integrante' })
  })

  it('cada integrante ve solo su propia valoración', async () => {
    const s1 = await asUser(db, AUTH_S1, () => q<{ indicator_id: string }>(db, 'select indicator_id from public.assessment'))
    const s2 = await asUser(db, AUTH_S2, () => q<{ indicator_id: string }>(db, 'select indicator_id from public.assessment'))
    const t1 = await asUser(db, T1_AUTH, () => q(db, 'select indicator_id from public.assessment'))
    expect(s1.map((r) => r.indicator_id)).toEqual([D1_IND])
    expect(s2.map((r) => r.indicator_id)).toEqual([E1_IND])
    expect(t1.length).toBe(2)
    matrix.push({ caso: 'S1 no ve valoración de S2', actor: 'Zorro-01', accion: 'select assessment', esperado: 'denegado', obtenido: 'denegado' })
    matrix.push({ caso: 'T1 ve ambas valoraciones', actor: 'Docente Uno', accion: 'select assessment', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('no se puede validar a una matrícula que no pertenece a la entrega', async () => {
    const payload = JSON.stringify([{ enrollment_id: S3, indicator_id: D1_IND, level: 'achieved' }])
    const r = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_TEAM, payload, 'x'])))
    expect(r.denied).toBe(true)
    matrix.push({ caso: 'validar a no-miembro', actor: 'Docente Uno', accion: 'validate_milestone (S3)', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })
})
