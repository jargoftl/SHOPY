import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
export function registerAdminBuyerFunding(app:Express,db:Database,auth:RequestHandler,role:(...roles:('customer'|'seller'|'admin')[])=>RequestHandler){
 app.get('/api/admin/buyer-funding',auth,role('admin'),async(_req,res)=>{
  const [buyers,history]=await Promise.all([
   db.prepare("SELECT u.id,u.public_id AS publicId,u.full_name AS name,COALESCE(w.balance_units,0) AS balanceCents FROM users u LEFT JOIN reward_balances w ON w.user_id=u.id WHERE u.role='customer' AND u.suspended=0 ORDER BY u.id DESC").all(),
   db.prepare('SELECT f.id,f.amount_cents AS delta_cents,f.before_cents,f.after_cents,f.reason AS note,f.created_at,u.full_name AS buyerName,a.full_name AS adminName FROM admin_buyer_funding f JOIN users u ON u.id=f.buyer_id JOIN users a ON a.id=f.admin_id ORDER BY f.id DESC LIMIT 100').all()])
  res.set('Cache-Control','no-store').json({buyers,history})
 })
 app.post('/api/admin/buyer-funding',auth,role('admin'),async(req,res)=>{
  const {buyerId,amountCents,requestKey,verified}=req.body||{},reason=(typeof req.body?.reason==='string'?req.body.reason.trim():'') || 'Administrator action'
  if(!Number.isSafeInteger(buyerId)||buyerId<1||!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>100000000||!reason||reason.length>1000||!/^[a-f0-9-]{36}$/i.test(requestKey||'')||verified!==true)return res.status(400).json({error:'Choose a buyer, enter a positive amount up to $1,000,000 and authorize the credit.'})
  try{await db.transaction(async()=>{
   const existing=await db.prepare('SELECT buyer_id,amount_cents,reason,admin_id FROM admin_buyer_funding WHERE request_key=?').get(requestKey) as {buyer_id:number,amount_cents:number,reason:string,admin_id:number}|undefined
   if(existing){if(existing.buyer_id!==buyerId||existing.amount_cents!==amountCents||existing.reason!==reason||existing.admin_id!==req.user!.id)throw Object.assign(new Error('That request key was already used for another funding action.'),{status:409});return}
   if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='customer' AND suspended=0").get(buyerId))throw Object.assign(new Error('Active buyer not found.'),{status:404})
   const wallet=await db.prepare('SELECT balance_units FROM reward_balances WHERE user_id=?').get(buyerId) as {balance_units:number}|undefined
   const before=wallet?.balance_units||0,after=before+amountCents
   if(!Number.isSafeInteger(after))throw Object.assign(new Error('Balance exceeds the supported limit.'),{status:400})
   await db.prepare('INSERT INTO reward_balances(user_id,balance_units) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance_units=excluded.balance_units').run(buyerId,after)
   await db.prepare('INSERT INTO admin_buyer_funding(buyer_id,amount_cents,before_cents,after_cents,reason,admin_id,request_key) VALUES(?,?,?,?,?,?,?)').run(buyerId,amountCents,before,after,reason,req.user!.id,requestKey)
   await db.prepare('INSERT INTO reward_history(user_id,admin_id,adjustment_units,balance_units,reason) VALUES(?,?,?,?,?)').run(buyerId,req.user!.id,amountCents,after,reason)
   await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'wallet','Credited to wallet',?,'/profile/wallet')").run(buyerId,`$${(amountCents/100).toFixed(2)} credited to your wallet.`)
  })()}catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
  res.json({ok:true})
 })
}
