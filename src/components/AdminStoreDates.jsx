import {useEffect,useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {formatTimestamp,formatStoreDate} from '../lib/storeDates.js'

const countFields = [
 ['followers', 'Historical followers'],
 ['itemsSold', 'Historical items sold'],
 ['ratingCount', 'Historical rating count'],
]
const field = 'mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5'

export default function AdminStoreDates({userId,showDateHistory=true}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const path=`/api/admin/sellers/${userId}/dates`
 useEffect(()=>{
  let active=true
  setData(null)
  setError('')
  setNotice('')
  apiRequest(path).then(result=>{if(active)setData(result)}).catch(error=>{if(active)setError(error.message)})
  return()=>{active=false}
 },[path])

 async function submit(event){
  event.preventDefault()
  const fields=new FormData(event.currentTarget)
  const counts=Object.fromEntries(countFields.map(([name])=>[name,Number(fields.get(name))]))
  const average=String(fields.get('ratingAverage')).trim()
  const historical={...counts,ratingAverage:average?Number(average):null}
  const visitors=Number(fields.get('visitors'))
  const lastViewed=String(fields.get('lastViewedAt'))
  const parsedLastView=lastViewed?Date.parse(lastViewed+'+01:00'):null
  if(parsedLastView!==null&&!Number.isFinite(parsedLastView)){setError('Enter a valid last-viewed date and time.');return}
  const lastViewedAt=parsedLastView===null?null:new Date(parsedLastView).toISOString()
  if(visitors!==data.historical.visitors)historical.visitors=visitors
  if((lastViewedAt?.slice(0,16)??null)!==(data.historical.lastViewedAt?.slice(0,16)??null))historical.lastViewedAt=lastViewedAt
  setBusy(true)
  setError('')
  setNotice('')
  try{
   const result=await apiRequest(path,{method:'PATCH',body:JSON.stringify({
    establishedOn:fields.get('establishedOn')||null,expectedEstablishedOn:data.dates.establishedOn,
    historical,expectedHistorical:data.historical
   })})
   setData(result)
   setNotice('Store records and visitor stats saved.')
  }catch(error){setError(error.message)}
  finally{setBusy(false)}
 }

 return <section id="store-records" className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-5 text-black">
  <h2 className="font-semibold">Store records and visitor stats</h2>
  <p className="mt-2 text-sm text-slate-600">Update historical followers, sales and ratings, plus the store’s total visits and last-viewed time.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {data&&<>
   <form key={userId} onSubmit={submit} className="mt-4">
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
     <label className="text-sm font-medium">Original opening date
      <input name="establishedOn" type="date" min="1900-01-01" max="2100-12-31" defaultValue={data.dates.establishedOn||''} className={field}/>
     </label>
     {countFields.map(([name,label])=><label key={name} className="text-sm font-medium">{label}
      <input name={name} type="number" min="0" max="1000000000" step="1" defaultValue={data.historical[name]} className={field}/>
     </label>)}
     <label className="text-sm font-medium">Historical average rating (out of 5)
      <input name="ratingAverage" type="number" min="1" max="5" step="0.01" defaultValue={data.historical.ratingAverage??''} className={field}/>
     </label>
     <label className="text-sm font-medium">Total store visits
      <input name="visitors" type="number" min="0" max="1000000000" step="1" required defaultValue={data.historical.visitors??0} className={field}/>
     </label>
     <label className="text-sm font-medium">Last viewed (Lagos time)
      <input name="lastViewedAt" type="datetime-local" defaultValue={data.historical.lastViewedAt?new Date(Date.parse(data.historical.lastViewedAt)+3600000).toISOString().slice(0,16):''} className={field}/>
     </label>
     <p className="self-end text-xs text-slate-600">Enter both rating fields to include past ratings. If there are no historical ratings, use a count of 0 and leave the average blank.</p>
     <button type="submit" className="w-fit rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Saving…':'Save store records'}</button>
    </fieldset>
   </form>
   {notice&&<p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
   {showDateHistory&&<details className="mt-5 border-t pt-4 text-sm">
    <summary className="cursor-pointer font-medium">Platform dates and private date history</summary>
    <dl className="mt-3 space-y-2">
     <div><dt className="text-gray-500">Account registration</dt><dd>{formatTimestamp(data.dates.accountCreatedAt)}</dd></div>
     <div><dt className="text-gray-500">Store joined SHOPY</dt><dd>{formatTimestamp(data.dates.storeCreatedAt)}</dd></div>
    </dl>
    {data.history.map(item=>{
     let detail
     try{detail=JSON.parse(item.details)}catch{detail={}}
     return <div key={item.id} className="mt-3 border-t pt-3 text-xs leading-6">
      <p>{detail.from?formatStoreDate(detail.from):'No business date'} → {detail.to?formatStoreDate(detail.to):'No business date'}</p>
      <p>{detail.reason}</p><p className="text-gray-500">{item.adminName} · {formatTimestamp(item.createdAt)}</p>
     </div>
    })}
   </details>}
  </>}
 </section>
}
