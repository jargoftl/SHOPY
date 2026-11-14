import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SellerProductTabs from '../components/SellerProductTabs.jsx'
import RefundList from '../components/RefundList.jsx'
import { apiRequest } from '../lib/api.js'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'

export default function SellerManagementPage({ view }) {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me').then(async ({ user }) => {
      if (user.role !== 'seller') throw new Error('A seller account is required for this workspace.')
      if (view === 'warehouse') { const data = await apiRequest('/api/warehouse'); if (active) setProducts(data.products) }
      if (active) setAuthorized(true)
    }).catch((error) => { if (active) { if (error.status === 401) navigate('/seller/login', { replace: true }); else setMessage(error.message) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate, view])
  const add = async (product) => {
    setBusy(true); setMessage('')
    try { await apiRequest(`/api/seller/warehouse/${product.id}/import`, { method: 'POST' }); setMessage(`${product.name} added to your store and the marketplace. You can edit it in Store products.`) }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#20231f]"><div className="mx-auto max-w-6xl"><div className="flex items-center justify-between"><Link to="/seller" className="text-sm text-[#315941] underline">← Seller dashboard</Link>{authorized && <SellerNotificationBell />}</div><h1 className="mt-4 text-3xl font-semibold">Product management</h1><div className="mt-6"><SellerProductTabs /></div>
    {message && <p role="status" className="mt-4 rounded border border-[#dce4da] bg-white p-3 text-sm">{message}</p>}
    {loading ? <p className="mt-5">Loading workspace…</p> : authorized ? <div className="mt-6">
      {view === 'warehouse' && <><h2 className="text-xl font-semibold">Product warehouse</h2><p className="mt-2 text-sm text-[#737970]">Search the admin-managed catalog and add a copy to your store and the marketplace.</p><label className="mt-4 block text-sm">Search products<input value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1 block w-full max-w-md rounded border border-[#dce4da] bg-white p-3" placeholder="Product or category" /></label><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase())).map((p) => <article key={p.id} className="rounded-xl border border-[#e1e7df] bg-white p-4"><img src={p.imageUrl} alt="" className="h-40 w-full rounded object-cover" /><h3 className="mt-3 font-semibold">{p.name}</h3><p className="mt-1 text-xs text-[#737970]">{p.category}</p><p className="mt-2 text-sm">${Number(p.price).toFixed(2)}</p><button disabled={busy} onClick={() => add(p)} className="mt-3 rounded bg-[#263d35] px-4 py-2 text-sm text-white disabled:opacity-50">Add to my store</button></article>)}</div>{!products.length && <p className="mt-5 text-sm">The admin has not added any warehouse products yet.</p>}</>}
      {view === 'refunds' && <RefundList />}
      {view === 'reviews' && <section className="rounded-xl border border-[#e1e7df] bg-white p-6"><h2 className="text-xl font-semibold">Product reviews</h2><p className="mt-3 text-sm text-[#737970]">Buyer review submissions are not enabled yet. There are no reviews to display.</p></section>}
    </div> : null}
  </div></main>
}
