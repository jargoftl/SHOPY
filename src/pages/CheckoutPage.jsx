import SiteName from '../components/SiteName.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SiApplepay, SiGooglepay, SiMastercard, SiPaypal, SiVisa } from 'react-icons/si'
import { useCart } from '../context/CartContext.jsx'
import { apiRequest } from '../lib/api.js'
import { coinDetails } from '../lib/coins.js'
import CoinSelectionModal from '../components/CoinSelectionModal.jsx'
import { formatMoney } from '../lib/money.js'
import { Wallet } from 'lucide-react'

const CheckoutPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { items, subtotal, trackOrder } = useCart()
  const [coin, setCoin] = useState('')
  const [coinModalOpen, setCoinModalOpen] = useState(false)
  const requestKey = useRef(crypto.randomUUID())
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const billing = location.state?.billing
  const [availableCoins, setAvailableCoins] = useState([])
  const [coinsError, setCoinsError] = useState('')
  const [balance, setBalance] = useState(null)
  const [balanceError, setBalanceError] = useState('')
  const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0)
  const totalCents = subtotalCents + Math.floor(subtotalCents * 3 / 100)
  useEffect(() => {
    let active = true
    apiRequest('/api/payment-coins').then((data) => { if (active) setAvailableCoins(data.coins) }).catch((err) => { if (active) setCoinsError(err.message) })
    apiRequest('/api/rewards', { background: true }).then((data) => { if (active) setBalance(data.balanceUnits) }).catch((err) => { if (active && err.status !== 403) setBalanceError(err.status === 401 ? 'Log in to use your balance.' : err.message) })
    return () => { active = false }
  }, [])

  const selectCoin = async (value) => {
    if (submitting.current) return
    if (!billing || !items.length) {
      navigate('/cart', { replace: true })
      return
    }
    submitting.current = true
    setCoin(value === 'BALANCE' ? '' : value)
    setCoinModalOpen(false)
    setBusy(true); setError('')
    try {
      const { id, buyerId } = await apiRequest('/api/purchases', { method: 'POST', body: JSON.stringify({ billing, coin: value, requestKey: requestKey.current, ...(value === 'BALANCE' ? { expectedTotalCents: totalCents } : {}), items: items.map((item) => ({ id: item.id, quantity: item.quantity, selectedColor: item.selectedColor || '', selectedSize: item.selectedSize || '' })) }) })
      trackOrder(id, buyerId, items)
      navigate(`/purchase/${id}`, { replace: true })
    } catch (err) { setError(err.status === 401 ? 'Please log in before placing an order.' : err.message) } finally { submitting.current = false; setBusy(false) }
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
              <h2 className="text-sm font-semibold">Payment method</h2>
              <button type="button" disabled={busy || balance === null} onClick={() => selectCoin('BALANCE')} className="mt-3 flex w-full items-center gap-3 border border-[#dfe3dd] p-4 text-left text-sm hover:border-[#315941] disabled:opacity-60">
                <Wallet size={20} className="shrink-0 text-[#315941]" /><span className="flex-1">Pay with balance<span className="mt-1 block text-xs text-[#737970]">{balance === null ? 'Balance unavailable' : `Available: ${formatMoney(balance)}`}</span></span><span className="text-xs font-semibold">{formatMoney(totalCents)}</span>
              </button>
              <p className="mt-2 text-xs text-[#737970]">Balance is store credit, not a cash transfer. The full order total is deducted when you confirm.</p>
              {balanceError && <p role="status" className="mt-2 text-xs text-[#a33]">{balanceError}</p>}
              <button type="button" disabled={busy} onClick={() => setCoinModalOpen(true)} className="mt-3 flex w-full items-center gap-3 border border-[#dfe3dd] p-4 text-left text-sm hover:border-[#315941]">
                {coin ? <><span style={{ backgroundColor: coinDetails[coin][2] }} className="grid size-8 shrink-0 place-items-center rounded-full font-bold text-white" aria-hidden="true">{coinDetails[coin][1]}</span><span className="flex-1">{coinDetails[coin][0]} ({coin})</span><span className="text-xs underline">Change</span></> : <span>Choose a coin</span>}
              </button>
              <p className="mt-3 text-xs leading-5 text-[#777]">Select an available coin to see its wallet and your final payment amount.</p>
              {coinsError && <p role="alert" className="mt-2 text-xs text-red-700">{coinsError}</p>}
              <div className="mt-5 border-t border-[#e7e7e7] pt-5">
                <p className="text-xs font-semibold text-[#526055]">Other payment methods · unavailable</p>
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Unavailable payment methods">
                  {[
                    ['Visa', SiVisa],
                    ['Mastercard', SiMastercard],
                    ['PayPal', SiPaypal],
                    ['Apple Pay', SiApplepay],
                    ['Google Pay', SiGooglepay],
                  ].map(([label, Icon]) => (
                    <span key={label} className="flex items-center gap-2 rounded border border-[#e2e5e1] bg-[#f7f8f6] px-3 py-2 text-xs text-[#737970]">
                      <Icon size={22} aria-hidden="true" /><span>{label}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#777]">These methods cannot be selected.</p>
              </div>
            </section>
            {coinModalOpen && <CoinSelectionModal selected={coin} onClose={() => setCoinModalOpen(false)} onSelect={selectCoin} availableCoins={availableCoins} />}
          </section>
          <aside className="h-fit border border-[#e5e5e5] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <div className="mt-4 max-h-56 space-y-3 overflow-y-auto">
              {items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 flex-1 truncate">{item.name} × {item.quantity}</span><span>${(item.price * item.quantity).toFixed(2)}</span></div>)}
            </div>
            <dl className="mt-5 space-y-3 border-t border-[#e5e5e5] pt-4 text-sm"><div className="flex justify-between"><dt>Estimated subtotal</dt><dd>${subtotal.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Shipping</dt><dd>Free</dd></div><div className="flex justify-between"><dt>Estimated tax</dt><dd>{formatMoney(totalCents - subtotalCents)}</dd></div><div className="flex justify-between font-semibold"><dt>Estimated total</dt><dd>{formatMoney(totalCents)}</dd></div></dl>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
            {error.includes('log in') && <Link to="/login" className="mt-2 inline-block text-sm underline">Go to login</Link>}
            <button type="button" disabled={busy} onClick={() => setCoinModalOpen(true)} className="mt-6 h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Sending order…' : 'Choose coin and continue'}</button>
            <p className="mt-3 text-[10px] leading-5 text-[#777]">Final prices and tax are calculated by the server. Coin amounts use the administrator’s configured rate.</p>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default CheckoutPage
