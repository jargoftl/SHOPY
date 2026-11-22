import AdminStoreDates from '../components/AdminStoreDates.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
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

const visitorKeys = ['todayVisitors', 'visitorsLast7Days', 'visitorsLast30Days']

const MAX_CREDIT_SCORE = 1000000000000

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
  const [totalVisits, setTotalVisits] = useState(null)
  const [totalVisitsEdit, setTotalVisitsEdit] = useState('')
  const [chinaDay, setChinaDay] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [loadedMetricsSellerId, setLoadedMetricsSellerId] = useState('')
  const [salesTrack, setSalesTrack] = useState('')
  const [visitsTrack, setVisitsTrack] = useState('')
  const [topProductVolumes, setTopProductVolumes] = useState({})
  const [message, setMessage] = useState('')
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
    apiRequest(`/api/admin/sellers/${selectedSellerId}/dashboard-metrics`)
      .then(metricData => {
        if (!isCurrent) return
        const metrics = metricData.metrics || {}
        setLoadedMetricsSellerId(selectedSellerId)
        setChinaDay(metricData.chinaDay || '')
        setTotalVisits(metricData.totalStoreVisits ?? null)
        setTotalVisitsEdit('')
        setForm(Object.fromEntries(metricFields.map(({ key }) => [key, metrics[key] ?? ''])))
        setSalesTrack(formatTrack(metrics.salesTrack))
        setVisitsTrack(formatTrack(metrics.visitsTrack))
        setTopProductVolumes(Object.fromEntries((metrics.topProducts || []).map((item) => [item.productId, String(item.salesVolume)])))
        setMessage('')
      })
      .catch((error) => { if (isCurrent) setMessage(error.message) })
    return () => { isCurrent = false }
  }, [selectedSellerId])

  useEffect(() => {
    if (['#store-records','#dashboard-values','#visitor-statistics'].includes(location.hash) && selectedSellerId && loadedMetricsSellerId === selectedSellerId) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
    }
  }, [location.hash, selectedSellerId, loadedMetricsSellerId])

  const sellerProducts = products.filter((product) => product.sellerId === Number(selectedSellerId))
  const selectedSeller = sellers.find((seller) => seller.id === Number(selectedSellerId))

  const saveCreditScore = async (event) => {
    event.preventDefault()
    if (isSaving || loadedMetricsSellerId !== selectedSellerId) return
    setIsSaving(true)
    setMessage('')
    try {
      const { score } = await apiRequest(`/api/admin/sellers/${selectedSellerId}/credit-score`, {
        method: 'PATCH',
        body: JSON.stringify({ score: Number(form.sellerCreditScore || 5) }),
      })
      setForm(current => ({ ...current, sellerCreditScore: String(score) }))
      setMessage(`Credit score saved as ${score} for ${selectedSeller?.storeName || selectedSeller?.fullName} · #${selectedSeller?.publicId}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const saveMetrics = async (event) => {
    event.preventDefault()
    if (!selectedSellerId || loadedMetricsSellerId !== selectedSellerId) return
    setIsSaving(true)
    setMessage('')
    const metrics = Object.fromEntries(Object.entries(form).filter(([key, value]) => key !== 'sellerCreditScore' && value !== '').map(([key, value]) => [key, Number(value)]))
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
        body: JSON.stringify({ metrics, chinaDay, preserveCreditScore: true, ...(totalVisitsEdit!==''?{totalStoreVisits:Number(totalVisitsEdit)}:{}) }),
      })
      if(totalVisitsEdit!==''){setTotalVisits(Number(totalVisitsEdit));setTotalVisitsEdit('')}
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

  if (isLoading) return <main className="mx-auto max-w-5xl px-5 py-16"><ContentPlaceholder/></main>
  if (!admin) return <main className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="text-2xl font-semibold">Admin access required</h1><p className="mt-3 text-sm text-[#666]">{message}</p><Link to="/login" className="mt-5 inline-block underline">Admin login</Link></main>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-10">
          <div><Link to="/admin" className="text-2xl font-black tracking-[-0.07em]"><SiteName logo /></Link><p className="mt-1 text-xs text-slate-600">Admin seller controls</p></div>
          <nav className="flex items-center gap-4 text-xs"><Link to="/admin" className="underline underline-offset-4">Admin dashboard</Link><Link to="/seller/register" className="underline underline-offset-4">Create seller</Link><button type="button" onClick={logOut} className="border border-slate-300 px-3 py-2">Log out</button></nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 md:px-10 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Seller accounts</p><h1 className="mt-2 text-3xl font-semibold">Dashboard metrics</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Set the figures and activity history shown in each seller’s dashboard.</p></div>
          <label className="text-xs text-slate-700">Seller
            <select value={selectedSellerId} disabled={isSaving} onChange={(event) => setSelectedSellerId(event.target.value)} className="mt-2 block h-11 min-w-64 border border-slate-300 bg-white px-3 text-sm text-slate-950">
              <option value="">Select seller</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.storeName || seller.fullName} · #{seller.publicId} · {seller.email}</option>)}
            </select>
          </label>
        </div>

        {message && <p role="status" className="border border-slate-300 bg-white px-4 py-3 text-sm">{message}</p>}

        {selectedSellerId && loadedMetricsSellerId === selectedSellerId &&
          <form onSubmit={saveCreditScore} className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7" aria-labelledby="seller-score-heading">
            <h2 id="seller-score-heading" className="text-lg font-semibold">Seller credit score</h2>
            <p className="mt-1 text-sm text-slate-700">Enter a score, increase it by one point, or set it to 100, then select Save credit score. The default is 5.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-700">Credit score
                <input type="number" min="0" max={MAX_CREDIT_SCORE} step="any" value={form.sellerCreditScore}
                  onChange={(event) => setForm((current) => ({ ...current, sellerCreditScore: event.target.value }))}
                  className="mt-1 block h-11 w-36 rounded border border-[#555555] bg-white px-3 text-sm text-slate-950" placeholder="5" />
              </label>
              <button type="button" disabled={isSaving || Number(form.sellerCreditScore) >= MAX_CREDIT_SCORE}
                className="min-h-11 rounded border border-[#555555] px-3 text-sm disabled:opacity-50"
                onClick={() => setForm((current) => ({ ...current, sellerCreditScore: String(Math.min(MAX_CREDIT_SCORE, Number(current.sellerCreditScore || 5) + 1)) }))}>
                Increase by 1
              </button>
              <button type="button" disabled={isSaving}
                className="min-h-11 rounded border border-[#555555] px-3 text-sm disabled:opacity-50"
                onClick={() => setForm((current) => ({ ...current, sellerCreditScore: '100' }))}>
                Set to 100
              </button>
              <button type="submit" disabled={isSaving} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Save credit score</button>
            </div>
          </form>}
        {selectedSellerId && loadedMetricsSellerId === selectedSellerId && <form id="dashboard-values" onSubmit={saveMetrics} className="scroll-mt-4 space-y-6">
          <section id="visitor-statistics" className="scroll-mt-4 rounded-xl border border-slate-300 bg-white p-5 sm:p-7">
            <h2 className="text-lg font-semibold">Visitor statistics</h2>
            <p className="mt-1 text-sm text-slate-600">Today’s visitor edit resets at midnight China time. Blank period fields use recorded counts.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metricFields.filter(({key})=>visitorKeys.includes(key)).map(({key,label})=><label key={key} className="block text-sm font-medium">{label}
                <input type="number" min="0" max="1000000000000" step="1" value={form[key]} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))} placeholder="Use recorded count" className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3"/>
              </label>)}
              <label className="block text-sm font-medium">Total store visits
                <input type="number" min="0" max="1000000000" step="1" value={totalVisitsEdit} onChange={event=>setTotalVisitsEdit(event.target.value)} placeholder={totalVisits==null?'No store profile':String(totalVisits)} disabled={totalVisits==null} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3"/>
              </label>
            </div>
            <button disabled={isSaving} type="submit" className="mt-4 min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSaving?'Saving…':'Save dashboard values'}</button>
          </section>
          <section className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7">
            <div className="mb-5"><h2 className="text-lg font-semibold">Dashboard totals</h2><p className="mt-1 text-xs text-slate-600">Leave a field blank to use recorded figures. Today’s edits expire at midnight China time.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {metricFields.filter(({ key }) => key !== 'sellerCreditScore' && !visitorKeys.includes(key)).map(({ key, label, integer, max, step, prefix }) => <label key={key} className="block text-xs text-slate-700">{label}
                <div className="mt-2 flex h-11 items-center border border-slate-300 bg-white focus-within:border-[#cccccc]">{prefix && <span className="pl-3 text-slate-600">{prefix}</span>}<input type="number" min="0" max={max || 1000000000000} step={integer ? '1' : step || '0.01'} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-950 outline-none" placeholder="Use live value" /></div>
              </label>)}
            </div>
          </section>

          <section className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7">
            <div className="mb-5"><h2 className="text-lg font-semibold">Visitor and sales chart</h2><p className="mt-1 text-xs text-slate-600">Enter up to 31 daily values, oldest first, ending today (UTC). Sales values are in USD.</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs text-slate-700">Sales volume history
                <textarea value={salesTrack} onChange={(event) => setSalesTrack(event.target.value)} rows={3} className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-[#cccccc]" placeholder="120, 185, 90, 240" />
              </label>
              <label className="block text-xs text-slate-700">Visits history
                <textarea value={visitsTrack} onChange={(event) => setVisitsTrack(event.target.value)} rows={3} className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-[#cccccc]" placeholder="32, 48, 41, 65" />
              </label>
            </div>
          </section>

          <details className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7">
            <summary className="mb-3 cursor-pointer text-lg font-semibold">Top-selling product records</summary>
            <div className="divide-y divide-[#111111]">
              {products.filter((product) => product.sellerId === Number(selectedSellerId)).map((product) => <label key={product.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <img src={product.imageUrl} alt="" className="size-12 shrink-0 object-cover" /><span className="min-w-0 flex-1 break-words">{product.name}</span><span className="text-xs text-slate-600">${product.price.toFixed(2)}</span>
                <span className="flex items-center gap-2 text-xs text-slate-700">Units sold<input type="number" min="0" max="1000000000" step="1" value={topProductVolumes[product.id] || ''} onChange={(event) => setTopProductVolumes((current) => ({ ...current, [product.id]: event.target.value }))} className="h-9 w-24 border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-[#cccccc]" /></span>
              </label>)}
              {!products.some((product) => product.sellerId === Number(selectedSellerId)) && <p className="py-8 text-sm text-slate-600">This seller has no products yet.</p>}
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-slate-600">Selected seller: {selectedSeller?.storeName || selectedSeller?.fullName} · #{selectedSeller?.publicId}</p><button disabled={isSaving} type="submit" className="min-h-11 bg-[#cccccc] px-6 text-sm font-semibold text-[#111111] disabled:opacity-60">{isSaving ? 'Saving…' : 'Save dashboard values'}</button></div>
        </form>}
        {selectedSellerId && <AdminStoreDates key={selectedSellerId} userId={selectedSellerId} showDateHistory={false}/>}
        {!selectedSellerId && <p className="border border-dashed border-slate-300 px-5 py-12 text-center text-sm text-slate-600">No seller accounts found. Create a seller account, then return here to set its dashboard data.</p>}
      </main>
    </div>
  )
}

export default AdminSellerMetricsPage
