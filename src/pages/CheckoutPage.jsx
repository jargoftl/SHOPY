import SiteName from '../components/SiteName.jsx'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { calculateOrderTotals } from '../lib/orderTotals.js'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import { coinDetails } from '../lib/coins.js'
import CoinSelectionModal from '../components/CoinSelectionModal.jsx'

const CheckoutPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { items, subtotal, clearCart } = useCart()
  const [coin, setCoin] = useState('')
  const [coinModalOpen, setCoinModalOpen] = useState(false)
  const [orderReference, setOrderReference] = useState('')
  const [savedTotal, setSavedTotal] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const billing = location.state?.billing
  const totals = calculateOrderTotals(subtotal)

  const placeDemoOrder = async (event) => {
    event.preventDefault()
    if (!billing || !items.length) {
      navigate('/cart', { replace: true })
      return
    }
    if (!coin) { setError('Choose a coin for this test order.'); return }
    setBusy(true); setError('')
    try {
      let user
      try { ({ user } = await apiRequest('/api/auth/me')) }
      catch (err) { if (err.status !== 401) throw err }
      if (user?.role === 'customer') {
        const order = await apiRequest('/api/buyer/orders', { method: 'POST', body: JSON.stringify({ billing, paymentMethod: `coin:${coin}`, items: items.map((item) => ({ id: item.id, quantity: item.quantity, selectedColor: item.selectedColor || '', selectedSize: item.selectedSize || '' })) }) })
        setOrderReference(`Test order #${order.id}`)
        setSavedTotal(order.totalCents)
      } else {
        setOrderReference(`Guest test reference TEST-${Date.now().toString(36).toUpperCase()}`)
      }
      clearCart()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (orderReference) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-5 py-20 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#e8f0e9] text-[#35684b]"><Check size={25} /></span>
        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#777]">Demo order</p>
        <h1 className="mt-2 text-3xl font-semibold">Order placed</h1>
        <p className="mt-3 text-sm text-[#666]">This is a test checkout. No payment was taken.</p>
        <p className="mt-6 font-mono text-sm">{orderReference}</p>
        {savedTotal !== null ? <p className="mt-2 text-sm">Recorded test total: {formatMoney(savedTotal)}. <Link className="underline" to="/profile/orders">View test orders</Link></p> : <p className="mt-2 text-sm">Guest test checkouts are not saved to an account.</p>}
        <Link to="/products" className="mt-8 inline-flex bg-black px-5 py-3 text-sm font-semibold text-white">Continue shopping</Link>
      </main>
    )
  }

  if (!billing || !items.length) {
    return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="text-3xl font-semibold">Checkout needs a billing address</h1><Link to="/billing" className="mt-5 inline-block underline">Return to billing</Link></main>
  }

  return (
    <div className="min-h-screen bg-white px-4 pb-24 text-[#171717] sm:px-7 md:pb-10">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between border-b border-[#e8e8e8] py-5"><Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName /><span className="ml-1 text-sm">▰</span></Link><Link to="/billing" state={{ billing }} className="text-xs underline underline-offset-4">Edit billing details</Link></header>
      <main className="mx-auto max-w-[1200px] py-9 sm:py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a5c46]">Checkout · Step 2 of 2</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Review and payment</h1>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="border-y border-[#e7e7e7] py-5">
              <h2 className="text-sm font-semibold">Deliver to</h2>
              <p className="mt-2 text-sm">{billing.fullName} · {billing.phone}</p>
              <p className="mt-1 text-sm text-[#666]">{billing.address}, {billing.city}, {billing.region} {billing.postalCode}, {billing.country}</p>
            </div>
            <section className="mt-7">
              <h2 className="text-sm font-semibold">Payment method · test only</h2>
              <button type="button" onClick={() => setCoinModalOpen(true)} className="mt-3 flex w-full items-center gap-3 border border-[#dfe3dd] p-4 text-left text-sm hover:border-[#315941]">
                {coin ? <><span style={{ backgroundColor: coinDetails[coin][2] }} className="grid size-8 shrink-0 place-items-center rounded-full font-bold text-white" aria-hidden="true">{coinDetails[coin][1]}</span><span className="flex-1">{coinDetails[coin][0]} ({coin})</span><span className="text-xs underline">Change</span></> : <span>Choose a coin</span>}
              </button>
              <p className="mt-3 text-xs leading-5 text-[#777]">Test selection only. This checkout does not request an administrator wallet or accept payment. Do not send funds for this test order.</p>
            </section>
            {coinModalOpen && <CoinSelectionModal selected={coin} onClose={() => setCoinModalOpen(false)} onSelect={(value) => { setCoin(value); setError(''); setCoinModalOpen(false) }} />}
          </section>
          <aside className="h-fit border border-[#e5e5e5] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <div className="mt-4 max-h-56 space-y-3 overflow-y-auto">
              {items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 flex-1 truncate">{item.name} × {item.quantity}</span><span>${(item.price * item.quantity).toFixed(2)}</span></div>)}
            </div>
            <dl className="mt-5 space-y-3 border-t border-[#e5e5e5] pt-4 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>${subtotal.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Shipping</dt><dd>{totals.shipping ? `$${totals.shipping.toFixed(2)}` : 'Free'}</dd></div><div className="flex justify-between"><dt>Estimated tax</dt><dd>${totals.tax.toFixed(2)}</dd></div><div className="flex justify-between border-t border-[#e5e5e5] pt-4 text-base font-semibold"><dt>Total</dt><dd>${totals.total.toFixed(2)}</dd></div></dl>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
            <button type="button" disabled={busy} onClick={placeDemoOrder} className="mt-6 h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Place test order'}</button>
            <p className="mt-3 text-[10px] leading-5 text-[#777]">Test checkout only. Selecting a method does not charge or contact a payment provider.</p>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default CheckoutPage
