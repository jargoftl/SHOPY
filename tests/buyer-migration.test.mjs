import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import Database from 'better-sqlite3'

test('existing balances are reset once and future adjustments persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggu-migration-test-'))
  const dbPath = join(directory, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE buyer_wallets (user_id INTEGER PRIMARY KEY REFERENCES users(id), balance_cents INTEGER NOT NULL DEFAULT 1000000 CHECK (balance_cents >= 0));
    CREATE TABLE buyer_wallet_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, coin TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), destination TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', instructions TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE buyer_request_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL REFERENCES buyer_wallet_requests(id) ON DELETE CASCADE, content_type TEXT NOT NULL, image BLOB NOT NULL, wallet_address TEXT NOT NULL, network TEXT NOT NULL, coin TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users (full_name, email, password_hash, role) VALUES ('Old Buyer', 'old@example.test', 'unusable', 'customer');
    INSERT INTO buyer_wallets (user_id, balance_cents) VALUES (1, 15000000);
    INSERT INTO buyer_wallet_requests (id, user_id, kind, coin, amount_cents) VALUES (50, 1, 'deposit', 'BTC', 12345);
    INSERT INTO buyer_request_receipts (request_id, content_type, image, wallet_address, network, coin) VALUES (50, 'image/png', X'89504E470D0A1A0A', 'old-wallet', 'Bitcoin', 'BTC');
  `)
  db.close()
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: dbPath, ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-admin-password', SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASSWORD: '', EMAIL_FROM: '' }
  let server
  const request = async (path, { cookie, method = 'GET', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const start = async () => {
    server = spawn(process.execPath, ['dist-server/index.js'], { env, stdio: 'ignore' })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await request('/api/categories'); return } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
    }
    assert.fail('API did not start')
  }
  const stop = async () => {
    server.kill('SIGTERM')
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit')
  }
  try {
    await start()
    const login = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@example.test', password: 'test-admin-password' } })
    assert.equal(login.status, 200)
    const details = await request('/api/admin/users/1/details', { cookie: login.cookie })
    assert.equal(details.data.wallet.balanceCents, 0)
    assert.equal(details.data.balanceResets[0].previousCents, 15000000)
    assert.equal(details.data.requests[0].amountCents, 12345)
    assert.equal(details.data.requests[0].receipts[0].walletAddress, 'old-wallet')
    assert.equal((await request('/api/admin/buyers/1/balance', { cookie: login.cookie, method: 'PATCH', body: { balanceCents: 50000, reason: 'Admin adjustment' } })).status, 200)
    await stop()
    await start()
    const afterRestart = await request('/api/admin/users/1/details', { cookie: login.cookie })
    assert.equal(afterRestart.data.wallet.balanceCents, 50000)
    assert.equal(afterRestart.data.balanceResets.length, 1)
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) await stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('existing account and buyer wallet amounts combine once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'balance-merge-test-'))
  const dbPath = join(directory, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE buyer_wallets (user_id INTEGER PRIMARY KEY REFERENCES users(id), balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0));
    CREATE TABLE reward_balances (user_id INTEGER PRIMARY KEY REFERENCES users(id), balance_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_units >= 0));
    CREATE TABLE schema_migrations (name TEXT PRIMARY KEY);
    INSERT INTO schema_migrations (name) VALUES ('reset_buyer_demo_balances_v1');
    INSERT INTO users (full_name, email, password_hash, role) VALUES ('Buyer', 'buyer@example.test', 'unusable', 'customer'), ('Seller', 'seller@example.test', 'unusable', 'seller');
    INSERT INTO buyer_wallets (user_id, balance_cents) VALUES (1, 1234), (2, 200);
    INSERT INTO reward_balances (user_id, balance_units) VALUES (1, 5600), (2, 3000);
  `)
  db.close()
  const reservation = createServer().listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: dbPath, ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-admin-password', SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASSWORD: '', EMAIL_FROM: '' }
  let server
  const start = async () => {
    server = spawn(process.execPath, ['dist-server/index.js'], { env, stdio: 'ignore' })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await fetch(`http://127.0.0.1:${port}/api/health`); return } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
    }
    assert.fail('API did not start')
  }
  const stop = async () => { server.kill('SIGTERM'); if (server.exitCode === null && server.signalCode === null) await once(server, 'exit') }
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await start()
      const current = new Database(dbPath, { readonly: true })
      assert.equal(current.prepare('SELECT balance_units FROM reward_balances WHERE user_id = 1').get().balance_units, 6834)
      assert.equal(current.prepare('SELECT balance_units FROM reward_balances WHERE user_id = 2').get().balance_units, 3200)
      assert.equal(current.prepare('SELECT SUM(balance_cents) AS total FROM buyer_wallets').get().total, 0)
      current.close()
      await stop()
    }
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) await stop()
    await rm(directory, { recursive: true, force: true })
  }
})
