import {createHash,randomBytes} from 'node:crypto'
import type {Express,Request} from 'express'
const cookieName='auth_browser'
const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
export const authBrowserBinding=(req:Request)=>typeof req.cookies?.[cookieName]==='string'&&/^[a-f0-9]{64}$/.test(req.cookies[cookieName])?hash(req.cookies[cookieName]):''
export function registerAuthBrowser(app:Express){
 // Bind emailed codes to their requesting browser without a puzzle or user interaction.
 app.use(['/api/auth/seller-verification-code','/api/auth/registration-verification-code'],(req,res,next)=>{
  if(!authBrowserBinding(req)){
   const token=randomBytes(32).toString('hex')
   req.cookies[cookieName]=token
   res.cookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production'||process.env.COOKIE_SECURE==='true',sameSite:'lax',path:'/',maxAge:60*60*1000})
  }
  res.set('Cache-Control','private, no-store');next()
 })
 // Cached older clients can proceed without displaying or solving a puzzle.
 app.get('/api/auth/captcha',(_req,res)=>res.set('Cache-Control','no-store').json({enabled:false}))
}
