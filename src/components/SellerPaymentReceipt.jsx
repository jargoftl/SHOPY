import {useState} from 'react'
import {UploadCloud} from 'lucide-react'
import {apiRequest} from '../lib/api.js'

export default function SellerPaymentReceipt({requestId,prepareRequest,onBusyChange,onUploaded,children,locked=false}){
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [sent,setSent]=useState(false)
 const [fileName,setFileName]=useState('')

 async function submit(event){
  event.preventDefault()
  if(busy||sent||locked)return
  const fields=new FormData(event.currentTarget)
  const file=fields.get('receipt')
  if(!file?.size||!['image/png','image/jpeg','application/pdf'].includes(file.type)||file.size>2097152){
   setError('Choose a PDF, PNG or JPEG file up to 2 MB.')
   return
  }
  setBusy(true)
  onBusyChange?.(true)
  setError('')
  try{
   const request=prepareRequest?await prepareRequest(fields):{id:requestId,status:'awaiting_receipt'}
   if(request.status==='awaiting_receipt'){
    await apiRequest(`/api/seller/finance/requests/${request.id}/receipt`,{
     method:'POST',
     headers:{'Content-Type':file.type},
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

 return <form className="seller-deposit-proof" onSubmit={submit}>
  <fieldset disabled={busy||locked} className="space-y-3">
   {children}
   <label className="seller-proof-file">
    <UploadCloud size={25} className="shrink-0" aria-hidden="true"/>
    <span className="min-w-0">
     <span className="block text-sm font-semibold">Upload payment screenshot</span>
     <span className="block break-all text-xs">{fileName||(locked?'Set a transaction PIN to upload':'PNG, JPEG or PDF · Up to 2 MB')}</span>
    </span>
    <input name="receipt" type="file" accept="application/pdf,image/png,image/jpeg" required
     className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
     onChange={event=>{setFileName(event.target.files?.[0]?.name||'');setError('')}}/>
   </label>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   {!locked&&<button type="submit" disabled={busy} className="min-h-10 w-full rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50">
    {busy?'Submitting…':'Submit payment proof'}
   </button>}
  </fieldset>
 </form>
}
