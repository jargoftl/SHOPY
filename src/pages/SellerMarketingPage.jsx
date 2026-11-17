import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import {sessionUrl} from '../lib/tabSession.js'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronDown, Clock3, Copy, Crown, Globe2, History, Megaphone, Plane, Rocket, ShieldCheck, Sparkles, Star, Trophy, Wallet, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import SiteName from '../components/SiteName.jsx'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'
import '../styles/marketing.css'

const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100)
const date = (value) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry'
const statusLabel = { requested: 'Admin review', awaiting_payment: 'Payment details ready', proof_submitted: 'Payment under review', approved: 'Approved', rejected: 'Declined', cancelled: 'Cancelled' }
const icons = { international: Globe2, overseas: Plane, standard: Rocket }
const links = [['upgrade','Store Upgrade',Megaphone],['history','Purchase History',History],['levels','Seller Level',Crown]]

export default function SellerMarketingPage({ view = 'upgrade' }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [products, setProducts] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState(null)
  const [coin, setCoin] = useState('USDT')
  const [copied, setCopied] = useState(null)
  const modal = useRef(null)
  const requestKeys = useRef({})
  const mounted = useRef(false)
  const refresh = async () => {
    const result = await apiRequest('/api/seller/marketing', { background: true })
    if (mounted.current) setData(result)
    return result
  }
  useEffect(() => {
    mounted.current = true
    Promise.all([apiRequest('/api/seller/marketing'), apiRequest('/api/seller/products')]).then(([result, inventory]) => {
      if (!mounted.current) return
      setData(result); setProducts(inventory.products); setSelectedIds(result.promoted.map((row) => row.productId))
    }).catch((failure) => { if (failure.status === 401) navigate('/seller/login'); else if (mounted.current) setError(failure.message) })
    const timer = setInterval(() => { refresh().catch(() => {}) }, 15000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [navigate])
  useEffect(() => {
    if (!selection) return
    const close = (event) => {
      if (event.key === 'Escape' && !busy) setSelection(null)
      if (event.key === 'Tab') {
        const elements = [...(modal.current?.querySelectorAll('button:not(:disabled),select,input,a[href]') || [])]
        if (!elements.length) return
        if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1).focus() }
        else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0].focus() }
      }
    }
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close)
  }, [selection, busy])
  const run = async (operation, success) => {
    setBusy(true); setError(''); setMessage('')
    try { await operation(); await refresh(); if (success) setMessage(success) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  const choose = (plan) => { setSelection(plan); setError(''); requestKeys.current[plan.id] ||= crypto.randomUUID() }
  const submit = (event) => {
    event.preventDefault()
    run(async () => {
      await apiRequest('/api/seller/marketing/requests', { method: 'POST', body: JSON.stringify({ planId: selection.id, coin, requestKey: requestKeys.current[selection.id] }) })
      delete requestKeys.current[selection.id]; setSelection(null); navigate('/seller/marketing/history')
    }, 'Request sent. Your administrator will review it and provide payment details when a payment is required.')
  }
  const receipt = (event, request) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a PNG or JPEG receipt up to 2 MB.'); return }
    run(() => apiRequest(`/api/seller/marketing/requests/${request.id}/receipt`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }), 'Receipt submitted. Your upgrade activates after administrator confirmation.')
  }
  const copy = async (value, id) => { try { await navigator.clipboard.writeText(value); setCopied(id) } catch { setError('Copy is unavailable. Select and copy the wallet address manually.') } }
  const currentPackage = data?.current.package
  const currentLevel = data?.current.level
  const activeRank = currentLevel?.plan.rank || 0
  const planPending = (id) => data?.requests.some(request => request.plan.id === id && ['requested','awaiting_payment','proof_submitted'].includes(request.status))
  return <div className="marketing-page" data-preserve-theme>
    <header className="marketing-header"><div className="marketing-container"><Link to="/seller" className="marketing-brand"><span><Sparkles size={21} /></span><SiteName logo /><i>seller studio</i></Link><div className="flex items-center gap-4"><SellerNotificationBell /><Link to="/seller" className="marketing-back"><ArrowLeft size={15} /> Dashboard</Link></div></div></header>
    <main className="marketing-container marketing-main">
      <div className="marketing-breadcrumb"><Link to="/seller">Seller workspace</Link><span>/</span><span>Marketing tools</span></div>
      <div className="marketing-heading"><div><p className="marketing-eyebrow"><Megaphone size={13} /> MADE FOR YOUR NEXT CHAPTER</p><h1>{view === 'levels' ? 'A little ambition. A new level.' : view === 'history' ? 'Your growth, in motion.' : 'Give your store the spotlight.'}</h1><p>{view === 'levels' ? 'Explore the seller program and request your next level.' : view === 'history' ? 'Every request, payment detail, and approved upgrade in one place.' : 'Choose a 30-day promotion package and showcase your best products.'}</p></div><div className="marketing-heading-badge"><Crown size={23} /><div><small>YOUR SELLER LEVEL</small><strong>{currentLevel?.plan.details.level || 'Starter'}</strong></div></div></div>
      <nav className="marketing-tabs" aria-label="Marketing tools">{links.map(([path,label,Icon]) => <NavLink key={path} to={`/seller/marketing/${path}`} className={({isActive})=>isActive?'is-active':''}><Icon size={16}/>{label}</NavLink>)}</nav>
      {message && <p className="marketing-notice" role="status"><CheckCircle2 size={18}/>{message}</p>}{error && <p className="marketing-error" role="alert">{error}</p>}
      {!data ? <ContentPlaceholder/> : <>
        {view === 'upgrade' && <>
          {currentPackage && <div className="marketing-current"><span className="marketing-current-icon"><CheckCircle2 size={24}/></span><div><small>YOUR ACTIVE PACKAGE</small><h2>{currentPackage.plan.name}</h2><p>Active until {date(currentPackage.expiresAt)} · {currentPackage.plan.productLimit} promotion slots</p></div><Link to="/seller/marketing/history">View history <ArrowUpRight size={16}/></Link></div>}
          <div className="marketing-plan-grid">{data.plans.filter(plan=>plan.kind==='package').map(plan=>{const Icon=icons[plan.id]||Globe2;const isPopular=plan.id==='overseas';return <article className={`marketing-plan ${isPopular?'is-popular':''}`} key={plan.id}>{isPopular&&<span className="marketing-popular-label"><Star size={12}/> THE SWEET SPOT</span>}<span className={`marketing-plan-icon ${plan.id}`}><Icon size={31} strokeWidth={1.5}/></span><p className="marketing-plan-kicker">30 DAYS IN THE SPOTLIGHT</p><h2>{plan.name}</h2><p className="marketing-plan-tagline">{plan.details.tagline}</p><p className="marketing-price">{usd(plan.feeCents)}<span>/ 30 days</span></p><div className="marketing-plan-divider"/><ul><li><Check size={16}/> Up to {plan.productLimit} promoted products</li><li><Check size={16}/> Featured product showcase</li><li><Check size={16}/> 30 days from activation</li><li><ShieldCheck size={16}/> Payment reviewed by your admin</li></ul><button disabled={busy||planPending(plan.id)||(currentPackage&&currentPackage.plan.rank>plan.rank)} onClick={()=>choose(plan)} className="marketing-primary">{planPending(plan.id)?'Request pending':currentPackage?.plan.id===plan.id?'Renew package':'Purchase package'}<ArrowUpRight size={16}/></button><small className="marketing-plan-footnote">One-time payment. No automatic renewal.</small></article>})}</div>
          <div className="marketing-how"><div><span>01</span><h3>Choose your spotlight</h3><p>Select a package and your preferred coin.</p></div><div><span>02</span><h3>Get payment details</h3><p>Your admin sends the amount, wallet, and network.</p></div><div><span>03</span><h3>Make it official</h3><p>Submit your receipt. Admin confirmation activates your package.</p></div></div>
          {currentPackage && <section className="marketing-promotion-picker"><p className="marketing-eyebrow">YOUR PRODUCT SHOWCASE</p><h2>Choose what gets the spotlight.</h2><p>Select up to {currentPackage.plan.productLimit} published products. They appear in the storefront’s promoted collection while your package is active.</p><div className="marketing-picker-grid">{products.filter(p=>p.isPublished&&p.isStorePublished).map(product=><label key={product.id} className={selectedIds.includes(product.id)?'is-selected':''}><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={(e)=>setSelectedIds(ids=>e.target.checked?[...ids,product.id]:ids.filter(id=>id!==product.id))}/><img src={product.imageUrl} alt=""/><span>{product.name}</span></label>)}</div>{!products.length&&<p>Add products to your store to start your showcase.</p>}<button disabled={busy||selectedIds.length>currentPackage.plan.productLimit} className="marketing-primary" onClick={()=>run(()=>apiRequest('/api/seller/marketing/promotions',{method:'PUT',body:JSON.stringify({productIds:selectedIds})}),'Your product showcase was saved.')}>Save showcase · {selectedIds.length}/{currentPackage.plan.productLimit}</button></section>}
        </>}
        {view === 'levels' && <>
          <section className="marketing-level-status"><span className="marketing-level-emblem"><Crown size={43}/></span><div><p className="marketing-eyebrow">YOUR CURRENT LEVEL</p><h2>{currentLevel?.plan.name||'Your journey starts here.'}</h2><p>{currentLevel ? `Approved ${date(currentLevel.startsAt)} · No expiry` : 'Choose a level below and send a request to your administrator.'}</p></div><div className="marketing-level-progress"><div>{['C','B','A','S','SS','SSS'].map((name,i)=><span key={name} className={i<activeRank?'is-reached':''}>{name}</span>)}</div><div className="marketing-progress-track"><span style={{width:`${activeRank/6*100}%`}}/></div></div></section>
          <details className="marketing-program"><summary><Sparkles size={18}/> Seller program details <ChevronDown size={17}/></summary><div><p>The cards retain the operating-fund, branch, traffic, margin, and bonus reference values from the program you provided. Level selling prices are $0.00. Requests are reviewed manually by your administrator.</p><p>Operating funds are listed separately from the upgrade fee. Reference traffic, profit ratios and bonuses are not guaranteed results or automatic account credits. Any bonus or service must be administered separately.</p><p>Approved seller levels have no expiry. Promotion packages run separately for 30 days.</p></div></details>
          <div className="marketing-level-grid">{data.plans.filter(plan=>plan.kind==='level').sort((a,b)=>a.rank-b.rank).map(plan=><article key={plan.id} className={`marketing-level-card tier-${plan.details.level}`}><div className="marketing-level-card-top"><div><span className="marketing-tier-name">LEVEL {plan.details.level}</span><h2>{plan.name}</h2></div><span className="marketing-tier-medal"><Crown size={27}/></span></div><div className="marketing-level-requirements"><p>Operating funds <strong>{usd(plan.details.operatingFunds*100)}</strong></p><p>Number of branches <strong>{plan.details.branches}</strong></p></div><dl>{[['Sales profit ratio',plan.details.salesProfitRatio],['Daily traffic reference',plan.details.dailyTraffic],['Global delivery time',`${plan.details.deliveryDays} days`],['Purchase discount',plan.details.purchaseDiscount],['Upgrade bonus reference',usd(plan.details.upgradeBonus*100)],['Number of salable goods',plan.productLimit.toLocaleString()],['Exclusive service',plan.details.exclusiveService],['Home page recommendation',plan.details.homepageRecommendation]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{typeof value==='boolean'?value?<CheckCircle2 size={15} className="marketing-yes"/>:<X size={15} className="marketing-no"/>:value}</dd></div>)}</dl><div className="marketing-level-fee"><span>Level selling price</span><strong>{usd(plan.feeCents)}</strong></div><button disabled={busy||activeRank>=plan.rank||planPending(plan.id)} onClick={()=>choose(plan)} className="marketing-primary">{activeRank===plan.rank?'Current level':activeRank>plan.rank?'Included in your level':planPending(plan.id)?'Request pending':'Request this level'}<ArrowUpRight size={15}/></button></article>)}</div>
        </>}
        {view === 'history' && <>
          {data.requests.some(r=>r.status==='approved')&&<div className="marketing-congratulations"><span><Trophy size={32}/></span><div><p className="marketing-eyebrow">A NEW CHAPTER</p><h2>Congratulations on your upgrade!</h2><p>Your administrator has approved an upgrade. Active packages and your current level appear above.</p></div><Sparkles className="marketing-congrats-spark" size={52}/></div>}
          <div className="marketing-history-summary"><div><span>Active package</span><strong>{currentPackage?.plan.name||'No active package'}</strong><small>{currentPackage?`Until ${date(currentPackage.expiresAt)}`:'Find your next spotlight'}</small></div><div><span>Seller level</span><strong>{currentLevel?.plan.name||'Starter'}</strong><small>{currentLevel?'Approved · no expiry':'Choose a seller level'}</small></div><div><span>In review</span><strong>{data.requests.filter(r=>['requested','awaiting_payment','proof_submitted'].includes(r.status)).length}</strong><small>Requests awaiting a next step</small></div></div>
          <div className="marketing-request-list">{data.requests.map(request=><article key={request.id} className="marketing-request"><div className="marketing-request-heading"><span className="marketing-request-icon">{request.plan.kind==='level'?<Crown size={22}/>:<Megaphone size={22}/>}</span><div><small>REQUEST #{request.id} · {date(request.createdAt)}</small><h2>{request.plan.name}</h2></div><span className={`marketing-status status-${request.status}`}>{statusLabel[request.status]}</span></div><div className="marketing-request-meta"><span>Upgrade fee <strong>{request.amountCents===null?'Awaiting quote':usd(request.amountCents)}</strong></span><span>Payment <strong>{request.amountCents===0?'No payment required':request.coin}</strong></span><span>Duration <strong>{request.plan.durationDays?`${request.plan.durationDays} days`:'No expiry'}</strong></span></div>
            {request.status==='requested'&&<div className="marketing-request-next"><Clock3 size={17}/><p>{request.amountCents===0?'Your free level request is awaiting administrator approval.':'Your request is with the admin. Payment instructions will appear here after review.'}</p><button disabled={busy} onClick={()=>run(()=>apiRequest(`/api/seller/marketing/requests/${request.id}/cancel`,{method:'PATCH'}),'Request cancelled.')}>Cancel request</button></div>}
            {request.walletAddress&&<div className="marketing-wallet"><div><Wallet size={20}/><h3>Payment instructions</h3></div><dl><div><dt>Amount to send</dt><dd>{request.coinAmount} {request.coin}</dd></div><div><dt>Network</dt><dd>{request.network}</dd></div><div><dt>Wallet address</dt><dd className="marketing-wallet-address"><code>{request.walletAddress}</code><button onClick={()=>copy(request.walletAddress,request.id)} aria-label="Copy upgrade wallet address">{copied===request.id?<Check size={16}/>:<Copy size={16}/>}</button></dd></div></dl><p>Use the exact coin and network shown. Your upgrade activates after the administrator verifies the transfer.</p>{request.status==='awaiting_payment'&&<label className="marketing-receipt-upload">{busy?'Uploading…':'Upload payment receipt'}<input disabled={busy} type="file" accept="image/png,image/jpeg" aria-label={`Upload receipt for request ${request.id}`} onChange={event=>receipt(event,request)}/><small>PNG or JPEG · up to 2 MB</small></label>}</div>}
            {request.instructions&&<p className="marketing-request-instructions">{request.instructions}</p>}{request.status==='proof_submitted'&&<p className="marketing-request-next"><ShieldCheck size={18}/> Receipt received. Your administrator is reviewing the payment.</p>}{request.status==='approved'&&<p className="marketing-approved"><CheckCircle2 size={18}/> Approved {date(request.approvedAt)}{request.transferReference?` · Reference: ${request.transferReference}`:''}</p>}{request.receipts.length>0&&<div className="marketing-receipt-links">{request.receipts.map((file,index)=><a key={file.id} href={sessionUrl(`/api/marketing/receipts/${file.id}`)} target="_blank" rel="noreferrer">View receipt {index+1}<ArrowUpRight size={12}/></a>)}</div>}
          </article>)}</div>{!data.requests.length&&<div className="marketing-empty"><History size={36}/><h2>Your next chapter is waiting.</h2><p>Your upgrade requests and payment instructions will appear here.</p><Link className="marketing-primary" to="/seller/marketing/upgrade">Explore packages<ArrowUpRight size={15}/></Link></div>}
        </>}
      </>}
      <footer className="marketing-footer"><ShieldCheck size={16}/><span>All upgrades are reviewed by your administrator.</span><Link to="/messages">Need a hand? Contact support <ArrowUpRight size={13}/></Link></footer>
    </main>
    {selection&&<div className="marketing-modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)setSelection(null)}}><section ref={modal} className="marketing-modal" role="dialog" aria-modal="true" aria-label="Confirm upgrade request"><button autoFocus className="marketing-modal-close" disabled={busy} onClick={()=>setSelection(null)} aria-label="Close upgrade request"><X size={20}/></button><span className="marketing-modal-icon"><Crown size={30}/></span><p className="marketing-eyebrow">YOUR NEXT CHAPTER</p><h2>{selection.name}</h2><p className="marketing-modal-price">{usd(selection.feeCents)}<small>{selection.durationDays?' / 30 days':' · no expiry'}</small></p><p>{selection.feeCents===0?'Send a free level request for your administrator to review. No payment is required at the displayed price.':'Send your request first. Your administrator will provide the coin amount, wallet, and payment network in Purchase History.'}</p><form onSubmit={submit}>{selection.feeCents!==0&&<label>Preferred payment coin<select value={coin} onChange={event=>setCoin(event.target.value)}>{(data?.coins||['USDT','BTC','ETH']).map(value=><option key={value}>{value}</option>)}</select></label>}{error&&<p role="alert" className="marketing-error">{error}</p>}<button disabled={busy} className="marketing-primary">{busy?'Sending request…':'Send request to admin'}<ArrowUpRight size={16}/></button></form><small className="marketing-modal-note">Activation happens after administrator approval.</small></section></div>}
  </div>
}
