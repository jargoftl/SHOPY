import {useState} from 'react'
import {UploadCloud} from 'lucide-react'
import {apiRequest} from '../lib/api.js'

export default function SellerPaymentReceipt({requestId,prepareRequest,onBusyChange,onUploaded,children}){
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [sent,setSent]=useState(false)
 const [fileName,setFileName]=useState('')

 async function submit(event){
  event.preventDefault()
  if(busy||sent)return
  const fields=new FormData(event.currentTarget)
  const file=fields.get('receipt')
  if(!file?.size||!['image/png','image/jpeg','application/pdf'].includes(file.type)||file.size>2097152){
   setError('Choose a PDF, PNG or JPEG file up to 2 MB.')
   return
  }
  const reference=String(fields.get('reference')||'').trim()
  setBusy(true)
  onBusyChange?.(true)
  setError('')
  try{
   const request=prepareRequest?await prepareRequest(fields):{id:requestId,status:'awaiting_receipt'}
   if(request.status==='awaiting_receipt'){
    await apiRequest(`/api/seller/finance/requests/${request.id}/receipt`,{
     method:'POST',
     headers:{'Content-Type':file.type,...(reference?{'X-Payment-Reference':encodeURIComponent(reference)}:{})},
     body:file
    })
   }else if(!['awaiting_review','confirmed'].includes(request.status)){
    throw new Error('This deposit is closed. Check your deposit history for its status.')
   }
   setSent(true)
   await onUploaded?.()
  }catch(error){setError(error.message)}
  finally{setBusy(false);onBusyChange?.(false)}
 }

 if(sent)return <p role="status" className="mt-4 text-sm text-green-700">Payment proof submitted for review.</p>

 return <form className="mt-3" onSubmit={submit}>
  <fieldset disabled={busy} className="space-y-3">
   <label className="relative flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 p-3 text-blue-950 focus-within:ring-2 focus-within:ring-blue-600 hover:bg-blue-100">
    <UploadCloud size={25} className="shrink-0" aria-hidden="true"/>
    <span className="min-w-0">
     <span className="block text-sm font-semibold">Upload payment proof</span>
     <span className="block break-all text-xs">{fileName||'PDF, PNG or JPEG · Up to 2 MB'}</span>
    </span>
    <input name="receipt" type="file" accept="application/pdf,image/png,image/jpeg" required
     className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
     onChange={event=>{setFileName(event.target.files?.[0]?.name||'');setError('')}}/>
   </label>
   {children}
   <label className="block text-xs font-medium">Transaction ID (optional)
    <input name="reference" type="text" maxLength={300} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm"/>
   </label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   <button type="submit" disabled={busy} className="min-h-10 w-full rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50">
    {busy?'Submitting…':'Submit payment proof'}
   </button>
  </fieldset>
 </form>
}
