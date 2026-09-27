import { PGlite } from '@electric-sql/pglite'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '..')

/** Crea una base PostgreSQL aislada (WASM), aplica shim, migraciones y semilla sintética. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(readFileSync(join(ROOT, 'tests-db', 'shim.sql'), 'utf8'))

  const dir = join(ROOT, 'supabase', 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    await db.exec(readFileSync(join(dir, f), 'utf8'))
  }

  await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'))
  return db
}

/** Ejecuta `fn` simulando la identidad (claim sub) y el rol indicado. */
export async function asUser<T>(
  db: PGlite,
  uid: string | null,
  fn: () => Promise<T>,
  role: 'authenticated' | 'anon' | 'service_role' = 'authenticated',
): Promise<T> {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claim.sub', ${uid === null ? "''" : `'${uid}'`}, false)`)
  await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.exec("select set_config('request.jwt.claim.sub', '', false)")
  }
}

export async function q<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await db.query<T>(sql, params)
  return res.rows
}

/** Devuelve true si la operación fue denegada (excepción o 0 filas afectadas). */
export async function denied(fn: () => Promise<unknown>): Promise<{ denied: boolean; reason?: string }> {
  try {
    await fn()
    return { denied: false }
  } catch (e) {
    return { denied: true, reason: (e as Error).message }
  }
}

export interface MatrixRow {
  caso: string
  actor: string
  accion: string
  esperado: 'permitido' | 'denegado'
  obtenido: 'permitido' | 'denegado'
  detalle?: string
}

export function writeMatrix(name: string, rows: MatrixRow[]): void {
  const dir = join(ROOT, 'docs', 'i0b')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows, null, 2))
}
