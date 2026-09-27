import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import { AUTH_S1, AUTH_S2, AUTH_S3, CODE_S1, CODE_S2, CODE_S3, DELIVERY_S1, DELIVERY_S3, DELIVERY_TEAM, S1, T1_AUTH, T2_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
function record(row: MatrixRow) {
  matrix.push(row)
}

let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
  await asUser(db, AUTH_S1, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S1, 'setup-s1']))
  await asUser(db, AUTH_S2, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S2, 'setup-s2']))
  await asUser(db, AUTH_S3, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S3, 'setup-s3']))
})

afterAll(async () => {
  writeMatrix('matriz-permisos', matrix)
  if (db) await db.close()
})

describe('Aislamiento entre cursos y estudiantes', () => {
  it('Zorro-01 (curso X) solo ve sus entregas', async () => {
    const rows = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select id from public.delivery order by id'))
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(DELIVERY_S1)
    expect(ids).toContain(DELIVERY_TEAM)
    expect(ids).not.toContain(DELIVERY_S3)
    record({ caso: 'S1 ve sus entregas', actor: 'Zorro-01', accion: 'select delivery', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('Puma-02 (mismo curso) no ve la entrega individual de Zorro-01', async () => {
    const rows = await asUser(db, AUTH_S2, () => q<{ id: string }>(db, 'select id from public.delivery order by id'))
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual([DELIVERY_TEAM])
    expect(ids).not.toContain(DELIVERY_S1)
    record({ caso: 'S2 no ve entrega individual de S1', actor: 'Puma-02', accion: 'select delivery', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('Condor-03 (curso Y) no ve entregas del curso X', async () => {
    const rows = await asUser(db, AUTH_S3, () => q<{ id: string }>(db, 'select id from public.delivery order by id'))
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual([DELIVERY_S3])
    record({ caso: 'S3 no ve entregas de otro curso', actor: 'Condor-03', accion: 'select delivery', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('Docente Uno (curso X) ve X y no Y', async () => {
    const rows = await asUser(db, T1_AUTH, () => q<{ id: string }>(db, 'select id from public.delivery order by id'))
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual([DELIVERY_S1, DELIVERY_TEAM])
    expect(ids).not.toContain(DELIVERY_S3)
    record({ caso: 'T1 ve entregas de su curso', actor: 'Docente Uno', accion: 'select delivery', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('Docente Dos (curso Y) no ve entregas del curso X', async () => {
    const rows = await asUser(db, T2_AUTH, () => q<{ id: string }>(db, 'select id from public.delivery order by id'))
    const ids = rows.map((r) => r.id)
    expect(ids).toEqual([DELIVERY_S3])
    record({ caso: 'T2 no ve entregas de otro curso', actor: 'Docente Dos', accion: 'select delivery', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('S1 no ve evidencia ni XP de S3', async () => {
    const ev = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select id from public.evidence_version order by id'))
    expect(ev.map((r) => r.id)).not.toContain('e0000000-0000-0000-0000-000000000002')
    const xp = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select id from public.xp_event'))
    expect(xp.length).toBe(0)
    record({ caso: 'S1 no ve evidencia/XP ajenos', actor: 'Zorro-01', accion: 'select evidence/xp', esperado: 'denegado', obtenido: 'denegado' })
  })
})

describe('Escritura directa denegada al estudiante', () => {
  it('no puede insertar una entrega', async () => {
    const r = await denied(() =>
      asUser(db, AUTH_S1, () => q(db, "insert into public.delivery (owner_enrollment_id, milestone_id) values ($1,$2)", [DELIVERY_S1, '60000000-0000-0000-0000-000000000001'])),
    )
    expect(r.denied).toBe(true)
    record({ caso: 'insert directo en delivery', actor: 'Zorro-01', accion: 'insert delivery', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })

  it('no puede cambiar el estado de su entrega', async () => {
    const r = await denied(() =>
      asUser(db, AUTH_S1, () => q(db, "update public.delivery set state='achieved' where id=$1", [DELIVERY_S1])),
    )
    expect(r.denied).toBe(true)
    record({ caso: 'update directo de state', actor: 'Zorro-01', accion: "update delivery.state='achieved'", esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })

  it('no puede insertar una valoración', async () => {
    const r = await denied(() =>
      asUser(db, AUTH_S1, () => q(db, "insert into public.assessment (student_enrollment_id, indicator_id, milestone_id, level) values ($1,$2,$3,'achieved')", [S1, '40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'])),
    )
    expect(r.denied).toBe(true)
    record({ caso: 'insert directo en assessment', actor: 'Zorro-01', accion: 'insert assessment', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })
})

describe('Encuesta de condiciones (sensible)', () => {
  it('el estudiante puede registrar la suya pero no leerla', async () => {
    await asUser(db, AUTH_S1, () =>
      q(db, 'insert into public.conditions_survey (student_enrollment_id, answers_json) values ($1, $2)', [S1, JSON.stringify({ A1: 'telefono propio' })]),
    )
    const own = await asUser(db, AUTH_S1, () => q(db, 'select id from public.conditions_survey'))
    expect(own.length).toBe(0)
    record({ caso: 'S1 lee su encuesta', actor: 'Zorro-01', accion: 'select conditions_survey', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('solo el docente del curso la lee', async () => {
    const t1 = await asUser(db, T1_AUTH, () => q(db, 'select id from public.conditions_survey'))
    expect(t1.length).toBe(1)
    const t2 = await asUser(db, T2_AUTH, () => q(db, 'select id from public.conditions_survey'))
    expect(t2.length).toBe(0)
    record({ caso: 'T1 lee encuesta de su curso', actor: 'Docente Uno', accion: 'select conditions_survey', esperado: 'permitido', obtenido: 'permitido' })
    record({ caso: 'T2 no lee encuesta ajena', actor: 'Docente Dos', accion: 'select conditions_survey', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el estudiante no puede registrar una encuesta a nombre de otro', async () => {
    const r = await denied(() =>
      asUser(db, AUTH_S1, () => q(db, 'insert into public.conditions_survey (student_enrollment_id, answers_json) values ($1, $2)', ['30000000-0000-0000-0000-000000000002', '{}'])),
    )
    expect(r.denied).toBe(true)
    record({ caso: 'S1 inserta encuesta de S2', actor: 'Zorro-01', accion: 'insert conditions_survey (ajena)', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })
})
