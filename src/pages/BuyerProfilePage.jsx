import PasswordInput from '../components/PasswordInput.jsx'
import BuyerTracking from '../components/BuyerTracking.jsx'
import BuyerProfileSkeleton from '../components/BuyerProfileSkeleton.jsx'
import FollowedStores from '../components/FollowedStores.jsx'
import { BUYER_STORES_UPDATED } from '../lib/buyerEvents.js'
import SiteName from '../components/SiteName.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Bell, Heart, History, MapPin, MessageCircle, Package, Settings, Store, Truck, UserRound } from 'lucide-react'
import { AiOutlineDashboard } from 'react-icons/ai'
import { FaWallet } from 'react-icons/fa'
import { IoCopyOutline } from 'react-icons/io5'
import { apiRequest, trackedFetch } from '../lib/api.js'
import AmountInput from '../components/AmountInput.jsx'
import WalletModal from '../components/WalletModal.jsx'
import BuyerExtras from '../components/BuyerExtras.jsx'
import BalanceDisplay from '../components/BalanceDisplay.jsx'
import { formatMoney as money, parseAmountCents } from '../lib/money.js'
import { coinDetails } from '../lib/coins.js'
import { walletDetailsKey, walletToShow } from '../lib/walletModal.js'

const input = 'mt-1 h-11 w-full rounded border border-[#e5e5e5] bg-white px-3 text-sm outline-none focus:border-[#111111]'
const profileLinks = [
  { to: '/profile', label: 'Overview', Icon: AiOutlineDashboard, end: true },
  { to: '/profile/wallet', label: 'My wallet', Icon: FaWallet },
  { to: '/profile/orders', label: 'My Orders', Icon: Package },
  {to:'/profile/tracking',label:'Track order',Icon:Truck},
  { to: '/profile/favorites', label: 'Favorite products', Icon: Heart },
  { to: '/profile/stores', label: 'Followed stores', Icon: Store },
  { to: '/profile/visits', label: 'Visited stores', Icon: History },
  { to: '/messages', label: 'System messages', Icon: MessageCircle },
  { to: '/profile/setup', label: 'Setup', Icon: Settings },
  { to: '/profile/addresses', label: 'Addresses', Icon: MapPin },
  { to: '/profile/notifications', label: 'Notifications', Icon: Bell },
]

const BuyerProfilePage = () => {
  const navigate = useNavigate()
  const navigateTo=useRef(navigate)
  useEffect(()=>{navigateTo.current=navigate},[navigate])
  const location = useLocation()
  const { section } = useParams()
  const [profile, setProfile] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.signupNotice || '')
  const [kind, setKind] = useState('')
  const [coin, setCoin] = useState('BTC')
  const [coinOpen, setCoinOpen] = useState(false)
  const [transactionPin, setTransactionPin] = useState('')
  const [activeDeposit, setActiveDeposit] = useState(null)
  const [showAddress, setShowAddress] = useState(false)
  const [busy, setBusy] = useState(false)
  const [updatesError, setUpdatesError] = useState('')
  const [modalRequestId, setModalRequestId] = useState(null)
  const modalRequestRef = useRef(null)
  const activeRequestRef = useRef(null)
  const seenWallets = useRef(new Set())
  const submittingDeposit = useRef(false)
  const profileLoaded = profile !== null
  useEffect(()=>{if(section!=='wallet')setTransactionPin('')},[section])
  const initialRoute=useRef({section,state:location.state})
  const alive=useRef(true)
  useEffect(() => {
    const oldSection = location.hash.slice(1)
    if (!section && ['wallet', 'orders', 'favorites', 'stores', 'visits', 'setup', 'addresses', 'notifications','tracking'].includes(oldSection)) {
      navigate(`/profile/${oldSection}`, { replace: true, state: location.state })
    }
  }, [location.hash, location.state, navigate, section])
  const updateProfile = useCallback((data) => {
    setProfile(data)
    if (modalRequestRef.current && !data.requests.some((request) => request.id === modalRequestRef.current && request.status === 'pending' && request.walletAddress)) {
      modalRequestRef.current = null
      setModalRequestId(null)
    }
    const next = walletToShow(data.requests, activeRequestRef.current, seenWallets.current)
    if (next && !modalRequestRef.current) {
      seenWallets.current.add(walletDetailsKey(next))
      modalRequestRef.current = next.id
      setModalRequestId(next.id)
    }
  }, [])

  const load=useCallback(async()=>{
    const data=await apiRequest('/api/buyer/profile',{background:true})
    if(alive.current){updateProfile(data);setUpdatesError('')}
    // Notification delivery does not delay the account details or wallet refresh.
    void apiRequest('/api/notifications',{background:true}).then(alerts=>{if(alive.current)setNotifications(alerts.notifications)}).catch(()=>{})
    return data
  },[updateProfile])
  useEffect(()=>{
    alive.current=true;let active=true
    void load().catch(async err=>{
      if(!active)return
      if(err.status===401){setProfile(null);navigateTo.current('/login',{replace:true});return}
      if(err.status===403){
        try{const {user}=await apiRequest('/api/auth/me',{background:true});if(active)navigateTo.current(initialRoute.current.section==='orders'?'/orders':user.role==='admin'?'/admin':'/seller',{replace:true,state:initialRoute.current.state})}
        catch(failure){if(active)setError(failure.message)}
      }else setError(err.message)
    })
    return()=>{active=false;alive.current=false}
  },[load])
  useEffect(()=>{
    if(!profileLoaded||busy)return
    let active=true,inFlight=false,lastStarted=0
    const refresh=async()=>{
      if(inFlight||document.visibilityState==='hidden')return
      inFlight=true;lastStarted=Date.now()
      try{await load()}
      catch(err){if(active){if(err.status===401){setProfile(null);navigateTo.current('/login',{replace:true})}else setUpdatesError(`Automatic updates unavailable: ${err.message}`)}}
      finally{inFlight=false}
    }
    const changed=event=>{if(event.type!=='storage'||event.key===BUYER_STORES_UPDATED)void refresh()}
    const focus=()=>{if(Date.now()-lastStarted>10000)void refresh()}
    const timer=window.setInterval(refresh,15000)
    window.addEventListener(BUYER_STORES_UPDATED,changed);window.addEventListener('storage',changed);window.addEventListener('focus',focus)
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener(BUYER_STORES_UPDATED,changed);window.removeEventListener('storage',changed);window.removeEventListener('focus',focus)}
  },[profileLoaded,busy,load])

  const selectDepositCoin = async (item) => {
    if (submittingDeposit.current) return
    if (!/^\d{4}$/.test(transactionPin)) { setCoinOpen(false); setError('Enter your four-digit transaction PIN before choosing a coin.'); return }
    submittingDeposit.current = true
    setCoin(item); setCoinOpen(false); setBusy(true); setError(''); setNotice('')
    let created = false
    try {
      const { id } = await apiRequest('/api/buyer/requests', { method: 'POST', body: JSON.stringify({ kind: 'deposit', coin: item, transactionPin }) })
      created = true
      setTransactionPin('')
      activeRequestRef.current = id
      setActiveDeposit({ id, coin: item, amountCents: null })
      setNotice('Request sent to the administrator. The wallet details will appear below.')
      await load()
    } catch (err) { if (!created) setCoin(''); setError(err.message) } finally { submittingDeposit.current = false; setBusy(false) }
  }

  const submitRequest = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const amountCents = parseAmountCents(values.get('amount'))
    if (amountCents === null || amountCents <= 0) {
      setError('Enter an amount between $0.01 and $1,000,000 with at most two decimal places.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest('/api/buyer/requests', { method: 'POST', body: JSON.stringify({ kind, coin, amountCents, destination: values.get('destination') || '', transactionPin }) })
      setTransactionPin('')
      setKind('')
      setNotice('Request sent to the administrator for manual review.')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const saveDepositAmount = async (event, requestId) => {
    event.preventDefault()
    const amountCents = parseAmountCents(new FormData(event.currentTarget).get('amount'))
    if (amountCents === null || amountCents <= 0) { setError('Enter an amount between $0.01 and $1,000,000 with at most two decimal places.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(`/api/buyer/requests/${requestId}/amount`, { method: 'PATCH', body: JSON.stringify({ amountCents }) })
      setNotice('Amount sent to the administrator. You can now submit a receipt.')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const uploadReceipt = async (event, requestId) => {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get('receipt')
    if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      setError('Choose a PNG or JPEG screenshot up to 2 MB.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await trackedFetch(`/api/buyer/requests/${requestId}/receipt`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Screenshot upload failed.')
      }
      await load()
      form.reset()
      setNotice('Screenshot sent to the administrator. It does not confirm payment.')
    } catch (err) { setError(err.message === 'Failed to fetch' ? 'Cannot connect to the server. Please try again.' : err.message) } finally { setBusy(false) }
  }
  const copyAddress = async (address) => {
    try { await navigator.clipboard.writeText(address); setNotice('Wallet address copied.'); setError('') }
    catch { setError('Could not copy the address. Select and copy it manually.') }
  }
  const refreshProfile = async () => {
    setBusy(true); setError(''); setNotice('')
    try { await load(); setNotice('Account details refreshed.') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const saveAddress = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    data.isDefault = Boolean(data.isDefault)
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await apiRequest('/api/buyer/addresses', { method: 'POST', body: JSON.stringify(data) })
      setProfile((current) => ({ ...current, addresses: result.addresses }))
      setShowAddress(false)
      setNotice('Address saved.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const setDefault = async (id) => {
    setError('')
    try {
      const result = await apiRequest(`/api/buyer/addresses/${id}/default`, { method: 'PATCH' })
      setProfile((current) => ({ ...current, addresses: result.addresses }))
    } catch (err) { setError(err.message) }
  }
  const logOut = async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); navigate('/') } catch (err) { setError(err.message) }
  }
  if (!profile) return error?<main className="mx-auto max-w-xl px-5 py-20"><h1 className="text-2xl font-semibold">Your account</h1><p role="alert" className="mt-4 text-sm text-[#555555]">{error}</p><div className="mt-4 flex gap-5 text-sm"><button type="button" className="underline" onClick={()=>window.location.reload()}>Try again</button><Link className="underline" to="/login">Go to login</Link></div></main>:<BuyerProfileSkeleton/>
  if (section && !['wallet', 'orders', 'favorites', 'stores', 'visits', 'setup', 'addresses', 'notifications','tracking'].includes(section)) return <Navigate to="/profile" replace />
  const activeRequest = activeDeposit && (profile.requests.find((request) => request.id === activeDeposit.id) || activeDeposit)
  const modalRequest = profile.requests.find((request) => request.id === modalRequestId && request.status === 'pending' && request.walletAddress)

  return (
    <div className="min-h-screen bg-[#f7f7f7] pb-24 text-[#111111]">
      {modalRequest && <WalletModal key={`${modalRequest.id}-${modalRequest.walletAddress}-${modalRequest.network}-${modalRequest.paymentCoin}`} request={modalRequest} onClose={() => { modalRequestRef.current = null; setModalRequestId(null) }} />}
      <header className="border-b border-[#e5e5e5] bg-white"><div className="mx-auto flex max-w-[1300px] items-center justify-between gap-4 px-5 py-5"><Link to="/" className="text-2xl font-black tracking-[-0.07em]"><SiteName logo /></Link><nav className="flex items-center gap-5 text-sm"><Link to="/products" className="transition-colors hover:text-[#555555]">Shop</Link><button type="button" onClick={logOut} className="rounded-full border border-[#e5e5e5] px-4 py-2 transition-colors hover:border-[#111111]">Log out</button></nav></div></header>
      <main className="mx-auto max-w-[1300px] px-5 py-8 sm:py-12">
        <div className="mb-8"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#555555]">Your account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Profile</h1><p className="mt-2 text-sm text-[#555555]">A little space for everything that matters to you.</p></div>
        {error && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-4 border border-green-200 bg-green-50 p-3 text-sm">{notice}</p>}
        {updatesError && <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{updatesError}</p>}
        <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
          <aside className="h-fit rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_8px_30px_rgba(27,50,33,0.04)]">
            <div className="flex items-center gap-3 lg:block"><div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#e5e5e5] text-[#111111]"><UserRound size={27} /></div>
            <div><h2 className="break-words font-semibold lg:mt-4">{profile.user.fullName}</h2><p className="mt-1 break-all text-xs text-[#555555]">{profile.user.email}</p><p className="mt-2 font-mono text-xs text-[#555555]">Member ID: #{profile.user.publicId}</p></div></div>
            <nav aria-label="Profile navigation" className="mt-5 grid grid-cols-2 gap-1 border-t border-[#f7f7f7] pt-4 sm:grid-cols-3 lg:grid-cols-1">{profileLinks.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${isActive ? 'bg-[#f7f7f7] font-semibold text-[#111111]' : 'text-[#555555] hover:bg-[#f7f7f7] hover:text-[#111111]'}`}><Icon size={18} className="shrink-0" aria-hidden="true" /><span>{label}</span>{to==='/profile/stores'&&<span className="ml-auto rounded-full bg-[#e5e5e5] px-2 py-0.5 text-[10px] font-semibold text-[#555555]">{profile.follows.length}</span>}</NavLink>)}</nav>
          </aside>
          <div className="min-w-0 space-y-6">
            {!section && <><section className="overflow-hidden rounded-2xl bg-[#111111] p-7 text-white sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#cccccc]">Welcome back</p><h2 className="mt-3 break-words text-2xl font-semibold sm:text-3xl">{profile.user.fullName}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-[#e5e5e5]">Manage your account, follow your favorite stores, and keep track of your orders all in one place.</p><div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-5"><BalanceDisplay balanceCents={profile.wallet.balanceCents} /><Link to="/profile/wallet" className="inline-flex items-center gap-2 rounded-full bg-[#e5e5e5] px-4 py-2 text-sm font-semibold text-[#111111]">View wallet <ArrowUpRight size={16} /></Link></div></section></>}
            {!section&&<><div className="grid gap-4 sm:grid-cols-2"><Link to="/profile/stores" aria-label={`${profile.follows.length} followed stores`} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e5e5e5] bg-[#f7f7f7] p-5 text-[#111111]"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#555555]">Your favorite places</p><strong className="mt-2 block text-3xl font-semibold">{profile.follows.length}</strong><p className="mt-1 text-xs">Followed stores</p></div><Store size={31} strokeWidth={1.3}/></Link><Link to="/profile/favorites" aria-label={`${profile.favorites.length} favorite products`} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e5e5e5] bg-[#f7f7f7] p-5 text-[#555555]"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#777777]">Saved for another day</p><strong className="mt-2 block text-3xl font-semibold">{profile.favorites.length}</strong><p className="mt-1 text-xs">Favorite products</p></div><Heart size={31} strokeWidth={1.3}/></Link></div><FollowedStores stores={profile.follows} compact/><div className="grid gap-4 sm:grid-cols-2">{[['/profile/orders','My Orders',Package],['/messages','System messages',MessageCircle]].map(([to,label,Icon])=><Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-5 text-sm font-semibold text-[#555555]"><Icon size={19}/>{label}<ArrowUpRight className="ml-auto" size={15}/></Link>)}</div></>}
            {section === 'wallet' && <><section id="wallet" className="grid gap-4 sm:grid-cols-3">
              <div className="rounded bg-[#111111] p-6 text-white"><BalanceDisplay balanceCents={profile.wallet.balanceCents} size="text-3xl" /></div>
              <button type="button" disabled={busy} onClick={() => { activeRequestRef.current = null; setTransactionPin(''); setActiveDeposit(null); setCoin(''); setKind('deposit') }} className="flex items-center justify-center gap-3 border border-[#e5e5e5] bg-white p-6 text-sm font-semibold hover:border-[#111111] disabled:opacity-60"><ArrowDownLeft size={22} /> Deposit request</button>
              <button type="button" disabled={busy} onClick={() => { activeRequestRef.current = null; setTransactionPin(''); setActiveDeposit(null); setCoin('BTC'); setKind('withdrawal') }} className="flex items-center justify-center gap-3 border border-[#e5e5e5] bg-white p-6 text-sm font-semibold hover:border-[#111111] disabled:opacity-60"><ArrowUpRight size={22} /> Withdrawal request</button>
            </section>
            <p className="text-xs leading-5 text-[#555555]">Select a coin to send a deposit request. The administrator will send the wallet and network here. Enter the amount, then upload a screenshot for manual review. No crypto is processed or verified here; confirmation does not automatically change your balance.</p>
            {kind && <section className="space-y-4 border border-[#e5e5e5] bg-white p-5">
              <div className="flex justify-between"><h2 className="font-semibold">{kind === 'deposit' ? 'Deposit' : 'Withdrawal'} request</h2><button type="button" disabled={busy} onClick={() => { activeRequestRef.current = null; setKind(''); setTransactionPin('') }} className="text-sm underline disabled:opacity-60">Close</button></div>
              {activeRequest ? <>
                <div><p className="text-sm font-medium">Selected coin</p><div className="mt-2 rounded border border-[#e5e5e5] px-3 py-3 text-sm"><span style={{ backgroundColor: coinDetails[activeRequest.coin][2] }} className="mr-2 inline-grid size-6 place-items-center rounded-full font-bold text-white" aria-hidden="true">{coinDetails[activeRequest.coin][1]}</span>{coinDetails[activeRequest.coin][0]} ({activeRequest.coin})</div></div>
                <div aria-live="polite" className="rounded border border-[#e5e5e5] bg-[#f7f7f7] p-4 text-sm">
                  <p className="font-semibold">Wallet address · Request #{activeRequest.id}</p>
                  {activeRequest.status && activeRequest.status !== 'pending' ? <p className="mt-2 text-[#555555]">This request is {activeRequest.status}. No further payment should be sent for it.</p> : activeRequest.walletAddress ? <>
                    <p className="mt-2 text-xs text-[#111111]">Accepted coin: {activeRequest.paymentCoin} · Network: {activeRequest.network}</p>
                    <div className="mt-2 flex items-center gap-3"><span className="min-w-0 flex-1 break-all font-mono">{activeRequest.walletAddress}</span><button type="button" onClick={() => copyAddress(activeRequest.walletAddress)} aria-label="Copy wallet address" title="Copy wallet address" className="grid size-10 shrink-0 place-items-center rounded border border-[#cccccc] hover:border-[#111111]"><IoCopyOutline size={20} /></button></div>
                    {activeRequest.instructions && <p className="mt-3 whitespace-pre-wrap text-xs text-[#111111]">{activeRequest.instructions}</p>}
                    <p className="mt-3 text-xs text-[#555555]">Check the accepted coin and network before paying. This site does not process or verify transfers.</p>
                  </> : <div className="mt-3 flex items-center gap-3 text-[#111111]"><span aria-hidden="true" className="size-4 rounded-full border-2 border-[#cccccc] border-t-[#111111] motion-safe:animate-spin" /><span>Waiting for the administrator to send the wallet address. Updates appear automatically.</span></div>}
                </div>
                {activeRequest.amountCents != null && <p className="text-xs text-[#555555]">Requested amount: {money(activeRequest.amountCents)}. To select a different coin or amount, start a new request.</p>}
                <button type="button" disabled={busy} onClick={() => { activeRequestRef.current = null; setActiveDeposit(null); setCoin(''); setCoinOpen(false) }} className="text-sm underline disabled:opacity-60">Start a new request</button>
                {activeRequest.status === 'pending' && activeRequest.walletAddress && activeRequest.amountCents === null && <form onSubmit={(event) => saveDepositAmount(event, activeRequest.id)} className="grid gap-2"><label className="text-sm font-medium">Deposit amount (USD equivalent)<AmountInput name="amount" className={input} placeholder="10,000.00" /></label><button disabled={busy} className="w-fit bg-[#111111] px-4 py-2 text-sm text-white disabled:opacity-60">Save amount</button></form>}
                {activeRequest.status === 'pending' && activeRequest.walletAddress && activeRequest.amountCents !== null && <form onSubmit={(event) => uploadReceipt(event, activeRequest.id)} className="grid gap-2"><label className="text-xs font-medium">Upload payment screenshot (PNG or JPEG, max 2 MB)<input name="receipt" type="file" accept="image/png,image/jpeg" required className="mt-1 block w-full text-sm" /></label><button disabled={busy} className="w-fit border border-[#111111] px-3 py-2 text-xs disabled:opacity-60">Send screenshot</button></form>}
              </> : <form onSubmit={submitRequest} className="space-y-4">
              {!profile.hasTransactionPin && <p className="text-sm">First <Link to="/profile/setup" className="underline">set a four-digit transaction PIN in Setup</Link>.</p>}
              <label className="block text-sm font-medium">Four-digit transaction PIN<PasswordInput autoComplete="off" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} value={transactionPin} onChange={(event) => setTransactionPin(event.target.value)} required className={input} /></label>
              <fieldset disabled={busy}><legend className="text-sm font-medium">Choose a coin</legend><details open={coinOpen} onToggle={(event) => setCoinOpen(event.currentTarget.open)} className="relative mt-2"><summary className="cursor-pointer rounded border border-[#e5e5e5] px-3 py-3 text-sm">{coin ? <><span style={{ backgroundColor: coinDetails[coin][2] }} className="mr-2 inline-grid size-6 place-items-center rounded-full font-bold text-white" aria-hidden="true">{coinDetails[coin][1]}</span>{coinDetails[coin][0]} ({coin})</> : 'Select a coin'}</summary><div className="mt-1 grid max-h-56 gap-1 overflow-y-auto border border-[#e5e5e5] bg-white p-2">{profile.coins.map((item) => <label key={item} className="flex cursor-pointer items-center gap-3 p-2 text-sm hover:bg-[#f7f7f7]"><input type="radio" name="coin" checked={coin === item} onChange={() => { if (kind === 'deposit') selectDepositCoin(item); else { setCoin(item); setCoinOpen(false) } }} /><span style={{ backgroundColor: coinDetails[item][2] }} className="grid size-7 place-items-center rounded-full font-bold text-white" aria-hidden="true">{coinDetails[item][1]}</span>{coinDetails[item][0]} ({item})</label>)}</div></details></fieldset>
              {kind === 'deposit' ? <div className="rounded border border-[#e5e5e5] bg-[#f7f7f7] p-4 text-sm"><p className="font-semibold">Wallet address</p><p className="mt-2 text-[#555555]">{busy ? 'Sending your request…' : 'Selecting a coin sends a request to the administrator.'}</p></div> : <><label className="block text-sm font-medium">Amount (USD equivalent)<AmountInput name="amount" className={input} placeholder="10,000.00" /></label><label className="block text-sm font-medium">Destination and network<input name="destination" maxLength={500} required placeholder="Wallet address and network" className={input} /></label><button disabled={busy} className="bg-[#111111] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Submit request</button></>}
              </form>}
            </section>}
            <p className="text-xs text-[#555555]">Available: {money(profile.wallet.availableCents??profile.wallet.balanceCents)} · Pending withdrawal holds: {money(profile.wallet.heldCents||0)}</p><section className="border border-[#e5e5e5] bg-white p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Request history</h2><button type="button" disabled={busy} onClick={refreshProfile} className="text-xs underline disabled:opacity-60">Refresh updates</button></div>
              {profile.requests.length ? <div className="mt-4 divide-y divide-[#f7f7f7]">{profile.requests.map((request) => <div key={request.id} className="py-3 text-sm">
                <p className="font-medium">#{request.id} · {request.kind} · {request.coin} · {request.amountCents === null ? 'Amount not provided' : money(request.amountCents)} <span className="ml-2 text-xs uppercase text-[#555555]">{request.status}</span></p>
                {request.instructions && <p className="mt-2 whitespace-pre-wrap text-[#111111]">Admin instructions: {request.instructions}</p>}
                {request.destination && <p className="mt-1 break-all text-xs text-[#555555]">Destination: {request.destination}</p>}
                {request.kind === 'deposit' && request.status === 'pending' && <button type="button" disabled={busy} onClick={() => { activeRequestRef.current = request.id; if (request.walletAddress) seenWallets.current.add(walletDetailsKey(request)); setActiveDeposit(request); setKind('deposit'); document.getElementById('wallet')?.scrollIntoView({ behavior: 'smooth' }) }} className="mt-2 text-xs underline disabled:opacity-60">View wallet and receipt</button>}
                {request.walletAddress && request.status === 'pending' && <div className="mt-3 rounded bg-[#f7f7f7] p-3"><p className="font-medium">Accepted: {request.paymentCoin} · Network: {request.network}</p><p className="mt-2 break-all">Wallet: {request.walletAddress}</p><button type="button" onClick={() => copyAddress(request.walletAddress)} className="mt-2 underline">Copy wallet address</button><p className="mt-2 text-xs">Check the coin and network carefully. Transfers are not processed or verified by this site.</p></div>}
                {request.receipts.length > 0 && <p className="mt-2 text-xs text-[#555555]">{request.receipts.length} screenshot(s) submitted. Payment still requires independent verification.</p>}
                {request.kind === 'deposit' && request.status === 'pending' && request.walletAddress && request.amountCents !== null && <form onSubmit={(event) => uploadReceipt(event, request.id)} className="mt-3 grid gap-2"><label className="text-xs font-medium">Upload payment screenshot (PNG or JPEG, max 2 MB)<input name="receipt" type="file" accept="image/png,image/jpeg" required className="mt-1 block w-full text-sm" /></label><button disabled={busy} className="w-fit border border-[#111111] px-3 py-2 text-xs disabled:opacity-60">Send screenshot</button></form>}
              </div>)}</div> : <p className="mt-3 text-sm text-[#555555]">No requests yet.</p>}
            </section>
            </>}
            {(!section||section==='tracking')&&<BuyerTracking/>}
            {['orders', 'favorites', 'setup'].includes(section) && <BuyerExtras profile={profile} onRefresh={load} section={section} />}
            {section === 'stores' && <FollowedStores stores={profile.follows}/>}
            {section === 'visits' && <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-6">
              <h2 className="text-xl font-semibold">Visited store history</h2>
              <p className="mt-2 text-sm text-[#555555]">Stores you visited while signed in, ordered by your most recent visit.</p>
              {profile.visits.length ? <ul className="mt-4 divide-y divide-[#f7f7f7]">{profile.visits.map((store) => <li key={store.sellerId} className="flex items-center gap-4 py-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f7f7f7] text-[#111111]"><Store size={20} /></span><div className="min-w-0"><Link className="break-words text-sm font-medium underline" to={`/stores/${store.sellerId}`}>{store.storeName}</Link><p className="mt-1 text-xs text-[#555555]">{store.visitCount} {store.visitCount === 1 ? 'visit' : 'visits'} · Last visit {store.lastVisitedAt} UTC</p></div></li>)}</ul> : <p className="mt-4 text-sm text-[#555555]">No store visits recorded yet. <Link to="/products" className="underline">Browse products</Link></p>}
            </section>}
            {section === 'addresses' && <div>
              <section id="addresses" className="border border-[#e5e5e5] bg-white p-5"><div className="flex justify-between gap-3"><h2 className="font-semibold">Billing addresses</h2><button type="button" onClick={() => setShowAddress(!showAddress)} className="text-sm underline">{showAddress ? 'Cancel' : '+ Add address'}</button></div>{profile.addresses.length ? <ul className="mt-3 divide-y divide-[#f7f7f7]">{profile.addresses.map((address) => <li key={address.id} className="py-3 text-sm"><p className="font-medium">{address.fullName} · {address.phone}</p><p className="mt-1 text-xs text-[#555555]">{address.address}, {address.city}, {address.region} {address.postalCode}, {address.country}</p>{address.isDefault ? <span className="mt-2 inline-block text-xs font-semibold text-[#111111]">Default</span> : <button type="button" onClick={() => setDefault(address.id)} className="mt-2 text-xs underline">Set as default</button>}</li>)}</ul> : <p className="mt-3 text-sm text-[#555555]">No saved addresses.</p>}
                {showAddress && <form onSubmit={saveAddress} className="mt-4 grid gap-3">{[['fullName', 'Full name'], ['phone', 'Phone'], ['address', '详细地址 / Street address'], ['city', '城市 / City'], ['region', '省 / 自治区 / 直辖市'], ['postalCode', '邮政编码 / Postal code'], ['country', '国家 / Country']].map(([name, label]) => <label key={name} className="text-xs font-medium">{label}<input name={name} required maxLength={200} className={input} /></label>)}<label className="text-xs"><input type="checkbox" name="isDefault" /> Set as default</label><button disabled={busy} className="bg-[#111111] px-4 py-3 text-sm text-white disabled:opacity-60">Save address</button></form>}
              </section>
            </div>}
            {section === 'notifications' && <section id="notifications" className="border border-[#e5e5e5] bg-white p-5"><h2 className="font-semibold">Notifications</h2>{notifications.length ? <ul className="mt-3 divide-y divide-[#f7f7f7]">{notifications.map((item) => <li key={item.id} className="py-3 text-sm"><p className="font-medium">{item.title}</p><p className="mt-1 whitespace-pre-wrap text-xs text-[#555555]">{item.body}</p>{item.link && <Link to={item.link} className="mt-2 inline-block text-xs underline">View details</Link>}</li>)}</ul> : <p className="mt-3 text-sm text-[#555555]">No notifications yet.</p>}</section>}
          </div>
        </div>
      </main>
    </div>
  )
}

export default BuyerProfilePage
