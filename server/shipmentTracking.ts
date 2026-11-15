import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
export async function recordShipmentEvent(db:Database,order:number,seller:number,status:string,actor:number,role:string,note=''){
 await db.prepare('INSERT INTO shipment_events(order_id,seller_id,status,actor_id,actor_role,note) VALUES(?,?,?,?,?,?)').run(order,seller,status,actor,role,note)
}
export function registerShipmentTracking(app:Express,db:Database,auth:RequestHandler){
 app.get('/api/orders/track/:code',auth,async(req,res)=>{
  const code=String(req.params.code)
  if(!/^[1-9]\d{10}$/.test(code))return res.status(400).json({error:'Enter your 11-digit tracking number.'})
  const shipment=await db.prepare(`SELECT s.order_id AS orderId,n.number AS orderNumber,s.seller_id AS sellerId,s.tracking_code AS trackingNumber,s.tracking_number AS carrierTrackingNumber,s.carrier,s.status,o.created_at AS createdAt,COALESCE(p.store_name,u.full_name) AS storeName
   FROM purchase_sellers s JOIN purchase_orders o ON o.id=s.order_id JOIN users u ON u.id=s.seller_id LEFT JOIN seller_profiles p ON p.user_id=s.seller_id JOIN order_numbers n ON n.kind='purchase' AND n.order_id=s.order_id
   WHERE s.tracking_code=? AND (o.buyer_id=? OR s.seller_id=? OR ?='admin')`).get(code,req.user!.id,req.user!.id,req.user!.role) as {orderId:number,sellerId:number}|undefined
  if(!shipment)return res.status(404).json({error:'Tracking number not found for your account.'})
  const history=await db.prepare('SELECT status,note,actor_role AS updatedBy,created_at AS createdAt FROM shipment_events WHERE order_id=? AND seller_id=? ORDER BY id DESC LIMIT 100').all(shipment.orderId,shipment.sellerId)
  res.set('Cache-Control','private, no-store').json({shipment,history})
 })
}
