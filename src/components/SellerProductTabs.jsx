import { NavLink } from 'react-router-dom'

const links = [
  ['/seller/products', 'Store products'],
  ['/seller/warehouse', 'Product warehouse'],
  ['/seller/refunds', 'Refund requests'],
  ['/seller/reviews', 'Product reviews'],
]

export default function SellerProductTabs() {
  return <nav aria-label="Product management" className="flex flex-wrap gap-2 border-b border-[#e1e7df] pb-4">
    {links.map(([href, label]) => <NavLink key={href} to={href} className={({ isActive }) => `rounded-full px-4 py-2 text-sm ${isActive ? 'bg-[#263d35] text-white' : 'bg-white text-[#315941]'}`}>{label}</NavLink>)}
  </nav>
}
