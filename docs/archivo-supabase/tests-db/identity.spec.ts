import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import { AUTH_OTHER, AUTH_S1, CODE_S1, CODE_S2, S1, T1_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
let db: PGlite

interface RedeemRow {
  status: string
  pseudonym: string | null
  expires_at: string | null
}

function redeem(uid: string | null, code: string, key: string) {
  return asUser(db, uid, () => q<RedeemRow>(db, 'select * from public.redeem_code($1,$2)', [code, key]))
}

beforeEach(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  writeMatrix('matriz-identidad', matrix)
  if (db) await db.close()
})

describe('Canje de código individual', () => {
  it('un código válido crea un binding activo', async () => {
    const rows = await redeem(AUTH_S1, CODE_S1, 'c1')
    expect(rows[0].status).toBe('ok')
    expect(rows[0].pseudonym).toBe('Zorro-01')
    const enr = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.current_enrollment_id() as id'))
    expect(enr[0].id).toBe(S1)
    matrix.push({ caso: 'canje válido', actor: 'Zorro-01', accion: "redeem_code('ZORRO-01')", esperado: 'permitido', obtenido: 'permitido' })
  })

  it('un código inválido es denegado y queda registrado', async () => {
    const rows = await redeem(AUTH_S1, 'NO-EXISTE', 'c2')
    expect(rows[0].status).toBe('invalid')
    const attempts = await q(db, "select count(*)::int as n from public.redeem_attempt where client_key='c2'")
    expect((attempts[0] as { n: number }).n).toBe(1)
    matrix.push({ caso: 'canje inválido', actor: 'Zorro-01', accion: "redeem_code('NO-EXISTE')", esperado: 'denegado', obtenido: 'denegado', detalle: 'status=invalid, intento registrado' })
  })
})

describe('Revocación de sesión vs revocación de código', () => {
  it('revocar la sesión invalida el acceso de inmediato', async () => {
    await redeem(AUTH_S1, CODE_S1, 'c3')
    await asUser(db, T1_AUTH, () => q(db, 'select public.revoke_session($1,$2)', [S1, 'prueba']))
    const enr = await asUser(db, AUTH_S1, () => q<{ id: string | null }>(db, 'select public.current_enrollment_id() as id'))
    expect(enr[0].id).toBeNull()
    const d = await asUser(db, AUTH_S1, () => q(db, 'select id from public.delivery'))
    expect(d.length).toBe(0)
    matrix.push({ caso: 'revocar binding', actor: 'Docente Uno', accion: 'revoke_session', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('regenerar el código invalida el anterior y habilita el nuevo', async () => {
    await redeem(AUTH_S1, CODE_S1, 'c4')
    const nuevo = await asUser(db, T1_AUTH, () => q<{ regenerate_code: string }>(db, 'select public.regenerate_code($1) as regenerate_code', [S1]))
    const viejo = await redeem(AUTH_S1, CODE_S1, 'c5')
    expect(viejo[0].status).toBe('revoked')
    const ok = await redeem(AUTH_S1, nuevo[0].regenerate_code, 'c6')
    expect(ok[0].status).toBe('ok')
    expect(ok[0].pseudonym).toBe('Zorro-01')
    matrix.push({ caso: 'regenerar código', actor: 'Docente Uno', accion: 'regenerate_code', esperado: 'permitido', obtenido: 'permitido' })
  })

  it('un código revocado no puede canjearse', async () => {
    await db.exec(`update public.code_credential set state='revoked' where student_enrollment_id='${S1}'`)
    const rows = await redeem(AUTH_S1, CODE_S1, 'c7')
    expect(rows[0].status).toBe('revoked')
    matrix.push({ caso: 'canje de código revocado', actor: 'Zorro-01', accion: 'redeem_code', esperado: 'denegado', obtenido: 'denegado', detalle: 'status=revoked' })
  })
})

describe('Límite de intentos', () => {
  it('bloquea tras 10 intentos fallidos con la misma clave de cliente', async () => {
    for (let i = 0; i < 10; i++) {
      await redeem(AUTH_S1, 'MALO', 'lock')
    }
    const rows = await redeem(AUTH_S1, 'MALO', 'lock')
    expect(rows[0].status).toBe('rate_limited')
    matrix.push({ caso: 'límite de intentos', actor: 'Zorro-01', accion: '11 canjes fallidos', esperado: 'denegado', obtenido: 'denegado', detalle: 'status=rate_limited' })
  })
})

describe('Un código, un binding activo', () => {
  it('un segundo canje revoca el binding previo de la misma matrícula', async () => {
    await redeem(AUTH_S1, CODE_S1, 'r1')
    await redeem(AUTH_OTHER, CODE_S1, 'r2')
    const primero = await asUser(db, AUTH_S1, () => q<{ id: string | null }>(db, 'select public.current_enrollment_id() as id'))
    const segundo = await asUser(db, AUTH_OTHER, () => q<{ id: string | null }>(db, 'select public.current_enrollment_id() as id'))
    expect(primero[0].id).toBeNull()
    expect(segundo[0].id).toBe(S1)
    matrix.push({ caso: 'segundo canje revoca el primero', actor: 'otra sesión', accion: 'redeem_code', esperado: 'denegado', obtenido: 'denegado' })
  })

  it('el docente no puede regenerar códigos de otro curso', async () => {
    const r = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.regenerate_code($1)', ['30000000-0000-0000-0000-000000000003'])))
    expect(r.denied).toBe(true)
    matrix.push({ caso: 'docente de otro curso regenera', actor: 'Docente Uno', accion: 'regenerate_code (curso Y)', esperado: 'denegado', obtenido: 'denegado', detalle: r.reason })
  })

  it('un código se canjea con su propia matrícula desde otra identidad', async () => {
    const rows = await redeem('c0000000-0000-0000-0000-000000000003', CODE_S2, 'x')
    expect(rows[0].status).toBe('ok')
    expect(rows[0].pseudonym).toBe('Puma-02')
    matrix.push({ caso: 'canje con otra identidad', actor: 'otra sesión', accion: "redeem_code('PUMA-02')", esperado: 'permitido', obtenido: 'permitido' })
  })
})
