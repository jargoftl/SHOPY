import {useState} from 'react'
import {Link} from 'react-router-dom'
import PasswordInput from './PasswordInput.jsx'
import {coinNetworks} from './CryptoWalletIcon.jsx'
import {apiRequest} from '../lib/api.js'
import {formatMoney} from '../lib/money.js'

const field='mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'

function SalePayoutForm({sale,busy,onSubmit}){
 const [destination,setDestination]=useState('wallet')
 const [coin,setCoin]=useState('BTC')
 return <form onSubmit={event=>onSubmit(event,sale)} className="mt-4 border-t border-slate-200 pt-4">
  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
   <strong>Order #{sale.orderNumber}</strong>
   <span className="font-semibold">{formatMoney(sale.amountCents)}</span>
  </div>
  <fieldset disabled={busy} className="mt-3 space-y-3">
   <label className="block text-sm">Payout destination
    <select name="destination" className={field} value={destination} onChange={event=>setDestination(event.target.value)}>
     <option value="wallet">Credit my SHOPY wallet</option>
     <option value="crypto">Send to my crypto wallet</option>
    </select>
   </label>
   {destination==='crypto'&&<div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm">Coin
     <select name="coin" className={field} value={coin} onChange={event=>setCoin(event.target.value)}>
      {Object.keys(coinNetworks).map(code=><option key={code}>{code}</option>)}
     </select>
    </label>
    <label className="block text-sm">Network
     <input key={coin} name="network" list={`payout-networks-${sale.orderId}`} required maxLength={100} className={field}/>
    </label>
    <datalist id={`payout-networks-${sale.orderId}`}>{coinNetworks[coin].map(network=><option key={network} value={network}/>)}</datalist>
    <label className="block text-sm sm:col-span-2">Your receiving wallet address
     <input name="address" required maxLength={500} className={field}/>
    </label>
    <label className="block text-sm">Transaction PIN
     <PasswordInput name="transactionPin" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required className={field}/>
    </label>
    <p className="text-xs text-slate-600 sm:self-end">Transfers require review. <Link to="/seller/wallet" className="underline">Manage your PIN in My wallet.</Link></p>
   </div>}
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" required/> I confirm this paid sale and payout destination.</label>
   <button type="submit" className="rounded-lg bg-black px-5 py-3 text-xs font-semibold text-white disabled:opacity-50">
    {busy?'Submitting…':destination==='crypto'?'Request crypto payout':'Credit SHOPY wallet'}
   </button>
  </fieldset>
 </form>
}

export default function SaleConfirmations({sales=[],onConfirmed}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const eligible=sales.filter(s=>s.accountBalancePayment&&s.paymentStatus==='paid'&&!s.releaseStatus&&(!s.refundStatus||s.refundStatus==='rejected'))
 async function confirm(event,sale){
  event.preventDefault()
  if(busy)return
  const fields=Object.fromEntries(new FormData(event.currentTarget))
  setBusy(true)
  setMessage('')
  try{
   await apiRequest('/api/seller/finance/releases',{method:'POST',body:JSON.stringify({
    ...fields,orderId:sale.orderId,sellerId:sale.sellerId,amountCents:sale.amountCents,verified:true
   })})
   setMessage(fields.destination==='crypto'
    ? `Crypto payout requested for sale #${sale.orderNumber}.`
    : `${formatMoney(sale.amountCents)} credited to your wallet.`)
   await onConfirmed?.()
  }catch(error){setMessage(error.message)}
  finally{setBusy(false)}
 }
 if(!eligible.length&&!message)return null
 return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-black">
  <h2 className="font-semibold">Paid sale payouts</h2>
  {eligible.slice(0,20).map(sale=><SalePayoutForm key={`${sale.orderId}:${sale.sellerId}`} sale={sale} busy={busy} onSubmit={confirm}/>)}
  {message&&<p role="status" className="mt-4 text-sm">{message}</p>}
 </section>
}
