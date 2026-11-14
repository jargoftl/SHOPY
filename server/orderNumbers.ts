import { randomInt } from 'node:crypto'
import type Database from 'better-sqlite3'

type OrderKind = 'purchase' | 'demo'

export function initializeOrderNumbers(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS order_numbers (
    kind TEXT NOT NULL CHECK(kind IN ('purchase', 'demo')),
    order_id INTEGER NOT NULL,
    number INTEGER NOT NULL UNIQUE CHECK(number BETWEEN 10000000 AND 99999999),
    PRIMARY KEY(kind, order_id)
  )`)
  db.transaction(() => {
    for (const [kind, table] of [['purchase', 'purchase_orders'], ['demo', 'demo_orders']] as const) {
      const missing = db.prepare(`SELECT id FROM ${table} WHERE NOT EXISTS (SELECT 1 FROM order_numbers WHERE kind = ? AND order_id = ${table}.id)`).all(kind) as { id: number }[]
      const numbers = new Map<number, number>()
      for (const order of missing) numbers.set(order.id, allocateOrderNumber(db, kind, order.id))
      if (!numbers.size) continue
      const notifications = db.prepare('SELECT id, title, body FROM notifications WHERE type = ?').all(kind === 'purchase' ? 'purchase' : 'demo_order') as { id: number, title: string, body: string }[]
      const update = db.prepare('UPDATE notifications SET title = ?, body = ? WHERE id = ?')
      for (const notification of notifications) {
        const replace = (value: string) => value.replace(/(order #)(\d+)/gi, (match, prefix: string, id: string) => numbers.has(Number(id)) ? `${prefix}${numbers.get(Number(id))}` : match)
        const title = replace(notification.title)
        const body = replace(notification.body)
        if (title !== notification.title || body !== notification.body) update.run(title, body, notification.id)
      }
    }
  })()
}

export function allocateOrderNumber(db: Database.Database, kind: OrderKind, id: number): number {
  const exists = db.prepare('SELECT 1 FROM order_numbers WHERE number = ?')
  const insert = db.prepare('INSERT INTO order_numbers (kind, order_id, number) VALUES (?, ?, ?)')
  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = randomInt(10000000, 100000000)
    if (!exists.get(number)) {
      insert.run(kind, id, number)
      return number
    }
  }
  throw new Error('Unable to allocate a unique order number.')
}
