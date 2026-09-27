import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export interface TestServer {
  admin: pg.Client
  port: number
  client: (uid: string | null, role?: string) => Promise<pg.Client>
  stop: () => Promise<void>
}

/**
 * Instancia aislada de pruebas: PostgreSQL real (binario de `embedded-postgres`),
 * multiconexión, sin Docker ni credenciales reales. UTF-8 forzado en initdb.
 */
export async function startTestServer(): Promise<TestServer> {
  const dir = join(tmpdir(), `red-tic-epg-${Date.now()}`)
  const port = 55440 + Math.floor(Math.random() * 100)

  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })

  await server.initialise()
  await server.start()

  const admin = new pg.Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'postgres' })
  await admin.connect()

  const apply = async (file: string) => {
    await admin.query(readFileSync(file, 'utf8'))
  }

  await apply(join(ROOT, 'tests-db', 'shim.sql'))
  const mdir = join(ROOT, 'supabase', 'migrations')
  for (const f of readdirSync(mdir).filter((f) => f.endsWith('.sql')).sort()) {
    await apply(join(mdir, f))
  }
  await apply(join(ROOT, 'supabase', 'seed.sql'))
  const seedI0c = join(ROOT, 'tests-db', 'seed-i0c.sql')
  if (existsSync(seedI0c)) await apply(seedI0c)

  const client = async (uid: string | null, role = 'authenticated') => {
    const c = new pg.Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'postgres' })
    await c.connect()
    await c.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ''])
    await c.query(`set role ${role}`)
    return c
  }

  const stop = async () => {
    try {
      await admin.end()
    } catch {
      /* ignore */
    }
    try {
      await server.stop()
    } catch {
      /* ignore */
    }
  }

  return { admin, port, client, stop }
}
