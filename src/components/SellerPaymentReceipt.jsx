import {useEffect,useState} from 'react'
import {Upload,CheckCircle2} from 'lucide-react'
import {apiRequest} from '../lib/api.js'
export default function SellerPaymentReceipt({requestId,onUploaded}){
 const [file,setFile]=useState(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false)
 useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
 const choose=e=>{const next=e.target.files?.[0];setError('');setSent(false);if(!next)return;if(!['image/png','image/jpeg'].includes(next.type)||next.size>2097152){setFile(null);setPreview('');setError('Choose a PNG or JPEG image up to 2 MB.');e.target.value='';return}setFile(next)}
 const submit=async e=>{e.preventDefault();if(!file||busy)return;setBusy(true);setError('');try{await apiRequest(`/api/seller/finance/requests/${requestId}/receipt`,{method:'POST',headers:{'Content-Type':file.type},body:file});setSent(true);await onUploaded?.()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <form className="seller-receipt-form" onSubmit={submit}><h3><Upload size={18}/>Payment receipt</h3><p>After paying, attach your receipt for verification. Uploading a receipt does not confirm payment.</p><label>Choose receipt<input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={busy||sent}/></label>{file&&preview&&<div className="seller-receipt-preview"><img src={preview} alt="Selected payment receipt"/><span>{file.name}</span></div>}{error&&<p role="alert" className="portal-error">{error}</p>}{sent?<p role="status" className="receipt-success"><CheckCircle2 size={17}/>Receipt submitted. Under review.</p>:<button type="submit" disabled={!file||busy}>{busy?'Uploading…':'Submit payment receipt'}</button>}</form>
}
