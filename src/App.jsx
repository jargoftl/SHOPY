import {apiRequest} from './lib/api.js'
import SellerAccountPage from './pages/SellerAccountPage.jsx'
import SellerBottomNav from './components/SellerBottomNav.jsx'
import {ShoppingCart} from 'lucide-react'
const SuperAdminPage=lazy(()=>loadPage('SuperAdminPage'))
import {loadPage,preloadLink} from './lib/pagePreload.js'
import ContentPlaceholder from './components/ContentPlaceholder.jsx'
const SellerFinancePage=lazy(()=>loadPage('SellerFinancePage'))
import {lazy,Suspense,useEffect,useState} from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { CartProvider } from './context/CartContext.jsx'
import MobileBottomNav from './components/store/MobileBottomNav.jsx'
import Login from './pages/logings/Login.jsx'
import LandingPage from './pages/LandingPage.jsx'
const AdminPage=lazy(()=>loadPage('AdminPage'))
import Register from './pages/logings/Register.jsx'
const SellerPage=lazy(()=>loadPage('SellerPage'))
import SellerLogin from './pages/logings/SellerLogin.jsx'
import SellerRegister from './pages/logings/SellerRegister.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import SellerApplicationPage from './pages/SellerApplicationPage.jsx'
const SellerMarketingPage=lazy(()=>loadPage('SellerMarketingPage'))
import CartPage from './pages/CartPage.jsx'
import BillingPage from './pages/BillingPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import DiscountsPage from './pages/DiscountsPage.jsx'
import PartnerStorePage from './pages/PartnerStorePage.jsx'
const MessageCenterPage=lazy(()=>loadPage('MessageCenterPage'))
import ProductDetailPage from './pages/ProductDetailPage.jsx'
const SellerDashboardPage=lazy(()=>loadPage('SellerDashboardPage'))
const AdminSellerMetricsPage=lazy(()=>loadPage('AdminSellerMetricsPage'))
const BuyerProfilePage=lazy(()=>loadPage('BuyerProfilePage'))
import ForgotPassword from './pages/logings/ForgotPassword.jsx'
import ResetPassword from './pages/logings/ResetPassword.jsx'
const AdminUserDetailsPage=lazy(()=>loadPage('AdminUserDetailsPage'))
import PurchasePage from './pages/PurchasePage.jsx'
import MyPurchasesPage from './pages/MyPurchasesPage.jsx'
import SellerOrdersPage from './pages/SellerOrdersPage.jsx'
import SellerManagementPage from './pages/SellerManagementPage.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import CartToast from './components/CartToast.jsx'
import OrderNotifications from './components/OrderNotifications.jsx'

const categories = ['Everything', 'Home', 'Wear', 'Objects', 'Outdoors']

const products = [
  {
    id: 1,
    name: 'Sunday Ceramic Set',
    category: 'Home',
    price: 42,
    note: 'Small-batch studio pottery',
    image:
      'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=900&q=85',
    color: 'bg-[#e5e5e5]',
  },
  {
    id: 2,
    name: 'Everyday Canvas Tote',
    category: 'Wear',
    price: 28,
    note: 'Made for the long way home',
    image:
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85',
    color: 'bg-[#e5e5e5]',
  },
  {
    id: 3,
    name: 'Field Notes Journal',
    category: 'Objects',
    price: 18,
    note: 'A little room for big ideas',
    image:
      'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85',
    color: 'bg-[#e5e5e5]',
  },
  {
    id: 4,
    name: 'Weekend Bottle',
    category: 'Outdoors',
    price: 34,
    note: 'Keeps the good stuff cold',
    image:
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',
    color: 'bg-[#e5e5e5]',
  },
]

function Storefront() {
  const [category, setCategory] = useState('Everything')
  const [search, setSearch] = useState('')
  const [bagCount, setBagCount] = useState(0)

  const visibleProducts = products.filter((product) => {
    const matchesCategory =
      category === 'Everything' || product.category === category
    const matchesSearch = `${product.name} ${product.category}`
      .toLowerCase()
      .includes(search.toLowerCase())

    return matchesCategory && matchesSearch
  })

  return (
    <div className="min-h-screen">
      <div className="bg-[#111111] px-4 py-2 text-center text-xs font-semibold tracking-[0.12em] text-white">
        GOOD FINDS, FAIR PRICES. FREE SHIPPING OVER $75.
      </div>

      <header className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-5 py-5 md:px-10">
        <a href="#top" className="font-[Fraunces] text-2xl font-semibold tracking-tight">
          goodthings<span className="text-[#e76b45]">.</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          <a className="transition-colors hover:text-[#e76b45]" href="#shop">Shop all</a>
          <a className="transition-colors hover:text-[#e76b45]" href="#shop">New finds</a>
          <a className="transition-colors hover:text-[#e76b45]" href="#about">Our kind of good</a>
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 text-sm sm:flex">
            <Link to="/login" className="hover:text-[#e76b45]">Log in</Link>
            <Link to="/register" className="hover:text-[#e76b45]">Register</Link>
          </div>
          <button
            type="button"
            aria-label={`Shopping bag, ${bagCount} items`}
            className="flex items-center gap-2 rounded-full border border-[#cccccc] px-4 py-2 text-sm font-semibold transition-colors hover:border-[#111111]"
          >
            Bag <span className="grid size-6 place-items-center rounded-full bg-[#111111] text-xs text-white">{bagCount}</span>
          </button>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1320px] px-5 pb-20 md:px-10">
        <section className="relative isolate flex min-h-[430px] items-end overflow-hidden bg-[#111111] px-7 py-9 sm:px-12 md:min-h-[490px] md:px-16 md:py-14">
          <img
            className="absolute inset-0 -z-20 size-full object-cover object-center"
            src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=2000&q=90"
            alt="Sunlit shelves in a thoughtfully curated shop"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#111111]/80 via-[#111111]/35 to-transparent" />
          <div className="max-w-xl text-white">
            <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-[#cccccc]">A LITTLE SHOP FOR EVERYDAY LIFE</p>
            <h1 className="font-[Fraunces] text-5xl leading-[1.03] sm:text-6xl md:text-7xl">Find your next favorite thing.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/85 sm:text-base">
              Useful, lovely, made-to-last things for home, out there, and everywhere in between.
            </p>
            <a href="#shop" className="mt-8 inline-flex items-center gap-3 bg-[#e76b45] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#cc5735]">
              Browse the good stuff <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
          <span className="absolute bottom-5 right-6 hidden text-xs font-medium text-white/75 md:block">THOUGHTFULLY PICKED, NEVER OVERTHOUGHT</span>
        </section>

        <section id="shop" className="pt-16 md:pt-20">
          <div className="flex flex-col justify-between gap-6 border-b border-[#e5e5e5] pb-7 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.15em] text-[#e76b45]">THE GOOD STUFF</p>
              <h2 className="font-[Fraunces] text-4xl sm:text-5xl">A few things we love</h2>
            </div>
            <label className="flex w-full items-center gap-3 border-b border-[#a3a3a3] pb-2 md:max-w-[260px]">
              <span className="text-sm text-[#555555]">Search</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Try ‘ceramic’"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#777777]"
              />
            </label>
          </div>

          <div className="flex gap-2 overflow-x-auto py-5" aria-label="Filter by category">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${category === item ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#cccccc] text-[#111111] hover:border-[#111111]'}`}
              >
                {item}
              </button>
            ))}
          </div>

          {visibleProducts.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-4">
              {visibleProducts.map((product) => (
                <article key={product.id} className="group min-w-0">
                  <div className={`relative aspect-[4/5] overflow-hidden ${product.color}`}>
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="absolute left-3 top-3 bg-[#f7f7f7] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] text-[#111111]">{product.category.toUpperCase()}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2 pt-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold sm:text-base">{product.name}</h3>
                      <p className="mt-1 text-xs text-[#555555] sm:text-sm">{product.note}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">${product.price}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBagCount((count) => count + 1)}
                    className="cart-add-button mt-4 w-full border border-[#cccccc] py-2.5 text-xs font-bold transition-colors hover:border-[#111111] hover:bg-[#111111] hover:text-white sm:text-sm"
                  >
                    <ShoppingCart size={18} aria-hidden="true" /> Add to cart
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-[#555555]">No finds match that search. Try another one.</p>
          )}
        </section>

        <section id="about" className="mt-20 flex flex-col justify-between gap-5 border-t border-[#e5e5e5] pt-7 sm:flex-row sm:items-center">
          <p className="font-[Fraunces] text-2xl">Good things, for the everyday.</p>
          <p className="text-xs text-[#555555]">A personal shop in progress · Made with care</p>
        </section>
      </main>
    </div>
  )
}

const AnimatedRoutes = () => {
  const location = useLocation()

  const navigate=useNavigate()
  const sellerWorkspace=(location.pathname==='/seller'||location.pathname.startsWith('/seller/'))&&
    !['/seller/login','/seller/register','/seller/application'].includes(location.pathname.replace(/\/$/,''))
  useEffect(()=>{
    if(!sellerWorkspace)return
    const controller=new AbortController()
    let checking=false
    async function check(){
      if(document.hidden||checking||controller.signal.aborted)return
      checking=true
      try{
        await apiRequest('/api/auth/me',{cache:'no-store',signal:controller.signal})
      }catch(error){
        if(!controller.signal.aborted&&error.status===401){
          navigate('/seller/login',{replace:true,state:{sessionEnded:true}})
        }
      }finally{checking=false}
    }
    check()
    const timer=setInterval(check,15000)
    window.addEventListener('focus',check)
    document.addEventListener('visibilitychange',check)
    return()=>{
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus',check)
      document.removeEventListener('visibilitychange',check)
    }
  },[sellerWorkspace,navigate])

  useEffect(() => {
    const events=['pointerover','focusin','touchstart']
    events.forEach(type=>document.addEventListener(type,preloadLink,{passive:true}))
    return()=>events.forEach(type=>document.removeEventListener(type,preloadLink))
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <>
      <Suspense fallback={<main className="mx-auto max-w-6xl px-5"><ContentPlaceholder/></main>}>
        <div>
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
            <Route path="/discounts" element={<DiscountsPage />} />
            <Route path="/stores/:sellerId" element={<PartnerStorePage />} />
            <Route path="/messages" element={<MessageCenterPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/purchase/:id" element={<PurchasePage />} />
            <Route path="/orders" element={<MyPurchasesPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/profile/:section?" element={<BuyerProfilePage />} />
            <Route path="/seller/application" element={<SellerApplicationPage />} />
            <Route path="/seller/login" element={<SellerLogin />} />
            <Route path="/super-admin" element={<SuperAdminPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/users/:userId" element={<AdminUserDetailsPage />} />
            <Route path="/admin/seller-metrics" element={<AdminSellerMetricsPage />} />
            <Route path="/seller" element={<SellerDashboardPage />} />
            <Route path="/seller/account" element={<SellerAccountPage />} />
            <Route path="/seller/wallet" element={<SellerFinancePage />} />
            <Route path="/seller/financial-statement" element={<SellerFinancePage view="statement" />} />
            <Route path="/seller/fund-record" element={<SellerFinancePage view="record" />} />
            <Route path="/seller/orders" element={<SellerOrdersPage />} />
            <Route path="/seller/marketing/upgrade" element={<SellerMarketingPage view="upgrade" />} />
            <Route path="/seller/marketing/history" element={<SellerMarketingPage view="history" />} />
            <Route path="/seller/marketing/levels" element={<SellerMarketingPage view="levels" />} />
            <Route path="/seller/products" element={<SellerPage />} />
            <Route path="/seller/warehouse" element={<SellerManagementPage view="warehouse" />} />
            <Route path="/seller/refunds" element={<SellerManagementPage view="refunds" />} />
            <Route path="/seller/referrals" element={<SellerManagementPage view="referrals" />} />
            <Route path="/seller/reviews" element={<SellerManagementPage view="reviews" />} />
            <Route path="/seller/register" element={<SellerRegister />} />
            <Route path="/previous-storefront" element={<Storefront />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Suspense>
      <MobileBottomNav />
      <SellerBottomNav/>
      <ThemeToggle />
      <OrderNotifications />
      <CartToast />
    </>
  )
}

const App = () => (
  <CartProvider>
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  </CartProvider>
)

export default App
