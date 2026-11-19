import type {Express,RequestHandler} from 'express'
import {rateLimit} from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import {randomBytes,createHash} from 'node:crypto'
import type {Database} from './database.ts'
export function registerAccountRecovery(app:Express,db:Database,auth:RequestHandler){
 const publicLimit=rateLimit({windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false})
 app.post('/api/auth/request-account-recovery',publicLimit,async(req,res)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():''
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:'Enter a valid email address.'})
  await db.transaction(async()=>{
   const user=await db.prepare('SELECT id FROM users WHERE email=? AND deleted_at IS NULL').get(email) as {id:number}|undefined
   if(!user)return
   const previous=await db.prepare('SELECT requested_at FROM account_recovery_requests WHERE user_id=?').get(user.id) as {requested_at:string}|undefined
   if(previous&&Date.now()-Date.parse(previous.requested_at)<60*60*1000)return
   await db.prepare("INSERT INTO account_recovery_requests(user_id,requested_at,status) VALUES(?,?,'pending') ON CONFLICT(user_id) DO UPDATE SET requested_at=excluded.requested_at,status='pending'").run(user.id,new Date().toISOString())
   await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) SELECT id,'account_recovery','Account recovery requested',?,? FROM users WHERE role='admin'").run('Verify the account holder before sharing a one-time password-reset link.',`/admin/users/${user.id}`)
  })()
  res.set('Cache-Control','no-store').json({ok:true})
 })
 const admin:RequestHandler=(req,res,next)=>{if(req.user!.role!=='admin')return res.status(403).json({error:'Administrator access required.'});res.set('Cache-Control','private, no-store');next()}
 app.get('/api/admin/account-recovery',auth,admin,async(_req,res)=>{
  const requests=await db.prepare('SELECT r.user_id AS "userId",r.requested_at AS "requestedAt",r.status,u.full_name AS "fullName",u.email,u.role FROM account_recovery_requests r JOIN users u ON u.id=r.user_id ORDER BY r.requested_at DESC LIMIT 100').all()
  res.json({requests})
 })
 const issueLimit=rateLimit({windowMs:15*60*1000,max:10,keyGenerator:req=>String(req.user!.id),standardHeaders:true,legacyHeaders:false})
 app.post('/api/admin/users/:id/recovery-link',auth,admin,issueLimit,async(req,res)=>{
  const id=Number(req.params.id),password=req.body?.password
  if(!Number.isSafeInteger(id)||id<1||typeof password!=='string'||Buffer.byteLength(password)>72||req.body?.identityReviewed!==true)return res.status(400).json({error:'Confirm your password and verify the account holder first.'})
  const actor=await db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user!.id) as {password_hash:string}
  if(!await bcrypt.compare(password,actor.password_hash))return res.status(403).json({error:'Your password is incorrect.'})
  let origin:string
  try{const url=new URL(process.env.APP_URL||'');if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();origin=url.origin}catch{return res.status(503).json({error:'Configure APP_URL with the HTTPS website address.'})}
  const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),expiresAt=new Date(Date.now()+30*60*1000).toISOString()
  const result=await db.transaction(async()=>{
   const current=await db.prepare('SELECT role,is_super_admin,password_hash,suspended FROM users WHERE id=?').get(req.user!.id) as {role:string,is_super_admin:number,password_hash:string,suspended:number}
   const user=await db.prepare('SELECT role,is_super_admin FROM users WHERE id=? AND deleted_at IS NULL').get(id) as {role:string,is_super_admin:number}|undefined
   if(current.role!=='admin'||current.suspended||current.password_hash!==actor.password_hash)return 403
   if(!user)return 404
   // Regular admins can recover buyers/sellers. Admin recovery belongs to the owner.
   if(user.role==='admin'&&(!current.is_super_admin||user.is_super_admin&&id!==req.user!.id))return 403
   await db.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').run(id,hash,expiresAt)
   await db.prepare("UPDATE account_recovery_requests SET status='link_issued' WHERE user_id=?").run(id)
   await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES(?,?,?,?)').run(id,req.user!.id,'recovery_link_issued','Account holder reviewed; one-time reset link issued. Expires in 30 minutes.')
   return 200
  })()
  if(result!==200)return res.status(result).json({error:result===404?'Account not found.':'You cannot recover this administrator account.'})
  res.json({resetUrl:`${origin}/reset-password#${token}`,expiresAt})
 })
}
