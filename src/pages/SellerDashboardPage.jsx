import SiteName from '../components/SiteName.jsx'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Bell, Boxes, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Megaphone, Menu, MessageSquare, Package, Store, Users, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'
import RewardsBalance from '../components/RewardsBalance.jsx'

const SellerDashboardPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isPreviewMode = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1'
  const [user, setUser] = useState(null)
  const [store, setStore] = useState(null)
  const [metrics, setMetrics] = useState({})
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let isCurrent = true
    if (isPreviewMode) {
      Promise.all([apiRequest('/api/stores'), apiRequest('/api/products')])
        .then(([storeData, productData]) => {
          if (!isCurrent) return
          const demoStore = storeData.stores.find((item) => item.storeName === 'Goodform Studio') || storeData.stores[0]
          if (!demoStore) {
            setError('No development partner store is available for preview.')
            setIsLoading(false)
            return
          }
          setUser({ id: demoStore.id, fullName: demoStore.ownerName, role: 'seller' })
          setStore({
            storeName: demoStore.storeName,
            storeDescription: demoStore.storeDescription,
            storeLogoUrl: demoStore.logoUrl,
            productCount: demoStore.productCount,
            followerCount: demoStore.followerCount,
            visitorCount: demoStore.visitorCount,
          })
          setMetrics({})
          setProducts(productData.products.filter((product) => product.sellerId === demoStore.id))
          setIsLoading(false)
        })
        .catch((requestError) => {
          if (!isCurrent) return
          setError(requestError.message)
          setIsLoading(false)
        })
      return () => { isCurrent = false }
    }

    apiRequest('/api/auth/me')
      .then(async ({ user: account }) => {
        if (['pending','rejected','needs_changes'].includes(account.sellerStatus) && account.role==='customer') { navigate('/seller/application',{replace:true}); return }
        if (!['seller', 'admin'].includes(account.role)) {
          navigate('/seller/login', { replace: true })
          return
        }
        const [productData, storeData, metricsData] = await Promise.all([
          apiRequest('/api/seller/products'),
          apiRequest('/api/seller/store'),
          apiRequest('/api/seller/dashboard-metrics'),
        ])
        if (!isCurrent) return
        setUser(account)
        setProducts(productData.products)
        setStore(storeData.store)
        setMetrics(metricsData.metrics || {})
        setIsLoading(false)
      })
      .catch((requestError) => {
        if (!isCurrent) return
        if (requestError.message.includes('log in') || requestError.message.includes('session')) {
          navigate('/seller/login', { replace: true })
          return
        }
        setError(requestError.message)
        setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [isPreviewMode, navigate])

  const categories = useMemo(() => {
    const grouped = new Map()
    for (const product of products) {
      if (!grouped.has(product.category)) grouped.set(product.category, [])
      grouped.get(product.category).push(product)
    }
    return [...grouped.entries()].map(([name, items]) => ({ name, items })).sort((first, second) => second.items.length - first.items.length)
  }, [products])

  const averageRating = products.length
    ? products.reduce((total, product) => total + (product.rating || 0), 0) / products.length
    : 0
  const topSellingProducts = (metrics.topProducts || []).map((record) => ({
    ...products.find((product) => product.id === record.productId),
    salesVolume: record.salesVolume,
  })).filter((product) => product.id)
  const salesTrack = Array.isArray(metrics.salesTrack) ? metrics.salesTrack : []
  const visitsTrack = Array.isArray(metrics.visitsTrack) ? metrics.visitsTrack : []
  const chartMaximum = Math.max(1, ...salesTrack, ...visitsTrack)
  const chartPolyline = (values) => values.length > 1
    ? values.map((value, index) => `${(index / (values.length - 1)) * 600},${150 - (value / chartMaximum) * 125}`).join(' ')
    : ''
  const displayCurrency = (value) => value === undefined ? '—' : `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const logOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (isLoading) return <main className="px-6 py-16 text-sm text-[#66716a]">Loading seller dashboard…</main>
  if (error) return <main role="alert" className="px-6 py-16 text-sm text-[#9b3d34]">{error}</main>

  const navigation = [
    { label: 'Dashboard', href: '/seller', icon: LayoutDashboard, active: true },
    { label: 'Shop orders', href: isPreviewMode ? '/seller/login' : '/seller/orders', icon: Boxes },
    { label: 'My purchases', href: isPreviewMode ? '/seller/login' : '/orders', icon: Package },
    { label: 'Store profile', href: isPreviewMode ? '/seller/login' : '/seller/products#store-profile', icon: Store },
    { label: 'Messages', href: isPreviewMode ? '/seller/login' : '/messages', icon: MessageSquare },
    { label: 'Notifications', href: isPreviewMode ? '/seller/login' : '/messages?view=notifications', icon: Bell },
  ]

  const sidebar = (
    <>
      <div className="border-b border-[#e7e9e7] px-5 py-5">
        <Link to="/seller" className="text-[25px] font-black tracking-[-0.08em] text-[#18271e]"><SiteName /><span className="ml-1 text-sm text-[#e27658]">▰</span></Link>
        <div className="mt-5 flex items-center gap-3">
          {store?.storeLogoUrl ? <img src={store.storeLogoUrl} alt="" className="size-11 rounded-full border border-[#e8e8e3] object-cover" /> : <span className="grid size-11 place-items-center rounded-full bg-[#edf1ea] text-lg font-semibold text-[#1f4a32]">{(store?.storeName || user.fullName).slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0"><p className="truncate text-xs font-semibold">{store?.storeName || user.fullName}</p><p className="mt-1 truncate text-[10px] text-[#858b85]">{user.fullName} · Seller ID {user.id}</p><p className="mt-1 truncate text-[10px] text-[#858b85]">{user.email}</p></div>
        </div>
        {store && <Link to={`/stores/${user.id}`} className="mt-4 flex min-h-9 items-center justify-center bg-[#3189ec] text-xs font-semibold text-white hover:bg-[#2675ca]">My shop</Link>}
      </div>
      <nav className="space-y-1 px-3 py-4" aria-label="Seller dashboard">
        {navigation.map(({ label, href, icon: Icon, active }) => <Link key={label} to={href} onClick={() => setMobileMenuOpen(false)} className={`flex min-h-11 items-center gap-3 px-3 text-xs font-medium ${active ? 'bg-[#edf2ff] text-[#3267dc]' : 'text-[#68716b] hover:bg-[#f4f6f4] hover:text-[#1d2b22]'}`}>
          <Icon size={16} /><span>{label}</span>{label === 'Messages' && <ChevronRight className="ml-auto" size={14} />}
        </Link>)}
        <details className="text-xs text-[#68716b]"><summary className="flex min-h-11 cursor-pointer items-center gap-3 px-3 font-medium"><Package size={16} /> Product management <ChevronRight className="ml-auto" size={14} /></summary>
          <div className="space-y-1 pl-8">{[['Store products', '/seller/products'], ['Product warehouse', '/seller/warehouse'], ['Refund requests', '/seller/refunds'], ['Product reviews', '/seller/reviews']].map(([label, href]) => <Link key={href} to={isPreviewMode ? '/seller/login' : href} onClick={() => setMobileMenuOpen(false)} className="block rounded px-3 py-2 hover:bg-[#f4f6f4]">{label}</Link>)}</div>
        </details>
        <details className="text-xs text-[#68716b]"><summary className="flex min-h-11 cursor-pointer items-center gap-3 px-3 font-medium"><Megaphone size={16}/> Marketing Tools <ChevronRight className="ml-auto" size={14}/></summary><div className="space-y-1 pl-8">{[['Store Upgrade','upgrade'],['Purchase History','history'],['Seller Level','levels']].map(([label,path])=><Link key={path} to={isPreviewMode?'/seller/login':user.role==='admin'?'/admin#marketing-requests':`/seller/marketing/${path}`} onClick={()=>setMobileMenuOpen(false)} className="block rounded px-3 py-2 hover:bg-[#f4f6f4]">{label}</Link>)}</div></details>
      </nav>
      {user.role === 'admin' && <div className="mx-4 border-t border-[#e7e9e7] py-3"><Link to="/admin" className="flex min-h-10 items-center gap-3 px-2 text-xs font-medium text-[#68716b] hover:text-[#1d2b22]"><Users size={16} />Admin dashboard</Link></div>}
      <div className="mt-auto border-t border-[#e7e9e7] p-4"><button type="button" onClick={() => isPreviewMode ? navigate('/seller/login') : logOut()} className="flex min-h-10 w-full items-center gap-3 px-2 text-xs font-medium text-[#68716b] hover:text-[#b34037]"><LogOut size={16} />{isPreviewMode ? 'Exit preview' : 'Log out'}</button></div>
    </>
  )

  const statTiles = [
    { title: 'Total products', value: metrics.totalProducts ?? products.length, note: 'Products in your catalog', icon: Package, color: 'bg-[#ff8299]' },
    { title: 'Total sales amount', value: metrics.totalSalesAmount === undefined ? 'Not set' : `$${Number(metrics.totalSalesAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, note: 'Admin-managed dashboard value', icon: CircleDollarSign, color: 'bg-[#67b8f5]' },
    { title: 'Total orders', value: metrics.totalOrders ?? 'Not set', note: 'Admin-managed dashboard value', icon: Boxes, color: 'bg-[#7488f2]' },
    { title: 'Total profit', value: metrics.totalProfit === undefined ? 'Not set' : `$${Number(metrics.totalProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, note: 'Admin-managed dashboard value', icon: CircleDollarSign, color: 'bg-[#52c9be]' },
  ]

  return (
    <div className="min-h-screen bg-[#eef1f4] text-[#25302a] lg:flex">
      <aside className="hidden w-[228px] shrink-0 flex-col border-r border-[#e5e8e8] bg-white lg:flex">{sidebar}</aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-[#e5e8e8] bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3"><button type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? 'Close seller navigation' : 'Open seller navigation'} className="grid size-9 place-items-center border border-[#e4e7e4] lg:hidden">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button><h1 className="text-sm font-semibold">Dashboard</h1>{isPreviewMode && <span className="border border-[#eadfc7] bg-[#fff9eb] px-2 py-1 text-[10px] font-semibold text-[#71521e]">PREVIEW</span>}</div>
          <div className="flex items-center gap-2 sm:gap-3">
            <SellerNotificationBell preview={isPreviewMode} />
            <span className="hidden max-w-48 truncate text-xs text-[#737b75] xl:block">{user.email}</span>
            <Link to={isPreviewMode ? '/seller/login' : '/seller/products#product-form'} className="hidden min-h-9 items-center bg-[#3189ec] px-3 text-xs font-semibold text-white hover:bg-[#2675ca] sm:flex">Create offer</Link>
            <button type="button" onClick={() => isPreviewMode ? navigate('/seller/login') : logOut()} className="min-h-9 bg-[#e44e59] px-3 text-xs font-semibold text-white hover:bg-[#c73944]">{isPreviewMode ? 'Exit preview' : 'Log out'}</button>
          </div>
        </header>

        <nav className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-[#e5e8e8] bg-white px-3 sm:px-6" aria-label="Seller workspace tabs">
          <Link to="/seller" className="shrink-0 border-b-2 border-[#3267dc] px-3 py-3 text-[11px] font-medium text-[#3267dc]">Dashboard</Link>
          <Link to={isPreviewMode ? '/seller/login' : '/seller/orders'} className="shrink-0 px-3 py-3 text-[11px] text-[#3267dc]">Shop orders</Link>
          {[['Store products', '/seller/products'], ['Product warehouse', '/seller/warehouse'], ['Refund requests', '/seller/refunds'], ['Product reviews', '/seller/reviews']].map(([label, href]) => <Link key={href} to={isPreviewMode ? '/seller/login' : href} className="shrink-0 px-3 py-3 text-[11px] text-[#3267dc]">{label}</Link>)}
          {['Financial statement', 'My wallet', 'Deposit', 'Withdraw', 'Fund record'].map((tab) => <button key={tab} type="button" disabled title="This dashboard section is not connected yet" className="shrink-0 border-b-2 border-transparent px-3 py-3 text-[11px] text-[#9aa19b]">{tab}</button>)}
          <Link to={isPreviewMode ? '/seller/login' : '/seller/products'} className="shrink-0 border-b-2 border-transparent px-3 py-3 text-[11px] text-[#59645c] hover:border-[#dfe5df]">Store products</Link>
        </nav>

        {mobileMenuOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileMenuOpen(false) }}><aside className="flex h-full w-[min(84vw,300px)] flex-col bg-white shadow-xl">{sidebar}</aside></div>}

        <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-7">
          {isPreviewMode && <section className="flex flex-wrap items-center justify-between gap-3 border border-[#eadfc7] bg-[#fff9eb] px-4 py-3 text-xs"><span>Previewing the dashboard with sample store data. Sign in to manage your own account.</span><Link to="/seller/login" className="font-semibold underline underline-offset-4">Seller login</Link></section>}
          {!isPreviewMode && user.role === 'seller' && <RewardsBalance />}
          {!store && <section className="flex flex-wrap items-center justify-between gap-3 border border-[#eadfc7] bg-[#fff9eb] px-4 py-3 text-xs"><span>Your public store profile is not set up yet.</span><Link to="/seller/products#store-profile" className="font-semibold underline underline-offset-4">Set up store profile</Link></section>}
          <section className="bg-white p-4 shadow-[0_1px_5px_rgba(27,39,31,0.06)] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-sm font-semibold">Account overview</h2><p className="mt-1 text-[11px] text-[#7b847d]">A live view of your seller store</p></div><Link to="/seller/products" className="text-xs font-medium text-[#3267dc] hover:underline">Manage catalog</Link></div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {statTiles.map(({ title, value, note, icon: Icon, color }) => <article key={title} className={`${color} min-h-[104px] px-4 py-4 text-white sm:px-5`}>
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">{title}</p><Icon size={17} className="opacity-80" /></div>
                <p className="mt-3 truncate text-xl font-semibold">{value}</p><p className="mt-1 text-[10px] text-white/85">{note}</p>
              </article>)}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
              <h2 className="text-sm font-semibold">Store overview</h2>
              <div className="mt-5 grid grid-cols-3 divide-x divide-[#edf0ed] text-center">
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{metrics.overallRating ?? (averageRating ? averageRating.toFixed(1) : '—')}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Overall rating</p></div>
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{metrics.sellerCreditScore ?? '—'}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Seller credit score</p></div>
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{Number(store?.followerCount || 0).toLocaleString()}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Followers</p></div>
              </div>
              <Link to={store ? `/stores/${user.id}` : '/seller/products#store-profile'} className="mt-5 flex min-h-9 items-center justify-between border-t border-[#edf0ed] pt-3 text-xs text-[#3267dc]">{store ? 'Open public shop' : 'Create your public shop'}<ChevronRight size={15} /></Link>
            </section>

            <section className="bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
              <h2 className="text-sm font-semibold">Visitor statistics</h2>
              <div className="mt-5 grid grid-cols-3 divide-x divide-[#edf0ed] text-center">
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{metrics.todayVisitors ?? '—'}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Today’s visitors</p></div>
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{metrics.visitorsLast7Days ?? '—'}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Last 7 days</p></div>
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{metrics.visitorsLast30Days ?? '—'}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Last 30 days</p></div>
              </div>
              <p className="mt-5 border-t border-[#edf0ed] pt-3 text-[10px] leading-4 text-[#7b847d]">Lifetime visits: {Number(store?.visitorCount || 0).toLocaleString()}</p>
            </section>

            <section className="bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
              <h2 className="text-sm font-semibold">Today’s statistics</h2>
              <div className="mt-5 grid grid-cols-3 divide-x divide-[#edf0ed] text-center">
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{metrics.todayOrders ?? '—'}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Today’s order</p></div>
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{displayCurrency(metrics.todaySales)}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Today’s sales</p></div>
                <div className="px-2"><p className="text-lg font-semibold text-[#f28b34]">{displayCurrency(metrics.estimatedProfit)}</p><p className="mt-1 text-[10px] leading-4 text-[#657067]">Estimated profit</p></div>
              </div>
              <p className="mt-5 border-t border-[#edf0ed] pt-3 text-[10px] leading-4 text-[#7b847d]">Figures can be set by your store admin.</p>
            </section>
          </div>

          <section className="bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-semibold">Sales volume & visits</h2><p className="mt-1 text-[11px] text-[#7b847d]">Historical activity</p></div><BarChart3 size={18} className="text-[#758179]" /></div>
            {salesTrack.length > 1 || visitsTrack.length > 1 ? <div className="mt-4 overflow-hidden border border-[#edf0ed] p-3">
              <div className="mb-2 flex gap-4 text-[10px] text-[#657067]"><span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-[#f45a82]" />Sales volume</span><span className="inline-flex items-center gap-1"><i className="size-2 rounded-full bg-[#4388ff]" />Visits</span></div>
              <svg viewBox="0 0 600 170" role="img" aria-label="Admin-entered sales and visit history" className="h-48 w-full">
                {[25, 65, 105, 150].map((y) => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#e9eeeb" strokeWidth="1" />)}
                {salesTrack.length > 1 && <polyline points={chartPolyline(salesTrack)} fill="none" stroke="#f45a82" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {visitsTrack.length > 1 && <polyline points={chartPolyline(visitsTrack)} fill="none" stroke="#4388ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
              </svg>
            </div> : <div className="mt-4 grid min-h-32 place-items-center border border-dashed border-[#dfe5df] px-5 py-8 text-center"><div><p className="text-sm font-medium text-[#57635a]">No time-series data yet</p><p className="mt-2 max-w-xl text-xs leading-5 text-[#7b847d]">Your admin can enter sales and visit history for this chart.</p></div></div>}
          </section>

          <section className="bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
            <div className="flex items-end justify-between gap-4"><div><h2 className="text-sm font-semibold">Your categories</h2><p className="mt-1 text-[11px] text-[#7b847d]">Categories represented by your products</p></div><Link to="/seller/products" className="text-xs text-[#3267dc] hover:underline">Manage products</Link></div>
            {categories.length ? <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {categories.map((category) => <Link key={category.name} to="/seller/products" className="group relative h-[132px] min-w-[132px] flex-1 overflow-hidden bg-[#e8ece8] sm:min-w-[155px]">
                {category.items[0]?.imageUrl && <img src={category.items[0].imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-300 group-hover:scale-105" />}
                <div className="absolute inset-0 bg-black/35" /><div className="absolute inset-x-2 bottom-3 text-center text-white"><p className="line-clamp-2 text-xs font-semibold">{category.name}</p><p className="mt-1 text-[10px]">{category.items.length} {category.items.length === 1 ? 'product' : 'products'}</p></div>
              </Link>)}
            </div> : <div className="mt-4 border border-dashed border-[#dce2dc] px-4 py-9 text-center text-xs text-[#7b847d]">Add products to build your category overview.</div>}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
            <section className="min-w-0 bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Top 10 best-selling items</h2><p className="mt-1 text-[11px] text-[#7b847d]">Sales volumes entered by your admin</p></div><Link to={isPreviewMode ? '/seller/login' : '/seller/products'} className="text-xs text-[#3267dc] hover:underline">Product management</Link></div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-[#889089]"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Sales volume</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-[#edf0ed]">
                    {topSellingProducts.map((product, index) => <tr key={product.id}>
                      <td className="px-3 py-3 text-[#879087]">{index + 1}</td>
                      <td className="px-3 py-3"><Link to={`/products/${product.id}`} className="flex min-w-0 items-center gap-2 hover:underline"><img src={product.imageUrl} alt="" className="size-9 shrink-0 object-cover" /><span className="max-w-[260px] truncate">{product.name}</span></Link></td>
                      <td className="max-w-40 truncate px-3 py-3 text-[#69736c]">{product.category}</td>
                      <td className="px-3 py-3">${product.price.toFixed(2)}</td>
                      <td className="px-3 py-3 text-[#df8b32]">{Number(product.salesVolume).toLocaleString()}</td>
                      <td className="px-3 py-3 text-[10px] text-[#66736a]">{[product.isPublished && 'Marketplace', product.isStorePublished && 'Store'].filter(Boolean).join(' · ') || 'Draft'}</td>
                    </tr>)}
                    {!topSellingProducts.length && <tr><td colSpan="6" className="px-3 py-10 text-center text-[#7b847d]">No sales records configured yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="bg-white p-5 shadow-[0_1px_5px_rgba(27,39,31,0.06)]">
              <h2 className="text-sm font-semibold">Store status</h2>
              <p className="mt-1 text-[11px] text-[#7b847d]">Orders are not connected to these dashboard figures.</p>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between text-xs"><span className="text-[#68716b]">Products listed</span><strong>{store?.productCount ?? 0}</strong></div>
                <div className="flex items-center justify-between text-xs"><span className="text-[#68716b]">Store visits</span><strong>{Number(store?.visitorCount || 0).toLocaleString()}</strong></div>
                <div className="flex items-center justify-between text-xs"><span className="text-[#68716b]">Followers</span><strong>{Number(store?.followerCount || 0).toLocaleString()}</strong></div>
                <div className="border-t border-[#edf0ed] pt-4"><Link to="/messages" className="flex items-center justify-between text-xs text-[#3267dc]">Contact admin<MessageSquare size={15} /></Link></div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}

export default SellerDashboardPage
