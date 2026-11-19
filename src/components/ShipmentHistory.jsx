import {useEffect,useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {fulfillmentLabel} from '../lib/fulfillment.js'
export default function ShipmentHistory({trackingNumber,revision}){
 const [open,setOpen]=useState(false),[history,setHistory]=useState(null),[error,setError]=useState('')
 useEffect(()=>{if(!open||!trackingNumber)return;let active=true;apiRequest(`/api/orders/track/${trackingNumber}`).then(d=>{if(active){setHistory(d.history);setError('')}}).catch(e=>active&&setError(e.message));return()=>{active=false}},[open,trackingNumber,revision])
 if(!trackingNumber)return null
 return <details className="shipment-history" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Dispatch & tracking history</summary>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{history&&<ol className="shipment-history-list">{history.map((event,i)=><li key={i}><span className="shipment-history-dot" aria-hidden="true"/><h3>{fulfillmentLabel(event.status)}</h3>{event.note&&<p>{event.note}</p>}<p className="text-gray-500">Updated by {event.updatedBy==='admin'?'SUPPORT':'ACCOUNT'}</p><time>{event.createdAt} UTC</time></li>)}</ol>}{history?.length===0&&<p className="mt-3 text-xs text-gray-500">No progress updates recorded yet.</p>}</details>
}
