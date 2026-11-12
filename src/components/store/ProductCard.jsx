import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useCart } from '../../context/CartContext.jsx'

const ProductCard = ({ product }) => {
  const { addItem } = useCart()
  const isDiscounted = Number.isFinite(product.compareAtPrice) && product.compareAtPrice > product.price
  const discountPercent = isDiscounted
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : 0

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="group min-w-0"
    >
      <Link to={`/products/${product.id}`} aria-label={`View ${product.name} details`} className="relative block aspect-[4/5] overflow-hidden bg-[#f1f1ef]">
        <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
        <span className="absolute left-2 top-2 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wide sm:left-3 sm:top-3">{product.category}</span>
        {isDiscounted && <span className="absolute right-2 top-2 bg-[#c8f135] px-2 py-1 text-[9px] font-bold uppercase text-[#142217]">-{discountPercent}%</span>}
      </Link>
      <div className="flex items-start justify-between gap-2 pt-3">
        <div className="min-w-0">
          <Link to={`/products/${product.id}`} className="block truncate text-xs font-medium hover:underline sm:text-sm">{product.name}</Link>
          <p className="mt-1 text-[11px] text-[#777]">{product.description || 'Selected for everyday use'}</p>
        </div>
        <div className="shrink-0 text-right text-xs sm:text-sm">
          {isDiscounted && <p className="text-[10px] text-[#777] line-through">${product.compareAtPrice.toFixed(2)}</p>}
          <p className={isDiscounted ? 'font-semibold text-[#1f5a37]' : ''}>${product.price.toFixed(2)}</p>
        </div>
      </div>
      <button type="button" onClick={() => addItem(product)} className="mt-3 w-full rounded-md bg-[#1f4a32] py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#c8f135] hover:text-[#142217] sm:text-xs">
        Add to cart
      </button>
    </motion.article>
  )
}

export default ProductCard
