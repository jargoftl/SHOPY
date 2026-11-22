import {ArrowDown, ArrowUp, Circle, Copy, TrendingUp, Wallet, QrCode, X} from 'lucide-react'
import {transactionActor} from '../lib/transactionLabels.js'
import {formatTimestamp,timestampMillis} from '../lib/storeDates.js'
import CryptoWalletIcon,{coinNetworks} from '../components/CryptoWalletIcon.jsx'
import SellerPaymentReceipt from '../components/SellerPaymentReceipt.jsx'
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
  <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
   <div className="flex items-center justify-between gap-2">
    <p className="text-xs font-semibold text-slate-700">Receiving wallet address</p>
    <button type="button" onClick={copyAddress} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-xs font-semibold text-blue-800">
     <Copy size={15} aria-hidden="true"/>Copy address
    </button>
   </div>
   <code className="mt-2 block select-all break-all rounded-lg bg-slate-50 p-3 font-mono text-sm leading-relaxed text-slate-950">{request.address}</code>
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

function DepositDialog({wallets,request,requestId,pendingDeposits,onSelectDeposit,hasPin,onSetPin,onClose,onUploaded}){
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
   {!requestId&&pendingDeposits.length>0&&<details className="mt-3 rounded-lg border border-slate-200 p-2.5 text-sm">
    <summary className="cursor-pointer font-medium">Attach proof to an existing deposit</summary>
    <div className="mt-2 grid gap-1.5">
     {pendingDeposits.map(deposit=><button key={deposit.id} type="button" disabled={submitting}
      onClick={()=>onSelectDeposit(deposit.id)} className="rounded border px-2 py-2 text-left text-xs hover:bg-blue-50">
      {deposit.coin} · {money(deposit.amount_cents)} · Ref. {deposit.transaction_ref}
     </button>)}
    </div>
   </details>}
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

const paymentHistoryTime=request=>request.resolved_at||(['confirmed','rejected'].includes(request.status)?request.updated_at:request.created_at)
const ledgerHistoryTime=record=>record.effective_at||record.resolvedAt||record.created_at
const compareHistory=(getTime)=>(first,second)=>{
 const a=timestampMillis(getTime(first)),b=timestampMillis(getTime(second))
 if(a===b)return second.id-first.id
 if(!Number.isFinite(a))return 1
 if(!Number.isFinite(b))return -1
 return b-a
}

function PaymentHistory({requests}){
 const [kind,setKind]=useState('deposit')
 const [filter,setFilter]=useState('all')
 const shown=requests.filter(request=>{
  if(request.kind!==kind)return false
  if(filter==='all')return true
  if(filter==='pending')return !['confirmed','rejected'].includes(request.status)
  return request.status===filter
 }).sort(compareHistory(paymentHistoryTime))
 return <section id="wallet-requests" className={`${panel} mt-7`}>
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex flex-wrap gap-2" role="group" aria-label="Payment history">
    {[['deposit','Deposits'],['withdrawal','Withdrawals']].map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${kind===value?'bg-blue-700 text-white':'bg-slate-100 text-slate-700'}`}>{label}</button>)}
   </div>
   <select aria-label="Filter payment history" value={filter} onChange={event=>setFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
    <option value="confirmed">Completed</option>
    <option value="pending">Pending</option>
    <option value="rejected">Rejected</option>
    <option value="all">All transactions</option>
   </select>
  </div>
  <ul className="mt-3 divide-y divide-slate-200">
   {shown.map(request=>{
    const status=request.status==='confirmed'?(request.kind==='deposit'?'Credited':'Accepted'):request.status==='rejected'?'Rejected':'Pending'
    const time=paymentHistoryTime(request)
    return <li key={request.id} className="flex flex-wrap items-start justify-between gap-2 py-4">
     <div>
      <p className="font-semibold">{request.kind==='withdrawal'?'Withdrawal':'Deposit'} · <span className={status==='Pending'?'inline-flex items-center gap-1 rounded bg-[#fff1e6] px-1.5 py-0.5 text-[#9a370b]':undefined}>{status==='Pending'&&<Circle size={12} aria-hidden="true"/>}{status}</span></p>
      <p className="mt-1 text-xs text-slate-600">Ref. {request.transaction_ref}</p>
      <p className="mt-1 text-xs text-slate-600">{formatTimestamp(time)}</p>
      {request.receiptId&&<a target="_blank" rel="noreferrer" href={sessionUrl(`/api/seller/finance/receipts/${request.receiptId}`)} className="mt-2 inline-block text-xs underline">Open payment proof</a>}
     </div>
     {request.kind==='deposit'&&<strong className="text-sm tabular-nums">{money(request.amount_cents)}</strong>}
    </li>
   })}
  </ul>
  {!shown.length&&<p className="py-5 text-sm text-slate-600">No transactions in this view.</p>}
 </section>
}

export default function SellerFinancePage({view='wallet'}){
 const [user,setUser]=useState(null),[data,setData]=useState(null),[analytics,setAnalytics]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState(''),[depositId,setDepositId]=useState(null),[historyFilter,setHistoryFilter]=useState('all'),[withdrawalCoin,setWithdrawalCoin]=useState('BTC'),[pinSettingsOpen,setPinSettingsOpen]=useState(null),[key,setKey]=useState(''),[period,setPeriod]=useState('today'),[today,setToday]=useState(()=>new Date().toISOString().slice(0,10))
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
 const pendingDeposits=data?.requests.filter(request=>request.kind==='deposit'&&request.status==='awaiting_receipt')||[]
 const closePayment=()=>{
  setKind('')
  setDepositId(null)
  setError('')
 }
 const depositWallets=data?.depositWallets||[]
 const records=(data?.records||[]).filter(record=>record.delta_cents!==0&&(historyFilter==='all'||(historyFilter==='credit'?record.delta_cents>0:record.delta_cents<0))).sort(compareHistory(ledgerHistoryTime))
 const date=new Date(today+'T00:00:00Z')
 const yesterday=new Date(date.getTime()-86400000).toISOString().slice(0,10)
 const weekStart=new Date(date.getTime()-((date.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10)
 const monthStart=today.slice(0,7)+'-01'
 const starts={today,yesterday,week:weekStart,month:monthStart}
 const daily=(analytics?.daily||[]).filter(row=>period==='all'||(row.day>=starts[period]&&row.day<=(period==='yesterday'?yesterday:today)))
 const statementCards=[
  ['Pending amount','pendingCents','bg-[#789cff]'],
  ['Total sales','salesCents','bg-[#72c1f8]'],
  ['Estimated profit','profitCents','bg-[#58d2c9]'],
  ['Total orders','orders','bg-[#989fac]'],
  ['Cancelled orders','cancelledOrders','bg-[#ff795f]'],
  ['Refunded orders','refundedOrders','bg-[#ef5e60]'],
 ]
 const title=view==='wallet'?'My wallet':view==='statement'?'Financial statement':'Transaction history'
 return <SellerWorkspace user={user}><p className="text-xs font-bold tracking-[.18em] text-[#555555]">{view==='wallet'?'MY WALLET':view==='statement'?'FINANCIAL STATEMENT':'TRANSACTION HISTORY'}</p><h1 className="mt-2 font-serif text-4xl">{title}</h1>{error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
 {view==='wallet'&&<>
  <div className={`${panel} mt-7 flex flex-wrap items-center justify-between gap-5`}>
   <dl className="grid min-w-0 flex-1 gap-5 sm:grid-cols-2">
    {[
     ['Balance',data?Math.max(0,data.wallet.balanceCents-data.wallet.reservedCents):null,Wallet,'bg-blue-100 text-blue-700'],
     ['Accumulated revenue',data?.accumulatedRevenueCents,TrendingUp,'bg-orange-100 text-orange-800'],
    ].map(([label,value,Icon,color])=><div key={label} className="flex min-w-0 items-center gap-3">
     <span className={`shrink-0 rounded-full p-3 ${color}`}><Icon size={22} aria-hidden="true"/></span>
     <div className="min-w-0"><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words text-2xl font-semibold tabular-nums">{value==null?'—':money(value)}</dd></div>
    </div>)}
   </dl>
   <div className="flex gap-2">{['deposit','withdrawal'].map(k=><button key={k} className={button} disabled={!data} onClick={()=>{if(k==='withdrawal'&&!data.hasTransactionPin){setPinSettingsOpen(true);setError('');return}setError('');setKind(k);setKey(crypto.randomUUID())}}>{k==='deposit'?'Deposit':'Withdraw'}</button>)}</div>
  </div>
  <div className="mt-4 overflow-hidden rounded-2xl bg-blue-950">
   <img src="/seller-wallet-banner.webp" alt="" width="1500" height="500" className="h-28 w-full object-cover object-center sm:h-40"/>
  </div>
  <PaymentHistory requests={[
   ...(data?.requests||[]),
   ...(data?.records||[]).filter(record=>['historical_credit','historical_withdrawal'].includes(record.kind)).map(record=>({
    id:`ledger-${record.id}`,kind:record.kind==='historical_credit'?'deposit':'withdrawal',
    status:'confirmed',amount_cents:Math.abs(record.delta_cents),transaction_ref:record.displayReference||record.transaction_ref,
    resolved_at:ledgerHistoryTime(record),
   })),
  ]}/>
 <Link className="mt-5 inline-block text-sm text-blue-700 underline" to="/seller/fund-record">View transaction history</Link><SaleConfirmations sales={data?.sales||[]} onConfirmed={refresh}/><section className={`${panel} mt-6`}><h2 className="font-semibold">Confirmed sale history</h2>{data?.sales.filter(s=>s.releaseStatus).slice(0,20).map(s=><div key={s.orderId} className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4 text-sm"><div><strong>Order #{s.orderNumber}</strong><p className="mt-1 text-xs text-gray-500">Confirmed by {transactionActor(s.confirmedRole)} · {s.confirmedAt}</p></div><span>{money(s.amountCents)} · {s.releaseStatus}</span></div>)}{data&&!data.sales.some(s=>s.releaseStatus)&&<p className="mt-4 text-sm text-gray-500">Confirmed sales and their credited amounts will appear here.</p>}</section><button type="button" className="mt-6 min-h-11 text-sm font-semibold underline" onClick={()=>setPinSettingsOpen(true)}>Set or reset transaction PIN</button><TransactionPinModal open={Boolean(pinSettingsOpen)} onClose={()=>setPinSettingsOpen(false)} onSaved={async()=>{setError('');await refresh()}}/></>}
 {view==='statement'&&<>
  <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Statement period">
   {[['yesterday','Yesterday'],['today','Today'],['week','This week'],['month','This month'],['all','All time']].map(([value,label])=>
    <button type="button" aria-pressed={period===value} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium ${period===value?'border-blue-700 bg-blue-700 text-white':'bg-white'}`} key={value} onClick={()=>setPeriod(value)}>{label}</button>)}
  </div>
  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
   {statementCards.map(([label,key,color])=>{
    const loaded=analytics&&daily.every(row=>row[key]!=null)
    const value=daily.reduce((sum,row)=>sum+Number(row[key]??0),0)
    return <section key={key} className={`min-w-0 rounded-2xl p-4 text-slate-950 ${color}`}>
     <h2 className="text-xs font-semibold">{label}</h2><p className="mt-2 break-words text-xl font-bold tabular-nums">{loaded?(key.endsWith('Cents')?money(value):value.toLocaleString()):'—'}</p>
    </section>
   })}
  </div>
  <p className="mt-4 text-xs leading-6 text-slate-600">Grouped by order date (UTC). Sales exclude shipping and tax and are shown before refunds. Pending amount covers paid sales awaiting release. Estimated profit uses the Shop Orders calculation and excludes completed refunds.</p>
  <div className={`${panel} mt-5 overflow-auto`}>
   <h2 className="font-semibold">Daily breakdown</h2>
   <table className="mt-2 w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-200">
    {['Date (UTC)','Total orders','Paid sales','Estimated profit','Cancelled','Refunded'].map(label=><th key={label} scope="col" className="px-2 py-3">{label}</th>)}
   </tr></thead><tbody>{daily.map(row=><tr key={row.day} className="border-b border-slate-100 even:bg-slate-50">
    {[row.day,row.orders,money(row.salesCents),row.profitCents==null?'—':money(row.profitCents),row.cancelledOrders??'—',row.refundedOrders??'—'].map((value,index)=><td key={index} className="px-2 py-3 tabular-nums">{value}</td>)}
   </tr>)}</tbody></table>
   {analytics&&!daily.length&&<p className="py-6 text-sm text-slate-600">No orders in this period.</p>}
  </div>
 </>}
 {view==='record'&&<section className="mt-6 max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Wallet transactions">
  <div className="flex justify-end border-b border-slate-100 px-4 py-3">
   <select aria-label="Filter transactions" value={historyFilter} onChange={event=>setHistoryFilter(event.target.value)}>
    <option value="all">All transactions</option><option value="credit">Credits</option><option value="debit">Debits</option>
   </select>
  </div>
  {records.length ? <ul className="divide-y divide-slate-100">
   {records.map(record=><li key={record.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-4 sm:px-5">
    <p className={`flex min-w-0 items-center gap-1.5 font-semibold ${record.delta_cents<0?'text-red-700':'text-slate-900'}`}>{record.delta_cents>0?<ArrowUp size={17} aria-hidden="true" className="shrink-0 text-emerald-700"/>:<ArrowDown size={17} aria-hidden="true" className="shrink-0"/>}{record.delta_cents>0?'Credit':'Debit'}</p>
    <p className={`max-w-[45vw] break-words text-right text-sm font-semibold tabular-nums ${record.delta_cents>0?'text-emerald-700':'text-red-700'}`}>
     {record.delta_cents>0?'+':''}{money(record.delta_cents)}
    </p>
    {record.displayReference&&<p className="col-span-2 text-xs text-slate-600">Ref. {record.displayReference}</p>}
    <p className="col-span-2 text-xs text-slate-500">{formatTimestamp(ledgerHistoryTime(record))}</p>
   </li>)}
  </ul> : <p className="px-4 py-8 text-center text-sm text-slate-600">{data?'No transactions in this view.':error?'Transactions are unavailable.':'Loading transactions…'}</p>}
 </section>}
 {kind==='deposit'&&<DepositDialog key={depositId??'new-deposit'} wallets={depositWallets} request={activeDeposit} requestId={depositId} pendingDeposits={pendingDeposits} onSelectDeposit={setDepositId} hasPin={data?.hasTransactionPin} onSetPin={()=>setPinSettingsOpen(true)} onClose={closePayment} onUploaded={refresh}/>}
 {kind==='withdrawal'&&<div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-5" role="dialog" aria-modal="true" aria-label="Withdraw funds"><form onSubmit={submit} className={`${panel} w-full max-w-lg`}><h2 className="font-serif text-3xl capitalize">Withdraw funds</h2><p className="mt-3 text-xs leading-6 text-[#555555]">Enter the coin, network, and wallet address where you want the admin to send your withdrawal.</p><label className="mt-4 block text-sm">Amount (USD)<input className={input} type="number" name="amount" min="0.01" max="1000000" step="0.01" required/></label><label className="mt-4 block text-sm">Coin<select name="coin" className={input} value={withdrawalCoin} onChange={event=>setWithdrawalCoin(event.target.value)}>{coins.map(c=><option key={c}>{c}</option>)}</select></label><label className="mt-4 block text-sm">Receiving network<input key={withdrawalCoin} name="network" list="withdrawal-networks" required maxLength={100} className={input}/></label><datalist id="withdrawal-networks">{[...new Set([...coinNetworks[withdrawalCoin],...depositWallets.filter(wallet=>wallet.coin===withdrawalCoin).map(wallet=>wallet.network)])].map(network=><option key={network} value={network}/>)}</datalist><label className="mt-4 block text-sm">Your receiving wallet address<textarea name="address" required maxLength={500} rows={2} spellCheck={false} autoCapitalize="none" placeholder="Paste wallet address" className={`${input} resize-y break-all font-mono`}/></label><label className="mt-4 block text-sm">Four-digit transaction PIN<PasswordInput name="transactionPin"  inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required className={input}/></label><p className="mt-2 text-xs"><button type="button" onClick={()=>{setKind('');setPinSettingsOpen(true)}} className="underline">Set or reset your PIN in wallet security settings</button></p>{error&&<p className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={closePayment} className="px-4 text-sm">Cancel</button><button disabled={busy} className={button}>{busy?'Submitting…':'Submit request'}</button></div></form></div>}</SellerWorkspace>
}
