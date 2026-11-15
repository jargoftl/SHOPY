import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
import {rateLimit} from 'express-rate-limit'
export function registerReviews(app:Express,db:Database,auth:RequestHandler){
 const limiter=rateLimit({windowMs:60000,limit:15,standardHeaders:'draft-8',legacyHeaders:false})
 const target=async(kind:string,id:number)=>kind==='product'?db.prepare("SELECT p.id,p.seller_id AS sellerId FROM products p JOIN users u ON u.id=p.seller_id WHERE p.id=? AND p.is_published=1 AND p.is_store_published=1 AND u.role IN ('seller','admin') AND u.suspended=0").get(id):db.prepare("SELECT u.id,u.id AS sellerId FROM users u JOIN seller_profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='seller' AND u.suspended=0").get(id)
 app.get('/api/reviews/:kind/:id',async(req,res)=>{
  const kind=String(req.params.kind),id=Number(req.params.id)
  if(!['product','store'].includes(kind)||!Number.isSafeInteger(id))return res.status(400).json({error:'Invalid review target.'})
  if(!await target(kind,id))return res.status(404).json({error:'Not found.'})
  const summary=await db.prepare("SELECT COUNT(*) AS count,COALESCE(AVG(rating),0) AS average FROM marketplace_reviews WHERE target_kind=? AND target_id=? AND deleted_at IS NULL AND author_role!='admin'").get(kind,id)
  const reviews=await db.prepare('SELECT r.id,r.rating,r.comment,r.author_role AS authorRole,r.verified_purchase AS verifiedPurchase,r.created_at AS createdAt,u.full_name AS authorName FROM marketplace_reviews r JOIN users u ON u.id=r.author_id WHERE r.target_kind=? AND r.target_id=? AND r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 100').all(kind,id)
  res.json({summary,reviews})
 })
 app.post('/api/reviews/:kind/:id',auth,limiter,async(req,res)=>{
  const kind=String(req.params.kind),id=Number(req.params.id),rating=Number(req.body.rating),comment=typeof req.body.comment==='string'?req.body.comment.trim():''
  if(!['product','store'].includes(kind)||!Number.isSafeInteger(id)||!Number.isInteger(rating)||rating<1||rating>5||!comment||comment.length>2000)return res.status(400).json({error:'Choose 1–5 stars and write a review of up to 2,000 characters.'})
  const item=await target(kind,id) as {sellerId:number}|undefined
  if(!item)return res.status(404).json({error:'Not found.'})
  if(req.user!.role==='seller'||req.user!.id===item.sellerId)return res.status(403).json({error:'You cannot review your own store or products.'})
  if(await db.prepare('SELECT 1 FROM marketplace_reviews WHERE target_kind=? AND target_id=? AND author_id=? AND deleted_at IS NOT NULL').get(kind,id,req.user!.id))return res.status(403).json({error:'This review was removed by an administrator.'})
  const verified=Boolean(await db.prepare(`SELECT 1 FROM purchase_items i JOIN purchase_orders o ON o.id=i.order_id WHERE o.buyer_id=? AND o.status='paid' AND ${kind==='product'?'i.product_id':'i.seller_id'}=? LIMIT 1`).get(req.user!.id,id))
  await db.transaction(async()=>{
  await db.prepare(`INSERT INTO marketplace_reviews(target_kind,target_id,author_id,author_role,rating,comment,verified_purchase) VALUES(?,?,?,?,?,?,?) ON CONFLICT(target_kind,target_id,author_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,verified_purchase=excluded.verified_purchase,deleted_at=NULL,deleted_by=NULL,created_at=CURRENT_TIMESTAMP`).run(kind,id,req.user!.id,req.user!.role,rating,comment,Number(verified))
  if(kind==='product')await db.prepare("UPDATE products SET rating=(SELECT COALESCE(AVG(rating),0) FROM marketplace_reviews WHERE target_kind='product' AND target_id=? AND deleted_at IS NULL AND author_role!='admin') WHERE id=?").run(id,id)
  })()
  res.status(201).json({ok:true})
 })
 app.delete('/api/admin/reviews/:id',auth,async(req,res)=>{
  if(req.user!.role!=='admin')return res.status(403).json({error:'Administrator access required.'})
  const id=Number(req.params.id)
  if(!Number.isSafeInteger(id))return res.status(400).json({error:'Invalid review.'})
  const row=await db.prepare('SELECT id,target_kind,target_id FROM marketplace_reviews WHERE id=? AND deleted_at IS NULL').get(id) as {id:number,target_kind:string,target_id:number}|undefined
  if(!row)return res.status(404).json({error:'Review not found.'})
  await db.transaction(async()=>{
  await db.prepare('UPDATE marketplace_reviews SET deleted_at=CURRENT_TIMESTAMP,deleted_by=? WHERE id=?').run(req.user!.id,id)
  if(row.target_kind==='product')await db.prepare("UPDATE products SET rating=(SELECT COALESCE(AVG(rating),0) FROM marketplace_reviews WHERE target_kind='product' AND target_id=? AND deleted_at IS NULL AND author_role!='admin') WHERE id=?").run(row.target_id,row.target_id)
  })()
  res.json({ok:true})
 })
}
