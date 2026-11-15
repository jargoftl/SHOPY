import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Package, RefreshCw } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { fulfillmentLabel, paymentStatusLabel } from '../lib/fulfillment.js'
import { formatMoney } from '../lib/money.js'
import StatusBadge from './OrderStatusBadge.jsx'

const filters = [
  ['all', 'View all'],
  ['pending', 'Pending'],
  ['on_the_way', 'On the way'],
  ['delivered', 'Delivered'],
  ['returned', 'Returned'],
]

const statusLabel = (status) => filters.find(([value]) => value === status)?.[1] || status.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())

const BuyerOrders = ({ includeTestOrders = true }) => {
  const [orders, setOrders] = useState([])
  const [purchases, setPurchases] = useState([])
  const [refunds, setRefunds] = useState([])
  const [reasons, setReasons] = useState({})
  const [refundBusy, setRefundBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatesError, setUpdatesError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([includeTestOrders ? apiRequest('/api/buyer/orders') : Promise.resolve({ orders: [] }), apiRequest('/api/purchases'), apiRequest('/api/refunds')])
      .then(([testData, purchaseData, refundData]) => { if (active) { setOrders(testData.orders); setPurchases(purchaseData.orders); setRefunds(refundData.refunds) } })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [includeTestOrders])

  useEffect(() => {
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const [purchaseData, refundData] = await Promise.all([apiRequest('/api/purchases', { background: true }), apiRequest('/api/refunds', { background: true })])
        if (active) { setPurchases(purchaseData.orders); setRefunds(refundData.refunds); setUpdatesError('') }
      } catch (err) {
        if (active) setUpdatesError(`Automatic order updates unavailable: ${err.message}`)
      }
    }, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const refresh = async () => {
    setLoading(true); setError('')
    try { const [testData, purchaseData, refundData] = await Promise.all([includeTestOrders ? apiRequest('/api/buyer/orders') : Promise.resolve({ orders: [] }), apiRequest('/api/purchases'), apiRequest('/api/refunds')]); setOrders(testData.orders); setPurchases(purchaseData.orders); setRefunds(refundData.refunds) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  const requestRefund = async (event, orderId, sellerId) => {
    event.preventDefault(); setRefundBusy(true); setError('')
    const key = `${orderId}-${sellerId}`
    try {
      await apiRequest(`/api/purchases/${orderId}/refunds`, { method: 'POST', body: JSON.stringify({ sellerId, reason: reasons[key] }) })
      const data = await apiRequest('/api/refunds'); setRefunds(data.refunds)
      setReasons((current) => ({ ...current, [key]: '' }))
    } catch (err) { setError(err.message) } finally { setRefundBusy(false) }
  }
  const visible = filter === 'all' ? orders : orders.filter((order) => order.status === filter)

  return <section id="orders" aria-labelledby="orders-title" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#555555]">Your account</p><h2 id="orders-title" className="mt-2 text-2xl font-semibold">My Orders</h2><p className="mt-2 text-sm text-[#555555]">Review your order history and status updates.</p></div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-4 py-2 text-sm hover:border-[#111111] disabled:opacity-60"><RefreshCw size={15} /> Refresh</button>
    </div>
    <div className="space-y-3">{purchases.map((order) => <article key={order.id} className="overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-[0_2px_12px_rgba(27,50,33,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#f7f7f7] px-4 py-4 sm:px-6">
        <div><h3 className="text-sm font-semibold text-[#111111]">Order #{order.orderNumber}</h3><p className="mt-1 text-xs text-[#555555]">{order.createdAt} UTC{order.coin === 'BALANCE' && ' · Account balance'}</p></div>
        <StatusBadge status={order.status} label={paymentStatusLabel(order.status)} />
      </div>
      <div className="grid gap-5 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)]">
        <div className="min-w-0 space-y-3">{order.items.map((item, index) => <div key={item.id ?? index} className="flex min-w-0 items-center gap-3">
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded bg-[#f7f7f7] object-cover" /> : <span className="grid size-14 shrink-0 place-items-center rounded bg-[#f7f7f7] text-[#111111]"><Package size={19} aria-hidden="true" /></span>}
          <div className="min-w-0"><p className="break-words text-sm font-medium text-[#111111]">{item.name}</p><p className="mt-1 text-xs text-[#555555]">Qty {item.quantity}{[item.color, item.size].filter(Boolean).length > 0 && ` · ${[item.color, item.size].filter(Boolean).join(' · ')}`}</p></div>
        </div>)}</div>
        <div className="border-t border-[#f7f7f7] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <p className="text-xs text-[#555555]">{order.shippingCents == null || order.taxCents == null ? 'Subtotal' : 'Order total'}</p><p className="mt-1 text-lg font-semibold text-[#111111]">{formatMoney(order.subtotalCents + (order.shippingCents ?? 0) + (order.taxCents ?? 0))}</p>
          <div className="mt-4 space-y-3">{order.sellers.map((seller) => <div key={seller.sellerId}><p className="mb-1.5 break-words text-xs font-medium text-[#111111]">{seller.storeName}</p><StatusBadge status={seller.status} label={fulfillmentLabel(seller.status)} />{seller.trackingNumber&&<p className="mt-2 break-all text-xs">Tracking: {seller.trackingNumber} · {seller.carrier}</p>}</div>)}</div>
          <Link className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#111111] underline-offset-4 hover:underline" to={`/purchase/${order.id}`}>View payment and order <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </div>
      {order.status === 'paid' && order.sellers.map((seller) => {
        const refund = refunds.find((item) => item.orderId === order.id && item.sellerId === seller.sellerId)
        const key = `${order.id}-${seller.sellerId}`
        if (order.coin === 'BALANCE') return <p key={key} className="border-t border-[#f7f7f7] px-4 py-4 text-xs text-[#111111] sm:px-6">For a store-credit refund for {seller.storeName}, <Link to="/messages" className="font-semibold underline">contact the administrator</Link>.</p>
        return <details key={key} className="border-t border-[#f7f7f7] px-4 py-4 text-sm sm:px-6"><summary className="cursor-pointer font-medium text-[#111111]">Refund · {seller.storeName}{refund ? ` · ${statusLabel(refund.status)}` : ''}</summary>{refund ? <div className="mt-3"><StatusBadge status={refund.status} label={`Refund ${statusLabel(refund.status)}`} /><p className="mt-2 text-xs leading-5 text-[#111111]">Approval is not a payment; refunds are arranged manually.{refund.transferReference && ` Transfer reference: ${refund.transferReference}`}</p></div> : <form onSubmit={(event) => requestRefund(event, order.id, seller.sellerId)} className="mt-3"><label className="block">Reason for this seller’s items<textarea required maxLength={1000} value={reasons[key] || ''} onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 block w-full rounded border border-[#e5e5e5] p-2" /></label><p className="mt-2 text-xs text-[#555555]">One request per seller and order. The seller reviews it; any refund is handled manually by the administrator.</p><button disabled={refundBusy} className="mt-2 rounded bg-[#111111] px-4 py-2 text-white disabled:opacity-50">Request refund</button></form>}</details>
      })}
    </article>)}</div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {updatesError && <p role="status" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{updatesError}</p>}
    {!includeTestOrders && !loading && !error && !purchases.length && <p className="text-sm text-[#555555]">You have no purchase orders yet.</p>}
    {!includeTestOrders && loading && <p role="status" className="text-sm">Loading orders…</p>}
    {includeTestOrders && <><p className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-xs leading-5 text-[#111111]">Previous test orders are listed below. No payment or actual delivery was processed for them.</p>
    <div role="group" aria-label="Filter orders by status" className="flex flex-wrap gap-2">
      {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-4 py-2 text-sm transition-colors ${filter === value ? 'bg-[#111111] font-semibold text-white' : 'bg-white text-[#111111] hover:bg-[#f7f7f7]'}`}>{label}</button>)}
    </div>
    {loading ? <p role="status" className="rounded-2xl border border-[#e5e5e5] bg-white p-6 text-sm text-[#555555]">Loading orders…</p> : visible.length ? <div className="space-y-4">{visible.map((order) => {
      const quantity = order.items.reduce((total, item) => total + item.quantity, 0)
      return <article key={order.id} className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_8px_30px_rgba(27,50,33,0.03)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f7f7f7] pb-4">
          <div><h3 className="text-sm font-semibold">Order #{order.orderNumber}</h3><p className="mt-1 text-xs text-[#555555]">{order.createdAt} UTC</p></div>
          <StatusBadge status={order.status} label={statusLabel(order.status)} />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-start gap-3"><div className="flex shrink-0 -space-x-2">{order.items.slice(0, 3).map((item, index) => item.imageUrl ? <img key={index} src={item.imageUrl} alt={item.name} loading="lazy" className="size-14 rounded-lg border-2 border-white bg-[#f7f7f7] object-cover" /> : <span key={index} className="grid size-14 place-items-center rounded-lg border-2 border-white bg-[#f7f7f7] text-[#111111]" aria-label={`${item.name}: image unavailable`}><Package size={19} /></span>)}</div><div><p className="text-sm font-medium">{quantity} {quantity === 1 ? 'item' : 'items'}</p><p className="mt-1 text-xs leading-5 text-[#555555]">{order.items.map((item) => item.name).join(', ')}</p></div></div>
          <div className="sm:text-right"><p className="text-xs text-[#555555]">Order total</p><p className="mt-1 text-lg font-semibold text-[#555555]">{formatMoney(order.totalCents)}</p></div>
        </div>
        <details className="group mt-5 border-t border-[#f7f7f7] pt-4">
          <summary className="w-fit cursor-pointer list-none rounded-full border border-[#cccccc] px-4 py-2 text-sm text-[#111111] hover:border-[#111111]"><span className="group-open:hidden">View order</span><span className="hidden group-open:inline">Hide order</span></summary>
          <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
            <div><h4 className="font-semibold">Items</h4>{order.items.map((item, index) => <div key={index} className="mt-3 flex items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="size-14 rounded-lg bg-[#f7f7f7] object-cover" /> : <span className="grid size-14 place-items-center rounded-lg bg-[#f7f7f7] text-[#111111]" aria-label={`${item.name}: image unavailable`}><Package size={19} /></span>}<p className="text-[#111111]">{item.productId ? <Link className="underline" to={`/products/${item.productId}`}>{item.name}</Link> : item.name} × {item.quantity} · {formatMoney(item.priceCents)} each{[item.color, item.size].filter(Boolean).length > 0 && ` · ${[item.color, item.size].filter(Boolean).join(' · ')}`}</p></div>)}</div>
            <div><h4 className="font-semibold">Billing details</h4><p className="mt-2 leading-6 text-[#111111]">{order.billing.fullName} · {order.billing.phone}<br />{order.billing.address}, {order.billing.city}, {order.billing.region} {order.billing.postalCode}, {order.billing.country}</p>{order.paymentMethod.startsWith('coin:') && <p className="mt-2 text-[#111111]">Selected coin: {order.paymentMethod.slice(5)}</p>}</div>
            <div className="sm:col-span-2"><h4 className="font-semibold">Status history</h4><ol className="mt-2 space-y-2">{order.history.map((entry, index) => <li key={index} className="text-xs text-[#111111]">{statusLabel(entry.status)} · {entry.createdAt} UTC</li>)}</ol></div>
          </div>
        </details>
      </article>
    })}</div> : <div className="rounded-2xl border border-[#e5e5e5] bg-white p-10 text-center"><Package size={26} className="mx-auto text-[#777777]" /><p className="mt-3 text-sm font-medium">No orders {filter === 'all' ? 'yet' : 'in this category'}.</p><Link to="/products" className="mt-3 inline-block text-sm text-[#111111] underline">Browse products</Link></div>}</>}
  </section>
}

export default BuyerOrders
