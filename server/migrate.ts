import 'dotenv/config'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Database } from './database.ts'
import { tableNames, identityTableNames } from './schema.ts'
import { ObjectStorage } from './storage.ts'

const ident = (name: string) => '"' + name.replaceAll('"', '""') + '"'
const canonical = (row: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))

// Offline cutover only: stop writes to the old app and do not start the new one until verification succeeds.
export async function migrate(sourcePath: string, target: Database): Promise<{ backup: string, counts: Record<string, number> }> {
  const sourceFile = resolve(sourcePath)
  if (!existsSync(sourceFile)) throw new Error('SQLite source file does not exist.')
  const backupDir = resolve('migration-backups', new Date().toISOString().replaceAll(':', '-') + '-' + process.pid)
  mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const backup = join(backupDir, 'before-supabase.db')
  const live = new DatabaseSync(sourceFile, { readOnly: true })
  try { live.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`) } finally { live.close() }
  chmodSync(backup, 0o600)
  const source = new DatabaseSync(backup, { readOnly: true })
  const storage = new ObjectStorage()
  const counts: Record<string, number> = {}
  try {
    if (source.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error('SQLite integrity check failed.')
    if (source.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite contains broken foreign key references. Fix those before migration.')
    const sourceTables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name))
    const unknown = sourceTables.filter(name => !(tableNames as readonly string[]).includes(name))
    if (unknown.length) throw new Error('Unrecognized source tables; refusing to omit data: ' + unknown.join(', '))
    await storage.verifyBucket()
    await target.initialize()
    await target.transaction(async () => {
      // Refuse to merge/overwrite any existing target data, including default seeds.
      for (const table of tableNames) {
        const result = await target.query(`SELECT COUNT(*)::integer AS count FROM ${ident(table)}`)
        if (result.rows[0].count !== 0) throw new Error(`Target table ${table} is not empty. Use a new empty Supabase project/schema; no data was overwritten.`)
      }
      for (const table of tableNames) {
        if (!sourceTables.includes(table)) { counts[table] = 0; continue }
        const columns = source.prepare(`PRAGMA table_info(${ident(table)})`).all().map(row => String(row.name))
        const targetColumns = (await target.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', ['shop', table])).rows.map(row => row.column_name)
        if (columns.some(column => !targetColumns.includes(column))) throw new Error(`Unexpected source columns in ${table}; refusing to omit data.`)
        const rows = source.prepare(`SELECT * FROM ${ident(table)}`).all()
        const expected: string[] = []
        for (const row of rows) {
          const values = columns.map(column => {
            const value = row[column]
            return value instanceof Uint8Array ? Buffer.from(value) : value
          })
          const imageIndex = columns.indexOf('image')
          if (imageIndex >= 0 && Buffer.isBuffer(values[imageIndex])) {
            const bytes = values[imageIndex] as Buffer
            const contentType = String(row.content_type)
            const path = await storage.put(bytes, contentType)
            const downloaded = await storage.get(path)
            if (!createHash('sha256').update(bytes).digest().equals(createHash('sha256').update(downloaded).digest())) throw new Error(`Storage verification failed in ${table}.`)
            values[imageIndex] = path
          }
          await target.query(`INSERT INTO ${ident(table)} (${columns.map(ident).join(',')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')})`, values)
          expected.push(canonical(Object.fromEntries(columns.map((column, i) => [column, values[i]]))))
        }
        const actual = (await target.query(`SELECT ${columns.map(ident).join(',')} FROM ${ident(table)}`)).rows.map(canonical)
        if (JSON.stringify(expected.sort()) !== JSON.stringify(actual.sort())) throw new Error(`Row verification failed in ${table}; target inserts will roll back.`)
        counts[table] = rows.length
        console.log(`Verified ${table}: ${rows.length} rows`)
      }
      for (const table of identityTableNames) {
        // Restart identity sequences above preserved IDs, including empty tables.
        await target.query(`SELECT setval(pg_get_serial_sequence($1,'id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM ${ident(table)}`, ['shop.' + table])
      }
    })()
    console.log('Migration verified. Original SQLite data is unchanged. Keep your private backup:', backup)
    return { backup, counts }
  } finally { source.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2]
  if (!path) { console.error('Usage: npm run migrate:sqlite -- /absolute/path/to/shop.db'); process.exitCode = 1 }
  else {
    let target: Database | undefined
    try { target = new Database(); await migrate(path, target) }
    catch (error) {
      const message = error instanceof Error ? error.message : ''
      const safe = /^(SQLite |Unrecognized source tables|Target table |Unexpected source columns|Row verification failed|Storage verification failed|Set DATABASE_URL|Set SUPABASE_URL|Storage upload failed|Storage download failed|Storage bucket)/.test(message) ? message : 'Check credentials, TLS certificate, schema compatibility and service quotas.'
      console.error('Migration did not complete:', safe)
      console.error('No source data was changed. Keep the private local snapshot. Target row inserts roll back on failure; uploaded Storage objects may remain and can be reused on retry.')
      process.exitCode = 1
    }
    finally { await target?.close() }
  }
}
