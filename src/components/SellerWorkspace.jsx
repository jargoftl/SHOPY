import SellerLanguageSelector from './SellerLanguageSelector.jsx'
import {useSellerLanguage} from '../context/SellerLanguageContext.jsx'
import {useRef} from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wallet, ChartNoAxesCombined, BookOpen, Package, Warehouse, Store, Users, ShoppingBag, ArrowUpRight, Menu, X, Settings, RotateCcw, Crown, BadgeCheck, Gift, ArrowDownLeft, History, MessageCircle, Bell, LogOut, ExternalLink, Star } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import '../styles/seller-portal.css'
import SiteName from './SiteName.jsx'
const tools = [
  ['/seller/account/settings', 'Store settings', Settings, '#d74439'],
  ['/seller/refunds', 'Refunds', RotateCcw, '#4d61d7'],
  ['/seller/marketing/upgrade', 'Store upgrade', Crown, '#217dc6'],
  ['/seller/referrals', 'Referrals & rewards', Gift, '#137963'],
  ['/seller/wallet?action=deposit', 'Deposit', ArrowDownLeft, '#13784d'],
  ['/seller/wallet?action=withdrawal', 'Withdraw', ArrowUpRight, '#4d61d7'],
  ['/seller/marketing/levels', 'Store level', BadgeCheck, '#217dc6'],
]

const links = [
  ['/seller', 'Overview', LayoutDashboard],
  ['/seller/orders', 'Shop orders', ShoppingBag],
  ['/seller/financial-statement', 'Financial statement', ChartNoAxesCombined],
  ['/seller/wallet', 'My wallet', Wallet],
  ['/seller/fund-record', 'Transaction history', BookOpen],
  ['/seller/products', 'Store products', Package],
  ['/seller/warehouse', 'Warehouse', Warehouse],
  ['/orders', 'My purchases', ShoppingBag],
  ['/seller/reviews', 'Product reviews', Star],
  ['/seller/marketing/history', 'Purchase history', History],
  ['/messages', 'Messages & support', MessageCircle],
  ['/messages?view=notifications', 'Notifications', Bell],
]

export default function SellerWorkspace({ user, children, overview = false }) {
  const { language, t } = useSellerLanguage()
  const navigate = useNavigate()
  const menu = useRef(null)

  async function logout() {
    menu.current.close()
    try { await apiRequest('/api/auth/logout', { method: 'POST' }) }
    catch { /* Continue to sign-in if the session has already ended. */ }
    navigate('/seller/login')
  }

  return <div lang={language} className={`seller-portal account-workspace min-h-screen${overview ? ' seller-overview' : ''}`}>
    <header className="portal-header seller-workspace-header">
      <div className="seller-workspace-brand">
        <button type="button" className="seller-menu-trigger" aria-label={t('Open seller menu')}
          aria-haspopup="dialog" aria-controls="seller-workspace-menu" onClick={() => menu.current.showModal()}>
          <Menu size={21} aria-hidden="true"/>
        </button>
        <Link to="/" className="font-bold"><SiteName logo/></Link>
      </div>
      <div className="portal-header-actions">
        <SellerLanguageSelector/>
        <div className="portal-identity text-right text-sm">
          <span className="block font-semibold">{user?.fullName || t('Your workspace')}</span>
          {user?.publicId && <span className="text-xs">#{user.publicId}</span>}
        </div>
      </div>
    </header>
    <dialog ref={menu} id="seller-workspace-menu" className="seller-menu-drawer" aria-labelledby="seller-menu-title"
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      <div className="seller-menu-content">
        <header className="seller-menu-heading">
          <h2 id="seller-menu-title">{t('Menu')}</h2>
          <button type="button" className="seller-menu-trigger" aria-label={t('Close seller menu')} onClick={() => menu.current.close()}>
            <X size={20} aria-hidden="true"/>
          </button>
        </header>
        <nav aria-label={t('Store tools')} className="seller-menu-tools">
          {tools.map(([to, label, Icon, color]) => <Link key={to} to={to} onClick={() => menu.current.close()}>
            <span style={{ background: color }}><Icon size={20} aria-hidden="true"/></span>
            {t(label)}
          </Link>)}
        </nav>
        <nav aria-label={t('Seller workspace')} className="seller-menu-links">
          {links.map(([to, label, Icon]) => <NavLink key={to} to={to} end onClick={() => menu.current.close()}>
            <Icon size={17} aria-hidden="true"/>{t(label)}
          </NavLink>)}
          <Link to={user ? `/stores/${user.id}` : '/seller/products'} onClick={() => menu.current.close()}><Store size={17} aria-hidden="true"/>{t('Visit my store')}</Link>
          <Link to="/" onClick={() => menu.current.close()}><ExternalLink size={17} aria-hidden="true"/>{t('Shop the marketplace')}</Link>
          {user?.role === 'admin' && <Link to="/admin" onClick={() => menu.current.close()}><Settings size={17} aria-hidden="true"/>Admin dashboard</Link>}
          <button type="button" onClick={logout}><LogOut size={17} aria-hidden="true"/>{t('Log out')}</button>
        </nav>
      </div>
    </dialog>
    <main className="seller-workspace-main">{children}</main>
  </div>
}
export const money=(cents=0)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
export const panel='rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm'
export const button='inline-flex items-center justify-center gap-2 rounded-xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#111111]'
export const input='mt-1 block w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-3 text-sm text-[#111111]'
