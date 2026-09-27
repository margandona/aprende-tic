import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import { AUTH_S1, AUTH_S3, CODE_S1, CODE_S3, COURSE_X, COURSE_Y, M4, S1, S2, T1_AUTH, T2_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
let db: PGlite
let reserved = ''
let wrongCourse = ''
let wrongEnrollment = ''

beforeAll(async () => {
  db = await createTestDb()
  await asUser(db, AUTH_S1, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S1, 'st-s1']))
  await asUser(db, AUTH_S3, () => q(db, 'select * from public.redeem_code($1,$2)', [CODE_S3, 'st-s3']))

  const d = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.start_delivery($1) as id', [M4]))
  const delivery = d[0].id

  const p = await asUser(db, AUTH_S1, () => q<{ reserve_evidence_upload: string }>(db, 'select public.reserve_evidence_upload($1,$2,$3,$4) as reserve_evidence_upload', [delivery, 'guia.pdf', 'application/pdf', 2048]))
  reserved = p[0].reserve_evidence_upload
  wrongCourse = reserved.replace(`course/${COURSE_X}/`, `course/${COURSE_Y}/`)
  wrongEnrollment = reserved.replace(`enrollment/${S1}/`, `enrollment/${S2}/`)

  // Objetos creados por el proceso servidor (superusuario): bypassa RLS.
  await db.exec(`insert into storage.objects (bucket_id, name) values
    ('evidence', '${reserved}'),
    ('evidence', '${wrongCourse}'),
    ('evidence', '${wrongEnrollment}')`)
})

afterAll(async () => {
  writeMatrix('matriz-storage', matrix)
  if (db) await db.close()
})

describe('Autorización de Storage amarrada a reserva y entrega reales', () => {
  it('el estudiante ve solo el objeto de su propia reserva', async () => {
    const rows = await asUser(db, AUTH_S1, () => q<{ name: string }>(db, "select name from storage.objects where bucket_id='evidence'"))
    expect(rows.map((r) => r.name)).toEqual([reserved])
    matrix.push({ caso: 'S1 lee objeto reservado propio', actor: 'Zorro-01', accion: 'select storage.objects', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('no ve rutas con otro curso ni con otra matrícula', async () => {
    const rows = await asUser(db, AUTH_S1, () => q<{ name: string }>(db, 'select name from storage.objects'))
    const names = rows.map((r) => r.name)
    expect(names).not.toContain(wrongCourse)
    expect(names).not.toContain(wrongEnrollment)
    matrix.push({ caso: 'ruta con curso ajeno', actor: 'Zorro-01', accion: 'select objeto (curso Y)', esperado: 'denegado', obtenido: 'denegado' })
    matrix.push({ caso: 'ruta con matrícula ajena', actor: 'Zorro-01', accion: 'select objeto (enrollment S2)', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el estudiante de otro curso no ve objetos del curso X', async () => {
    const rows = await asUser(db, AUTH_S3, () => q(db, 'select name from storage.objects'))
    expect(rows.length).toBe(0)
    matrix.push({ caso: 'S3 no ve objetos de X', actor: 'Condor-03', accion: 'select storage.objects', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el docente del curso ve el objeto; el de otro curso no', async () => {
    const t1 = await asUser(db, T1_AUTH, () => q<{ name: string }>(db, 'select name from storage.objects'))
    expect(t1.map((r) => r.name)).toEqual([reserved])
    const t2 = await asUser(db, T2_AUTH, () => q(db, 'select name from storage.objects'))
    expect(t2.length).toBe(0)
    matrix.push({ caso: 'T1 lee objeto de su curso', actor: 'Docente Uno', accion: 'select storage.objects', esperado: 'permitido', obtenido: 'permitido' })
    matrix.push({ caso: 'T2 no lee objeto ajeno', actor: 'Docente Dos', accion: 'select storage.objects', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el estudiante puede insertar en una ruta recién reservada', async () => {
    const d = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.start_delivery($1) as id', [M4]))
    const p = await asUser(db, AUTH_S1, () => q<{ reserve_evidence_upload: string }>(db, 'select public.reserve_evidence_upload($1,$2,$3,$4) as reserve_evidence_upload', [d[0].id, 'otro.txt', 'text/plain', 100]))
    await asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [p[0].reserve_evidence_upload]))
    matrix.push({ caso: 'insert en ruta reservada', actor: 'Zorro-01', accion: 'insert storage.objects', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('no puede insertar en ruta de otro curso ni de otra matrícula', async () => {
    const a = await denied(() => asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [wrongCourse])))
    expect(a.denied).toBe(true)
    const b = await denied(() => asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [wrongEnrollment])))
    expect(b.denied).toBe(true)
    matrix.push({ caso: 'insert en ruta de otro curso', actor: 'Zorro-01', accion: 'insert storage.objects (curso Y)', esperado: 'denegado', obtenido: 'denegado', detalle: a.reason })
    matrix.push({ caso: 'insert con matrícula ajena', actor: 'Zorro-01', accion: 'insert storage.objects (enrollment S2)', esperado: 'denegado', obtenido: 'denegado', detalle: b.reason })
  })
})
