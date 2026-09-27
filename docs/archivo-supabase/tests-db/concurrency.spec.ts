import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { startTestServer, type TestServer } from './harness-server'
import { writeMatrix, type MatrixRow } from './harness'
import { AUTH_S1, AUTH_S2, CODE_S1, CODE_S2, M3, S1, S2, T1_AUTH } from './fixtures'

const matrix: MatrixRow[] = []
let server: TestServer

function redeem(c: pg.Client, code: string, key: string) {
  return c.query<{ status: string }>('select * from public.redeem_code($1,$2)', [code, key])
}

beforeAll(async () => {
  server = await startTestServer()
}, 180_000)

afterAll(async () => {
  writeMatrix('matriz-concurrencia', matrix)
  if (server) await server.stop()
})

describe('Concurrencia multiconexión (PostgreSQL real, sin Docker)', () => {
  it('dos intentos concurrentes con código inválido no pierden el recuento', async () => {
    const c1 = await server.client(AUTH_S1)
    const c2 = await server.client(AUTH_S1)
    const [a, b] = await Promise.all([redeem(c1, 'MALO-X', 'k1'), redeem(c2, 'MALO-X', 'k2')])
    expect(a.rows[0].status).toBe('invalid')
    expect(b.rows[0].status).toBe('invalid')
    const count = await server.admin.query("select count(*)::int as n from public.redeem_attempt where success=false and client_key in ('k1','k2')")
    expect(count.rows[0].n).toBe(2)
    await c1.end()
    await c2.end()
    matrix.push({ caso: 'canjes concurrentes inválidos', actor: 'Zorro-01 x2', accion: 'redeem_code en paralelo', esperado: 'denegado', obtenido: 'denegado', detalle: '2 intentos contados (advisory lock)' })
  })

  it('dos envíos concurrentes con la misma clave crean una sola versión', async () => {
    const c1 = await server.client(AUTH_S1)
    await redeem(c1, CODE_S1, 'setup-envios')
    const d = await c1.query<{ id: string }>('select public.start_delivery($1) as id', [M3])
    const delivery = d.rows[0].id
    const key = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    const c2 = await server.client(AUTH_S1)
    const [a, b] = await Promise.all([
      c1.query<{ id: string }>('select public.submit_evidence($1,$2,$3,$4) as id', [delivery, key, 'text', 'x']),
      c2.query<{ id: string }>('select public.submit_evidence($1,$2,$3,$4) as id', [delivery, key, 'text', 'x']),
    ])
    expect(a.rows[0].id).toBe(b.rows[0].id)
    const versions = await server.admin.query('select id from public.evidence_version where delivery_id=$1', [delivery])
    expect(versions.rowCount).toBe(1)
    await c1.end()
    await c2.end()
    matrix.push({ caso: 'envíos concurrentes misma clave', actor: 'Zorro-01 x2', accion: 'submit_evidence en paralelo', esperado: 'permitido', obtenido: 'permitido', detalle: '1 versión' })
  })

  it('dos validaciones concurrentes producen un solo evento de XP', async () => {
    const c1 = await server.client(AUTH_S1)
    await redeem(c1, CODE_S1, 'setup-valid')
    const d = await c1.query<{ id: string }>('select public.start_delivery($1) as id', ['60000000-0000-0000-0000-000000000004'])
    const delivery = d.rows[0].id
    await c1.query('select public.submit_evidence($1,$2,$3,$4) as id', [delivery, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'text', 'x'])
    await c1.end()

    const payload = JSON.stringify([
      { indicator_id: '40000000-0000-0000-0000-000000000002', level: 'developing' },
      { indicator_id: '40000000-0000-0000-0000-000000000003', level: 'achieved' },
    ])
    const t1a = await server.client(T1_AUTH)
    const t1b = await server.client(T1_AUTH)
    const results = await Promise.allSettled([
      t1a.query('select public.validate_milestone($1,$2,$3)', [delivery, payload, 'a']),
      t1b.query('select public.validate_milestone($1,$2,$3)', [delivery, payload, 'b']),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length
    expect(fulfilled).toBe(1)
    const xp = await server.admin.query('select id from public.xp_event where student_enrollment_id=$1 and milestone_id=$2', [S1, '60000000-0000-0000-0000-000000000004'])
    expect(xp.rowCount).toBe(1)
    await t1a.end()
    await t1b.end()
    matrix.push({ caso: 'validaciones concurrentes', actor: 'Docente Uno x2', accion: 'validate_milestone en paralelo', esperado: 'permitido', obtenido: 'permitido', detalle: '1 éxito, 1 rechazado; 1 xp_event' })
  })

  it('doce intentos concurrentes sobre una credencial revocada no pierden incrementos', async () => {
    await server.admin.query(`update public.code_credential set state='revoked', failed_attempts=0, locked_until=null where student_enrollment_id=$1`, [S2])
    const clients = await Promise.all(Array.from({ length: 12 }, () => server.client(AUTH_S2)))
    await Promise.all(clients.map((c, i) => redeem(c, CODE_S2, `conc-${i}`)))
    const fa = await server.admin.query('select failed_attempts, locked_until from public.code_credential where student_enrollment_id=$1', [S2])
    expect(fa.rows[0].failed_attempts).toBeGreaterThanOrEqual(10)
    await Promise.all(clients.map((c) => c.end()))
    matrix.push({ caso: 'intentos concurrentes y bloqueo', actor: 'Puma-02 x12', accion: 'redeem_code en paralelo (revocado)', esperado: 'denegado', obtenido: 'denegado', detalle: `failed_attempts=${fa.rows[0].failed_attempts}` })
  })

  it('el canje válido concurrente deja un solo binding activo', async () => {
    const c1 = await server.client(AUTH_S1)
    const c2 = await server.client(AUTH_S1)
    await Promise.all([redeem(c1, CODE_S1, 'b1'), redeem(c2, CODE_S1, 'b2')])
    const bindings = await server.admin.query("select count(*)::int as n from public.student_session_binding where state='active'")
    expect(bindings.rows[0].n).toBe(1)
    await c1.end()
    await c2.end()
    matrix.push({ caso: 'canje válido concurrente', actor: 'Zorro-01 x2', accion: 'redeem_code en paralelo', esperado: 'permitido', obtenido: 'permitido', detalle: '1 binding activo' })
  })
})
