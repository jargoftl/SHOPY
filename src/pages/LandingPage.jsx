import UiverseSelect from '../components/UiverseSelect.jsx'
import StoreStats from '../components/StoreStats.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import StoreAccountMenu from '../components/StoreAccountMenu.jsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CATALOG_UPDATED } from '../lib/catalogEvents.js'
import { apiRequest } from '../lib/api.js'
import { useCart } from '../context/CartContext.jsx'
import SellerAccessModal from '../components/modals/SellerAccessModal.jsx'
import StoreOwnerCallout from '../components/store/StoreOwnerCallout.jsx'
import ProductCard from '../components/store/ProductCard.jsx'
import PromotedProducts from '../components/store/PromotedProducts.jsx'
import StoreFooter from '../components/store/StoreFooter.jsx'
import SiteName from '../components/SiteName.jsx'
import {
  ChevronDown,
  ChevronRight,
  ArrowUp,
  Languages,
  Menu,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react'

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
]

const heroSlides = [
  {
    category: 'Home Appliances',
    eyebrow: 'EVERYDAY HOME, REFRESHED',
    title: 'Make room for good living.',
    description: 'Useful finds for the kitchen, living room, and every corner in between.',
    image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=2200&q=90',
  },
  {
    category: 'Digital Products',
    eyebrow: 'SMARTER EVERYDAY FINDS',
    title: 'Useful tech. Better days.',
    description: 'Discover devices and accessories for work, play, and everything after.',
    image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=2200&q=90',
  },
  {
    category: 'Food & Beverage',
    eyebrow: 'GOOD THINGS FOR THE TABLE',
    title: 'Stock up on something lovely.',
    description: 'Explore pantry staples, drinks, snacks, and treats for sharing.',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=2200&q=90',
  },
  {
    category: 'Sports & Outdoors',
    eyebrow: 'GEAR UP AND GET OUT THERE',
    title: 'Find your next adventure.',
    description: 'Outdoor, fitness, and travel essentials for wherever you are headed.',
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=2200&q=90',
  },
]

const copy = {
  en: {
    promo: 'New season, new favorites. Explore the collection.',
    nav: ['Home', 'Category', 'Product', 'Discounts', 'Partnership', 'Sell with us'],
    heroEyebrow: 'EVERYDAY FINDS ACROSS EVERY CATEGORY',
    heroTitle: 'Good finds for every part of life.',
    heroDescription: 'Explore home, technology, food, fashion, outdoor gear, and more.',
    shopNow: 'Explore all products',
    categoryHeading: 'Shop by category',
    productHeading: 'Find your new favorite',
    productEyebrow: 'THE LATEST EDIT',
    allProducts: 'All products',
    search: 'Search products',
    bag: 'Bag',
    addToBag: 'Add to cart',
    added: 'Added',
    productNote: 'Designed for your every day',
    empty: 'No products found. Try another search.',
    discover: 'Discover the collection',
    sale: 'A little something extra',
    saleTitle: 'Good things are even better on sale.',
    saleAction: 'Explore the edit',
    categories: { Bags: 'Bags', Shoes: 'Shoes', Clothing: 'Clothing', Accessories: 'Accessories' },
  },
  zh: {
    promo: '新季上新，探索本季精选。',
    nav: ['首页', '分类', '商品', '优惠', '合作', '开始销售'],
    heroEyebrow: '让日常更特别',
    heroTitle: '换个角度，发现风格。',
    heroDescription: '精心挑选的单品，陪你度过每一天。',
    shopNow: '探索本季系列',
    categoryHeading: '按类别选购',
    productHeading: '发现你的新宠',
    productEyebrow: '最新精选',
    allProducts: '全部商品',
    search: '搜索商品',
    bag: '购物袋',
    addToBag: '加入购物车',
    added: '已加入',
    productNote: '为日常精心设计',
    empty: '没有找到商品，请尝试其他关键词。',
    discover: '探索系列',
    sale: '为你准备的小惊喜',
    saleTitle: '好物特惠，不容错过。',
    saleAction: '查看优惠',
    categories: { Bags: '包袋', Shoes: '鞋履', Clothing: '服装', Accessories: '配饰' },
  },
  es: {
    promo: 'Nueva temporada, nuevos favoritos. Descubre la colección.',
    nav: ['Inicio', 'Categorías', 'Productos', 'Ofertas', 'Colaboraciones', 'Vende con nosotros'],
    heroEyebrow: 'LO COTIDIANO, UN POCO MÁS ESPECIAL',
    heroTitle: 'Una nueva perspectiva.',
    heroDescription: 'Piezas elegidas con cuidado para cada momento.',
    shopNow: 'Ver la colección',
    categoryHeading: 'Comprar por categoría',
    productHeading: 'Encuentra tu nuevo favorito',
    productEyebrow: 'LO MÁS RECIENTE',
    allProducts: 'Todos los productos',
    search: 'Buscar productos',
    bag: 'Bolsa',
    addToBag: 'Añadir al carrito',
    added: 'Añadido',
    productNote: 'Diseñado para cada día',
    empty: 'No encontramos productos. Prueba otra búsqueda.',
    discover: 'Descubre la colección',
    sale: 'Un detalle especial',
    saleTitle: 'Las buenas cosas saben aún mejor de oferta.',
    saleAction: 'Ver ofertas',
    categories: { Bags: 'Bolsos', Shoes: 'Zapatos', Clothing: 'Ropa', Accessories: 'Accesorios' },
  },
  fr: {
    promo: 'Nouvelle saison, nouveaux favoris. Découvrez la collection.',
    nav: ['Accueil', 'Catégories', 'Produits', 'Promotions', 'Partenariat', 'Vendre avec nous'],
    heroEyebrow: 'LE QUOTIDIEN, EN UN PEU PLUS SPÉCIAL',
    heroTitle: 'Un nouveau regard.',
    heroDescription: 'Des pièces choisies avec soin pour chaque instant.',
    shopNow: 'Voir la collection',
    categoryHeading: 'Acheter par catégorie',
    productHeading: 'Votre prochain coup de cœur',
    productEyebrow: 'LA SÉLECTION DU MOMENT',
    allProducts: 'Tous les produits',
    search: 'Rechercher des produits',
    bag: 'Panier',
    addToBag: 'Ajouter au panier',
    added: 'Ajouté',
    productNote: 'Pensé pour tous les jours',
    empty: 'Aucun produit trouvé. Essayez une autre recherche.',
    discover: 'Découvrir la collection',
    sale: 'Une petite attention en plus',
    saleTitle: 'Les belles choses sont encore mieux en promotion.',
    saleAction: 'Voir la sélection',
    categories: { Bags: 'Sacs', Shoes: 'Chaussures', Clothing: 'Vêtements', Accessories: 'Accessoires' },
  },
  de: {
    promo: 'Neue Saison, neue Favoriten. Entdecke die Kollektion.',
    nav: ['Startseite', 'Kategorien', 'Produkte', 'Angebote', 'Partnerschaft', 'Mit uns verkaufen'],
    heroEyebrow: 'ALLTAG, EIN BISSCHEN BESONDERER',
    heroTitle: 'Ein neuer Blickwinkel.',
    heroDescription: 'Sorgfältig ausgewählte Stücke für jeden Moment.',
    shopNow: 'Kollektion entdecken',
    categoryHeading: 'Nach Kategorie shoppen',
    productHeading: 'Finde deinen neuen Favoriten',
    productEyebrow: 'NEU IM SORTIMENT',
    allProducts: 'Alle Produkte',
    search: 'Produkte suchen',
    bag: 'Tasche',
    addToBag: 'In den Warenkorb',
    added: 'Hinzugefügt',
    productNote: 'Für jeden Tag entworfen',
    empty: 'Keine Produkte gefunden. Versuche eine andere Suche.',
    discover: 'Kollektion entdecken',
    sale: 'Ein kleines Extra',
    saleTitle: 'Schöne Dinge sind im Angebot noch schöner.',
    saleAction: 'Angebote ansehen',
    categories: { Bags: 'Taschen', Shoes: 'Schuhe', Clothing: 'Kleidung', Accessories: 'Accessoires' },
  },
  ja: {
    promo: '新しい季節、新しいお気に入り。コレクションをご覧ください。',
    nav: ['ホーム', 'カテゴリー', '商品', 'セール', 'パートナーシップ', '販売を始める'],
    heroEyebrow: 'いつもの毎日を、少し特別に',
    heroTitle: '新しい視点で。',
    heroDescription: '毎日のさまざまなシーンに寄り添うアイテム。',
    shopNow: 'コレクションを見る',
    categoryHeading: 'カテゴリーから探す',
    productHeading: '新しいお気に入りを見つけよう',
    productEyebrow: '最新セレクション',
    allProducts: 'すべての商品',
    search: '商品を検索',
    bag: 'バッグ',
    addToBag: 'カートに追加',
    added: '追加しました',
    productNote: '毎日のためにデザイン',
    empty: '商品が見つかりません。別の言葉で検索してください。',
    discover: 'コレクションを見る',
    sale: 'ちょっと嬉しいお知らせ',
    saleTitle: '素敵なアイテムをお得に。',
    saleAction: 'セールを見る',
    categories: { Bags: 'バッグ', Shoes: 'シューズ', Clothing: 'ウェア', Accessories: 'アクセサリー' },
  },
}

const categoryTranslations = {
  zh: {
    Home: '家居', Electronics: '电子产品', 'Beauty & Personal Care': '美容与个护',
    'Food & Beverage': '食品与饮料', 'Sports & Outdoors': '运动与户外',
    'Books & Stationery': '图书与文具', 'Toys & Games': '玩具与游戏',
    'Pet Supplies': '宠物用品', 'Health & Wellness': '健康与保健',
    'Office Supplies': '办公用品', Automotive: '汽车用品',
  },
  es: {
    Home: 'Hogar', Electronics: 'Electrónica', 'Beauty & Personal Care': 'Belleza y cuidado personal',
    'Food & Beverage': 'Alimentación y bebidas', 'Sports & Outdoors': 'Deportes y aire libre',
    'Books & Stationery': 'Libros y papelería', 'Toys & Games': 'Juguetes y juegos',
    'Pet Supplies': 'Artículos para mascotas', 'Health & Wellness': 'Salud y bienestar',
    'Office Supplies': 'Material de oficina', Automotive: 'Automoción',
  },
  fr: {
    Home: 'Maison', Electronics: 'Électronique', 'Beauty & Personal Care': 'Beauté et soins',
    'Food & Beverage': 'Alimentation et boissons', 'Sports & Outdoors': 'Sport et plein air',
    'Books & Stationery': 'Livres et papeterie', 'Toys & Games': 'Jouets et jeux',
    'Pet Supplies': 'Articles pour animaux', 'Health & Wellness': 'Santé et bien-être',
    'Office Supplies': 'Fournitures de bureau', Automotive: 'Automobile',
  },
  de: {
    Home: 'Wohnen', Electronics: 'Elektronik', 'Beauty & Personal Care': 'Beauty & Pflege',
    'Food & Beverage': 'Essen & Getränke', 'Sports & Outdoors': 'Sport & Outdoor',
    'Books & Stationery': 'Bücher & Schreibwaren', 'Toys & Games': 'Spielzeug & Spiele',
    'Pet Supplies': 'Tierbedarf', 'Health & Wellness': 'Gesundheit & Wellness',
    'Office Supplies': 'Bürobedarf', Automotive: 'Autozubehör',
  },
  ja: {
    Home: 'ホーム・インテリア', Electronics: '家電・電子機器', 'Beauty & Personal Care': '美容・パーソナルケア',
    'Food & Beverage': '食品・飲料', 'Sports & Outdoors': 'スポーツ・アウトドア',
    'Books & Stationery': '本・文房具', 'Toys & Games': 'おもちゃ・ゲーム',
    'Pet Supplies': 'ペット用品', 'Health & Wellness': '健康・ウェルネス',
    'Office Supplies': 'オフィス用品', Automotive: 'カー用品',
  },
}

const LandingPage = () => {
  const { itemCount } = useCart()
  const [language, setLanguage] = useState('en')
  const [activeCategory, setActiveCategory] = useState('All')
  const [products, setProducts] = useState([])
  const [stores, setStores] = useState([])
  const [categories, setCategories] = useState([])
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sellerModalOpen, setSellerModalOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)

  const text = copy[language]
  const activeHero = heroSlides[activeHeroIndex]
  const categoryLabel = (category) => text.categories[category] || categoryTranslations[language]?.[category] || category
  const visibleProducts = products.filter((product) => {
    const categoryMatches = activeCategory === 'All' || product.category === activeCategory || product.category.startsWith(`${activeCategory} / `)
    const searchMatches = `${product.name} ${categoryLabel(product.category)}`
      .toLowerCase()
      .includes(search.toLowerCase())

    return categoryMatches && searchMatches
  })

  useEffect(() => {
    let active=true,loaded=false,request=0,lastStarted=0
    const load=async()=>{
      const sequence=++request;lastStarted=Date.now()
      try{
        const [productData,categoryData]=await Promise.all([apiRequest('/api/products',{background:true}),apiRequest('/api/categories',{background:true})])
        if(!active||sequence!==request)return
        setProducts(productData.products);setCategories(categoryData.categories);setLoadError('');loaded=true
      }catch(error){if(active&&!loaded)setLoadError(error.message)}
      finally{if(active)setIsLoading(false)}
    }
    const changed=event=>{if(event.type==='storage'&&event.key!==CATALOG_UPDATED)return;void load()}
    const focus=()=>{if(Date.now()-lastStarted>10000)void load()}
    void load()
    window.addEventListener(CATALOG_UPDATED,changed);window.addEventListener('storage',changed);window.addEventListener('focus',focus)
    return()=>{active=false;window.removeEventListener(CATALOG_UPDATED,changed);window.removeEventListener('storage',changed);window.removeEventListener('focus',focus)}
  }, [])

  useEffect(() => {
    let isCurrent = true
    apiRequest('/api/stores')
      .then(({ stores: storeData }) => {
        if (isCurrent) setStores(storeData)
      })
      .catch(() => {
        if (isCurrent) setStores([])
      })
    return () => { isCurrent = false }
  }, [])

  useEffect(() => {
    const updateScrollState = () => setShowScrollTop(window.scrollY > 500)
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveHeroIndex((currentIndex) => (currentIndex + 1) % heroSlides.length)
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const selectCategory = (category) => {
    setActiveCategory(category)
    setActiveMenu('')
    setMobileMenuOpen(false)
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div id="top" className="min-h-screen bg-[#f7f7f7] text-[#111111]">
      <div className="bg-[#111111] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-white sm:text-xs">
        {text.promo}
      </div>

      <header className="relative z-40 border-b border-[#e5e5e5] bg-white">
        <div
          className="relative mx-auto flex min-h-[76px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10"
          onMouseLeave={() => setActiveMenu('')}
        >
          <div className="flex min-w-[120px] items-center gap-3">
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="grid size-10 place-items-center lg:hidden"
            >
              {mobileMenuOpen ? <X size={24} strokeWidth={1.6} /> : <Menu size={24} strokeWidth={1.6} />}
            </button>
            <Link to="/" className="text-[29px] font-black leading-none tracking-[-0.08em] sm:text-[32px]">
              <SiteName logo />
            </Link>
          </div>

          <nav className="store-main-navigation hidden min-w-0 flex-1 items-center justify-center gap-4 px-3 lg:flex xl:gap-6" aria-label="Main navigation">
            {text.nav.map((label, index) => {
              const keys = ['Home', 'Category', 'Product', 'Discounts', 'Partnership', 'Seller']
              const key = keys[index]

              if (key === 'Home') {
                return <a key={key} href="#top" className="py-7 text-xs font-medium uppercase tracking-wide hover:text-[#111111]">{label}</a>
              }

              if (key === 'Seller') {
                return <button key={key} type="button" onClick={() => setSellerModalOpen(true)} className="py-7 text-xs font-medium uppercase tracking-wide hover:text-[#111111]">{label}</button>
              }

              if (key === 'Product') return <Link key={key} to="/products" className="py-7 text-xs font-medium uppercase tracking-wide hover:text-[#111111]">{label}</Link>
              if (key === 'Discounts') return <Link key={key} to="/discounts" className="py-7 text-xs font-medium uppercase tracking-wide hover:text-[#111111]">{label}</Link>

              return (
                <button
                  key={key}
                  type="button"
                  aria-expanded={activeMenu === key}
                  onMouseEnter={() => setActiveMenu(key)}
                  onFocus={() => setActiveMenu(key)}
                  onClick={() => setActiveMenu((menu) => (menu === key ? '' : key))}
                  className={`flex items-center gap-1 py-7 text-xs font-medium uppercase tracking-wide transition-colors hover:text-[#111111] ${activeMenu === key ? 'text-[#111111]' : ''}`}
                >
                  {label}<ChevronDown size={12} />
                </button>
              )
            })}
          </nav>

          <div className="flex min-w-[120px] items-center justify-end gap-2 sm:gap-4">
            <button
              type="button"
              aria-label="Search products"
              onClick={() => setSearchOpen((open) => !open)}
              className="grid size-10 place-items-center"
            >
              {searchOpen ? <X size={20} strokeWidth={1.6} /> : <Search size={20} strokeWidth={1.6} />}
            </button>
            <StoreAccountMenu />
            <label className="hidden items-center gap-1.5 sm:flex" aria-label="Choose language">
              <Languages size={17} strokeWidth={1.6} />
              <UiverseSelect
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="max-w-[112px] cursor-pointer appearance-none bg-transparent py-2 pr-1 text-xs outline-none"
              >
                {languages.map((item) => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}
              </UiverseSelect>
            </label>
            <Link to="/cart" aria-label={`${text.bag}, ${itemCount} items`} className="relative grid size-10 place-items-center">
              <ShoppingCart size={20} strokeWidth={1.6} />
              <span className="absolute right-0 top-1 text-[10px]">{itemCount}</span>
            </Link>
          </div>

          {activeMenu && (
            <div className="absolute left-0 right-0 top-full hidden border-t border-[#eee] bg-white shadow-[0_16px_30px_rgba(0,0,0,0.08)] lg:block">
              <div className="mx-auto grid max-w-[1440px] grid-cols-[1fr_1fr] gap-12 px-10 py-8">
                <div>
                  <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#777]">{text.discover}</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    {categories.map((category) => (
                      <button key={category} type="button" onClick={() => selectCategory(category)} className="flex items-center justify-between border-b border-[#eee] pb-3 text-left text-sm hover:text-[#111111]">
                        {categoryLabel(category)}<ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {products.slice(0, 2).map((product) => (
                    <button key={product.id} type="button" onClick={() => selectCategory(product.category)} className="group flex items-center gap-4 text-left">
                      <img src={product.imageUrl} alt="" className="size-[86px] object-cover" />
                      <span className="text-sm group-hover:underline">{product.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {searchOpen && (
            <form onSubmit={(event) => { event.preventDefault(); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }) }} className="absolute left-0 right-0 top-full border-t border-[#eee] bg-white px-5 py-4 shadow-md sm:px-8">
              <label className="mx-auto flex max-w-[700px] items-center gap-3 border-b border-[#aaa] pb-2">
                <Search size={18} />
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="w-full bg-transparent py-2 text-sm outline-none" />
              </label>
            </form>
          )}
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white px-5 pb-10 pt-5 lg:hidden">
          <div className="flex items-center justify-between border-b border-[#e7e7e7] pb-5">
            <Link to="/" onClick={() => setMobileMenuOpen(false)} className="text-[30px] font-black leading-none tracking-[-0.08em]"><SiteName logo /></Link>
            <button type="button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} className="grid size-11 place-items-center"><X size={25} strokeWidth={1.5} /></button>
          </div>
          <nav className="pt-4" aria-label="Mobile navigation">
            {text.nav.map((label, index) => {
              const keys = ['Home', 'Category', 'Product', 'Discounts', 'Partnership', 'Seller']
              const key = keys[index]

              if (key === 'Home') return <a key={key} href="#top" onClick={() => setMobileMenuOpen(false)} className="flex min-h-14 items-center justify-between border-b border-[#e7e7e7] text-sm font-medium uppercase">{label}<ChevronRight size={18} /></a>
              if (key === 'Seller') return <button key={key} type="button" onClick={() => { setMobileMenuOpen(false); setSellerModalOpen(true) }} className="flex min-h-14 w-full items-center justify-between border-b border-[#e7e7e7] text-sm font-medium uppercase">{label}<ChevronRight size={18} /></button>
              if (key === 'Product') return <Link key={key} to="/products" onClick={() => setMobileMenuOpen(false)} className="flex min-h-14 items-center justify-between border-b border-[#e7e7e7] text-sm font-medium uppercase">{label}<ChevronRight size={18} /></Link>
              if (key === 'Discounts') return <Link key={key} to="/discounts" onClick={() => setMobileMenuOpen(false)} className="flex min-h-14 items-center justify-between border-b border-[#e7e7e7] text-sm font-medium uppercase">{label}<ChevronRight size={18} /></Link>

              return (
                <div key={key} className="border-b border-[#e7e7e7]">
                  <button type="button" onClick={() => setActiveMenu((menu) => (menu === key ? '' : key))} className="flex min-h-14 w-full items-center justify-between text-sm font-medium uppercase">
                    {label}<ChevronDown size={16} className={`transition-transform ${activeMenu === key ? 'rotate-180' : ''}`} />
                  </button>
                  {activeMenu === key && (
                    <div className="grid grid-cols-2 gap-3 pb-4">
                      {categories.map((category) => (
                        <button key={category} type="button" onClick={() => selectCategory(category)} className="text-left text-sm text-[#555]">{categoryLabel(category)}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <div className="mt-7 flex items-center gap-2 border-t border-[#e7e7e7] pt-5">
            <Languages size={18} />
            <UiverseSelect value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Choose language" className="w-full bg-transparent py-2 text-sm outline-none">
              {languages.map((item) => <option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}
            </UiverseSelect>
          </div>
        </div>
      )}

      <main>
        <section className="relative isolate flex min-h-[480px] items-end overflow-hidden bg-[#111111] sm:min-h-[560px] lg:min-h-[620px]">
          <AnimatePresence mode="wait">
            <motion.img
              key={activeHero.image}
              src={activeHero.image}
              alt={`${activeHero.category} featured collection`}
              initial={{ opacity: 0, scale: 1.035 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.015 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute inset-0 -z-20 size-full object-cover object-center"
            />
          </AnimatePresence>
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#111111]/80 via-[#111111]/35 to-transparent" />
          <div className="mx-auto w-full max-w-[1440px] px-6 pb-12 text-white sm:px-10 sm:pb-16 lg:px-16 lg:pb-20">
            <AnimatePresence mode="wait">
              <motion.div key={activeHeroIndex} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#e5e5e5] sm:text-xs">{activeHero.eyebrow}</p>
                <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">{activeHero.title}</h1>
                <p className="mt-4 max-w-md text-sm text-white/90 sm:text-base">{activeHero.description}</p>
                <Link to="/products" className="mt-7 inline-flex items-center gap-3 rounded-md bg-[#cccccc] px-5 py-3 text-xs font-bold uppercase tracking-wide text-[#111111] transition-colors hover:bg-white">
                  {text.shopNow}<ChevronRight size={15} />
                </Link>
              </motion.div>
            </AnimatePresence>
            <div className="mt-7 flex items-center gap-2" aria-label="Featured categories">
              {heroSlides.map((slide, index) => (
                <button key={slide.category} type="button" aria-label={`Show ${slide.category} banner`} aria-pressed={activeHeroIndex === index} onClick={() => setActiveHeroIndex(index)} className={`h-1.5 rounded-full transition-all ${activeHeroIndex === index ? 'w-8 bg-[#cccccc]' : 'w-3 bg-white/60 hover:bg-white'}`} />
              ))}
            </div>
          </div>
        </section>

        <section className="grid min-h-[260px] grid-cols-1 sm:grid-cols-2">
          <div className="relative flex min-h-[300px] items-end overflow-hidden bg-[#111111] sm:min-h-[390px]">
            <img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=85" alt="A bright and comfortable home interior" loading="lazy" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="relative p-6 text-white sm:p-9"><p className="text-[10px] font-semibold uppercase tracking-[0.18em]">{text.sale}</p><h2 className="mt-2 max-w-md text-3xl font-semibold sm:text-4xl">{text.saleTitle}</h2><a href="#products" className="mt-5 inline-block text-xs font-semibold uppercase underline underline-offset-4">{text.saleAction}</a></div>
          </div>
          <div className="relative flex min-h-[300px] items-end overflow-hidden bg-[#111111] sm:min-h-[390px]">
            <img src="https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=85" alt="A selection of consumer electronics" loading="lazy" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            <div className="relative p-6 text-white sm:p-9"><p className="text-[10px] font-semibold uppercase tracking-[0.18em]">{text.productEyebrow}</p><a href="#products" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold uppercase underline underline-offset-4">{text.discover}<ChevronRight size={15} /></a></div>
          </div>
        </section>

        {stores.length > 0 && <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-7 lg:px-10">
          <div className="mb-5 flex items-end justify-between gap-4 border-b border-[#e5e5e5] pb-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#555555]">Independent sellers</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Discover partner stores</h2></div>
            <Link to="/products" className="shrink-0 text-xs font-semibold underline underline-offset-4">Explore marketplace</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {stores.slice(0, 4).map((store) => <Link key={store.id} to={`/stores/${store.id}`} className="group overflow-hidden border border-[#e5e5e5] bg-white transition-colors hover:border-[#111111]">
              <img src={store.imageUrl || store.logoUrl || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80'} alt={store.storeName} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
              <div className="p-3 sm:p-4"><h3 className="text-sm font-semibold">{store.storeName}</h3><div className="mt-2 border-t border-[#e5e5e5] pt-2 text-[#444]"><StoreStats store={store}/></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#111111]">{store.storeDescription}</p></div>
            </Link>)}
          </div>
        </section>}

        <StoreOwnerCallout />

        <section id="products" className="mx-auto max-w-[1440px] scroll-mt-8 px-4 py-14 sm:px-7 sm:py-20 lg:px-10">
          <div className="mb-7 flex flex-col justify-between gap-5 border-b border-[#e5e5e5] pb-5 sm:flex-row sm:items-end">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]">{text.productEyebrow}</p>
                <h2 className="text-3xl font-semibold sm:text-4xl">{activeCategory === 'All' ? text.productHeading : categoryLabel(activeCategory)}</h2>
              </div>
              <Link to="/products" className="shrink-0 text-xs font-semibold underline underline-offset-4">View all</Link>
            </div>
            <label className="flex w-full items-center gap-3 border-b border-[#aaa] pb-2 sm:max-w-[260px]">
              <Search size={17} strokeWidth={1.6} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[#777]" />
            </label>
          </div>

          {isLoading ? (
            <ContentPlaceholder/>
          ) : loadError ? (
            <p role="status" className="py-16 text-center text-sm text-[#8a3c2d]">{loadError}</p>
          ) : visibleProducts.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4">
                  {visibleProducts.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-[#666]">{text.empty}</p>
          )}
        </section>
      </main>

      <PromotedProducts />
      <StoreFooter language={language} setLanguage={setLanguage} languages={languages} text={text} />
      {showScrollTop && <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Scroll to top" title="Scroll to top" className="fixed bottom-24 right-4 z-30 grid size-11 place-items-center rounded-full bg-[#111111] text-white shadow-lg transition-colors hover:bg-[#cccccc] hover:text-[#111111] md:bottom-6 md:right-7"><ArrowUp size={19} /></button>}
      <SellerAccessModal isOpen={sellerModalOpen} onClose={() => setSellerModalOpen(false)} />
    </div>
  )
}

export default LandingPage