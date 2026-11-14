import SiteName from '../components/SiteName.jsx'
import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { calculateOrderTotals } from '../lib/orderTotals.js'

const CartPage = () => {
  const { items, setQuantity, removeItem, subtotal } = useCart()
  const totals = calculateOrderTotals(subtotal)

  return (
    <div className="min-h-screen bg-white px-4 pb-24 text-[#171717] sm:px-7 md:pb-10">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between border-b border-[#e8e8e8] py-5">
        <Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName /><span className="ml-1 text-sm">▰</span></Link>
        <Link to="/products" className="text-xs underline underline-offset-4">Continue shopping</Link>
      </header>
      <main className="mx-auto max-w-[1200px] py-9 sm:py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a5c46]">Your selection</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Shopping cart <span className="text-lg font-normal text-[#777]">({items.reduce((count, item) => count + item.quantity, 0)})</span></h1>

        {!items.length ? (
          <div className="py-20 text-center">
            <p className="text-lg font-medium">Your cart is empty.</p>
            <Link to="/products" className="mt-5 inline-flex bg-black px-5 py-3 text-sm font-semibold text-white">Browse products</Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
            <section className="divide-y divide-[#e7e7e7] border-y border-[#e7e7e7]">
              {items.map((item) => (
                <article key={item.cartKey || item.id} className="flex gap-4 py-5 sm:gap-6">
                  <img src={item.imageUrl} alt={item.name} className="aspect-[4/5] w-24 shrink-0 bg-[#f1f1ef] object-cover sm:w-32" />
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-[#777]">{item.category}</p><h2 className="mt-1 truncate text-sm font-medium sm:text-base">{item.name}</h2>{(item.selectedColor || item.selectedSize) && <p className="mt-1 text-xs text-[#666]">{[item.selectedColor, item.selectedSize].filter(Boolean).join(' · ')}</p>}<p className="mt-2 text-sm">${item.price.toFixed(2)}</p></div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="flex h-9 items-center border border-[#ddd]">
                        <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => item.quantity === 1 ? removeItem(item.cartKey || item.id) : setQuantity(item.cartKey || item.id, item.quantity - 1)} className="grid size-9 place-items-center"><Minus size={14} /></button>
                        <span className="min-w-8 text-center text-xs">{item.quantity}</span>
                        <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => setQuantity(item.cartKey || item.id, item.quantity + 1)} className="grid size-9 place-items-center"><Plus size={14} /></button>
                      </div>
                      <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.cartKey || item.id)} className="grid size-9 place-items-center text-[#777] hover:text-black"><Trash2 size={16} /></button>
                      <span className="w-20 text-right text-sm font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="h-fit border border-[#e5e5e5] p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Order summary</h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>${subtotal.toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt>Shipping</dt><dd>{totals.shipping ? `$${totals.shipping.toFixed(2)}` : 'Free'}</dd></div>
                <div className="flex justify-between"><dt>Estimated tax</dt><dd>${totals.tax.toFixed(2)}</dd></div>
                <div className="flex justify-between border-t border-[#e5e5e5] pt-4 text-base font-semibold"><dt>Total</dt><dd>${totals.total.toFixed(2)}</dd></div>
              </dl>
              <Link to="/billing" className="mt-6 flex min-h-12 items-center justify-center bg-black px-4 text-sm font-semibold text-white">Continue to billing</Link>
              <p className="mt-3 text-[10px] leading-5 text-[#777]">Estimated totals. Final product prices and tax are calculated when the order is submitted.</p>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

export default CartPage
