import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Check, ShoppingBag, X } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import '../styles/cart.css'

export default function CartToast() {
  const { cartNotice, dismissCartNotice } = useCart()
  const [paused, setPaused] = useState(false)
  const reducedMotion = useReducedMotion()
  const remaining = useRef(4500)
  useEffect(() => { remaining.current = 4500; setPaused(false) }, [cartNotice?.id])
  useEffect(() => {
    if (!cartNotice || paused) return
    const startedAt = performance.now()
    const timer = window.setTimeout(dismissCartNotice, remaining.current)
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt)) }
  }, [cartNotice, paused, dismissCartNotice])

  const dismiss = () => { setPaused(false); dismissCartNotice() }

  return <div role="status" className="cart-toast-region" aria-live="polite" aria-atomic="true">
    <AnimatePresence mode="wait">
      {cartNotice && <motion.aside key={cartNotice.id} className="cart-toast" data-preserve-theme
        initial={{ opacity: 0, x: reducedMotion ? 0 : 32, y: reducedMotion ? 0 : -8 }}
        animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : 24 }} transition={{ duration: reducedMotion ? 0 : .22 }}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}>
        <span className="cart-toast-check"><Check size={18} strokeWidth={2.5} /></span>
        <div className="cart-toast-copy"><p className="cart-toast-title">Added to cart</p><p className="cart-toast-product">{cartNotice.name}</p><Link to="/cart" onClick={dismiss}>View your cart <ShoppingBag size={13} /></Link></div>
        <button type="button" onClick={dismiss} aria-label="Dismiss added-to-cart notification" className="cart-toast-close"><X size={17} /></button>
        <span className="cart-toast-progress" key={cartNotice.id} style={{ animationPlayState: paused ? 'paused' : 'running' }} aria-hidden="true" />
      </motion.aside>}
    </AnimatePresence>
  </div>
}
