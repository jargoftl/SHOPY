import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'

export default function AdminOverview({ users, sellers, products, onPayments }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState(null)
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const data = await apiRequest('/api/admin/purchases', { background: true })
        if (active) { setOrders(data.orders); setToday(Date.now()); setError(''); setLoading(false) }
      } catch (err) {
        if (active) { setError(`Order overview unavailable: ${err.message}`); setLoading(false) }
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today ?? 0)
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - (6 - index))
    const key = date.toISOString().slice(0, 10)
    return { key, label: date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }), count: orders.filter((order) => order.createdAt.slice(0, 10) === key).length }
  })
  const max = Math.max(1, ...days.map((day) => day.count))
  const paid = orders.filter((order) => order.status === 'paid')
  const total = paid.reduce((sum, order) => sum + order.subtotalCents + (order.shippingCents ?? 0) + (order.taxCents ?? 0), 0)
  const metrics = [['Accounts', users.length], ['Sellers / stores', sellers.length], ['Products', products.length], ['Orders', loading || error ? '—' : orders.length]]
  return <section aria-label="Dashboard overview" className="mb-8 rounded-2xl bg-[#f3f5f3] p-5 text-[#111111] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-[#555555]">Store overview</p><h2 className="mt-1 text-2xl font-semibold">Your dashboard</h2></div><button type="button" onClick={onPayments} className="rounded-lg bg-[#555555] px-4 py-2 text-sm text-white">View orders</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-xl bg-white p-4"><p className="text-xs text-[#555555]">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>)}</div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-xl bg-white p-5"><div className="flex justify-between"><div><h3 className="font-semibold">Orders over time</h3><p className="mt-1 text-xs text-[#555555]">Orders created in the last 7 days · UTC</p></div><span className="text-xs text-[#555555]">{loading ? 'Loading…' : `${orders.length} total`}</span></div>
        <div aria-label="Orders per day" className="mt-5 flex h-36 items-end gap-3">{days.map((day) => <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-xs">{error || loading ? '—' : day.count}</span><div className="w-full max-w-12 rounded-t bg-[#555555]" style={{ height: `${day.count / max * 95}px`, minHeight: day.count ? '6px' : '1px' }} /><span className="text-xs text-[#555555]">{day.label}</span></div>)}</div>
      </div>
      <div className="rounded-xl bg-white p-5"><h3 className="font-semibold">Payment review</h3><p className="mt-1 text-xs text-[#555555]">Manual confirmations, not automatically verified payments.</p><div className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><span>Awaiting receipt</span><strong>{loading || error ? '—' : orders.filter((order) => order.status === 'awaiting_receipt').length}</strong></div><div className="flex justify-between"><span>Awaiting review</span><strong>{loading || error ? '—' : orders.filter((order) => order.status === 'awaiting_review').length}</strong></div><div className="flex justify-between"><span>Confirmed orders</span><strong>{loading || error ? '—' : paid.length}</strong></div><div className="border-t border-[#e5e5e5] pt-3"><p className="text-xs text-[#555555]">Confirmed order totals</p><p className="mt-1 text-xl font-semibold">{loading || error ? '—' : formatMoney(total)}</p></div></div></div>
    </div>
  </section>
}
