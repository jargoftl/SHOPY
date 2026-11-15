import { Link } from 'react-router-dom'
import BuyerOrders from '../components/BuyerOrders.jsx'
import SiteName from '../components/SiteName.jsx'

const MyPurchasesPage = () => (
  <main className="min-h-screen bg-[#f7f7f7] px-5 py-8 text-[#111111]">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-2xl font-black"><SiteName /> ▰</Link>
      <div className="mt-8"><BuyerOrders includeTestOrders={false} /></div>
      <Link to="/login" className="mt-6 inline-block text-sm underline">Log in or switch account</Link>
    </div>
  </main>
)

export default MyPurchasesPage
