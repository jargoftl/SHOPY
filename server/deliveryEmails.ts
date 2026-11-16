import {randomUUID} from 'node:crypto'
import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
import {isEmailConfigured,sendSellerDeliveryEmail} from './email.ts'
const stamp=()=>new Date().toISOString()
let delivering=false
export async function queueDeliveryEmail(db:Database,order:number,seller:number){
 await db.prepare('INSERT INTO seller_delivery_emails(id,order_id,seller_id,next_attempt_at) VALUES(?,?,?,?) ON CONFLICT(order_id,seller_id) DO NOTHING').run(randomUUID(),order,seller,stamp())
}
export async function deliverSellerDeliveryEmails(db:Database){
 if(delivering||!isEmailConfigured())return
 delivering=true
 try{
  for(let i=0;i<10;i++){
   const job=await db.transaction(async()=>{
    const row=await db.prepare(`SELECT e.id,e.attempts,u.email,u.full_name,n.number AS orderNumber,s.tracking_code AS trackingNumber,COALESCE(p.store_name,u.full_name) AS storeName FROM seller_delivery_emails e JOIN users u ON u.id=e.seller_id JOIN purchase_orders o ON o.id=e.order_id JOIN purchase_sellers s ON s.order_id=e.order_id AND s.seller_id=e.seller_id JOIN order_numbers n ON n.kind='purchase' AND n.order_id=e.order_id LEFT JOIN seller_profiles p ON p.user_id=e.seller_id WHERE e.status IN ('pending','sending') AND e.next_attempt_at<=? AND o.status='paid' AND s.status='delivered' ORDER BY e.next_attempt_at,e.id LIMIT 1`).get(stamp()) as {id:string,attempts:number,email:string,full_name:string,orderNumber:number,trackingNumber:string,storeName:string}|undefined
    if(!row)return null
    await db.prepare("UPDATE seller_delivery_emails SET status='sending',attempts=attempts+1,next_attempt_at=? WHERE id=?").run(new Date(Date.now()+120000).toISOString(),row.id)
    return row
   })()
   if(!job)break
   const setting=await db.prepare("SELECT value FROM site_settings WHERE key='site_name'").get() as {value:string}|undefined
   const sent=await sendSellerDeliveryEmail({to:job.email,name:job.full_name,siteName:setting?.value||'our marketplace',storeName:job.storeName,orderNumber:job.orderNumber,trackingNumber:job.trackingNumber})
   await db.prepare('UPDATE seller_delivery_emails SET status=?,sent_at=?,last_error=?,next_attempt_at=? WHERE id=?').run(sent?'sent':job.attempts+1>=5?'failed':'pending',sent?stamp():null,sent?'':'Email provider did not accept the message. Check backend email settings.',new Date(Date.now()+300000).toISOString(),job.id)
  }
 }finally{delivering=false}
}
export function kickDeliveryEmailWorker(db:Database){
 if(process.env.DELIVERY_EMAIL_WORKER==='disabled')return
 setImmediate(()=>{void deliverSellerDeliveryEmails(db).catch(()=>console.error('Seller delivery email will retry.'))})
}
export function registerDeliveryEmails(app:Express,db:Database,auth:RequestHandler,role:(...roles:('customer'|'seller'|'admin')[])=>RequestHandler){
 app.post('/api/admin/purchase-sellers/:orderId/:sellerId/delivery-email',auth,role('admin'),async(req,res)=>{
  const order=Number(req.params.orderId),seller=Number(req.params.sellerId)
  if(!Number.isSafeInteger(order)||order<1||!Number.isSafeInteger(seller)||seller<1)return res.status(400).json({error:'Invalid order.'})
  if(!isEmailConfigured())return res.status(409).json({error:'Configure the backend email provider before sending delivery email.'})
  try{await db.transaction(async()=>{
   if(!await db.prepare("SELECT 1 FROM purchase_sellers s JOIN purchase_orders o ON o.id=s.order_id WHERE s.order_id=? AND s.seller_id=? AND s.status='delivered' AND o.status='paid'").get(order,seller))throw Object.assign(new Error('Only a paid order marked delivered can send this email.'),{status:409})
   const old=await db.prepare('SELECT status FROM seller_delivery_emails WHERE order_id=? AND seller_id=?').get(order,seller) as {status:string}|undefined
   if(old?.status==='sent'||old?.status==='sending')throw Object.assign(new Error('Delivery email was already sent or is currently sending.'),{status:409})
   if(!old)await queueDeliveryEmail(db,order,seller)
   else await db.prepare("UPDATE seller_delivery_emails SET status='pending',attempts=0,next_attempt_at=?,last_error='' WHERE order_id=? AND seller_id=?").run(stamp(),order,seller)
  })()}catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
  await deliverSellerDeliveryEmails(db)
  const email=await db.prepare('SELECT status,attempts,sent_at AS sentAt,last_error AS lastError FROM seller_delivery_emails WHERE order_id=? AND seller_id=?').get(order,seller)
  res.json({ok:true,email})
 })
 let timer:ReturnType<typeof setInterval>|undefined
 if(process.env.DELIVERY_EMAIL_WORKER!=='disabled'){
  timer=setInterval(()=>kickDeliveryEmailWorker(db),60000);timer.unref();kickDeliveryEmailWorker(db)
 }
 return()=>{if(timer)clearInterval(timer)}
}
