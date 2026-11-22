import {publicStoreReviewsSql} from './reviews.ts'
import {historicalSalesSummary,historicalSaleRows} from './sellerHistoricalSales.ts'
import { createHash, randomUUID } from 'node:crypto'
import {storeDates} from './storeDates.ts'
import {recordShipmentEvent} from './shipmentTracking.ts'
import express, { type Express, type RequestHandler } from 'express'
import { checkTransactionPin } from './transactionPin.ts'
import { rateLimit } from 'express-rate-limit'
import type { Database } from './database.ts'
import { ObjectStorage } from './storage.ts'

// User history exposes the action source, not the personal staff/account name.
// Full names and actor IDs remain in the private administration endpoints and ledger.
const financialActorLabel=(role:unknown)=>role==='admin'?'Support team':role==='seller'?'Store account':role==='customer'?'Account holder':'System'
const userFinanceEntry=(row:unknown)=>{
 if(!row||typeof row!=='object'||Array.isArray(row))return row
 const entry={...row} as Record<string,unknown>
 if(entry.kind==='withdrawal'){
  delete entry.address
  delete entry.network
  delete entry.instructions
 }
 if(entry.kind==='admin_funding'){
  delete entry.actor_id
  delete entry.actorName
  delete entry.actorRole
  entry.note=''
  return entry
 }
 if('actorName' in entry)entry.actorName=financialActorLabel(entry.actorRole)
 if(entry.confirmedBy)entry.confirmedBy=financialActorLabel(entry.confirmedRole)
 if('storeName' in entry)entry.storeName='Store account'
 if(entry.note==='Administrator action')entry.note='Support adjustment'
 return entry
}
const userActivityEntry=(row:unknown)=>{
 if(!row||typeof row!=='object'||!('kind' in row)) return row
 if(row.kind==='admin_funding') return {...row,kind:'wallet_credit',details:'Credited to wallet'}
 if(row.kind==='sale_confirmed') return {...row,details:'Paid sale proceeds confirmed.'}
 return row
}
export const sellerPaymentCoins = ['BTC','ETH','USDT','USDC','BNB','SOL','XRP','DOGE','LTC','TRX','TON','POL','AVAX','ADA']
const text = (v: unknown, max = 500) => typeof v === 'string' && v.trim().length <= max ? v.trim() : ''
function fail(message: string): never { throw Object.assign(new Error(message), { status: 409 }) }
function paymentDate(recorded:unknown):string {
 if(recorded===undefined)return new Date().toISOString()
 if(typeof recorded!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recorded))fail('Choose a valid payment date and time.')
 const date=new Date(recorded)
 if(!Number.isFinite(date.getTime())||date.toISOString()!==recorded||date.getTime()>Date.now())fail('Choose a valid payment date and time in the past.')
 return recorded
}
const rateValid = (v: string) => /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(v) && /[1-9]/.test(v)
const coinAmount = (cents: number, rate: string) => {
 const [whole,fraction=''] = rate.split('.')
 const denominator = BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'))
 const units=(BigInt(cents)*100000000000000n+denominator-1n)/denominator
 return `${units/100000000n}.${(units%100000000n).toString().padStart(8,'0')}`
}
type Wallet = { balance_cents: number, reserved_cents: number }
type WalletRequest = { id: number, public_id: string, seller_id: number, kind: string, status: string, amount_cents: number, coin: string, network: string, address: string, usd_rate: string, coin_amount: string, request_key: string }

// Called only within the caller's serialized database transaction.
export async function postSellerFunds(db: Database, seller: number, kind: string, reference: string, delta: number, reserve: number, actor: number, note='', effectiveAt:string|null=null) {
 if (await db.prepare('SELECT id FROM seller_fund_records WHERE kind=? AND reference=?').get(kind,reference)) return
 await db.prepare('INSERT INTO seller_wallets(seller_id) VALUES(?) ON CONFLICT DO NOTHING').run(seller)
 const before=await db.prepare('SELECT * FROM seller_wallets WHERE seller_id=?').get(seller) as Wallet
 const balance=before.balance_cents+delta, reserved=before.reserved_cents+reserve
 if (!Number.isSafeInteger(balance)||!Number.isSafeInteger(reserved)||reserved<0) fail('Invalid wallet movement.')
 if (reserve>0 && before.balance_cents-before.reserved_cents<reserve) fail('Insufficient available funds.')
 await db.prepare('UPDATE seller_wallets SET balance_cents=?,reserved_cents=? WHERE seller_id=?').run(balance,reserved,seller)
 await db.prepare('INSERT INTO seller_fund_records(seller_id,kind,reference,delta_cents,before_cents,after_cents,reserved_before,reserved_after,actor_id,note,effective_at) VALUES(?,?,?,?,?,?,?,?,?,?,?::timestamptz)').run(seller,kind,reference,delta,before.balance_cents,balance,before.reserved_cents,reserved,actor,note,effectiveAt)
}
export async function reverseSellerRelease(db: Database, order: number, seller: number, actor: number) {
 const release=await db.prepare("SELECT amount_cents,withdrawal_request_id FROM seller_sale_releases WHERE order_id=? AND seller_id=? AND status='released'").get(order,seller) as {amount_cents:number,withdrawal_request_id:number|null}|undefined
 if (!release) return
 if(release.withdrawal_request_id){
  const payout=await db.prepare("SELECT id,amount_cents FROM seller_wallet_requests WHERE id=? AND status='awaiting_transfer'").get(release.withdrawal_request_id) as {id:number,amount_cents:number}|undefined
  if(payout){
   await postSellerFunds(db,seller,'withdrawal_rejected',String(payout.id),0,-payout.amount_cents,actor)
   await db.prepare("UPDATE seller_wallet_requests SET status='rejected',instructions='The related sale was refunded.',reviewed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(actor,payout.id)
  }
 }
 await postSellerFunds(db,seller,'sale_refund',`${order}:${seller}`,-release.amount_cents,0,actor)
 await db.prepare("UPDATE seller_sale_releases SET status='reversed' WHERE order_id=? AND seller_id=?").run(order,seller)
}
export function registerSellerFinance(app: Express, db: Database, auth: RequestHandler, role: (...roles: ('customer'|'seller'|'admin')[])=>RequestHandler) {
 const protectedRoute=(handler: RequestHandler): RequestHandler => async(req,res,next)=>{try {await handler(req,res,next)} catch(error) {if((error as {status?:number}).status) res.status(409).json({error:(error as Error).message});else next(error)}}
 const notify=async(user:number,title:string,body:string)=>{await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'wallet',?,?, '/seller/wallet')").run(user,title,body)}
 const reviewNotice=async(title:string,body:string,section:'deposits'|'withdrawals')=>{await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) SELECT id,'wallet',?,?,? FROM users WHERE role='admin'").run(title,body,`/admin#payment-type-${section}`)}
 const queueWithdrawal=async(seller:number,requestKey:string,coin:string,amount:number,network:string,address:string,actor:number)=>{
  const result=await db.prepare("INSERT INTO seller_wallet_requests(seller_id,request_key,kind,coin,amount_cents,status,network,address) VALUES(?,?,?,?,?,'awaiting_transfer',?,?)").run(seller,requestKey,'withdrawal',coin,amount,network,address)
  await postSellerFunds(db,seller,'withdrawal_hold',String(result.lastInsertRowid),0,amount,actor)
  await reviewNotice('Withdrawal requested','A withdrawal is ready for review.','withdrawals')
  return result.lastInsertRowid
 }
 const requests=async(seller?:number,kind?:'deposit'|'withdrawal',account?:number,before?:number)=>{
 const where=[seller!==undefined||account!==undefined?'AND r.seller_id=?':'',kind?'AND r.kind=?':'',before!==undefined?'AND r.id<?':''].join(' ')
 const params=[seller??account,kind,before].filter(value=>value!==undefined)
 const rows=await db.prepare(`SELECT r.*,u.public_id AS sellerPublicId,${seller===undefined?'u.full_name AS sellerName,u.email AS sellerEmail,':''}COALESCE(p.store_name,u.full_name) AS storeName,
 (SELECT id FROM seller_wallet_receipts WHERE request_id=r.id) AS receiptId,
 EXISTS(SELECT 1 FROM seller_sale_releases release JOIN purchase_refunds refund
 ON refund.order_id=release.order_id AND refund.seller_id=release.seller_id
 WHERE release.withdrawal_request_id=r.id AND refund.status<>'rejected') AS refundPending
 FROM seller_wallet_requests r JOIN users u ON u.id=r.seller_id LEFT JOIN seller_profiles p ON p.user_id=r.seller_id WHERE r.archived_at IS NULL ${where} ORDER BY ${seller===undefined&&account===undefined?"CASE WHEN r.status IN ('awaiting_review','awaiting_transfer','requested') THEN 0 ELSE 1 END, ":''}${seller!==undefined?'COALESCE(r.resolved_at, CASE WHEN r.status IN (\'confirmed\',\'rejected\') THEN r.updated_at END, r.created_at)::timestamptz DESC, ':''}r.id DESC LIMIT 200`).all(...params)
 return (rows as Array<WalletRequest & {qr_image: string | null, qr_content_type: string | null}>).map(({qr_image,qr_content_type,...request})=>({...request,hasQr:Boolean(qr_image&&qr_content_type)}))
 }
 const sales=async(seller?:number)=>db.prepare(`SELECT o.id AS orderId,n.number AS orderNumber,i.seller_id AS sellerId,u.public_id AS sellerPublicId,
 COALESCE(p.store_name,u.full_name) AS storeName,o.coin,o.status AS paymentStatus,s.status AS deliveryStatus,o.created_at AS createdAt,
 SUM(i.price_cents*i.quantity)::bigint AS amountCents,MAX(r.status) AS releaseStatus,MAX(f.status) AS refundStatus,MAX(r.confirmed_role) AS confirmedRole,MAX(actor.full_name) AS confirmedBy,MAX(r.created_at) AS confirmedAt,MAX(o.account_balance_payment) AS accountBalancePayment
 FROM purchase_items i JOIN purchase_orders o ON o.id=i.order_id JOIN users u ON u.id=i.seller_id
 JOIN order_numbers n ON n.order_id=o.id AND n.kind='purchase' JOIN purchase_sellers s ON s.order_id=o.id AND s.seller_id=i.seller_id
 LEFT JOIN seller_profiles p ON p.user_id=u.id LEFT JOIN seller_sale_releases r ON r.order_id=o.id AND r.seller_id=i.seller_id
 LEFT JOIN users actor ON actor.id=r.admin_id LEFT JOIN purchase_refunds f ON f.order_id=o.id AND f.seller_id=i.seller_id
 ${seller===undefined?'':'WHERE i.seller_id=?'} GROUP BY o.id,n.number,i.seller_id,u.public_id,p.store_name,u.full_name,s.status
 ORDER BY o.id DESC LIMIT 500`).all(...(seller===undefined?[]:[seller]))
 const analytics=async(seller:number)=>{
 const orders=await sales(seller)
 const daily=await db.prepare(`WITH seller_orders AS (
  SELECT o.id,SUBSTRING(o.created_at,1,10) AS day,o.status,o.coin,o.account_balance_payment,
   SUM(i.price_cents*i.quantity)::bigint AS subtotal_cents,
   EXISTS (SELECT 1 FROM purchase_refunds f WHERE f.order_id=o.id AND f.seller_id=i.seller_id AND f.status='completed') AS refunded,
   EXISTS (SELECT 1 FROM seller_sale_releases r WHERE r.order_id=o.id AND r.seller_id=i.seller_id) AS released
  FROM purchase_orders o JOIN purchase_items i ON i.order_id=o.id
  WHERE i.seller_id=? GROUP BY o.id,i.seller_id
 )
 SELECT day,COUNT(*)::integer AS orders,
 COALESCE(SUM(subtotal_cents) FILTER (WHERE status='paid'),0)::bigint AS salesCents,
 COALESCE(SUM(subtotal_cents) FILTER (WHERE status='paid' AND coin='BALANCE'),0)::bigint AS creditSalesCents,
 COALESCE(SUM(subtotal_cents) FILTER (WHERE status='paid' AND account_balance_payment<>0 AND NOT released AND NOT refunded),0)::bigint AS pendingCents,
 COALESCE(SUM(subtotal_cents-ROUND(subtotal_cents::numeric*100/115)) FILTER (WHERE status='paid' AND NOT refunded),0)::bigint AS profitCents,
 COUNT(*) FILTER (WHERE status IN ('cancelled','canceled'))::integer AS cancelledOrders,
 COUNT(*) FILTER (WHERE refunded)::integer AS refundedOrders
 FROM seller_orders GROUP BY day ORDER BY day DESC`).all(seller)
 const overview=await db.prepare(`SELECT (SELECT COUNT(*)::integer FROM products WHERE seller_id=?) AS products,
 COALESCE((SELECT follower_count FROM seller_profiles WHERE user_id=?),0) AS followers,
 COALESCE((SELECT visitor_count FROM seller_profiles WHERE user_id=?),0) AS visits,
 (SELECT COALESCE(SUM(i.quantity),0)::bigint FROM purchase_items i JOIN purchase_orders o ON o.id=i.order_id WHERE i.seller_id=? AND o.status='paid') AS unitsSold,
 (SELECT COUNT(DISTINCT o.id)::integer FROM purchase_orders o JOIN purchase_items i ON i.order_id=o.id WHERE i.seller_id=? AND o.status='paid') AS paidOrders,
 (SELECT COALESCE(SUM(i.price_cents*i.quantity),0)::bigint FROM purchase_items i JOIN purchase_orders o ON o.id=i.order_id WHERE i.seller_id=? AND o.status='paid') AS salesCents,
 (SELECT COALESCE(SUM(amount_cents),0)::bigint FROM seller_sale_releases WHERE seller_id=? AND status='released') AS releasedCents`).get(seller,seller,seller,seller,seller,seller,seller)
 const chinaDay=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10)
 const historicalSales=await historicalSalesSummary(db,seller,chinaDay)
 const chinaToday=await db.prepare(`SELECT COUNT(DISTINCT o.id)::integer AS orders,
  COALESCE(SUM(i.price_cents*i.quantity) FILTER (WHERE o.status='paid'),0)::bigint AS salesCents,
  COALESCE((SELECT visits FROM store_china_daily_visits WHERE seller_id=? AND day=?),0)::bigint AS visits
  FROM purchase_orders o JOIN purchase_items i ON i.order_id=o.id
  WHERE i.seller_id=? AND (o.created_at::timestamptz AT TIME ZONE 'Asia/Shanghai')::date=?::date`).get(seller,chinaDay,seller,chinaDay)
 const funding=await db.prepare(`SELECT COALESCE(SUM(f.delta_cents),0)::bigint AS total_cents,
  COALESCE(SUM(f.delta_cents) FILTER (WHERE (COALESCE(f.effective_at,q.resolved_at::timestamptz,f.created_at::timestamptz) AT TIME ZONE 'Asia/Shanghai')::date=?::date),0)::bigint AS today_cents
  FROM seller_fund_records f LEFT JOIN seller_wallet_requests q
   ON f.kind='deposit' AND q.seller_id=f.seller_id AND q.id::text=f.reference
  WHERE f.seller_id=? AND f.kind IN ('deposit','admin_funding','historical_credit') AND f.delta_cents>0`)
  .get(chinaDay,seller)
 const dashboard=await db.prepare('SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id=?').get(seller) as {metrics_json:string}|undefined
 const rating=await db.prepare(`SELECT reviews.average_rating AS rating FROM seller_profiles ${publicStoreReviewsSql} WHERE seller_profiles.user_id=?`).get(seller) as {rating:number|null}|undefined
 const display=await db.prepare('SELECT values_json,updated_at FROM seller_stat_adjustments WHERE seller_id=?').get(seller) as {values_json:string,updated_at:string}|undefined
 return {chinaDay,chinaToday,funding,dashboardMetrics:dashboard?JSON.parse(dashboard.metrics_json):{},overallRating:rating?.rating??null,dates:await storeDates(db,seller),historicalSales,recentHistoricalSales:await historicalSaleRows(db,seller,3),today:new Date().toISOString().slice(0,10),overview,daily,orders,displayStats:display?JSON.parse(display.values_json):{},displayStatsUpdatedAt:display?.updated_at||null,activity:await db.prepare('SELECT * FROM seller_store_activity WHERE seller_id=? ORDER BY id DESC LIMIT 100').all(seller),visits:await db.prepare('SELECT day,visits FROM store_daily_visits WHERE seller_id=? ORDER BY day DESC').all(seller),
 products:await db.prepare(`SELECT i.product_id AS id,MAX(i.name) AS name,MAX(i.image_url) AS imageUrl,SUM(CASE WHEN o.status='paid' THEN i.quantity ELSE 0 END)::integer AS units,
 SUM(CASE WHEN o.status='paid' THEN i.price_cents*i.quantity ELSE 0 END)::bigint AS salesCents FROM purchase_items i JOIN purchase_orders o ON o.id=i.order_id WHERE i.seller_id=? AND o.status='paid' GROUP BY i.product_id ORDER BY "salesCents" DESC LIMIT 10`).all(seller)}
 }
 app.get('/api/seller/analytics',auth,role('seller','admin'),protectedRoute(async(req,res)=>{const data=await analytics(req.user!.id);res.set('Cache-Control','no-store').json({...data,orders:data.orders.map(userFinanceEntry),activity:data.activity.map(userActivityEntry)})}))
 app.get('/api/admin/sellers/:id/analytics',auth,role('admin'),protectedRoute(async(req,res)=>{res.json(await analytics(Number(req.params.id)))}))
 const configuredWallets = async () => {
 const rows = await db.prepare(`
  SELECT coin,network,address,usd_rate,qr_image,qr_content_type,0 AS priority FROM payment_wallets
  UNION ALL
  SELECT coin,network,address,usd_rate,qr_image,qr_content_type,1 AS priority FROM seller_payment_networks
  ORDER BY priority,coin,network
 `).all() as Array<{
  coin:string,network:string,address:string,usd_rate:string,qr_image:string|null,qr_content_type:string|null
 }>
 return rows.filter(wallet=>sellerPaymentCoins.includes(wallet.coin)&&wallet.network&&wallet.address&&rateValid(wallet.usd_rate||''))
 }
 const walletVersion=(wallet:Awaited<ReturnType<typeof configuredWallets>>[number])=>
  createHash('sha256').update(JSON.stringify([wallet.coin,wallet.network,wallet.address,wallet.usd_rate,wallet.qr_image,wallet.qr_content_type])).digest('hex')
 app.get('/api/seller/finance/deposit-wallets/:coin',auth,role('seller'),protectedRoute(async(req,res)=>{
  const wallet=(await configuredWallets()).find(wallet=>wallet.coin===req.params.coin&&(req.query.network===undefined||wallet.network===req.query.network))
  if(!wallet)return void res.status(404).json({error:'This deposit wallet is unavailable.'})
  const qrUrl=wallet.qr_image&&wallet.qr_content_type
   ? `data:${wallet.qr_content_type};base64,${(await new ObjectStorage().get(wallet.qr_image)).toString('base64')}`
   : null
  res.set('Cache-Control','no-store').json({coin:wallet.coin,network:wallet.network,address:wallet.address,usdRate:wallet.usd_rate,version:walletVersion(wallet),qrUrl})
 }))
 app.get('/api/seller/finance',auth,role('seller','admin'),protectedRoute(async(req,res)=>{
 const wallet=await db.prepare('SELECT balance_cents AS balanceCents,reserved_cents AS reservedCents FROM seller_wallets WHERE seller_id=?').get(req.user!.id)||{balanceCents:0,reservedCents:0}
 const revenue=await db.prepare("SELECT COALESCE(SUM(amount_cents),0)::bigint AS cents FROM seller_sale_releases WHERE seller_id=? AND status='released'").get(req.user!.id) as {cents:number}
 res.set('Cache-Control','no-store').json({wallet,accumulatedRevenueCents:revenue.cents,depositWallets:(await configuredWallets()).map(({coin,network})=>({coin,network})),sales:(await sales(req.user!.id)).map(userFinanceEntry),hasTransactionPin:Boolean(await db.prepare('SELECT user_id FROM transaction_security WHERE user_id=?').get(req.user!.id)),requests:(await requests(req.user!.id)).map(userFinanceEntry),records:(await db.prepare(`
   SELECT f.*,COALESCE(q.transaction_ref,f.transaction_ref) AS displayReference,
     q.resolved_at AS resolvedAt,u.full_name AS actorName,COALESCE(r.confirmed_role,u.role) AS actorRole,
     CASE WHEN seller.public_id='0099019176' THEN
       CASE
         WHEN COALESCE(q.transaction_ref,f.transaction_ref)='5376034972' AND f.delta_cents=7499999 THEN 1
         WHEN COALESCE(q.transaction_ref,f.transaction_ref)='8140542686' AND f.delta_cents=-2000000 THEN 2
       END
     END AS "historyPin",
     CASE WHEN seller.public_id='0099019176'
       AND COALESCE(q.transaction_ref,f.transaction_ref)='5376034972' AND f.delta_cents=7499999
       THEN '2026-05-20'
     END AS "historyDisplayDate"
   FROM seller_fund_records f
   JOIN users seller ON seller.id=f.seller_id
   LEFT JOIN seller_wallet_requests q ON f.kind IN ('deposit','withdrawal') AND q.seller_id=f.seller_id AND q.id::text=f.reference
   LEFT JOIN users u ON u.id=f.actor_id
   LEFT JOIN seller_sale_releases r ON f.kind='sale_release' AND f.reference=r.order_id || ':' || r.seller_id
   WHERE f.seller_id=? AND q.archived_at IS NULL
   ORDER BY "historyPin" NULLS LAST, COALESCE(f.effective_at,q.resolved_at::timestamptz,f.created_at::timestamptz) DESC,f.id DESC
   LIMIT 1000
 `).all(req.user!.id)).map(userFinanceEntry)})
 }))
 app.post('/api/seller/finance/requests',auth,role('seller'),rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many wallet attempts. Please try again later.'}}),protectedRoute(async(req,res)=>{
 const {kind,coin,amountCents,requestKey}=req.body||{}
 if(!['deposit','withdrawal'].includes(kind)||!sellerPaymentCoins.includes(coin)||!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>100000000||!/^[-a-f0-9]{36}$/i.test(requestKey||'')) return void res.status(400).json({error:'Enter a valid amount (up to $1,000,000), coin and request key.'})
 const network=text(req.body.network,100),address=text(req.body.address,500)
 if(kind==='withdrawal'&&(!network||!address)) return void res.status(400).json({error:'Enter your receiving network and wallet address.'})
 const pinError=await checkTransactionPin(db,req.user!.id,req.body.transactionPin)
 if(pinError) return void res.status(403).json({error:pinError})
 const result=await db.transaction(async()=>{
 const existing=await db.prepare('SELECT * FROM seller_wallet_requests WHERE seller_id=? AND request_key=?').get(req.user!.id,requestKey) as WalletRequest|undefined
 if(existing) {
  if(existing.kind!==kind||existing.coin!==coin||existing.amount_cents!==amountCents||(kind==='deposit'&&req.body.paymentNetwork!==undefined&&existing.network!==req.body.paymentNetwork)||(kind==='withdrawal'&&(existing.address!==address||existing.network!==network))) fail('Request key already used for different details.')
  return {id:existing.id,status:existing.status}
 }
 if(kind==='deposit'){
  const wallet=(await configuredWallets()).find(wallet=>wallet.coin===coin&&(req.body.paymentNetwork===undefined||wallet.network===req.body.paymentNetwork))
  if(!wallet) fail('This deposit wallet is unavailable. Choose a configured wallet.')
  if(req.body.walletVersion!==undefined&&req.body.walletVersion!==walletVersion(wallet)){
   fail('The receiving wallet changed. If you already sent funds, contact support before sending again.')
  }
  const result=await db.prepare("INSERT INTO seller_wallet_requests(seller_id,request_key,kind,coin,amount_cents,status,network,address,usd_rate,coin_amount,qr_image,qr_content_type) VALUES(?,?,?,?,?,'awaiting_receipt',?,?,?,?,?,?)")
   .run(req.user!.id,requestKey,kind,coin,amountCents,wallet.network,wallet.address,wallet.usd_rate,coinAmount(amountCents,wallet.usd_rate),wallet.qr_image,wallet.qr_content_type)
  return {id:result.lastInsertRowid,status:'awaiting_receipt'}
 }
 const id=await queueWithdrawal(req.user!.id,requestKey,coin,amountCents,network,address,req.user!.id)
 return {id,status:'awaiting_transfer'}
 })()
 res.status(201).json({ok:true,...result})
 }))
 app.get('/api/seller/finance/requests/:id/qr',auth,role('seller'),protectedRoute(async(req,res)=>{
 const wallet=await db.prepare("SELECT qr_image,qr_content_type FROM seller_wallet_requests WHERE id=? AND seller_id=? AND kind='deposit'").get(Number(req.params.id),req.user!.id) as {qr_image:string|null,qr_content_type:string|null}|undefined
 if(!wallet?.qr_image||!wallet.qr_content_type) return void res.status(404).json({error:'No QR screenshot is available for this deposit.'})
 const image=await new ObjectStorage().get(wallet.qr_image)
 res.set('Cache-Control','no-store').type(wallet.qr_content_type).send(image)
 }))
 app.post('/api/seller/finance/requests/:id/receipt',auth,role('seller'),express.raw({type:['image/png','image/jpeg','application/pdf'],limit:'2mb'}),protectedRoute(async(req,res)=>{
 const image=req.body as Buffer
 const contentType=req.is(['image/png','image/jpeg','application/pdf'])
 const png=contentType==='image/png'&&Buffer.isBuffer(image)&&image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
 const jpeg=contentType==='image/jpeg'&&Buffer.isBuffer(image)&&image[0]===255&&image[1]===216&&image[2]===255
 const pdf=contentType==='application/pdf'&&Buffer.isBuffer(image)&&/^%PDF-[12]\.\d(?:\r|\n)/.test(image.toString('ascii',0,12))
 if(!png&&!jpeg&&!pdf) return void res.status(400).json({error:'Upload a PDF, PNG or JPEG receipt up to 2 MB.'})
 const rawReference=req.get('X-Payment-Reference')
 let reference:string|null=null
 if(rawReference!==undefined){
  try {reference=text(decodeURIComponent(rawReference),300)||null} catch {return void res.status(400).json({error:'Enter a valid transaction reference.'})}
  if(!reference||/[\r\n]/.test(reference)) return void res.status(400).json({error:'Enter a valid transaction reference.'})
 }
 const storage=new ObjectStorage()
 await storage.verifyBucket()
 await db.transaction(async()=>{
 const request=await db.prepare('SELECT * FROM seller_wallet_requests WHERE id=? AND seller_id=?').get(Number(req.params.id),req.user!.id) as WalletRequest|undefined
 if(!request||request.kind!=='deposit'||request.status!=='awaiting_receipt') fail('This deposit is not awaiting a receipt.')
 await db.prepare('INSERT INTO seller_wallet_receipts(request_id,content_type,image) VALUES(?,?,?)').run(request.id,contentType,await storage.put(image,String(contentType)))
 await db.prepare("UPDATE seller_wallet_requests SET status='awaiting_review',submitted_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reference,request.id)
 await reviewNotice('Deposit proof received','A deposit is ready for verification.','deposits')
 })()
 res.json({ok:true})
 }))
 app.get('/api/seller/finance/receipts/:id',auth,protectedRoute(async(req,res)=>{
 const row=await db.prepare('SELECT r.image,r.content_type,q.seller_id FROM seller_wallet_receipts r JOIN seller_wallet_requests q ON q.id=r.request_id WHERE r.id=?').get(Number(req.params.id)) as {image:Buffer,content_type:string,seller_id:number}|undefined
 if(!row||(req.user!.role!=='admin'&&row.seller_id!==req.user!.id)) return void res.status(404).json({error:'Receipt not found.'})
 res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').type(row.content_type)
 if(row.content_type==='application/pdf')res.attachment(`deposit-receipt-${Number(req.params.id)}.pdf`)
 res.send(row.image)
 }))
 app.get('/api/admin/seller-finance',auth,role('admin'),protectedRoute(async(req,res)=>{
 const view=req.query.view
 res.set('Cache-Control','no-store')
 if(view==='deposit'||view==='withdrawal'){
  const account=req.query.sellerId===undefined?undefined:Number(req.query.sellerId)
  const before=req.query.before===undefined?undefined:Number(req.query.before)
  if([account,before].some(value=>value!==undefined&&(!Number.isSafeInteger(value)||value<1))||(before!==undefined&&account===undefined)){
   return void res.status(400).json({error:'Choose a valid account and history page.'})
  }
  const queue=await requests(undefined,view,account,before)
  const accounts=await db.prepare(`SELECT u.id,u.full_name AS name,u.email FROM users u
   WHERE EXISTS(SELECT 1 FROM seller_wallet_requests r WHERE r.seller_id=u.id AND r.kind=?)
   ORDER BY lower(u.full_name),u.id`).all(view)
  res.json({requests:queue,accounts,nextBefore:account!==undefined&&queue.length===200?queue.at(-1)?.id:null,
   paymentWallets:view==='deposit'?(await configuredWallets()).map(({coin,network,address,usd_rate})=>({coin,network,address,usd_rate})):[]})
  return
 }
 const wallets=await db.prepare('SELECT w.*,u.public_id AS publicId,u.full_name AS name FROM seller_wallets w JOIN users u ON u.id=w.seller_id ORDER BY seller_id').all()
 if(view==='sales'){res.json({sales:await sales(),wallets});return}
 res.json({requests:await requests(),sales:await sales(),wallets,paymentWallets:(await configuredWallets()).map(({coin,network,address,usd_rate})=>({coin,network,address,usd_rate}))})
 }))
 // Called inside a transaction so that hiding a pending withdrawal also releases its hold.
 const archiveRequest=async(request:WalletRequest,actor:number)=>{
  if(request.kind==='withdrawal'&&request.status==='awaiting_transfer'){
   await postSellerFunds(db,request.seller_id,'withdrawal_rejected',String(request.id),0,-request.amount_cents,actor)
  }
  await db.prepare(`UPDATE seller_wallet_requests SET
   status=CASE WHEN status='confirmed' THEN status ELSE 'rejected' END,
   archived_at=CURRENT_TIMESTAMP,archived_by=? WHERE id=?`).run(actor,request.id)
 }
 app.post('/api/admin/seller-finance/requests/:id/archive',auth,role('admin'),protectedRoute(async(req,res)=>{
  const id=Number(req.params.id)
  if(!Number.isSafeInteger(id)||id<1)return void res.status(404).json({error:'Request not found.'})
  const found=await db.transaction(async()=>{
   const request=await db.prepare('SELECT id,seller_id,kind,status,amount_cents,archived_at FROM seller_wallet_requests WHERE id=?').get(id) as (WalletRequest&{archived_at:string|null})|undefined
   if(!request)return false
   if(request.archived_at)return true
   if(!['confirmed','rejected'].includes(request.status)&&req.body?.confirmUnsent!==true)fail('Confirm that funds have not been transferred before removing this pending payment.')
   await archiveRequest(request,req.user!.id)
   return true
  })()
  if(!found)return void res.status(404).json({error:'Request not found.'})
  res.json({ok:true})
 }))
 app.post('/api/admin/seller-finance/requests/archive',auth,role('admin'),protectedRoute(async(req,res)=>{
 const {kind,sellerId,confirmUnsent}=req.body||{}
 if(!['deposit','withdrawal'].includes(kind)||confirmUnsent!==true||
    (sellerId!==undefined&&(!Number.isSafeInteger(sellerId)||sellerId<1))){
  return void res.status(400).json({error:'Confirm the requests have no completed transfer before clearing the queue.'})
 }
 const archived=await db.transaction(async()=>{
  const scope=sellerId===undefined?'':'AND seller_id=?'
  const params=sellerId===undefined?[kind]:[kind,sellerId]
  const rows=await db.prepare(`SELECT id,seller_id,kind,status,amount_cents FROM seller_wallet_requests
   WHERE kind=? AND archived_at IS NULL AND status<>'confirmed' ${scope}`).all(...params) as WalletRequest[]
  for(const request of rows)await archiveRequest(request,req.user!.id)
  return rows.length
 })()
 res.json({archived})
 }))
 app.patch('/api/admin/seller-finance/requests/:id',auth,role('admin'),protectedRoute(async(req,res)=>{
 await db.transaction(async()=>{
 const q=await db.prepare('SELECT * FROM seller_wallet_requests WHERE id=? AND archived_at IS NULL').get(Number(req.params.id)) as (WalletRequest&{resolved_at:string|null,updated_at:string})|undefined
 if(!q) fail('Request not found.')
 const request=q!,action=req.body?.action
 if(action==='edit-date'){
  if(request.status!=='confirmed')fail('Only accepted payments have a recorded payment date.')
  const resolvedAt=paymentDate(req.body.recordedAt)
  await db.prepare('UPDATE seller_wallet_requests SET resolved_at=? WHERE id=?').run(resolvedAt,request.id)
  await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES(?,?,?,?)')
   .run(request.seller_id,req.user!.id,'Payment date updated',JSON.stringify({requestId:request.id,from:request.resolved_at||request.updated_at,to:resolvedAt}))
  return
 }
 if(['confirmed','rejected'].includes(request.status)) fail('This request is already closed.')
 if(action==='quote') {
 if(!(request.kind==='deposit'&&request.status==='requested')&&!(request.kind==='withdrawal'&&request.status==='awaiting_transfer'&&!request.usd_rate)) fail('This request already has locked payment instructions.')
 const network=request.kind==='withdrawal'?request.network:text(req.body.network,80),address=request.kind==='withdrawal'?request.address:text(req.body.address,200),rate=text(req.body.usdRate,30)
 if(!network||!address||!rateValid(rate)) fail('Enter a valid network, payment wallet and USD exchange rate.')
 await db.prepare("UPDATE seller_wallet_requests SET network=?,address=?,usd_rate=?,coin_amount=?,instructions=?,status=?,updated_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(network,address,rate,coinAmount(request.amount_cents,rate),text(req.body.instructions,1000),request.kind==='deposit'?'awaiting_receipt':'awaiting_transfer',req.user!.id,request.id)
 } else if(action==='reject') {
 if(request.kind==='withdrawal') await postSellerFunds(db,request.seller_id,'withdrawal_rejected',String(request.id),0,-request.amount_cents,req.user!.id)
 await db.prepare("UPDATE seller_wallet_requests SET status='rejected',instructions='',reviewed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.user!.id,request.id)
 } else if(action==='confirm'||action==='accept') {
 const simple=action==='accept'
 if(simple&&request.kind!=='withdrawal')fail('This request cannot be accepted here.')
 if(!simple&&req.body.verified!==true)fail('Verify the transfer before accepting this payment.')
 const reference=simple?null:text(req.body.transferReference,300)||null
 if(!simple&&request.kind==='withdrawal'&&!reference)fail('Enter the transaction reference for this transfer.')
 const rate=request.usd_rate||(!simple?text(req.body.usdRate,30):'')
 if((!simple&&!rateValid(rate))||request.status!==(request.kind==='deposit'?'awaiting_review':'awaiting_transfer')||
    (request.kind==='deposit'&&!request.usd_rate)) fail('This request is not ready to confirm.')
 const resolvedAt=paymentDate(req.body.recordedAt)
 if(request.kind==='withdrawal'&&await db.prepare(`SELECT 1 FROM seller_sale_releases r
  JOIN purchase_refunds f ON f.order_id=r.order_id AND f.seller_id=r.seller_id
  WHERE r.withdrawal_request_id=? AND f.status<>'rejected'`).get(request.id)) fail('Resolve the related refund before sending this withdrawal.')
 if(request.kind==='withdrawal'){
  const wallet=await db.prepare('SELECT balance_cents,reserved_cents FROM seller_wallets WHERE seller_id=?').get(request.seller_id) as Wallet|undefined
  if(!wallet||wallet.reserved_cents<request.amount_cents||wallet.balance_cents<wallet.reserved_cents)fail('The wallet no longer covers this withdrawal.')
 }
 if(reference&&await db.prepare('SELECT id FROM seller_wallet_requests WHERE coin=? AND network=? AND transfer_reference=?').get(request.coin,request.network,reference)) fail('That transfer has already been recorded.')
 if(request.kind==='deposit'&&!reference){
  const proof=await db.prepare('SELECT image AS proof FROM seller_wallet_receipts WHERE request_id=?').get(request.id) as {proof:string}|undefined
  if(!proof)fail('Payment proof is required.')
  if(await db.prepare(`SELECT 1 FROM seller_wallet_receipts receipt
   JOIN seller_wallet_requests previous ON previous.id=receipt.request_id
   WHERE receipt.image=? AND previous.kind='deposit' AND previous.status='confirmed' LIMIT 1`).get(proof.proof)){
   fail('This payment proof has already been credited.')
  }
 }
 await postSellerFunds(db,request.seller_id,request.kind,String(request.id),request.kind==='deposit'?request.amount_cents:-request.amount_cents,request.kind==='withdrawal'?-request.amount_cents:0,req.user!.id)
 await db.prepare("UPDATE seller_wallet_requests SET status='confirmed',transfer_reference=?,usd_rate=?,coin_amount=?,resolved_at=?,reviewed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reference,rate||null,request.coin_amount||(rate?coinAmount(request.amount_cents,rate):null),resolvedAt,req.user!.id,request.id)
 } else fail('Choose accept, confirm, quote or reject.')
 const deposit=request.kind==='deposit'
 const amount=`$${(request.amount_cents/100).toFixed(2)}`
 if(action==='confirm'||action==='accept') await notify(request.seller_id,deposit?'Wallet credited':'Wallet debited',`${amount} ${deposit?'credited to':'debited from'} your wallet.`)
 else if(action==='reject') await notify(request.seller_id,deposit?'Deposit rejected':'Withdrawal rejected',deposit?'Your deposit was rejected.':'Your withdrawal was rejected and the hold was released.')
 else await notify(request.seller_id,deposit?'Deposit instructions ready':'Withdrawal details ready',deposit?'View your payment details in My wallet.':'Your withdrawal is awaiting transfer.')
 })()
 res.json({ok:true})
 }))
 const releaseSale:RequestHandler=protectedRoute(async(req,res)=>{
 const order=Number(req.body.orderId),seller=Number(req.body.sellerId)
 if(req.user!.role==='seller'&&seller!==req.user!.id)return void res.status(403).json({error:'You can only confirm sales for your own store.'})
 const destination=req.body.destination??'wallet'
 const coin=text(req.body.coin,20),network=text(req.body.network,100),address=text(req.body.address,500)
 if(!['wallet','crypto'].includes(destination))return void res.status(400).json({error:'Choose a payout destination.'})
 if(destination==='crypto'){
  if(req.user!.role!=='seller'||!sellerPaymentCoins.includes(coin)||!network||!address||/[\r\n]/.test(network+address)){
   return void res.status(400).json({error:'Enter the coin, network and receiving address for your crypto wallet.'})
  }
 }
 if(req.user!.role==='seller'){
  const pinError=await checkTransactionPin(db,seller,req.body.transactionPin)
  if(pinError)return void res.status(403).json({error:pinError})
 }
 await db.transaction(async()=>{
 const eligible=await db.prepare(`SELECT o.status,o.coin,o.account_balance_payment AS funded,s.status AS fulfillment,SUM(i.price_cents*i.quantity)::bigint AS amount
 FROM purchase_orders o JOIN purchase_sellers s ON s.order_id=o.id JOIN purchase_items i ON i.order_id=o.id AND i.seller_id=s.seller_id
 WHERE o.id=? AND s.seller_id=? GROUP BY o.id,s.status`).get(order,seller) as {status:string,coin:string,funded:number,fulfillment:string,amount:number}|undefined
 if(!eligible||eligible.status!=='paid')fail('The buyer must pay from their account balance before this sale can be confirmed.')
 if(!eligible.funded&&(req.user!.role!=='admin'||eligible.coin==='BALANCE'||eligible.fulfillment!=='delivered'))fail('Legacy sales require admin review; legacy store credit cannot be released.')
 if(await db.prepare("SELECT id FROM purchase_refunds WHERE order_id=? AND seller_id=? AND status<>'rejected'").get(order,seller)) fail('Resolve this order’s refund before releasing funds.')
 if(req.body.verified!==true||req.body.amountCents!==eligible.amount) fail('Confirm the full product-sale amount before release.')
 if(await db.prepare('SELECT 1 FROM seller_sale_releases WHERE order_id=? AND seller_id=?').get(order,seller)) fail('This sale has already been released.')
 if(req.user!.role==='seller'){
  const wallet=await db.prepare('SELECT balance_cents,reserved_cents FROM seller_wallets WHERE seller_id=? FOR UPDATE').get(seller) as Wallet|undefined
  const available=Math.max(0,(wallet?.balance_cents??0)-(wallet?.reserved_cents??0))
  if(available<eligible.amount){
   const shortfall=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((eligible.amount-available)/100)
   fail(`Insufficient available wallet balance. Deposit at least ${shortfall} and wait for it to be credited before accepting this order.`)
  }
 }
 if(destination==='crypto'&&eligible.amount>100000000)fail('This sale exceeds the per-withdrawal limit. Credit it to your SHOPY wallet to withdraw in smaller amounts.')
 await db.prepare("INSERT INTO seller_sale_releases(order_id,seller_id,amount_cents,status,admin_id,confirmed_role) VALUES(?,?,?,'released',?,?)").run(order,seller,eligible.amount,req.user!.id,req.user!.role)
 await postSellerFunds(db,seller,'sale_release',`${order}:${seller}`,eligible.amount,0,req.user!.id)
 if(destination==='crypto'){
  const withdrawal=await queueWithdrawal(seller,randomUUID(),coin,eligible.amount,network,address,req.user!.id)
  await db.prepare('UPDATE seller_sale_releases SET withdrawal_request_id=? WHERE order_id=? AND seller_id=?').run(withdrawal,order,seller)
 }
 if(eligible.fulfillment==='pending')await recordShipmentEvent(db,order,seller,'confirmed',req.user!.id,req.user!.role,'Paid sale confirmed')
 await db.prepare("UPDATE purchase_sellers SET status='confirmed' WHERE order_id=? AND seller_id=? AND status='pending'").run(order,seller)
 await db.prepare("INSERT INTO seller_store_activity(seller_id,kind,details) VALUES(?,'sale_confirmed',?)").run(seller,`${req.user!.role==='admin'?'Administrator':'Store owner'} ${req.user!.full_name} confirmed ${eligible.amount} cents of paid sale proceeds.`)
 if(destination==='crypto')await notify(seller,'Withdrawal requested','Your sale proceeds are reserved for transfer to your crypto wallet.')
 else await notify(seller,'Wallet credited','The sale amount has been credited to your wallet.')
 })()
 res.json({ok:true})
 })
 app.post('/api/admin/seller-finance/releases',auth,role('admin'),releaseSale)
 app.post('/api/seller/finance/confirm-purchase',auth,role('seller'),
  rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,skipSuccessfulRequests:true,message:{error:'Too many confirmation attempts. Try again later.'}}),
  protectedRoute(async(req,res,next)=>{
   const {transactionPin,orderId,amountCents}=req.body??{}
   req.body={transactionPin,orderId,amountCents,sellerId:req.user!.id,verified:true,destination:'wallet'}
   return releaseSale(req,res,next)
  }))
 app.post('/api/seller/finance/releases',auth,role('seller'),releaseSale)
}
