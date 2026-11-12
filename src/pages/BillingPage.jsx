import SiteName from '../components/SiteName.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { calculateOrderTotals } from '../lib/orderTotals.js'
import { apiRequest } from '../lib/api.js'
import { applyBillingAddress, mergeBillingDefaults } from '../lib/billingDefaults.js'

const BillingPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, subtotal } = useCart()
  const [message, setMessage] = useState('')
  const [addresses, setAddresses] = useState([])
  const [billing, setBilling] = useState(location.state?.billing || {})
  const editedFields = useRef(new Set())
  const totals = calculateOrderTotals(subtotal)

  useEffect(() => {
    let active = true
    const loadAddresses = async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (response.status === 401) return
      if (!response.ok) throw new Error('Could not load your saved billing addresses.')
      const { user } = await response.json()
      if (user.role !== 'customer') return
      const profile = await apiRequest('/api/buyer/profile')
      if (active) {
        setAddresses(profile.addresses)
        setBilling((current) => mergeBillingDefaults(current, user, profile.addresses, editedFields.current))
      }
    }
    loadAddresses().catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [])

  const selectAddress = (id) => {
    const selected = addresses.find((address) => address.id === Number(id))
    if (!selected) return
    const fields = ['fullName', 'phone', 'address', 'city', 'region', 'postalCode', 'country']
    fields.forEach((field) => editedFields.current.add(field))
    setBilling((current) => applyBillingAddress(current, selected))
  }

  const updateBilling = (event) => {
    const { name, value } = event.target
    editedFields.current.add(name)
    setBilling((current) => ({ ...current, [name]: value }))
  }

  const continueToCheckout = (event) => {
    event.preventDefault()
    if (!items.length) {
      navigate('/cart')
      return
    }
    const formData = new FormData(event.currentTarget)
    const billing = Object.fromEntries(formData.entries())
    navigate('/checkout', { state: { billing } })
  }

  if (!items.length) {
    return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="text-3xl font-semibold">Your cart is empty</h1><Link to="/products" className="mt-5 inline-block underline">Browse products</Link></main>
  }

  return (
    <div className="min-h-screen bg-white px-4 pb-24 text-[#171717] sm:px-7 md:pb-10">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between border-b border-[#e8e8e8] py-5"><Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName /><span className="ml-1 text-sm">▰</span></Link><Link to="/cart" className="text-xs underline underline-offset-4">Back to cart</Link></header>
      <main className="mx-auto max-w-[1200px] py-9 sm:py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a5c46]">Checkout · Step 1 of 2</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Billing and delivery</h1>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
          <form onSubmit={continueToCheckout} className="space-y-5">
            {addresses.length > 0 && <label className="block text-sm font-medium">Use a saved address<select defaultValue="" onChange={(event) => selectAddress(event.target.value)} className="mt-2 h-12 w-full border border-[#d9dce2] bg-white px-3 text-sm"><option value="">Choose a saved address</option>{addresses.map((address) => <option key={address.id} value={address.id}>{address.address}, {address.city}{address.isDefault ? ' (default)' : ''}</option>)}</select></label>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Full name<input name="fullName" value={billing.fullName || ''} onChange={updateBilling} autoComplete="name" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
              <label className="block text-sm font-medium">Email<input name="email" value={billing.email || ''} onChange={updateBilling} type="email" autoComplete="email" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
            </div>
            <label className="block text-sm font-medium">Phone<input name="phone" value={billing.phone || ''} onChange={updateBilling} type="tel" autoComplete="tel" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
            <label className="block text-sm font-medium">Street address<input name="address" value={billing.address || ''} onChange={updateBilling} autoComplete="street-address" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium">City<input name="city" value={billing.city || ''} onChange={updateBilling} autoComplete="address-level2" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
              <label className="block text-sm font-medium">State / region<input name="region" value={billing.region || ''} onChange={updateBilling} autoComplete="address-level1" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
              <label className="block text-sm font-medium">Postal code<input name="postalCode" value={billing.postalCode || ''} onChange={updateBilling} autoComplete="postal-code" required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" /></label>
            </div>
            <label className="block text-sm font-medium">Country
              <select name="country" value={billing.country || ''} onChange={updateBilling} autoComplete="country-name" required className="mt-2 h-12 w-full border border-[#d9dce2] bg-white px-3 text-sm outline-none focus:border-black"><option value="">Choose country</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Nigeria</option><option>Other</option>{billing.country && !['United States', 'Canada', 'United Kingdom', 'Nigeria', 'Other'].includes(billing.country) && <option>{billing.country}</option>}</select>
            </label>
            {message && <p role="alert" className="text-sm text-[#a33]">{message}</p>}
            <button type="submit" className="h-12 w-full bg-black text-sm font-semibold text-white">Continue to checkout</button>
          </form>
          <aside className="h-fit border border-[#e5e5e5] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Order total</h2>
            <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>${subtotal.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Shipping</dt><dd>{totals.shipping ? `$${totals.shipping.toFixed(2)}` : 'Free'}</dd></div><div className="flex justify-between"><dt>Estimated tax</dt><dd>${totals.tax.toFixed(2)}</dd></div><div className="flex justify-between border-t border-[#e5e5e5] pt-4 text-base font-semibold"><dt>Total</dt><dd>${totals.total.toFixed(2)}</dd></div></dl>
            <p className="mt-4 text-[10px] leading-5 text-[#777]">Demo checkout only. No real payment is collected.</p>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default BillingPage
