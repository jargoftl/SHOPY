import type {Express,RequestHandler} from 'express'
import type {Database} from './database.ts'
export async function storeDates(db:Database,id:number){
 return db.prepare('SELECT u.created_at AS "accountCreatedAt",p.created_at AS "storeCreatedAt",p.established_on::text AS "establishedOn" FROM seller_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?').get(id) as Promise<{accountCreatedAt:string,storeCreatedAt:string,establishedOn:string|null}|undefined>
}
export const validEstablishedDate=(value:unknown)=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2100-12-31')return false
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value
}
type HistoricalStoreFigures = {
 followers: number
 itemsSold: number
 ratingCount: number
 ratingAverage: number | null
}

function validHistoricalFigures(value: unknown): value is HistoricalStoreFigures {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const { followers, itemsSold, ratingCount, ratingAverage } = value as HistoricalStoreFigures
 if (![followers, itemsSold, ratingCount].every(count => Number.isSafeInteger(count) && count >= 0 && count <= 1000000000)) return false
 return ratingCount === 0 ? ratingAverage === null :
  typeof ratingAverage === 'number' && ratingAverage >= 1 && ratingAverage <= 5 && /^\d(?:\.\d{1,2})?$/.test(String(ratingAverage))
}

async function historicalStoreFigures(db: Database, id: number): Promise<HistoricalStoreFigures | undefined> {
 const row = await db.prepare(`SELECT follower_count AS followers, historical_items_sold AS itemsSold,
  historical_rating_count AS ratingCount, historical_rating_average AS ratingAverage
  FROM seller_profiles WHERE user_id=?`).get(id) as HistoricalStoreFigures | undefined
 return row && { ...row, ratingAverage: row.ratingAverage === null ? null : Number(row.ratingAverage) }
}

export function registerStoreDates(app:Express,db:Database,auth:RequestHandler){
 const admin:RequestHandler=(req,res,next)=>{if(req.user!.role!=='admin')return res.status(403).json({error:'Administrator access required.'});res.set('Cache-Control','private, no-store');next()}
 const details=async(id:number)=>({dates:await storeDates(db,id),historical:await historicalStoreFigures(db,id),history:await db.prepare("SELECT h.id,h.details,h.created_at AS \"createdAt\",u.full_name AS \"adminName\" FROM account_admin_history h JOIN users u ON u.id=h.admin_id WHERE h.user_id=? AND h.action='store_date_updated' ORDER BY h.id DESC LIMIT 100").all(id)})
 app.get('/api/admin/sellers/:id/dates',auth,admin,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||!await storeDates(db,id))return res.status(404).json({error:'Store not found.'})
  res.json(await details(id))
 })
 app.patch('/api/admin/sellers/:id/dates',auth,admin,async(req,res)=>{
  const id=Number(req.params.id),date=req.body?.establishedOn,expected=req.body?.expectedEstablishedOn,reason=(typeof req.body?.reason==='string'?req.body.reason.trim():'') || 'Administrator action'
  if(!Number.isSafeInteger(id)||id<1||(date!==null&&!validEstablishedDate(date))||(expected!==null&&!validEstablishedDate(expected))||!reason||reason.length>500)return res.status(400).json({error:'Choose a valid date (1900–2100).'})
  const historical=req.body?.historical, expectedHistorical=req.body?.expectedHistorical
  if(historical!==undefined&&(!validHistoricalFigures(historical)||!validHistoricalFigures(expectedHistorical))){
   return res.status(400).json({error:'Enter whole counts up to one billion. A rating count above zero needs an average from 1 to 5, with up to two decimals.'})
  }
  const status=await db.transaction(async()=>{
   const previous=await storeDates(db,id);if(!previous)return 404
   if(previous.establishedOn!==expected)return 409
   if(historical!==undefined){
    const old=await historicalStoreFigures(db,id)
    if(!old||Object.entries(old).some(([key,value])=>expectedHistorical[key]!==value))return 409
    await db.prepare(`UPDATE seller_profiles SET follower_count=?,historical_items_sold=?,
      historical_rating_count=?,historical_rating_average=? WHERE user_id=?`)
      .run(historical.followers,historical.itemsSold,historical.ratingCount,historical.ratingAverage,id)
   }
   if(previous.establishedOn===date)return 200
   await db.prepare('UPDATE seller_profiles SET established_on=?::date WHERE user_id=?').run(date,id)
   await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES(?,?,?,?)').run(id,req.user!.id,'store_date_updated',JSON.stringify({from:previous.establishedOn,to:date,reason}))
   return 200
  })()
  if(status!==200)return res.status(status).json({error:status===404?'Store not found.':'Store records changed. Reload before editing again.'})
  res.json(await details(id))
 })
}
