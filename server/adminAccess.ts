import {rateLimit} from 'express-rate-limit'
import type {Express,RequestHandler} from 'express'
import bcrypt from 'bcryptjs'
import type {Database} from './database.ts'
type Account={id:number,role:string,is_super_admin:number,suspended:number,password_hash:string,seller_status:string}
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status})
export function registerAdminAccess(app:Express,db:Database,auth:RequestHandler){
 const owner:RequestHandler=async(req,res,next)=>{
  const current=await db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND is_super_admin=1 AND suspended=0").get(req.user!.id)
  if(!current)return res.status(403).json({error:'Only the super admin can manage administrator access.'})
  res.set('Cache-Control','private, no-store');next()
 }
 app.get('/api/admin/access',auth,owner,async(req,res)=>{
  const search=typeof req.query.search==='string'?req.query.search.trim().slice(0,254):''
  const accounts=await db.prepare(`SELECT id,public_id AS "publicId",full_name AS "fullName",email,role,is_super_admin AS "isSuperAdmin",suspended FROM users
    WHERE deleted_at IS NULL AND (role='admin' OR (?<>'' AND (lower(email)=lower(?) OR public_id=?))) ORDER BY is_super_admin DESC,id LIMIT 100`).all(search,search,search.replace(/^#/,''))
  const history=await db.prepare(`SELECT h.id,h.action,h.details,h.created_at AS "createdAt",u.email AS "targetEmail",a.email AS "adminEmail" FROM account_admin_history h JOIN users u ON u.id=h.user_id JOIN users a ON a.id=h.admin_id WHERE h.action IN ('admin_granted','admin_removed') ORDER BY h.id DESC LIMIT 100`).all()
  res.json({accounts,history})
 })
 const changes=rateLimit({windowMs:15*60*1000,max:10,keyGenerator:req=>String(req.user!.id),standardHeaders:true,legacyHeaders:false,message:{error:'Too many access changes. Try again in 15 minutes.'}})
 app.patch('/api/admin/access/:id',auth,owner,changes,async(req,res)=>{
  const id=Number(req.params.id),action=req.body?.action,password=req.body?.password,expectedRole=req.body?.expectedRole
  if(!Number.isSafeInteger(id)||id<1||!['grant','remove'].includes(action)||typeof password!=='string'||Buffer.byteLength(password)>72||!['customer','seller','admin'].includes(expectedRole))return res.status(400).json({error:'Choose an account and confirm your password.'})
  try{
   const actor=await db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id) as Account
   if(!await bcrypt.compare(password,actor.password_hash))throw fail(403,'Your password is incorrect.')
   await db.transaction(async()=>{
    const current=await db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id) as Account
    if(current.role!=='admin'||!current.is_super_admin||current.suspended||current.password_hash!==actor.password_hash)throw fail(403,'Super-admin access changed. Sign in again.')
    const target=await db.prepare('SELECT * FROM users WHERE id=?').get(id) as Account|undefined
    if(!target)throw fail(404,'Account not found.')
    if(target.is_super_admin||id===current.id)throw fail(409,'Super-admin accounts are protected and cannot be changed here.')
    if(target.role!==expectedRole)throw fail(409,'This account changed. Refresh and review it again.')
    if(target.suspended)throw fail(409,'Resolve the account suspension before changing access.')
    if(action==='grant'&&target.role==='admin'||action==='remove'&&target.role!=='admin')throw fail(409,'This account already has the requested access.')
    const role=action==='grant'?'admin':target.seller_status==='approved'?'seller':'customer'
    await db.prepare('UPDATE users SET role=? WHERE id=?').run(role,id)
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)
    await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES(?,?,?,?)').run(id,current.id,action==='grant'?'admin_granted':'admin_removed',JSON.stringify({from:target.role,to:role}))
   })()
   res.json({ok:true})
  }catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
 })
}
