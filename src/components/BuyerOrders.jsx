import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, RefreshCw } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'

const filters = [
  ['all', 'View all'],
  ['pending', 'Pending'],
  ['on_the_way', 'On the way'],
  ['delivered', 'Delivered'],
  ['returned', 'Returned'],
]

const statusLabel = (status) => filters.find(([value]) => value === status)?.[1] || status.replaceAll('_', ' ')

const BuyerOrders = () => {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest('/api/buyer/orders')
      .then(({ orders: result }) => { if (active) setOrders(result) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const refresh = async () => {
    setLoading(true); setError('')
    try { setOrders((await apiRequest('/api/buyer/orders')).orders) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  const visible = filter === 'all' ? orders : orders.filter((order) => order.status === filter)

  return <section id="orders" aria-labelledby="orders-title" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#748277]">Your account</p><h2 id="orders-title" className="mt-2 text-2xl font-semibold">My Orders</h2><p className="mt-2 text-sm text-[#738075]">Review your order history and status updates.</p></div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-[#dce4da] bg-white px-4 py-2 text-sm hover:border-[#315941] disabled:opacity-60"><RefreshCw size={15} /> Refresh</button>
    </div>
    <p className="rounded-xl border border-[#e7dfc8] bg-[#fffcf2] px-4 py-3 text-xs leading-5 text-[#6e5c34]">These are test orders. No payment or actual delivery is processed, and statuses do not track real shipments. Earlier test checkouts were not saved.</p>
    <div role="group" aria-label="Filter orders by status" className="flex flex-wrap gap-2">
      {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-4 py-2 text-sm transition-colors ${filter === value ? 'bg-[#263d35] font-semibold text-white' : 'bg-white text-[#526055] hover:bg-[#eaf2e8]'}`}>{label}</button>)}
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p role="status" className="rounded-2xl border border-[#e1e7df] bg-white p-6 text-sm text-[#737970]">Loading orders…</p> : visible.length ? <div className="space-y-4">{visible.map((order) => {
      const quantity = order.items.reduce((total, item) => total + item.quantity, 0)
      return <article key={order.id} className="rounded-2xl border border-[#e1e7df] bg-white p-5 shadow-[0_8px_30px_rgba(27,50,33,0.03)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf0eb] pb-4">
          <div><h3 className="text-sm font-semibold">Order #{order.id}</h3><p className="mt-1 text-xs text-[#738075]">{order.createdAt} UTC</p></div>
          <span className="rounded-full bg-[#f0f5eb] px-3 py-1 text-xs font-semibold text-[#315941]">{statusLabel(order.status)}</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-start gap-3"><div className="flex shrink-0 -space-x-2">{order.items.slice(0, 3).map((item, index) => item.imageUrl ? <img key={index} src={item.imageUrl} alt={item.name} loading="lazy" className="size-14 rounded-lg border-2 border-white bg-[#f2f4ef] object-cover" /> : <span key={index} className="grid size-14 place-items-center rounded-lg border-2 border-white bg-[#edf4eb] text-[#315941]" aria-label={`${item.name}: image unavailable`}><Package size={19} /></span>)}</div><div><p className="text-sm font-medium">{quantity} {quantity === 1 ? 'item' : 'items'}</p><p className="mt-1 text-xs leading-5 text-[#738075]">{order.items.map((item) => item.name).join(', ')}</p></div></div>
          <div className="sm:text-right"><p className="text-xs text-[#738075]">Order total</p><p className="mt-1 text-lg font-semibold text-[#a75f1b]">{formatMoney(order.totalCents)}</p></div>
        </div>
        <details className="group mt-5 border-t border-[#edf0eb] pt-4">
          <summary className="w-fit cursor-pointer list-none rounded-full border border-[#cbd5ca] px-4 py-2 text-sm text-[#315941] hover:border-[#315941]"><span className="group-open:hidden">View order</span><span className="hidden group-open:inline">Hide order</span></summary>
          <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
            <div><h4 className="font-semibold">Items</h4>{order.items.map((item, index) => <div key={index} className="mt-3 flex items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="size-14 rounded-lg bg-[#f2f4ef] object-cover" /> : <span className="grid size-14 place-items-center rounded-lg bg-[#edf4eb] text-[#315941]" aria-label={`${item.name}: image unavailable`}><Package size={19} /></span>}<p className="text-[#526055]">{item.productId ? <Link className="underline" to={`/products/${item.productId}`}>{item.name}</Link> : item.name} × {item.quantity} · {formatMoney(item.priceCents)} each{[item.color, item.size].filter(Boolean).length > 0 && ` · ${[item.color, item.size].filter(Boolean).join(' · ')}`}</p></div>)}</div>
            <div><h4 className="font-semibold">Billing details</h4><p className="mt-2 leading-6 text-[#526055]">{order.billing.fullName} · {order.billing.phone}<br />{order.billing.address}, {order.billing.city}, {order.billing.region} {order.billing.postalCode}, {order.billing.country}</p>{order.paymentMethod.startsWith('coin:') && <p className="mt-2 text-[#526055]">Selected coin: {order.paymentMethod.slice(5)}</p>}</div>
            <div className="sm:col-span-2"><h4 className="font-semibold">Status history</h4><ol className="mt-2 space-y-2">{order.history.map((entry, index) => <li key={index} className="text-xs text-[#526055]">{statusLabel(entry.status)} · {entry.createdAt} UTC</li>)}</ol></div>
          </div>
        </details>
      </article>
    })}</div> : <div className="rounded-2xl border border-[#e1e7df] bg-white p-10 text-center"><Package size={26} className="mx-auto text-[#8ca092]" /><p className="mt-3 text-sm font-medium">No orders {filter === 'all' ? 'yet' : 'in this category'}.</p><Link to="/products" className="mt-3 inline-block text-sm text-[#315941] underline">Browse products</Link></div>}
  </section>
}

export default BuyerOrders
