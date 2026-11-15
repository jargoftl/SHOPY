import ReviewsPanel from '../components/ReviewsPanel.jsx'
import SiteName from '../components/SiteName.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Eye, Heart, ShoppingCart, Star, Users } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { apiRequest } from '../lib/api.js'
import ProductCard from '../components/store/ProductCard.jsx'

const colorSwatches = {
  black: '#171717', white: '#ffffff', cream: '#e5e5e5', red: '#c83c35', blue: '#555555',
  'sky blue': '#777777', green: '#111111', moss: '#555555', pink: '#777777', brown: '#111111',
  gray: '#555555', grey: '#555555', yellow: '#cccccc', orange: '#555555', navy: '#111111',
}

const ProductDetailPage = () => {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [product, setProduct] = useState(null)
  const [store, setStore] = useState(null)
  const [relatedProducts, setRelatedProducts] = useState([])
  const [activeImage, setActiveImage] = useState(0)
  const [selectedColor, setSelectedColor] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [followMessage, setFollowMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    apiRequest(`/api/buyer/favorites/${productId}`)
      .then(({ isFavorite: favorite }) => { if (isCurrent) setIsFavorite(favorite) })
      .catch((error) => { if (isCurrent && error.status !== 401 && error.status !== 403) setFollowMessage(error.message) })
    apiRequest(`/api/products/${productId}`)
      .then(({ product: productData, store: storeData, relatedProducts: related }) => {
        if (!isCurrent) return
        setProduct(productData)
        setStore(storeData)
        setRelatedProducts(related)
        setSelectedColor('')
        setSelectedSize('')
        setActiveImage(0)
        setLoadError('')
        if (storeData) {
          apiRequest(`/api/stores/${storeData.id}/follow`)
            .then(({ isFollowing: following }) => { if (isCurrent) setIsFollowing(following) })
            .catch(() => {})
        }
      })
      .catch((error) => { if (isCurrent) setLoadError(error.message) })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [productId])

  const toggleFavorite = async () => {
    try {
      await apiRequest(`/api/buyer/favorites/${productId}`, { method: isFavorite ? 'DELETE' : 'PUT' })
      setIsFavorite(!isFavorite)
      setFollowMessage(isFavorite ? 'Removed from favorites.' : 'Added to favorites.')
    } catch (error) {
      setFollowMessage(error.status === 401 ? 'Sign in as a buyer to save favorites.' : error.message)
    }
  }
  const images = product?.imageUrls?.length ? product.imageUrls : product ? [product.imageUrl] : []

  const changeFollow = async () => {
    if (!store) return
    setFollowMessage('')
    try {
      const result = await apiRequest(`/api/stores/${store.id}/follow`, { method: 'POST' })
      setIsFollowing(result.isFollowing)
      setStore((current) => current ? { ...current, followerCount: result.followerCount } : current)
    } catch (error) {
      if (error.message.includes('log in') || error.message.includes('session')) {
        setFollowMessage('Sign in to follow this store.')
      } else {
        setFollowMessage(error.message)
      }
    }
  }

  const addSelectedToCart = () => {
    if (product.colors.length && !selectedColor) {
      setFollowMessage('Choose a color before adding this item.')
      return false
    }
    if (product.sizes.length && !selectedSize) {
      setFollowMessage('Choose a size before adding this item.')
      return false
    }
    addItem({ ...product, selectedColor, selectedSize })
    setFollowMessage('')
    return true
  }

  const purchaseNow = () => {
    if (addSelectedToCart()) navigate('/billing')
  }

  if (isLoading) return <main className="mx-auto max-w-5xl px-5 py-20 text-sm text-[#666]">Loading product…</main>
  if (loadError || !product) {
    return <main className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-3xl font-semibold">Product unavailable</h1><p className="mt-3 text-sm text-[#555555]">{loadError || 'This product may have been removed.'}</p><Link to="/products" className="mt-7 inline-flex border border-[#cccccc] px-4 py-3 text-sm">Browse products</Link></main>
  }

  const isDiscounted = Number.isFinite(product.compareAtPrice) && product.compareAtPrice > product.price

  return (
    <div className="min-h-screen bg-white pb-24 text-[#171717] md:pb-0">
      <header className="border-b border-[#e9e9e9] bg-white">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName /><span className="ml-1 text-sm">▰</span></Link>
          <Link to="/products" className="text-xs underline underline-offset-4">All products</Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
        <nav className="mb-5 text-xs text-[#777]" aria-label="Breadcrumb"><Link to="/products" className="hover:underline">Products</Link><span className="px-2">/</span><span>{product.category}</span></nav>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,0.95fr)_minmax(340px,1.35fr)_240px] xl:gap-8">
          <section aria-label="Product images">
            <div className="group relative aspect-square overflow-hidden border border-[#eee] bg-[#fafafa]">
              <img src={images[activeImage]} alt={`${product.name}, image ${activeImage + 1}`} className="size-full object-contain" />
              {images.length > 1 && <>
                <button type="button" onClick={() => setActiveImage((activeImage - 1 + images.length) % images.length)} aria-label="Previous product image" className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center bg-white/90 shadow-sm"><ChevronLeft size={20} /></button>
                <button type="button" onClick={() => setActiveImage((activeImage + 1) % images.length)} aria-label="Next product image" className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center bg-white/90 shadow-sm"><ChevronRight size={20} /></button>
                <span className="absolute bottom-3 right-3 bg-white/90 px-2 py-1 text-[10px]">{activeImage + 1} / {images.length}</span>
              </>}
            </div>
            {images.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2">
              {images.map((image, index) => <button key={`${image}-${index}`} type="button" onClick={() => setActiveImage(index)} aria-label={`View product image ${index + 1}`} aria-pressed={activeImage === index} className={`aspect-square overflow-hidden border ${activeImage === index ? 'border-black' : 'border-[#e7e7e7]'}`}><img src={image} alt="" className="size-full object-cover" /></button>)}
            </div>}
          </section>

          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#111111]">{product.category}</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{product.name}</h1><p className="mt-1 font-mono text-xs opacity-60">#{product.publicId}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#eee] pb-4">
              <div className="flex items-center gap-1" aria-label={`${product.rating.toFixed(1)} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} className={index < Math.round(product.rating) ? 'fill-[#777777] text-[#777777]' : 'text-[#aaa]'} />)}
              </div>
              <span className="text-xs text-[#666]">{product.rating > 0 ? `${product.rating.toFixed(1)} rating` : 'New product'}</span><a href="#reviews" className="inline-flex min-h-11 items-center px-2 text-xs underline">Rate & review</a>
              <button type="button" onClick={toggleFavorite} aria-pressed={isFavorite} aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'} className="ml-auto inline-flex items-center gap-1 text-xs text-[#555]"><Heart size={16} className={isFavorite ? 'fill-current' : ''} /> {isFavorite ? 'Favorited' : 'Favorite'}</button>
            </div>

            <div className="flex items-baseline gap-3 border-b border-[#eee] py-5">
              {isDiscounted && <span className="text-xs text-[#8a8a8a]">Retail price</span>}
              {isDiscounted && <span className="text-sm text-[#888] line-through">${product.compareAtPrice.toFixed(2)}</span>}
              <span className="text-2xl font-semibold text-[#555555]">${product.price.toFixed(2)}</span>
              {isDiscounted && <span className="text-xs font-semibold text-[#111111]">Save {Math.round((1 - product.price / product.compareAtPrice) * 100)}%</span>}
            </div>

            <p className="py-5 text-sm leading-6 text-[#555]">{product.description || 'Details from the partner seller are coming soon.'}</p>
            {product.sellerReportedStock != null && <p className="mb-4 rounded-lg bg-[#f7f7f7] px-3 py-2 text-xs text-[#111111]">{product.sellerReportedStock === 0 ? 'Seller-reported stock: 0.' : product.sellerReportedStock <= 5 ? `Seller-reported: few left (${product.sellerReportedStock}).` : `Seller-reported stock: ${product.sellerReportedStock}.`} This count is manually maintained and may not be current; it does not limit orders.</p>}

            {product.colors.length > 0 && <fieldset className="border-t border-[#eee] py-4">
              <legend className="mb-3 text-xs font-medium">Color{selectedColor ? `: ${selectedColor}` : ''}</legend>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((color) => <button key={color} type="button" onClick={() => setSelectedColor(color)} aria-pressed={selectedColor === color} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${selectedColor === color ? 'border-black ring-1 ring-black' : 'border-[#ccc]'}`}><span aria-hidden="true" className="size-4 rounded-full border border-[#aaa]" style={{ backgroundColor: colorSwatches[color.toLowerCase()] || '#cccccc' }} />{color}</button>)}
              </div>
            </fieldset>}

            {product.sizes.length > 0 && <fieldset className="border-t border-[#eee] py-4">
              <legend className="mb-3 text-xs font-medium">Size{selectedSize ? `: ${selectedSize}` : ''}</legend>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => <button key={size} type="button" onClick={() => setSelectedSize(size)} aria-pressed={selectedSize === size} className={`min-w-11 border px-3 py-2 text-xs ${selectedSize === size ? 'border-black bg-black text-white' : 'border-[#ddd] hover:border-black'}`}>{size}</button>)}
              </div>
            </fieldset>}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" onClick={addSelectedToCart} className="cart-add-button"><ShoppingCart size={16} /> Add to cart</button>
              <button type="button" onClick={purchaseNow} className="flex min-h-12 items-center justify-center gap-2 bg-[#111111] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#cccccc] hover:text-[#111111] sm:text-sm">Purchase now</button>
            </div>
            {followMessage && <p role="status" className="mt-3 text-xs text-[#555]">{followMessage} {followMessage.includes('Sign in') && <Link to="/login" className="font-semibold underline">Log in</Link>}</p>}
          </section>

          <aside className="border border-[#e5e5e5] bg-white p-4 sm:p-5">
            {store ? <>
              <div className="flex items-center gap-3 border-b border-[#eee] pb-4">
                {store.logoUrl ? <img src={store.logoUrl} alt="" className="size-12 rounded-full object-cover" /> : <span className="grid size-12 place-items-center rounded-full bg-[#f7f7f7] text-lg font-semibold text-[#111111]">{store.storeName.slice(0, 1)}</span>}
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{store.storeName}</p><p className="mt-1 truncate text-[10px] text-[#777]">{store.ownerName}</p></div>
              </div>
              <dl className="grid grid-cols-2 divide-x divide-y divide-[#eee] py-3 text-center">
                <div className="px-2 py-3"><dt className="text-[10px] text-[#777]">All products</dt><dd className="mt-1 text-sm font-semibold">{store.productCount}</dd></div>
                <div className="px-2 py-3"><dt className="inline-flex items-center gap-1 text-[10px] text-[#777]"><Users size={12} /> Followers</dt><dd className="mt-1 text-sm font-semibold">{Number(store.followerCount || 0).toLocaleString()}</dd></div>
                <div className="col-span-2 px-2 py-3"><dt className="inline-flex items-center gap-1 text-[10px] text-[#777]"><Eye size={12} /> Store visits</dt><dd className="mt-1 text-sm font-semibold">{Number(store.visitorCount || 0).toLocaleString()}</dd></div>
              </dl>
              <button type="button" onClick={changeFollow} aria-pressed={isFollowing} className={`mb-2 flex min-h-10 w-full items-center justify-center gap-2 border px-3 text-xs font-semibold ${isFollowing ? 'border-[#111111] bg-[#f7f7f7] text-[#111111]' : 'border-[#bbb] hover:border-black'}`}><Heart size={15} className={isFollowing ? 'fill-[#111111]' : ''} />{isFollowing ? 'Following · Unfollow' : 'Follow store'}</button>
              <Link to={`/stores/${store.id}`} className="flex min-h-10 w-full items-center justify-center border border-[#bbb] px-3 text-xs font-semibold hover:border-black">Visit store</Link>
            </> : <p className="text-sm text-[#777]">Store profile is unavailable.</p>}
          </aside>
        </div>
        {relatedProducts.length > 0 && <section aria-labelledby="related-products-heading" className="mt-14 border-t border-[#eee] pt-8"><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.16em] text-[#111111]">Discover more</p><h2 id="related-products-heading" className="mt-2 text-2xl font-semibold">You may also like</h2><p className="mt-2 text-sm text-[#555555]">More products in {product.category.split(' / ')[0]}.</p></div><Link to="/products" className="text-sm underline">Browse all</Link></div><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
        <ReviewsPanel kind="product" id={product.id}/>
    </main>
    </div>
  )
}

export default ProductDetailPage
