import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { allocateOrderNumber, initializeOrderNumbers } from '../dist-server/orderNumbers.js'

test('existing purchase and test orders get stable, unique eight-digit numbers', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE purchase_orders (id INTEGER PRIMARY KEY);
      CREATE TABLE demo_orders (id INTEGER PRIMARY KEY);
      CREATE TABLE notifications (id INTEGER PRIMARY KEY, type TEXT, title TEXT, body TEXT);
      INSERT INTO purchase_orders VALUES (1), (2);
      INSERT INTO demo_orders VALUES (1);
      INSERT INTO notifications VALUES (1, 'purchase', 'Order #1 created', 'Order #2: seller review complete.');
      INSERT INTO notifications VALUES (2, 'demo_order', 'Test order #1 updated', 'Status changed.');
    `)
    initializeOrderNumbers(db)
    const rows = db.prepare('SELECT kind, order_id, number FROM order_numbers ORDER BY kind, order_id').all()
    assert.equal(rows.length, 3)
    assert.equal(new Set(rows.map((row) => row.number)).size, 3)
    for (const row of rows) assert.match(String(row.number), /^[1-9]\d{7}$/)
    const purchaseOne = rows.find((row) => row.kind === 'purchase' && row.order_id === 1).number
    const purchaseTwo = rows.find((row) => row.kind === 'purchase' && row.order_id === 2).number
    const demoOne = rows.find((row) => row.kind === 'demo').number
    assert.deepEqual(db.prepare('SELECT title, body FROM notifications WHERE id=1').get(), { title: `Order #${purchaseOne} created`, body: `Order #${purchaseTwo}: seller review complete.` })
    assert.equal(db.prepare('SELECT title FROM notifications WHERE id=2').get().title, `Test order #${demoOne} updated`)
    initializeOrderNumbers(db)
    assert.deepEqual(db.prepare('SELECT kind, order_id, number FROM order_numbers ORDER BY kind, order_id').all(), rows)
    const fresh = allocateOrderNumber(db, 'purchase', 3)
    assert.match(String(fresh), /^[1-9]\d{7}$/)
    assert.ok(!rows.some((row) => row.number === fresh))
    assert.throws(() => db.prepare("INSERT INTO order_numbers VALUES ('purchase', 4, ?)").run(fresh))
  } finally { db.close() }
})
