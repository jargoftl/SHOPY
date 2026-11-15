import SiteName from '../components/SiteName.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'

const metricFields = [
  { key: 'totalProducts', label: 'Total products', integer: true },
  { key: 'totalSalesAmount', label: 'Total sales amount', prefix: '$' },
  { key: 'totalOrders', label: 'Total orders', integer: true },
  { key: 'totalProfit', label: 'Total profit', prefix: '$' },
  { key: 'overallRating', label: 'Overall rating', max: 5, step: '0.1' },
  { key: 'sellerCreditScore', label: 'Seller credit score', step: '0.1' },
  { key: 'todayVisitors', label: 'Today’s visitors', integer: true },
  { key: 'visitorsLast7Days', label: 'Visitors, last 7 days', integer: true },
  { key: 'visitorsLast30Days', label: 'Visitors, last 30 days', integer: true },
  { key: 'todayOrders', label: 'Today’s orders', integer: true },
  { key: 'todaySales', label: 'Today’s sales', prefix: '$' },
  { key: 'estimatedProfit', label: 'Estimated profit', prefix: '$' },
]

const emptyForm = Object.fromEntries(metricFields.map(({ key }) => [key, '']))

const formatTrack = (values) => Array.isArray(values) ? values.join(', ') : ''
const parseTrack = (value) => value.split(',').map((item) => item.trim()).filter(Boolean).map(Number)

const AdminSellerMetricsPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [admin, setAdmin] = useState(null)
  const [sellers, setSellers] = useState([])
  const [products, setProducts] = useState([])
  const [selectedSellerId, setSelectedSellerId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [salesTrack, setSalesTrack] = useState('')
  const [visitsTrack, setVisitsTrack] = useState('')
  const [topProductVolumes, setTopProductVolumes] = useState({})
  const [adminFollowerCount, setAdminFollowerCount] = useState('0')
  const [message, setMessage] = useState('Loading seller metrics…')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isCurrent = true
    apiRequest('/api/auth/me')
      .then(async ({ user }) => {
        if (user.role !== 'admin') {
          navigate('/login', { replace: true })
          return
        }
        const [sellerData, productData] = await Promise.all([
          apiRequest('/api/admin/sellers'),
          apiRequest('/api/admin/products'),
        ])
        if (!isCurrent) return
        setAdmin(user)
        setSellers(sellerData.sellers)
        setProducts(productData.products)
        const requestedId = new URLSearchParams(location.search).get('seller')
        setSelectedSellerId(String(sellerData.sellers.find((seller) => String(seller.id) === requestedId)?.id || sellerData.sellers[0]?.id || ''))
        setMessage('')
        setIsLoading(false)
      })
      .catch((error) => {
        if (!isCurrent) return
        if (error.message.includes('log in') || error.message.includes('session')) {
          navigate('/login', { replace: true })
          return
        }
        setMessage(error.message)
        setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [navigate, location.search])

  useEffect(() => {
    if (!selectedSellerId) return undefined
    let isCurrent = true
    Promise.all([
      apiRequest(`/api/admin/sellers/${selectedSellerId}/dashboard-metrics`),
      apiRequest('/api/admin/sellers'),
    ])
      .then(([metricData, sellerData]) => {
        if (!isCurrent) return
        const metrics = metricData.metrics || {}
        setForm(Object.fromEntries(metricFields.map(({ key }) => [key, metrics[key] ?? ''])))
        setSalesTrack(formatTrack(metrics.salesTrack))
        setVisitsTrack(formatTrack(metrics.visitsTrack))
        setTopProductVolumes(Object.fromEntries((metrics.topProducts || []).map((item) => [item.productId, String(item.salesVolume)])))
        const seller = sellerData.sellers.find((item) => item.id === Number(selectedSellerId))
        setAdminFollowerCount(String(seller?.adminFollowerCount ?? 0))
        setMessage('')
      })
      .catch((error) => { if (isCurrent) setMessage(error.message) })
    return () => { isCurrent = false }
  }, [selectedSellerId])

  const sellerProducts = products.filter((product) => product.sellerId === Number(selectedSellerId))
  const selectedSeller = sellers.find((seller) => seller.id === Number(selectedSellerId))

  const saveMetrics = async (event) => {
    event.preventDefault()
    if (!selectedSellerId) return
    setIsSaving(true)
    setMessage('')
    const metrics = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value)]))
    const parsedSalesTrack = parseTrack(salesTrack)
    const parsedVisitsTrack = parseTrack(visitsTrack)
    const topProducts = sellerProducts
      .filter((product) => topProductVolumes[product.id] !== undefined && topProductVolumes[product.id] !== '')
      .map((product) => ({ productId: product.id, salesVolume: Number(topProductVolumes[product.id]) }))
    metrics.salesTrack = parsedSalesTrack
    metrics.visitsTrack = parsedVisitsTrack
    metrics.topProducts = topProducts

    try {
      await apiRequest(`/api/admin/sellers/${selectedSellerId}/dashboard-metrics`, {
        method: 'PUT',
        body: JSON.stringify({ metrics }),
      })
      await apiRequest(`/api/admin/sellers/${selectedSellerId}/stats`, {
        method: 'PATCH',
        body: JSON.stringify({ followerCount: Number(adminFollowerCount) }),
      })
      setSellers((current) => current.map((seller) => seller.id === Number(selectedSellerId)
        ? { ...seller, adminFollowerCount: Number(adminFollowerCount), followerCount: Number(adminFollowerCount) + Math.max(0, seller.followerCount - seller.adminFollowerCount) }
        : seller))
      setMessage(`Dashboard values saved for ${selectedSeller?.storeName || selectedSeller?.fullName}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const logOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (isLoading) return <main className="mx-auto max-w-5xl px-5 py-16 text-sm text-[#66716a]">{message}</main>
  if (!admin) return <main className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="text-2xl font-semibold">Admin access required</h1><p className="mt-3 text-sm text-[#666]">{message}</p><Link to="/login" className="mt-5 inline-block underline">Admin login</Link></main>

  return (
    <div className="min-h-screen bg-[#07120b] text-[#edf3e9]">
      <header className="border-b border-[#26382b] bg-[#0b1710]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 md:px-10">
          <div><Link to="/admin" className="text-2xl font-black tracking-[-0.07em]"><SiteName /><span className="ml-1 text-sm text-[#c8f135]">▰</span></Link><p className="mt-1 text-xs text-[#9baa9d]">Admin seller controls</p></div>
          <nav className="flex items-center gap-4 text-xs"><Link to="/admin" className="underline underline-offset-4">Admin dashboard</Link><Link to="/seller/register" className="underline underline-offset-4">Create seller</Link><button type="button" onClick={logOut} className="border border-[#3b5140] px-3 py-2">Log out</button></nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-6 px-5 py-8 md:px-10 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c8f135]">Seller accounts</p><h1 className="mt-2 text-3xl font-semibold">Dashboard metrics</h1><p className="mt-2 max-w-2xl text-sm text-[#9baa9d]">Set the figures and activity history shown in each seller’s dashboard.</p></div>
          <label className="text-xs text-[#b8c2b9]">Seller
            <select value={selectedSellerId} onChange={(event) => setSelectedSellerId(event.target.value)} className="mt-2 block h-11 min-w-64 border border-[#3b5140] bg-[#101c13] px-3 text-sm text-white">
              <option value="">Select seller</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.storeName || seller.fullName} · #{seller.publicId}</option>)}
            </select>
          </label>
        </div>

        {message && <p role="status" className="border border-[#263c2d] bg-[#0d1b12] px-4 py-3 text-sm">{message}</p>}

        {selectedSellerId && <form onSubmit={saveMetrics} className="space-y-6">
          <section className="border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
            <div className="mb-5"><h2 className="text-lg font-semibold">Dashboard totals</h2><p className="mt-1 text-xs text-[#9baa9d]">Leave a field blank to use live data where available.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {metricFields.map(({ key, label, integer, max, step, prefix }) => <label key={key} className="block text-xs text-[#b8c2b9]">{label}
                <div className="mt-2 flex h-11 items-center border border-[#3b5140] bg-[#101c13] focus-within:border-[#c8f135]">{prefix && <span className="pl-3 text-[#9baa9d]">{prefix}</span>}<input type="number" min="0" max={max || 1000000000000} step={integer ? '1' : step || '0.01'} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none" placeholder="Use live value" /></div>
              </label>)}
              <label className="block text-xs text-[#b8c2b9]">Admin follower adjustment
                <input type="number" min="0" max="1000000000" step="1" value={adminFollowerCount} onChange={(event) => setAdminFollowerCount(event.target.value)} className="mt-2 h-11 w-full border border-[#3b5140] bg-[#101c13] px-3 text-sm text-white outline-none focus:border-[#c8f135]" />
              </label>
            </div>
          </section>

          <section className="border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
            <div className="mb-5"><h2 className="text-lg font-semibold">Visitor and sales chart</h2><p className="mt-1 text-xs text-[#9baa9d]">Enter up to 31 daily values, separated by commas.</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs text-[#b8c2b9]">Sales volume history
                <textarea value={salesTrack} onChange={(event) => setSalesTrack(event.target.value)} rows={3} className="mt-2 w-full border border-[#3b5140] bg-[#101c13] px-3 py-2 text-sm text-white outline-none focus:border-[#c8f135]" placeholder="120, 185, 90, 240" />
              </label>
              <label className="block text-xs text-[#b8c2b9]">Visits history
                <textarea value={visitsTrack} onChange={(event) => setVisitsTrack(event.target.value)} rows={3} className="mt-2 w-full border border-[#3b5140] bg-[#101c13] px-3 py-2 text-sm text-white outline-none focus:border-[#c8f135]" placeholder="32, 48, 41, 65" />
              </label>
            </div>
          </section>

          <section className="border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
            <div className="mb-5"><h2 className="text-lg font-semibold">Top-selling product records</h2><p className="mt-1 text-xs text-[#9baa9d]">Only products belonging to this seller are available.</p></div>
            <div className="divide-y divide-[#263c2d]">
              {products.filter((product) => product.sellerId === Number(selectedSellerId)).map((product) => <label key={product.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <img src={product.imageUrl} alt="" className="size-12 shrink-0 object-cover" /><span className="min-w-0 flex-1 truncate">{product.name}</span><span className="text-xs text-[#9baa9d]">${product.price.toFixed(2)}</span>
                <span className="flex items-center gap-2 text-xs text-[#b8c2b9]">Units sold<input type="number" min="0" max="1000000000" step="1" value={topProductVolumes[product.id] || ''} onChange={(event) => setTopProductVolumes((current) => ({ ...current, [product.id]: event.target.value }))} className="h-9 w-24 border border-[#3b5140] bg-[#101c13] px-2 text-sm text-white outline-none focus:border-[#c8f135]" /></span>
              </label>)}
              {!products.some((product) => product.sellerId === Number(selectedSellerId)) && <p className="py-8 text-sm text-[#9baa9d]">This seller has no products yet.</p>}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-[#9baa9d]">Selected seller: {selectedSeller?.storeName || selectedSeller?.fullName} · #{selectedSeller?.publicId}</p><button disabled={isSaving} type="submit" className="min-h-11 bg-[#c8f135] px-6 text-sm font-semibold text-[#112016] disabled:opacity-60">{isSaving ? 'Saving…' : 'Save dashboard values'}</button></div>
        </form>}
        {!selectedSellerId && <p className="border border-dashed border-[#3b5140] px-5 py-12 text-center text-sm text-[#9baa9d]">No seller accounts found. Create a seller account, then return here to set its dashboard data.</p>}
      </main>
    </div>
  )
}

export default AdminSellerMetricsPage
