import {randomBytes} from 'node:crypto'
import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
import {postSellerFunds} from './sellerFinance.ts'
export async function ensureReferralCode(db:Database,userId:number){
 const existing=await db.prepare('SELECT code FROM seller_referral_codes WHERE seller_id=?').get(userId) as {code:string}|undefined
 if(existing)return existing.code
 for(let attempt=0;attempt<5;attempt++){
  const code=randomBytes(8).toString('hex').toUpperCase()
  await db.prepare('INSERT INTO seller_referral_codes(seller_id,code) VALUES(?,?) ON CONFLICT DO NOTHING').run(userId,code)
  const saved=await db.prepare('SELECT code FROM seller_referral_codes WHERE seller_id=?').get(userId) as {code:string}|undefined
  if(saved)return saved.code
 }
 throw new Error('Could not create referral code. Please try again.')
}
export async function referralOwner(db:Database,input:unknown){
 if(input===undefined||input===null||input==='')return null
 if(typeof input!=='string'||!/^[A-F0-9]{16}$/i.test(input.trim()))throw Object.assign(new Error('Referral code is invalid. Correct or clear it to continue.'),{status:400})
 const row=await db.prepare("SELECT r.seller_id AS sellerId,r.code FROM seller_referral_codes r JOIN users u ON u.id=r.seller_id JOIN seller_profiles p ON p.user_id=u.id WHERE r.code=? AND u.suspended=0 AND (u.role='seller' OR u.seller_status IN ('pending','needs_changes'))").get(input.trim().toUpperCase()) as {sellerId:number,code:string}|undefined
 if(!row)throw Object.assign(new Error('Referral code is unavailable. Correct or clear it to continue.'),{status:400})
 return row
}
export async function recordReferral(db:Database,owner:{sellerId:number,code:string},userId:number,kind:string){
 if(owner.sellerId===userId)return
 await db.prepare('INSERT INTO seller_referrals(referrer_id,referred_id,code,signup_kind) VALUES(?,?,?,?) ON CONFLICT(referred_id) DO NOTHING').run(owner.sellerId,userId,owner.code,kind)
 await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'referral','New referral registered',?,'/seller/referrals')").run(owner.sellerId,`A new ${kind} signed up using your referral code. Any reward requires administrator approval.`)
}
export function registerReferrals(app:Express,db:Database,auth:RequestHandler,role:(...roles:('customer'|'seller'|'admin')[])=>RequestHandler){
 app.get('/api/seller/referrals',auth,async(req,res)=>{
  if(!await db.prepare('SELECT user_id FROM seller_profiles WHERE user_id=?').get(req.user!.id))return res.status(403).json({error:'A seller application or seller account is required.'})
  const code=await db.transaction(()=>ensureReferralCode(db,req.user!.id))()
  const [referrals,summary]=await Promise.all([
   db.prepare('SELECT r.id,r.signup_kind AS signupKind,r.status,r.amount_cents AS amountCents,r.created_at AS createdAt,r.reviewed_at AS reviewedAt,u.public_id AS publicId,u.full_name AS name FROM seller_referrals r JOIN users u ON u.id=r.referred_id WHERE r.referrer_id=? ORDER BY r.id DESC LIMIT 200').all(req.user!.id),
   db.prepare("SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE status='pending') AS pending,COALESCE(SUM(amount_cents) FILTER(WHERE status='rewarded'),0) AS rewardedCents FROM seller_referrals WHERE referrer_id=?").get(req.user!.id)])
  res.set('Cache-Control','no-store').json({code,referrals,summary:{total:Number((summary as {total:unknown}).total),pending:Number((summary as {pending:unknown}).pending),rewardedCents:Number((summary as {rewardedCents:unknown}).rewardedCents)}})
 })
 app.get('/api/admin/referrals',auth,role('admin'),async(_req,res)=>{
  const [referrals,sellers]=await Promise.all([
   db.prepare('SELECT r.id,r.code,r.signup_kind AS signupKind,r.status,r.amount_cents AS amountCents,r.reason,r.created_at AS createdAt,r.reviewed_at AS reviewedAt,a.full_name AS adminName,s.id AS sellerId,s.public_id AS sellerPublicId,s.full_name AS sellerName,COALESCE(p.store_name,s.full_name) AS storeName,u.id AS referredId,u.public_id AS referredPublicId,u.full_name AS referredName,u.email AS referredEmail FROM seller_referrals r JOIN users s ON s.id=r.referrer_id JOIN users u ON u.id=r.referred_id LEFT JOIN seller_profiles p ON p.user_id=s.id LEFT JOIN users a ON a.id=r.admin_id ORDER BY r.id DESC LIMIT 500').all(),
   db.prepare('SELECT c.code,c.seller_id AS sellerId,u.full_name AS sellerName,u.public_id AS publicId,COALESCE(p.store_name,u.full_name) AS storeName,COUNT(r.id) AS signups,COALESCE(SUM(r.amount_cents) FILTER(WHERE r.status=\'rewarded\'),0) AS rewardedCents FROM seller_referral_codes c JOIN users u ON u.id=c.seller_id LEFT JOIN seller_profiles p ON p.user_id=u.id LEFT JOIN seller_referrals r ON r.referrer_id=c.seller_id GROUP BY c.code,c.seller_id,u.full_name,u.public_id,p.store_name ORDER BY c.seller_id DESC').all()])
  res.set('Cache-Control','no-store').json({referrals,sellers})
 })
 app.patch('/api/admin/referrals/:id',auth,role('admin'),async(req,res)=>{
  const id=Number(req.params.id),{status,amountCents}=req.body||{},reason=typeof req.body.reason==='string'?req.body.reason.trim():''
  if(!Number.isSafeInteger(id)||!['rewarded','rejected'].includes(status)||!reason||reason.length>500||(status==='rewarded'&&(!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>10000000)))return res.status(400).json({error:'Choose a decision, add a reason, and enter a positive reward up to $100,000.'})
  try{await db.transaction(async()=>{
   const row=await db.prepare('SELECT * FROM seller_referrals WHERE id=?').get(id) as {referrer_id:number,status:string,amount_cents:number,reason:string}|undefined
   if(!row)throw Object.assign(new Error('Referral not found.'),{status:404})
   const amount=status==='rewarded'?amountCents:0
   if(row.status!=='pending'){if(row.status===status&&row.amount_cents===amount&&row.reason===reason)return;throw Object.assign(new Error('This referral has already been reviewed.'),{status:409})}
   if(status==='rewarded'){
    if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='seller' AND suspended=0").get(row.referrer_id))throw Object.assign(new Error('Approve the referring seller before crediting a reward.'),{status:409})
    await postSellerFunds(db,row.referrer_id,'referral_reward',`referral:${id}`,amount,0,req.user!.id,reason)
   }
   await db.prepare('UPDATE seller_referrals SET status=?,amount_cents=?,reason=?,admin_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(status,amount,reason,req.user!.id,id)
   await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'referral',?,?,'/seller/referrals')").run(row.referrer_id,status==='rewarded'?'Referral reward credited':'Referral reviewed',status==='rewarded'?`$${(amount/100).toFixed(2)} was credited to your seller wallet. ${reason}`:reason)
  })()}catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
  res.json({ok:true})
 })
}
