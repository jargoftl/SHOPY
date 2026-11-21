import SiteName from '../components/SiteName.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { apiRequest, trackedFetch } from '../lib/api.js'
import { applyBillingAddress, mergeBillingDefaults } from '../lib/billingDefaults.js'

const BillingPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, subtotal } = useCart()
  const [message, setMessage] = useState('')
  const [addresses, setAddresses] = useState([])
  const [selectedAddressId,setSelectedAddressId] = useState('')
  const [canSaveAddress,setCanSaveAddress] = useState(false)
  const [loadingAddresses,setLoadingAddresses] = useState(true)
  const [saving,setSaving] = useState(false)
  const addressFields = ['fullName','address','city','region','country']
  const [billing, setBilling] = useState(location.state?.billing || {})
  const editedFields = useRef(new Set())

  useEffect(() => {
    let active = true
    const loadAddresses = async () => {
      const response = await trackedFetch('/api/auth/me', { credentials: 'include' })
      if (response.status === 401) return
      if (!response.ok) throw new Error('Could not load your saved billing addresses.')
      const { user } = await response.json()
      if(user.role==='seller'){if(active)setBilling(current=>mergeBillingDefaults(current,user,[],editedFields.current));return}
      if (user.role !== 'customer') return
      const profile = await apiRequest('/api/buyer/profile')
      if (active) {
        setCanSaveAddress(true)
        setAddresses(profile.addresses)
        const saved = profile.addresses.find(address => location.state?.billing
          ? addressFields.every(field => address[field] === location.state.billing[field])
          : address.isDefault)
        if(saved) setSelectedAddressId(String(saved.id))
        setBilling((current) => mergeBillingDefaults(current, user, profile.addresses, editedFields.current))
      }
    }
    loadAddresses().catch((error) => { if (active) setMessage(error.message) }).finally(() => { if (active) setLoadingAddresses(false) })
    return () => { active = false }
  }, [])

  const selectAddress = (id) => {
    setSelectedAddressId(id)
    addressFields.forEach(field => editedFields.current.add(field))
    const selected = addresses.find(address => String(address.id) === id)
    setBilling(current => selected ? applyBillingAddress(current, selected) : { ...current, address:'', city:'', region:'', country:'', phone:'' })
  }

  const updateBilling = (event) => {
    const { name, value } = event.target
    editedFields.current.add(name)
    setBilling((current) => ({ ...current, [name]: value }))
  }

  const continueToCheckout = async (event) => {
    event.preventDefault()
    if (!items.length) {
      navigate('/cart')
      return
    }
    if(saving||loadingAddresses)return
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    const checkoutBilling = Object.fromEntries([...addressFields,'email'].map(field => [
      field, String(fields[field] ?? billing[field] ?? '').trim()
    ]))
    checkoutBilling.phone = String(fields.phone ?? addresses.find(address => String(address.id) === selectedAddressId)?.phone ?? billing.phone ?? '').trim()
    setSaving(true)
    setMessage('')
    try {
      if(canSaveAddress){
        const existing = addresses.find(address => addressFields.every(field => checkoutBilling[field] === address[field]))
        if(existing){
          if(!existing.isDefault) await apiRequest(`/api/buyer/addresses/${existing.id}/default`,{method:'PATCH'})
        }else{
          await apiRequest('/api/buyer/addresses',{method:'POST',body:JSON.stringify({...checkoutBilling,isDefault:true,checkout:true})})
        }
      }
      navigate('/checkout', { state: { billing: checkoutBilling } })
    }catch(error){
      setMessage(error.message)
    }finally{
      setSaving(false)
    }
  }

  if (!items.length) {
    return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="text-3xl font-semibold">Your cart is empty</h1><Link to="/products" className="mt-5 inline-block underline">Browse products</Link></main>
  }

  return (
    <div className="buyer-billing-page min-h-screen bg-white px-4 pb-24 text-[#171717] sm:px-7 md:pb-10">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between border-b border-[#e8e8e8] py-5"><Link to="/" className="text-[26px] font-black tracking-[-0.08em]"><SiteName logo /></Link><Link to="/cart" className="text-xs underline underline-offset-4">Back to cart</Link></header>
      <main className="mx-auto max-w-[1200px] py-9 sm:py-14">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a5c46]">Checkout · Step 1 of 2</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Billing and delivery</h1>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
          <form onSubmit={continueToCheckout} className="space-y-5">
            {addresses.length > 0 && <label className="block text-sm font-medium">Use a saved address<select value={selectedAddressId} onChange={(event) => selectAddress(event.target.value)} className="mt-2 h-12 w-full border border-[#cccccc] bg-white px-3 text-sm"><option value="">Add new address</option>{addresses.map((address) => <option key={address.id} value={address.id}>{address.address}, {address.city}{address.isDefault ? ' (default)' : ''}</option>)}</select></label>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Full name<input name="fullName" value={billing.fullName || ''} onChange={updateBilling} autoComplete="name" required className="mt-2 h-12 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" /></label>
              <label className="block text-sm font-medium">Email<input name="email" value={billing.email || ''} onChange={updateBilling} type="email" autoComplete="email" required className="mt-2 h-12 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" /></label>
            </div>
            {(!selectedAddressId||loadingAddresses)&&<>
            <label className="block text-sm font-medium">Recipient phone (optional)<input name="phone" type="tel" autoComplete="tel" maxLength={40} value={billing.phone || ''} onChange={updateBilling} className="mt-2 h-12 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" /></label>
            <label className="block text-sm font-medium">详细地址 / Street address<input name="address" placeholder="请输入真实的街道、门牌号和房间号" value={billing.address || ''} onChange={updateBilling} autoComplete="street-address" required className="mt-2 h-12 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">城市 / City<input name="city" value={billing.city || ''} onChange={updateBilling} autoComplete="address-level2" required className="mt-2 h-12 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" /></label>
              <label className="block text-sm font-medium">省 / 自治区 / 直辖市<input name="region" value={billing.region || ''} onChange={updateBilling} autoComplete="address-level1" required className="mt-2 h-12 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" /></label>
            </div>
            <label className="block text-sm font-medium">国家 / Country
              <select name="country" value={billing.country || 'United States'} onChange={updateBilling} autoComplete="country-name" required className="mt-2 h-12 w-full border border-[#cccccc] bg-white px-3 text-sm outline-none focus:border-black"><option value="">Choose country</option><option value="China">中国</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Nigeria</option><option>Other</option>{billing.country && !['China', 'United States', 'Canada', 'United Kingdom', 'Nigeria', 'Other'].includes(billing.country) && <option>{billing.country}</option>}</select>
            </label>
            </>}
            {message && <p role="alert" className="text-sm text-[#a33]">{message}</p>}
            <button type="submit" disabled={saving||loadingAddresses} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving address…':'Continue to checkout'}</button>
          </form>
          <aside className="h-fit border border-[#e5e5e5] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Order total</h2>
            <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt>Estimated subtotal</dt><dd>${subtotal.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Shipping</dt><dd>Free</dd></div><div className="flex justify-between"><dt>Tax</dt><dd>Up to 3%</dd></div></dl>
            <p className="mt-4 text-[10px] leading-5 text-[#777]">Final prices and tax are calculated when the order is submitted.</p>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default BillingPage
