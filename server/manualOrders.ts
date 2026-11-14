import type { Express, RequestHandler } from 'express'
import express from 'express'
import type Database from 'better-sqlite3'
import { allocateOrderNumber, initializeOrderNumbers } from './orderNumbers.ts'

const coins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
const text = (value: unknown, max: number): string =>
  typeof value === 'string' && value.trim().length <= max ? value.trim() : ''

export function registerManualOrders(app: Express, db: Database.Database, auth: RequestHandler, role: (...roles: ('customer' | 'seller' | 'admin')[]) => RequestHandler) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_wallets (
      coin TEXT PRIMARY KEY, network TEXT NOT NULL, address TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, buyer_id INTEGER NOT NULL REFERENCES users(id),
      request_key TEXT NOT NULL, coin TEXT NOT NULL, billing_json TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER, tax_cents INTEGER,
      coin_amount TEXT, network TEXT, wallet_address TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_quote' CHECK(status IN ('awaiting_quote','awaiting_receipt','awaiting_review','paid','rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(buyer_id, request_key)
    );
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      seller_id INTEGER NOT NULL REFERENCES users(id), product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL, image_url TEXT NOT NULL, price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL, color TEXT NOT NULL, size TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS purchase_sellers (
      order_id INTEGER NOT NULL REFERENCES purchase_orders(id), seller_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','about_to_send','sent','on_the_way','hold','stalled','delivered')),
      PRIMARY KEY(order_id, seller_id)
    );
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      content_type TEXT NOT NULL, image BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS purchase_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      seller_id INTEGER NOT NULL REFERENCES users(id), buyer_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','completed')),
      transfer_reference TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(order_id, seller_id)
    );
    CREATE TABLE IF NOT EXISTS balance_purchase_history (
      order_id INTEGER PRIMARY KEY REFERENCES purchase_orders(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      balance_after_cents INTEGER NOT NULL CHECK(balance_after_cents >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const sellerSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_sellers'").get() as { sql: string }
  if (!sellerSchema.sql.includes("'about_to_send'")) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE purchase_sellers_new (
          order_id INTEGER NOT NULL REFERENCES purchase_orders(id), seller_id INTEGER NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','about_to_send','sent','on_the_way','hold','stalled','delivered')),
          PRIMARY KEY(order_id, seller_id)
        );
        INSERT INTO purchase_sellers_new SELECT order_id, seller_id, status FROM purchase_sellers;
        DROP TABLE purchase_sellers;
        ALTER TABLE purchase_sellers_new RENAME TO purchase_sellers;
      `)
    })()
  }
  initializeOrderNumbers(db)
  const walletColumns = db.prepare('PRAGMA table_info(payment_wallets)').all() as { name: string }[]
  if (!walletColumns.some((column) => column.name === 'usd_rate')) db.exec('ALTER TABLE payment_wallets ADD COLUMN usd_rate TEXT')
  const orderColumns = db.prepare('PRAGMA table_info(purchase_orders)').all() as { name: string }[]
  if (!orderColumns.some((column) => column.name === 'usd_rate')) db.exec('ALTER TABLE purchase_orders ADD COLUMN usd_rate TEXT')

  const validRate = (rate: string) => /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(rate) && /[1-9]/.test(rate)
  const coinAmount = (cents: number, rate: string) => {
    const [whole, fraction = ''] = rate.split('.')
    const scaledRate = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'))
    const numerator = BigInt(cents) * 100000000000000n
    const units = (numerator + scaledRate - 1n) / scaledRate
    const integer = units / 100000000n
    const decimal = (units % 100000000n).toString().padStart(8, '0').replace(/0+$/, '')
    return decimal ? `${integer}.${decimal}` : integer.toString()
  }

  type Order = { id: number, buyer_id: number, coin: string, billing_json: string, subtotal_cents: number, shipping_cents: number | null, tax_cents: number | null, coin_amount: string | null, network: string | null, wallet_address: string | null, usd_rate: string | null, status: string, created_at: string }
  type Item = { id: number, seller_id: number, product_id: number | null, name: string, image_url: string, price_cents: number, quantity: number, color: string, size: string }
  const orderById = (id: number) => db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as Order | undefined
  const orderNumber = (id: number) => {
    const row = db.prepare("SELECT number FROM order_numbers WHERE kind='purchase' AND order_id=?").get(id) as { number: number } | undefined
    if (!row) throw new Error(`Missing order number for purchase ${id}.`)
    return row.number
  }
  const notify = db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
  const serialize = (order: Order, sellerId?: number) => {
    const items = (db.prepare('SELECT * FROM purchase_items WHERE order_id = ? AND (? IS NULL OR seller_id = ?) ORDER BY id').all(order.id, sellerId ?? null, sellerId ?? null) as Item[])
      .map((item) => ({ id: item.id, sellerId: item.seller_id, productId: item.product_id, name: item.name, imageUrl: item.image_url, priceCents: item.price_cents, quantity: item.quantity, color: item.color, size: item.size }))
    const sellers = db.prepare('SELECT s.seller_id AS sellerId, s.status, COALESCE(p.store_name,u.full_name) AS storeName FROM purchase_sellers s JOIN users u ON u.id=s.seller_id LEFT JOIN seller_profiles p ON p.user_id=s.seller_id WHERE s.order_id=? AND (? IS NULL OR s.seller_id=?)').all(order.id, sellerId ?? null, sellerId ?? null)
    const billing = JSON.parse(order.billing_json) as Record<string, string>
    return {
      id: order.id, orderNumber: orderNumber(order.id), buyerId: order.buyer_id, buyerName: billing.fullName, ...(sellerId === undefined ? { billing } : {}),
      coin: order.coin, status: order.status, subtotalCents: sellerId === undefined ? order.subtotal_cents : items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
      ...(sellerId === undefined ? { shippingCents: order.shipping_cents, taxCents: order.tax_cents, coinAmount: order.coin_amount, network: order.network, walletAddress: order.wallet_address, usdRate: order.usd_rate } : {}),
      createdAt: order.created_at, items, sellers,
      ...(sellerId === undefined ? { receipts: db.prepare('SELECT id, created_at AS createdAt FROM purchase_receipts WHERE order_id=? ORDER BY id').all(order.id) } : {}),
    }
  }
  const validId = (value: string | string[]) => {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : 0
  }
  const refundSelect = `SELECT r.id,r.order_id AS orderId,n.number AS orderNumber,r.seller_id AS sellerId,r.buyer_id AS buyerId,
    r.reason,r.status,r.transfer_reference AS transferReference,r.created_at AS createdAt,
    COALESCE(p.store_name,u.full_name) AS storeName,
    (SELECT GROUP_CONCAT(i.name || ' × ' || i.quantity, ', ') FROM purchase_items i WHERE i.order_id=r.order_id AND i.seller_id=r.seller_id) AS items
    FROM purchase_refunds r JOIN order_numbers n ON n.kind='purchase' AND n.order_id=r.order_id JOIN users u ON u.id=r.seller_id LEFT JOIN seller_profiles p ON p.user_id=r.seller_id`
  app.get('/api/refunds', auth, (req, res) => res.json({ refunds: db.prepare(`${refundSelect} WHERE r.buyer_id=? ORDER BY r.id DESC`).all(req.user!.id) }))
  app.get('/api/seller/refunds', auth, role('seller'), (req, res) => res.json({ refunds: db.prepare(`${refundSelect} WHERE r.seller_id=? ORDER BY r.id DESC`).all(req.user!.id) }))
  app.get('/api/admin/refunds', auth, role('admin'), (_req, res) => res.json({ refunds: db.prepare(`${refundSelect} ORDER BY r.id DESC`).all() }))
  app.post('/api/purchases/:id/refunds', auth, (req, res) => {
    const order = orderById(validId(req.params.id))
    const sellerId = Number(req.body?.sellerId)
    const reason = text(req.body?.reason, 1000)
    if (!order || order.buyer_id !== req.user!.id) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'paid') return res.status(409).json({ error: 'Only confirmed paid orders can be considered for a refund.' })
    if (order.coin === 'BALANCE') return res.status(409).json({ error: 'Contact the administrator to review a store-credit refund for this order.' })
    if (!Number.isSafeInteger(sellerId) || sellerId < 1 || !reason) return res.status(400).json({ error: 'Choose a seller and enter a reason (up to 1,000 characters).' })
    if (!db.prepare('SELECT 1 FROM purchase_sellers WHERE order_id=? AND seller_id=?').get(order.id, sellerId)) return res.status(404).json({ error: 'Seller not found on this order.' })
    if (db.prepare('SELECT 1 FROM purchase_refunds WHERE order_id=? AND seller_id=?').get(order.id, sellerId)) return res.status(409).json({ error: 'A refund request already exists for this seller and order.' })
    db.transaction(() => {
      db.prepare('INSERT INTO purchase_refunds (order_id,seller_id,buyer_id,reason) VALUES (?,?,?,?)').run(order.id, sellerId, order.buyer_id, reason)
      notify.run(sellerId, 'purchase', `Refund requested for order #${orderNumber(order.id)}`, 'A buyer requested a refund for your items.', '/seller/refunds')
      db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Refund requested for order #${orderNumber(order.id)}`, 'The seller needs to review this request.', '/admin#refunds')
    })()
    return res.status(201).json({ ok: true })
  })
  app.patch('/api/seller/refunds/:id', auth, role('seller'), (req, res) => {
    const refund = db.prepare('SELECT * FROM purchase_refunds WHERE id=? AND seller_id=?').get(validId(req.params.id), req.user!.id) as { id: number, order_id: number, buyer_id: number, status: string } | undefined
    if (!refund) return res.status(404).json({ error: 'Refund request not found.' })
    if (refund.status !== 'pending') return res.status(409).json({ error: 'This request has already been reviewed.' })
    if (!['approved', 'rejected'].includes(req.body?.status)) return res.status(400).json({ error: 'Choose approve or reject.' })
    db.transaction(() => {
      db.prepare('UPDATE purchase_refunds SET status=? WHERE id=?').run(req.body.status, refund.id)
      notify.run(refund.buyer_id, 'purchase', `Refund request ${req.body.status}`, 'View your orders for the request status. Approval is not a payment.', '/orders')
      db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Refund request ${req.body.status}`, `Order #${orderNumber(refund.order_id)}: seller review complete.`, '/admin#refunds')
    })()
    return res.json({ ok: true })
  })
  app.patch('/api/admin/refunds/:id/complete', auth, role('admin'), (req, res) => {
    const refund = db.prepare('SELECT * FROM purchase_refunds WHERE id=?').get(validId(req.params.id)) as { id: number, order_id: number, buyer_id: number, seller_id: number, status: string } | undefined
    if (!refund) return res.status(404).json({ error: 'Refund request not found.' })
    if (refund.status !== 'approved') return res.status(409).json({ error: 'The seller must approve this request first.' })
    const reference = text(req.body?.transferReference, 500)
    if (req.body?.verified !== true || !reference) return res.status(400).json({ error: 'Confirm the manual transfer and enter its reference.' })
    db.transaction(() => {
      db.prepare("UPDATE purchase_refunds SET status='completed',transfer_reference=? WHERE id=?").run(reference, refund.id)
      notify.run(refund.buyer_id, 'purchase', `Refund recorded for order #${orderNumber(refund.order_id)}`, 'The administrator recorded a manual refund transfer.', '/orders')
      notify.run(refund.seller_id, 'purchase', `Refund recorded for order #${orderNumber(refund.order_id)}`, 'The administrator recorded a manual refund transfer.', '/seller/refunds')
    })()
    return res.json({ ok: true })
  })
  app.get('/api/admin/payment-wallets', auth, role('admin'), (_req, res) => res.json({ wallets: db.prepare('SELECT coin, network, address, usd_rate AS usdRate FROM payment_wallets ORDER BY coin').all() }))
  app.put('/api/admin/payment-wallets/:coin', auth, role('admin'), (req, res) => {
    const coin = String(req.params.coin)
    const network = text(req.body?.network, 100)
    const address = text(req.body?.address, 500)
    const rate = text(req.body?.usdRate, 30)
    if (!coins.includes(coin) || !network || !address || /[\r\n]/.test(network + address) || !validRate(rate)) return res.status(400).json({ error: 'Enter a supported coin, network, wallet address and positive USD-per-coin rate (up to 8 decimals).' })
    db.prepare('INSERT INTO payment_wallets (coin,network,address,usd_rate) VALUES (?,?,?,?) ON CONFLICT(coin) DO UPDATE SET network=excluded.network,address=excluded.address,usd_rate=excluded.usd_rate').run(coin, network, address, rate)
    return res.json({ ok: true })
  })
  app.get('/api/payment-coins', (_req, res) => {
    const available = db.prepare("SELECT coin FROM payment_wallets WHERE usd_rate IS NOT NULL AND usd_rate != '' ORDER BY coin").all()
    return res.json({ coins: available.map((row) => (row as { coin: string }).coin) })
  })
  app.post('/api/purchases', auth, (req, res) => {
    const { items, billing, coin, requestKey } = req.body ?? {}
    const fields = ['fullName', 'email', 'phone', 'address', 'city', 'region', 'postalCode', 'country']
    const useBalance = coin === 'BALANCE'
    if ((!useBalance && !coins.includes(coin)) || typeof requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestKey) || !Array.isArray(items) || !items.length || items.length > 100 || !billing || !fields.every((field) => text(billing[field], 200))) return res.status(400).json({ error: 'Enter valid billing details, products and a supported payment method.' })
    if (useBalance && !['customer', 'seller'].includes(req.user!.role)) return res.status(403).json({ error: 'Account balance is available to buyers and sellers.' })
    const existing = db.prepare('SELECT id FROM purchase_orders WHERE buyer_id=? AND request_key=?').get(req.user!.id, requestKey) as { id: number } | undefined
    if (existing) return res.json({ id: existing.id, buyerId: req.user!.id })
    const wallet = useBalance ? undefined : db.prepare('SELECT network,address,usd_rate FROM payment_wallets WHERE coin=?').get(coin) as { network: string, address: string, usd_rate: string | null } | undefined
    if (!useBalance && (!wallet?.usd_rate || !validRate(wallet.usd_rate))) return res.status(409).json({ error: 'This coin is not configured for payment yet. Choose another coin or contact the administrator.' })
    const snapshots: { product: { id: number, seller_id: number, name: string, image_url: string, price: number }, quantity: number, color: string, size: string }[] = []
    for (const item of items) {
      if (!item || !Number.isSafeInteger(item.id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 || typeof item.selectedColor !== 'string' || item.selectedColor.length > 100 || typeof item.selectedSize !== 'string' || item.selectedSize.length > 100) return res.status(400).json({ error: 'Invalid order item.' })
      const product = db.prepare('SELECT id, seller_id, name, image_url, price FROM products WHERE id=? AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0) AND (is_published=1 OR is_store_published=1)').get(item.id) as { id: number, seller_id: number, name: string, image_url: string, price: number } | undefined
      if (!product) return res.status(400).json({ error: 'A product is no longer available.' })
      snapshots.push({ product, quantity: item.quantity, color: item.selectedColor, size: item.selectedSize })
    }
    const subtotal = snapshots.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0)
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > 100000000) return res.status(400).json({ error: 'Order subtotal must be positive and within the supported amount.' })
    if (useBalance && (!Number.isSafeInteger(req.body.expectedTotalCents) || req.body.expectedTotalCents !== subtotal + Math.floor(subtotal * 3 / 100))) return res.status(409).json({ error: 'The order total changed. Review your cart before paying with your balance.' })
    const purchase = db.transaction(() => {
      const previous = db.prepare('SELECT id FROM purchase_orders WHERE buyer_id=? AND request_key=?').get(req.user!.id, requestKey) as { id: number } | undefined
      if (previous) return { id: previous.id, created: false }
      const tax = Math.floor(subtotal * 3 / 100)
      const total = subtotal + tax
      if (useBalance) {
        const debit = db.prepare('UPDATE reward_balances SET balance_units = balance_units - ? WHERE user_id = ? AND balance_units >= ?').run(total, req.user!.id, total)
        if (!debit.changes) return null
      }
      const result = db.prepare('INSERT INTO purchase_orders (buyer_id,request_key,coin,billing_json,subtotal_cents,shipping_cents,tax_cents,coin_amount,network,wallet_address,usd_rate,status) VALUES (?,?,?,?,?,0,?,?,?,?,?,?)').run(req.user!.id, requestKey, coin, JSON.stringify(Object.fromEntries(fields.map((field) => [field, text(billing[field], 200)]))), subtotal, tax, useBalance ? null : coinAmount(total, wallet!.usd_rate!), wallet?.network ?? null, wallet?.address ?? null, wallet?.usd_rate ?? null, useBalance ? 'paid' : 'awaiting_receipt')
      const orderId = Number(result.lastInsertRowid)
      const number = allocateOrderNumber(db, 'purchase', orderId)
      if (useBalance) {
        const balance = db.prepare('SELECT balance_units FROM reward_balances WHERE user_id = ?').get(req.user!.id) as { balance_units: number }
        db.prepare('INSERT INTO balance_purchase_history (order_id,user_id,amount_cents,balance_after_cents) VALUES (?,?,?,?)').run(orderId, req.user!.id, total, balance.balance_units)
        notify.run(req.user!.id, 'purchase', `Order #${number} paid from balance`, 'Your store-credit balance was used for this order.', `/purchase/${orderId}`)
      }
      const insert = db.prepare('INSERT INTO purchase_items (order_id,seller_id,product_id,name,image_url,price_cents,quantity,color,size) VALUES (?,?,?,?,?,?,?,?,?)')
      const seller = db.prepare('INSERT OR IGNORE INTO purchase_sellers (order_id,seller_id) VALUES (?,?)')
      for (const item of snapshots) { insert.run(orderId, item.product.seller_id, item.product.id, item.product.name, item.product.image_url, Math.round(item.product.price * 100), item.quantity, item.color, item.size); seller.run(orderId, item.product.seller_id) }
      for (const sellerId of new Set(snapshots.map((item) => item.product.seller_id))) {
        notify.run(sellerId, 'purchase', `New order #${number}`, useBalance ? 'Paid using store credit. No external payment or payout was processed.' : 'Payment is pending confirmation. Do not fulfill until the administrator confirms payment.', `/seller/orders?order=${number}`)
      }
      db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Order #${number} created`, useBalance ? `${req.user!.full_name} paid using store credit; no external payment was processed.` : `${req.user!.full_name} selected ${coin}.`, `/admin?order=${number}#purchase-orders`)
      return { id: orderId, created: true }
    })()
    if (!purchase) return res.status(409).json({ error: 'Insufficient account balance for this order.' })
    return res.status(purchase.created ? 201 : 200).json({ id: purchase.id, buyerId: req.user!.id })
  })
  app.get('/api/purchases', auth, (req, res) => {
    const orders = db.prepare('SELECT * FROM purchase_orders WHERE buyer_id=? ORDER BY id DESC').all(req.user!.id) as Order[]
    return res.json({ orders: orders.map((order) => serialize(order)) })
  })
  app.get('/api/purchases/:id', auth, (req, res) => {
    const order = orderById(validId(req.params.id))
    if (!order || order.buyer_id !== req.user!.id) return res.status(404).json({ error: 'Order not found.' })
    return res.json({ order: serialize(order) })
  })
  app.get('/api/admin/purchases', auth, role('admin'), (_req, res) => {
    const orders = db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all() as Order[]
    return res.json({ orders: orders.map((order) => serialize(order)) })
  })
  app.put('/api/admin/purchases/:id/quote', auth, role('admin'), (req, res) => {
    const order = orderById(validId(req.params.id))
    if (!order) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'awaiting_quote') return res.status(409).json({ error: 'This order has already been quoted.' })
    const { shippingCents, taxCents } = req.body ?? {}
    const amount = text(req.body?.coinAmount, 40)
    const wallet = db.prepare('SELECT network,address FROM payment_wallets WHERE coin=?').get(order.coin) as { network: string, address: string } | undefined
    if (!wallet) return res.status(400).json({ error: 'Set a wallet for this coin first.' })
    if (shippingCents !== 0 || !Number.isSafeInteger(taxCents) || taxCents < 0 || taxCents > Math.floor(order.subtotal_cents * 3 / 100) || !/^\d{1,20}(\.\d{1,18})?$/.test(amount) || !/[1-9]/.test(amount)) return res.status(400).json({ error: 'Shipping must be zero and tax must not exceed 3% of the subtotal. Enter a positive coin amount.' })
    db.transaction(() => {
      db.prepare("UPDATE purchase_orders SET shipping_cents=?,tax_cents=?,coin_amount=?,network=?,wallet_address=?,status='awaiting_receipt' WHERE id=?").run(shippingCents, taxCents, amount, wallet.network, wallet.address, order.id)
      notify.run(order.buyer_id, 'purchase', `Payment details for order #${orderNumber(order.id)}`, 'Your payment quote and wallet are ready.', `/purchase/${order.id}`)
    })()
    return res.json({ ok: true })
  })
  app.post('/api/purchases/:id/receipt', auth, express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), (req, res) => {
    const order = orderById(validId(req.params.id))
    if (!order || order.buyer_id !== req.user!.id) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'awaiting_receipt') return res.status(409).json({ error: 'This order is not awaiting a receipt.' })
    const image = req.body
    const png = Buffer.isBuffer(image) && image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    const jpeg = Buffer.isBuffer(image) && image.length >= 3 && image[0] === 255 && image[1] === 216 && image[2] === 255
    if ((!png && !jpeg) || (png && !req.is('image/png')) || (jpeg && !req.is('image/jpeg'))) return res.status(400).json({ error: 'Upload a PNG or JPEG screenshot up to 2 MB.' })
    db.transaction(() => {
      db.prepare('INSERT INTO purchase_receipts (order_id,content_type,image) VALUES (?,?,?)').run(order.id, png ? 'image/png' : 'image/jpeg', image)
      db.prepare("UPDATE purchase_orders SET status='awaiting_review' WHERE id=?").run(order.id)
      notify.run(order.buyer_id, 'purchase', `Order #${orderNumber(order.id)} payment pending`, 'Your screenshot was submitted. The administrator must verify the transfer before confirming payment.', `/purchase/${order.id}`)
      const sellers = db.prepare('SELECT seller_id FROM purchase_sellers WHERE order_id=?').all(order.id) as { seller_id: number }[]
      for (const seller of sellers) notify.run(seller.seller_id, 'purchase', `Order #${orderNumber(order.id)} payment under review`, 'A receipt was submitted. Payment is not yet confirmed.', `/seller/orders?order=${orderNumber(order.id)}`)
      db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Order #${orderNumber(order.id)} receipt submitted`, 'Verify the transfer independently before confirming.', `/admin?order=${orderNumber(order.id)}#purchase-orders`)
    })()
    return res.status(201).json({ ok: true })
  })
  app.get('/api/admin/purchase-receipts/:id', auth, role('admin'), (req, res) => {
    const receipt = db.prepare('SELECT image,content_type FROM purchase_receipts WHERE id=?').get(validId(req.params.id)) as { image: Buffer, content_type: string } | undefined
    if (!receipt) return res.status(404).json({ error: 'Receipt not found.' })
    res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff').set('Content-Disposition', `inline; filename="receipt.${receipt.content_type === 'image/png' ? 'png' : 'jpg'}"`)
    return res.type(receipt.content_type).send(receipt.image)
  })
  app.patch('/api/admin/purchases/:id/payment', auth, role('admin'), (req, res) => {
    const order = orderById(validId(req.params.id))
    if (!order) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'awaiting_review') return res.status(409).json({ error: 'A receipt must be submitted before review.' })
    if (!['paid', 'rejected'].includes(req.body?.status) || (req.body.status === 'paid' && req.body.verified !== true)) return res.status(400).json({ error: 'Independently verify the payment before confirming it.' })
    db.transaction(() => {
      db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(req.body.status, order.id)
      notify.run(order.buyer_id, 'purchase', `Order #${orderNumber(order.id)} payment ${req.body.status === 'paid' ? 'confirmed' : 'declined'}`, req.body.status === 'paid' ? 'Your payment was confirmed. The seller can now prepare your order.' : 'Your payment was not confirmed. View your order and contact the administrator.', `/purchase/${order.id}`)
      const sellers = db.prepare('SELECT seller_id FROM purchase_sellers WHERE order_id=?').all(order.id) as { seller_id: number }[]
      for (const seller of sellers) notify.run(seller.seller_id, 'purchase', `Order #${orderNumber(order.id)} payment ${req.body.status === 'paid' ? 'confirmed' : 'declined'}`, req.body.status === 'paid' ? 'The administrator confirmed payment. Fulfillment is pending.' : 'Payment was declined. Do not fulfill this order.', `/seller/orders?order=${orderNumber(order.id)}`)
    })()
    return res.json({ ok: true })
  })
  app.get('/api/seller/purchases', auth, role('seller'), (req, res) => {
    const orders = db.prepare('SELECT o.* FROM purchase_orders o JOIN purchase_sellers s ON s.order_id=o.id WHERE s.seller_id=? ORDER BY o.id DESC').all(req.user!.id) as Order[]
    return res.json({ orders: orders.map((order) => serialize(order, req.user!.id)) })
  })
  app.patch('/api/purchase-sellers/:orderId/:sellerId', auth, role('seller', 'admin'), (req, res) => {
    const orderId = validId(req.params.orderId), sellerId = validId(req.params.sellerId)
    if (req.user!.role === 'seller' && sellerId !== req.user!.id) return res.status(403).json({ error: 'You can only update your own orders.' })
    const order = orderById(orderId)
    const existing = db.prepare('SELECT status FROM purchase_sellers WHERE order_id=? AND seller_id=?').get(orderId, sellerId) as { status: string } | undefined
    if (!order || !existing) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'paid') return res.status(409).json({ error: 'Payment must be confirmed first.' })
    if (!['pending','confirmed','about_to_send','sent','on_the_way','hold','stalled','delivered'].includes(req.body?.status)) return res.status(400).json({ error: 'Invalid status.' })
    if (existing.status !== req.body.status) db.transaction(() => {
      db.prepare('UPDATE purchase_sellers SET status=? WHERE order_id=? AND seller_id=?').run(req.body.status, orderId, sellerId)
      const progressMessages: Record<string, string> = {
        pending: 'Your order is pending fulfillment.',
        confirmed: 'Your order has been confirmed for fulfillment.',
        about_to_send: 'Your order is about to be sent out.',
        sent: 'Your order has been marked as sent.',
        on_the_way: 'Your order is on the way, according to the seller or administrator.',
        hold: 'Your order is on hold. Contact the administrator for details.',
        stalled: 'Your order has been delayed. Contact the administrator for details.',
        delivered: 'Your order has been marked delivered by the seller or administrator.',
      }
      notify.run(order.buyer_id, 'purchase', `Order #${orderNumber(orderId)} updated`, progressMessages[String(req.body.status)], `/purchase/${orderId}`)
      notify.run(sellerId, 'purchase', `Order #${orderNumber(orderId)} ${req.body.status === 'delivered' ? 'marked delivered' : 'fulfillment updated'}`, `Fulfillment status: ${String(req.body.status).replaceAll('_', ' ')}.`, `/seller/orders?order=${orderNumber(orderId)}`)
    })()
    return res.json({ ok: true })
  })
}
