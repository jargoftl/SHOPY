import ReviewsPanel from '../components/ReviewsPanel.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SellerProductTabs from '../components/SellerProductTabs.jsx'
import RefundList from '../components/RefundList.jsx'
import { apiRequest } from '../lib/api.js'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'
import { publishWarehouseProduct } from '../lib/warehousePublish.js'
import WarehouseBrowser from '../components/WarehouseBrowser.jsx'

export default function SellerManagementPage({ view }) {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sellerId,setSellerId]=useState(null)
  const [authorized, setAuthorized] = useState(false)
  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me').then(async ({ user }) => {
      if (!['seller','admin'].includes(user.role)) throw new Error('A seller account is required for this workspace.')
      if (active) {setAuthorized(true);setSellerId(user.id)}
    }).catch((error) => { if (active) { if (error.status === 401) navigate('/seller/login', { replace: true }); else setMessage(error.message) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate, view])
  const add = async (product,pricing) => {
    setMessage('')
    const published=await publishWarehouseProduct(product,pricing)
    setMessage(`${published.name} is published in Store products, your store and the marketplace homepage.`)
    return published
  }

  return <main className="min-h-screen bg-[#f7f7f5] px-5 py-8 text-[#111111]"><div className="mx-auto max-w-6xl"><div className="flex items-center justify-between"><Link to="/seller" className="text-sm text-[#111111] underline">← Seller dashboard</Link>{authorized && <SellerNotificationBell />}</div><h1 className="mt-4 text-3xl font-semibold">Product management</h1><div className="mt-6"><SellerProductTabs /></div>
    {message && <p role="status" className="mt-4 rounded border border-[#e5e5e5] bg-white p-3 text-sm">{message}</p>}
    {loading ? <p className="mt-5">Loading workspace…</p> : authorized ? <div className="mt-6">
      {view === 'warehouse' && <><h2 className="text-xl font-semibold">Product warehouse</h2><p className="mt-2 text-sm text-[#555555]">Browse a category, check the product details, and add it to your store. Its category and subcategory are copied automatically.</p><div className="mt-4 flex gap-5 text-xs text-[#555555]"><Link to="/seller/products" className="underline">Open Store products</Link><Link to="/" className="underline">View marketplace homepage</Link></div><WarehouseBrowser onAdd={add} /></>}
      {view === 'refunds' && <RefundList />}
      {view === 'reviews' && sellerId && <ReviewsPanel kind="store" id={sellerId}/>}
    </div> : null}
  </div></main>
}
