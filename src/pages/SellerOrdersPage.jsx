import { ChevronDown, Search } from 'lucide-react'
import TransactionPinModal from '../components/TransactionPinModal.jsx'
import { formatOrderReference } from '../lib/orderReference.js'
import HistoricalSalesHistory from '../components/HistoricalSalesHistory.jsx'
import ShipmentHistory from '../components/ShipmentHistory.jsx'
import DeliveryEmailStatus from '../components/DeliveryEmailStatus.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import {progressToast} from '../components/ProgressToast.jsx'
import DeliveryProgress from '../components/DeliveryProgress.jsx'
import { useRef } from 'react'
import { formatTimestamp } from '../lib/storeDates.js'
import PasswordInput from '../components/PasswordInput.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { fulfillmentLabel, fulfillmentOptions, paymentStatusLabel } from '../lib/fulfillment.js'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'

const canPurchase=order=>order.status==='paid'&&order.accountBalancePayment&&order.sellers[0]&&!order.sellers[0].releaseStatus

const orderPaymentBadge = order => {
  if(order.status==='paid'&&!order.sellers[0]?.releaseStatus){
    return {status:'pending',label:'Confirm order'}
  }
  return {status:order.status,label:paymentStatusLabel(order.status)}
}

const purchaseBadge = status => status==='released'
  ? <OrderStatusBadge status="released" label="Confirmed"/>
  : status==='reversed'
    ? <OrderStatusBadge status="returned" label="Reversed"/>
    : <OrderStatusBadge status="pending" label="Pending · needs attention"/>

const logisticsBadge = shipment => shipment
  ? <OrderStatusBadge status={shipment.status} label={shipment.status==='pending'?'Pending · needs attention':fulfillmentLabel(shipment.status)}/>
  : '—'

function OrderContactForm({order,onSaved,onCancel}){
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const contact=order.sellerContact||{}
 async function save(event){
  event.preventDefault()
  if(busy)return
  const fields=Object.fromEntries(new FormData(event.currentTarget))
  setBusy(true)
  setError('')
  try{
   const {contact:saved}=await apiRequest(`/api/seller/purchases/${order.id}/contact`,{method:'PUT',body:JSON.stringify(fields)})
   onSaved(saved)
  }catch(error){setError(error.message)}
  finally{setBusy(false)}
 }
 return <form onSubmit={save} className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
  <p className="text-sm text-slate-600 sm:col-span-2">These contact details are private to your store and apply to this order.</p>
  {[['name','Name','text',200],['email','Email','email',200],['phone','Phone number','tel',40],['address','Address','text',500]].map(([field,label,type,limit])=><label key={field} className="text-sm font-medium">{label}
   <input name={field} type={type} maxLength={limit} defaultValue={contact[field]??(field==='name'?order.buyerName:'')} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"/>
  </label>)}
  <div className="flex flex-wrap gap-2 sm:col-span-2">
   <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white">{busy?'Saving…':'Save contact'}</button>
   <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm">Cancel</button>
  </div>
  {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
 </form>
}

function OrderFilter({label,value,onChange,options}){
 return <label className="min-w-0 text-xs font-medium text-slate-700">
  {label}
  <span className="relative mt-1 block">
   <select value={value} onChange={event=>onChange(event.target.value)} style={{appearance:'none',height:36,minHeight:36}}
    className="block w-full rounded-full border border-slate-200 bg-slate-50 py-0 pl-3 pr-7 text-xs font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600">
    <option value="all">All</option>
    {options.map(([key,text])=><option key={key} value={key}>{text}</option>)}
   </select>
   <ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
  </span>
 </label>
}

const SellerOrdersPage = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [orderTab,setOrderTab]=useState(()=>params.get('view')==='history'?'history':'all')
  const [paymentFilter,setPaymentFilter]=useState('all')
  const [search, setSearch] = useState(params.get('order') || '')
  const [reload, setReload] = useState(0)
  const dialog=useRef(null)
  const [selected,setSelected]=useState(null)
  const [confirmError,setConfirmError]=useState('')
  const [pinOpen,setPinOpen]=useState(false)
  function openOrder(order,mode){
    setSelected({id:order.id,mode})
    setConfirmError('')
    dialog.current.showModal()
  }
  async function confirmPurchase(event,order){
    event.preventDefault()
    if(busy)return
    const form=event.currentTarget
    const transactionPin=new FormData(form).get('transactionPin')
    form.reset()
    setBusy(true)
    setConfirmError('')
    try{
      await apiRequest('/api/seller/finance/confirm-purchase',{method:'POST',body:JSON.stringify({orderId:order.id,amountCents:order.subtotalCents,transactionPin})})
      setSelected(current=>current?.id===order.id?{id:order.id,mode:'view'}:current)
      setReload(value=>value+1)
      progressToast('Sale confirmed. Proceeds credited to your wallet.')
    }catch(err){setConfirmError(err.message)}
    finally{setBusy(false)}
  }
  useEffect(() => {
    let active = true
    apiRequest('/api/seller/purchases').then((data) => { if (active) setOrders(data.orders) })
      .catch((err) => { if (active) { if (err.status === 401) navigate('/seller/login', { replace: true }); else setError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate, reload])
  const update = async (order, status) => {
    setBusy(true); setError('')
    try { await apiRequest(`/api/purchase-sellers/${order.id}/${order.sellers[0].sellerId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setReload((value) => value + 1); progressToast(`Order ${formatOrderReference(order)}: ${fulfillmentLabel(status)}`) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const query=search.trim().replace(/^#/,'').toLowerCase()
  const visible = orders.filter(order=>(!query||[formatOrderReference(order),order.orderNumber,order.id,order.sellerContact?.name,order.buyerName,...order.items.map(i=>i.name)].some(v=>String(v).toLowerCase().includes(query)))&&(filter==='all'||order.sellers[0]?.status===filter)&&(paymentFilter==='all'||order.status===paymentFilter)&&(orderTab==='all'||(orderTab==='paid'?order.sellers[0]?.releaseStatus==='released':!order.sellers[0]?.releaseStatus)))
  return <main className="seller-portal seller-orders account-workspace min-h-screen bg-[#f7f7f7] px-3 py-6 sm:px-5 sm:py-8 text-[#111111]"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap justify-between gap-3"><div><Link to="/seller" className="text-sm text-[#555555]">← Dashboard</Link><h1 className="mt-3 text-3xl font-semibold">Shop orders</h1><p className="mt-2 text-sm text-[#555555]">Track paid orders, update shipments and view delivery history.</p></div><div className="flex items-start gap-4"><Link to="/messages" className="text-sm underline">Contact support</Link><SellerNotificationBell /></div></div>
    <nav aria-label="Order groups" className="portal-order-tabs">{[['all','All orders'],['pending','Pending'],['paid','Purchased'],['history','Sales history']].map(([value,label])=><button key={value} aria-pressed={orderTab===value} onClick={()=>setOrderTab(value)}>{label}</button>)}</nav>
    {orderTab==='history'?<div className="mt-6"><HistoricalSalesHistory/></div>:<>
    <div className="mt-4 grid grid-cols-2 items-end gap-x-3 gap-y-3 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
     <label className="col-span-2 min-w-0 text-xs font-medium text-slate-700 lg:col-span-1">Search orders
      <span className="relative mt-1.5 block">
       <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
       <input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Order number, name or product"
        className="block h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600"/>
      </span>
     </label>
     <OrderFilter label="Payment status" value={paymentFilter} onChange={setPaymentFilter}
      options={['paid','awaiting_quote','awaiting_receipt','awaiting_review','rejected'].map(value=>[value,paymentStatusLabel(value)])}/>
     <OrderFilter label="Shipment status" value={filter} onChange={setFilter} options={fulfillmentOptions}/>
     <button type="button" onClick={()=>{setSearch('');setFilter('all');setPaymentFilter('all');setOrderTab('all');setReload(value=>value+1)}}
      className="col-span-2 min-h-11 justify-self-end rounded-lg px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 lg:col-span-1">Clear filters</button>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {loading ? <ContentPlaceholder/> : <ul className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2" aria-label="Shop orders">
     {visible.map(order=>{
      const shipment=order.sellers[0]
      const profit=order.subtotalCents-Math.round(order.subtotalCents*100/115)
      const fields=[
       ['Consignee name',<button type="button" onClick={()=>openOrder(order,'contact')} className="text-left text-blue-700 underline">{(order.sellerContact?.name??order.buyerName)||'Edit contact'}</button>],
       ['Order time',formatTimestamp(order.createdAt)],
       ['Product amount',formatMoney(order.subtotalCents)],
       ['Estimated profit',formatMoney(profit)],
       ['Purchase status',purchaseBadge(shipment?.releaseStatus)],
       ['Logistics status',logisticsBadge(shipment)],
      ]
      return <li key={order.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
       <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-base font-semibold">Order {formatOrderReference(order)}</h2>
        <OrderStatusBadge {...orderPaymentBadge(order)}/>
       </div>
       <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl bg-slate-50 p-3">
        {fields.map(([label,value])=><div key={label} className="min-w-0">
         <dt className="text-xs font-medium text-slate-600">{label}</dt>
         <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
        </div>)}
       </dl>
       <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={()=>openOrder(order,'view')} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-900">View order</button>
        {canPurchase(order)&&<button type="button" onClick={()=>openOrder(order,'purchase')} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white">Purchase</button>}
       </div>
      </li>
     })}
     {!visible.length&&<li className="rounded-xl border bg-white p-6 text-center text-sm text-slate-600 xl:col-span-2">No matching orders.</li>}
    </ul>}
    <dialog ref={dialog} onClose={()=>{setSelected(null);setConfirmError('')}} aria-labelledby="shop-order-title" className="m-auto max-h-[90dvh] w-[min(94vw,720px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-900/60">
     {selected&&(()=>{
      const order=orders.find(entry=>entry.id===selected.id)
      if(!order)return null
      const shipment=order.sellers[0]
      const cost=Math.round(order.subtotalCents*100/115)
      return <>
       <header className="mb-4 flex items-start justify-between gap-3">
        <div><h2 id="shop-order-title" className="text-xl font-semibold">{selected.mode==='purchase'?'Purchase confirmation':selected.mode==='contact'?'Edit contact':'Order details'}</h2><p className="text-sm text-slate-600">{formatOrderReference(order)}</p></div>
        <button type="button" onClick={()=>dialog.current.close()} className="rounded border px-3 py-1">Close</button>
       </header>
       <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        {[
         ['Consignee',(order.sellerContact?.name??order.buyerName)||'—'], ['Email',order.sellerContact?.email||order.maskedEmail||'—'],
         ['Phone',order.sellerContact?.phone||'—'], ['Address',order.sellerContact?.address||'—'], ['Order time',formatTimestamp(order.createdAt)],
         ['Payment status',<OrderStatusBadge {...orderPaymentBadge(order)}/>],['Purchase status',purchaseBadge(shipment?.releaseStatus)],
         ['Logistics status',logisticsBadge(shipment)],['Purchase time',shipment?.confirmedAt?formatTimestamp(shipment.confirmedAt):'—'],
         ['Sales amount',formatMoney(order.subtotalCents)],['Estimated purchase cost',formatMoney(cost)],['Estimated profit',formatMoney(order.subtotalCents-cost)],
        ].map(([label,value])=><div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
       </dl>
       {selected.mode==='contact'
        ? <OrderContactForm key={order.id} order={order} onCancel={()=>setSelected({id:order.id,mode:'view'})} onSaved={contact=>{
         setOrders(current=>current.map(entry=>entry.id===order.id?{...entry,sellerContact:contact}:entry))
         setSelected({id:order.id,mode:'view'})
         progressToast('Order contact saved.')
        }}/>
        : <button type="button" onClick={()=>setSelected({id:order.id,mode:'contact'})} className="mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Edit contact</button>}
       <h3 className="font-semibold">Order items</h3>
       <ul className="mb-4 divide-y text-sm">{order.items.map(item=><li key={item.id} className="flex items-center gap-3 py-3">
        {item.imageUrl&&<img src={item.imageUrl} alt="" className="size-12 rounded object-cover"/>}
        <div className="min-w-0 flex-1"><p className="break-words font-medium">{item.name}</p><p className="text-xs text-slate-600">{[item.color,item.size].filter(Boolean).join(' · ')}</p></div>
        <span>{item.quantity} × {formatMoney(item.priceCents)}</span>
       </li>)}</ul>
       {selected.mode!=='contact'&&canPurchase(order)&&<form onSubmit={event=>confirmPurchase(event,order)} className="grid gap-2 border-t pt-4">
        <label className="text-sm font-medium">Transaction PIN<PasswordInput name="transactionPin" required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" className="mt-1 w-full rounded-lg border p-2"/></label>
        <button type="button" onClick={()=>setPinOpen(true)} className="justify-self-start text-sm text-blue-700 underline">Create or reset transaction PIN</button>
        <p className="text-xs text-slate-600">Confirm the paid sale to credit the proceeds to your website wallet.</p>
        <button disabled={busy} className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Confirming…':'Confirm purchase'}</button>
       </form>}
       {selected.mode==='view'&&<section className="mt-4 min-w-0"><h2 className="mb-3 text-sm font-semibold">Dispatch & tracking</h2>{shipment&&<><OrderStatusBadge status={shipment.status} label={fulfillmentLabel(shipment.status)}/><details className="portal-shipment-details"><summary>Shipment details & updates</summary><div className="mt-3"><DeliveryProgress compact status={shipment.status}/></div><div className="mt-4 grid min-w-0 gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-gray-500">Tracking number</p><p className="mt-1 break-all font-mono text-sm font-semibold">{shipment.trackingNumber||'Not assigned yet'}</p></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-gray-500">Carrier</p><div className="mt-1 flex flex-wrap items-center gap-2 text-sm">{(!shipment.carrier||/^arrive(?: logistics)?$/i.test(shipment.carrier.trim()))&&<img src="/arrive-logistics.webp" alt="" className="h-6 w-24 object-contain object-left"/>}<span className="break-words">{shipment.carrier||'Arrive Logistics'}</span></div></div>{shipment.carrierTrackingNumber&&<p className="break-all text-xs text-gray-500 sm:col-span-2">Carrier reference: {shipment.carrierTrackingNumber}</p>}</div><label className="mt-4 block text-xs font-medium">Update fulfillment<select aria-label={`Logistics for order ${formatOrderReference(order)}`} disabled={busy||order.status!=='paid'} value={shipment.status} onChange={e=>update(order,e.target.value)} className="mt-2 block min-h-12 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm disabled:opacity-50">{fulfillmentOptions.map(([status,label])=><option key={status} value={status}>{label}</option>)}</select></label><DeliveryEmailStatus shipment={shipment} orderId={order.id}/><ShipmentHistory trackingNumber={shipment.trackingNumber} revision={reload}/></details></>}{order.status!=='paid'&&<p className="mt-3 text-xs text-gray-500">Payment not confirmed</p>}</section>}
       {confirmError&&<p role="alert" className="mt-2 text-sm text-red-700">{confirmError}</p>}
      </>
     })()}
    </dialog>
    <TransactionPinModal open={pinOpen} onClose={()=>setPinOpen(false)} onSaved={()=>setConfirmError('')}/>
    </>}
  </div></main>
}
export default SellerOrdersPage
