import bcrypt from 'bcryptjs'
import type { Express, RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Database } from './database.ts'

export const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin)
export async function checkTransactionPin(db: Database, userId: number, pin: unknown): Promise<string | null> {
 return db.transaction(async () => {
  const row = await db.prepare('SELECT pin_hash,failed_attempts,locked_until FROM transaction_security WHERE user_id=? FOR UPDATE').get(userId) as {pin_hash:string,failed_attempts:number,locked_until:string|null}|undefined
  if (!row) return 'Set your four-digit transaction PIN in My wallet before confirming a transaction.'
  if (row.locked_until && row.locked_until > new Date().toISOString()) return 'Too many incorrect PIN attempts. Try again in 15 minutes or reset your PIN using your login password.'
  if (!validPin(pin) || !await bcrypt.compare(pin,row.pin_hash)) {
   const attempts = row.locked_until ? 1 : row.failed_attempts + 1
   await db.prepare('UPDATE transaction_security SET failed_attempts=?,locked_until=? WHERE user_id=?').run(attempts,attempts>=5?new Date(Date.now()+15*60000).toISOString():null,userId)
   return attempts>=5?'Too many incorrect PIN attempts. Try again in 15 minutes or reset your PIN using your login password.':'Transaction PIN is incorrect. Enter exactly four digits.'
  }
  await db.prepare('UPDATE transaction_security SET failed_attempts=0,locked_until=NULL WHERE user_id=?').run(userId)
  return null
 })()
}
export function registerTransactionPin(app: Express, db: Database, auth: RequestHandler, role: (...roles: ('customer'|'seller'|'admin')[])=>RequestHandler) {
 const limiter=rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many PIN setup attempts. Please try again later.'}})
 app.get('/api/account/transaction-pin',auth,role('customer','seller'),async(req,res)=>{
  const row=await db.prepare('SELECT user_id FROM transaction_security WHERE user_id=?').get(req.user!.id)
  res.set('Cache-Control','no-store').json({hasTransactionPin:Boolean(row)})
 })
 app.put('/api/account/transaction-pin',auth,role('customer','seller'),limiter,async(req,res)=>{
  const {pin,confirmPin,loginPassword}=req.body||{}
  if(!validPin(pin)||pin!==confirmPin) return res.status(400).json({error:'Enter and confirm the same four-digit PIN.'})
  if(typeof loginPassword!=='string'||!await bcrypt.compare(loginPassword,req.user!.password_hash)) return res.status(403).json({error:'Login password is incorrect.'})
  const hash=await bcrypt.hash(pin,12)
  await db.prepare('INSERT INTO transaction_security(user_id,pin_hash) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=NULL').run(req.user!.id,hash)
  res.json({ok:true})
 })
}
