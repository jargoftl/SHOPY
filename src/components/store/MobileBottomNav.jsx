import { NavLink, useLocation } from 'react-router-dom'
import { House, LayoutGrid, Percent, ShoppingCart, UserRound } from 'lucide-react'
import { useCart } from '../../context/CartContext.jsx'

const links = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/products', label: 'Products', Icon: LayoutGrid },
  { to: '/discounts', label: 'Deals', Icon: Percent },
  { to: '/cart', label: 'Cart', Icon: ShoppingCart },
  { to: '/login', label: 'Profile', Icon: UserRound },
]

const MobileBottomNav = () => {
  const { pathname } = useLocation()
  const { itemCount } = useCart()
  const hidden = ['/admin', '/seller', '/login', '/register', '/billing', '/checkout'].some((path) => pathname.startsWith(path))
  if (hidden) return null

  return (
    <nav aria-label="Store navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e4e4e4] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {links.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 text-[10px] ${isActive ? 'font-semibold text-[#1f5a37]' : 'text-[#777]'}`}>
            <span className="relative"><Icon size={20} strokeWidth={1.7} />{label === 'Cart' && itemCount > 0 && <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-[#a34c35] px-1 text-[9px] leading-4 text-white">{itemCount}</span>}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default MobileBottomNav
