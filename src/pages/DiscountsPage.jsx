import SiteName from '../components/SiteName.jsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { apiRequest } from '../lib/api.js'
import ProductCard from '../components/store/ProductCard.jsx'

const DiscountsPage = () => {
  const [products, setProducts] = useState([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    apiRequest('/api/discounts')
      .then(({ products: discountedProducts }) => { if (isCurrent) setProducts(discountedProducts) })
      .catch((error) => { if (isCurrent) setMessage(error.message) })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [])

  return (
    <div className="min-h-screen bg-white px-4 pb-24 text-[#171717] sm:px-7 md:pb-10">
      <header className="mx-auto flex max-w-[1440px] items-center justify-between border-b border-[#e8e8e8] py-5">
        <Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName /><span className="ml-1 text-sm">▰</span></Link>
        <Link to="/products" className="text-xs underline underline-offset-4">All products</Link>
      </header>
      <main className="mx-auto max-w-[1440px] py-10 sm:py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a5c46]">Limited-time prices</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold sm:text-5xl">Discounts</h1>
          <p className="max-w-md text-sm leading-6 text-[#777]">Products with a sale price set by the store.</p>
        </div>
        {isLoading ? <p className="py-16 text-center text-sm text-[#777]">Loading offers…</p> : message ? <p role="alert" className="py-16 text-center text-sm text-[#a33]">{message}</p> : products.length ? (
          <motion.div layout className="mt-8 grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </motion.div>
        ) : <p className="py-20 text-center text-sm text-[#777]">No discounted products right now.</p>}
      </main>
    </div>
  )
}

export default DiscountsPage
