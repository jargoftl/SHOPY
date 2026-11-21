import {Link} from 'react-router-dom'
import PasswordInput from './PasswordInput.jsx'
import {useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {formatMoney} from '../lib/money.js'

export default function SaleConfirmations({sales=[],onConfirmed}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const eligible=sales.filter(s=>s.accountBalancePayment&&s.paymentStatus==='paid'&&!s.releaseStatus&&(!s.refundStatus||s.refundStatus==='rejected'))
 async function confirm(event,sale){
  event.preventDefault()
  if(busy)return
  const form=event.currentTarget
  const transactionPin=new FormData(form).get('transactionPin')
  form.reset()
  setBusy(true)
  setMessage('')
  try{
   await apiRequest('/api/seller/finance/releases',{method:'POST',body:JSON.stringify({
    transactionPin,destination:'wallet',orderId:sale.orderId,sellerId:sale.sellerId,amountCents:sale.amountCents,verified:true
   })})
   setMessage(`${formatMoney(sale.amountCents)} credited to your wallet.`)
   await onConfirmed?.()
  }catch(error){setMessage(error.message)}
  finally{setBusy(false)}
 }
 if(!eligible.length&&!message)return null
 return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-black">
  <h2 className="font-semibold">Confirm paid sales</h2>
  {eligible.slice(0,20).map(sale=><form key={`${sale.orderId}:${sale.sellerId}`} onSubmit={event=>confirm(event,sale)} className="mt-4 border-t border-slate-200 pt-4">
   <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <strong>Order #{sale.orderNumber}</strong>
    <span className="font-semibold">{formatMoney(sale.amountCents)}</span>
   </div>
   <label className="mt-3 block text-sm font-medium">Transaction PIN
    <PasswordInput name="transactionPin" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" className="mt-1 w-full rounded-lg border p-2"/>
   </label>
   <Link to="/seller/wallet" className="mt-2 block text-sm text-blue-700 underline">Set or reset your PIN in My wallet</Link>
   <button type="submit" disabled={busy} className="mt-3 rounded-lg bg-black px-5 py-3 text-xs font-semibold text-white disabled:opacity-50">
    {busy?'Confirming…':'Confirm'}
   </button>
  </form>)}
  {message&&<p role="status" className="mt-4 text-sm">{message}</p>}
 </section>
}
