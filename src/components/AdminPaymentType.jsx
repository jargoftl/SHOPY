import {ArrowDownToLine, ArrowUpFromLine, CirclePlus, ReceiptText, Wallet} from 'lucide-react'
import {Link} from 'react-router-dom'
import AdminSellerFinance from './AdminSellerFinance.jsx'
import AdminSellerFunding from './AdminSellerFunding.jsx'
import CoinWalletSettings from './CoinWalletSettings.jsx'

const sections = [
 ['wallets','Receiving wallets',Wallet,'payment-type'],
 ['deposit','Seller deposits',ArrowDownToLine,'payment-type-deposits'],
 ['withdrawal','Seller withdrawals',ArrowUpFromLine,'payment-type-withdrawals'],
 ['credits','Manual credits',CirclePlus,'payment-type-credits'],
 ['sales','Sale payouts & balances',ReceiptText,'payment-type-sales'],
]
const previousSections = new Map([
 ['seller-funding','credits'], ['seller-wallet','deposit'], ['seller-finance','deposit'],
])

export function paymentSection(hash) {
 const key = hash.replace(/^#/, '')
 return sections.find(([, , , slug]) => slug === key)?.[0] ?? previousSections.get(key)
}

export default function AdminPaymentType({section}) {
 return <section>
  <nav className="mb-5 flex flex-wrap gap-2" aria-label="Payment Type sections">
   {sections.map(([id,label,Icon,slug]) => (
    <Link key={id} to={`/admin#${slug}`} aria-current={id === section ? 'page' : undefined}
     className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${id === section ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-blue-50'}`}>
     <Icon size={17} aria-hidden="true"/>{label}
    </Link>
   ))}
  </nav>
  {section === 'wallets' ? <CoinWalletSettings/> : section === 'credits' ? <AdminSellerFunding/> :
   <AdminSellerFinance key={section} view={section}/>}
 </section>
}
