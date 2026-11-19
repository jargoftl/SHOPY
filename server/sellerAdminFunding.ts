import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
import {postSellerFunds} from './sellerFinance.ts'
export function registerSellerAdminFunding(app:Express,db:Database,auth:RequestHandler,role:(...roles:('customer'|'seller'|'admin')[])=>RequestHandler){
 app.get('/api/admin/seller-funding',auth,role('admin'),async(_req,res)=>{
  const [sellers,history]=await Promise.all([
   db.prepare("SELECT u.id,u.public_id AS publicId,u.full_name AS name,COALESCE(p.store_name,u.full_name) AS storeName,COALESCE(w.balance_cents,0) AS balanceCents,COALESCE(w.reserved_cents,0) AS reservedCents FROM users u LEFT JOIN seller_profiles p ON p.user_id=u.id LEFT JOIN seller_wallets w ON w.seller_id=u.id WHERE u.role='seller' AND u.suspended=0 ORDER BY u.id DESC").all(),
   db.prepare("SELECT f.*,u.full_name AS sellerName,a.full_name AS adminName FROM seller_fund_records f JOIN users u ON u.id=f.seller_id LEFT JOIN users a ON a.id=f.actor_id WHERE f.kind='admin_funding' ORDER BY f.id DESC LIMIT 100").all()])
  res.set('Cache-Control','no-store').json({sellers,history})
 })
 app.post('/api/admin/seller-funding',auth,role('admin'),async(req,res)=>{
  const {sellerId,amountCents,requestKey,verified}=req.body||{},reason=(typeof req.body?.reason==='string'?req.body.reason.trim():'') || 'Administrator action'
  if(!Number.isSafeInteger(sellerId)||sellerId<1||!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>100000000||!reason||reason.length>1000||!/^[a-f0-9-]{36}$/i.test(requestKey||'')||verified!==true)return res.status(400).json({error:'Choose a seller, enter a positive amount up to $1,000,000 and authorize the funding credit.'})
  try{await db.transaction(async()=>{
   if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='seller' AND suspended=0").get(sellerId))throw Object.assign(new Error('Seller not found.'),{status:404})
   const old=await db.prepare("SELECT seller_id,delta_cents,note,actor_id FROM seller_fund_records WHERE kind='admin_funding' AND reference=?").get(requestKey) as {seller_id:number,delta_cents:number,note:string,actor_id:number}|undefined
   if(old){if(old.seller_id!==sellerId||old.delta_cents!==amountCents||old.note!==reason||old.actor_id!==req.user!.id)throw Object.assign(new Error('That request key has already been used for a different funding action.'),{status:409});return}
   await postSellerFunds(db,sellerId,'admin_funding',requestKey,amountCents,0,req.user!.id,reason)
   await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'wallet','Admin funding added',?,'/seller/wallet')").run(sellerId,`$${(amountCents/100).toFixed(2)} credited to your seller wallet. ${reason}`)
  })()}catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
  res.json({ok:true})
 })
}
