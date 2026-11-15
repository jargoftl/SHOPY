import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, PackageCheck, RefreshCw, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'

export default function WarehousePublishModal({product,onClose,onConfirm}){
 const dialog=useRef(null),inFlight=useRef(false),[quote,setQuote]=useState(null),[loading,setLoading]=useState(true),[publishing,setPublishing]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{const element=dialog.current;element.showModal();return()=>{if(element.open)element.close()}},[])
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setQuote(null)
  apiRequest(`/api/warehouse/${product.id}/quote`,{background:true}).then(data=>{if(active)setQuote(data)}).catch(failure=>{if(active)setError(failure.message)}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[product.id,revision])
 const confirm=async(event)=>{
  event.preventDefault();if(inFlight.current||!quote||quote.storeProductId||loading)return
  inFlight.current=true;setPublishing(true);setError('')
  try{await onConfirm({...product,...quote.product},quote.pricing);onClose()}
  catch(failure){setError(failure.message);if(failure.priceChanged)setQuote(null)}
  finally{inFlight.current=false;setPublishing(false)}
 }
 const item=quote?.product||product
 return <dialog ref={dialog} aria-labelledby="warehouse-publish-title" data-preserve-theme onCancel={event=>{event.preventDefault();if(!publishing)onClose()}} className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-3xl border border-[#dfe6d7] bg-[#fffef9] p-0 text-[#284333] shadow-2xl backdrop:bg-[#12251d]/60 backdrop:backdrop-blur-sm">
  <form onSubmit={confirm} className="p-5 sm:p-7">
   <div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#839373]"><PackageCheck size={16}/>From warehouse to storefront</span><button type="button" autoFocus onClick={onClose} disabled={publishing} aria-label="Close publishing confirmation" className="rounded-full border border-[#e0e7d9] p-2 text-[#7a8c6e] disabled:opacity-40"><X size={15}/></button></div>
   <h2 id="warehouse-publish-title" className="mt-4 font-[Fraunces] text-2xl tracking-tight">Make it part of your store.</h2>
   <div className="mt-5 flex items-center gap-4 rounded-2xl border border-[#e5eade] bg-white p-3"><img src={item.imageUrl} alt="" className="size-20 shrink-0 rounded-xl bg-[#f4f6ef] object-contain"/><div className="min-w-0"><p className="text-[9px] font-medium uppercase tracking-wide text-[#8a967e]">{item.category}</p><h3 className="mt-2 line-clamp-3 text-sm font-semibold leading-6">{item.name}</h3></div></div>
   {loading?<p role="status" className="py-8 text-center text-xs text-[#819074]">Checking the current price…</p>:quote?<>
    <dl className="mt-5 space-y-4 text-sm"><div className="flex items-center justify-between gap-4"><dt className="text-[#819074]">Retail price</dt><dd className="text-lg font-semibold">{formatMoney(quote.pricing.retailCents)}</dd></div><div className="flex items-center justify-between gap-4"><dt className="text-[#819074]">Wholesale price</dt><dd className="font-medium">{formatMoney(quote.pricing.wholesaleCents)}</dd></div><div className="flex items-center justify-between gap-4 rounded-xl border border-[#dbe7ce] bg-[#eef5e7] p-4"><dt><span className="block text-xs font-semibold">Estimated gross profit</span><span className="mt-1 block text-[10px] text-[#859976]">15% margin · per unit</span></dt><dd className="text-xl font-semibold text-[#456d36]">{formatMoney(quote.pricing.profitCents)}</dd></div></dl>
    <p className="mt-3 text-[10px] leading-5 text-[#95a187]">The wholesale estimate uses 85% of retail. Estimated profit is before shipping, fees and taxes.</p>
    {quote.storeProductId?<div className="mt-4 rounded-xl bg-[#edf4e7] p-4 text-xs leading-6"><p className="flex items-center gap-2 font-medium"><CheckCircle2 size={16}/>This product is already in your store.</p><Link to="/seller/products" className="mt-2 inline-block underline underline-offset-4">Open Store products</Link></div>:<p className="mt-5 flex items-start gap-2 text-xs leading-6 text-[#7d906c]"><CheckCircle2 size={16} className="mt-1 shrink-0"/>Confirm to publish in your store and on the marketplace homepage. Its category, photos and options are copied automatically.</p>}
   </>:null}
   {error&&<p role="alert" className="mt-4 rounded-xl border border-[#e3cfc1] bg-[#fff4ed] p-3 text-xs leading-6 text-[#a16e4d]">{error}</p>}
   {!loading&&<button type="button" disabled={publishing} onClick={()=>setRevision(value=>value+1)} className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-[#8a9a7a] underline underline-offset-4"><RefreshCw size={11}/>Refresh price</button>}
   <div className="mt-6 grid grid-cols-[.7fr_1.3fr] gap-3 border-t border-[#e8ecdf] pt-5"><button type="button" disabled={publishing} onClick={onClose} className="min-h-12 rounded-full border border-[#d6dfcc] bg-white text-xs font-medium text-[#7b8f6a] disabled:opacity-40">Cancel</button><button type="submit" disabled={loading||publishing||!quote||Boolean(quote?.storeProductId)} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#2d513b] px-3 text-xs font-semibold text-white transition hover:bg-[#3d6546] disabled:opacity-40">{publishing?'Publishing…':'Confirm & publish'}{!publishing&&<ArrowRight size={15}/>}</button></div>
  </form>
 </dialog>
}
