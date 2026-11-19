import ShipmentHistory from '../components/ShipmentHistory.jsx'
import DeliveryEmailStatus from '../components/DeliveryEmailStatus.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import {progressToast} from '../components/ProgressToast.jsx'
import DeliveryProgress from '../components/DeliveryProgress.jsx'
import SaleConfirmations from '../components/SaleConfirmations.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import SellerProductTabs from '../components/SellerProductTabs.jsx'
import { fulfillmentLabel, fulfillmentOptions, paymentStatusLabel } from '../lib/fulfillment.js'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'

const SellerOrdersPage = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState(params.get('order') || '')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    apiRequest('/api/seller/purchases').then((data) => { if (active) setOrders(data.orders) })
      .catch((err) => { if (active) { if (err.status === 401) navigate('/seller/login', { replace: true }); else setError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate, reload])
  const update = async (order, status) => {
    setBusy(true); setError('')
    try { await apiRequest(`/api/purchase-sellers/${order.id}/${order.sellers[0].sellerId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setReload((value) => value + 1); progressToast(`Order #${order.orderNumber}: ${fulfillmentLabel(status)}`) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const visible = orders.filter((order) => (!search.trim() || (String(order.orderNumber) === search.trim() || String(order.id) === search.trim())) && (filter === 'all' || order.sellers[0]?.status === filter))
  return <main className="account-workspace min-h-screen bg-[#f7f7f7] px-5 py-8 text-[#111111]"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap justify-between gap-3"><div><Link to="/seller" className="text-sm text-[#555555]">← Dashboard</Link><h1 className="mt-3 text-3xl font-semibold">Shop orders</h1><p className="mt-2 text-sm text-[#555555]">Balance-paid orders appear immediately. You or the administrator can confirm the sale. Tracking numbers are assigned by the administrator; update the fulfillment status as the order progresses.</p></div><div className="flex items-start gap-4"><Link to="/messages" className="text-sm underline">Message administrator</Link><SellerNotificationBell /></div></div>
    <div className="mt-6"><SellerProductTabs /></div>
    <div className="mt-7 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs">Order number<input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-[#e5e5e5] p-2 text-sm" /></label><label className="text-xs">Logistics<select value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-[#e5e5e5] bg-white p-2 text-sm"><option value="all">All</option>{fulfillmentOptions.map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label><button onClick={() => { setSearch(''); setFilter('all'); setReload((value) => value + 1); }} className="border border-[#e5e5e5] px-4 py-2 text-xs">Reset / refresh</button></div>
    <SaleConfirmations sales={orders.map(o=>({orderId:o.id,orderNumber:o.orderNumber,sellerId:o.sellers[0]?.sellerId,amountCents:o.subtotalCents,paymentStatus:o.status,accountBalancePayment:o.accountBalancePayment,releaseStatus:o.sellers[0]?.releaseStatus}))} onConfirmed={async()=>setOrders((await apiRequest('/api/seller/purchases')).orders)}/>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {loading ? <ContentPlaceholder/> : <div className="mt-5 space-y-5">{visible.map(order=>{const shipment=order.sellers[0];return <article key={order.id} className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Order #{order.orderNumber}</p><p className="mt-2 font-semibold">{order.buyerName}</p><p className="mt-1 text-xs text-gray-500">{order.createdAt} UTC</p></div><div className="text-right"><p className="text-lg font-semibold">{formatMoney(order.subtotalCents)}</p><OrderStatusBadge status={order.status} label={paymentStatusLabel(order.status)}/></div></header><div className="grid min-w-0 gap-6 p-5 lg:grid-cols-[1fr_1.3fr]"><section className="min-w-0"><h2 className="text-sm font-semibold">Order items</h2><div className="mt-3 space-y-3">{order.items.map(item=><div key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl bg-gray-50 p-3">{item.imageUrl&&<img src={item.imageUrl} alt="" className="size-14 shrink-0 rounded-lg bg-white object-cover"/>}<div className="min-w-0"><p className="break-words text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-gray-500">Quantity: {item.quantity}</p></div></div>)}</div>{order.coin==='BALANCE'&&<p className="mt-4 text-xs text-gray-500">Paid from account balance</p>}</section><section className="min-w-0"><h2 className="mb-3 text-sm font-semibold">Dispatch & tracking</h2>{shipment&&<><DeliveryProgress compact status={shipment.status}/><div className="mt-4 grid min-w-0 gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-gray-500">Tracking number</p><p className="mt-1 break-all font-mono text-sm font-semibold">{shipment.trackingNumber||'Not assigned yet'}</p></div><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-gray-500">Carrier</p><p className="mt-1 break-words text-sm">{shipment.carrier||'Not assigned yet'}</p></div>{shipment.carrierTrackingNumber&&<p className="break-all text-xs text-gray-500 sm:col-span-2">Carrier reference: {shipment.carrierTrackingNumber}</p>}</div><label className="mt-4 block text-xs font-medium">Update fulfillment<select aria-label={`Logistics for order ${order.orderNumber}`} disabled={busy||order.status!=='paid'} value={shipment.status} onChange={e=>update(order,e.target.value)} className="mt-2 block min-h-12 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm disabled:opacity-50">{fulfillmentOptions.map(([status,label])=><option key={status} value={status}>{label}</option>)}</select></label><DeliveryEmailStatus shipment={shipment} orderId={order.id}/><ShipmentHistory trackingNumber={shipment.trackingNumber} revision={reload}/></>}{order.status!=='paid'&&<p className="mt-3 text-xs text-gray-500">Payment not confirmed</p>}</section></div></article>})}{!visible.length&&<p className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">No matching orders.</p>}</div>}
  </div></main>
}
export default SellerOrdersPage
