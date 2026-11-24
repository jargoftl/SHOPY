import UiverseSelect from './UiverseSelect.jsx'
import {useEffect,useRef,useState} from 'react'
import {apiRequest} from '../lib/api.js'
import {formatMoney,parseAmountCents} from '../lib/money.js'
export default function AdminSellerFunding({kind='seller',fixedSellerId}){
 const [data,setData]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),attempt=useRef(null),running=useRef(false)
 const label=kind==='buyer'?'Buyer':'Seller',path=`/api/admin/${kind}-funding`
 const load=async()=>setData(await apiRequest(path))
 useEffect(()=>{let active=true;apiRequest(path).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[path])
 const [sellerId,setSellerId]=useState(fixedSellerId?String(fixedSellerId):''),[score,setScore]=useState(''),[loadedScore,setLoadedScore]=useState(''),[scoreMessage,setScoreMessage]=useState(''),[savingScore,setSavingScore]=useState(false)
 useEffect(()=>{
  if(kind!=='seller'||!sellerId)return
  let active=true
  apiRequest(`/api/admin/sellers/${sellerId}/dashboard-metrics`).then(({metrics})=>{
   if(active){setScore(String(metrics.sellerCreditScore??5));setLoadedScore(sellerId)}
  }).catch(error=>{if(active)setScoreMessage(error.message)})
  return()=>{active=false}
 },[kind,sellerId])
 async function saveScore(event){
  event.preventDefault()
  if(savingScore||!sellerId||loadedScore!==sellerId)return
  setSavingScore(true);setScoreMessage('')
  try{
   await apiRequest(`/api/admin/sellers/${sellerId}/credit-score`,{method:'PATCH',body:JSON.stringify({score:Number(score)})})
   setScoreMessage('Credit score updated.')
  }catch(error){setScoreMessage(error.message)}
  finally{setSavingScore(false)}
 }
 const selectedSeller=kind==='seller'?data?.sellers.find(s=>String(s.id)===sellerId):null
 const submit=async e=>{
  e.preventDefault();if(running.current)return;const form=e.currentTarget,f=new FormData(form),amountCents=parseAmountCents(f.get('amount'))
  if(amountCents===null||amountCents<=0){setMessage('Enter a positive amount with up to two decimal places.');return}
  const operation=kind==='seller'?f.get('operation'):'add'
  const body={[`${kind}Id`]:Number(fixedSellerId||f.get('accountId')),amountCents,verified:f.get('verified')==='on',operation}
  const fingerprint=JSON.stringify(body)
  if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,key:crypto.randomUUID()}
  running.current=true;setBusy(true);setMessage('')
  try{
   await apiRequest(path,{method:'POST',body:JSON.stringify({...body,requestKey:attempt.current.key})})
   attempt.current=null
   form.reset()
   if(kind==='buyer'&&!fixedSellerId){setSellerId('');setLoadedScore('');setScoreMessage('')}
   setMessage(operation==='reduce'?'Seller wallet balance reduced and recorded in transaction history.':`${label} funded and recorded in transaction history.`)
   await load().catch(()=>setMessage('Adjustment saved. Refresh to see the latest balance.'))
  }catch(e){setMessage(e.message)}finally{running.current=false;setBusy(false)}

 }
 return <section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{kind==='seller'?'Adjust seller wallet':'Fund a buyer account'}</h2><p className="mt-2 text-sm leading-6 text-gray-500">Updates the selected {kind}’s {kind==='buyer'?'spendable account balance':'seller wallet balance'}. The amount, administrator and before/after balances are recorded automatically.</p><form onSubmit={submit} className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2">{!fixedSellerId&&<label className="text-sm">{label}<UiverseSelect name="accountId" required disabled={!data||busy||savingScore} value={sellerId} onChange={event=>{setSellerId(event.target.value);setLoadedScore('');setScoreMessage('')}} className="mt-2 block min-h-11 w-full rounded border bg-white p-3"><option value="">Choose {kind}</option>{data?.[kind==='buyer'?'buyers':'sellers'].map(s=><option key={s.id} value={s.id}>{s.storeName||s.name} · #{s.publicId} · {formatMoney(s.balanceCents)}</option>)}</UiverseSelect></label>}{kind==='seller'&&<label className="text-sm">Action<UiverseSelect name="operation" className="mt-2 block w-full"><option value="add">Add funds</option><option value="reduce">Reduce wallet balance</option></UiverseSelect></label>}{selectedSeller&&<p className="self-end text-sm">Available wallet balance <strong>{formatMoney(Math.max(0,selectedSeller.balanceCents-selectedSeller.reservedCents))}</strong></p>}<label className="text-sm">Amount (USD)<input type="number" name="amount" min="0.01" max="1000000" step="0.01" required className="mt-2 block min-h-11 w-full rounded border p-3"/></label><label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" name="verified" required/> I authorize this balance adjustment for the selected {kind}.</label><button disabled={busy||savingScore||!data} className="min-h-11 rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Saving…':kind==='seller'?'Update wallet':`Fund ${kind}`}</button></form>{kind==='seller'&&<form onSubmit={saveScore} className="mt-5 flex flex-wrap items-end gap-3 border-t pt-4">
  <label className="text-sm">Seller credit score<input type="number" min="0" max="1000000000000" step="any" required value={loadedScore===sellerId&&sellerId?score:''} onChange={event=>setScore(event.target.value)} disabled={!sellerId||loadedScore!==sellerId||savingScore} className="mt-1 block h-11 w-32 rounded border px-3"/></label>
  <button type="button" disabled={!sellerId||loadedScore!==sellerId||savingScore} onClick={()=>setScore('100')} className="h-11 rounded border px-3 text-sm disabled:opacity-50">Set to 100</button>
  <button disabled={!sellerId||loadedScore!==sellerId||savingScore||busy} className="h-11 rounded bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{savingScore?'Saving…':'Save credit score'}</button>
  {scoreMessage&&<p role="status" className="w-full text-sm">{scoreMessage}</p>}
 </form>}{message&&<p role="status" className="mt-4 text-sm">{message}</p>}<h3 className="mt-8 font-semibold">Funding history</h3><div className="mt-4 overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr>{[label,'Amount','Before','After','Administrator','Reason','UTC'].map(h=><th key={h} className="border-b p-3">{h}</th>)}</tr></thead><tbody>{data?.history.filter(h=>!fixedSellerId||Number(h.seller_id)===Number(fixedSellerId)).map(h=><tr key={h.id} className="border-b"><td className="p-3">{h.sellerName||h.buyerName}</td><td>{formatMoney(h.delta_cents)}</td><td>{formatMoney(h.before_cents)}</td><td>{formatMoney(h.after_cents)}</td><td>{h.adminName}</td><td className="max-w-60 break-words">{h.note}</td><td>{h.created_at}</td></tr>)}</tbody></table>{data&&!data.history.length&&<p className="py-8 text-sm text-gray-500">No balance adjustments yet.</p>}</div></section>
}
