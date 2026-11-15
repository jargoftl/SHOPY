import express, { type Express, type RequestHandler } from 'express'
import type { Database } from './database.ts'
import { marketingPlans, marketingCoins, validMarketingRate, marketingCoinAmount } from './marketingPlans.ts'

type Role = 'customer' | 'seller' | 'admin'
type Plan = { id: string, kind: 'package' | 'level', name: string, feeCents: number | null, rank: number, durationDays: number | null, productLimit: number, details: Record<string, unknown> }
type PlanRow = { id: string, kind: 'package' | 'level', name: string, fee_cents: number | null, rank: number, duration_days: number | null, product_limit: number, details_json: string }
type Upgrade = { id: number, seller_id: number, request_key: string, plan_id: string, plan_json: string, amount_cents: number | null, coin: string, status: string, network: string | null, wallet_address: string | null, usd_rate: string | null, coin_amount: string | null, instructions: string, transfer_reference: string | null, approved_at: string | null, created_at: string }
type Entitlement = { id: number, kind: string, plan_json: string, rank: number, starts_at: string, expires_at: string | null }
const planValue = (p: PlanRow): Plan => ({ id: p.id, kind: p.kind, name: p.name, feeCents: p.fee_cents, rank: p.rank, durationDays: p.duration_days, productLimit: p.product_limit, details: JSON.parse(p.details_json) })
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
const validId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
const now = () => new Date().toISOString()
const pending = ['requested', 'awaiting_payment', 'proof_submitted']
const validFee = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000000000
class TransitionError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status } }

export async function registerMarketing(app: Express, db: Database, auth: RequestHandler, role: (...roles: Role[]) => RequestHandler) {
  for (const p of marketingPlans) await db.prepare('INSERT INTO marketing_plans(id,kind,name,fee_cents,rank,duration_days,product_limit,details_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(p.id, p.kind, p.name, p.feeCents, p.rank, p.durationDays, p.productLimit, JSON.stringify(p.details))
  const notify = db.prepare('INSERT INTO notifications(user_id,type,title,body,link) VALUES (?,?,?,?,?)')
  const notifyAdmin = async (title: string, body: string) => db.prepare("INSERT INTO notifications(user_id,type,title,body,link) SELECT id,'marketing',?,?, '/admin#marketing-requests' FROM users WHERE role='admin'").run(title, body)
  const getRequest = async (id: unknown) => await db.prepare('SELECT * FROM marketing_requests WHERE id=?').get(validId(id)) as Upgrade | undefined
  const getPlans = async () => (await db.prepare('SELECT * FROM marketing_plans ORDER BY kind,rank DESC').all() as PlanRow[]).map(planValue)
  const current = async (sellerId: number) => {
    const rows = await db.prepare('SELECT * FROM marketing_entitlements WHERE seller_id=? AND (expires_at IS NULL OR expires_at > ?) ORDER BY rank DESC,id DESC').all(sellerId, now()) as Entitlement[]
    return { package: rows.find(row => row.kind === 'package') || null, level: rows.find(row => row.kind === 'level') || null }
  }
  const serializeEntitlement = (row: Entitlement | null) => row ? { id: row.id, plan: JSON.parse(row.plan_json), startsAt: row.starts_at, expiresAt: row.expires_at } : null
  const serialize = async (r: Upgrade) => ({ id: r.id, sellerId: r.seller_id, plan: JSON.parse(r.plan_json), amountCents: r.amount_cents, coin: r.coin, status: r.status, network: r.network, walletAddress: r.wallet_address, usdRate: r.usd_rate, coinAmount: r.coin_amount, instructions: r.instructions, transferReference: r.transfer_reference, createdAt: r.created_at, approvedAt: r.approved_at, receipts: await db.prepare('SELECT id,created_at AS createdAt FROM marketing_receipts WHERE request_id=? ORDER BY id').all(r.id) })
  const transactionRoute = (operation: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await operation(req, res, next) } catch (error) { if (error instanceof TransitionError) { res.status(error.status).json({ error: error.message }); return } next(error) }
  }

  app.get('/api/seller/marketing', auth, role('seller'), async (req, res) => {
    const entitlements = await current(req.user!.id)
    const requests = await db.prepare('SELECT * FROM marketing_requests WHERE seller_id=? ORDER BY id DESC LIMIT 100').all(req.user!.id) as Upgrade[]
    const promoted = await db.prepare('SELECT product_id AS productId FROM marketing_promotions WHERE seller_id=? ORDER BY product_id').all(req.user!.id)
    res.json({ plans: await getPlans(), coins: marketingCoins, requests: await Promise.all(requests.map(serialize)), current: { package: serializeEntitlement(entitlements.package), level: serializeEntitlement(entitlements.level) }, promoted })
  })
  app.get('/api/admin/marketing', auth, role('admin'), async (_req, res) => {
    const requests = await db.prepare('SELECT * FROM marketing_requests ORDER BY id DESC LIMIT 200').all() as Upgrade[]
    const users = await db.prepare("SELECT u.id,u.full_name AS fullName,u.email,p.store_name AS storeName FROM users u LEFT JOIN seller_profiles p ON p.user_id=u.id WHERE u.role='seller'").all() as { id: number }[]
    res.json({ plans: await getPlans(), requests: await Promise.all(requests.map(async r => ({ ...await serialize(r), seller: users.find(u => u.id === r.seller_id) }))) })
  })
  app.patch('/api/admin/marketing/plans/:id', auth, role('admin'), async (req, res) => {
    const fee = req.body?.feeCents
    if (!validFee(fee)) return res.status(400).json({ error: 'Enter an upgrade fee of zero or more, in cents.' })
    const result = await db.prepare('UPDATE marketing_plans SET fee_cents=? WHERE id=?').run(fee, String(req.params.id))
    if (!result.changes) return res.status(404).json({ error: 'Plan not found.' })
    res.json({ ok: true })
  })
  app.post('/api/seller/marketing/requests', auth, role('seller'), transactionRoute(async (req, res) => {
    const key = text(req.body?.requestKey, 36), planId = text(req.body?.planId, 50), coin = text(req.body?.coin, 10)
    if (!/^[a-f0-9-]{36}$/i.test(key) || !marketingCoins.includes(coin)) return res.status(400).json({ error: 'Choose a supported coin and a valid request key.' })
    const result = await db.transaction(async () => {
      const existing = await db.prepare('SELECT * FROM marketing_requests WHERE seller_id=? AND request_key=?').get(req.user!.id, key) as Upgrade | undefined
      if (existing) { if (existing.plan_id !== planId || existing.coin !== coin) throw new TransitionError(409, 'This request key belongs to a different selection.'); return existing }
      const row = await db.prepare('SELECT * FROM marketing_plans WHERE id=?').get(planId) as PlanRow | undefined
      if (!row) throw new TransitionError(404, 'Plan not found.')
      const plan = planValue(row), active = await current(req.user!.id)
      if (plan.kind === 'level' && active.level && active.level.rank >= plan.rank) throw new TransitionError(409, 'Your current seller level already includes this level.')
      if (plan.kind === 'package' && active.package && active.package.rank > plan.rank) throw new TransitionError(409, 'A higher promotion package is already active. You can renew or upgrade it.')
      if (await db.prepare("SELECT 1 FROM marketing_requests WHERE seller_id=? AND plan_id=? AND status IN ('requested','awaiting_payment','proof_submitted')").get(req.user!.id, planId)) throw new TransitionError(409, 'This upgrade already has a pending request. Open Purchase History.')
      const inserted = await db.prepare('INSERT INTO marketing_requests(seller_id,request_key,plan_id,plan_json,amount_cents,coin) VALUES (?,?,?,?,?,?)').run(req.user!.id, key, planId, JSON.stringify(plan), plan.feeCents, coin)
      await notifyAdmin('Seller upgrade requested', `${req.user!.full_name} requested ${plan.name}. Send a payment quote and wallet.`)
      return (await getRequest(inserted.lastInsertRowid))!
    })()
    res.status(201).json({ request: await serialize(result) })
  }))
  app.patch('/api/admin/marketing/requests/:id/quote', auth, role('admin'), transactionRoute(async (req, res) => {
    await db.transaction(async () => {
      const request = await getRequest(req.params.id)
      if (!request) throw new TransitionError(404, 'Upgrade request not found.')
      if (!['requested','awaiting_payment'].includes(request.status)) throw new TransitionError(409, 'Payment details cannot change after a receipt or review.')
      if (request.amount_cents === 0) throw new TransitionError(409, 'This is a free level request. Approve it without asking for payment.')
      const amount = request.amount_cents ?? req.body?.amountCents
      const network = text(req.body?.network, 100), wallet = text(req.body?.walletAddress, 500), rate = text(req.body?.usdRate, 30), instructions = text(req.body?.instructions, 2000)
      if (!validFee(amount) || !network || !wallet || !validMarketingRate(rate)) throw new TransitionError(400, 'Enter the USD fee, network, wallet address and a valid USD-per-coin rate.')
      await db.prepare("UPDATE marketing_requests SET amount_cents=?,network=?,wallet_address=?,usd_rate=?,coin_amount=?,instructions=?,status='awaiting_payment' WHERE id=?").run(amount, network, wallet, rate, marketingCoinAmount(amount, rate), instructions, request.id)
      await notify.run(request.seller_id, 'marketing', 'Your upgrade payment details are ready', 'Review the fee, coin amount, network and wallet in Purchase History.', '/seller/marketing/history')
    })()
    res.json({ ok: true })
  }))
  app.post('/api/seller/marketing/requests/:id/receipt', auth, role('seller'), express.raw({ type: ['image/png','image/jpeg'], limit: '2mb' }), transactionRoute(async (req, res) => {
    const image = req.body
    const png = Buffer.isBuffer(image) && image.length >= 8 && image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    const jpeg = Buffer.isBuffer(image) && image.length >= 3 && image[0] === 255 && image[1] === 216 && image[2] === 255
    if ((!png && !jpeg) || (png && !req.is('image/png')) || (jpeg && !req.is('image/jpeg'))) return res.status(400).json({ error: 'Upload a PNG or JPEG receipt, up to 2 MB.' })
    await db.transaction(async () => {
      const request = await getRequest(req.params.id)
      if (!request || request.seller_id !== req.user!.id) throw new TransitionError(404, 'Upgrade request not found.')
      if (request.status !== 'awaiting_payment') throw new TransitionError(409, 'This upgrade is not awaiting a receipt.')
      await db.prepare('INSERT INTO marketing_receipts(request_id,content_type,image) VALUES (?,?,?)').run(request.id, png ? 'image/png' : 'image/jpeg', image)
      await db.prepare("UPDATE marketing_requests SET status='proof_submitted' WHERE id=?").run(request.id)
      await notifyAdmin('Seller upgrade receipt submitted', 'Verify the actual transfer before approving the upgrade.')
    })()
    res.status(201).json({ ok: true })
  }))
  app.get('/api/marketing/receipts/:id', auth, role('seller','admin'), async (req, res) => {
    const receipt = await db.prepare('SELECT r.image,r.content_type,q.seller_id FROM marketing_receipts r JOIN marketing_requests q ON q.id=r.request_id WHERE r.id=?').get(validId(req.params.id)) as { image: Buffer, content_type: string, seller_id: number } | undefined
    if (!receipt || (req.user!.role !== 'admin' && receipt.seller_id !== req.user!.id)) return res.status(404).json({ error: 'Receipt not found.' })
    res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');res.type(receipt.content_type).send(receipt.image)
  })
  app.patch('/api/admin/marketing/requests/:id/review', auth, role('admin'), transactionRoute(async (req, res) => {
    const status = req.body?.status, reference = text(req.body?.transferReference, 200), instructions = text(req.body?.instructions, 2000)
    if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'Choose approve or reject.' })
    await db.transaction(async () => {
      const request = await getRequest(req.params.id)
      if (!request) throw new TransitionError(404, 'Upgrade request not found.')
      if (!pending.includes(request.status)) throw new TransitionError(409, 'This request has already been reviewed or cancelled.')
      if (status === 'approved') {
        if (req.body?.verified !== true || (request.amount_cents !== 0 && (request.status !== 'proof_submitted' || !reference))) throw new TransitionError(400, 'Review the request; paid upgrades also require a receipt, independently verified transfer and transfer reference.')
        if (request.amount_cents !== 0 && await db.prepare("SELECT 1 FROM marketing_requests WHERE status='approved' AND amount_cents>0 AND coin=? AND lower(network)=lower(?) AND lower(transfer_reference)=lower(?)").get(request.coin, request.network, reference)) throw new TransitionError(409, 'This transfer reference was already used for an approved upgrade.')
        const plan = JSON.parse(request.plan_json) as Plan, active = await current(request.seller_id)
        if (plan.kind === 'level' && active.level && active.level.rank >= plan.rank) throw new TransitionError(409, 'A higher or equal level is already active. Review this payment separately.')
        if (plan.kind === 'package' && active.package && active.package.rank > plan.rank) throw new TransitionError(409, 'A higher package is already active. Review this payment separately.')
        const start = now(), renewal = plan.kind === 'package' && active.package && JSON.parse(active.package.plan_json).id === plan.id ? active.package.expires_at : null
        const expiry = plan.durationDays ? new Date(Math.max(Date.now(), renewal ? Date.parse(renewal) : 0) + plan.durationDays * 86400000).toISOString() : null
        if (plan.kind === 'package') await db.prepare('UPDATE marketing_entitlements SET expires_at=? WHERE seller_id=? AND kind=? AND (expires_at IS NULL OR expires_at>?)').run(start, request.seller_id, plan.kind, start)
        await db.prepare('INSERT INTO marketing_entitlements(seller_id,request_id,kind,plan_id,plan_json,rank,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,?)').run(request.seller_id, request.id, plan.kind, plan.id, JSON.stringify(plan), plan.rank, start, expiry)
        await notify.run(request.seller_id, 'marketing', 'Congratulations — your upgrade is active!', `${plan.name} has been activated after administrator approval.`, '/seller/marketing/history')
      } else await notify.run(request.seller_id, 'marketing', 'Upgrade request declined', instructions || 'Contact the administrator about this request.', '/seller/marketing/history')
      await db.prepare('UPDATE marketing_requests SET status=?,transfer_reference=?,instructions=?,reviewed_by=?,approved_at=? WHERE id=?').run(status, reference || null, instructions || request.instructions, req.user!.id, status === 'approved' ? now() : null, request.id)
    })()
    res.json({ ok: true })
  }))
  app.patch('/api/seller/marketing/requests/:id/cancel', auth, role('seller'), transactionRoute(async (req, res) => {
    await db.transaction(async () => {
      const request = await getRequest(req.params.id)
      if (!request || request.seller_id !== req.user!.id) throw new TransitionError(404, 'Upgrade request not found.')
      if (request.status !== 'requested') throw new TransitionError(409, 'Contact the administrator to cancel a request with payment instructions.')
      await db.prepare("UPDATE marketing_requests SET status='cancelled' WHERE id=?").run(request.id)
    })()
    res.json({ ok: true })
  }))
  app.put('/api/seller/marketing/promotions', auth, role('seller'), transactionRoute(async (req, res) => {
    const ids: unknown = req.body?.productIds
    if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Choose valid unique products.' })
    await db.transaction(async () => {
      const active = (await current(req.user!.id)).package
      if (!active) throw new TransitionError(409, 'An active promotion package is required.')
      const plan = JSON.parse(active.plan_json) as Plan
      if (ids.length > plan.productLimit) throw new TransitionError(400, `This package includes up to ${plan.productLimit} products.`)
      for (const id of ids) if (!await db.prepare('SELECT 1 FROM products WHERE id=? AND seller_id=? AND is_published=1 AND is_store_published=1').get(id, req.user!.id)) throw new TransitionError(400, 'Choose published products from your own store.')
      await db.prepare('DELETE FROM marketing_promotions WHERE seller_id=?').run(req.user!.id)
      for (const id of ids) await db.prepare('INSERT INTO marketing_promotions(seller_id,product_id) VALUES (?,?)').run(req.user!.id, id)
    })()
    res.json({ ok: true })
  }))
  app.get('/api/promoted-products', async (_req, res) => {
    const products = await db.query(`WITH active AS (
      SELECT DISTINCT ON (seller_id) seller_id,plan_json FROM marketing_entitlements
      WHERE kind='package' AND expires_at>$1 ORDER BY seller_id,rank DESC,id DESC
    ), selected AS (
      SELECT p.id,p.name,p.category,p.price,p.compare_at_price AS "compareAtPrice",p.description,p.image_url AS "imageUrl",p.seller_id AS "sellerId",
        ROW_NUMBER() OVER(PARTITION BY m.seller_id ORDER BY p.id DESC) AS position,(a.plan_json::jsonb->>'productLimit')::integer AS slots
      FROM marketing_promotions m JOIN products p ON p.id=m.product_id JOIN active a ON a.seller_id=m.seller_id JOIN users u ON u.id=p.seller_id
      WHERE p.is_published=1 AND p.is_store_published=1 AND u.suspended=0 AND u.role IN ('seller','admin')
    ) SELECT id,name,category,price,"compareAtPrice",description,"imageUrl","sellerId" FROM selected WHERE position<=slots ORDER BY id DESC LIMIT 30`, [now()])
    res.json({ products: products.rows })
  })
}
