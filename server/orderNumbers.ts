import { randomInt } from 'node:crypto'
import type { Database } from './database.ts'

type OrderKind = 'purchase' | 'demo'

export async function initializeOrderNumbers(db: Database) {
  await db.transaction(async () => {
    for (const [kind, table] of [['purchase', 'purchase_orders'], ['demo', 'demo_orders']] as const) {
      const missing = (await db.prepare(`SELECT id FROM ${table} WHERE NOT EXISTS (SELECT 1 FROM order_numbers WHERE kind = ? AND order_id = ${table}.id)`).all(kind)) as { id: number }[]
      const numbers = new Map<number, number>()
      for (const order of missing) numbers.set(order.id, (await allocateOrderNumber(db, kind, order.id)))
      if (!numbers.size) continue
      const notifications = (await db.prepare('SELECT id, title, body FROM notifications WHERE type = ?').all(kind === 'purchase' ? 'purchase' : 'demo_order')) as { id: number, title: string, body: string }[]
      const update = db.prepare('UPDATE notifications SET title = ?, body = ? WHERE id = ?')
      for (const notification of notifications) {
        const replace = (value: string) => value.replace(/(order #)(\d+)/gi, (match, prefix: string, id: string) => numbers.has(Number(id)) ? `${prefix}${numbers.get(Number(id))}` : match)
        const title = replace(notification.title)
        const body = replace(notification.body)
        if (title !== notification.title || body !== notification.body) await update.run(title, body, notification.id)
      }
    }
  })()
}

export async function allocateOrderNumber(db: Database, kind: OrderKind, id: number): Promise<number> {
  const exists = db.prepare('SELECT 1 FROM order_numbers WHERE number = ?')
  const insert = db.prepare('INSERT INTO order_numbers (kind, order_id, number) VALUES (?, ?, ?)')
  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = randomInt(10000000, 100000000)
    if (!(await exists.get(number))) {
      await insert.run(kind, id, number)
      return number
    }
  }
  throw new Error('Unable to allocate a unique order number.')
}
