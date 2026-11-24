import {queueDeliveryEmail,kickDeliveryEmailWorker} from './deliveryEmails.ts'
import type { Express, RequestHandler } from 'express'
import express from 'express'
import {recordShipmentEvent,registerShipmentTracking} from './shipmentTracking.ts'
import { postSellerFunds, reverseSellerRelease, sellerPaymentCoins } from './sellerFinance.ts'
import type { Database } from './database.ts'
import { ObjectStorage } from './storage.ts'
import { allocateOrderNumber, initializeOrderNumbers } from './orderNumbers.ts'

const coins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
const text = (value: unknown, max: number): string =>
  typeof value === 'string' && value.trim().length <= max ? value.trim() : ''

function matchesScreenshot(image: Buffer, type: unknown): type is 'image/png' | 'image/jpeg' {
  if (type === 'image/png') return image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  return type === 'image/jpeg' && image[0] === 255 && image[1] === 216 && image[2] === 255
}

async function initialUsdRate(coin: string): Promise<string> {
  const signal = AbortSignal.timeout(5000)
  let usd: number
  if (coin === 'TRX') {
    const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=TRXUSD', { signal })
    if (!response.ok) return ''
    const data = await response.json() as { result?: { TRXUSD?: { c?: string[] } } }
    usd = Number(data.result?.TRXUSD?.c?.[0])
  } else {
    const response = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD', { signal })
    if (!response.ok) return ''
    const data = await response.json() as { data?: { rates?: Record<string, string> } }
    usd = 1 / Number(data.data?.rates?.[coin])
  }
  return Number.isFinite(usd) && usd > 0 ? usd.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') : ''
}

export async function registerManualOrders(app: Express, db: Database, auth: RequestHandler, role: (...roles: ('customer' | 'seller' | 'admin')[]) => RequestHandler) {
  await initializeOrderNumbers(db)
  registerShipmentTracking(app,db,auth)
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

  type Order = { account_balance_payment:number, id: number, buyer_id: number, coin: string, billing_json: string, subtotal_cents: number, shipping_cents: number | null, tax_cents: number | null, coin_amount: string | null, network: string | null, wallet_address: string | null, usd_rate: string | null, status: string, created_at: string }
  type Item = { id: number, seller_id: number, product_id: number | null, name: string, image_url: string, price_cents: number, quantity: number, color: string, size: string }
  const orderById = async (id: number) => (await db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id)) as Order | undefined
  const orderNumber = async (id: number) => {
    const row = (await db.prepare("SELECT number FROM order_numbers WHERE kind='purchase' AND order_id=?").get(id)) as { number: number } | undefined
    if (!row) throw new Error(`Missing order number for purchase ${id}.`)
    return row.number
  }
  const notify = db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
  const serialize = async (order: Order, sellerId?: number) => {
    const items = ((await db.prepare('SELECT * FROM purchase_items WHERE order_id = ? AND (? IS NULL OR seller_id = ?) ORDER BY id').all(order.id, sellerId ?? null, sellerId ?? null)) as Item[])
      .map((item) => ({ id: item.id, sellerId: item.seller_id, productId: item.product_id, name: item.name, imageUrl: item.image_url, priceCents: item.price_cents, quantity: item.quantity, color: item.color, size: item.size }))
    const sellers = (await db.prepare('SELECT s.seller_id AS sellerId, s.status,s.tracking_code AS trackingNumber,s.tracking_number AS carrierTrackingNumber,s.carrier,e.status AS deliveryEmailStatus,e.sent_at AS deliveryEmailSentAt,s.tracking_assigned_at AS trackingAssignedAt,(SELECT status FROM seller_sale_releases r WHERE r.order_id=s.order_id AND r.seller_id=s.seller_id) AS releaseStatus, (SELECT created_at FROM seller_sale_releases r WHERE r.order_id=s.order_id AND r.seller_id=s.seller_id) AS confirmedAt, COALESCE(p.store_name,u.full_name) AS storeName FROM purchase_sellers s JOIN users u ON u.id=s.seller_id LEFT JOIN seller_profiles p ON p.user_id=s.seller_id LEFT JOIN seller_delivery_emails e ON e.order_id=s.order_id AND e.seller_id=s.seller_id WHERE s.order_id=? AND (? IS NULL OR s.seller_id=?)').all(order.id, sellerId ?? null, sellerId ?? null))
    const billing = JSON.parse(order.billing_json) as Record<string, string>
    const savedContact = sellerId === undefined ? undefined : await db.prepare(
      'SELECT seller_contact_json FROM purchase_sellers WHERE order_id=? AND seller_id=?',
    ).get(order.id,sellerId) as {seller_contact_json:string}|undefined
    const sellerContact = savedContact ? JSON.parse(savedContact.seller_contact_json) : undefined
    const email = typeof billing.email === 'string' ? /^([^@])[^@]*@([^@]+)$/.exec(billing.email) : null
    const maskedEmail = email ? `${email[1]}***@${email[2]}` : null
    return {
      id: order.id, orderNumber: (await orderNumber(order.id)), buyerId: order.buyer_id, buyerName: billing.fullName, ...(sellerId === undefined ? { billing } : { maskedEmail, sellerContact }),
      coin: order.coin, status: order.status, accountBalancePayment:Boolean(order.account_balance_payment), subtotalCents: sellerId === undefined ? order.subtotal_cents : items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
      ...(sellerId === undefined ? { shippingCents: order.shipping_cents, taxCents: order.tax_cents, coinAmount: order.coin_amount, network: order.network, walletAddress: order.wallet_address, usdRate: order.usd_rate } : {}),
      createdAt: order.created_at, items, sellers,
      ...(sellerId === undefined ? { receipts: (await db.prepare('SELECT id, created_at AS createdAt FROM purchase_receipts WHERE order_id=? ORDER BY id').all(order.id)) } : {}),
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
  app.get('/api/refunds', auth, async (req, res) => res.json({ refunds: (await db.prepare(`${refundSelect} WHERE r.buyer_id=? ORDER BY r.id DESC`).all(req.user!.id)) }))
  app.get('/api/seller/refunds', auth, role('seller'), async (req, res) => res.json({ refunds: (await db.prepare(`${refundSelect} WHERE r.seller_id=? ORDER BY r.id DESC`).all(req.user!.id)) }))
  app.get('/api/admin/refunds', auth, role('admin'), async (_req, res) => res.json({ refunds: (await db.prepare(`${refundSelect} ORDER BY r.id DESC`).all()) }))
  app.post('/api/purchases/:id/refunds', auth, async (req, res) => {
    const order = (await orderById(validId(req.params.id)))
    const sellerId = Number(req.body?.sellerId)
    const reason = text(req.body?.reason, 1000) || 'Refund requested'
    if (!order || order.buyer_id !== req.user!.id) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'paid') return res.status(409).json({ error: 'Only confirmed paid orders can be considered for a refund.' })
    if (order.coin === 'BALANCE') return res.status(409).json({ error: 'Contact the administrator to review a store-credit refund for this order.' })
    if (!Number.isSafeInteger(sellerId) || sellerId < 1 || !reason) return res.status(400).json({ error: 'Choose a seller and enter a reason (up to 1,000 characters).' })
    if (!(await db.prepare('SELECT 1 FROM purchase_sellers WHERE order_id=? AND seller_id=?').get(order.id, sellerId))) return res.status(404).json({ error: 'Seller not found on this order.' })
    if ((await db.prepare('SELECT 1 FROM purchase_refunds WHERE order_id=? AND seller_id=?').get(order.id, sellerId))) return res.status(409).json({ error: 'A refund request already exists for this seller and order.' })
    await db.transaction(async () => {
      await db.prepare('INSERT INTO purchase_refunds (order_id,seller_id,buyer_id,reason) VALUES (?,?,?,?)').run(order.id, sellerId, order.buyer_id, reason)
      await notify.run(sellerId, 'purchase', `Refund requested for order #${(await orderNumber(order.id))}`, 'A buyer requested a refund for your items.', '/seller/refunds')
      await db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Refund requested for order #${(await orderNumber(order.id))}`, 'The seller needs to review this request.', '/admin#refunds')
    })()
    return res.status(201).json({ ok: true })
  })
  app.patch('/api/seller/refunds/:id', auth, role('seller'), async (req, res) => {
    const refund = (await db.prepare('SELECT * FROM purchase_refunds WHERE id=? AND seller_id=?').get(validId(req.params.id), req.user!.id)) as { id: number, order_id: number, buyer_id: number, status: string } | undefined
    if (!refund) return res.status(404).json({ error: 'Refund request not found.' })
    if (refund.status !== 'pending') return res.status(409).json({ error: 'This request has already been reviewed.' })
    if (!['approved', 'rejected'].includes(req.body?.status)) return res.status(400).json({ error: 'Choose approve or reject.' })
    await db.transaction(async () => {
      await db.prepare('UPDATE purchase_refunds SET status=? WHERE id=?').run(req.body.status, refund.id)
      await notify.run(refund.buyer_id, 'purchase', `Refund request ${req.body.status}`, 'View your orders for the request status. Approval is not a payment.', '/orders')
      await db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Refund request ${req.body.status}`, `Order #${(await orderNumber(refund.order_id))}: seller review complete.`, '/admin#refunds')
    })()
    return res.json({ ok: true })
  })
  app.patch('/api/admin/refunds/:id/complete', auth, role('admin'), async (req, res) => {
    const refund = (await db.prepare('SELECT * FROM purchase_refunds WHERE id=?').get(validId(req.params.id))) as { id: number, order_id: number, buyer_id: number, seller_id: number, status: string } | undefined
    if (!refund) return res.status(404).json({ error: 'Refund request not found.' })
    if (refund.status !== 'approved') return res.status(409).json({ error: 'The seller must approve this request first.' })
    const reference = text(req.body?.transferReference, 500)
    if (req.body?.verified !== true || !reference) return res.status(400).json({ error: 'Confirm the manual transfer and enter its reference.' })
    await db.transaction(async () => {
      const latest=await db.prepare('SELECT status FROM purchase_refunds WHERE id=?').get(refund.id) as {status:string}
      if(latest.status!=='approved') throw Object.assign(new Error('Refund has already been processed.'),{status:409})
      await reverseSellerRelease(db, refund.order_id, refund.seller_id, req.user!.id)
      await db.prepare("UPDATE purchase_refunds SET status='completed',transfer_reference=? WHERE id=?").run(reference, refund.id)
      await notify.run(refund.buyer_id, 'purchase', `Refund recorded for order #${(await orderNumber(refund.order_id))}`, 'The administrator recorded a manual refund transfer.', '/orders')
      await notify.run(refund.seller_id, 'purchase', `Refund recorded for order #${(await orderNumber(refund.order_id))}`, 'The administrator recorded a manual refund transfer.', '/seller/refunds')
    })()
    return res.json({ ok: true })
  })
  const walletStorage = new ObjectStorage()
  app.get('/api/admin/payment-wallets', auth, role('admin'), async (_req, res) => {
    const wallets = await db.prepare('SELECT coin, network, address, usd_rate AS usdRate, qr_image IS NOT NULL AS hasQr FROM payment_wallets ORDER BY coin').all()
    const networkWallets = await db.prepare('SELECT coin, network, address, usd_rate AS usdRate, qr_image IS NOT NULL AS hasQr FROM seller_payment_networks ORDER BY coin,network').all()
    res.set('Cache-Control', 'no-store').json({ wallets, networkWallets })
  })
  app.get('/api/admin/payment-wallets/:coin/qr', auth, role('admin'), async (req, res) => {
    const network = text(req.query.network, 100)
    const wallet = (network
      ? await db.prepare('SELECT qr_image, qr_content_type FROM seller_payment_networks WHERE coin=? AND lower(network)=lower(?)').get(req.params.coin, network)
      : await db.prepare('SELECT qr_image, qr_content_type FROM payment_wallets WHERE coin=?').get(req.params.coin)) as { qr_image: string | null, qr_content_type: string | null } | undefined
    if (!wallet?.qr_image || !wallet.qr_content_type) return res.status(404).json({ error: 'No QR screenshot is saved for this wallet.' })
    const image = await walletStorage.get(wallet.qr_image)
    return res.set('Cache-Control', 'no-store').type(wallet.qr_content_type).send(image)
  })
  app.put('/api/admin/payment-wallets/:coin', auth, role('admin'), async (req, res) => {
    const coin = String(req.params.coin)
    const network = text(req.body?.network, 100)
    const address = text(req.body?.address, 500)
    const explicitRate = req.body?.usdRate !== undefined
    let rate = text(req.body?.usdRate, 30)
    const additional = req.body?.sellerNetwork === true
    const originalNetwork = text(req.body?.originalNetwork, 100)
    const originalCoin = req.body?.originalCoin===undefined?coin:text(req.body.originalCoin, 10)
    const originalAdditional = req.body?.originalSellerNetwork===undefined?additional:req.body.originalSellerNetwork===true
    if(originalNetwork&&!sellerPaymentCoins.includes(originalCoin))return res.status(400).json({error:'Invalid original wallet coin.'})
    if (!(additional?sellerPaymentCoins:coins).includes(coin) || !network || !address || /[\r\n]/.test(network + address) || (explicitRate&&!validRate(rate))) return res.status(400).json({ error: 'Enter a supported coin, network and wallet address. Any supplied rate must be positive with up to 8 decimals.' })
    if (!explicitRate) {
      const savedRates = await db.prepare(`
        SELECT usd_rate, 0 AS priority, network FROM payment_wallets WHERE coin=?
        UNION ALL
        SELECT usd_rate, 1 AS priority, network FROM seller_payment_networks WHERE coin=?
        ORDER BY priority, network
      `).all(coin, coin) as Array<{usd_rate: string | null, network: string}>
      const saved = savedRates.find(row => row.network.toLowerCase()===network.toLowerCase()&&validRate(row.usd_rate||''))
        || savedRates.find(row => validRate(row.usd_rate||''))
      rate = saved?.usd_rate || await initialUsdRate(coin).catch(() => '')
      if (!validRate(rate)) return res.status(503).json({error:'The USD rate for this coin is temporarily unavailable. Try saving this wallet again shortly.'})
    }
    const removeQr = req.body?.removeQr === true
    if (removeQr && req.body?.qr !== undefined) return res.status(400).json({error:'Choose either a replacement QR image or removal.'})
    let qrPath: string | null = null
    let qrType: string | null = null
    if (req.body?.qr !== undefined) {
      const { type, data } = req.body.qr ?? {}
      const image = typeof data === 'string' && data.length <= 2796204
        ? Buffer.from(data, 'base64') : Buffer.alloc(0)
      if (image.length > 2 * 1024 * 1024 || !matchesScreenshot(image, type)) {
        return res.status(400).json({ error: 'Upload a PNG or JPEG QR screenshot up to 2 MB.' })
      }
      qrPath = await walletStorage.put(image, type)
      qrType = type
    }
    const wallet = await db.transaction(async()=>{
      const table = additional ? 'seller_payment_networks' : 'payment_wallets'
      const otherTable = additional ? 'payment_wallets' : 'seller_payment_networks'
      const duplicate = await db.prepare(`SELECT coin FROM ${otherTable} WHERE coin=? AND lower(network)=lower(?)`).get(coin, network)
      if (duplicate) return null
      if(originalNetwork){
        const sourceTable = originalAdditional ? 'seller_payment_networks' : 'payment_wallets'
        const previous=await db.prepare(`SELECT network FROM ${sourceTable} WHERE coin=? AND lower(network)=lower(?)`).get(originalCoin,originalNetwork)
        if(!previous)return null
        const sameWallet=sourceTable===table&&originalCoin===coin&&originalNetwork.toLowerCase()===network.toLowerCase()
        if(!sameWallet){
          const occupied=await db.prepare(`SELECT coin FROM ${table} WHERE coin=? ${additional?'AND lower(network)=lower(?)':''}`)
            .get(coin,...(additional?[network]:[]))
          if(occupied&&!(sourceTable===table&&!additional&&originalCoin===coin))return null
          if(sourceTable===table){
            return db.prepare(`
              UPDATE ${table} SET coin=?,network=?,address=?,
                usd_rate=CASE WHEN ?::boolean THEN ? ELSE COALESCE(NULLIF(usd_rate,''),?) END,qr_image=?,qr_content_type=?
              WHERE coin=? AND lower(network)=lower(?)
              RETURNING coin,network,address,usd_rate AS usdRate,qr_image IS NOT NULL AS hasQr
            `).get(coin,network,address,explicitRate||originalCoin!==coin,rate,rate,qrPath,qrType,originalCoin,originalNetwork)
          }
          await db.prepare(`DELETE FROM ${sourceTable} WHERE coin=? AND lower(network)=lower(?)`).run(originalCoin,originalNetwork)
        }
      }
      const conflictKey = additional ? 'coin, (lower(network))' : 'coin'
      return db.prepare(`
      INSERT INTO ${table} (coin,network,address,usd_rate,qr_image,qr_content_type)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(${conflictKey}) DO UPDATE SET network=excluded.network,address=excluded.address,usd_rate=${explicitRate ? 'excluded.usd_rate' : `COALESCE(NULLIF(${table}.usd_rate, ''), excluded.usd_rate)`},
        qr_image=CASE WHEN NOT ?::boolean AND excluded.qr_image IS NULL AND lower(${table}.network)=lower(excluded.network) AND ${table}.address=excluded.address
          THEN ${table}.qr_image ELSE excluded.qr_image END,
        qr_content_type=CASE WHEN NOT ?::boolean AND excluded.qr_image IS NULL AND lower(${table}.network)=lower(excluded.network) AND ${table}.address=excluded.address
          THEN ${table}.qr_content_type ELSE excluded.qr_content_type END
      RETURNING coin,network,address,usd_rate AS usdRate,qr_image IS NOT NULL AS hasQr
    `).get(coin, network, address, rate, qrPath, qrType, removeQr, removeQr)
    })()
    if (!wallet) return res.status(409).json({error:'This wallet changed or the chosen network already has an address. Refresh the wallet editor and try again.'})
    return res.json({ ok: true, wallet })
  })
  app.get('/api/payment-coins', async (_req, res) => {
    const available = (await db.prepare("SELECT coin FROM payment_wallets WHERE usd_rate IS NOT NULL AND usd_rate != '' ORDER BY coin").all())
    return res.json({ coins: available.map((row) => (row as { coin: string }).coin) })
  })
  app.post('/api/purchases', auth, async (req, res) => {
    const { items, billing, coin, requestKey } = req.body ?? {}
    const fields = ['fullName', 'email', 'address', 'city', 'region', 'country']
    const useBalance = coin === 'BALANCE'
    if(!useBalance)return res.status(400).json({error:'Orders can only be paid from your account balance. Add funds to your account before checkout.'})
    if ((!useBalance && !coins.includes(coin)) || typeof requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestKey) || !Array.isArray(items) || !items.length || items.length > 100 || !billing || !['fullName','address'].every((field) => text(billing[field], 200))) return res.status(400).json({ error: 'Enter valid billing details, products and a supported payment method.' })
    if (useBalance && !['customer', 'seller'].includes(req.user!.role)) return res.status(403).json({ error: 'Account balance is available to buyers and sellers.' })
    const existing = (await db.prepare('SELECT id FROM purchase_orders WHERE buyer_id=? AND request_key=?').get(req.user!.id, requestKey)) as { id: number } | undefined
    if (existing) return res.json({ id: existing.id, buyerId: req.user!.id })
    const wallet = useBalance ? undefined : (await db.prepare('SELECT network,address,usd_rate FROM payment_wallets WHERE coin=?').get(coin)) as { network: string, address: string, usd_rate: string | null } | undefined
    if (!useBalance && (!wallet?.usd_rate || !validRate(wallet.usd_rate))) return res.status(409).json({ error: 'This coin is not configured for payment yet. Choose another coin or contact the administrator.' })
    const snapshots: { product: { id: number, seller_id: number, name: string, image_url: string, price: number }, quantity: number, color: string, size: string }[] = []
    for (const item of items) {
      if (!item || !Number.isSafeInteger(item.id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 || typeof item.selectedColor !== 'string' || item.selectedColor.length > 100 || typeof item.selectedSize !== 'string' || item.selectedSize.length > 100) return res.status(400).json({ error: 'Invalid order item.' })
      const product = (await db.prepare('SELECT id, seller_id, name, image_url, price FROM products WHERE id=? AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\')) AND (is_published=1 OR is_store_published=1)').get(item.id)) as { id: number, seller_id: number, name: string, image_url: string, price: number } | undefined
      if (!product) return res.status(400).json({ error: 'A product is no longer available.' })
      snapshots.push({ product, quantity: item.quantity, color: item.selectedColor, size: item.selectedSize })
    }
    const subtotal = snapshots.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0)
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > 100000000) return res.status(400).json({ error: 'Order subtotal must be positive and within the supported amount.' })
    if (useBalance && (!Number.isSafeInteger(req.body.expectedTotalCents) || req.body.expectedTotalCents !== subtotal + Math.floor(subtotal * 3 / 100))) return res.status(409).json({ error: 'The order total changed. Review your cart before paying with your balance.' })
    const purchase = (await db.transaction(async () => {
      const previous = (await db.prepare('SELECT id FROM purchase_orders WHERE buyer_id=? AND request_key=?').get(req.user!.id, requestKey)) as { id: number } | undefined
      if (previous) return { id: previous.id, created: false }
      const tax = Math.floor(subtotal * 3 / 100)
      const total = subtotal + tax
      if(useBalance){
        if(req.user!.role==='seller'){
          const credit=(await db.prepare('SELECT balance_units AS amount FROM reward_balances WHERE user_id=?').get(req.user!.id) as {amount:number}|undefined)?.amount||0
          const merchant=await db.prepare('SELECT balance_cents,reserved_cents FROM seller_wallets WHERE seller_id=?').get(req.user!.id) as {balance_cents:number,reserved_cents:number}|undefined
          const heldCredit=(await db.prepare('SELECT amount_cents AS amount FROM buyer_wallet_holds WHERE user_id=?').get(req.user!.id) as {amount:number}|undefined)?.amount||0
          const spendableCredit=Math.max(0,credit-heldCredit)
          const fromCredit=Math.min(total,spendableCredit),fromWallet=total-fromCredit
          if(spendableCredit+(merchant?merchant.balance_cents-merchant.reserved_cents:0)<total)return null
          if(fromCredit)await db.prepare('UPDATE reward_balances SET balance_units=balance_units-? WHERE user_id=?').run(fromCredit,req.user!.id)
          if(fromWallet)await postSellerFunds(db,req.user!.id,'purchase_payment',`${req.user!.id}:${requestKey}`,-fromWallet,0,req.user!.id)
        }else{
          const debit=await db.prepare('UPDATE reward_balances SET balance_units=balance_units-? WHERE user_id=? AND balance_units-COALESCE((SELECT amount_cents FROM buyer_wallet_holds WHERE user_id=reward_balances.user_id),0)>=?').run(total,req.user!.id,total)
          if(!debit.changes)return null
        }
      }
      const result = (await db.prepare('INSERT INTO purchase_orders (buyer_id,request_key,coin,billing_json,subtotal_cents,shipping_cents,tax_cents,coin_amount,network,wallet_address,usd_rate,status,account_balance_payment) VALUES (?,?,?,?,?,0,?,?,?,?,?,?,1)').run(req.user!.id, requestKey, coin, JSON.stringify({ ...Object.fromEntries(fields.map((field) => [field, text(billing[field], 200)])), email: text(billing.email, 200) || req.user!.email, phone: text(billing.phone, 40) }), subtotal, tax, useBalance ? null : coinAmount(total, wallet!.usd_rate!), wallet?.network ?? null, wallet?.address ?? null, wallet?.usd_rate ?? null, useBalance ? 'paid' : 'awaiting_receipt'))
      const orderId = Number(result.lastInsertRowid)
      const number = (await allocateOrderNumber(db, 'purchase', orderId))
      if (useBalance) {
        const creditBalance=(await db.prepare('SELECT balance_units FROM reward_balances WHERE user_id=?').get(req.user!.id) as {balance_units:number}|undefined)?.balance_units||0
        const merchantBalance=req.user!.role==='seller'?(await db.prepare('SELECT balance_cents FROM seller_wallets WHERE seller_id=?').get(req.user!.id) as {balance_cents:number}|undefined)?.balance_cents||0:0
        const balance={balance_units:creditBalance+merchantBalance}
        await db.prepare('INSERT INTO balance_purchase_history (order_id,user_id,amount_cents,balance_after_cents) VALUES (?,?,?,?)').run(orderId, req.user!.id, total, balance.balance_units)
        await notify.run(req.user!.id, 'purchase', `Order #${number} paid from balance`, 'Your account balance was charged. The store owner or administrator can now confirm your order.', `/purchase/${orderId}`)
      }
      const insert = db.prepare('INSERT INTO purchase_items (order_id,seller_id,product_id,name,image_url,price_cents,quantity,color,size) VALUES (?,?,?,?,?,?,?,?,?)')
      const seller = db.prepare('INSERT OR IGNORE INTO purchase_sellers (order_id,seller_id) VALUES (?,?)')
      for (const item of snapshots) { await insert.run(orderId, item.product.seller_id, item.product.id, item.product.name, item.product.image_url, Math.round(item.product.price * 100), item.quantity, item.color, item.size); await seller.run(orderId, item.product.seller_id) }
      for (const sellerId of new Set(snapshots.map((item) => item.product.seller_id))) {
        await recordShipmentEvent(db,orderId,sellerId,'pending',req.user!.id,req.user!.role,'Order placed')
        await notify.run(sellerId, 'purchase', `New order #${number}`, useBalance ? 'Paid' : 'Payment is pending confirmation. Do not fulfill until the administrator confirms payment.', `/seller/orders?order=${number}`)
      }
      await db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(useBalance ? `Paid · Order #${number}` : `Order #${number} created`, useBalance ? '' : `${req.user!.full_name} selected ${coin}.`, `/admin?order=${number}#purchase-orders`)
      return { id: orderId, created: true }
    })())
    if (!purchase) return res.status(409).json({ error: 'Insufficient account balance for this order.' })
    return res.status(purchase.created ? 201 : 200).json({ id: purchase.id, buyerId: req.user!.id })
  })
  app.get('/api/purchases', auth, async (req, res) => {
    const orders = (await db.prepare('SELECT * FROM purchase_orders WHERE buyer_id=? ORDER BY id DESC').all(req.user!.id)) as Order[]
    return res.json({ orders: (await Promise.all(orders.map(async (order) => (await serialize(order))))) })
  })
  app.get('/api/purchases/:id', auth, async (req, res) => {
    const order = (await orderById(validId(req.params.id)))
    if (!order || order.buyer_id !== req.user!.id) return res.status(404).json({ error: 'Order not found.' })
    return res.json({ order: (await serialize(order)) })
  })
  app.get('/api/admin/purchases', auth, role('admin'), async (_req, res) => {
    const orders = (await db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all()) as Order[]
    return res.json({ orders: (await Promise.all(orders.map(async (order) => (await serialize(order))))) })
  })
  app.put('/api/admin/purchases/:id/quote', auth, role('admin'), async (req, res) => {
    const order = (await orderById(validId(req.params.id)))
    if (!order) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'awaiting_quote') return res.status(409).json({ error: 'This order has already been quoted.' })
    const { shippingCents, taxCents } = req.body ?? {}
    const amount = text(req.body?.coinAmount, 40)
    const wallet = (await db.prepare('SELECT network,address FROM payment_wallets WHERE coin=?').get(order.coin)) as { network: string, address: string } | undefined
    if (!wallet) return res.status(400).json({ error: 'Set a wallet for this coin first.' })
    if (shippingCents !== 0 || !Number.isSafeInteger(taxCents) || taxCents < 0 || taxCents > Math.floor(order.subtotal_cents * 3 / 100) || !/^\d{1,20}(\.\d{1,18})?$/.test(amount) || !/[1-9]/.test(amount)) return res.status(400).json({ error: 'Shipping must be zero and tax must not exceed 3% of the subtotal. Enter a positive coin amount.' })
    await db.transaction(async () => {
      await db.prepare("UPDATE purchase_orders SET shipping_cents=?,tax_cents=?,coin_amount=?,network=?,wallet_address=?,status='awaiting_receipt' WHERE id=?").run(shippingCents, taxCents, amount, wallet.network, wallet.address, order.id)
      await notify.run(order.buyer_id, 'purchase', `Payment details for order #${(await orderNumber(order.id))}`, 'Your payment quote and wallet are ready.', `/purchase/${order.id}`)
    })()
    return res.json({ ok: true })
  })
  app.post('/api/purchases/:id/receipt', auth, express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), async (req, res) => {
    const order = (await orderById(validId(req.params.id)))
    if (!order || order.buyer_id !== req.user!.id) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'awaiting_receipt') return res.status(409).json({ error: 'This order is not awaiting a receipt.' })
    const image = req.body
    const contentType = req.is(['image/png', 'image/jpeg'])
    if (!Buffer.isBuffer(image) || !matchesScreenshot(image, contentType)) return res.status(400).json({ error: 'Upload a PNG or JPEG screenshot up to 2 MB.' })
    await db.transaction(async () => {
      await db.prepare('INSERT INTO purchase_receipts (order_id,content_type,image) VALUES (?,?,?)').run(order.id, contentType, image)
      await db.prepare("UPDATE purchase_orders SET status='awaiting_review' WHERE id=?").run(order.id)
      await notify.run(order.buyer_id, 'purchase', `Order #${(await orderNumber(order.id))} payment pending`, 'Your screenshot was submitted. The administrator must verify the transfer before confirming payment.', `/purchase/${order.id}`)
      const sellers = (await db.prepare('SELECT seller_id FROM purchase_sellers WHERE order_id=?').all(order.id)) as { seller_id: number }[]
      for (const seller of sellers) await notify.run(seller.seller_id, 'purchase', `Order #${(await orderNumber(order.id))} payment under review`, 'A receipt was submitted. Payment is not yet confirmed.', `/seller/orders?order=${(await orderNumber(order.id))}`)
      await db.prepare("INSERT INTO notifications (user_id,type,title,body,link) SELECT id,'purchase',?,?,? FROM users WHERE role='admin'").run(`Order #${(await orderNumber(order.id))} receipt submitted`, 'Verify the transfer independently before confirming.', `/admin?order=${(await orderNumber(order.id))}#purchase-orders`)
    })()
    return res.status(201).json({ ok: true })
  })
  app.get('/api/admin/purchase-receipts/:id', auth, role('admin'), async (req, res) => {
    const receipt = (await db.prepare('SELECT image,content_type FROM purchase_receipts WHERE id=?').get(validId(req.params.id))) as { image: Buffer, content_type: string } | undefined
    if (!receipt) return res.status(404).json({ error: 'Receipt not found.' })
    res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff').set('Content-Disposition', `inline; filename="receipt.${receipt.content_type === 'image/png' ? 'png' : 'jpg'}"`)
    return res.type(receipt.content_type).send(receipt.image)
  })
  app.patch('/api/admin/purchases/:id/payment', auth, role('admin'), async (req, res) => {
    const order = (await orderById(validId(req.params.id)))
    if (!order) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'awaiting_review') return res.status(409).json({ error: 'A receipt must be submitted before review.' })
    if (!['paid', 'rejected'].includes(req.body?.status) || (req.body.status === 'paid' && req.body.verified !== true)) return res.status(400).json({ error: 'Independently verify the payment before confirming it.' })
    await db.transaction(async () => {
      await db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(req.body.status, order.id)
      await notify.run(order.buyer_id, 'purchase', `Order #${(await orderNumber(order.id))} payment ${req.body.status === 'paid' ? 'confirmed' : 'declined'}`, req.body.status === 'paid' ? 'Your payment was confirmed. The seller can now prepare your order.' : 'Your payment was not confirmed. View your order and contact the administrator.', `/purchase/${order.id}`)
      const sellers = (await db.prepare('SELECT seller_id FROM purchase_sellers WHERE order_id=?').all(order.id)) as { seller_id: number }[]
      for (const seller of sellers) await notify.run(seller.seller_id, 'purchase', `Order #${(await orderNumber(order.id))} payment ${req.body.status === 'paid' ? 'confirmed' : 'declined'}`, req.body.status === 'paid' ? 'The administrator confirmed payment. Fulfillment is pending.' : 'Payment was declined. Do not fulfill this order.', `/seller/orders?order=${(await orderNumber(order.id))}`)
    })()
    return res.json({ ok: true })
  })
  app.put('/api/seller/purchases/:id/contact', auth, role('seller'), async (req, res) => {
    const limits = { name: 200, email: 200, phone: 40, address: 500 } as const
    const fields = Object.keys(limits) as (keyof typeof limits)[]
    const input = req.body ?? {}
    if (fields.some(field => typeof input[field] !== 'string' || input[field].trim().length > limits[field])) {
      return res.status(400).json({ error: 'Check the contact fields and try again.' })
    }
    const contact = Object.fromEntries(fields.map(field => [field, input[field].trim()]))
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      return res.status(400).json({ error: 'Enter a valid contact email.' })
    }
    const result = await db.prepare('UPDATE purchase_sellers SET seller_contact_json=? WHERE order_id=? AND seller_id=?')
      .run(JSON.stringify(contact),validId(req.params.id),req.user!.id)
    if (!result.changes) return res.status(404).json({ error: 'Order not found.' })
    return res.set('Cache-Control','private, no-store').json({ contact })
  })

  app.get('/api/seller/purchases', auth, role('seller'), async (req, res) => {
    const orders = (await db.prepare('SELECT o.* FROM purchase_orders o JOIN purchase_sellers s ON s.order_id=o.id WHERE s.seller_id=? ORDER BY o.id DESC').all(req.user!.id)) as Order[]
    return res.json({ orders: (await Promise.all(orders.map(async (order) => (await serialize(order, req.user!.id))))) })
  })
  app.put('/api/admin/purchase-sellers/:orderId/:sellerId/tracking',auth,role('admin'),async(req,res)=>{
    const orderId=validId(req.params.orderId),sellerId=validId(req.params.sellerId),tracking=text(req.body?.carrierTrackingNumber??req.body?.trackingNumber,150),carrier=text(req.body?.carrier,100)
    if(/[\r\n]/.test(tracking+carrier))return res.status(400).json({error:'Enter a valid tracking number and carrier.'})
    await db.transaction(async()=>{
      const shipment=await db.prepare('SELECT status,tracking_code FROM purchase_sellers WHERE order_id=? AND seller_id=?').get(orderId,sellerId) as {status:string,tracking_code:string}|undefined
      if(!shipment)return
      await recordShipmentEvent(db,orderId,sellerId,shipment.status,req.user!.id,'admin',`Tracking details updated; tracking ${shipment.tracking_code}`)
      await db.prepare('UPDATE purchase_sellers SET tracking_number=?,carrier=?,tracking_assigned_by=?,tracking_assigned_at=CURRENT_TIMESTAMP WHERE order_id=? AND seller_id=?').run(tracking,carrier,req.user!.id,orderId,sellerId)
      await db.prepare("INSERT INTO seller_store_activity(seller_id,kind,details) VALUES(?,'tracking_assigned',?)").run(sellerId,`Admin assigned tracking ${tracking}${carrier?' · '+carrier:''} to order #${await orderNumber(orderId)}`)
      await notify.run(sellerId,'purchase','Tracking number assigned',`${carrier} ${tracking}`.trim(),'/seller/orders')
      const order=await orderById(orderId)
      if(order)await notify.run(order.buyer_id,'purchase','Order tracking updated',`${carrier} ${tracking}`.trim(),`/purchase/${orderId}`)
    })()
    if(!await db.prepare('SELECT 1 FROM purchase_sellers WHERE order_id=? AND seller_id=?').get(orderId,sellerId))return res.status(404).json({error:'Shipment not found.'})
    return res.json({ok:true})
  })
  app.patch('/api/purchase-sellers/:orderId/:sellerId', auth, role('seller', 'admin'), async (req, res) => {
    const orderId = validId(req.params.orderId), sellerId = validId(req.params.sellerId)
    if (req.user!.role === 'seller' && sellerId !== req.user!.id) return res.status(403).json({ error: 'You can only update your own orders.' })
    const order = (await orderById(orderId))
    const existing = (await db.prepare('SELECT status FROM purchase_sellers WHERE order_id=? AND seller_id=?').get(orderId, sellerId)) as { status: string } | undefined
    if (!order || !existing) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'paid') return res.status(409).json({ error: 'Payment must be confirmed first.' })
    if (!['pending','confirmed','about_to_send','sent','on_the_way','hold','stalled','delivered'].includes(req.body?.status)) return res.status(400).json({ error: 'Invalid status.' })
    if (req.user!.role === 'seller' && existing.status === 'pending' && req.body.status !== 'pending'
      && !await db.prepare("SELECT 1 FROM seller_sale_releases WHERE order_id=? AND seller_id=? AND status='released'").get(orderId,sellerId)) {
      return res.status(409).json({ error: 'Confirm the order before updating fulfillment.' })
    }
    if (existing.status !== req.body.status) await db.transaction(async () => {
      await db.prepare('UPDATE purchase_sellers SET status=? WHERE order_id=? AND seller_id=?').run(req.body.status, orderId, sellerId)
      if(req.body.status==='delivered')await queueDeliveryEmail(db,orderId,sellerId)
      await recordShipmentEvent(db,orderId,sellerId,String(req.body.status),req.user!.id,req.user!.role,text(req.body.note,500))
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
      await notify.run(order.buyer_id, 'purchase', `Order #${(await orderNumber(orderId))} updated`, progressMessages[String(req.body.status)], `/purchase/${orderId}`)
      await notify.run(sellerId, 'purchase', `Order #${(await orderNumber(orderId))} ${req.body.status === 'delivered' ? 'marked delivered' : 'fulfillment updated'}`, `Fulfillment status: ${String(req.body.status).replaceAll('_', ' ')}.`, `/seller/orders?order=${(await orderNumber(orderId))}`)
    })()
    if(req.body.status==='delivered')kickDeliveryEmailWorker(db)
    return res.json({ ok: true })
  })
}
