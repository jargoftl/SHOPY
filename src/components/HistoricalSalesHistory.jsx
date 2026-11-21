import {useEffect,useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {formatMoney} from '../lib/money.js'
import {formatStoreDate} from '../lib/storeDates.js'

export function HistoricalSaleRows({records}){
 if(!records.length)return <p className="py-4 text-sm text-slate-600">No historical sales recorded.</p>
 return <ul className="divide-y divide-slate-200">
  {records.map(sale=><li key={sale.id} className="flex flex-wrap items-start justify-between gap-2 py-3.5">
   <div className="min-w-0">
    <p className="break-words font-semibold">{sale.itemName}</p>
    <p className="mt-1 break-words text-xs text-slate-600">{sale.itemType} · {formatStoreDate(sale.soldOn)}{sale.orderReference&&` · Ref. ${sale.orderReference}`}</p>
   </div>
   <div className="text-right">
    <p className="font-semibold tabular-nums">{formatMoney(sale.totalCents)}</p>
    <p className="mt-1 text-xs text-slate-600">{sale.quantity.toLocaleString()} × {formatMoney(sale.unitPriceCents)}</p>
   </div>
  </li>)}
 </ul>
}

export default function HistoricalSalesHistory({path='/api/seller/sales-history'}){
 const [page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState('')
 useEffect(()=>{
  const controller=new AbortController()
  setData(null)
  setError('')
  apiRequest(`${path}?page=${page}`,{signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted)setData(result)})
   .catch(error=>{if(!controller.signal.aborted)setError(error.message)})
  return()=>controller.abort()
 },[path,page])
 return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 sm:p-5">
  <h2 className="text-lg font-semibold">Historical sales</h2>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {!data&&!error&&<p role="status" className="mt-3 text-sm text-slate-600">Loading sales history…</p>}
  {data&&<>
   <dl className="my-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
    <div><dt className="text-xs text-slate-600">Items sold</dt><dd className="font-semibold">{data.summary.units.toLocaleString()}</dd></div>
    <div><dt className="text-xs text-slate-600">Sales total</dt><dd className="font-semibold">{formatMoney(data.summary.salesCents)}</dd></div>
   </dl>
   <HistoricalSaleRows records={data.records}/>
   {(page>1||data.hasMore)&&<nav aria-label="Historical sales pages" className="mt-3 flex items-center justify-between gap-2 text-xs">
    <button type="button" disabled={page===1} className="rounded border px-3 py-2 disabled:opacity-50" onClick={()=>setPage(value=>value-1)}>Previous</button>
    <span>Page {page}</span>
    <button type="button" disabled={!data.hasMore} className="rounded border px-3 py-2 disabled:opacity-50" onClick={()=>setPage(value=>value+1)}>Next</button>
   </nav>}
  </>}
 </section>
}
