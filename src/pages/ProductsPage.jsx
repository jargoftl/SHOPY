import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Menu, Search, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { catalogTaxonomy } from '../data/catalogTaxonomy.js'
import ProductCard from '../components/store/ProductCard.jsx'
import SiteName from '../components/SiteName.jsx'

const ProductsPage = () => {
  const [products, setProducts] = useState([])
  const [apiCategories, setApiCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('All products')
  const [selectedItem, setSelectedItem] = useState('')
  const [expandedCategory, setExpandedCategory] = useState('')
  const [pinnedCategory, setPinnedCategory] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    Promise.all([apiRequest('/api/products'), apiRequest('/api/categories')])
      .then(([productData, categoryData]) => {
        if (!isCurrent) return
        setProducts(productData.products)
        setApiCategories(categoryData.categories)
      })
      .catch((error) => {
        if (isCurrent) setLoadError(error.message)
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [])

  const allCategories = useMemo(() => {
    const knownNames = new Set(catalogTaxonomy.map((category) => category.name))
    const seedOnlyCategories = new Set(['Accessories', 'Automotive', 'Bags', 'Beauty & Personal Care', 'Books & Stationery', 'Clothing', 'Electronics', 'Health & Wellness', 'Home', 'Office Supplies', 'Pet Supplies', 'Shoes', 'Toys & Games'])
    return [
      ...catalogTaxonomy,
      ...apiCategories.filter((name) => !knownNames.has(name) && !seedOnlyCategories.has(name) && !name.includes(' / ')).map((name) => ({ name, items: [] })),
    ]
  }, [apiCategories])

  const visibleProducts = useMemo(() => {
    const filteredProducts = products.filter((product) => {
      const matchesCategory = selectedCategory === 'All products'
        || product.category === selectedCategory
        || product.category.startsWith(`${selectedCategory} / `)
      const query = search.trim().toLowerCase()
      const matchesSearch = !query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query)
      const matchesItem = !selectedItem || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(selectedItem.toLowerCase())
      return matchesCategory && matchesSearch && matchesItem
    })

    return filteredProducts.sort((first, second) => {
      if (sortBy === 'price-low') return first.price - second.price
      if (sortBy === 'price-high') return second.price - first.price
      if (sortBy === 'discount') {
        const firstDiscount = first.compareAtPrice ? 1 - first.price / first.compareAtPrice : 0
        const secondDiscount = second.compareAtPrice ? 1 - second.price / second.compareAtPrice : 0
        return secondDiscount - firstDiscount
      }
      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
    })
  }, [products, search, selectedCategory, selectedItem, sortBy])

  const chooseCategory = (categoryName) => {
    setSelectedCategory(categoryName)
    setSelectedItem('')
    setMobileCategoriesOpen(false)
    setExpandedCategory('')
    setPinnedCategory('')
  }

  const chooseItem = (categoryName, itemName) => {
    setSelectedCategory(categoryName)
    setSelectedItem(itemName)
    setSearch('')
    setMobileCategoriesOpen(false)
  }

  const categoryList = (
    <>
      <button type="button" onClick={() => chooseCategory('All products')} aria-pressed={selectedCategory === 'All products'} className={`mb-3 w-full border-b border-[#e5e5e5] py-3 text-left text-sm ${selectedCategory === 'All products' ? 'font-semibold' : 'text-[#555]'}`}>
        All Products
      </button>
      {allCategories.map((category) => (
        <section
          key={category.name}
          className="border-b border-[#ededed] py-2"
          onMouseEnter={() => setExpandedCategory(category.name)}
          onMouseLeave={() => setExpandedCategory(pinnedCategory === category.name ? category.name : '')}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedCategory(category.name)
              setSelectedItem('')
              setMobileCategoriesOpen(false)
              const nextCategory = pinnedCategory === category.name ? '' : category.name
              setPinnedCategory(nextCategory)
              setExpandedCategory(nextCategory)
            }}
            onFocus={() => setExpandedCategory(category.name)}
            aria-expanded={expandedCategory === category.name}
            aria-pressed={selectedCategory === category.name}
            className={`flex min-h-9 w-full items-center justify-between gap-2 text-left text-sm ${selectedCategory === category.name ? 'font-semibold text-[#1f5a37]' : 'text-[#333]'}`}
          >
            <span>{category.name}</span>
            <ChevronRight size={15} className={`shrink-0 text-[#777] transition-transform ${expandedCategory === category.name ? 'rotate-90' : ''}`} />
          </button>
          {expandedCategory === category.name && category.items.length > 0 && (
            <div className="grid grid-cols-1 gap-1 pb-2 pl-3">
              {category.items.map((item) => (
                <button key={item} type="button" onClick={() => chooseItem(category.name, item)} className={`py-1.5 text-left text-xs ${selectedItem === item ? 'font-semibold text-[#1f5a37]' : 'text-[#666] hover:text-black'}`}>
                  {item}
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  )

  return (
    <div className="min-h-screen bg-white pb-24 text-[#171717] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-[#e9e9e9] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName /><span className="ml-1 text-sm">▰</span></Link>
          </div>
          <label className="flex w-full max-w-[420px] items-center gap-2 border border-[#dedede] px-3 py-2">
            <Search size={16} className="shrink-0 text-[#777]" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedItem('') }} placeholder="Search products and categories" className="min-w-0 flex-1 text-xs outline-none" />
          </label>
          <Link to="/cart" className="hidden text-xs font-medium underline underline-offset-4 sm:block">Cart</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] overflow-y-auto border-r border-[#ededed] px-5 py-5 lg:block">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#777]">Categories</h2>
          {categoryList}
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-8">
          <div className="mb-6 flex items-end justify-between border-b border-[#ececec] pb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a5c46]">Catalog</p>
              <div className="mt-1 flex items-center gap-2">
                <button type="button" onClick={() => setMobileCategoriesOpen(true)} aria-label="Open product categories" className="grid size-9 place-items-center border border-[#dedede] lg:hidden"><Menu size={18} /></button>
                <h2 className="text-2xl font-semibold sm:text-3xl">{selectedItem || selectedCategory}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-[#777]">{visibleProducts.length} items</p>
              <label className="flex items-center gap-2 text-[10px] text-[#777] sm:text-xs">Sort
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort products" className="border border-[#ddd] bg-white px-2 py-2 text-xs text-[#222]">
                  <option value="newest">Newest</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="discount">Best discount</option>
                </select>
              </label>
            </div>
          </div>

          {isLoading ? <p className="py-16 text-center text-sm text-[#777]">Loading catalog…</p> : loadError ? <p role="alert" className="py-16 text-center text-sm text-[#a33]">{loadError}</p> : visibleProducts.length ? (
            <motion.div layout className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-base font-medium">No products match this selection yet.</p>
              <p className="mt-2 text-sm text-[#777]">Try another category or search term.</p>
              <button type="button" onClick={() => { setSelectedCategory('All products'); setSelectedItem(''); setSearch('') }} className="mt-5 border border-black px-4 py-2 text-xs font-semibold">Clear filters</button>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {mobileCategoriesOpen && (
          <motion.div className="fixed inset-0 z-50 bg-black/45 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileCategoriesOpen(false) }}>
            <motion.aside className="absolute inset-y-0 left-0 w-[min(88vw,360px)] overflow-y-auto bg-white px-5 pb-10 pt-5" initial={{ x: -40 }} animate={{ x: 0 }} exit={{ x: -40 }} transition={{ duration: 0.18 }}>
              <div className="mb-5 flex items-center justify-between border-b border-[#e5e5e5] pb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide">Product categories</h2>
                <button type="button" aria-label="Close categories" onClick={() => setMobileCategoriesOpen(false)} className="grid size-10 place-items-center"><X size={20} /></button>
              </div>
              {categoryList}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProductsPage
