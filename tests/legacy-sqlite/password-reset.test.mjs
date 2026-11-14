import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import Database from 'better-sqlite3'

test('login and one-time password recovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ggu-reset-test-'))
  const emails = []
  const sockets = new Set()
  const smtp = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.write('220 localhost test SMTP\r\n')
    let buffer = ''
    let data = null
    let authStep = 0
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n')
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (data !== null) {
          if (line === '.') { emails.push(data); data = null; socket.write('250 queued\r\n') } else data += `${line}\n`
        } else if (authStep === 1) { authStep = 2; socket.write('334 UGFzc3dvcmQ6\r\n') }
        else if (authStep === 2) { authStep = 0; socket.write('235 authenticated\r\n') }
        else if (/^EHLO/i.test(line)) socket.write('250-localhost\r\n250 AUTH LOGIN PLAIN\r\n')
        else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; socket.write('334 VXNlcm5hbWU6\r\n') }
        else if (/^AUTH PLAIN/i.test(line)) socket.write('235 authenticated\r\n')
        else if (/^DATA/i.test(line)) { data = ''; socket.write('354 send data\r\n') }
        else if (/^QUIT/i.test(line)) { socket.end('221 bye\r\n') }
        else socket.write('250 ok\r\n')
      }
    })
  })
  smtp.listen(0, '127.0.0.1')
  await once(smtp, 'listening')
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const server = spawn(process.execPath, ['dist-server/index.js'], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: join(directory, 'test.db'), ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-admin-password', APP_URL: 'http://localhost:5173', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_SECURE: 'false', SMTP_USER: 'test', SMTP_PASSWORD: 'test', EMAIL_FROM: 'store@example.test', NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    stdio: 'ignore',
  })
  const request = async (path, { cookie, method = 'GET', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await request('/api/categories'); ready = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
    }
    assert.ok(ready, 'API did not start')
    const registration = await request('/api/auth/register', { method: 'POST', body: { fullName: 'Test Buyer', email: 'buyer@example.test', password: 'old-password' } })
    assert.equal(registration.status, 201)
    const wrong = await request('/api/auth/login', { method: 'POST', body: { email: 'buyer@example.test', password: 'incorrect' } })
    assert.equal(wrong.status, 401)
    assert.match(wrong.data.error, /email or password/i)
    assert.equal((await request('/api/auth/forgot-password', { method: 'POST', body: { email: 'missing@example.test' } })).status, 200)
    const resetRequest = await request('/api/auth/forgot-password', { method: 'POST', body: { email: 'buyer@example.test' } })
    assert.equal(resetRequest.status, 200)
    assert.deepEqual(resetRequest.data, { ok: true })
    const email = emails.map((item) => item.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))).findLast((item) => item.includes('/reset-password#'))
    assert.ok(email, 'reset email was not sent')
    const expiredToken = email.match(/reset-password#([a-f0-9]{64})/)[1]
    const database = new Database(join(directory, 'test.db'))
    database.prepare("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z'").run()
    database.close()
    assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: { token: expiredToken, password: 'new-password' } })).status, 400)
    assert.equal((await request('/api/auth/forgot-password', { method: 'POST', body: { email: 'buyer@example.test' } })).status, 200)
    const latestEmail = emails.map((item) => item.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))).findLast((item) => item.includes('/reset-password#'))
    const token = latestEmail.match(/reset-password#([a-f0-9]{64})/)[1]
    assert.notEqual(token, expiredToken)
    assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: { token, password: 'short' } })).status, 400)
    assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: { token, password: 'new-password' } })).status, 200)
    assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: { token, password: 'new-password' } })).status, 400)
    assert.equal((await request('/api/auth/me', { cookie: registration.cookie })).status, 401)
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'buyer@example.test', password: 'old-password' } })).status, 401)
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'buyer@example.test', password: 'new-password' } })).status, 200)
  } finally {
    server.kill('SIGTERM')
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit')
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => smtp.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
