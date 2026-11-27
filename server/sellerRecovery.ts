import type {Express,RequestHandler} from 'express'
import {rateLimit} from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import type {Database} from './database.ts'
import {generatePhrase,encryptPhrase,decryptPhrase,phraseHash,recoveryKey,normalizePhrase} from './recoveryCrypto.ts'

type Recovery={user_id:number,encrypted_phrase:string,phrase_hash:string,acknowledged:number}
type Account={id:number,role:string,password_hash:string,suspended:number,deleted_at:string|null,seller_status:string}
export function registerSellerRecovery(app:Express,db:Database,auth:RequestHandler){
 const configured:RequestHandler=(_req,res,next)=>{try{recoveryKey();next()}catch{res.status(503).json({error:'Recovery phrases are not configured. Contact support.'})}}
 const eligible=(u:{role:string,seller_status:string})=>u.role==='seller'||(u.role==='customer'&&['pending','needs_changes','rejected'].includes(u.seller_status))
 const seller:RequestHandler=(req,res,next)=>eligible(req.user!)?next():res.status(403).json({error:'Seller access required.'})
 const limit=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false})
 const account=async(id:number)=>await db.prepare('SELECT id,role,password_hash,suspended,deleted_at,seller_status FROM users WHERE id=? FOR UPDATE').get(id) as Account|undefined
 const active=(u:Account|undefined)=>u&&!u.suspended&&!u.deleted_at
 const passwordOk=(value:unknown)=>typeof value==='string'&&Buffer.byteLength(value)>=8&&Buffer.byteLength(value)<=72
 // Serialized against password changes, deletion and another browser's onboarding.
 app.post('/api/seller/recovery-phrase/setup',auth,seller,configured,async(req,res)=>{
  const result=await db.transaction(async()=>{
   const u=await account(req.user!.id);if(!active(u)||!eligible(u!))return null
   let r=await db.prepare('SELECT * FROM seller_recovery_phrases WHERE user_id=?').get(u!.id) as Recovery|undefined
   if(!r){const phrase=generatePhrase();await db.prepare('INSERT INTO seller_recovery_phrases(user_id,phrase_hash,encrypted_phrase) VALUES(?,?,?)').run(u!.id,phraseHash(phrase),encryptPhrase(phrase,u!.id));r=await db.prepare('SELECT * FROM seller_recovery_phrases WHERE user_id=?').get(u!.id) as Recovery}
   return r.acknowledged?{required:false}:{required:true,phrase:decryptPhrase(r.encrypted_phrase,u!.id)}
  })()
  if(!result)return res.status(403).json({error:'Seller access required.'})
  res.json(result)
 })
 app.post('/api/seller/recovery-phrase/acknowledge',auth,seller,configured,async(req,res)=>{
  if(typeof req.body?.phrase!=='string'||req.body.phrase.length>300)return res.status(400).json({error:'Save your phrase first.'})
  const r=await db.prepare('UPDATE seller_recovery_phrases SET acknowledged=1 WHERE user_id=? AND phrase_hash=?').run(req.user!.id,phraseHash(req.body.phrase))
  if(!r.changes)return res.status(400).json({error:'Phrase changed. Reload and save the latest phrase.'})
  res.json({ok:true})
 })
 const reveal=(admin:boolean):RequestHandler=>async(req,res)=>{
  if(admin&&(req.user!.role!=='admin'||req.body?.identityReviewed!==true))return res.status(403).json({error:'Administrator access and identity review required.'})
  const id=admin?Number(req.params.id):req.user!.id
  if(!Number.isSafeInteger(id)||id<1||!passwordOk(req.body?.password))return res.status(400).json({error:'Confirm your current password.'})
  const result=await db.transaction(async()=>{
   const actor=await account(req.user!.id)
   if(!active(actor)||(admin?actor!.role!=='admin':!eligible(actor!))||!await bcrypt.compare(req.body.password,actor!.password_hash))return null
   const target=await db.prepare("SELECT r.* FROM seller_recovery_phrases r JOIN users u ON u.id=r.user_id WHERE u.id=? AND (u.role='seller' OR (u.role='customer' AND u.seller_status IN ('pending','needs_changes','rejected'))) AND u.deleted_at IS NULL").get(id) as Recovery|undefined
   if(!target)return null
   const phrase=decryptPhrase(target.encrypted_phrase,id)
   if(admin)await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES(?,?,?,?)').run(id,actor!.id,'recovery_phrase_revealed','Account holder reviewed; encrypted recovery backup accessed.')
   return {phrase}
  })()
  if(!result)return res.status(403).json({error:'Unable to reveal phrase. Check your password and account access.'})
  res.json(result)
 }
 app.post('/api/seller/recovery-phrase/reveal',auth,seller,limit,configured,reveal(false))
 app.post('/api/admin/users/:id/recovery-phrase',auth,limit,configured,reveal(true))
 const resetLimit=rateLimit({windowMs:60*60*1000,max:5,standardHeaders:true,legacyHeaders:false})
 app.post('/api/auth/reset-with-phrase',resetLimit,configured,async(req,res)=>{
  const {email,phrase,password}=req.body||{}
  if(typeof email!=='string'||email.length>254||typeof phrase!=='string'||phrase.length>300||normalizePhrase(phrase).split(' ').length!==12||!passwordOk(password))return res.status(400).json({error:'Enter your email, 12-word phrase, and a password between 8 and 72 bytes.'})
  const hash=phraseHash(phrase),passwordHash=await bcrypt.hash(password,12)
  const ok=await db.transaction(async()=>{
   const u=await db.prepare("SELECT id FROM users WHERE email=? AND (role='seller' OR (role='customer' AND seller_status IN ('pending','needs_changes','rejected'))) AND deleted_at IS NULL AND suspended=0 FOR UPDATE").get(email.trim().toLowerCase()) as {id:number}|undefined
   if(!u)return false
   const consumed=await db.prepare('DELETE FROM seller_recovery_phrases WHERE user_id=? AND phrase_hash=? AND acknowledged=1').run(u.id,hash)
   if(!consumed.changes)return false
   await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash,u.id)
   await db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id)
   await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(u.id)
   await db.prepare('INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,?,?,?,?)').run(u.id,'account_recovery','Password reset','Your recovery phrase was used. Sign in and save your new phrase.','/seller/account/settings')
   return true
  })()
  if(!ok)return res.status(400).json({error:'Email or recovery phrase is incorrect.'})
  res.json({ok:true})
 })
}
