import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import { AUTH_S1, AUTH_S3, CODE_S1, CODE_S3, DELIVERY_S1, S1, S2, T1_AUTH, T2_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
let db: PGlite

const COURSE_X = '10000000-0000-0000-0000-000000000001'
const COURSE_Y = '10000000-0000-0000-0000-000000000002'

const VALID = `course/${COURSE_X}/enrollment/${S1}/delivery/${DELIVERY_S1}/guia.txt`
const WRONG_COURSE = `course/${COURSE_Y}/enrollment/${S1}/delivery/${DELIVERY_S1}/guia.txt`
const WRONG_ENROLLMENT = `course/${COURSE_X}/enrollment/${S2}/delivery/${DELIVERY_S1}/guia.txt`

beforeAll(async () => {
  db = await createTestDb()
  // Objetos creados por el proceso servidor (superusuario): bypassa RLS.
  await db.exec(`insert into storage.objects (bucket_id, name) values
    ('evidence', '${VALID}'),
    ('evidence', '${WRONG_COURSE}'),
    ('evidence', '${WRONG_ENROLLMENT}')`)

  await asUser(db, AUTH_S1, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S1, 'st-s1']))
  await asUser(db, AUTH_S3, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S3, 'st-s3']))
})

afterAll(async () => {
  writeMatrix('matriz-storage', matrix)
  if (db) await db.close()
})

describe('Autorización de Storage amarrada a filas reales', () => {
  it('el estudiante ve solo el objeto de su propia entrega y curso', async () => {
    const rows = await asUser(db, AUTH_S1, () => q<{ name: string }>(db, "select name from storage.objects where bucket_id='evidence'"))
    expect(rows.map((r) => r.name)).toEqual([VALID])
    matrix.push({ caso: 'S1 lee objeto propio', actor: 'Zorro-01', accion: 'select storage.objects', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('no ve el objeto cuya ruta declara otro curso', async () => {
    const rows = await asUser(db, AUTH_S1, () => q<{ name: string }>(db, 'select name from storage.objects'))
    expect(rows.map((r) => r.name)).not.toContain(WRONG_COURSE)
    matrix.push({ caso: 'ruta con curso ajeno', actor: 'Zorro-01', accion: 'select objeto (curso Y)', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el estudiante de otro curso no ve objetos del curso X', async () => {
    const rows = await asUser(db, AUTH_S3, () => q(db, 'select name from storage.objects'))
    expect(rows.length).toBe(0)
    matrix.push({ caso: 'S3 no ve objetos de X', actor: 'Condor-03', accion: 'select storage.objects', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el docente del curso ve el objeto; el de otro curso no', async () => {
    const t1 = await asUser(db, T1_AUTH, () => q<{ name: string }>(db, 'select name from storage.objects'))
    expect(t1.map((r) => r.name)).toEqual([VALID])
    const t2 = await asUser(db, T2_AUTH, () => q(db, 'select name from storage.objects'))
    expect(t2.length).toBe(0)
    matrix.push({ caso: 'T1 lee objeto de su curso', actor: 'Docente Uno', accion: 'select storage.objects', esperado: 'permitido', obtenido: 'permitido' })
    matrix.push({ caso: 'T2 no lee objeto ajeno', actor: 'Docente Dos', accion: 'select storage.objects', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el estudiante puede insertar en su propia ruta', async () => {
    const own = `course/${COURSE_X}/enrollment/${S1}/delivery/${DELIVERY_S1}/nuevo.txt`
    await asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [own]))
    matrix.push({ caso: 'insert en ruta propia', actor: 'Zorro-01', accion: 'insert storage.objects', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('no puede insertar en una ruta que aparenta otro curso', async () => {
    const r = await denied(() =>
      asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [WRONG_COURSE])),
    )
    expect(r.denied).toBe(true)
    matrix.push({ caso: 'insert en ruta de otro curso', actor: 'Zorro-01', accion: 'insert storage.objects (curso Y)', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })

  it('no puede insertar a nombre de otra matrícula', async () => {
    const r = await denied(() =>
      asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [WRONG_ENROLLMENT])),
    )
    expect(r.denied).toBe(true)
    matrix.push({ caso: 'insert con matrícula ajena', actor: 'Zorro-01', accion: 'insert storage.objects (enrollment S2)', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })
})
