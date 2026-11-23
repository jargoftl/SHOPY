import UiverseSelect from './UiverseSelect.jsx'
import {Circle} from 'lucide-react'
import {formatTimestamp,timestampMillis} from '../lib/storeDates.js'
import CryptoWalletIcon from './CryptoWalletIcon.jsx'
import {sessionUrl} from '../lib/tabSession.js'
import { useEffect,useState } from 'react'
import { apiRequest } from '../lib/api.js'
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((c||0)/100)
const field='mt-1 block w-full rounded-lg border border-[#111111] bg-[#111111] px-3 py-2 text-sm text-white'
const button='rounded-lg border border-[#555555] bg-[#111111] px-4 py-2 text-xs text-white disabled:opacity-50'
function recordedDate(fields){
 if(fields.has('useCurrentTime'))return undefined
 const local=String(fields.get('paymentTime'))
 return new Date(`${local}${local.length===16?':00':''}+01:00`).toISOString()
}
function PaymentDateFields({initialDate}){
 const [current,setCurrent]=useState(!initialDate)
 const time=timestampMillis(initialDate)
 const defaultValue=Number.isFinite(time)?new Date(time+3600000).toISOString().slice(0,19):''
 return <>
  <label className="flex min-h-9 items-center gap-2 text-xs">
   <input name="useCurrentTime" type="checkbox" checked={current} onChange={event=>setCurrent(event.target.checked)}/> Use current date and time
  </label>
  {!current&&<label className="text-xs">Payment date and time (Lagos)
   <input type="datetime-local" name="paymentTime" step="1" defaultValue={defaultValue} className={field} required/>
  </label>}
 </>
}
function EditPaymentDate({request,busy,onUpdate}){
 return <details className="mt-4 rounded-lg border border-[#555] p-3">
  <summary className="cursor-pointer text-xs font-semibold">Edit payment date</summary>
  <form className="mt-2 flex flex-wrap items-end gap-3" onSubmit={event=>{
   event.preventDefault()
   onUpdate({action:'edit-date',recordedAt:recordedDate(new FormData(event.currentTarget))})
  }}>
   <PaymentDateFields initialDate={request.resolved_at||request.updated_at}/>
   <button type="submit" disabled={busy} className={button}>Save date</button>
  </form>
 </details>
}
function WithdrawalReview({request,busy,onUpdate}){
 const [copyStatus,setCopyStatus]=useState('')
 const pending=request.status==='awaiting_transfer'
 async function copyAddress(){
  try{await navigator.clipboard.writeText(request.address);setCopyStatus('Address copied.')}
  catch{setCopyStatus('Select the address to copy it manually.')}
 }
 return <div className="mt-3">
  <div className="flex flex-wrap items-center gap-2">
   <code className="min-w-0 select-all break-all text-sm">{request.address}</code>
   <button type="button" className={button} onClick={copyAddress}>Copy address</button>
  </div>
  {copyStatus&&<p role="status" className="mt-1 text-xs">{copyStatus}</p>}
  {pending&&<form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event=>{
   event.preventDefault()
   onUpdate({action:'accept',recordedAt:recordedDate(new FormData(event.currentTarget))})
  }}>
   <PaymentDateFields/>
   <button type="submit" disabled={busy||request.refundPending} className={button}>Accept</button>
   <button type="button" disabled={busy} className={button} onClick={()=>onUpdate({action:'reject'})}>Reject</button>
   {request.refundPending&&<p className="w-full text-xs text-amber-300">Resolve the related refund before accepting.</p>}
  </form>}
 </div>
}
function AcceptTransfer({busy,onAccept}){
 return <details className="mt-4 rounded-lg border border-[#555] p-3">
  <summary className="cursor-pointer text-sm font-semibold">Accept</summary>
  <form className="mt-3 grid gap-3" onSubmit={event=>{
   event.preventDefault()
   const fields=new FormData(event.currentTarget)
   onAccept({action:'confirm',verified:fields.get('verified')==='on',recordedAt:recordedDate(fields)})
  }}>
   <PaymentDateFields/>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="verified" required/> The deposit transfer was received.</label>
   <button disabled={busy} className={`${button} w-fit`}>Accept deposit</button>
  </form>
 </details>
}
const descriptions = {
 deposit: ['Seller deposits','Open the seller’s payment proof and verify the transfer before crediting their wallet.'],
 withdrawal: ['Seller withdrawals','Record the decision on each withdrawal. Accept a request after sending the funds outside SHOPY.'],
 sales: ['Sale payouts & balances','Review paid sales and seller wallet balances.'],
}
export default function AdminSellerFinance({view}){
 const [title,description]=descriptions[view]
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[statusFilter,setStatusFilter]=useState('pending'),[sellerId,setSellerId]=useState(null)
 const query=new URLSearchParams({view,...(sellerId?{sellerId}:{})}).toString()
 const [loadedQuery,setLoadedQuery]=useState('')
 const load=()=>apiRequest(`/api/admin/seller-finance?${query}`).then(result=>{setData(result);setLoadedQuery(query)})
 useEffect(()=>{
  let active=true
  setError('')
  setNotice('')
  apiRequest(`/api/admin/seller-finance?${query}`).then(result=>{
   if(active){setData(result);setLoadedQuery(query)}
  }).catch(error=>{if(active)setError(error.message)})
  return()=>{active=false}
 },[query])
 const act=async(fn,success)=>{setBusy(true);setError('');setNotice('');try{await fn();if(success){setNotice(success);await load()}}catch(e){setError(e.message)}finally{setBusy(false)}}
 const update=(id,body)=>act(()=>apiRequest(`/api/admin/seller-finance/requests/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  ['confirm','accept'].includes(body.action)?(view==='deposit'?'Accepted. Seller wallet credited.':'Accepted.')
  :body.action==='reject'?'Rejected.':body.action==='edit-date'?'Payment date updated.':'Payment details saved.')
 const accounts=data?.accounts??[]
 const selectedAccount=accounts.find(account=>account.id===sellerId)
 const requests=(loadedQuery===query?data?.requests??[]:[]).filter(request=>{
  if(statusFilter==='all')return true
  if(statusFilter==='accepted')return request.status==='confirmed'
  if(statusFilter==='rejected')return request.status==='rejected'
  return !['confirmed','rejected'].includes(request.status)
 })
 const removeRequest=request=>{
  const pending=!['confirmed','rejected'].includes(request.status)
  const message=pending
   ? 'Remove this pending payment? Continue only if no transfer has taken place. A pending withdrawal hold will be released.'
   : 'Remove this payment from seller history? The wallet balance and financial audit will be preserved.'
  if(!window.confirm(message))return
  act(()=>apiRequest(`/api/admin/seller-finance/requests/${request.id}/archive`,{method:'POST',
   body:JSON.stringify({confirmUnsent:pending})}), 'Payment removed from history.')
 }
 const loadOlder=()=>act(async()=>{
  const page=await apiRequest(`/api/admin/seller-finance?${query}&before=${data.nextBefore}`)
  setData(current=>({...current,requests:[...current.requests,...page.requests],nextBefore:page.nextBefore}))
 })
 const clearRequests=()=> {
  const scope=selectedAccount?selectedAccount.name:'all accounts'
  if(!window.confirm(`Clear pending and rejected ${view} requests for ${scope}? Continue only if no pending request has already been paid. Pending withdrawals will be canceled and their holds released.`))return
  act(()=>apiRequest('/api/admin/seller-finance/requests/archive',{method:'POST',body:JSON.stringify({
   kind:view,sellerId:selectedAccount?.id,confirmUnsent:true
  })}), 'Pending and rejected requests cleared.')
 }
 return <section className="rounded-xl border border-[#111111] bg-[#111111] p-5 text-white">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#cccccc]">{description}</p></div>
  <button className={button} disabled={busy} onClick={()=>act(load)}>Refresh</button></div>
  {error&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
  {notice&&<p role="status" className="mt-4 text-sm text-green-300">{notice}</p>}
  {loadedQuery!==query&&!error&&<p role="status" className="mt-4 text-sm">Loading payment records…</p>}
  {view!=='sales'&&<>
   {accounts.length>0&&<div className="mt-4">
    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Seller accounts">
     <button type="button" aria-pressed={!selectedAccount} className={button} disabled={busy} onClick={()=>{setSellerId(null);setStatusFilter('pending')}}>All accounts</button>
     {accounts.map(account=><button type="button" key={account.id} aria-pressed={selectedAccount?.id===account.id}
      className={`${button} shrink-0 text-left aria-pressed:border-blue-400`} disabled={busy} onClick={()=>{setSellerId(account.id);setStatusFilter('all')}}>
      <strong className="block">{account.name}</strong><span className="block">{account.email}</span>
     </button>)}
    </nav>
    <button type="button" className={`${button} mt-2`} disabled={busy||loadedQuery!==query} onClick={clearRequests}>Clear pending and rejected requests</button>
   </div>}
   <label className="mt-4 inline-block text-xs">Status
    <UiverseSelect value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className={field}>
     <option value="all">All statuses</option><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option>
    </UiverseSelect>
   </label>
   <div className="mt-5 space-y-4">{requests.map(q=><article key={q.id} className="rounded-xl border border-[#444] p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{q.storeName} · #{q.sellerPublicId}</p><p className="mt-1 text-xs text-[#a3a3a3]">{q.kind==='deposit'&&`#${q.transaction_ref} · ${q.coin} · `} {q.status==='confirmed'?'Accepted':q.status==='rejected'?'Rejected':<span className="inline-flex items-center gap-1 rounded bg-[#fff1e6] px-1.5 py-0.5 font-semibold text-[#9a370b]"><Circle size={12} aria-hidden="true"/>Pending</span>} · {formatTimestamp(q.resolved_at||q.created_at)}</p></div><strong>{money(q.amount_cents)}</strong></div>{q.kind==='withdrawal'&&<WithdrawalReview request={q} busy={busy} onUpdate={body=>update(q.id,body)}/>}{q.address&&q.kind==='deposit'&&<div className="mt-3 text-xs"><div className="flex flex-wrap items-center gap-2"><CryptoWalletIcon coin={q.coin}/>{q.coin_amount} {q.coin}<CryptoWalletIcon network={q.network}/>{q.network}</div><p className="mt-2 break-all">{q.address}</p></div>}{q.kind==='deposit'&&q.submitted_reference&&<p className="mt-3 break-all text-xs">Seller’s transaction reference: {q.submitted_reference}</p>}{q.kind==='deposit'&&q.transfer_reference&&<p className="mt-3 break-all text-xs">Transfer: {q.transfer_reference}</p>}{q.receiptId&&<details className="mt-3 rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Preview payment proof</summary>
    {/^(image\/png|image\/jpeg)$/.test(q.receiptContentType||'')&&<img loading="lazy" src={sessionUrl(`/api/seller/finance/receipts/${q.receiptId}`)} alt="Seller payment screenshot" className="mt-3 max-h-80 max-w-full rounded-lg object-contain"/>}
    <a className="mt-2 inline-block underline" target="_blank" rel="noreferrer" href={sessionUrl(`/api/seller/finance/receipts/${q.receiptId}`)}>Open full payment proof</a>
   </details>}
 {q.status==='requested'&&<form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={event=>{
  event.preventDefault()
  const values=Object.fromEntries(new FormData(event.currentTarget))
  update(q.id,{...values,action:'quote'})
 }}>
  <label className="text-xs">Network<input name="network" required maxLength={80} className={field} defaultValue={data.paymentWallets.find(w=>w.coin===q.coin)?.network}/></label>
  <label className="text-xs">Receiving address<input name="address" required maxLength={200} className={field} defaultValue={data.paymentWallets.find(w=>w.coin===q.coin)?.address}/></label>
  <label className="text-xs">USD per coin<input name="usdRate" required className={field} defaultValue={data.paymentWallets.find(w=>w.coin===q.coin)?.usd_rate}/></label>
  <button disabled={busy} className={button}>Send payment details</button>
 </form>}
 {q.kind==='deposit'&&q.status==='awaiting_review'&&q.usd_rate&&<AcceptTransfer busy={busy} onAccept={body=>update(q.id,body)}/>}
 {q.kind==='deposit'&&!['confirmed','rejected'].includes(q.status)&&<form className="mt-4 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();update(q.id,{action:'reject'})}}><button disabled={busy} className={button}>Reject</button></form>}
 {q.status==='confirmed'&&<EditPaymentDate key={q.resolved_at||q.updated_at} request={q} busy={busy} onUpdate={body=>update(q.id,body)}/>}
 <button type="button" disabled={busy} className="mt-4 text-xs underline disabled:opacity-50" onClick={()=>removeRequest(q)}>Remove from history</button>
 </article>)}{loadedQuery===query&&data&&!requests.length&&<p className="py-5 text-sm text-[#a3a3a3]">No {view==='deposit'?'deposits':'withdrawals'} in this view.</p>}</div>{loadedQuery===query&&data?.nextBefore&&<button type="button" className={`${button} mt-4`} disabled={busy} onClick={loadOlder}>Load older payments</button>}</>}
 {view==='sales'&&<><h3 className="mt-8 font-semibold">Sale release queue</h3><div className="mt-4 overflow-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr>{['Order','Store','Product subtotal','Payment / delivery','Release','Action'].map(h=><th className="border-b border-[#111111] p-3" key={h}>{h}</th>)}</tr></thead><tbody>{data?.sales.map(s=><tr key={`${s.orderId}:${s.sellerId}`}><td className="p-3">#{s.orderNumber}</td><td>{s.storeName}<br/>#{s.sellerPublicId}</td><td>{money(s.amountCents)}</td><td>{s.paymentStatus} / {s.deliveryStatus}<br/>{s.coin}{s.refundStatus&&` · refund ${s.refundStatus}`}</td><td>{s.releaseStatus||'Not confirmed'}{s.confirmedBy&&<p className="mt-1 text-xs">{s.confirmedBy} · {s.confirmedRole}<br/>{s.confirmedAt}</p>}</td><td>{!s.releaseStatus&&s.paymentStatus==='paid'&&(s.accountBalancePayment||(s.coin!=='BALANCE'&&s.deliveryStatus==='delivered'))&&(!s.refundStatus||s.refundStatus==='rejected')?<form onSubmit={e=>{e.preventDefault();act(()=>apiRequest('/api/admin/seller-finance/releases',{method:'POST',body:JSON.stringify({orderId:s.orderId,sellerId:s.sellerId,amountCents:s.amountCents,verified:true})}),'Sale proceeds released.')}}><label className="block"><input type="checkbox" required/> Verify full amount</label><button className={`${button} mt-2`} disabled={busy}>Release {money(s.amountCents)}</button></form>:s.coin==='BALANCE'&&!s.accountBalancePayment?'Legacy credit: noncash':'—'}</td></tr>)}</tbody></table></div><h3 className="mt-8 font-semibold">Seller wallet balances</h3><div className="mt-3 flex flex-wrap gap-3">{data?.wallets.map(w=><div key={w.seller_id} className="rounded-xl border border-[#111111] p-4 text-xs"><p>{w.name} · #{w.publicId}</p><p className="mt-2 font-semibold">{money(w.balance_cents)}</p><p className="mt-1 text-[#a3a3a3]">Held: {money(w.reserved_cents)}</p></div>)}</div></>}
 </section>
}
