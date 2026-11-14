import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { databaseTlsOptions, supabaseRootCertificate } from '../dist-server/databaseTls.js'

test('Supabase pooler includes the authentic public CA with verification enabled', () => {
  const options = databaseTlsOptions('aws-1-eu-north-1.pooler.supabase.com', '')
  assert.equal(options.rejectUnauthorized, true)
  assert.ok(options.ca.includes(supabaseRootCertificate))
  assert.equal(new X509Certificate(supabaseRootCertificate).fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA')
})
test('direct Supabase connections also trust the official root', () => {
  assert.ok(databaseTlsOptions('db.example.supabase.co', '').ca.includes(supabaseRootCertificate))
})
test('unrelated hosts do not automatically receive the Supabase trust root', () => {
  const options = databaseTlsOptions('db.example.com', '')
  assert.deepEqual(options.ca, [...rootCertificates])
  assert.equal(options.rejectUnauthorized, true)
  assert.equal(databaseTlsOptions('evil.supabase.co.example.com', '').ca.includes(supabaseRootCertificate), false)
})
test('custom certificate extends system and bundled roots instead of replacing them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shopy-ca-'))
  try {
    const path = join(directory, 'root.crt')
    writeFileSync(path, supabaseRootCertificate)
    const options = databaseTlsOptions('aws-1-eu-north-1.pooler.supabase.com', path)
    assert.equal(options.rejectUnauthorized, true)
    for (const root of rootCertificates) assert.ok(options.ca.includes(root))
    assert.ok(options.ca.includes(supabaseRootCertificate))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
