import UiverseSelect from '../components/UiverseSelect.jsx'
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/min'
import SiteName from '../components/SiteName.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { apiRequest, trackedFetch } from '../lib/api.js'
import { applyBillingAddress, mergeBillingDefaults } from '../lib/billingDefaults.js'

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const phoneCountries = getCountries().map(code => ({
  code,
  label: regionNames.of(code),
  dial: getCountryCallingCode(code),
  flag: String.fromCodePoint(...[...code].map(letter => letter.charCodeAt(0) + 127397)),
})).sort((a, b) => a.label.localeCompare(b.label))

const exampleAddresses = [
  '浙江省杭州市西湖区示例路18号',
  '广东省深圳市南山区示例街道26号',
  '四川省成都市锦江区示例路35号',
  '江苏省苏州市姑苏区示例街道12号',
  '北京市朝阳区示例路48号',
  '上海市浦东新区示例街道9号',
  '湖北省武汉市洪山区示例路21号',
  '山东省青岛市市南区示例街道16号',
  '福建省厦门市思明区示例路32号',
  '湖南省长沙市岳麓区示例街道7号',
  '河南省郑州市金水区示例路29号',
  '安徽省合肥市蜀山区示例街道14号',
  '江西省南昌市东湖区示例路43号',
  '辽宁省大连市中山区示例街道23号',
  '重庆市渝中区示例路11号',
  '云南省昆明市五华区示例街道37号',
  '陕西省西安市雁塔区示例路19号',
  '广西壮族自治区南宁市青秀区示例街道31号',
  '海南省海口市龙华区示例路6号',
  '河北省石家庄市长安区示例街道45号',
]

const BillingPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, subtotal } = useCart()
  const [message, setMessage] = useState('')
  const [addresses, setAddresses] = useState([])
  const [phoneCountry,setPhoneCountry] = useState('')
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
        setBilling((current) => mergeBillingDefaults({phone: saved?.phone || user.phone || '', ...current}, user, profile.addresses, editedFields.current))
      }
    }
    loadAddresses().catch((error) => { if (active) setMessage(error.message) }).finally(() => { if (active) setLoadingAddresses(false) })
    return () => { active = false }
  }, [])

  const selectAddress = (id) => {
    setSelectedAddressId(id)
    addressFields.forEach(field => editedFields.current.add(field))
    const selected = addresses.find(address => String(address.id) === id)
    if(selected){
      setPhoneCountry('')
      setBilling(current => ({...applyBillingAddress(current, selected), phone:selected.phone || ''}))
      return
    }
    const example = id.startsWith('example-') ? exampleAddresses[Number(id.slice(8))] : ''
    setBilling(current => ({...current, address:example || '', city:'', region:'', country:example?'China':''}))

  }

  const updateBilling = (event) => {
    const { name, value } = event.target
    editedFields.current.add(name)
    if(name==='address'){
      setSelectedAddressId('')
      setBilling(current=>({...current,address:value,city:'',region:'',country:''}))
      return
    }
    setBilling((current) => ({ ...current, [name]: value }))
  }

  const detectedCountry = billing.phone?.startsWith('+') ? parsePhoneNumberFromString(billing.phone)?.country : undefined
  const changePhoneCountry = (event) => {
    const code = event.target.value
    const phone = billing.phone || ''
    const currentPrefix = phoneCountries.find(country => country.code === (phoneCountry || detectedCountry))?.dial
    const national = phone.startsWith('+')
      ? parsePhoneNumberFromString(phone)?.nationalNumber || (currentPrefix ? phone.slice(currentPrefix.length + 1).trim() : '')
      : phone
    setPhoneCountry(code)
    setBilling(current => ({ ...current, phone: code ? `+${getCountryCallingCode(code)} ${national}` : national }))
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
    if(phoneCountry && !checkoutBilling.phone.startsWith('+')){
      checkoutBilling.phone = parsePhoneNumberFromString(checkoutBilling.phone, phoneCountry)?.number
        || `+${getCountryCallingCode(phoneCountry)} ${checkoutBilling.phone}`
    }else if(checkoutBilling.phone.startsWith('+')){
      checkoutBilling.phone = parsePhoneNumberFromString(checkoutBilling.phone)?.number || checkoutBilling.phone
    }
    if(/^\+\d{1,3}$/.test(checkoutBilling.phone)){
      setMessage('Enter a phone number after the country code.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      if(canSaveAddress){
        const existing = addresses.find(address => addressFields.every(field => checkoutBilling[field] === address[field]) && checkoutBilling.phone === address.phone)
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
            <label className="block text-sm font-medium">Full name<input name="fullName" value={billing.fullName || ''} onChange={updateBilling} autoComplete="name" required className="mt-2 h-12 w-full rounded border px-3" /></label>
            <label className="block text-sm font-medium">Email address<input name="email" type="email" value={billing.email || ''} onChange={updateBilling} autoComplete="email" maxLength={200} required className="mt-2 h-12 w-full rounded border px-3" /></label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="block min-w-0 text-sm font-medium">Phone country code
                <UiverseSelect value={phoneCountry || detectedCountry || ''} onChange={changePhoneCountry} className="mt-2 h-12 w-full rounded border bg-white px-3">
                  <option value="">Choose a country</option>
                  {phoneCountries.map(({code,label,dial,flag})=><option key={code} value={code}>{flag} {label} (+{dial})</option>)}
                </UiverseSelect>
              </label>
              <label className="block text-sm font-medium">Phone number<input name="phone" type="tel" value={billing.phone || ''} onChange={updateBilling} autoComplete="tel" maxLength={40} required className="mt-2 h-12 w-full rounded border px-3" /></label>
            </div>
            <label className="block text-sm font-medium">Choose a delivery address
              <UiverseSelect value={selectedAddressId} onChange={event=>selectAddress(event.target.value)} className="mt-2 h-12 w-full rounded border bg-white px-3 text-sm">
                <option value="">Add new address</option>
                {addresses.length>0&&<optgroup label="Your saved addresses">
                  {addresses.map(address=><option key={address.id} value={address.id}>{[address.address,address.city].filter(Boolean).join(', ')}{address.isDefault?' (default)':''}</option>)}
                </optgroup>}
                <optgroup label="Example addresses · China">
                  {exampleAddresses.map((address,index)=><option key={address} value={`example-${index}`}>{address}</option>)}
                </optgroup>
              </UiverseSelect>
            </label>
            <label className="block text-sm font-medium">Delivery address<input name="address" value={billing.address || ''} onChange={updateBilling} autoComplete="street-address" placeholder="Enter the full delivery address" maxLength={200} required className="mt-2 h-12 w-full rounded border px-3" /></label>
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
