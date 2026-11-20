import {Copy, QrCode, X} from 'lucide-react'
import {transactionActor,transactionType,transactionNote} from '../lib/transactionLabels.js'
import CryptoWalletIcon,{coinNetworks} from '../components/CryptoWalletIcon.jsx'
import SellerPaymentReceipt from '../components/SellerPaymentReceipt.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'
import {Link,useSearchParams} from 'react-router-dom'
import PasswordInput from '../components/PasswordInput.jsx'
import SaleConfirmations from '../components/SaleConfirmations.jsx'
import {sessionUrl} from '../lib/tabSession.js'
import TransactionPinModal from '../components/TransactionPinModal.jsx'
import { useCallback,useEffect,useState,useRef } from 'react'
import { apiRequest } from '../lib/api.js'
import SellerWorkspace,{money,panel,button,input} from '../components/SellerWorkspace.jsx'
const coins=Object.keys(coinNetworks)
function DepositInstructions({ request }) {
 const [copyStatus,setCopyStatus]=useState('')
 const [showQr,setShowQr]=useState(false)
 const qrUrl=request.qrUrl||(request.hasQr?sessionUrl(`/api/seller/finance/requests/${request.id}/qr`):null)
 async function copyAddress(){
  try {await navigator.clipboard.writeText(request.address);setCopyStatus('Address copied.')}
  catch {setCopyStatus('Could not copy. Select the address to copy it manually.')}
 }
 return <section className="mt-3 rounded-xl border border-blue-100 bg-[#f3f7ff] p-3 text-sm">
  <div className="flex flex-wrap items-center gap-2">
   <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 font-bold text-blue-950"><CryptoWalletIcon coin={request.coin}/>{request.coin}</span>
   <span className="text-xs text-slate-600">Network</span>
   <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-semibold text-blue-950"><CryptoWalletIcon network={request.network}/>{request.network}</span>
  </div>
  {request.coin_amount&&<p className="mt-2 font-semibold">Send {request.coin_amount} {request.coin}</p>}
  <p className="mb-1 mt-3 text-xs font-medium text-slate-600">Receiving address</p>
  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-2.5 py-1">
   <code className="min-w-0 flex-1 select-all break-all text-xs">{request.address}</code>
   <button type="button" onClick={copyAddress} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded px-1 text-xs font-semibold text-blue-700">
    <Copy size={15} aria-hidden="true"/>Copy
   </button>
  </div>
  <p role="status" className="text-xs text-blue-800">{copyStatus}</p>
  {qrUrl&&<div className="mt-2">
   <button type="button" aria-expanded={showQr} onClick={()=>setShowQr(visible=>!visible)} className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-blue-700">
    <QrCode size={17} aria-hidden="true"/>{showQr?'Hide QR code':'Show QR code'}
   </button>
   {showQr&&<div className="mt-1 flex items-center gap-3">
    <img src={qrUrl} alt={`${request.coin} deposit QR code`} className="h-28 w-28 rounded bg-white object-contain"/>
    <a href={qrUrl} download={`${request.coin}-deposit-qr`} className="text-xs underline">Save QR code</a>
   </div>}
  </div>}
  {request.amount_cents&&<p className="mt-2 text-xs">Expected wallet credit {money(request.amount_cents)} after verification.</p>}
 </section>
}
function DepositAmount({wallet}){
 const [amount,setAmount]=useState('')
 const cents=Math.round(Number(amount)*100)
 let payment=''
 if(Number.isSafeInteger(cents)&&cents>0&&cents<=100000000){
  const [whole,fraction='']=wallet.usdRate.split('.')
  const rate=BigInt(whole+fraction.padEnd(8,'0'))
  const units=(BigInt(cents)*100000000000000n+rate-1n)/rate
  payment=`${units/100000000n}.${String(units%100000000n).padStart(8,'0')}`.replace(/0+$/,'').replace(/\.$/,'')
 }
 return <div>
  <label className="block text-xs font-medium">Deposit amount (USD)
   <input name="amount" value={amount} onChange={event=>setAmount(event.target.value)} type="number" min="0.01" max="1000000" step="0.01" required className="mt-1 block w-full rounded border px-2 py-1.5 text-sm"/>
  </label>
  {payment&&<div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2"><p className="text-xs text-slate-600">Amount to send</p><p className="break-all text-lg font-semibold">{payment} {wallet.coin}</p></div>}
 </div>
}

function DepositDialog({wallets,request,requestId,hasPin,onSetPin,onClose,onUploaded}){
 const [coin,setCoin]=useState(()=>!requestId&&wallets.some(wallet=>wallet.coin==='BTC')?'BTC':'')
 const [network,setNetwork]=useState(()=>!requestId&&wallets.filter(wallet=>wallet.coin==='BTC').length===1?wallets.find(wallet=>wallet.coin==='BTC').network:'')
 const networks=wallets.filter(wallet=>wallet.coin===coin)
 const availableCoins=[...new Set(wallets.map(wallet=>wallet.coin))]
 const [wallet,setWallet]=useState(null)
 const [error,setError]=useState('')
 const [submitting,setSubmitting]=useState(false)
 const dialog=useRef(null)
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID())
 const heading=useRef(null)
 useEffect(()=>{
  const node=dialog.current
  const previous=document.activeElement
  node.showModal()
  return()=>{node.close();previous?.focus()}
 },[])
 useEffect(()=>{heading.current?.focus()},[coin])
 useEffect(()=>{
  if(!coin||!network)return
  const controller=new AbortController()
  apiRequest(`/api/seller/finance/deposit-wallets/${encodeURIComponent(coin)}?${new URLSearchParams({network})}`,{signal:controller.signal})
   .then(wallet=>{if(!controller.signal.aborted)setWallet(wallet)}).catch(error=>{if(!controller.signal.aborted)setError(error.message)})
  return()=>controller.abort()
 },[coin,network])
 const choose=(next,chain)=>{
  setWallet(null)
  setError('')
  setRequestKey(crypto.randomUUID())
  setCoin(next)
  setNetwork(chain)
 }
 const prepareRequest=fields=>apiRequest('/api/seller/finance/requests',{method:'POST',body:JSON.stringify({
  kind:'deposit',requestKey,coin:wallet.coin,paymentNetwork:wallet.network,walletVersion:wallet.version,
  amountCents:Math.round(Number(fields.get('amount'))*100),transactionPin:fields.get('transactionPin')
 })})
 return <dialog ref={dialog} aria-labelledby="deposit-dialog-title" onCancel={event=>{event.preventDefault();if(!submitting)onClose()}} className={`${panel} m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto !p-4 backdrop:bg-black/40`}>
   <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
    <h2 ref={heading} tabIndex={-1} id="deposit-dialog-title" className="text-lg font-bold text-slate-900">{coin?`${coin} deposit`:'Deposit funds'}</h2>
    <button type="button" onClick={onClose} disabled={submitting} aria-label="Close deposit" className="grid min-h-9 min-w-9 place-items-center rounded-full hover:bg-slate-100"><X size={20} aria-hidden="true"/></button>
   </div>
   {!coin&&!requestId&&<div className="mt-2 grid gap-2">
    {availableCoins.length?availableCoins.map(type=>{
     const options=wallets.filter(wallet=>wallet.coin===type)
     return <button type="button" key={type} onClick={()=>choose(type,options.length===1?options[0].network:'')} className="flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left text-sm hover:bg-blue-50">
      <CryptoWalletIcon coin={type}/><strong>{type}</strong><span className="ml-auto text-xs text-slate-600">{options.length===1?options[0].network:`${options.length} networks`}</span>
     </button>
    }):<p className="text-sm text-gray-600">No deposit wallets are available yet.</p>}
   </div>}
   {coin&&<button type="button" disabled={submitting} onClick={()=>choose('','')} className="mb-1 min-h-8 text-xs text-blue-700 underline">Choose another coin</button>}
   {wallet&&networks.length>1&&<button type="button" disabled={submitting} onClick={()=>choose(coin,'')} className="ml-3 min-h-8 text-xs text-blue-700 underline">Change network</button>}
   {coin&&!network&&networks.length>1&&<section className="mb-2">
    <h3 className="mb-1 text-xs font-semibold text-slate-600">Choose a {coin} network</h3>
    <div className="grid gap-1.5">
     {networks.map(option=><button key={option.network} type="button" disabled={submitting} onClick={()=>choose(coin,option.network)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-sm hover:bg-blue-50">
      <CryptoWalletIcon network={option.network}/>{option.network}
     </button>)}
    </div>
   </section>}
   {network&&!wallet&&!error&&<p role="status" className="text-sm">Loading wallet…</p>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   {wallet&&<>
    <DepositInstructions request={wallet}/>
    {hasPin?<SellerPaymentReceipt prepareRequest={prepareRequest} onBusyChange={setSubmitting} onUploaded={onUploaded}>
     <DepositAmount wallet={wallet}/>
     <label className="block text-xs font-medium">Transaction PIN
      <PasswordInput name="transactionPin" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required className="mt-1 block w-full rounded border px-2 py-1.5 text-sm"/>
     </label>
    </SellerPaymentReceipt>:<button type="button" className="mt-3 text-sm text-blue-700 underline" onClick={onSetPin}>Set your transaction PIN before sending funds</button>}
   </>}
   {request?.status==='awaiting_receipt'&&<>
    <DepositInstructions request={request}/>
    <SellerPaymentReceipt requestId={request.id} onBusyChange={setSubmitting} onUploaded={onUploaded}/>
   </>}
   {request&&request.status!=='awaiting_receipt'&&<p role="status" className="mt-2 text-sm">{request.status==='awaiting_review'?'Payment proof submitted for review.':`Deposit ${request.status.replaceAll('_',' ')}.`}</p>}
 </dialog>
}

export default function SellerFinancePage({view='wallet'}){
 const [user,setUser]=useState(null),[data,setData]=useState(null),[analytics,setAnalytics]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState(''),[depositId,setDepositId]=useState(null),[withdrawalCoin,setWithdrawalCoin]=useState('BTC'),[pinSettingsOpen,setPinSettingsOpen]=useState(null),[filter,setFilter]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[key,setKey]=useState(''),[period,setPeriod]=useState('30'),[today,setToday]=useState(()=>new Date().toISOString().slice(0,10))
 const [params]=useSearchParams(),actionStarted=useRef(false)
 const refresh=useCallback(async()=>{const [u,d,a]=await Promise.all([apiRequest('/api/auth/me'),view==='statement'?Promise.resolve(null):apiRequest('/api/seller/finance'),view==='statement'?apiRequest('/api/seller/analytics'):Promise.resolve(null)]);setUser(u.user);setData(d);setAnalytics(a);setToday(new Date().toISOString().slice(0,10))},[view])
 useEffect(()=>{refresh().catch(e=>setError(e.message));const visibleRefresh=()=>{if(!document.hidden)refresh().catch(()=>{})};const timer=setInterval(visibleRefresh,30000);window.addEventListener('focus',visibleRefresh);return()=>{clearInterval(timer);window.removeEventListener('focus',visibleRefresh)}},[refresh])
 useEffect(()=>{const action=params.get('action');if(view!=='wallet'||!data||actionStarted.current||!['deposit','withdrawal'].includes(action))return;actionStarted.current=true;if(action==='withdrawal'&&!data.hasTransactionPin)setPinSettingsOpen(true);else{setKind(action);setKey(crypto.randomUUID())}},[data,params,view])
 const submit=async event=>{
  event.preventDefault()
  if(busy)return
  const form=new FormData(event.currentTarget)
  setBusy(true)
  setError('')
  try {
   await apiRequest('/api/seller/finance/requests',{method:'POST',body:JSON.stringify({
    kind:'withdrawal',requestKey:key,coin:form.get('coin'),amountCents:Math.round(Number(form.get('amount'))*100),
    network:form.get('network')||'',address:form.get('address')||'',transactionPin:form.get('transactionPin')||''
   })})
   setKind('')
   await refresh()
  } catch(error){setError(error.message)}
  finally {setBusy(false)}
 }
 const activeDeposit=data?.requests.find(request=>request.id===depositId)
 const pendingDeposit=data?.requests.find(request=>request.kind==='deposit'&&request.status==='awaiting_receipt')
 const closePayment=()=>{
  setKind('')
  setDepositId(null)
  setError('')
 }
 const depositWallets=data?.depositWallets||[]
 const records=(data?.records||[]).filter(r=>(filter==='all'||r.kind===filter)&&(!from||r.created_at.slice(0,10)>=from)&&(!to||r.created_at.slice(0,10)<=to))
 const daily=(analytics?.daily||[]).filter(d=>period==='all'||d.day>=new Date(new Date(today+'T00:00:00Z').getTime()-(Number(period)-1)*86400000).toISOString().slice(0,10))
 const title=view==='wallet'?'My wallet':view==='statement'?'Financial statement':'Transaction history'
 const download=()=>{const rows=[['Type','Reference','Change USD','Before USD','After USD','Held before USD','Held after USD','Action source','Note','UTC'],...records.map(r=>[transactionType(r.kind),r.reference??'',r.delta_cents/100,r.before_cents/100,r.after_cents/100,r.reserved_before/100,r.reserved_after/100,r.kind==='admin_funding'?'':transactionActor(r.actorRole),transactionNote(r.note),r.created_at])];const blob=new Blob([rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='account-transactions.csv';a.click();URL.revokeObjectURL(url)}
 return <SellerWorkspace user={user}><p className="text-xs font-bold tracking-[.18em] text-[#555555]">{view==='wallet'?'MY WALLET':view==='statement'?'FINANCIAL STATEMENT':'TRANSACTION HISTORY'}</p><h1 className="mt-2 font-serif text-4xl">{title}</h1>{error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
 {view==='wallet'&&<><div className="mt-7 grid gap-4 md:grid-cols-3">{[['Available to withdraw',Math.max(0,(data?.wallet.balanceCents||0)-(data?.wallet.reservedCents||0))],['Wallet balance',data?.wallet.balanceCents],['Pending withdrawal holds',data?.wallet.reservedCents]].map(([label,v],i)=><section key={label} className={`${panel} ${i===0?'!bg-[#111111] !text-white':''}`}><p className="text-sm opacity-70">{label}</p><p className="mt-5 text-3xl font-semibold">{data?money(v):'—'}</p></section>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p className="max-w-2xl text-xs leading-6 text-[#555555]">Deposits and withdrawals require verification. Paid sales are credited after confirmation. Refunds can reduce your balance.</p><div className="flex gap-2">{['deposit','withdrawal'].map(k=><button key={k} className={button} disabled={!data} onClick={()=>{if(k==='withdrawal'&&!data.hasTransactionPin){setPinSettingsOpen(true);setError('');return}setError('');setKind(k);setKey(crypto.randomUUID())}}>{k==='deposit'?'Deposit funds':'Withdraw'}</button>)}</div></div>
 {pendingDeposit&&<button type="button" className="portal-receipt-callout" onClick={()=>{setError('');setDepositId(pendingDeposit.id)}}>Continue pending deposit</button>}<Link className="mt-5 inline-block text-sm text-blue-700 underline" to="/seller/fund-record">View transaction history</Link><SaleConfirmations sales={data?.sales||[]} onConfirmed={refresh}/><section className={`${panel} mt-6`}><h2 className="font-semibold">Confirmed sale history</h2>{data?.sales.filter(s=>s.releaseStatus).slice(0,20).map(s=><div key={s.orderId} className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4 text-sm"><div><strong>Order #{s.orderNumber}</strong><p className="mt-1 text-xs text-gray-500">Confirmed by {transactionActor(s.confirmedRole)} · {s.confirmedAt}</p></div><span>{money(s.amountCents)} · {s.releaseStatus}</span></div>)}{data&&!data.sales.some(s=>s.releaseStatus)&&<p className="mt-4 text-sm text-gray-500">Confirmed sales and their credited amounts will appear here.</p>}</section><button type="button" className="mt-6 min-h-11 text-sm font-semibold underline" onClick={()=>setPinSettingsOpen(true)}>Set or reset transaction PIN</button><TransactionPinModal open={Boolean(pinSettingsOpen)} onClose={()=>setPinSettingsOpen(false)} onSaved={async()=>{setError('');await refresh()}}/><section id="wallet-requests" className={`${panel} mt-7`}><h2 className="font-semibold">Deposit & withdrawal history</h2><div className="mt-5 space-y-4">{data?.requests.map(q=><article key={q.id} className="rounded-xl border border-[#e5e5e5] p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold capitalize">{q.kind} #{q.public_id}</p><p className="mt-1 text-xs text-[#555555]">{q.created_at} UTC · {q.coin} · <OrderStatusBadge status={q.status} label={q.status==='awaiting_review'?'Under review':q.status.replaceAll('_',' ')}/></p></div><strong>{money(q.amount_cents)}</strong></div>{q.network&&(q.kind!=='deposit'||q.status!=='awaiting_receipt')&&<div className="mt-4 rounded-lg bg-[#f7f7f7] p-3 text-xs leading-6"><p>{q.kind==='deposit'?'Check the payment instructions before sending:':'Your receiving wallet:'}</p><p className="font-semibold">{q.coin_amount&&`${q.coin_amount} ${q.coin} · `}{q.network}</p><p className="break-all">{q.address}</p>{q.usd_rate&&<p>Rate: ${q.usd_rate} USD / {q.coin}</p>}</div>}{q.instructions&&<p className="mt-3 text-sm">{q.instructions}</p>}{q.submitted_reference&&<p className="mt-3 break-all text-xs">Submitted transaction reference: {q.submitted_reference}</p>}{q.transfer_reference&&<p className="mt-3 break-all text-xs">Transfer reference: {q.transfer_reference}</p>}{q.kind==='deposit'&&q.status==='awaiting_receipt'&&<button type="button" className="mt-3 text-sm text-blue-700 underline" onClick={()=>{setError('');setDepositId(q.id)}}>Open payment instructions</button>}{q.receiptId&&<a target="_blank" rel="noreferrer" href={sessionUrl(`/api/seller/finance/receipts/${q.receiptId}`)} className="mt-3 inline-block text-xs underline">Open payment proof</a>}</article>)}{data&&!data.requests.length&&<p className="py-10 text-center text-sm text-[#555555]">Your wallet requests will appear here.</p>}</div></section></>}
 {view==='statement'&&<><div className="mt-6 flex flex-wrap gap-2">{[['1','Today'],['7','This week'],['30','Last 30 days'],['all','All time']].map(([value,label])=><button className={`rounded-xl border px-4 py-2 text-sm ${period===value?'bg-[#111111] text-white':'bg-white'}`} key={value} onClick={()=>setPeriod(value)}>{label}</button>)}</div><div className="mt-5 grid gap-4 sm:grid-cols-3">{[['Paid product sales',daily.reduce((s,d)=>s+d.salesCents,0)],['Paid with store credit',daily.reduce((s,d)=>s+d.creditSalesCents,0)],['Estimated gross profit (15%)',Math.round(daily.reduce((s,d)=>s+d.salesCents,0)*.15)]].map(([label,v])=><section key={label} className={panel}><p className="text-xs text-[#555555]">{label}</p><p className="mt-4 text-2xl font-semibold">{money(v)}</p></section>)}</div><p className="mt-4 text-xs leading-6 text-[#555555]">Grouped by order creation date (UTC), including paid orders only in sales. Profit is an estimate, not a wallet credit. Shipping and tax are excluded. Refund status is shown in order history; gross sales above are before refunds.</p><div className={`${panel} mt-6 overflow-auto`}><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b"><th className="py-3">Date (UTC)</th><th>Orders placed</th><th>Paid sales</th><th>Store credit sales</th></tr></thead><tbody>{daily.map(d=><tr key={d.day} className="border-b border-[#e5e5e5]"><td className="py-4">{d.day}</td><td>{d.orders}</td><td>{money(d.salesCents)}</td><td>{money(d.creditSalesCents)}</td></tr>)}</tbody></table>{!daily.length&&<p className="py-8 text-sm text-[#555555]">No orders in this period.</p>}</div></>}
 {view==='record'&&<><div className={`${panel} mt-7 flex flex-wrap items-end gap-3`}><label className="text-xs">Movement type<select className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All movements</option>{[...new Set(data?.records.map(r=>r.kind))].map(k=><option key={k} value={k}>{transactionType(k)}</option>)}</select></label><label className="text-xs">From<input className={input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs">To<input className={input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className={button} onClick={download}>Export CSV</button></div><div className={`${panel} mt-5 overflow-auto`}><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b">{['Movement','Reference','Change','Before','After','Held after','Action source','Note','Date (UTC)'].map(t=><th className="py-3" key={t}>{t}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.id} className="border-b border-[#e5e5e5]"><td className="py-4 capitalize">{transactionType(r.kind)}</td><td>{r.reference}</td><td className={r.delta_cents<0?'text-red-600':'text-green-700'}>{r.delta_cents>0?'+':''}{money(r.delta_cents)}</td><td>{money(r.before_cents)}</td><td>{money(r.after_cents)}</td><td>{money(r.reserved_after)}</td><td>{r.kind==='admin_funding'?'':transactionActor(r.actorRole)}</td><td className="max-w-48 break-words">{transactionNote(r.note)}</td><td>{r.created_at}</td></tr>)}</tbody></table>{!records.length&&<p className="py-8 text-center text-sm text-[#555555]">No fund movements match these filters.</p>}<p className="mt-4 text-xs text-[#555555]">Most recent 1,000 movements. Holds reserve funds without changing the wallet balance.</p></div></>}
 {(kind==='deposit'||depositId)&&<DepositDialog wallets={depositWallets} request={activeDeposit} requestId={depositId} hasPin={data?.hasTransactionPin} onSetPin={()=>setPinSettingsOpen(true)} onClose={closePayment} onUploaded={refresh}/>}
 {kind==='withdrawal'&&<div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-5" role="dialog" aria-modal="true" aria-label="Withdraw funds"><form onSubmit={submit} className={`${panel} w-full max-w-lg`}><h2 className="font-serif text-3xl capitalize">Withdraw funds</h2><p className="mt-3 text-xs leading-6 text-[#555555]">Enter the coin, network, and wallet address where you want the admin to send your withdrawal.</p><label className="mt-4 block text-sm">Amount (USD)<input className={input} type="number" name="amount" min="0.01" max="1000000" step="0.01" required/></label><label className="mt-4 block text-sm">Coin<select name="coin" className={input} value={withdrawalCoin} onChange={event=>setWithdrawalCoin(event.target.value)}>{coins.map(c=><option key={c}>{c}</option>)}</select></label><label className="mt-4 block text-sm">Receiving network<input key={withdrawalCoin} name="network" list="withdrawal-networks" required maxLength={100} className={input}/></label><datalist id="withdrawal-networks">{[...new Set([...coinNetworks[withdrawalCoin],...depositWallets.filter(wallet=>wallet.coin===withdrawalCoin).map(wallet=>wallet.network)])].map(network=><option key={network} value={network}/>)}</datalist><label className="mt-4 block text-sm">Your receiving wallet address<input name="address" required maxLength={500} className={input}/></label><label className="mt-4 block text-sm">Four-digit transaction PIN<PasswordInput name="transactionPin"  inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required className={input}/></label><p className="mt-2 text-xs"><button type="button" onClick={()=>{setKind('');setPinSettingsOpen(true)}} className="underline">Set or reset your PIN in wallet security settings</button></p>{error&&<p className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={closePayment} className="px-4 text-sm">Cancel</button><button disabled={busy} className={button}>{busy?'Submitting…':'Submit request'}</button></div></form></div>}</SellerWorkspace>
}
