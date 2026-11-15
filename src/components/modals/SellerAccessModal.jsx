import SiteName from '../SiteName.jsx'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'

const SellerAccessModal = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/55 px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="seller-access-title" className="relative w-full max-w-[440px] bg-white px-6 py-8 shadow-2xl sm:px-9 sm:py-10">
        <button type="button" onClick={onClose} aria-label="Close seller options" className="absolute right-4 top-4 grid size-10 place-items-center text-[#555] hover:text-black">
          <X size={21} strokeWidth={1.6} />
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#111111]"><SiteName /> SELLER CENTER</p>
        <h2 id="seller-access-title" className="mt-3 text-3xl font-semibold">Ready to sell with us?</h2>
        <p className="mt-3 text-sm leading-6 text-[#666]">Sign in to manage your shop, or create a seller account to get started.</p>
        <div className="mt-7 grid gap-3">
          <Link to="/seller/login" onClick={onClose} className="flex min-h-12 items-center justify-center bg-black px-5 text-sm font-semibold text-white hover:bg-[#292929]">
            Log in to your seller account
          </Link>
          <Link to="/seller/register" onClick={onClose} className="flex min-h-12 items-center justify-center border border-[#cfcfcf] px-5 text-sm font-semibold hover:border-black">
            Create a seller account
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-[#777]">Seller accounts use a separate workspace from customer accounts.</p>
      </section>
    </div>
  )
}

export default SellerAccessModal
