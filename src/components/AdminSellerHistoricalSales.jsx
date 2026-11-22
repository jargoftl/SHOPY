import UiverseSelect from './UiverseSelect.jsx'
import {useEffect,useRef,useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {formatMoney,parseAmountCents} from '../lib/money.js'
import HistoricalSalesHistory from './HistoricalSalesHistory.jsx'

const path='/api/admin/seller-sales-history'
const field='mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm'

export function SaleEntry({sellerId}){
 const [quantity,setQuantity]=useState('1')
 const [price,setPrice]=useState('')
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 const [error,setError]=useState('')
 const [revision,setRevision]=useState(0)
 const saveAttempt=useRef(null)
 const url=`${path}/${sellerId}`
 const unitPriceCents=parseAmountCents(price)
 const total=unitPriceCents===null?null:unitPriceCents*Number(quantity)

 async function save(event){
  event.preventDefault()
  if(busy)return
  const form=event.currentTarget
  const fields=Object.fromEntries(new FormData(form))
  const entry={...fields,quantity:Number(quantity),unitPriceCents}
  const fingerprint=JSON.stringify(entry)
  if(saveAttempt.current?.fingerprint!==fingerprint)saveAttempt.current={fingerprint,key:crypto.randomUUID()}
  setStatus('')
  setError('')
  setBusy(true)
  try{
   await apiRequest(url,{method:'POST',body:JSON.stringify({...entry,requestKey:saveAttempt.current.key})})
   saveAttempt.current=null
   form.reset()
   setPrice('')
   setQuantity('1')
   setStatus('Sale added to seller history.')
   setRevision(value=>value+1)
  }catch(error){setError(error.message)}
  finally{setBusy(false)}
 }
 return <div className="mt-4 space-y-5">
  <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
   <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-sm font-medium">Sale date
     <input name="soldOn" type="date" min="1900-01-01" max={new Date(Date.now()+3600000).toISOString().slice(0,10)} required className={field}/>
    </label>
    <label className="text-sm font-medium">Item name
     <input name="itemName" required maxLength={200} className={field}/>
    </label>
    <label className="text-sm font-medium">Item type or category
     <input name="itemType" required maxLength={100} className={field}/>
    </label>
    <label className="text-sm font-medium">Quantity sold
     <input value={quantity} onChange={event=>setQuantity(event.target.value)} type="number" min="1" max="1000000" step="1" required className={field}/>
    </label>
    <label className="text-sm font-medium">Unit price (USD)
     <input value={price} onChange={event=>setPrice(event.target.value)} type="number" min="0" max="1000000" step="0.01" required className={field}/>
    </label>
    <label className="text-sm font-medium">Original order reference (optional)
     <input name="orderReference" maxLength={100} className={field}/>
    </label>
    <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
     <button type="submit" disabled={busy||total===null||total>100000000} className="rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?'Saving…':'Add sale'}</button>
     {total!==null&&<p className="text-sm">Sale total <strong>{formatMoney(total)}</strong></p>}
    </div>
   </fieldset>
   {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
   {status&&<p role="status" className="mt-3 text-sm text-emerald-700">{status}</p>}
  </form>
  <HistoricalSalesHistory key={revision} path={url}/>
 </div>
}

export default function AdminSellerHistoricalSales(){
 const [sellers,setSellers]=useState(null)
 const [selected,setSelected]=useState('')
 const [error,setError]=useState('')
 useEffect(()=>{
  const controller=new AbortController()
  apiRequest(path,{signal:controller.signal}).then(data=>setSellers(data.sellers))
   .catch(error=>{if(!controller.signal.aborted)setError(error.message)})
  return()=>controller.abort()
 },[])
 return <section>
  <p className="text-sm text-slate-600">Record sales from before the store joined SHOPY. Enter one line per item sold.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {!sellers&&!error&&<p role="status" className="mt-3 text-sm text-slate-600">Loading sellers…</p>}
  {sellers&&<label className="mt-4 block max-w-xl text-sm font-medium">Seller
   <UiverseSelect value={selected} onChange={event=>setSelected(event.target.value)} className={field}>
    <option value="">Choose a seller</option>
    {sellers.map(seller=><option key={seller.id} value={seller.id}>{seller.storeName} · {seller.email}</option>)}
   </UiverseSelect>
  </label>}
  {selected&&<SaleEntry key={selected} sellerId={selected}/>}
 </section>
}
