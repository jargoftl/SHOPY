import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { Express, Request, RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Database } from './database.ts'

const cookieName='auth_puzzle', hash=(value:string)=>createHash('sha256').update(value).digest('hex')
export const captchaEnabled=()=>process.env.AUTH_CAPTCHA!=='disabled'
export const captchaBinding=(req:Request)=>typeof req.cookies?.[cookieName]==='string'&&/^[a-f0-9]{64}$/.test(req.cookies[cookieName])?hash(req.cookies[cookieName]):''
const now=()=>new Date().toISOString()
const image=(svg:string)=>`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
export function registerAuthCaptcha(app:Express,db:Database){
 const limiter=rateLimit({windowMs:15*60*1000,limit:90,standardHeaders:'draft-8',legacyHeaders:false})
 app.use('/api/auth/captcha',(_req,res,next)=>{res.set('Cache-Control','private, no-store');next()})
 app.get('/api/auth/captcha',limiter,async(req,res)=>{
  if(!captchaEnabled())return res.json({enabled:false})
  let binding=captchaBinding(req)
  if(!binding){const token=randomBytes(32).toString('hex');binding=hash(token);res.cookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production'||process.env.COOKIE_SECURE==='true',sameSite:'lax',path:'/',maxAge:60*60*1000})}
  const purpose=req.query.purpose==='login'?'login':req.query.purpose==='signup'?'signup':null
  if(!purpose)return res.status(400).json({error:'Choose a login or signup puzzle.'})
  await db.prepare('DELETE FROM auth_captcha WHERE expires_at<?').run(now())
  const id=randomUUID(),target=randomInt(65,225),y=randomInt(45,95),hue=randomInt(20,150)
  const scene=`<rect width="280" height="160" fill="hsl(${hue},23%,89%)"/><circle cx="230" cy="32" r="20" fill="#e5c17b"/><path d="M0 115L85 65L175 123L280 70V160H0" fill="#91a88a"/><path d="M0 143L143 95L280 135V160H0" fill="#476c55"/><rect x="77" y="58" width="116" height="82" rx="5" fill="#f8f2dc"/><path d="M65 66L135 21L205 66" fill="#274a39"/><rect x="123" y="94" width="25" height="46" fill="#b68d4b"/><rect x="89" y="82" width="23" height="23" fill="#9fb6aa"/><rect x="159" y="82" width="23" height="23" fill="#9fb6aa"/>`
  const background=image(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 160">${scene}<rect x="${target}" y="${y}" width="40" height="40" rx="7" fill="#152e26" fill-opacity=".65" stroke="#fff8dd" stroke-width="2" stroke-dasharray="4 3"/></svg>`)
  const piece=image(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${target} ${y} 40 40">${scene}<rect x="${target+1}" y="${y+1}" width="38" height="38" rx="6" fill="none" stroke="#fff8dd" stroke-width="2"/></svg>`)
  await db.prepare('INSERT INTO auth_captcha(id,binding_hash,purpose,target_x,created_at,expires_at) VALUES (?,?,?,?,?,?)').run(id,binding,purpose,target,now(),new Date(Date.now()+5*60000).toISOString())
  res.json({enabled:true,id,background,piece,y,max:240,expiresInSeconds:300})
 })
 app.post('/api/auth/captcha/verify',limiter,async(req,res)=>{
  if(!captchaEnabled())return res.json({verified:true,token:'disabled',expiresInSeconds:1800})
  const binding=captchaBinding(req),id=typeof req.body?.id==='string'?req.body.id:'',x=req.body?.x
  if(!/^[a-f0-9-]{36}$/.test(id)||!binding)return res.status(400).json({error:'Load a new puzzle and try again.'})
  const result=await db.transaction(async()=>{
   const row=await db.prepare('SELECT target_x,attempts,created_at FROM auth_captcha WHERE id=? AND binding_hash=? AND expires_at>? AND proof_hash IS NULL').get(id,binding,now()) as {target_x:number,attempts:number,created_at:string}|undefined
   if(!row||!binding)return null
   if(row.attempts>=3){await db.prepare('DELETE FROM auth_captcha WHERE id=?').run(id);return null}
   await db.prepare('UPDATE auth_captcha SET attempts=attempts+1 WHERE id=?').run(id)
   if(!Number.isInteger(x)||Math.abs(x-row.target_x)>4||Date.now()-new Date(row.created_at).getTime()<500)return null
   const token=randomBytes(32).toString('hex')
   await db.prepare('UPDATE auth_captcha SET proof_hash=?,expires_at=? WHERE id=?').run(hash(token),new Date(Date.now()+30*60000).toISOString(),id)
   return token
  })()
  if(!result)return res.status(400).json({error:'Not quite aligned, or the puzzle expired. Try again or load a new puzzle.'})
  res.json({verified:true,token:result,expiresInSeconds:1800})
 })
 const validate=async(req:Request,purpose:string,consume=false)=>{
  if(!captchaEnabled())return true
  const token=req.body?.captchaToken,binding=captchaBinding(req)
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!binding)return false
  if(consume)return Boolean((await db.prepare('DELETE FROM auth_captcha WHERE proof_hash=? AND binding_hash=? AND purpose=? AND expires_at>?').run(hash(token),binding,purpose,now())).changes)
  return Boolean(await db.prepare('SELECT id FROM auth_captcha WHERE proof_hash=? AND binding_hash=? AND purpose=? AND expires_at>?').get(hash(token),binding,purpose,now()))
 }
 const guard=(purpose:string,consume=false):RequestHandler=>async(req,res,next)=>{try{if(!await validate(req,purpose,consume))return res.status(400).json({error:'Complete a new image puzzle to continue.',captchaRequired:true});next()}catch(error){next(error)}}
 return {guard,consumeSignup:async(req:Request)=>{if(!await validate(req,'signup',true))throw new Error('The image puzzle expired. Complete it again before submitting.')}}
}
