import pg, { type PoolClient, type QueryResult } from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import { databaseTlsOptions } from './databaseTls.ts'
import { schemaSql, identityTableNames } from './schema.ts'
import { ObjectStorage } from './storage.ts'

// Preserve the application's existing parameterized query API while using asynchronous PostgreSQL.
const storage = new ObjectStorage()
pg.types.setTypeParser(20, (value) => {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new Error('Database integer exceeds the safe JavaScript range.')
  return result
})
pg.types.setTypeParser(1700, Number)
export function postgresSql(input: string): string {
  let n = 0
  let sql = input.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, token => token === '?' ? `$${++n}` : token)
  sql = sql.replace(/\$(\d+) IS NULL/g, 'CAST($$$1 AS TEXT) IS NULL')
  sql = sql.replace(/\bAS ([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g, 'AS "$1"')
  sql = sql.replace(/\bCURRENT_TIMESTAMP\b/g, "to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')")
  sql = sql.replace(/visit_count = visit_count \+ 1/g, 'visit_count = buyer_store_visits.visit_count + 1')
  sql = sql.replace(/\bGROUP_CONCAT\(/gi, 'STRING_AGG(').replace(/\bLIKE\s+(\$\d+)/g, "ILIKE $1 ESCAPE ''")
  if (/INSERT OR IGNORE/i.test(sql)) sql = sql.replace(/INSERT OR IGNORE/i, 'INSERT') + ' ON CONFLICT DO NOTHING'
  if (/FROM categories\b/i.test(sql)) sql = sql.replace(/ORDER BY name\b/g, 'ORDER BY lower(name), name')
  return sql
}
const identityTables = new Set<string>(identityTableNames)
export class Database {
  private context = new AsyncLocalStorage<PoolClient>()
  readonly pool: pg.Pool
  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('Set DATABASE_URL to the Supabase PostgreSQL connection string.')
    const parsed = new URL(connectionString)
    // SSL URL options can override pg's ssl object. Keep verification explicit.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(key)
    this.pool = new pg.Pool({ connectionString: parsed.toString(), max: 3, connectionTimeoutMillis: 15000,
      ssl: databaseTlsOptions(parsed.hostname),
    })
    this.pool.on('error', () => console.error('Database connection interrupted.'))
  }
  async query(sql: string, parameters: unknown[] = []): Promise<QueryResult> {
    const active = this.context.getStore()
    if (active) return active.query(sql, parameters)
    const client = await this.pool.connect()
    try {
      await client.query("SET search_path TO shop; SET TIME ZONE 'UTC'")
      return await client.query(sql, parameters)
    } finally { client.release() }
  }
  async initialize(): Promise<void> {
    await this.transaction(async () => { await this.query(schemaSql) })()
  }
  prepare(input: string) {
    const sql = postgresSql(input)
    const read = async (parameters: unknown[]) => {
      const result = await this.query(sql, parameters)
      for (const row of result.rows) {
        if (typeof row.image === 'string') row.image = await storage.get(row.image)
      }
      return result.rows
    }
    return {
      get: async (...parameters: unknown[]): Promise<unknown> => (await read(parameters))[0],
      all: async (...parameters: unknown[]): Promise<unknown[]> => read(parameters),
      run: async (...parameters: unknown[]): Promise<{ changes: number, lastInsertRowid: number }> => {
        const values = [...parameters]
        // All binary uploads already pass the API's image/type/size validation.
        for (let i = 0; i < values.length; i++) {
          if (Buffer.isBuffer(values[i])) {
            const type = values.find(value => typeof value === 'string' && /^image\/(png|jpeg|webp)$/.test(value))
            if (typeof type !== 'string') throw new Error('Missing upload content type.')
            values[i] = await storage.put(values[i] as Buffer, type)
          }
        }
        const table = sql.match(/^\s*INSERT INTO (\w+)/i)?.[1]
        const query = table && identityTables.has(table) ? sql + ' RETURNING id' : sql
        const result = await this.query(query, values)
        return { changes: result.rowCount || 0, lastInsertRowid: Number(result.rows[0]?.id || 0) }
      },
    }
  }
  transaction<Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>) {
    return async (...args: Args): Promise<Result> => {
      if (this.context.getStore()) return fn(...args)
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL search_path TO shop; SET LOCAL TIME ZONE 'UTC'")
        // SQLite serialized transactions; retain that ordering for wallet/order updates.
        await client.query('SELECT pg_advisory_xact_lock(736467234)')
        const result = await this.context.run(client, () => fn(...args))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally { client.release() }
    }
  }
  async close() { await this.pool.end() }
}
