import {useState} from 'react'
import {Mail} from 'lucide-react'
import {apiRequest} from '../lib/api.js'
const labels={pending:'Queued',sending:'Sending',sent:'Sent',failed:'Retry needed'}
export default function DeliveryEmailStatus({shipment,orderId,admin=false,onUpdated}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 if(shipment.status!=='delivered')return null
 const retry=async()=>{setBusy(true);setMessage('');try{const result=await apiRequest(`/api/admin/purchase-sellers/${orderId}/${shipment.sellerId}/delivery-email`,{method:'POST',body:'{}'});setMessage(result.email?.status==='sent'?'Delivery email sent.':'Delivery email queued for retry.');await onUpdated?.()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <div className="mt-3 text-xs"><p className="flex items-center gap-1"><Mail size={13}/>Delivery email: {labels[shipment.deliveryEmailStatus]||'Not queued'}</p>{admin&&!['sent','sending'].includes(shipment.deliveryEmailStatus)&&<button type="button" disabled={busy} onClick={retry} className="mt-2 min-h-9 underline disabled:opacity-50">{busy?'Sending…':'Send / retry delivery email'}</button>}{message&&<p role="status" className="mt-2">{message}</p>}</div>
}
