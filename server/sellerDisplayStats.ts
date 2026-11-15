import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
const keys=['products','paidOrders','salesCents','profitCents','followers','visits','todayVisits','last7Visits','last30Visits','todayOrders','todaySalesCents','pendingSalesCents']
export function registerSellerDisplayStats(app:Express,db:Database,auth:RequestHandler,role:(...roles:('customer'|'seller'|'admin')[])=>RequestHandler){
 app.get('/api/admin/sellers/:id/display-stats',auth,role('admin'),async(req,res)=>{
  const id=Number(req.params.id),row=await db.prepare('SELECT values_json,updated_at FROM seller_stat_adjustments WHERE seller_id=?').get(id) as {values_json:string,updated_at:string}|undefined
  const history=await db.prepare('SELECT a.*,u.full_name AS adminName FROM seller_stat_audit a JOIN users u ON u.id=a.admin_id WHERE seller_id=? ORDER BY a.id DESC LIMIT 50').all(id)
  res.set('Cache-Control','no-store').json({values:row?JSON.parse(row.values_json):{},updatedAt:row?.updated_at||null,history})
 })
 app.put('/api/admin/sellers/:id/display-stats',auth,role('admin'),async(req,res)=>{
  const id=Number(req.params.id),values=req.body?.values,reason=typeof req.body?.reason==='string'?req.body.reason.trim():''
  if(!Number.isSafeInteger(id)||id<1||!values||typeof values!=='object'||Array.isArray(values)||!reason||reason.length>1000||Object.entries(values).some(([key,value])=>!keys.includes(key)||!Number.isSafeInteger(value)||Number(value)<0||Number(value)>1000000000000))return res.status(400).json({error:'Use nonnegative whole numbers, supported display fields and an audit reason. Leave a value blank to use the actual figure.'})
  if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='seller'").get(id))return res.status(404).json({error:'Seller not found.'})
  await db.transaction(async()=>{
   const old=await db.prepare('SELECT values_json FROM seller_stat_adjustments WHERE seller_id=?').get(id) as {values_json:string}|undefined
   await db.prepare('INSERT INTO seller_stat_audit(seller_id,admin_id,before_json,after_json,reason) VALUES(?,?,?,?,?)').run(id,req.user!.id,old?.values_json||'{}',JSON.stringify(values),reason)
   await db.prepare('INSERT INTO seller_stat_adjustments(seller_id,values_json,admin_id) VALUES(?,?,?) ON CONFLICT(seller_id) DO UPDATE SET values_json=excluded.values_json,admin_id=excluded.admin_id,updated_at=CURRENT_TIMESTAMP').run(id,JSON.stringify(values),req.user!.id)
  })()
  return res.json({ok:true})
 })
}
