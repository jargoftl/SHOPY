import ReviewsPanel from '../components/ReviewsPanel.jsx'
import { notifyFollowedStoresUpdated } from '../lib/buyerEvents.js'
import SiteName from '../components/SiteName.jsx'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Heart, Search, X } from 'lucide-react'
import ProductCard from '../components/store/ProductCard.jsx'
import { apiRequest } from '../lib/api.js'

const PartnerStorePage = () => {
  const { sellerId } = useParams()
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [page,setPage]=useState(1)
  const [followBusy,setFollowBusy]=useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All products')
  const [sortBy, setSortBy] = useState('newest')
  const [isFollowing, setIsFollowing] = useState(false)
  const [followMessage, setFollowMessage] = useState('')
  const [error, setError] = useState('')
  const [loadedSellerId, setLoadedSellerId] = useState(null)
  const isLoading = loadedSellerId !== sellerId

  useEffect(() => {
    let isCurrent = true

    apiRequest(`/api/stores/${sellerId}`)
      .then(({ store: storeData, products: storeProducts }) => {
        if (!isCurrent) return
        setError('')
        setStore(storeData)
        setProducts(storeProducts)
      })
      .catch((requestError) => {
        if (isCurrent) setError(requestError.message)
      })
      .finally(() => {
        if (isCurrent) setLoadedSellerId(sellerId)
      })

    return () => { isCurrent = false }
  }, [sellerId])

  useEffect(() => {
    if (!store) return
    let isCurrent = true
    apiRequest(`/api/stores/${store.id}/follow`)
      .then(({ isFollowing: following }) => { if (isCurrent) setIsFollowing(following) })
      .catch(() => {})
    return () => { isCurrent = false }
  }, [store])

  const categories = [...new Set(products.map((product) => product.category))].sort((first, second) => first.localeCompare(second))
  const filteredProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'All products' || product.category === activeCategory
    const matchesSearch = `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesCategory && matchesSearch
  })
  const sortedProducts = [...filteredProducts].sort((first, second) => {
    if (sortBy === 'rating') return second.rating - first.rating
    if (sortBy === 'price-low') return first.price - second.price
    if (sortBy === 'price-high') return second.price - first.price
    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  })
  const pageSize=24
  const visibleProducts = activeTab === 'top'
    ? [...filteredProducts].sort((first, second) => second.rating - first.rating).slice(0, 4)
    : sortedProducts.slice((page-1)*pageSize,page*pageSize)
  useEffect(()=>{setPage(1)},[sellerId,activeTab,activeCategory,search,sortBy])
  const heroImage = products[0]?.imageUrl

  const toggleFollow = async () => {
    if (!store||followBusy) return
    setFollowBusy(true)
    setFollowMessage('')
    try {
      const result = await apiRequest(`/api/stores/${store.id}/follow`, { method: 'POST' })
      setIsFollowing(result.isFollowing)
      notifyFollowedStoresUpdated()
      setStore((current) => current ? { ...current, followerCount: result.followerCount } : current)
    } catch (requestError) {
      setFollowMessage(requestError.message.includes('log in') ? 'Sign in to follow this store.' : requestError.message)
    }finally{setFollowBusy(false)}
  }

  if (isLoading) {
    return <main className="mx-auto max-w-5xl px-5 py-20 text-sm text-[#666]">Loading partner store…</main>
  }

  if (error || !store) {
    return (
      <main className="mx-auto max-w-xl px-5 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#111111]">Partner stores</p>
        <h1 className="mt-3 text-3xl font-semibold">Store unavailable</h1>
        <p className="mt-3 text-sm text-[#555555]">{error || 'This store may have been removed.'}</p>
        <Link to="/" className="mt-7 inline-flex border border-[#cccccc] px-4 py-3 text-sm font-medium">Back to <SiteName /></Link>
    </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#111111]">
      <header className="border-b border-[#e5e5e5] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8">
          <Link to="/" className="text-[29px] font-black leading-none tracking-[-0.08em]"><SiteName /><span className="ml-1 text-[19px]">▰</span></Link>
          <nav className="flex items-center gap-5 text-xs font-semibold"><Link to="/profile/stores" className="underline underline-offset-4">My followed stores</Link><Link to="/cart" className="underline underline-offset-4">My cart</Link></nav>
        </div>
      </header>

      <section className="relative isolate flex min-h-[280px] items-end overflow-hidden bg-[#111111] sm:min-h-[350px]">
        {heroImage && <img src={heroImage} alt="" className="absolute inset-0 -z-20 size-full object-cover opacity-35" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#111111]/90 via-[#111111]/75 to-[#111111]/30" />
        <div className="mx-auto w-full max-w-[1440px] px-5 py-10 text-white sm:px-8 sm:py-14">
          <div className="flex items-center gap-4">
            {store.logoUrl && <img src={store.logoUrl} alt={`${store.storeName} logo`} className="size-16 shrink-0 rounded-full border border-white/30 bg-white/10 object-cover sm:size-20" />}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e5e5e5]"><SiteName /> partner store</p>
              <h1 className="mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl">{store.storeName}</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">{store.storeDescription || `A curated collection from ${store.ownerName}.`}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-white/80">
            <span>Curated by {store.ownerName}</span>
            <span>{products.length} products</span>
            <span>{Number(store.followerCount || 0).toLocaleString()} {Number(store.followerCount)===1?'follower':'followers'}</span>
            <span>{Number(store.visitorCount || 0).toLocaleString()} visits</span>
            <button type="button" disabled={followBusy} onClick={toggleFollow} aria-pressed={isFollowing} className={`inline-flex min-h-9 items-center gap-2 border px-3 text-xs font-semibold ${isFollowing ? 'border-[#e5e5e5] bg-[#e5e5e5] text-[#111111]' : 'border-white/60 text-white hover:bg-white hover:text-[#111111]'}`}><Heart size={14} className={isFollowing ? 'fill-current' : ''} />{followBusy?'Updating…':isFollowing ? 'Following · Unfollow' : 'Follow store'}</button>
          </div>
          <a href="#reviews" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-white/50 px-4 text-sm text-white">Rate & review this store</a>
          {followMessage && <p role="status" className="mt-2 text-xs text-white">{followMessage} {followMessage.includes('Sign in') && <Link to="/login" className="underline">Log in</Link>}</p>}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col justify-between gap-5 border-b border-[#e5e5e5] pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">The collection</p>
            <h2 className="text-3xl font-semibold">Shop {store.storeName}</h2>
          </div>
          <label className="flex w-full items-center gap-3 border-b border-[#a3a3a3] pb-2 sm:max-w-[300px]">
            <Search size={17} strokeWidth={1.6} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this store" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[#777]" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear store search" className="grid size-8 place-items-center"><X size={16} /></button>}
          </label>
        </div>

        <div className="mt-6 flex gap-6 border-b border-[#e5e5e5]" role="tablist" aria-label={`${store.storeName} products`}>
          <button type="button" role="tab" aria-selected={activeTab === 'top'} onClick={() => setActiveTab('top')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeTab === 'top' ? 'border-[#111111] text-[#111111]' : 'border-transparent text-[#555555]'}`}>
            Top products
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'all'} onClick={() => setActiveTab('all')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeTab === 'all' ? 'border-[#111111] text-[#111111]' : 'border-transparent text-[#555555]'}`}>
            All products <span className="ml-1 text-xs font-normal">({products.length})</span>
          </button>
        </div>

        <div className={`mt-6 ${activeTab === 'all' ? 'grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]' : ''}`}>
          {activeTab === 'all' && <aside className="border-r border-[#e5e5e5] pr-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#666]">Categories</h3>
            <button type="button" onClick={() => setActiveCategory('All products')} aria-pressed={activeCategory === 'All products'} className={`mb-2 flex min-h-10 w-full items-center justify-between border-b border-[#eee] text-left text-sm ${activeCategory === 'All products' ? 'font-semibold text-[#111111]' : 'text-[#555]'}`}>
              All products <span>{products.length}</span>
            </button>
            {categories.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`flex min-h-10 w-full items-center justify-between border-b border-[#eee] text-left text-sm ${activeCategory === category ? 'font-semibold text-[#111111]' : 'text-[#555]'}`}>
              <span>{category}</span><span className="text-xs">{products.filter((product) => product.category === category).length}</span>
            </button>)}
          </aside>}
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#555555]">{activeTab==='all'?`${sortedProducts.length ? (page-1)*pageSize+1 : 0}–${Math.min(page*pageSize,sortedProducts.length)} of ${sortedProducts.length}`:visibleProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}{activeTab === 'top' ? ' · top rated' : ''}</p>
              {activeTab === 'all' && <label className="flex items-center gap-2 text-xs text-[#666]">Sort
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort store products" className="border border-[#ddd] bg-white px-2 py-2 text-xs text-[#222]">
                  <option value="newest">Newest</option><option value="rating">Top rated</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
                </select>
              </label>}
            </div>
            {visibleProducts.length ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-[#555555]">{products.length ? 'No products match this selection.' : 'This partner store is getting its first products ready.'}</p>
            )}
            {activeTab==='all'&&sortedProducts.length>pageSize&&<nav aria-label="Store product pages" className="mt-8 flex items-center justify-center gap-4 text-xs"><button type="button" disabled={page===1} onClick={()=>setPage(value=>value-1)} className="min-h-10 rounded-full border border-[#cccccc] px-4 text-[#555555] disabled:opacity-40">Previous</button><span className="text-[#555555]">Page {page} of {Math.ceil(sortedProducts.length/pageSize)}</span><button type="button" disabled={page*pageSize>=sortedProducts.length} onClick={()=>setPage(value=>value+1)} className="min-h-10 rounded-full border border-[#cccccc] px-4 text-[#555555] disabled:opacity-40">Next</button></nav>}
          </div>
        </div>
      </section>
      <ReviewsPanel kind="store" id={store.id}/>
    </main>
  )
}

export default PartnerStorePage
