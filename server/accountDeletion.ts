import {queuePhotoCleanup,type StoredVerificationPhoto} from './sellerVerification.ts'
import type {Express,RequestHandler} from 'express'
import {rateLimit} from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import {randomBytes} from 'node:crypto'
import type {Database} from './database.ts'
type Account={id:number,email:string,role:string,is_super_admin:number,suspended:number,deleted_at:string|null,password_hash:string}
export function registerAccountDeletion(app:Express,db:Database,auth:RequestHandler){
 const admin:RequestHandler=(req,res,next)=>{if(req.user!.role!=='admin')return res.status(403).json({error:'Administrator access required.'});res.set('Cache-Control','private, no-store');next()}
 const limit=rateLimit({windowMs:15*60*1000,max:10,keyGenerator:req=>String(req.user!.id),standardHeaders:true,legacyHeaders:false})
 app.delete('/api/admin/users/:id',auth,admin,limit,async(req,res)=>{
  const id=Number(req.params.id),password=req.body?.password,confirmEmail=req.body?.confirmEmail,reason=(typeof req.body?.reason==='string'?req.body.reason.trim():'')||'Account deleted by administrator'
  if(!Number.isSafeInteger(id)||id<1||typeof password!=='string'||Buffer.byteLength(password)>72||typeof confirmEmail!=='string'||!reason||reason.length>500)return res.status(400).json({error:'Confirm the account email, your administrator password.'})
  const actor=await db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id) as Account
  if(!await bcrypt.compare(password,actor.password_hash))return res.status(403).json({error:'Your password is incorrect.'})
  const unusableHash=await bcrypt.hash(randomBytes(32).toString('hex'),12)
  const status=await db.transaction(async()=>{
   const current=await db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id) as Account
   if(current.role!=='admin'||current.suspended||current.deleted_at||current.password_hash!==actor.password_hash)return 403
   const target=await db.prepare('SELECT * FROM users WHERE id=?').get(id) as Account|undefined
   if(!target)return 404
   if(id===current.id||target.is_super_admin||target.role==='admin'&&!current.is_super_admin)return 403
   if(confirmEmail!==target.email)return 400
   if(target.deleted_at)return 200
   const unsettled=await db.prepare(`SELECT 1 WHERE
    EXISTS(SELECT 1 FROM reward_balances WHERE user_id=? AND balance_units<>0) OR
    EXISTS(SELECT 1 FROM seller_wallets WHERE seller_id=? AND (balance_cents<>0 OR reserved_cents<>0)) OR
    EXISTS(SELECT 1 FROM buyer_wallet_holds WHERE user_id=? AND amount_cents<>0) OR
    EXISTS(SELECT 1 FROM purchase_orders o JOIN purchase_items i ON i.order_id=o.id WHERE i.seller_id=? AND o.status='paid' AND NOT EXISTS(SELECT 1 FROM seller_sale_releases r WHERE r.order_id=o.id AND r.seller_id=i.seller_id)) OR
    EXISTS(SELECT 1 FROM buyer_wallet_requests WHERE user_id=? AND status NOT IN ('confirmed','rejected')) OR
    EXISTS(SELECT 1 FROM seller_wallet_requests WHERE seller_id=? AND status NOT IN ('confirmed','rejected')) OR
    EXISTS(SELECT 1 FROM purchase_orders o JOIN purchase_sellers s ON s.order_id=o.id WHERE (o.buyer_id=? OR s.seller_id=?) AND (o.status IN ('awaiting_quote','awaiting_receipt','awaiting_review') OR (o.status='paid' AND s.status<>'delivered')))
   `).get(id,id,id,id,id,id,id,id)
   if(unsettled)return 409
   await db.prepare('UPDATE users SET deleted_at=?,deleted_by=?,suspended=1,password_hash=? WHERE id=?').run(new Date().toISOString(),current.id,unusableHash,id)
   await db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)
   await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(id)
   const photos=await db.prepare('SELECT id,kind,content_type AS "contentType",object_path AS "objectPath" FROM seller_verification_documents WHERE user_id=?').all(id) as StoredVerificationPhoto[]
   await queuePhotoCleanup(db,photos)
   await db.prepare('DELETE FROM seller_verification_documents WHERE user_id=?').run(id)
   await db.prepare('UPDATE seller_applications SET ssn_last4=NULL,ssn_encrypted=NULL WHERE user_id=?').run(id)
   await db.prepare('DELETE FROM seller_email_verifications WHERE email=?').run(target.email)
   await db.prepare("UPDATE seller_approval_emails SET status='failed',last_error='Account deleted' WHERE user_id=? AND status IN ('pending','sending')").run(id)
   await db.prepare("UPDATE seller_delivery_emails SET status='failed',last_error='Account deleted' WHERE seller_id=? AND status IN ('pending','sending')").run(id)
   await db.prepare('UPDATE products SET is_published=0,is_store_published=0 WHERE seller_id=?').run(id)
   await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES(?,?,?,?)').run(id,current.id,'account_deleted',reason)
   return 200
  })()
  if(status!==200)return res.status(status).json({error:status===409?'Settle balances, pending funding requests and unfinished orders before deleting this account.':status===404?'Account not found.':status===400?'The confirmation email does not match.':'You cannot delete yourself, a super admin, or an administrator without super-admin access.'})
  res.json({ok:true})
 })
}
