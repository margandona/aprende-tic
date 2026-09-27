import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createTestDb, denied, q, writeMatrix, type MatrixRow } from './harness'
import {
  AUTH_S1, AUTH_S2, AUTH_S3, CODE_S1, CODE_S2, CODE_S3, COURSE_X,
  D1_IND, D2_IND, D4_IND, DELIVERY_S1, DELIVERY_TEAM, E1_IND, M4, M5, M_FOREIGN,
  S1, S2, S3, T1_AUTH,
} from './fixtures'

const matrix: MatrixRow[] = []
let db: PGlite

function rec(caso: string, actor: string, accion: string, esperado: 'permitido' | 'denegado', obtenido: 'permitido' | 'denegado', detalle?: string) {
  matrix.push({ caso, actor, accion, esperado, obtenido, detalle })
}

interface RedeemRow { status: string; pseudonym: string | null }

function redeem(uid: string | null, code: string, actorKey: string) {
  return asUser(db, uid, () => q<RedeemRow>(db, 'select * from public.redeem_code($1,$2)', [code, actorKey]))
}

beforeEach(async () => {
  db = await createTestDb()
  await redeem(AUTH_S1, CODE_S1, 'setup-s1')
  await redeem(AUTH_S2, CODE_S2, 'setup-s2')
  await redeem(AUTH_S3, CODE_S3, 'setup-s3')
})

afterAll(async () => {
  writeMatrix('matriz-i0c', matrix)
  if (db) await db.close()
})

// ── B1 · limitación de intentos y bloqueo por credencial ───────────────────
describe('B1 · límite de intentos no evadible por clave rotatoria', () => {
  it('rota claves de actor y aun así se bloquea por credencial', async () => {
    await db.exec(`update public.code_credential set state='revoked' where student_enrollment_id='${S1}'`)
    for (let i = 0; i < 10; i++) {
      const r = await redeem(AUTH_S1, CODE_S1, `actor-${i}`)
      expect(r[0].status).toBe('revoked')
    }
    const locked = await redeem(AUTH_S1, CODE_S1, 'actor-final')
    expect(locked[0].status).toBe('locked')
    const fa = await q<{ failed_attempts: number }>(db, `select failed_attempts from public.code_credential where student_enrollment_id='${S1}'`)
    expect(fa[0].failed_attempts).toBeGreaterThanOrEqual(10)
    rec('B1 bloqueo por credencial', 'Zorro-01', '10 canjes con claves rotatorias', 'denegado', 'denegado', 'status=locked')
  })
})

// ── B2 · hash con pimiento, alta entropía y caducidad ──────────────────────
describe('B2 · hash con pimiento, entropía y caducidad', () => {
  it('el código regenerado es de alta entropía y reemplaza al anterior', async () => {
    const nuevo = await asUser(db, T1_AUTH, () => q<{ regenerate_code: string }>(db, 'select public.regenerate_code($1) as regenerate_code', [S1]))
    expect(nuevo[0].regenerate_code.length).toBeGreaterThanOrEqual(20)
    const ok = await redeem(AUTH_S1, nuevo[0].regenerate_code, 'b2a')
    expect(ok[0].status).toBe('ok')
    const viejo = await redeem(AUTH_S1, CODE_S1, 'b2b')
    expect(viejo[0].status).toBe('revoked')
    rec('B2 código de alta entropía', 'Docente Uno', 'regenerate_code', 'permitido', 'permitido', '24 hex')
  })

  it('un código caducado no se canjea', async () => {
    await db.exec(`update public.code_credential set expires_at = now() - interval '1 day' where student_enrollment_id='${S2}'`)
    const r = await redeem(AUTH_S2, CODE_S2, 'b2c')
    expect(r[0].status).toBe('expired')
    rec('B2 código caducado', 'Puma-02', 'redeem_code', 'denegado', 'denegado', 'status=expired')
  })

  it('el hash depende del pimiento secreto', async () => {
    const h1 = await q<{ h: string }>(db, "select public.hash_code('PRUEBA') as h")
    expect(h1[0].h).toMatch(/^[0-9a-f]{64}$/)
    await db.exec("update public.security_pepper set value = value || '-rotado'")
    const h2 = await q<{ h: string }>(db, "select public.hash_code('PRUEBA') as h")
    expect(h2[0].h).not.toBe(h1[0].h)
    rec('B2 pimiento cambia el hash', 'sistema', 'hash_code', 'permitido', 'permitido', 'sin pimiento no se reproduce')
  })
})

// ── B3 · registro de evidencia equivalente ─────────────────────────────────
describe('B3 · registro de evidencia equivalente', () => {
  it('rechaza un hito de otro programa', async () => {
    const r = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.register_equivalent_evidence($1,$2,$3,$4)', [S1, M_FOREIGN, 'paper', 'ajeno'])))
    expect(r.denied).toBe(true)
    rec('B3 hito ajeno', 'Docente Uno', 'register_equivalent_evidence (programa ajeno)', 'denegado', 'denegado', r.reason)
  })

  it('incrementa la versión y respeta la idempotencia por clave', async () => {
    const v1 = await asUser(db, T1_AUTH, () => q<{ id: string }>(db, 'select public.register_equivalent_evidence($1,$2,$3,$4) as id', [S1, M4, 'paper', 'v1']))
    const v2 = await asUser(db, T1_AUTH, () => q<{ id: string }>(db, 'select public.register_equivalent_evidence($1,$2,$3,$4) as id', [S1, M4, 'paper', 'v2']))
    expect(v1[0].id).not.toBe(v2[0].id)
    const versions = await q<{ version: number }>(db, `select version from public.evidence_version ev join public.delivery d on d.id=ev.delivery_id where d.owner_enrollment_id='${S1}' and d.milestone_id='${M4}' order by version`)
    expect(versions.map((v) => v.version)).toEqual([1, 2])
    rec('B3 versiones incrementales', 'Docente Uno', 'register_equivalent_evidence x2', 'permitido', 'permitido', 'v1, v2')

    const k = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const a = await asUser(db, T1_AUTH, () => q<{ id: string }>(db, 'select public.register_equivalent_evidence($1,$2,$3,$4,$5,$6) as id', [S2, M5, 'paper', 'x', 'not_applicable', k]))
    const b = await asUser(db, T1_AUTH, () => q<{ id: string }>(db, 'select public.register_equivalent_evidence($1,$2,$3,$4,$5,$6) as id', [S2, M5, 'paper', 'x', 'not_applicable', k]))
    expect(a[0].id).toBe(b[0].id)
    rec('B3 idempotencia equivalencia', 'Docente Uno', 'register_equivalent_evidence (misma clave)', 'permitido', 'permitido', 'mismo id')
  })
})

// ── B4 · coherencia de curso/programa ──────────────────────────────────────
describe('B4 · coherencia de curso y programa', () => {
  it('impide un coautor de otro curso', async () => {
    const r = await denied(() => q(db, "insert into public.team_member (team_id, student_enrollment_id) values ('80000000-0000-0000-0000-000000000001', $1)", [S3]))
    expect(r.denied).toBe(true)
    rec('B4 coautor de otro curso', 'sistema', 'insert team_member (curso Y en equipo X)', 'denegado', 'denegado', r.reason)
  })

  it('impide una entrega con hito de otro programa', async () => {
    const r = await denied(() => q(db, "insert into public.delivery (owner_enrollment_id, milestone_id) values ($1, $2)", [S1, M_FOREIGN]))
    expect(r.denied).toBe(true)
    rec('B4 entrega con hito ajeno', 'sistema', 'insert delivery (programa ajeno)', 'denegado', 'denegado', r.reason)
  })

  it('impide una entrega con equipo de otro curso', async () => {
    const r = await denied(() => q(db, "insert into public.delivery (owner_enrollment_id, milestone_id, scope, team_id) values ($1, $2, 'team', '80000000-0000-0000-0000-000000000001')", [S3, '60000000-0000-0000-0000-000000000001']))
    expect(r.denied).toBe(true)
    rec('B4 entrega con equipo ajeno', 'sistema', 'insert delivery (equipo de otro curso)', 'denegado', 'denegado', r.reason)
  })
})

// ── B5 · reserva y Storage controlado ──────────────────────────────────────
describe('B5 · reserva de archivos y Storage', () => {
  let deliveryM4 = ''

  beforeEach(async () => {
    const d = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, 'select public.start_delivery($1) as id', [M4]))
    deliveryM4 = d[0].id
  })

  it('rechaza tipo y tamaño no permitidos', async () => {
    const badMime = await denied(() => asUser(db, AUTH_S1, () => q(db, 'select public.reserve_evidence_upload($1,$2,$3,$4)', [deliveryM4, 'a.exe', 'application/x-msdownload', 100])))
    expect(badMime.denied).toBe(true)
    const big = await denied(() => asUser(db, AUTH_S1, () => q(db, 'select public.reserve_evidence_upload($1,$2,$3,$4)', [deliveryM4, 'a.pdf', 'application/pdf', 6 * 1024 * 1024])))
    expect(big.denied).toBe(true)
    rec('B5 tipo/tamaño', 'Zorro-01', 'reserve_evidence_upload inválido', 'denegado', 'denegado')
  })

  it('permite subir solo a una ruta reservada y abierta', async () => {
    const path = await asUser(db, AUTH_S1, () => q<{ reserve_evidence_upload: string }>(db, 'select public.reserve_evidence_upload($1,$2,$3,$4) as reserve_evidence_upload', [deliveryM4, 'guia.pdf', 'application/pdf', 1024]))
    const reserved = path[0].reserve_evidence_upload
    await asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [reserved]))
    rec('B5 subir a ruta reservada', 'Zorro-01', 'insert storage.objects', 'permitido', 'permitido')

    const fake = `course/${COURSE_X}/enrollment/${S1}/delivery/${deliveryM4}/uploads/00000000-0000-0000-0000-000000000000/x.pdf`
    const deniedUpload = await denied(() => asUser(db, AUTH_S1, () => q(db, "insert into storage.objects (bucket_id, name) values ('evidence', $1)", [fake])))
    expect(deniedUpload.denied).toBe(true)
    rec('B5 subir sin reserva', 'Zorro-01', 'insert storage.objects (no reservada)', 'denegado', 'denegado', deniedUpload.reason)
  })

  it('deniega reservar después del cierre', async () => {
    await db.exec(`update public.delivery set state='achieved' where id='${deliveryM4}'`)
    const r = await denied(() => asUser(db, AUTH_S1, () => q(db, 'select public.reserve_evidence_upload($1,$2,$3,$4)', [deliveryM4, 'a.pdf', 'application/pdf', 100])))
    expect(r.denied).toBe(true)
    rec('B5 reservar tras cierre', 'Zorro-01', 'reserve_evidence_upload (achieved)', 'denegado', 'denegado', r.reason)
  })
})

// ── B6 · validate_milestone ────────────────────────────────────────────────
describe('B6 · validación completa y evidencia vigente', () => {
  it('exige estado «por revisar»', async () => {
    // DELIVERY_S1 está 'achieved' y su hito (m1) exige D1, D4 y E1.
    const r = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_S1, JSON.stringify([
      { indicator_id: D1_IND, level: 'achieved' },
      { indicator_id: D4_IND, level: 'achieved' },
      { indicator_id: E1_IND, level: 'achieved' },
    ]), 'x'])))
    expect(r.denied).toBe(true)
    rec('B6 estado distinto de pending_review', 'Docente Uno', 'validate_milestone (achieved)', 'denegado', 'denegado', r.reason)
  })

  it('rechaza indicadores parciales, duplicados o ajenos al hito', async () => {
    const partial = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_TEAM, JSON.stringify([{ enrollment_id: S1, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: E1_IND, level: 'achieved' }]), 'x'])))
    expect(partial.denied).toBe(true)

    const dup = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_TEAM, JSON.stringify([{ enrollment_id: S1, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S1, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S1, indicator_id: E1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: E1_IND, level: 'achieved' }]), 'x'])))
    expect(dup.denied).toBe(true)

    const foreign = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_TEAM, JSON.stringify([{ enrollment_id: S1, indicator_id: D2_IND, level: 'achieved' }]), 'x'])))
    expect(foreign.denied).toBe(true)
    rec('B6 parciales/duplicados/ajenos', 'Docente Uno', 'validate_milestone', 'denegado', 'denegado')
  })

  it('rechaza evidencia que no pertenece a la entrega', async () => {
    await db.exec(`update public.delivery set current_evidence_id='e0000000-0000-0000-0000-000000000001' where id='${DELIVERY_TEAM}'`)
    const r = await denied(() => asUser(db, T1_AUTH, () => q(db, 'select public.validate_milestone($1,$2,$3)', [DELIVERY_TEAM, JSON.stringify([{ enrollment_id: S1, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S1, indicator_id: E1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: E1_IND, level: 'achieved' }]), 'x'])))
    expect(r.denied).toBe(true)
    rec('B6 evidencia cruzada', 'Docente Uno', 'validate_milestone (evidencia ajena)', 'denegado', 'denegado', r.reason)
  })

  it('acepta una validación completa de equipo', async () => {
    const ok = await asUser(db, T1_AUTH, () => q<{ validate_milestone: { status: string } }>(db, 'select public.validate_milestone($1,$2,$3) as validate_milestone', [DELIVERY_TEAM, JSON.stringify([{ enrollment_id: S1, indicator_id: D1_IND, level: 'developing' }, { enrollment_id: S1, indicator_id: E1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: D1_IND, level: 'achieved' }, { enrollment_id: S2, indicator_id: E1_IND, level: 'developing' }]), 'ok']))
    expect(ok[0].validate_milestone.status).toBe('achieved')
    rec('B6 validación completa', 'Docente Uno', 'validate_milestone (S1+S2, D1+E1)', 'permitido', 'permitido')
  })
})

// ── B7 · inmutabilidad del diagnóstico ─────────────────────────────────────
describe('B7 · diagnóstico inmutable tras el envío', () => {
  it('no permite modificar ni completar un diagnóstico enviado', async () => {
    const attempt = await asUser(db, AUTH_S1, () => q<{ id: string }>(db, "insert into public.diagnosis_attempt (student_enrollment_id, kind, diagnosis_version_id) values ($1,'pre','b0000000-0000-0000-0000-000000000001') returning id", [S1]))
    const attemptId = attempt[0].id

    await asUser(db, AUTH_S1, () => q(db, "insert into public.diagnosis_response (attempt_id, task_code, response_status, score) values ($1,'T1','answered',2)", [attemptId]))
    rec('B7 respuesta en borrador', 'Zorro-01', 'insert diagnosis_response (draft)', 'permitido', 'permitido')

    await asUser(db, AUTH_S1, () => q(db, 'select public.submit_diagnosis_attempt($1)', [attemptId]))

    const late = await denied(() => asUser(db, AUTH_S1, () => q(db, "insert into public.diagnosis_response (attempt_id, task_code, response_status) values ($1,'T2','answered')", [attemptId])))
    expect(late.denied).toBe(true)
    rec('B7 respuesta tras envío', 'Zorro-01', 'insert diagnosis_response (submitted)', 'denegado', 'denegado', late.reason)

    const upd = await denied(() => asUser(db, AUTH_S1, () => q(db, "update public.diagnosis_attempt set status='draft' where id=$1", [attemptId])))
    expect(upd.denied).toBe(true)
    rec('B7 mutar intento enviado', 'Zorro-01', "update diagnosis_attempt.status", 'denegado', 'denegado', upd.reason)

    const again = await denied(() => asUser(db, AUTH_S1, () => q(db, 'select public.submit_diagnosis_attempt($1)', [attemptId])))
    expect(again.denied).toBe(true)
    rec('B7 reenviar intento', 'Zorro-01', 'submit_diagnosis_attempt x2', 'denegado', 'denegado', again.reason)
  })
})
