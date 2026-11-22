import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
import {validEstablishedDate} from './storeDates.ts'

const pageSize=25
const inputText=(value:unknown)=>typeof value==='string'?value.trim():''
const recordFields='id,sold_on::text AS soldOn,item_name AS itemName,item_type AS itemType,quantity,unit_price_cents AS unitPriceCents,order_reference AS orderReference,(quantity*unit_price_cents) AS totalCents'

export async function historicalSalesSummary(db:Database,seller:number,today?:string){
 return db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(quantity),0)::bigint AS units,
  COUNT(DISTINCT COALESCE(NULLIF(order_reference,''),'row:'||id::text))::integer AS orders,
  COALESCE(SUM(quantity*unit_price_cents),0)::bigint AS salesCents,
  COUNT(DISTINCT COALESCE(NULLIF(order_reference,''),'row:'||id::text)) FILTER (WHERE sold_on=?::date)::integer AS todayOrders,
  COALESCE(SUM(quantity*unit_price_cents) FILTER (WHERE sold_on=?::date),0)::bigint AS todaySalesCents
  FROM seller_historical_sales WHERE seller_id=?`).get(today??null,today??null,seller) as Promise<{count:number,units:number,salesCents:number,orders:number,todayOrders:number,todaySalesCents:number}>
}

export function historicalSaleRows(db:Database,seller:number,limit=pageSize,offset=0){
 return db.prepare(`SELECT ${recordFields} FROM seller_historical_sales
  WHERE seller_id=? ORDER BY sold_on DESC,id DESC LIMIT ? OFFSET ?`).all(seller,limit,offset)
}

export function registerHistoricalSales(app:Express,db:Database,auth:RequestHandler,role:(...roles:('seller'|'customer'|'admin')[])=>RequestHandler){
 const isSeller=(id:number)=>db.prepare("SELECT id FROM users WHERE id=? AND role='seller' AND deleted_at IS NULL").get(id)
 const history=async(seller:number,page:number)=>{
  const [summary,records]=await Promise.all([
   historicalSalesSummary(db,seller),historicalSaleRows(db,seller,pageSize,(page-1)*pageSize)
  ])
  return {summary,records,page,hasMore:page*pageSize<summary.count}
 }
 const readPage=(value:unknown)=>value===undefined?1:typeof value==='string'&&/^[1-9]\d{0,5}$/.test(value)?Number(value):0

 app.get('/api/seller/sales-history',auth,role('seller'),async(req,res)=>{
  const page=readPage(req.query.page)
  if(!page)return res.status(400).json({error:'Choose a valid history page.'})
  return res.set('Cache-Control','private, no-store').json(await history(req.user!.id,page))
 })
 app.get('/api/admin/seller-sales-history',auth,role('admin'),async(_req,res)=>{
  const sellers=await db.prepare(`SELECT u.id,u.full_name AS fullName,u.email,COALESCE(p.store_name,u.full_name) AS storeName
   FROM users u LEFT JOIN seller_profiles p ON p.user_id=u.id
   WHERE u.role='seller' AND u.deleted_at IS NULL ORDER BY lower(COALESCE(p.store_name,u.full_name)),u.id`).all()
  return res.set('Cache-Control','private, no-store').json({sellers})
 })
 app.get('/api/admin/seller-sales-history/:sellerId',auth,role('admin'),async(req,res)=>{
  const seller=Number(req.params.sellerId),page=readPage(req.query.page)
  if(!page)return res.status(400).json({error:'Choose a valid history page.'})
  if(!Number.isSafeInteger(seller)||seller<1||!await isSeller(seller))return res.status(404).json({error:'Seller not found.'})
  return res.set('Cache-Control','private, no-store').json(await history(seller,page))
 })
 app.post('/api/admin/seller-sales-history/:sellerId',auth,role('admin'),async(req,res)=>{
  const seller=Number(req.params.sellerId)
  if(!Number.isSafeInteger(seller)||seller<1)return res.status(404).json({error:'Seller not found.'})
  const {soldOn,quantity,unitPriceCents,requestKey}=req.body||{}
  const itemName=inputText(req.body?.itemName),itemType=inputText(req.body?.itemType),orderReference=inputText(req.body?.orderReference)
  const today=new Date(Date.now()+28800000).toISOString().slice(0,10)
  if(!validEstablishedDate(soldOn)||soldOn>today||!itemName||itemName.length>200||!itemType||itemType.length>100||orderReference.length>100||
   !Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!Number.isSafeInteger(unitPriceCents)||unitPriceCents<0||
   quantity*unitPriceCents>100000000||typeof requestKey!=='string'||!/^[-a-f0-9]{36}$/i.test(requestKey)){
   return res.status(400).json({error:'Enter an item, type, sale date, quantity and USD unit price. The sale total must be $1,000,000 or less.'})
  }
  const result=await db.transaction(async()=>{
   if(!await isSeller(seller))return {status:404,error:'Seller not found.'}
   const previous=await db.prepare(`SELECT ${recordFields} FROM seller_historical_sales WHERE seller_id=? AND request_key=?`).get(seller,requestKey) as {soldOn:string,itemName:string,itemType:string,quantity:number,unitPriceCents:number,orderReference:string}|undefined
   if(previous){
    if(previous.soldOn!==soldOn||previous.itemName!==itemName||previous.itemType!==itemType||previous.quantity!==quantity||
      previous.unitPriceCents!==unitPriceCents||previous.orderReference!==orderReference)return {status:409,error:'This save already recorded different sale details.'}
    return {status:200,record:previous}
   }
   const record=await db.prepare(`INSERT INTO seller_historical_sales
    (seller_id,entered_by,request_key,sold_on,item_name,item_type,quantity,unit_price_cents,order_reference)
    VALUES (?,?,?,?::date,?,?,?,?,?) RETURNING ${recordFields}`).get(seller,req.user!.id,requestKey,soldOn,itemName,itemType,quantity,unitPriceCents,orderReference)
   return {status:201,record}
  })()
  return res.status(result.status).json('error' in result?{error:result.error}:{record:result.record})
 })
}
