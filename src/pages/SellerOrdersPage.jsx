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
  return <main className="min-h-screen bg-[#f7f7f7] px-5 py-8 text-[#111111]"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap justify-between gap-3"><div><Link to="/seller" className="text-sm text-[#555555]">← Seller dashboard</Link><h1 className="mt-3 text-3xl font-semibold">Shop orders</h1><p className="mt-2 text-sm text-[#555555]">Balance-paid orders appear immediately. You or the administrator can confirm the sale. Tracking numbers are assigned by the administrator; update the fulfillment status as the order progresses.</p></div><div className="flex items-start gap-4"><Link to="/messages" className="text-sm underline">Message administrator</Link><SellerNotificationBell /></div></div>
    <div className="mt-6"><SellerProductTabs /></div>
    <div className="mt-7 flex flex-wrap gap-3 rounded bg-white p-5"><label className="text-xs">Order number<input value={search} onChange={(event) => setSearch(event.target.value)} className="ml-2 border border-[#e5e5e5] p-2 text-sm" /></label><label className="text-xs">Logistics<select value={filter} onChange={(event) => setFilter(event.target.value)} className="ml-2 border border-[#e5e5e5] bg-white p-2 text-sm"><option value="all">All</option>{fulfillmentOptions.map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label><button onClick={() => { setSearch(''); setFilter('all'); setReload((value) => value + 1); progressToast(`Order #${order.orderNumber}: ${fulfillmentLabel(status)}`) }} className="border border-[#e5e5e5] px-4 py-2 text-xs">Reset / refresh</button></div>
    <SaleConfirmations sales={orders.map(o=>({orderId:o.id,orderNumber:o.orderNumber,sellerId:o.sellers[0]?.sellerId,amountCents:o.subtotalCents,paymentStatus:o.status,accountBalancePayment:o.accountBalancePayment,releaseStatus:o.sellers[0]?.releaseStatus}))} onConfirmed={async()=>setOrders((await apiRequest('/api/seller/purchases')).orders)}/>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {loading ? <ContentPlaceholder/> : <div className="mt-4 overflow-x-auto rounded bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f7f7f7] text-xs text-[#555555]"><tr>{['Order','Buyer','Items','Product amount','Payment','Logistics'].map((title) => <th key={title} className="p-4">{title}</th>)}</tr></thead><tbody>{visible.map((order) => <tr key={order.id} className="border-t border-[#f7f7f7] align-top"><td className="p-4">#{order.orderNumber}<p className="text-xs text-[#777777]">{order.createdAt} UTC</p></td><td className="p-4">{order.buyerName}</td><td className="p-4">{order.items.map((item) => <div key={item.id} className="flex items-center gap-2 py-1">{item.imageUrl && <img src={item.imageUrl} alt="" className="size-10 rounded object-cover" />}<span>{item.name} × {item.quantity}</span></div>)}</td><td className="p-4">{formatMoney(order.subtotalCents)}</td><td className="p-4"><OrderStatusBadge status={order.status} label={paymentStatusLabel(order.status)} />{order.coin === 'BALANCE' && <p className="mt-1 text-xs text-[#555555]">Paid from account balance</p>}</td><td className="p-4"><DeliveryProgress compact status={order.sellers[0].status}/><DeliveryEmailStatus shipment={order.sellers[0]} orderId={order.id}/><OrderStatusBadge status={order.sellers[0].status} label={fulfillmentLabel(order.sellers[0].status)} /><select aria-label={`Logistics for order ${order.orderNumber}`} disabled={busy || order.status !== 'paid'} value={order.sellers[0].status} onChange={(event) => update(order, event.target.value)} className="mt-2 block max-w-full border border-[#e5e5e5] bg-white p-2 disabled:opacity-50">{fulfillmentOptions.map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>{order.sellers[0].trackingNumber&&<p className="mt-3 break-all text-xs">Tracking: {order.sellers[0].trackingNumber}<br/>{order.sellers[0].carrier} · Assigned by admin</p>}{order.status !== 'paid' && <p className="mt-1 text-xs">Payment not confirmed</p>}</td></tr>)}</tbody></table>{!visible.length && <p className="p-8 text-center text-sm text-[#555555]">No matching orders.</p>}</div>}
  </div></main>
}
export default SellerOrdersPage
