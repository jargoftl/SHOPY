import {useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {formatMoney} from '../lib/money.js'
export default function SaleConfirmations({sales=[],onConfirmed}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const eligible=sales.filter(s=>s.accountBalancePayment&&s.paymentStatus==='paid'&&!s.releaseStatus&&(!s.refundStatus||s.refundStatus==='rejected'))
 if(!eligible.length)return null
 const confirm=async(e,s)=>{e.preventDefault();setBusy(true);setMessage('');try{await apiRequest('/api/seller/finance/releases',{method:'POST',body:JSON.stringify({orderId:s.orderId,sellerId:s.sellerId,amountCents:s.amountCents,verified:true})});setMessage(`Sale #${s.orderNumber} confirmed. ${formatMoney(s.amountCents)} credited once to your wallet.`);await onConfirmed?.()}catch(error){setMessage(error.message)}finally{setBusy(false)}}
 return <section className="mt-6 border border-black bg-white p-5 text-black"><h2 className="font-semibold">Confirm paid sales</h2><p className="mt-2 text-xs leading-6 text-gray-500">The customer has already paid from their balance. Confirm the sale to release its proceeds. The full product subtotal is credited once to your store wallet, with the confirming account recorded.</p>{eligible.slice(0,20).map(s=><form onSubmit={e=>confirm(e,s)} key={`${s.orderId}:${s.sellerId}`} className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t pt-4"><div className="text-sm"><strong>Order #{s.orderNumber}</strong><p className="mt-1">{formatMoney(s.amountCents)} · paid from balance</p></div><label className="text-xs"><input type="checkbox" required/> I confirm this paid sale</label><button disabled={busy} className="bg-black px-5 py-3 text-xs font-semibold text-white disabled:opacity-50">Confirm sale</button></form>)}{message&&<p role="status" className="mt-4 text-sm">{message}</p>}</section>
}
